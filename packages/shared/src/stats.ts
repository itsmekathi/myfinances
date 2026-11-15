import { z } from "zod";
import { isoDateSchema } from "./expenses";

export const statsQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string | null;
  totalMinor: number;
}

export interface DailyTotal {
  date: string;
  totalMinor: number;
}

export interface StatsSummary {
  currency: string;
  from: string;
  to: string;
  /** Expenses only (kept for older clients); also in `expensesMinor`. */
  totalMinor: number;
  /** Number of expenses. */
  count: number;
  /** Expenses by category. */
  byCategory: CategoryTotal[];
  /** Expenses by day. */
  byDay: DailyTotal[];
  expensesMinor: number;
  incomeMinor: number;
  investedMinor: number;
  /** income − expenses − invested: what's left over. */
  netMinor: number;
  incomeByCategory: CategoryTotal[];
  investmentsByCategory: CategoryTotal[];
}

/** Share of income not spent, (income − expenses) / income, or null without income. */
export function savingsRate(s: Pick<StatsSummary, "incomeMinor" | "expensesMinor">): number | null {
  return s.incomeMinor > 0 ? (s.incomeMinor - s.expensesMinor) / s.incomeMinor : null;
}
