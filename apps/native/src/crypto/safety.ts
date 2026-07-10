/**
 * Safety numbers (contact verification). Two people compare a 60-digit number
 * derived from both their identity keys; if it matches on both devices, no one
 * is intercepting them. Symmetric — both sides compute the same number.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { concat } from './primitives';

function byteCompare(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** 30 digits derived from one identity key (iterated hash → grouped digits). */
function fingerprint(pub: Uint8Array): string {
  let h = sha256(pub);
  for (let i = 0; i < 1024; i++) h = sha256(concat(h, pub));
  let digits = '';
  for (let i = 0; i < 6; i++) {
    const n = ((h[i * 4] << 24) | (h[i * 4 + 1] << 16) | (h[i * 4 + 2] << 8) | h[i * 4 + 3]) >>> 0;
    digits += String(n % 100000).padStart(5, '0');
  }
  return digits; // 30 digits
}

/** The shared 60-digit safety number for two identity public keys, grouped by 5. */
export function safetyNumber(idA: Uint8Array, idB: Uint8Array): string {
  const [x, y] = byteCompare(idA, idB) <= 0 ? [idA, idB] : [idB, idA];
  const digits = fingerprint(x) + fingerprint(y);
  return (digits.match(/.{1,5}/g) as string[]).join(' ');
}
