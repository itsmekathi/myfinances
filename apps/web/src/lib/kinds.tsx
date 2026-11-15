import { HandCoins, PiggyBank, ReceiptText, type LucideIcon } from 'lucide-react';
import { formatMoney } from '@myfinances/shared';

export type MoneyKind = 'expense' | 'income' | 'investment';

/**
 * One visual identity per kind, used everywhere amounts appear:
 * expenses rose (−), income emerald (+), investments amber (money moved, not spent: no sign).
 */
export const KIND_STYLES: Record<
  MoneyKind,
  { icon: LucideIcon; sign: string; text: string; badge: string; solid: string; chart: string }
> = {
  expense: {
    icon: ReceiptText,
    sign: '−',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    solid: 'bg-rose-500',
    chart: '#f43f5e',
  },
  income: {
    icon: HandCoins,
    sign: '+',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    solid: 'bg-emerald-500',
    chart: '#10b981',
  },
  investment: {
    icon: PiggyBank,
    sign: '',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    solid: 'bg-amber-500',
    chart: '#f59e0b',
  },
};

/** A list amount with its kind's sign and colour, e.g. "−₹250.00" in rose. */
export function KindAmount({ kind, amountMinor, currency }: { kind: MoneyKind; amountMinor: number; currency: string }) {
  const s = KIND_STYLES[kind];
  return (
    <span className={`text-sm font-semibold whitespace-nowrap tabular-nums ${s.text}`}>
      {s.sign}
      {formatMoney(amountMinor, currency)}
    </span>
  );
}

/** Small coloured icon tile shown next to page headings. */
export function KindBadge({ kind }: { kind: MoneyKind }) {
  const s = KIND_STYLES[kind];
  const Icon = s.icon;
  return (
    <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${s.badge}`} aria-hidden>
      <Icon className="size-5" />
    </span>
  );
}
