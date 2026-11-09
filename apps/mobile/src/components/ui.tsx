import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../lib/theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.brand : variant === 'danger' ? c.dangerSoft : c.card;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: c.border, borderWidth: variant === 'secondary' ? 1 : 0 },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }, props.style]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useColors();
  if (!error) return null;
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return <Text style={[styles.error, { color: c.danger, backgroundColor: c.dangerSoft }]}>{msg}</Text>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? c.brand : c.border, backgroundColor: selected ? c.brandSoft : c.card },
      ]}
    >
      <Text style={{ color: selected ? c.brand : c.text, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '500' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  error: { padding: 10, borderRadius: 10, fontSize: 14, overflow: 'hidden' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
