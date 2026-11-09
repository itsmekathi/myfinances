import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currentMonth, monthLabel, shiftMonth } from '../lib/dates';
import { useColors } from '../lib/theme';

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const c = useColors();
  const atCurrent = value >= currentMonth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable onPress={() => onChange(shiftMonth(value, -1))} hitSlop={12} accessibilityLabel="Previous month">
        <Ionicons name="chevron-back" size={22} color={c.text} />
      </Pressable>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{monthLabel(value)}</Text>
      <Pressable
        onPress={() => onChange(shiftMonth(value, 1))}
        disabled={atCurrent}
        hitSlop={12}
        accessibilityLabel="Next month"
      >
        <Ionicons name="chevron-forward" size={22} color={atCurrent ? c.border : c.text} />
      </Pressable>
    </View>
  );
}
