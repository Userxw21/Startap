import * as SecureStore from 'expo-secure-store';
import type { TokenPair } from '@courier/shared-types';

/**
 * Mobile has no httpOnly-cookie option (that's a browser mechanism) — the
 * closest equivalent is the OS-level encrypted keystore SecureStore wraps
 * (Android Keystore / iOS Keychain), which is why tokens live here instead
 * of AsyncStorage (plain, unencrypted) or component state (lost on restart).
 */
const ACCESS_KEY = 'courier.accessToken';
const REFRESH_KEY = 'courier.refreshToken';

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
