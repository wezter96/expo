/**
 * Sender Keys for group messages (the WhatsApp/Signal group model). Each sender
 * keeps a symmetric hash-ratchet "chain"; a per-message key is derived and the
 * chain advances, giving forward secrecy within a sender's chain. The sender
 * distributes the chain's starting state to each group member out-of-band,
 * encrypted per-member (see conversation.ts wrapping).
 *
 * ⚠️ Not audited. Known limitation vs. Signal: messages are not individually
 * signed, so a *group member* could spoof another member's sender key. Real
 * fix (add per-sender signature keys) is tracked in E2EE.md. Non-members still
 * cannot read or forge anything.
 */
import { aeadDecrypt, aeadEncrypt, concat, mac, randomBytes } from './primitives';

const MAX_SKIP = 2048;

export type SenderState = { chainKey: Uint8Array; iteration: number };
export type ReceiverState = { chainKey: Uint8Array; iteration: number; skipped: Record<number, Uint8Array> };
export type GroupMessage = { iteration: number; body: Uint8Array };

function kdfCK(ck: Uint8Array): { ck: Uint8Array; mk: Uint8Array } {
  return { mk: mac(ck, Uint8Array.of(1)), ck: mac(ck, Uint8Array.of(2)) };
}

/** Start a fresh sending chain (call when creating/rotating your sender key). */
export function createSenderState(): SenderState {
  return { chainKey: randomBytes(32), iteration: 0 };
}

/** The distributable starting point for receivers (chain key + iteration). */
export function senderDistribution(state: SenderState): { chainKey: Uint8Array; iteration: number } {
  return { chainKey: state.chainKey, iteration: state.iteration };
}

export function senderEncrypt(state: SenderState, plaintext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): GroupMessage {
  const step = kdfCK(state.chainKey);
  const iteration = state.iteration;
  state.chainKey = step.ck;
  state.iteration += 1;
  const meta = new Uint8Array(4);
  new DataView(meta.buffer).setUint32(0, iteration, false);
  return { iteration, body: aeadEncrypt(step.mk, plaintext, concat(ad, meta)) };
}

export function initReceiver(dist: { chainKey: Uint8Array; iteration: number }): ReceiverState {
  return { chainKey: dist.chainKey, iteration: dist.iteration, skipped: {} };
}

export function receiverDecrypt(state: ReceiverState, msg: GroupMessage, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
  const meta = new Uint8Array(4);
  new DataView(meta.buffer).setUint32(0, msg.iteration, false);
  const fullAd = concat(ad, meta);

  if (state.skipped[msg.iteration]) {
    const mk = state.skipped[msg.iteration];
    delete state.skipped[msg.iteration];
    return aeadDecrypt(mk, msg.body, fullAd);
  }
  if (msg.iteration < state.iteration) throw new Error('sender-key: message key already used/expired');
  if (msg.iteration - state.iteration > MAX_SKIP) throw new Error('sender-key: too many skipped messages');

  // Ratchet forward to the message's iteration, stashing skipped keys.
  while (state.iteration < msg.iteration) {
    const step = kdfCK(state.chainKey);
    state.skipped[state.iteration] = step.mk;
    state.chainKey = step.ck;
    state.iteration += 1;
  }
  const step = kdfCK(state.chainKey);
  state.chainKey = step.ck;
  state.iteration += 1;
  return aeadDecrypt(step.mk, msg.body, fullAd);
}
