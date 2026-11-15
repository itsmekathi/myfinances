import type { ClientInfoDto, EntryDto } from '@myfinances/shared';
import type { Entry, User } from '../generated/prisma/client';
import { formatIsoDate } from '../common/dates';

type UserRef = Pick<User, 'id' | 'displayName'>;

export const entryInclude = {
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
} as const;

type Row = Entry & { createdBy: UserRef | null; updatedBy: UserRef | null };

export function toEntryDto(e: Row): EntryDto {
  return {
    id: e.id,
    kind: e.kind,
    amountMinor: Number(e.amountMinor),
    currency: e.currency,
    categoryId: e.categoryId,
    subcategoryId: e.subcategoryId,
    date: formatIsoDate(e.date),
    source: e.source,
    note: e.note,
    tags: e.tags,
    createdBy: e.createdBy ? { id: e.createdBy.id, displayName: e.createdBy.displayName } : null,
    createdAt: e.createdAt.toISOString(),
    createdClient: (e.createdClient as ClientInfoDto | null) ?? null,
    updatedBy: e.updatedBy ? { id: e.updatedBy.id, displayName: e.updatedBy.displayName } : null,
    updatedAt: e.updatedAt.toISOString(),
    updatedClient: (e.updatedClient as ClientInfoDto | null) ?? null,
  };
}
