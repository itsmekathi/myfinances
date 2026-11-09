import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, X } from 'lucide-react';
import { useCategoryLookup, useExpenses } from '../hooks/queries';
import { currentMonth, monthRange } from '../lib/dates';
import { MonthPicker } from '../components/MonthPicker';
import { ExpenseListItem } from '../components/ExpenseListItem';
import { Card, Select, Spinner } from '../components/ui';

const PAGE_SIZE = 20;
const linkButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700';

export function ExpensesPage() {
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);

  const { from, to } = monthRange(month);
  const expenses = useExpenses({
    from,
    to,
    categoryId: categoryId || undefined,
    subcategoryId: subcategoryId || undefined,
    tag: tag || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { tree, byId } = useCategoryLookup();
  const subcategories = tree.find((c) => c.id === categoryId)?.children ?? [];
  const totalPages = expenses.data ? Math.max(1, Math.ceil(expenses.data.total / PAGE_SIZE)) : 1;
  const reset = () => setPage(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <Link to="/expenses/new" className={linkButton}>
          <Plus className="size-4" /> Add expense
        </Link>
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
        {expenses.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !expenses.data?.items.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No expenses found for this period.</p>
            <Link to="/expenses/new" className={`${linkButton} mt-4`}>
              <Plus className="size-4" /> Add one
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {expenses.data.items.map((e) => (
              <ExpenseListItem key={e.id} expense={e} byId={byId} onTagClick={(t) => (setTag(t), reset())} />
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
