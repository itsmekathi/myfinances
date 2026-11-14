import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@myfinances/shared';
import { useAuth, useWorkspace } from '../../auth/AuthProvider';
import { useCategories, useExpenses, useSummary } from '../../hooks/queries';
import { currentMonth, monthRange, todayIso } from '../../lib/dates';
import { useColors } from '../../lib/theme';
import { Card } from '../../components/ui';
import { MonthPicker } from '../../components/MonthPicker';
import { AddButton } from '../../components/AddButton';
import { ExpenseRow } from '../../components/ExpenseRow';

export default function DashboardScreen() {
  const c = useColors();
  const ws = useWorkspace();
  const { user, logout } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const { from, to, days } = monthRange(month);
  const summary = useSummary(from, to);
  const recent = useExpenses({ from, to, pageSize: 5 });
  const { data: categories = [] } = useCategories();
  const catById = useMemo(() => new Map(categories.map((x) => [x.id, x])), [categories]);

  const s = summary.data;
  const money = (m: number) => formatMoney(m, ws.baseCurrency);
  const elapsed = month === currentMonth() ? Number(todayIso().slice(8, 10)) : days;
  const maxDay = s ? Math.max(1, ...s.byDay.map((d) => d.totalMinor)) : 1;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={summary.isRefetching} onRefresh={() => { void summary.refetch(); void recent.refetch(); }} />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: c.muted, fontSize: 13 }}>Hello,</Text>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{user?.displayName ?? 'there'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => router.push('/account')} hitSlop={12} accessibilityLabel="Account">
              <Ionicons name="person-circle-outline" size={24} color={c.muted} />
            </Pressable>
            <Pressable onPress={() => void logout()} hitSlop={12} accessibilityLabel="Sign out">
              <Ionicons name="log-out-outline" size={24} color={c.muted} />
            </Pressable>
          </View>
        </View>

        <MonthPicker value={month} onChange={setMonth} />

        {!s ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 48 }} />
        ) : (
          <>
            <View style={{ backgroundColor: c.brand, borderRadius: 20, padding: 20, gap: 4 }}>
              <Text style={{ color: '#E0E7FF', fontSize: 13 }}>Total spent</Text>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{money(s.totalMinor)}</Text>
              <Text style={{ color: '#E0E7FF', fontSize: 13 }}>
                {s.count} expenses · {money(Math.round(s.totalMinor / Math.max(1, elapsed)))}/day
              </Text>
            </View>

            <Card>
              <Text style={{ color: c.text, fontWeight: '600', marginBottom: 12 }}>Daily spending</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2 }}>
                {s.byDay.map((d) => (
                  <View
                    key={d.date}
                    style={{
                      flex: 1,
                      height: `${Math.max(2, (d.totalMinor / maxDay) * 100)}%`,
                      borderRadius: 3,
                      backgroundColor: d.totalMinor ? c.brand : c.border,
                    }}
                  />
                ))}
              </View>
            </Card>

            <Card style={{ gap: 12 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>By category</Text>
              {s.byCategory.length === 0 && <Text style={{ color: c.muted }}>Nothing to show yet.</Text>}
              {s.byCategory.slice(0, 6).map((cat) => {
                const pct = s.totalMinor ? cat.totalMinor / s.totalMinor : 0;
                return (
                  <View key={cat.categoryId ?? 'none'} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: c.text, fontSize: 14 }}>{cat.name}</Text>
                      <Text style={{ color: c.muted, fontSize: 14 }}>
                        {money(cat.totalMinor)} · {Math.round(pct * 100)}%
                      </Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}>
                      <View
                        style={{ height: 8, borderRadius: 4, width: `${pct * 100}%`, backgroundColor: cat.color ?? c.muted }}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>

            <Card>
              <Text style={{ color: c.text, fontWeight: '600' }}>Recent</Text>
              {recent.data?.items.length ? (
                recent.data.items.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    byId={catById}
                    onPress={() => router.push({ pathname: '/expense', params: { id: e.id } })}
                  />
                ))
              ) : (
                <Text style={{ color: c.muted, marginTop: 8 }}>No expenses this month yet.</Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <AddButton />
    </SafeAreaView>
  );
}
