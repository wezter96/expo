/**
 * Message payload format + media encryption. The *payload* (below) is what gets
 * encrypted by the ratchet / sender-key / conversation key. Media files are
 * encrypted separately with a random per-file key that travels inside the
 * payload, so the server stores only opaque blobs.
 */
import { aeadDecrypt, aeadEncrypt, randomBytes, utf8 } from './primitives';

export type MediaRef = { key: string; kind: 'photo' | 'voice'; duration?: number };
/** The plaintext of a message before it's encrypted. */
export type MessagePayload = { t: string; m?: MediaRef };

export function encodePayload(p: MessagePayload): Uint8Array {
  return utf8.encode(JSON.stringify(p));
}

export function decodePayload(bytes: Uint8Array): MessagePayload {
  return JSON.parse(utf8.decode(bytes)) as MessagePayload;
}

/** Random symmetric key for a single media file. */
export function newMediaKey(): Uint8Array {
  return randomBytes(32);
}

export function encryptMedia(key: Uint8Array, bytes: Uint8Array): Uint8Array {
  return aeadEncrypt(key, bytes);
}

export function decryptMedia(key: Uint8Array, sealed: Uint8Array): Uint8Array {
  return aeadDecrypt(key, sealed);
}
