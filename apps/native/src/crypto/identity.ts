/**
 * Identity & prekey management. The identity secret key never leaves the device
 * — it lives in the OS secure enclave (iOS Keychain / Android Keystore) via
 * expo-secure-store. The 24-word recovery phrase encodes that same key so the
 * user can restore it on a new device.
 *
 * E2EE requires secure storage, so it is unavailable on web.
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { fromB64, generateKeyPair, type KeyPair, publicKeyOf, toB64 } from './primitives';

const ID_KEY = 'kinly_e2ee_identity_v1';
const PREKEY_KEY = 'kinly_e2ee_prekey_v1';

/** E2EE needs device secure storage; not available on web. */
export const e2eeSupported = Platform.OS !== 'web';

async function loadKeyPair(name: string): Promise<KeyPair | null> {
  const b = await SecureStore.getItemAsync(name);
  if (!b) return null;
  const secretKey = fromB64(b);
  return { secretKey, publicKey: publicKeyOf(secretKey) };
}

async function saveSecret(name: string, secretKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(name, toB64(secretKey), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** The device's long-term identity keypair (created on first use). */
export async function getIdentity(): Promise<KeyPair> {
  const existing = await loadKeyPair(ID_KEY);
  if (existing) return existing;
  const kp = generateKeyPair();
  await saveSecret(ID_KEY, kp.secretKey);
  return kp;
}

/** The device's initial ratchet prekey (published so peers can start a session). */
export async function getPrekey(): Promise<KeyPair> {
  const existing = await loadKeyPair(PREKEY_KEY);
  if (existing) return existing;
  const kp = generateKeyPair();
  await saveSecret(PREKEY_KEY, kp.secretKey);
  return kp;
}

/** Public keys to publish to the server (base64). */
export async function publicBundle(): Promise<{ identity: string; prekey: string }> {
  const [id, pre] = await Promise.all([getIdentity(), getPrekey()]);
  return { identity: toB64(id.publicKey), prekey: toB64(pre.publicKey) };
}

/** 24-word recovery phrase encoding the identity key. Show once, store safely. */
export async function recoveryPhrase(): Promise<string> {
  const id = await getIdentity();
  return entropyToMnemonic(id.secretKey, wordlist);
}

/** Restore an identity from its recovery phrase (e.g. on a new device). */
export async function restoreFromPhrase(phrase: string): Promise<void> {
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(clean, wordlist)) throw new Error('That recovery phrase is not valid.');
  const entropy = mnemonicToEntropy(clean, wordlist);
  await saveSecret(ID_KEY, entropy);
}

/** Forget all keys (e.g. sign-out on a shared device). History becomes unreadable. */
export async function resetIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(ID_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(PREKEY_KEY).catch(() => {});
}
