import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, X } from 'lucide-react';
import { ENTRY_KIND_LABELS, formatMoney, type EntryKind } from '@myfinances/shared';
import { useCanWrite, useWorkspace } from '../auth/AuthProvider';
import { useCategoryLookup, useEntries, useSummary } from '../hooks/queries';
import { currentMonth, monthRange } from '../lib/dates';
import { MonthPicker } from '../components/MonthPicker';
import { EntryListItem } from '../components/EntryListItem';
import { entryPath } from '../components/entryPaths';
import { Card, Select, Spinner } from '../components/ui';
import { KIND_STYLES, KindBadge } from '../lib/kinds';

const PAGE_SIZE = 20;
const linkButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700';

/** /income and /investments */
export function EntriesPage({ kind }: { kind: EntryKind }) {
  // key: reset filters when switching between income and investments
  return <EntriesList key={kind} kind={kind} />;
}

function EntriesList({ kind }: { kind: EntryKind }) {
  const ws = useWorkspace();
  const writable = useCanWrite();
  const labels = ENTRY_KIND_LABELS[kind];
  const base = entryPath(kind);
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);

  const { from, to } = monthRange(month);
  const entries = useEntries(kind, {
    from,
    to,
    categoryId: categoryId || undefined,
    subcategoryId: subcategoryId || undefined,
    tag: tag || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const summary = useSummary(from, to);
  const monthTotal = summary.data ? (kind === 'income' ? summary.data.incomeMinor : summary.data.investedMinor) : null;
  const { tree, byId } = useCategoryLookup(kind);
  const subcategories = tree.find((c) => c.id === categoryId)?.children ?? [];
  const totalPages = entries.data ? Math.max(1, Math.ceil(entries.data.total / PAGE_SIZE)) : 1;
  const reset = () => setPage(1);
  const addLabel = kind === 'income' ? 'Add income' : 'Add investment';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <KindBadge kind={kind} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
            {monthTotal !== null && (
              <p className="text-sm text-slate-500">
                <span className={`font-medium ${KIND_STYLES[kind].text}`}>{formatMoney(monthTotal, ws.baseCurrency)}</span>{' '}
                {kind === 'income' ? 'received' : 'invested'} this month
              </p>
            )}
          </div>
        </div>
        {writable && (
          <Link to={`${base}/new`} className={linkButton}>
            <Plus className="size-4" /> {addLabel}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={(m) => (setMonth(m), reset())} />
        <Select
          className="w-auto"
          value={categoryId}
          onChange={(e) => (setCategoryId(e.target.value), setSubcategoryId(''), reset())}
        >
          <option value="">All categories</option>
          {tree.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {subcategories.length > 0 && (
          <Select className="w-auto" value={subcategoryId} onChange={(e) => (setSubcategoryId(e.target.value), reset())}>
            <option value="">All subcategories</option>
            {subcategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        {tag && (
          <button
            onClick={() => (setTag(''), reset())}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
          >
            #{tag} <X className="size-3.5" />
          </button>
        )}
      </div>

      <Card className="overflow-hidden p-0 sm:p-0">
        {entries.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !entries.data?.items.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No {labels.singular} recorded for this period.</p>
            {writable && (
              <Link to={`${base}/new`} className={`${linkButton} mt-4`}>
                <Plus className="size-4" /> Add one
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.data.items.map((e) => (
              <EntryListItem key={e.id} entry={e} byId={byId} onTagClick={(t) => (setTag(t), reset())} />
            ))}
          </ul>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="rounded-lg px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40 dark:ring-slate-700" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button className="rounded-lg px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40 dark:ring-slate-700" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
