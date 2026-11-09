import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCategories, useExpenses } from '../../hooks/queries';
import { currentMonth, monthRange } from '../../lib/dates';
import { useColors } from '../../lib/theme';
import { Button, Chip } from '../../components/ui';
import { MonthPicker } from '../../components/MonthPicker';
import { ExpenseRow } from '../../components/ExpenseRow';
import { AddButton } from '../../components/AddButton';

const PAGE_SIZE = 50;

export default function ExpensesScreen() {
  const c = useColors();
  const [month, setMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { from, to } = monthRange(month);
  const expenses = useExpenses({ from, to, categoryId, page, pageSize: PAGE_SIZE });
  const { data: categories = [] } = useCategories();
  const catById = useMemo(() => new Map(categories.map((x) => [x.id, x])), [categories]);
  const totalPages = expenses.data ? Math.max(1, Math.ceil(expenses.data.total / PAGE_SIZE)) : 1;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>Expenses</Text>
        <MonthPicker value={month} onChange={(m) => { setMonth(m); setPage(1); }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={!categoryId} onPress={() => { setCategoryId(undefined); setPage(1); }} />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={categoryId === cat.id}
              onPress={() => { setCategoryId(cat.id); setPage(1); }}
            />
          ))}
        </ScrollView>
      </View>

      {expenses.isLoading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={expenses.data?.items ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
          refreshing={expenses.isRefetching}
          onRefresh={() => void expenses.refetch()}
          ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', marginTop: 48 }}>No expenses for this period.</Text>}
          renderItem={({ item }) => (
            <ExpenseRow
              expense={item}
              byId={catById}
              onPress={() => router.push({ pathname: '/expense', params: { id: item.id } })}
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
      <AddButton />
    </SafeAreaView>
  );
}
