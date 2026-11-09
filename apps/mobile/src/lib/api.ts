import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@myfinances/api-client';

const REFRESH_KEY = 'mf.refreshToken';

type Listener = () => void;
const expiredListeners = new Set<Listener>();

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api',
  clientType: 'mobile',
  loadRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  saveRefreshToken: async (token) => {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  onSessionExpired: () => expiredListeners.forEach((l) => l()),
  // Lets the API record which device an expense was added from.
  extraHeaders: {
    'X-Client-Platform': Platform.OS,
    'X-App-Version': Constants.expoConfig?.version ?? 'dev',
  },
});

export function onSessionExpired(listener: Listener) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}
