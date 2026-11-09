import { z } from "zod";

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code");

/** Number of decimal places for a currency (most use 2). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Convert a major-unit amount (e.g. 12.34) to integer minor units (1234). */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyDecimals(currency));
}

/** Convert integer minor units back to a major-unit number. */
export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** currencyDecimals(currency);
}

export function formatMoney(amountMinor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    fromMinor(amountMinor, currency),
  );
}
