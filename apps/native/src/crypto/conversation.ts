/**
 * Phase 1 key distribution: a per-conversation symmetric key, wrapped
 * individually for each member using a static X25519 DH between the wrapper's
 * identity key and the member's identity key. The server only ever stores the
 * wrapped (encrypted) keys — never the conversation key itself.
 *
 * Also derives the pairwise shared secret used to bootstrap the 1:1 ratchet.
 */
import { aeadDecrypt, aeadEncrypt, dh, kdf, randomBytes } from './primitives';

/** A fresh 32-byte symmetric key for a conversation. */
export function newConversationKey(): Uint8Array {
  return randomBytes(32);
}

/** Encrypt `keyMaterial` so only the holder of `recipientPublic` can open it. */
export function wrapKey(mySecret: Uint8Array, recipientPublic: Uint8Array, keyMaterial: Uint8Array): Uint8Array {
  const wrappingKey = kdf(dh(mySecret, recipientPublic), 'kinly-key-wrap');
  return aeadEncrypt(wrappingKey, keyMaterial);
}

/** Reverse of wrapKey (needs the wrapper's identity public key). */
export function unwrapKey(mySecret: Uint8Array, senderPublic: Uint8Array, sealed: Uint8Array): Uint8Array {
  const wrappingKey = kdf(dh(mySecret, senderPublic), 'kinly-key-wrap');
  return aeadDecrypt(wrappingKey, sealed);
}

/**
 * Pairwise shared secret for bootstrapping the 1:1 Double Ratchet. Symmetric:
 * both sides compute the same value from their own identity secret + the
 * other's identity public. (X3DH-lite — see ratchet.ts caveat.)
 */
export function deriveSharedSecret(myIdentitySecret: Uint8Array, peerIdentityPublic: Uint8Array): Uint8Array {
  return kdf(dh(myIdentitySecret, peerIdentityPublic), 'kinly-x3dh');
}
