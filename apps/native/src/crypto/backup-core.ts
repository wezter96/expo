/**
 * Pure chat-backup crypto (no platform imports, so it's Node-testable).
 * Seals a JSON snapshot under a passphrase: PBKDF2-SHA256 (150k) stretches
 * the passphrase with a random salt, XChaCha20-Poly1305 seals the bytes.
 * Format: "KINLYBACKUP1.<salt b64>.<box b64>".
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { aeadDecrypt, aeadEncrypt, fromB64, randomBytes, toB64, utf8 } from './primitives';

const MAGIC = 'KINLYBACKUP1';
const PBKDF2_ITERS = 150_000;

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8.encode(passphrase.trim()), salt, { c: PBKDF2_ITERS, dkLen: 32 });
}

export function sealBackup(json: string, passphrase: string): string {
  const salt = randomBytes(16);
  const box = aeadEncrypt(deriveKey(passphrase, salt), utf8.encode(json));
  return `${MAGIC}.${toB64(salt)}.${toB64(box)}`;
}

/** Throws on a wrong passphrase or a non-backup/tampered file. */
export function openBackup(blob: string, passphrase: string): string {
  const parts = blob.trim().split('.');
  if (parts.length !== 3 || parts[0] !== MAGIC) throw new Error('Not a Kinly backup file.');
  const salt = fromB64(parts[1]);
  return utf8.decode(aeadDecrypt(deriveKey(passphrase, salt), fromB64(parts[2])));
}
