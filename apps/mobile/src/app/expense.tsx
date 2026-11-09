import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  PAYMENT_METHODS,
  describeClient,
  formatMoney,
  fromMinor,
  itemsTotalMinor,
  toMinor,
  type AttachmentDto,
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
import { todayIso, yesterdayIso } from '../lib/dates';
import { useColors } from '../lib/theme';
import { Button, Card, Chip, ErrorText, TextField } from '../components/ui';
import { ItemsEditor, itemsForApi, type ItemDraft } from '../components/ItemsEditor';
import { AttachmentStrip, pickFiles, tooLarge, type LocalFile } from '../components/Attachments';

const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank',
  wallet: 'Wallet',
  other: 'Other',
};

const nowTime = () => new Date().toTimeString().slice(0, 5);
const parseTags = (s: string) =>
  [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

/** Add (no id) or edit (?id=...) an expense. */
export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useExpense(id);
  const c = useColors();

  if (id && !existing.data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        {existing.error ? <ErrorText error={existing.error} /> : <ActivityIndicator color={c.brand} />}
      </View>
    );
  }
  return <ExpenseForm key={id ?? 'new'} expense={existing.data} />;
}

function ExpenseForm({ expense }: { expense?: ExpenseDetailDto }) {
  const c = useColors();
  const ws = useWorkspace();
  const currency = expense?.currency ?? ws.baseCurrency;
  const { tree } = useCategoryLookup();
  const save = useSaveExpense();
  const remove = useDeleteExpense();
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();

  const [amount, setAmount] = useState(expense ? String(fromMinor(expense.amountMinor, currency)) : '');
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [time, setTime] = useState(expense ? (expense.time ?? '') : nowTime());
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(expense?.subcategoryId ?? null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(expense?.paymentMethod ?? null);
  const [merchant, setMerchant] = useState(expense?.merchant ?? '');
  const [note, setNote] = useState(expense?.note ?? '');
  const [location, setLocation] = useState(expense?.location ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [tagsText, setTagsText] = useState(expense?.tags.join(', ') ?? '');
  const [items, setItems] = useState<ItemDraft[]>(
    expense?.items.map((i) => ({
      key: i.id,
      name: i.name,
      quantity: String(i.quantity),
      unitPrice: String(fromMinor(i.unitPriceMinor, currency)),
    })) ?? [],
  );
  const [pending, setPending] = useState<LocalFile[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subcategories = tree.find((x) => x.id === categoryId)?.children ?? [];
  const apiItems = itemsForApi(items, currency);
  const usesItems = apiItems.length > 0;

  async function addFiles(source: 'camera' | 'photos' | 'document') {
    try {
      const files = await pickFiles(source);
      const big = files.filter(tooLarge);
      if (big.length) Alert.alert('File too large', 'Attachments must be 10 MB or smaller.');
      const ok = files.filter((f) => !tooLarge(f));
      if (!ok.length) return;
      if (expense) {
        for (const file of ok) await upload.mutateAsync({ expenseId: expense.id, file });
      } else {
        setPending((p) => [...p, ...ok]);
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmRemoveSaved(a: AttachmentDto) {
    if (!expense) return;
    Alert.alert('Remove attachment?', a.fileName, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeAttachment.mutate({ expenseId: expense.id, id: a.id }) },
    ]);
  }

  async function submit() {
    setLocalError(null);
    const value = Number(amount.replace(',', '.'));
    if (!usesItems && (!Number.isFinite(value) || value <= 0)) return setLocalError('Enter an amount, or add items with prices');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setLocalError('Date must be YYYY-MM-DD');
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setLocalError('Time must be HH:MM (24-hour)');

    setSaving(true);
    try {
      const saved = await save.mutateAsync({
        id: expense?.id,
        input: {
          ...(usesItems ? {} : { amountMinor: toMinor(value, currency) }),
          items: apiItems,
          date,
          time: time || null,
          categoryId,
          subcategoryId,
          paymentMethod: paymentMethod ?? undefined,
          merchant,
          note,
          location,
          description,
          tags: parseTags(tagsText),
        },
      });
      for (const file of pending) await upload.mutateAsync({ expenseId: saved.id, file });
      router.back();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!expense) return;
    Alert.alert('Delete expense?', 'This also deletes its attachments.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(expense.id, { onSuccess: () => router.back() }) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: expense ? 'Edit expense' : 'Add expense' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {usesItems ? (
          <Card>
            <Text style={{ color: c.muted, fontSize: 13 }}>Total (from items)</Text>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: '700' }}>{formatMoney(itemsTotalMinor(apiItems), currency)}</Text>
          </Card>
        ) : (
          <TextField
            label={`Amount (${currency})`}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            autoFocus={!expense}
            style={{ fontSize: 24, fontWeight: '700', height: 60 }}
          />
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 3 }}>
            <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
          </View>
          <View style={{ flex: 2 }}>
            <TextField label="Time (HH:MM)" value={time} onChangeText={setTime} placeholder="18:30" keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Today" selected={date === todayIso()} onPress={() => setDate(todayIso())} />
          <Chip label="Yesterday" selected={date === yesterdayIso()} onPress={() => setDate(yesterdayIso())} />
          <Chip label="Now" selected={false} onPress={() => (setDate(todayIso()), setTime(nowTime()))} />
        </View>

        <Section title="Category">
          {tree.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={categoryId === cat.id}
              onPress={() => {
                setCategoryId(categoryId === cat.id ? null : cat.id);
                setSubcategoryId(null);
              }}
            />
          ))}
        </Section>

        {subcategories.length > 0 && (
          <Section title="Subcategory">
            {subcategories.map((sub) => (
              <Chip
                key={sub.id}
                label={sub.name}
                selected={subcategoryId === sub.id}
                onPress={() => setSubcategoryId(subcategoryId === sub.id ? null : sub.id)}
              />
            ))}
          </Section>
        )}

        <TextField label="Merchant / payee" value={merchant} onChangeText={setMerchant} maxLength={120} placeholder="e.g. Big Bazaar, Uber" />

        <Section title="Paid with">
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} label={paymentLabels[m]} selected={paymentMethod === m} onPress={() => setPaymentMethod(paymentMethod === m ? null : m)} />
          ))}
        </Section>

        <TextField label="Note" value={note} onChangeText={setNote} maxLength={500} placeholder="Short summary" />

        <Block title="Item breakdown" hint="Optional. When you add items, the total is calculated from them.">
          <ItemsEditor items={items} onChange={setItems} currency={currency} />
        </Block>

        <Block title="Bills & files">
          <AttachmentStrip
            workspaceId={ws.id}
            expenseId={expense?.id}
            saved={expense?.attachments ?? []}
            pending={pending}
            onAdd={(s) => void addFiles(s)}
            onRemoveSaved={confirmRemoveSaved}
            onRemovePending={(f) => setPending((p) => p.filter((x) => x !== f))}
          />
          {upload.isPending && <ActivityIndicator color={c.brand} />}
        </Block>

        <TextField label="Location" value={location} onChangeText={setLocation} maxLength={200} placeholder="e.g. Indiranagar, Bengaluru" />
        <TextField label="Tags (comma separated)" value={tagsText} onChangeText={setTagsText} autoCapitalize="none" placeholder="work, trip-goa" />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          multiline
          placeholder="Anything else worth remembering"
          style={{ height: 100, paddingTop: 12, textAlignVertical: 'top' }}
        />

        {expense && (
          <View style={{ gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              Added by {expense.createdBy.displayName ?? 'someone'} · {describeClient(expense.createdClient)} ·{' '}
              {new Date(expense.createdAt).toLocaleString()}
            </Text>
            {expense.updatedBy && (
              <Text style={{ color: c.muted, fontSize: 12 }}>
                Last edited by {expense.updatedBy.displayName ?? 'someone'} · {describeClient(expense.updatedClient)} ·{' '}
                {new Date(expense.updatedAt).toLocaleString()}
              </Text>
            )}
          </View>
        )}

        <ErrorText error={localError ? new Error(localError) : (remove.error ?? removeAttachment.error)} />

        <Button title={expense ? 'Save changes' : 'Add expense'} onPress={() => void submit()} loading={saving} />
        {expense && <Button title="Delete" variant="danger" onPress={confirmDelete} loading={remove.isPending} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ gap: 12 }}>
      <View>
        <Text style={{ color: c.text, fontWeight: '600' }}>{title}</Text>
        {hint && <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{hint}</Text>}
      </View>
      {children}
    </Card>
  );
}
