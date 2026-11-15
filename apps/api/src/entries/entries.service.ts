import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ClientInfoDto,
  CreateEntryData,
  EntryDto,
  EntryKind,
  ListEntriesQuery,
  Paginated,
  UpdateEntryData,
} from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { parseIsoDate } from '../common/dates';
import type { WorkspaceContext } from '../common/request-context';
import { entryInclude, toEntryDto } from './entry.mapper';

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v || null);

const NAMES: Record<EntryKind, { notFound: string; category: string }> = {
  income: { notFound: 'Income entry not found', category: 'Choose an income category' },
  investment: { notFound: 'Investment not found', category: 'Choose an investment category' },
};

/** Income and investment entries. Every query is scoped by workspace *and* kind. */
@Injectable()
export class EntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ws: WorkspaceContext, kind: EntryKind, q: ListEntriesQuery): Promise<Paginated<EntryDto>> {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('"from" must be before "to"');

    const where: Prisma.EntryWhereInput = {
      workspaceId: ws.workspaceId,
      kind,
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
      this.prisma.entry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.entry.count({ where }),
    ]);
    return { items: rows.map(toEntryDto), page: q.page, pageSize: q.pageSize, total };
  }

  async get(ws: WorkspaceContext, kind: EntryKind, id: string): Promise<EntryDto> {
    const row = await this.prisma.entry.findFirst({
      where: { id, workspaceId: ws.workspaceId, kind },
      include: entryInclude,
    });
    if (!row) throw new NotFoundException(NAMES[kind].notFound);
    return toEntryDto(row);
  }

  async create(
    ws: WorkspaceContext,
    kind: EntryKind,
    userId: string,
    input: CreateEntryData,
    client: ClientInfoDto,
  ): Promise<EntryDto> {
    await this.assertCategories(ws, kind, input.categoryId ?? null, input.subcategoryId ?? null);
    const created = await this.prisma.entry.create({
      data: {
        workspaceId: ws.workspaceId,
        kind,
        createdById: userId,
        createdClient: { ...client },
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency ?? ws.baseCurrency,
        categoryId: input.categoryId ?? null,
        subcategoryId: input.subcategoryId ?? null,
        date: parseIsoDate(input.date),
        source: input.source || null,
        note: input.note || null,
        tags: input.tags ?? [],
      },
      include: entryInclude,
    });
    return toEntryDto(created);
  }

  async update(
    ws: WorkspaceContext,
    kind: EntryKind,
    id: string,
    userId: string,
    input: UpdateEntryData,
    client: ClientInfoDto,
  ): Promise<EntryDto> {
    const existing = await this.findOrThrow(ws, kind, id);

    // Validate the resulting category/subcategory pair, not just the fields being changed.
    const categoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    let subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategoryId;
    if (input.categoryId !== undefined && input.subcategoryId === undefined && categoryId !== existing.categoryId) {
      subcategoryId = null; // changing category clears a subcategory that no longer fits
    }
    await this.assertCategories(ws, kind, categoryId, subcategoryId);

    const updated = await this.prisma.entry.update({
      where: { id },
      data: {
        updatedById: userId,
        updatedClient: { ...client },
        categoryId,
        subcategoryId,
        ...(input.amountMinor !== undefined ? { amountMinor: BigInt(input.amountMinor) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.date !== undefined ? { date: parseIsoDate(input.date) } : {}),
        ...(input.source !== undefined ? { source: blankToNull(input.source) } : {}),
        ...(input.note !== undefined ? { note: blankToNull(input.note) } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      include: entryInclude,
    });
    return toEntryDto(updated);
  }

  async remove(ws: WorkspaceContext, kind: EntryKind, id: string): Promise<void> {
    await this.findOrThrow(ws, kind, id);
    await this.prisma.entry.delete({ where: { id } });
  }

  private async findOrThrow(ws: WorkspaceContext, kind: EntryKind, id: string) {
    const found = await this.prisma.entry.findFirst({ where: { id, workspaceId: ws.workspaceId, kind } });
    if (!found) throw new NotFoundException(NAMES[kind].notFound);
    return found;
  }

  private async assertCategories(
    ws: WorkspaceContext,
    kind: EntryKind,
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
      select: { id: true, parentId: true, kind: true },
    });
    const cat = found.find((c) => c.id === categoryId);
    if (!cat) throw new BadRequestException('Category not found in this workspace');
    if (cat.parentId) throw new BadRequestException('categoryId must be a top-level category');
    if (cat.kind !== kind) throw new BadRequestException(NAMES[kind].category);
    if (subcategoryId) {
      const sub = found.find((c) => c.id === subcategoryId);
      if (!sub || sub.parentId !== categoryId) {
        throw new BadRequestException('Subcategory does not belong to the chosen category');
      }
    }
  }
}
