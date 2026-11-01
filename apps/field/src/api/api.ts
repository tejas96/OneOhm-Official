import { createMobileApi, createTokenStore, resolveApiBaseUrl } from '@oneohm/mobile-ui';
import { QueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';

/** The bearer token in memory; the durable copy is in the secure store. */
let token: string | null = null;
const expiryListeners = new Set<() => void>();

export const tokenStore = createTokenStore('oneohm.field.session');

export function setToken(next: string | null): void {
  token = next;
}

/** The current bearer token, for requests made outside the typed client (uploads). */
export function currentToken(): string | null {
  return token;
}

export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => {
    expiryListeners.delete(listener);
  };
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, !Device.isDevice);

export const api = createMobileApi({
  baseUrl: API_BASE_URL,
  getToken: () => token,
  onUnauthorized: () => {
    if (!token) return;
    token = null;
    for (const listener of expiryListeners) listener();
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

/** Query keys in one place so mutations invalidate the right lists. */
export const keys = {
  me: ['me'] as const,
  tasks: ['tasks', 'mine'] as const,
  task: (id: string) => ['tasks', 'one', id] as const,
  leads: ['leads', 'mine'] as const,
  products: ['catalog', 'products'] as const,
  discoms: ['discoms'] as const,
  workday: ['me', 'workday'] as const,
};
