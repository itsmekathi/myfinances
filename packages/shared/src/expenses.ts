import { z } from "zod";
import { currencySchema } from "./money";

export const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "wallet", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Calendar date as YYYY-MM-DD. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** 24-hour time as HH:MM. */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, "Tags may contain letters, numbers, spaces, _ and -");

export const tagsSchema = z
  .array(tagSchema)
  .max(10)
  .transform((tags) => [...new Set(tags)]);

export const MAX_AMOUNT_MINOR = 1_000_000_000_00;

export const expenseItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitPriceMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
});
export type ExpenseItemInput = z.input<typeof expenseItemSchema>;

/** Line total in minor units. Used by the API and by forms for a live preview. */
export function itemAmountMinor(item: { quantity?: number; unitPriceMinor: number }): number {
  return Math.round((item.quantity ?? 1) * item.unitPriceMinor);
}

export function itemsTotalMinor(items: Array<{ quantity?: number; unitPriceMinor: number }>): number {
  return items.reduce((sum, i) => sum + itemAmountMinor(i), 0);
}

const optionalText = (max: number) => z.string().trim().max(max).optional();

const expenseFields = {
  /** Ignored when items are given: the total is calculated from them. */
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR).optional(),
  currency: currencySchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  /** Must be a child of categoryId. */
  subcategoryId: z.string().uuid().nullable().optional(),
  date: isoDateSchema,
  time: timeSchema.nullable().optional(),
  note: optionalText(500),
  merchant: optionalText(120),
  location: optionalText(200),
  description: optionalText(2000),
  tags: tagsSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  /** Item breakdown (e.g. a grocery receipt). Replaces all existing items on update. */
  items: z.array(expenseItemSchema).max(100).optional(),
};

export const createExpenseSchema = z
  .object(expenseFields)
  .refine((e) => e.amountMinor !== undefined || (e.items?.length ?? 0) > 0, {
    message: "Enter an amount or add at least one item",
    path: ["amountMinor"],
  })
  .refine((e) => !e.items?.length || itemsTotalMinor(e.items) > 0, {
    message: "Items must add up to more than zero",
    path: ["items"],
  });
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;
/** Parsed form (after defaults/transforms), as the API receives it. */
export type CreateExpenseData = z.output<typeof createExpenseSchema>;

export const updateExpenseSchema = z
  .object({ ...expenseFields, date: isoDateSchema.optional() })
  .refine((e) => !e.items?.length || itemsTotalMinor(e.items) > 0, {
    message: "Items must add up to more than zero",
    path: ["items"],
  });
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;
export type UpdateExpenseData = z.output<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  tag: tagSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

/** Where an expense was created or edited from. */
export interface ClientInfoDto {
  type: "web" | "ios" | "android" | "unknown";
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  device: string | null;
  appVersion: string | null;
  userAgent: string | null;
}

export interface UserRefDto {
  id: string;
  displayName: string | null;
}

export interface ExpenseDto {
  id: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  subcategoryId: string | null;
  date: string;
  time: string | null;
  note: string | null;
  merchant: string | null;
  location: string | null;
  description: string | null;
  tags: string[];
  paymentMethod: PaymentMethod | null;
  itemCount: number;
  attachmentCount: number;
  createdBy: UserRefDto;
  createdAt: string;
  createdClient: ClientInfoDto | null;
  updatedBy: UserRefDto | null;
  updatedAt: string;
  updatedClient: ClientInfoDto | null;
}

export interface ExpenseItemDto {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: UserRefDto;
}

export interface ExpenseDetailDto extends ExpenseDto {
  items: ExpenseItemDto[];
  attachments: AttachmentDto[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const ATTACHMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPerExpense: 10,
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const,
};

/** Short human description of a client, e.g. "Chrome 131 on Windows" or "MyFinances app on Android". */
export function describeClient(c: ClientInfoDto | null | undefined): string {
  if (!c) return "unknown device";
  if (c.type === "ios" || c.type === "android") {
    const os = c.type === "ios" ? "iOS" : "Android";
    return `MyFinances app${c.appVersion ? ` ${c.appVersion}` : ""} on ${os}`;
  }
  const major = c.browserVersion?.split(".")[0];
  const browser = c.browser ? `${c.browser}${major ? ` ${major}` : ""}` : "Unknown browser";
  return c.os ? `${browser} on ${c.os}` : browser;
}
