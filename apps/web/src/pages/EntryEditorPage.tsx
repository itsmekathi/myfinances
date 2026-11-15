import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { ENTRY_KIND_LABELS, currencyDecimals, fromMinor, toMinor, type EntryDto, type EntryKind } from '@myfinances/shared';
import { useCanWrite, useWorkspace } from '../auth/AuthProvider';
import { useCategoryLookup, useDeleteEntry, useEntry, useSaveEntry } from '../hooks/queries';
import { todayIso } from '../lib/dates';
import { Button, ErrorMessage, Field, Input, ReadOnlyNotice, Select, Spinner } from '../components/ui';
import { TagInput } from '../components/TagInput';
import { AuditFooter, Section } from '../components/EditorParts';
import { entryPath } from '../components/entryPaths';
import { KindBadge } from '../lib/kinds';

/**
 * /income/new, /income/:id, /investments/new and /investments/:id.
 * `?copy=<id>` on a "new" route pre-fills the form from an existing entry, dated today.
 */
export function EntryEditorPage({ kind }: { kind: EntryKind }) {
  const { id } = useParams();
  const [search] = useSearchParams();
  const copyId = id ? undefined : (search.get('copy') ?? undefined);
  const existing = useEntry(kind, id ?? copyId);
  const writable = useCanWrite();

  // Viewers can open an entry read-only, but can't start a new one (or a copy).
  if (!id && !writable) return <Navigate to={entryPath(kind)} replace />;
  if ((id || copyId) && !existing.data) {
    return (
      <div className="flex justify-center py-24">
        {existing.error ? <ErrorMessage error={existing.error} /> : <Spinner />}
      </div>
    );
  }
  const entry = id ? existing.data : undefined;
  const template = copyId ? existing.data : undefined;
  // key: re-initialise the form when switching between entries
  return <EntryEditor key={`${kind}:${id ?? copyId ?? 'new'}`} kind={kind} entry={entry} template={template} />;
}

function EntryEditor({ kind, entry, template }: { kind: EntryKind; entry?: EntryDto; template?: EntryDto }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const readOnly = !useCanWrite();
  const labels = ENTRY_KIND_LABELS[kind];
  const base = entryPath(kind);
  const source = entry ?? template;
  const currency = source?.currency ?? ws.baseCurrency;
  const { tree } = useCategoryLookup(kind);
  const save = useSaveEntry(kind);
  const remove = useDeleteEntry(kind);

  const [amount, setAmount] = useState(source ? String(fromMinor(source.amountMinor, currency)) : '');
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(source?.subcategoryId ?? '');
  const [from, setFrom] = useState(source?.source ?? '');
  const [note, setNote] = useState(source?.note ?? '');
  const [tags, setTags] = useState<string[]>(source?.tags ?? []);
  const [error, setError] = useState<unknown>(null);

  const subcategories = tree.find((c) => c.id === categoryId)?.children ?? [];
  const noun = kind === 'income' ? 'income' : 'investment';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(new Error('Enter an amount greater than zero'));
      return;
    }
    try {
      await save.mutateAsync({
        id: entry?.id,
        input: {
          amountMinor: toMinor(value, currency),
          currency,
          date,
          categoryId: categoryId || null,
          subcategoryId: subcategoryId || null,
          source: from,
          note,
          tags,
        },
      });
      navigate(base);
    } catch (err) {
      setError(err);
    }
  }

  function onDelete() {
    if (entry && confirm(`Delete this ${noun}?`)) {
      remove.mutate(entry.id, { onSuccess: () => navigate(base) });
    }
  }

  const step = 1 / 10 ** currencyDecimals(currency);

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={base} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
          <KindBadge kind={kind} />
          <h1 className="text-2xl font-bold tracking-tight">{readOnly ? (kind === 'income' ? 'Income' : 'Investment') : entry ? `Edit ${noun}` : `New ${noun}`}</h1>
        </div>
        {entry && !readOnly && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" onClick={() => navigate(`${base}/new?copy=${entry.id}`)}>
              <Copy className="size-4" /> Duplicate
            </Button>
            <Button type="button" variant="ghost" onClick={onDelete} className="text-rose-600">
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {readOnly && <ReadOnlyNotice />}
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <Section title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount (${currency})`}>
              <Input
                type="number"
                inputMode="decimal"
                min={step}
                step={step}
                autoFocus={!entry}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="text-lg font-semibold"
              />
            </Field>
            <Field label="Date">
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId('');
                }}
              >
                <option value="">Uncategorized</option>
                {tree.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {subcategories.length > 0 && (
              <Field label="Subcategory">
                <Select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                  <option value="">—</option>
                  {subcategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.sourceLabel}>
              <Input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                maxLength={120}
                placeholder={kind === 'income' ? 'e.g. Acme Corp, client name' : 'e.g. Nifty 50 index fund, SBI FD'}
              />
            </Field>
            <Field label="Tags" hint="Press Enter to add">
              <TagInput value={tags} onChange={setTags} />
            </Field>
          </div>

          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Short summary shown in lists" />
          </Field>
        </Section>

      </fieldset>

      {entry && <AuditFooter record={entry} />}

      <ErrorMessage error={error ?? remove.error} />

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl bg-slate-50/90 py-3 backdrop-blur md:bottom-0 dark:bg-slate-950/90">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          {readOnly ? 'Back' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button type="submit" loading={save.isPending}>
            {entry ? 'Save changes' : kind === 'income' ? 'Add income' : 'Add investment'}
          </Button>
        )}
      </div>
    </form>
  );
}
