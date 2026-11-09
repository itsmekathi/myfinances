import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonth, monthLabel, shiftMonth, type Month } from '../lib/dates';

export function MonthPicker({ value, onChange }: { value: Month; onChange: (m: Month) => void }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="inline-flex items-center rounded-lg bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <button
        onClick={() => onChange(shiftMonth(value, -1))}
        className="rounded-l-lg p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
        aria-label="Previous month"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(value)}</span>
      <button
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={isCurrent}
        className="rounded-r-lg p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:hover:bg-slate-800"
        aria-label="Next month"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
