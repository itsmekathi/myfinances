import { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ENTRY_KIND_LABELS, formatMoney, type EntryKind } from '@myfinances/shared';
import { useWorkspace } from '../auth/AuthProvider';
import { useCategoryLookup, useEntries, useSummary } from '../hooks/queries';
import { currentMonth, monthRange } from '../lib/dates';
import { useColors } from '../lib/theme';
import { Button, Chip } from './ui';
import { MonthPicker } from './MonthPicker';
import { EntryRow } from './EntryRow';
import { AddButton } from './AddButton';

const PAGE_SIZE = 50;

/** The Income and Invest tabs. */
export function EntriesScreen({ kind }: { kind: EntryKind }) {
  const c = useColors();
  const ws = useWorkspace();
  const labels = ENTRY_KIND_LABELS[kind];
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { from, to } = monthRange(month);
  const entries = useEntries(kind, { from, to, categoryId, page, pageSize: PAGE_SIZE });
  const summary = useSummary(from, to);
  const { tree, byId } = useCategoryLookup(kind);
  const totalPages = entries.data ? Math.max(1, Math.ceil(entries.data.total / PAGE_SIZE)) : 1;
  const monthTotal = summary.data ? (kind === 'income' ? summary.data.incomeMinor : summary.data.investedMinor) : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 16, gap: 12 }}>
        <View>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{labels.title}</Text>
          {monthTotal !== null && (
            <Text style={{ color: c.muted, fontSize: 13 }}>
              <Text style={{ color: c[kind], fontWeight: '600' }}>{formatMoney(monthTotal, ws.baseCurrency)}</Text>{' '}
              {kind === 'income' ? 'received' : 'invested'} this month
            </Text>
          )}
        </View>
        <MonthPicker value={month} onChange={(m) => { setMonth(m); setPage(1); }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={!categoryId} onPress={() => { setCategoryId(undefined); setPage(1); }} />
          {tree.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={categoryId === cat.id}
              onPress={() => { setCategoryId(cat.id); setPage(1); }}
            />
          ))}
        </ScrollView>
      </View>

      {entries.isLoading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={entries.data?.items ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
          refreshing={entries.isRefetching}
          onRefresh={() => void entries.refetch()}
          ListEmptyComponent={
            <Text style={{ color: c.muted, textAlign: 'center', marginTop: 48 }}>
              No {labels.singular} recorded for this period.
            </Text>
          }
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              byId={byId}
              onPress={() => router.push({ pathname: '/entry', params: { kind, id: item.id } })}
            />
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center' }}>
                <Button title="Prev" variant="secondary" disabled={page <= 1} onPress={() => setPage(page - 1)} style={{ flex: 1 }} />
                <Text style={{ color: c.muted }}>{page} / {totalPages}</Text>
                <Button title="Next" variant="secondary" disabled={page >= totalPages} onPress={() => setPage(page + 1)} style={{ flex: 1 }} />
              </View>
            ) : undefined
          }
        />
      )}
      <AddButton
        href={{ pathname: '/entry', params: { kind } }}
        label={kind === 'income' ? 'Add income' : 'Add investment'}
      />
    </SafeAreaView>
  );
}
