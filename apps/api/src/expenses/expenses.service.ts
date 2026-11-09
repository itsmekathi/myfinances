import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  itemAmountMinor,
  type ClientInfoDto,
  type CreateExpenseData,
  type ExpenseDetailDto,
  type ExpenseDto,
  type ListExpensesQuery,
  type Paginated,
  type UpdateExpenseData,
} from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { Prisma } from '../generated/prisma/client';
import { parseIsoDate } from '../common/dates';
import type { WorkspaceContext } from '../common/request-context';
import {
  expenseDetailInclude,
  expenseListInclude,
  toExpenseDetailDto,
  toExpenseDto,
} from './expense.mapper';

type ItemsInput = NonNullable<CreateExpenseData['items']>;

function buildItems(items: ItemsInput) {
  const rows = items.map((item, position) => ({
    position,
    name: item.name,
    quantity: item.quantity,
    unitPriceMinor: BigInt(item.unitPriceMinor),
    amountMinor: BigInt(itemAmountMinor(item)),
  }));
  const total = rows.reduce((sum, r) => sum + r.amountMinor, 0n);
  return { rows, total };
}

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v || null);

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(ws: WorkspaceContext, q: ListExpensesQuery): Promise<Paginated<ExpenseDto>> {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('"from" must be before "to"');

    const where: Prisma.ExpenseWhereInput = {
      workspaceId: ws.workspaceId,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.subcategoryId ? { subcategoryId: q.subcategoryId } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.from || q.to
        ? {
            date: {
              ...(q.from ? { gte: parseIsoDate(q.from) } : {}),
              ...(q.to ? { lte: parseIsoDate(q.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: expenseListInclude,
        orderBy: [{ date: 'desc' }, { time: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items: rows.map(toExpenseDto), page: q.page, pageSize: q.pageSize, total };
  }

  async get(ws: WorkspaceContext, id: string): Promise<ExpenseDetailDto> {
    const row = await this.prisma.expense.findFirst({
      where: { id, workspaceId: ws.workspaceId },
      include: expenseDetailInclude,
    });
    if (!row) throw new NotFoundException('Expense not found');
    return toExpenseDetailDto(row);
  }

  async create(
    ws: WorkspaceContext,
    userId: string,
    input: CreateExpenseData,
    client: ClientInfoDto,
  ): Promise<ExpenseDetailDto> {
    await this.assertCategories(ws, input.categoryId ?? null, input.subcategoryId ?? null);
    const items = input.items?.length ? buildItems(input.items) : null;

    const created = await this.prisma.expense.create({
      data: {
        workspaceId: ws.workspaceId,
        createdById: userId,
        createdClient: { ...client },
        amountMinor: items ? items.total : BigInt(input.amountMinor!),
        currency: input.currency ?? ws.baseCurrency,
        categoryId: input.categoryId ?? null,
        subcategoryId: input.subcategoryId ?? null,
        date: parseIsoDate(input.date),
        time: input.time ?? null,
        note: input.note || null,
        merchant: input.merchant || null,
        location: input.location || null,
        description: input.description || null,
        tags: input.tags ?? [],
        paymentMethod: input.paymentMethod ?? null,
        ...(items ? { items: { create: items.rows } } : {}),
      },
      include: expenseDetailInclude,
    });
    return toExpenseDetailDto(created);
  }

  async update(
    ws: WorkspaceContext,
    id: string,
    userId: string,
    input: UpdateExpenseData,
    client: ClientInfoDto,
  ): Promise<ExpenseDetailDto> {
    const existing = await this.findOrThrow(ws, id);

    // Validate the resulting category/subcategory pair, not just the fields being changed.
    const categoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    let subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategoryId;
    if (input.categoryId !== undefined && input.subcategoryId === undefined && categoryId !== existing.categoryId) {
      subcategoryId = null; // changing category clears a subcategory that no longer fits
    }
    await this.assertCategories(ws, categoryId, subcategoryId);

    const items = input.items?.length ? buildItems(input.items) : null;
    const clearingItems = input.items !== undefined && input.items.length === 0;
    if (clearingItems && input.amountMinor === undefined) {
      throw new BadRequestException('Enter an amount when removing all items');
    }

    let amountMinor: bigint | undefined;
    if (items) amountMinor = items.total;
    else if (input.amountMinor !== undefined) {
      const hasItems = !clearingItems && (await this.prisma.expenseItem.count({ where: { expenseId: id } })) > 0;
      if (hasItems) throw new BadRequestException('The amount is calculated from items; edit the items instead');
      amountMinor = BigInt(input.amountMinor);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.items !== undefined) {
        await tx.expenseItem.deleteMany({ where: { expenseId: id } });
      }
      return tx.expense.update({
        where: { id },
        data: {
          updatedById: userId,
          updatedClient: { ...client },
          categoryId,
          subcategoryId,
          ...(amountMinor !== undefined ? { amountMinor } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.date !== undefined ? { date: parseIsoDate(input.date) } : {}),
          ...(input.time !== undefined ? { time: input.time } : {}),
          ...(input.note !== undefined ? { note: blankToNull(input.note) } : {}),
          ...(input.merchant !== undefined ? { merchant: blankToNull(input.merchant) } : {}),
          ...(input.location !== undefined ? { location: blankToNull(input.location) } : {}),
          ...(input.description !== undefined ? { description: blankToNull(input.description) } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
          ...(items ? { items: { create: items.rows } } : {}),
        },
        include: expenseDetailInclude,
      });
    });
    return toExpenseDetailDto(updated);
  }

  async remove(ws: WorkspaceContext, id: string): Promise<void> {
    await this.findOrThrow(ws, id);
    const files = await this.prisma.attachment.findMany({
      where: { expenseId: id },
      select: { storageKey: true },
    });
    await this.prisma.expense.delete({ where: { id } });
    await this.storage.removeMany(files.map((f) => f.storageKey));
  }

  async findOrThrow(ws: WorkspaceContext, id: string) {
    const found = await this.prisma.expense.findFirst({ where: { id, workspaceId: ws.workspaceId } });
    if (!found) throw new NotFoundException('Expense not found');
    return found;
  }

  private async assertCategories(
    ws: WorkspaceContext,
    categoryId: string | null,
    subcategoryId: string | null,
  ) {
    if (subcategoryId && !categoryId) {
      throw new BadRequestException('Choose a category before a subcategory');
    }
    if (!categoryId) return;
    const ids = subcategoryId ? [categoryId, subcategoryId] : [categoryId];
    const found = await this.prisma.category.findMany({
      where: { id: { in: ids }, workspaceId: ws.workspaceId },
      select: { id: true, parentId: true },
    });
    const cat = found.find((c) => c.id === categoryId);
    if (!cat) throw new BadRequestException('Category not found in this workspace');
    if (cat.parentId) throw new BadRequestException('categoryId must be a top-level category');
    if (subcategoryId) {
      const sub = found.find((c) => c.id === subcategoryId);
      if (!sub || sub.parentId !== categoryId) {
        throw new BadRequestException('Subcategory does not belong to the chosen category');
      }
    }
  }
}
