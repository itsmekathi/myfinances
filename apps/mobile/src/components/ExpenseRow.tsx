import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, type CategoryDto, type ExpenseDto } from '@myfinances/shared';
import { useColors } from '../lib/theme';
import { formatDay } from '../lib/dates';

export function ExpenseRow({
  expense: e,
  byId,
  onPress,
}: {
  expense: ExpenseDto;
  byId: Map<string, CategoryDto>;
  onPress?: () => void;
}) {
  const c = useColors();
  const cat = e.categoryId ? byId.get(e.categoryId) : undefined;
  const sub = e.subcategoryId ? byId.get(e.subcategoryId) : undefined;
  const color = sub?.color ?? cat?.color ?? '#64748B';
  const title = e.merchant || e.note || sub?.name || cat?.name || 'Expense';
  const catLabel = cat ? (sub ? `${cat.name} › ${sub.name}` : cat.name) : 'Uncategorized';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${color}22`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color, fontWeight: '700', fontSize: 16 }}>{(cat?.name ?? '?').slice(0, 1)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '500' }}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, flexShrink: 1 }}>
            {catLabel} · {formatDay(e.date)}
            {e.time ? ` ${e.time}` : ''}
          </Text>
          {e.itemCount > 0 && <Ionicons name="list" size={12} color={c.muted} />}
          {e.attachmentCount > 0 && <Ionicons name="attach" size={13} color={c.muted} />}
        </View>
      </View>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {formatMoney(e.amountMinor, e.currency)}
      </Text>
    </Pressable>
  );
}
