import { Link } from 'react-router';
import { Clock, ListOrdered, Paperclip } from 'lucide-react';
import { formatMoney, type CategoryDto, type ExpenseDto } from '@myfinances/shared';
import { formatDay } from '../lib/dates';
import { CategoryIcon } from './CategoryIcon';

/** One expense row, linking to its editor. Used on the dashboard and the expenses list. */
export function ExpenseListItem({
  expense: e,
  byId,
  onTagClick,
}: {
  expense: ExpenseDto;
  byId: Map<string, CategoryDto>;
  onTagClick?: (tag: string) => void;
}) {
  const cat = e.categoryId ? byId.get(e.categoryId) : undefined;
  const sub = e.subcategoryId ? byId.get(e.subcategoryId) : undefined;
  const categoryLabel = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : 'Uncategorized';
  const title = e.merchant || e.note || sub?.name || cat?.name || 'Expense';

  return (
    <li>
      <Link
        to={`/expenses/${e.id}`}
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50"
      >
        <CategoryIcon icon={cat?.icon} color={sub?.color ?? cat?.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {title}
            {e.merchant && e.note && <span className="font-normal text-slate-500"> · {e.note}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
            <span>{categoryLabel}</span>
            <span>·</span>
            <span>{formatDay(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            {e.time && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="size-3" />
                {e.time}
              </span>
            )}
            {e.itemCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${e.itemCount} items`}>
                <ListOrdered className="size-3" />
                {e.itemCount}
              </span>
            )}
            {e.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${e.attachmentCount} attachments`}>
                <Paperclip className="size-3" />
                {e.attachmentCount}
              </span>
            )}
            {e.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={(ev) => {
                  if (!onTagClick) return;
                  ev.preventDefault();
                  onTagClick(t);
                }}
                className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300"
              >
                #{t}
              </button>
            ))}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(e.amountMinor, e.currency)}</span>
      </Link>
    </li>
  );
}
