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
  totalMinor: number;
  count: number;
  byCategory: CategoryTotal[];
  byDay: DailyTotal[];
}
