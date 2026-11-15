import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../lib/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarActiveTintColor: c.expense, tabBarIcon: ({ color, size }) => <Ionicons name="receipt" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="income"
        options={{ title: 'Income', tabBarActiveTintColor: c.income, tabBarIcon: ({ color, size }) => <Ionicons name="cash" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="investments"
        options={{ title: 'Invest', tabBarActiveTintColor: c.investment, tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
