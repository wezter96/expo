/**
 * End-to-end encryption orchestration used by the PocketBase layer.
 *
 * Phase 1 model (live): every conversation has one symmetric key. It is wrapped
 * (encrypted) separately for each member with that member's published identity
 * key and stored server-side in `conversation_keys` — the server only ever sees
 * the wrapped blobs. Messages are sealed with the conversation key.
 *
 * The verified Double Ratchet + sender keys (src/crypto) are ready to upgrade
 * this to per-message forward secrecy once the session handshake is designed
 * and tested; see E2EE.md.
 *
 * ⚠️ Not professionally audited. Keep this module free of server imports so it
 * stays cycle-free and testable.
 */
import { newConversationKey, unwrapKey, wrapKey } from './crypto/conversation';
import { e2eeSupported, getIdentity, publicBundle } from './crypto/identity';
import { decodePayload, encodePayload, type MessagePayload } from './crypto/messages';
import { aeadDecrypt, aeadEncrypt, fromB64, toB64 } from './crypto/primitives';

export { e2eeSupported };
export { decryptRemoteToLocal, encryptFileToTemp } from './crypto/media-io';
export type { MessagePayload };

/** Public keys to publish to the server (null on web / unsupported). */
export async function e2eePublicBundle(): Promise<{ identity: string; prekey: string } | null> {
  if (!e2eeSupported) return null;
  return publicBundle();
}

/** A fresh conversation key (raw bytes; kept only in memory + wrapped at rest). */
export function newConvKey(): Uint8Array {
  return newConversationKey();
}

/** Wrap a conversation key for a member, given their base64 identity public key. */
export async function wrapConvKeyFor(memberIdentityB64: string, convKey: Uint8Array): Promise<string> {
  const me = await getIdentity();
  return toB64(wrapKey(me.secretKey, fromB64(memberIdentityB64), convKey));
}

/** Unwrap a conversation key wrapped for me by `wrappedByIdentityB64`. */
export async function unwrapConvKey(wrappedB64: string, wrappedByIdentityB64: string): Promise<Uint8Array> {
  const me = await getIdentity();
  return unwrapKey(me.secretKey, fromB64(wrappedByIdentityB64), fromB64(wrappedB64));
}

/** Seal a message payload with a conversation key → base64 ciphertext. */
export function sealPayload(convKey: Uint8Array, payload: MessagePayload): string {
  return toB64(aeadEncrypt(convKey, encodePayload(payload)));
}

/** Open a sealed payload. Throws if the key is wrong or data is tampered. */
export function openPayload(convKey: Uint8Array, cipherB64: string): MessagePayload {
  return decodePayload(aeadDecrypt(convKey, fromB64(cipherB64)));
}
