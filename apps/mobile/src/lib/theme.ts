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
  /** One colour per kind: expenses rose (−), income emerald (+), investments amber (no sign). */
  expense: '#E11D48',
  income: '#059669',
  investment: '#D97706',
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
  expense: '#FB7185',
  income: '#34D399',
  investment: '#FBBF24',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export type MoneyKind = 'expense' | 'income' | 'investment';

/** Sign shown before list amounts: money spent, received, or moved into an investment. */
export const KIND_SIGN: Record<MoneyKind, string> = { expense: '−', income: '+', investment: '' };
