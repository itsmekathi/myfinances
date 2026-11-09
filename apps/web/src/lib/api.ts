import { createApiClient } from '@myfinances/api-client';

type Listener = () => void;
const expiredListeners = new Set<Listener>();

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  clientType: 'web',
  onSessionExpired: () => expiredListeners.forEach((l) => l()),
});

export function onSessionExpired(listener: Listener) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}
