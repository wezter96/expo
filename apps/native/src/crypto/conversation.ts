/**
 * Phase 1 key distribution: a per-conversation symmetric key, wrapped
 * individually for each member using a static X25519 DH between the wrapper's
 * identity key and the member's identity key. The server only ever stores the
 * wrapped (encrypted) keys — never the conversation key itself.
 *
 * Also derives the pairwise shared secret used to bootstrap the 1:1 ratchet.
 */
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { aeadDecrypt, aeadEncrypt, concat, dh, kdf, randomBytes } from './primitives';

const MLKEM_CT = ml_kem768.lengths.cipherText; // 1088

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

// --- hybrid (classical + post-quantum) key wrapping ------------------------
//
// Wraps a conversation key so an attacker must break BOTH X25519 *and*
// ML-KEM-768 (a "harvest now, decrypt later" quantum adversary can't read it).
// Output = ML-KEM ciphertext (1088B) || AEAD(convKey). The wrap key mixes the
// classical DH secret and the post-quantum shared secret.

function hybridWrapKey(classicalSecret: Uint8Array, pqSecret: Uint8Array): Uint8Array {
  return kdf(concat(kdf(classicalSecret, 'kinly-hybrid-x25519'), kdf(pqSecret, 'kinly-hybrid-mlkem')), 'kinly-hybrid-wrap');
}

export function wrapKeyHybrid(
  mySecret: Uint8Array,
  recipientIdentityPublic: Uint8Array,
  recipientKemPublic: Uint8Array,
  keyMaterial: Uint8Array
): Uint8Array {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(recipientKemPublic);
  const wrapKey = hybridWrapKey(dh(mySecret, recipientIdentityPublic), sharedSecret);
  return concat(cipherText, aeadEncrypt(wrapKey, keyMaterial));
}

export function unwrapKeyHybrid(
  mySecret: Uint8Array,
  senderIdentityPublic: Uint8Array,
  myKemSecret: Uint8Array,
  data: Uint8Array
): Uint8Array {
  const cipherText = data.subarray(0, MLKEM_CT);
  const sealed = data.subarray(MLKEM_CT);
  const sharedSecret = ml_kem768.decapsulate(cipherText, myKemSecret);
  const wrapKey = hybridWrapKey(dh(mySecret, senderIdentityPublic), sharedSecret);
  return aeadDecrypt(wrapKey, sealed);
}

/** Deterministic ML-KEM-768 keypair from a 64-byte seed (derived from identity). */
export function kemKeypairFromSeed(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return ml_kem768.keygen(seed);
}
