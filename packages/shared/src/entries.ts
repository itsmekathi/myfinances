import { z } from "zod";
import { currencySchema } from "./money";
import {
  MAX_AMOUNT_MINOR,
  isoDateSchema,
  tagSchema,
  tagsSchema,
  type ClientInfoDto,
  type UserRefDto,
} from "./expenses";

/**
 * Entries are income received or money put into an investment.
 * Both have the same shape; the API serves them at `/income` and `/investments`.
 */
export const ENTRY_KINDS = ["income", "investment"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

const optionalText = (max: number) => z.string().trim().max(max).optional();

const entryFields = {
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: currencySchema.optional(),
  /** Must be a category of the same kind as the entry. */
  categoryId: z.string().uuid().nullable().optional(),
  /** Must be a child of categoryId. */
  subcategoryId: z.string().uuid().nullable().optional(),
  date: isoDateSchema,
  /** Who paid (income) or what was invested in (investment), e.g. "Acme Corp" or "Index fund SIP". */
  source: optionalText(120),
  note: optionalText(500),
  tags: tagsSchema.optional(),
};

export const createEntrySchema = z.object(entryFields);
export type CreateEntryInput = z.input<typeof createEntrySchema>;
export type CreateEntryData = z.output<typeof createEntrySchema>;

export const updateEntrySchema = z.object(entryFields).partial();
export type UpdateEntryInput = z.input<typeof updateEntrySchema>;
export type UpdateEntryData = z.output<typeof updateEntrySchema>;

export const listEntriesQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  tag: tagSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

export interface EntryDto {
  id: string;
  kind: EntryKind;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  subcategoryId: string | null;
  date: string;
  source: string | null;
  note: string | null;
  tags: string[];
  /** Null once the author has deleted their account. */
  createdBy: UserRefDto | null;
  createdAt: string;
  createdClient: ClientInfoDto | null;
  updatedBy: UserRefDto | null;
  updatedAt: string;
  updatedClient: ClientInfoDto | null;
}

/** Display labels, e.g. for page titles and buttons. */
export const ENTRY_KIND_LABELS: Record<EntryKind, { title: string; singular: string; sourceLabel: string }> = {
  income: { title: "Income", singular: "income", sourceLabel: "From" },
  investment: { title: "Investments", singular: "investment", sourceLabel: "Invested in" },
};
