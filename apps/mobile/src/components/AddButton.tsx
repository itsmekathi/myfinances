import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../lib/theme';

export function AddButton() {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push('/expense')}
      accessibilityLabel="Add expense"
      style={({ pressed }) => ({
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: c.brand,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      })}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </Pressable>
  );
}
