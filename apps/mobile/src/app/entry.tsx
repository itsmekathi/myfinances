import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  describeClient,
  fromMinor,
  toMinor,
  type EntryDto,
  type EntryKind,
} from '@myfinances/shared';
import { useWorkspace } from '../auth/AuthProvider';
import { useCategoryLookup, useDeleteEntry, useEntry, useSaveEntry } from '../hooks/queries';
import { todayIso, yesterdayIso } from '../lib/dates';
import { useColors } from '../lib/theme';
import { Button, Chip, ErrorText, TextField } from '../components/ui';

const parseTags = (s: string) =>
  [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

/**
 * Add or edit an income or investment entry: ?kind=income|investment, plus &id=... to edit,
 * or &copy=... to start from an existing entry (dated today).
 */
export default function EntryScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; copy?: string }>();
  const kind: EntryKind = ENTRY_KINDS.includes(params.kind as EntryKind) ? (params.kind as EntryKind) : 'income';
  const sourceId = params.id ?? params.copy;
  const existing = useEntry(kind, sourceId);
  const c = useColors();

  if (sourceId && !existing.data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        {existing.error ? <ErrorText error={existing.error} /> : <ActivityIndicator color={c.brand} />}
      </View>
    );
  }
  return (
    <EntryForm
      key={`${kind}:${sourceId ?? 'new'}:${params.id ? 'edit' : 'new'}`}
      kind={kind}
      entry={params.id ? existing.data : undefined}
      template={params.copy ? existing.data : undefined}
    />
  );
}

function EntryForm({ kind, entry, template }: { kind: EntryKind; entry?: EntryDto; template?: EntryDto }) {
  const c = useColors();
  const ws = useWorkspace();
  const labels = ENTRY_KIND_LABELS[kind];
  const source = entry ?? template;
  const currency = source?.currency ?? ws.baseCurrency;
  const { tree } = useCategoryLookup(kind);
  const save = useSaveEntry(kind);
  const remove = useDeleteEntry(kind);
  const noun = kind === 'income' ? 'income' : 'investment';

  const [amount, setAmount] = useState(source ? String(fromMinor(source.amountMinor, currency)) : '');
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [categoryId, setCategoryId] = useState<string | null>(source?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(source?.subcategoryId ?? null);
  const [from, setFrom] = useState(source?.source ?? '');
  const [note, setNote] = useState(source?.note ?? '');
  const [tagsText, setTagsText] = useState(source?.tags.join(', ') ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const subcategories = tree.find((x) => x.id === categoryId)?.children ?? [];

  async function submit() {
    setLocalError(null);
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return setLocalError('Enter an amount greater than zero');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setLocalError('Date must be YYYY-MM-DD');
    try {
      await save.mutateAsync({
        id: entry?.id,
        input: {
          amountMinor: toMinor(value, currency),
          currency,
          date,
          categoryId,
          subcategoryId,
          source: from,
          note,
          tags: parseTags(tagsText),
        },
      });
      router.back();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmDelete() {
    if (!entry) return;
    Alert.alert(`Delete ${noun}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(entry.id, { onSuccess: () => router.back() }) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: entry ? `Edit ${noun}` : `Add ${noun}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <TextField
          label={`Amount (${currency})`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          autoFocus={!entry}
          style={{ fontSize: 24, fontWeight: '700', height: 60, color: c[kind] }}
        />

        <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Today" selected={date === todayIso()} onPress={() => setDate(todayIso())} />
          <Chip label="Yesterday" selected={date === yesterdayIso()} onPress={() => setDate(yesterdayIso())} />
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

        <TextField
          label={labels.sourceLabel}
          value={from}
          onChangeText={setFrom}
          maxLength={120}
          placeholder={kind === 'income' ? 'e.g. Acme Corp' : 'e.g. Nifty 50 index fund'}
        />
        <TextField label="Note" value={note} onChangeText={setNote} maxLength={500} placeholder="Short summary" />
        <TextField label="Tags (comma separated)" value={tagsText} onChangeText={setTagsText} autoCapitalize="none" placeholder="bonus, 2026" />

        {entry && (
          <View style={{ gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              Added by {entry.createdBy ? (entry.createdBy.displayName ?? 'someone') : 'a deleted user'} · {describeClient(entry.createdClient)} ·{' '}
              {new Date(entry.createdAt).toLocaleString()}
            </Text>
            {entry.updatedBy && (
              <Text style={{ color: c.muted, fontSize: 12 }}>
                Last edited by {entry.updatedBy.displayName ?? 'someone'} · {describeClient(entry.updatedClient)} ·{' '}
                {new Date(entry.updatedAt).toLocaleString()}
              </Text>
            )}
          </View>
        )}

        <ErrorText error={localError ? new Error(localError) : remove.error} />

        <Button
          title={entry ? 'Save changes' : `Add ${noun}`}
          onPress={() => void submit()}
          loading={save.isPending}
        />
        {entry && (
          <Button
            title="Duplicate"
            variant="secondary"
            onPress={() => router.replace({ pathname: '/entry', params: { kind, copy: entry.id } })}
          />
        )}
        {entry && <Button title="Delete" variant="danger" onPress={confirmDelete} loading={remove.isPending} />}
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
