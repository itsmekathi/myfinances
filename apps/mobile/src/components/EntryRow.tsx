import { Pressable, Text, View } from 'react-native';
import { ENTRY_KIND_LABELS, formatMoney, type CategoryDto, type EntryDto } from '@myfinances/shared';
import { KIND_SIGN, useColors } from '../lib/theme';
import { formatDay } from '../lib/dates';

/** One income or investment row. */
export function EntryRow({
  entry: e,
  byId,
  onPress,
}: {
  entry: EntryDto;
  byId: Map<string, CategoryDto>;
  onPress?: () => void;
}) {
  const c = useColors();
  const cat = e.categoryId ? byId.get(e.categoryId) : undefined;
  const sub = e.subcategoryId ? byId.get(e.subcategoryId) : undefined;
  const color = sub?.color ?? cat?.color ?? '#64748B';
  const title = e.source || e.note || sub?.name || cat?.name || ENTRY_KIND_LABELS[e.kind].title;
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
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
          {catLabel} · {formatDay(e.date)}
        </Text>
      </View>
      <Text
        style={{
          color: c[e.kind],
          fontSize: 15,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {KIND_SIGN[e.kind]}
        {formatMoney(e.amountMinor, e.currency)}
      </Text>
    </Pressable>
  );
}
