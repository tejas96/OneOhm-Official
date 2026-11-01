import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The bearer token lives in the device keychain / keystore. The web preview has no
 * secure store, so it falls back to the browser's storage (development only).
 */
export function createTokenStore(key: string) {
  const web = Platform.OS === 'web';
  return {
    async read(): Promise<string | null> {
      try {
        if (web) return globalThis.localStorage?.getItem(key) ?? null;
        return await SecureStore.getItemAsync(key);
      } catch {
        return null;
      }
    },
    async write(token: string): Promise<void> {
      if (web) {
        globalThis.localStorage?.setItem(key, token);
        return;
      }
      await SecureStore.setItemAsync(key, token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    },
    async clear(): Promise<void> {
      try {
        if (web) globalThis.localStorage?.removeItem(key);
        else await SecureStore.deleteItemAsync(key);
      } catch {
        // Nothing stored: already signed out.
      }
    },
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;

/**
 * `EXPO_PUBLIC_API_URL` is inlined at build time. On the Android emulator the host
 * machine is 10.0.2.2, so loopback addresses are rewritten there.
 */
export function resolveApiBaseUrl(configured: string | undefined, onEmulator: boolean): string {
  const base = (configured?.trim() || 'http://localhost:4200').replace(/\/+$/, '');
  if (Platform.OS === 'android' && onEmulator) {
    return base.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, '//10.0.2.2');
  }
  return base;
}
