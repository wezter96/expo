/**
 * Secure key storage adapter. Resolves to the right backend per platform:
 *  - native (iOS/Android): expo-secure-store (Keychain / Keystore)
 *  - desktop (Electron): the `window.kinlySecureStore` bridge (safeStorage)
 *  - plain web browser: unavailable → E2EE is disabled there
 *
 * This is what lets the *same* web bundle be E2EE-capable inside the Electron
 * desktop app but not in a bare browser tab.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type DesktopBridge = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
  available: boolean;
};

const desktop: DesktopBridge | undefined = (globalThis as { kinlySecureStore?: DesktopBridge }).kinlySecureStore;
const isNative = Platform.OS !== 'web';

/** True when a real OS-backed secure store exists (native or desktop). */
export const secureStorageAvailable = isNative || !!desktop?.available;

export async function secureGet(key: string): Promise<string | null> {
  if (isNative) return SecureStore.getItemAsync(key);
  if (desktop) return desktop.getItem(key);
  return null;
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return;
  }
  if (desktop) return desktop.setItem(key, value);
  throw new Error('Secure storage is not available on this platform.');
}

export async function secureDelete(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  if (desktop) return desktop.deleteItem(key);
}
