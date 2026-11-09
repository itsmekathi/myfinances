import { useColorScheme } from 'react-native';

const light = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  brand: '#4F46E5',
  brandSoft: '#EEF2FF',
  danger: '#E11D48',
  dangerSoft: '#FFF1F2',
};

const dark: typeof light = {
  bg: '#020617',
  card: '#0F172A',
  text: '#F1F5F9',
  muted: '#94A3B8',
  border: '#1E293B',
  brand: '#818CF8',
  brandSoft: '#1E1B4B',
  danger: '#FB7185',
  dangerSoft: '#4C0519',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
