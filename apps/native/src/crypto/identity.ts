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
import { kemKeypairFromSeed } from './conversation';
import { fromB64, generateKeyPair, kdf, type KeyPair, publicKeyOf, toB64 } from './primitives';
import { secureDelete, secureGet, secureSet, secureStorageAvailable } from './secure-store';

const ID_KEY = 'kinly_e2ee_identity_v1';
const PREKEY_KEY = 'kinly_e2ee_prekey_v1';

/** E2EE needs OS secure storage — native or the Electron desktop app, not a bare browser. */
export const e2eeSupported = secureStorageAvailable;

async function loadKeyPair(name: string): Promise<KeyPair | null> {
  const b = await secureGet(name);
  if (!b) return null;
  const secretKey = fromB64(b);
  return { secretKey, publicKey: publicKeyOf(secretKey) };
}

async function saveSecret(name: string, secretKey: Uint8Array): Promise<void> {
  await secureSet(name, toB64(secretKey));
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

/** The post-quantum (ML-KEM-768) keypair, derived deterministically from the
 *  identity key — so restoring the identity restores this too. */
export async function getKemKeypair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
  const id = await getIdentity();
  return kemKeypairFromSeed(kdf(id.secretKey, 'kinly-kem-seed', 64));
}

/** Public keys to publish to the server (base64): classical + post-quantum. */
export async function publicBundle(): Promise<{ identity: string; prekey: string; kem: string }> {
  const [id, pre, kem] = await Promise.all([getIdentity(), getPrekey(), getKemKeypair()]);
  return { identity: toB64(id.publicKey), prekey: toB64(pre.publicKey), kem: toB64(kem.publicKey) };
}

/** 24-word recovery phrase encoding the identity key. Show once, store safely. */
export async function recoveryPhrase(): Promise<string> {
  const id = await getIdentity();
  return entropyToMnemonic(id.secretKey, wordlist);
}

/** Import a raw 32-byte identity secret (used by QR device linking). */
export async function importIdentitySecret(secretKey: Uint8Array): Promise<void> {
  if (secretKey.length !== 32) throw new Error('Invalid key length.');
  await saveSecret(ID_KEY, secretKey);
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
  await secureDelete(ID_KEY).catch(() => {});
  await secureDelete(PREKEY_KEY).catch(() => {});
}
