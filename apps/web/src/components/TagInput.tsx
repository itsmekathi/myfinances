import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Chip-style tag editor: type and press Enter or comma to add; Backspace removes the last tag. */
export function TagInput({
  value,
  onChange,
  max = 10,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const tag = normalize(draft).slice(0, 30);
    if (tag && !value.includes(tag) && value.length < max) onChange([...value, tag]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500 dark:bg-slate-900 dark:ring-slate-700">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded hover:bg-brand-100 dark:hover:bg-brand-500/30"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length ? '' : 'e.g. work, trip-goa, reimbursable'}
        disabled={value.length >= max}
        className="min-w-24 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
      />
    </div>
  );
}
