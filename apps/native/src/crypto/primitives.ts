/**
 * Low-level crypto primitives for Kinly's end-to-end encryption.
 *
 * Pure JavaScript (audited @noble libraries) so it runs identically on device,
 * web, and in Node (which lets us unit-test it — see crypto round-trip tests).
 * This module has NO React Native imports on purpose; the only platform bit is
 * the CSPRNG, which prefers the global WebCrypto and falls back to Expo's
 * native RNG on a device that lacks it.
 *
 * ⚠️ This code has not had a professional cryptography audit. See E2EE.md.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Cryptographically-secure random bytes (WebCrypto, or Expo's native RNG). */
export function randomBytes(n: number): Uint8Array {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g && typeof g.getRandomValues === 'function') {
    return g.getRandomValues(new Uint8Array(n));
  }
  // React Native without a WebCrypto polyfill: Expo's native CSPRNG.
  // Lazy require so this file stays importable in plain Node for tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExpoCrypto = require('expo-crypto');
  return ExpoCrypto.getRandomBytes(n) as Uint8Array;
}

/** A fresh X25519 keypair. */
export function generateKeyPair(): KeyPair {
  const secretKey = randomBytes(32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function publicKeyOf(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

/** X25519 Diffie–Hellman shared secret. */
export function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, publicKey);
}

/** HKDF-SHA256. */
export function kdf(ikm: Uint8Array, info: string, length = 32, salt: Uint8Array = new Uint8Array(32)): Uint8Array {
  return hkdf(sha256, ikm, salt, enc.encode(info), length);
}

/** HMAC-SHA256 (used by the ratchet chain KDF). */
export function mac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

/**
 * Authenticated encryption (XChaCha20-Poly1305). A random 24-byte nonce is
 * generated and prepended to the ciphertext. `aad` is authenticated but not
 * encrypted.
 */
export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return out;
}

export function aeadDecrypt(key: Uint8Array, data: Uint8Array, aad?: Uint8Array): Uint8Array {
  const nonce = data.subarray(0, 24);
  const ct = data.subarray(24);
  return xchacha20poly1305(key, nonce, aad).decrypt(ct);
}

// --- encoding helpers (no Buffer / btoa dependency, so they work everywhere) -

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toB64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const b0 = bytes[i];
    out += B64[b0 >> 2] + B64[(b0 & 3) << 4] + '==';
  } else if (rem === 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] + B64[(b1 & 15) << 2] + '=';
  }
  return out;
}

export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out: number[] = [];
  for (let i = 0; i < len; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < len ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < len ? B64.indexOf(clean[i + 3]) : 0);
    out.push((n >> 16) & 255);
    if (i + 2 < len) out.push((n >> 8) & 255);
    if (i + 3 < len) out.push(n & 255);
  }
  return new Uint8Array(out);
}

export const utf8 = {
  encode: (s: string): Uint8Array => enc.encode(s),
  decode: (b: Uint8Array): string => dec.decode(b),
};

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
