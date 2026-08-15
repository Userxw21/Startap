import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenPair } from '@courier/shared-types';

/**
 * Mobile has no httpOnly-cookie option (that's a browser mechanism) — the
 * closest equivalent is the OS-level encrypted keystore SecureStore wraps
 * (Android Keystore / iOS Keychain), which is why tokens live here instead
 * of AsyncStorage (plain, unencrypted) or component state (lost on restart).
 *
 * Web is not a real target for this app (couriers use Android/iOS) — the
 * only reason it works at all is to let this run in an ordinary browser for
 * verification in a dev environment with no phone/emulator attached.
 * SecureStore has no web implementation (confirmed by actually running
 * `expo start --web`: it throws "getValueWithKeyAsync is not a function",
 * not a graceful no-op), so this falls back to localStorage on web only —
 * plainly readable by any script on the page, which would be a real problem
 * if this were a real deployment target, but it isn't one.
 */
const ACCESS_KEY = 'courier.accessToken';
const REFRESH_KEY = 'courier.refreshToken';
const isWeb = Platform.OS === 'web';

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await setItem(ACCESS_KEY, tokens.accessToken);
  await setItem(REFRESH_KEY, tokens.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await deleteItem(ACCESS_KEY);
  await deleteItem(REFRESH_KEY);
}
