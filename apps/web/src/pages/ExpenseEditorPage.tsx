import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Clock, Laptop, Smartphone, Trash2 } from 'lucide-react';
import {
  PAYMENT_METHODS,
  currencyDecimals,
  describeClient,
  formatMoney,
  fromMinor,
  itemsTotalMinor,
  toMinor,
  type AttachmentDto,
  type ClientInfoDto,
  type ExpenseDetailDto,
  type PaymentMethod,
} from '@myfinances/shared';
import { useWorkspace } from '../auth/AuthProvider';
import {
  useCategoryLookup,
  useDeleteAttachment,
  useDeleteExpense,
  useExpense,
  useSaveExpense,
  useUploadAttachment,
} from '../hooks/queries';
import { todayIso } from '../lib/dates';
import { Button, Card, ErrorMessage, Field, Input, Select, Spinner } from '../components/ui';
import { TagInput } from '../components/TagInput';
import { ItemsEditor, itemsForApi, type ItemDraft } from '../components/ItemsEditor';
import { AttachmentsField, validateFile } from '../components/AttachmentsField';

export const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  wallet: 'Wallet',
  other: 'Other',
};

const nowTime = () => new Date().toTimeString().slice(0, 5);

/** /expenses/new and /expenses/:id */
export function ExpenseEditorPage() {
  const { id } = useParams();
  const existing = useExpense(id);

  if (id && !existing.data) {
    return (
      <div className="flex justify-center py-24">
        {existing.error ? <ErrorMessage error={existing.error} /> : <Spinner />}
      </div>
    );
  }
  // key: re-initialise the form when switching between expenses
  return <ExpenseEditor key={id ?? 'new'} expense={existing.data} />;
}

function ExpenseEditor({ expense }: { expense?: ExpenseDetailDto }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const currency = expense?.currency ?? ws.baseCurrency;
  const { tree } = useCategoryLookup();
  const save = useSaveExpense();
  const remove = useDeleteExpense();
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();

  const [amount, setAmount] = useState(expense ? String(fromMinor(expense.amountMinor, currency)) : '');
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [time, setTime] = useState(expense ? (expense.time ?? '') : nowTime());
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(expense?.subcategoryId ?? '');
  const [merchant, setMerchant] = useState(expense?.merchant ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(expense?.paymentMethod ?? '');
  const [note, setNote] = useState(expense?.note ?? '');
  const [location, setLocation] = useState(expense?.location ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [tags, setTags] = useState<string[]>(expense?.tags ?? []);
  const [items, setItems] = useState<ItemDraft[]>(
    expense?.items.map((i) => ({
      key: i.id,
      name: i.name,
      quantity: String(i.quantity),
      unitPrice: String(fromMinor(i.unitPriceMinor, currency)),
    })) ?? [],
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const subcategories = tree.find((c) => c.id === categoryId)?.children ?? [];
  const apiItems = itemsForApi(items, currency);
  const usesItems = apiItems.length > 0;

  function addFiles(files: File[]) {
    const problems = files.map(validateFile).filter(Boolean);
    setError(problems.length ? new Error(problems.join('\n')) : null);
    const ok = files.filter((f) => !validateFile(f));
    if (!ok.length) return;
    if (expense) {
      // Existing expense: upload straight away.
      void Promise.all(ok.map((file) => upload.mutateAsync({ expenseId: expense.id, file }))).catch(setError);
    } else {
      setPendingFiles((p) => [...p, ...ok]);
    }
  }

  function removeSaved(att: AttachmentDto) {
    if (expense && confirm(`Remove ${att.fileName}?`)) {
      removeAttachment.mutate({ expenseId: expense.id, id: att.id });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!usesItems && (!Number.isFinite(value) || value <= 0)) {
      setError(new Error('Enter an amount, or add items with prices'));
      return;
    }

    setSaving(true);
    try {
      const saved = await save.mutateAsync({
        id: expense?.id,
        input: {
          ...(usesItems ? {} : { amountMinor: toMinor(value, currency) }),
          items: apiItems,
          date,
          time: time || null,
          categoryId: categoryId || null,
          subcategoryId: subcategoryId || null,
          merchant,
          paymentMethod: paymentMethod || undefined,
          note,
          location,
          description,
          tags,
        },
      });
      for (const file of pendingFiles) {
        await upload.mutateAsync({ expenseId: saved.id, file });
      }
      navigate('/expenses');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (expense && confirm('Delete this expense and its attachments?')) {
      remove.mutate(expense.id, { onSuccess: () => navigate('/expenses') });
    }
  }

  const step = 1 / 10 ** currencyDecimals(currency);

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/expenses" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{expense ? 'Edit expense' : 'New expense'}</h1>
        </div>
        {expense && (
          <Button type="button" variant="ghost" onClick={onDelete} className="text-rose-600">
            <Trash2 className="size-4" /> Delete
          </Button>
        )}
      </div>

      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            {usesItems ? (
              <Field label={`Total (${currency})`} hint="Calculated from items">
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-semibold tabular-nums dark:bg-slate-800">
                  {formatMoney(itemsTotalMinor(apiItems), currency)}
                </div>
              </Field>
            ) : (
              <Field label={`Amount (${currency})`}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={step}
                  step={step}
                  autoFocus={!expense}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-semibold"
                />
              </Field>
            )}
          </div>
          <Field label="Date">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
          <Field label="Merchant / payee">
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} placeholder="e.g. Big Bazaar, Uber" />
          </Field>
          <Field label="Paid with">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {paymentLabels[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Short summary shown in lists" />
        </Field>
      </Section>

      <Section title="Item breakdown" subtitle="Optional. When you add items, the total is calculated from them.">
        <ItemsEditor items={items} onChange={setItems} currency={currency} />
      </Section>

      <Section title="Bills & files">
        <AttachmentsField
          expenseId={expense?.id}
          saved={expense?.attachments ?? []}
          pending={pendingFiles}
          onAddFiles={addFiles}
          onRemovePending={(f) => setPendingFiles((p) => p.filter((x) => x !== f))}
          onRemoveSaved={removeSaved}
          busy={upload.isPending}
        />
      </Section>

      <Section title="More details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Indiranagar, Bengaluru" />
          </Field>
          <Field label="Tags" hint="Press Enter to add">
            <TagInput value={tags} onChange={setTags} />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Anything else worth remembering"
            className="w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-slate-900 dark:ring-slate-700"
          />
        </Field>
      </Section>

      {expense && <AuditFooter expense={expense} />}

      <ErrorMessage error={error ?? remove.error ?? removeAttachment.error} />

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl bg-slate-50/90 py-3 backdrop-blur md:bottom-0 dark:bg-slate-950/90">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function AuditFooter({ expense }: { expense: ExpenseDetailDto }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="space-y-1.5 px-1 text-xs text-slate-500">
      <AuditLine
        label="Added by"
        who={expense.createdBy.displayName}
        client={expense.createdClient}
        when={fmt(expense.createdAt)}
      />
      {expense.updatedBy && (
        <AuditLine
          label="Last edited by"
          who={expense.updatedBy.displayName}
          client={expense.updatedClient}
          when={fmt(expense.updatedAt)}
        />
      )}
    </div>
  );
}

function AuditLine({
  label,
  who,
  client,
  when,
}: {
  label: string;
  who: string | null;
  client: ClientInfoDto | null;
  when: string;
}) {
  const Icon = client?.type === 'ios' || client?.type === 'android' ? Smartphone : Laptop;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>
        {label} <span className="font-medium text-slate-700 dark:text-slate-300">{who ?? 'someone'}</span>
      </span>
      <span className="inline-flex items-center gap-1" title={client?.userAgent ?? undefined}>
        <Icon className="size-3.5" /> {describeClient(client)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" /> {when}
      </span>
    </p>
  );
}
