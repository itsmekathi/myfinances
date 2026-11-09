import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, itemAmountMinor, toMinor } from '@myfinances/shared';
import { useColors } from '../lib/theme';

export interface ItemDraft {
  key: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

let seq = 0;
export const newItem = (): ItemDraft => ({ key: `n${Date.now()}-${seq++}`, name: '', quantity: '1', unitPrice: '' });

const num = (v: string) => Number(v.replace(',', '.'));

export function itemsForApi(items: ItemDraft[], currency: string) {
  return items
    .filter((i) => i.name.trim() && i.unitPrice !== '' && num(i.unitPrice) >= 0)
    .map((i) => ({
      name: i.name.trim(),
      quantity: num(i.quantity) > 0 ? num(i.quantity) : 1,
      unitPriceMinor: toMinor(num(i.unitPrice) || 0, currency),
    }));
}

export function ItemsEditor({
  items,
  onChange,
  currency,
}: {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  currency: string;
}) {
  const c = useColors();
  const update = (key: string, patch: Partial<ItemDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const total = itemsForApi(items, currency).reduce((s, i) => s + itemAmountMinor(i), 0);
  const input = {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 15,
  } as const;

  return (
    <View style={{ gap: 10 }}>
      {items.map((item) => (
        <View key={item.key} style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[input, { flex: 1 }]}
              placeholder="Item name"
              placeholderTextColor={c.muted}
              value={item.name}
              onChangeText={(name) => update(item.key, { name })}
              maxLength={120}
            />
            <Pressable onPress={() => onChange(items.filter((i) => i.key !== item.key))} hitSlop={8} accessibilityLabel="Remove item">
              <Ionicons name="trash-outline" size={20} color={c.danger} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[input, { width: 70 }]}
              keyboardType="decimal-pad"
              value={item.quantity}
              onChangeText={(quantity) => update(item.key, { quantity })}
              accessibilityLabel="Quantity"
            />
            <Text style={{ color: c.muted }}>×</Text>
            <TextInput
              style={[input, { flex: 1 }]}
              keyboardType="decimal-pad"
              placeholder="Unit price"
              placeholderTextColor={c.muted}
              value={item.unitPrice}
              onChangeText={(unitPrice) => update(item.key, { unitPrice })}
            />
            <Text style={{ color: c.text, fontWeight: '600', minWidth: 80, textAlign: 'right' }}>
              {formatMoney(
                itemAmountMinor({
                  quantity: num(item.quantity) > 0 ? num(item.quantity) : 1,
                  unitPriceMinor: item.unitPrice ? toMinor(num(item.unitPrice) || 0, currency) : 0,
                }),
                currency,
              )}
            </Text>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => onChange([...items, newItem()])} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="add-circle-outline" size={20} color={c.brand} />
          <Text style={{ color: c.brand, fontWeight: '600' }}>{items.length ? 'Add item' : 'Add item breakdown'}</Text>
        </Pressable>
        {items.length > 0 && (
          <Text style={{ color: c.text, fontWeight: '700' }}>Total {formatMoney(total, currency)}</Text>
        )}
      </View>
    </View>
  );
}
