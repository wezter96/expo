/**
 * Double Ratchet (Signal spec) for 1:1 forward secrecy + post-compromise
 * security. Pure and serializable so a session can be persisted between app
 * launches. Bootstrapped from a shared secret (see session.ts / X3DH-lite).
 *
 * ⚠️ Not professionally audited. See E2EE.md. Known simplification: the initial
 * shared secret is a single static DH (not full X3DH with a one-time prekey),
 * so it lacks X3DH's ephemeral-key deniability/PCS on the very first message;
 * every message after the first ratchet step gets the full guarantees.
 */
import { aeadDecrypt, aeadEncrypt, concat, dh, generateKeyPair, kdf, mac, type KeyPair } from './primitives';

const MAX_SKIP = 256; // bound skipped-key computation (anti-DoS)

export type RatchetState = {
  DHs: KeyPair;
  DHr: Uint8Array | null;
  RK: Uint8Array;
  CKs: Uint8Array | null;
  CKr: Uint8Array | null;
  Ns: number;
  Nr: number;
  PN: number;
  // "b64(dhPub)|n" -> message key
  skipped: Record<string, Uint8Array>;
};

export type RatchetHeader = { dh: Uint8Array; pn: number; n: number };
export type RatchetMessage = { header: RatchetHeader; body: Uint8Array };

// --- KDFs ------------------------------------------------------------------

function kdfRK(rk: Uint8Array, dhOut: Uint8Array): { rk: Uint8Array; ck: Uint8Array } {
  const out = kdf(dhOut, 'kinly-ratchet-root', 64, rk); // salt = current root key
  return { rk: out.subarray(0, 32), ck: out.subarray(32, 64) };
}

function kdfCK(ck: Uint8Array): { ck: Uint8Array; mk: Uint8Array } {
  const mk = mac(ck, Uint8Array.of(1));
  const nextCk = mac(ck, Uint8Array.of(2));
  return { ck: nextCk, mk };
}

// --- header (de)serialization: dh(32) || pn(4 BE) || n(4 BE) ---------------

export function encodeHeader(h: RatchetHeader): Uint8Array {
  const meta = new Uint8Array(8);
  new DataView(meta.buffer).setUint32(0, h.pn, false);
  new DataView(meta.buffer).setUint32(4, h.n, false);
  return concat(h.dh, meta);
}

export function decodeHeader(bytes: Uint8Array): RatchetHeader {
  const dhPub = bytes.subarray(0, 32);
  const view = new DataView(bytes.buffer, bytes.byteOffset + 32, 8);
  return { dh: dhPub, pn: view.getUint32(0, false), n: view.getUint32(4, false) };
}

// --- initialization --------------------------------------------------------

/** Initiator ("Alice"): knows the peer's initial ratchet public key. */
export function initInitiator(sharedSecret: Uint8Array, peerRatchetPub: Uint8Array): RatchetState {
  const DHs = generateKeyPair();
  const { rk, ck } = kdfRK(sharedSecret, dh(DHs.secretKey, peerRatchetPub));
  return { DHs, DHr: peerRatchetPub, RK: rk, CKs: ck, CKr: null, Ns: 0, Nr: 0, PN: 0, skipped: {} };
}

/** Responder ("Bob"): owns the initial ratchet keypair the initiator used. */
export function initResponder(sharedSecret: Uint8Array, ratchetKeyPair: KeyPair): RatchetState {
  return { DHs: ratchetKeyPair, DHr: null, RK: sharedSecret, CKs: null, CKr: null, Ns: 0, Nr: 0, PN: 0, skipped: {} };
}

// --- encrypt / decrypt -----------------------------------------------------

export function ratchetEncrypt(state: RatchetState, plaintext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): RatchetMessage {
  if (!state.CKs) throw new Error('ratchet: no sending chain yet');
  const step = kdfCK(state.CKs);
  state.CKs = step.ck;
  const header: RatchetHeader = { dh: state.DHs.publicKey, pn: state.PN, n: state.Ns };
  state.Ns += 1;
  const body = aeadEncrypt(step.mk, plaintext, concat(ad, encodeHeader(header)));
  return { header, body };
}

export function ratchetDecrypt(state: RatchetState, msg: RatchetMessage, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
  const headerBytes = encodeHeader(msg.header);

  // 1. A skipped message key we stashed earlier?
  const skKey = skippedKey(msg.header.dh, msg.header.n);
  const skipped = state.skipped[skKey];
  if (skipped) {
    delete state.skipped[skKey];
    return aeadDecrypt(skipped, msg.body, concat(ad, headerBytes));
  }

  // 2. New ratchet public key from the peer → DH ratchet step.
  if (!state.DHr || !sameKey(msg.header.dh, state.DHr)) {
    skipMessageKeys(state, msg.header.pn);
    dhRatchet(state, msg.header);
  }

  // 3. Skip any messages we missed in the current receiving chain.
  skipMessageKeys(state, msg.header.n);

  if (!state.CKr) throw new Error('ratchet: no receiving chain');
  const step = kdfCK(state.CKr);
  state.CKr = step.ck;
  state.Nr += 1;
  return aeadDecrypt(step.mk, msg.body, concat(ad, headerBytes));
}

function dhRatchet(state: RatchetState, header: RatchetHeader): void {
  state.PN = state.Ns;
  state.Ns = 0;
  state.Nr = 0;
  state.DHr = header.dh;
  let r = kdfRK(state.RK, dh(state.DHs.secretKey, state.DHr));
  state.RK = r.rk;
  state.CKr = r.ck;
  state.DHs = generateKeyPair();
  r = kdfRK(state.RK, dh(state.DHs.secretKey, state.DHr));
  state.RK = r.rk;
  state.CKs = r.ck;
}

function skipMessageKeys(state: RatchetState, until: number): void {
  if (!state.CKr) return;
  if (state.Nr + MAX_SKIP < until) throw new Error('ratchet: too many skipped messages');
  while (state.Nr < until) {
    const step = kdfCK(state.CKr);
    state.CKr = step.ck;
    state.skipped[skippedKey(state.DHr as Uint8Array, state.Nr)] = step.mk;
    state.Nr += 1;
  }
}

// --- helpers ---------------------------------------------------------------

function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function b64Short(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function skippedKey(dhPub: Uint8Array, n: number): string {
  return `${b64Short(dhPub)}|${n}`;
}
