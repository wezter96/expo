/**
 * Pure device-linking crypto (no platform imports, so it's Node-testable).
 * Seals a 32-byte secret under a PIN (PBKDF2-stretched) into a compact code.
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { aeadDecrypt, aeadEncrypt, fromB64, randomBytes, toB64, utf8 } from './primitives';

const VERSION = 'K1';
const PBKDF2_ITERS = 150000;

function pinKey(pin: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8.encode(pin.trim()), salt, { c: PBKDF2_ITERS, dkLen: 32 });
}

/** Seal a 32-byte secret under a PIN → transportable code string. */
export function sealSecret(secret: Uint8Array, pin: string): string {
  const salt = randomBytes(16);
  const sealed = aeadEncrypt(pinKey(pin, salt), secret);
  return `${VERSION}.${toB64(salt)}.${toB64(sealed)}`;
}

/** Open a code with its PIN → the 32-byte secret. Throws on bad PIN/data. */
export function openSecret(code: string, pin: string): Uint8Array {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error('That is not a valid Kinly link code.');
  let secret: Uint8Array;
  try {
    secret = aeadDecrypt(pinKey(pin, fromB64(parts[1])), fromB64(parts[2]));
  } catch {
    throw new Error('Wrong PIN — check the 6-digit code and try again.');
  }
  if (secret.length !== 32) throw new Error('That code did not contain a valid key.');
  return secret;
}

/** A random 6-digit PIN (leading zeros kept). */
export function randomPin(): string {
  const n = randomBytes(4).reduce((a, b) => (a * 256 + b) >>> 0, 0) % 1000000;
  return String(n).padStart(6, '0');
}
