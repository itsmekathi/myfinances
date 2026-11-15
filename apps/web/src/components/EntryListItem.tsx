import { Link } from 'react-router';
import { ENTRY_KIND_LABELS, type CategoryDto, type EntryDto } from '@myfinances/shared';
import { formatDay } from '../lib/dates';
import { KindAmount } from '../lib/kinds';
import { CategoryIcon } from './CategoryIcon';
import { entryPath } from './entryPaths';

/** One income or investment row, linking to its editor. */
export function EntryListItem({
  entry: e,
  byId,
  onTagClick,
}: {
  entry: EntryDto;
  byId: Map<string, CategoryDto>;
  onTagClick?: (tag: string) => void;
}) {
  const cat = e.categoryId ? byId.get(e.categoryId) : undefined;
  const sub = e.subcategoryId ? byId.get(e.subcategoryId) : undefined;
  const categoryLabel = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : 'Uncategorized';
  const title = e.source || e.note || sub?.name || cat?.name || ENTRY_KIND_LABELS[e.kind].title;

  return (
    <li>
      <Link
        to={`${entryPath(e.kind)}/${e.id}`}
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50"
      >
        <CategoryIcon icon={cat?.icon} color={sub?.color ?? cat?.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {title}
            {e.source && e.note && <span className="font-normal text-slate-500"> · {e.note}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
            <span>{categoryLabel}</span>
            <span>·</span>
            <span>{formatDay(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
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
        <KindAmount kind={e.kind} amountMinor={e.amountMinor} currency={e.currency} />
      </Link>
    </li>
  );
}
