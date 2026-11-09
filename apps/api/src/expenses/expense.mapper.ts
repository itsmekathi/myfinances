import type {
  AttachmentDto,
  ClientInfoDto,
  ExpenseDetailDto,
  ExpenseDto,
  ExpenseItemDto,
  PaymentMethod,
} from '@myfinances/shared';
import type { Attachment, Expense, ExpenseItem, User } from '../generated/prisma/client';
import { formatIsoDate } from '../common/dates';

type UserRef = Pick<User, 'id' | 'displayName'>;

export const expenseListInclude = {
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
  _count: { select: { items: true, attachments: true } },
} as const;

export const expenseDetailInclude = {
  ...expenseListInclude,
  items: { orderBy: { position: 'asc' } },
  attachments: {
    orderBy: { createdAt: 'asc' },
    include: { uploadedBy: { select: { id: true, displayName: true } } },
  },
} as const;

type ListRow = Expense & {
  createdBy: UserRef;
  updatedBy: UserRef | null;
  _count: { items: number; attachments: number };
};

type DetailRow = ListRow & {
  items: ExpenseItem[];
  attachments: Array<Attachment & { uploadedBy: UserRef }>;
};

export function toExpenseDto(e: ListRow): ExpenseDto {
  return {
    id: e.id,
    amountMinor: Number(e.amountMinor),
    currency: e.currency,
    categoryId: e.categoryId,
    subcategoryId: e.subcategoryId,
    date: formatIsoDate(e.date),
    time: e.time,
    note: e.note,
    merchant: e.merchant,
    location: e.location,
    description: e.description,
    tags: e.tags,
    paymentMethod: (e.paymentMethod as PaymentMethod | null) ?? null,
    itemCount: e._count.items,
    attachmentCount: e._count.attachments,
    createdBy: { id: e.createdBy.id, displayName: e.createdBy.displayName },
    createdAt: e.createdAt.toISOString(),
    createdClient: (e.createdClient as ClientInfoDto | null) ?? null,
    updatedBy: e.updatedBy ? { id: e.updatedBy.id, displayName: e.updatedBy.displayName } : null,
    updatedAt: e.updatedAt.toISOString(),
    updatedClient: (e.updatedClient as ClientInfoDto | null) ?? null,
  };
}

export function toItemDto(i: ExpenseItem): ExpenseItemDto {
  return {
    id: i.id,
    name: i.name,
    quantity: Number(i.quantity),
    unitPriceMinor: Number(i.unitPriceMinor),
    amountMinor: Number(i.amountMinor),
  };
}

export function toAttachmentDto(a: Attachment & { uploadedBy: UserRef }): AttachmentDto {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
    uploadedBy: { id: a.uploadedBy.id, displayName: a.uploadedBy.displayName },
  };
}

export function toExpenseDetailDto(e: DetailRow): ExpenseDetailDto {
  return {
    ...toExpenseDto(e),
    items: e.items.map(toItemDto),
    attachments: e.attachments.map(toAttachmentDto),
  };
}
