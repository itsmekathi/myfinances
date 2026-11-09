/** 'YYYY-MM-DD' -> Date at UTC midnight (matches Postgres DATE columns). */
export function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Date -> 'YYYY-MM-DD' (UTC). */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
