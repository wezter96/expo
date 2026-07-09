/**
 * JSON (de)serialization of ratchet / sender-key session state, so a session
 * survives app restarts. Byte arrays are base64-encoded. Kept separate from the
 * algorithm modules so those stay pure.
 */
import { fromB64, toB64 } from './primitives';
import type { RatchetState } from './ratchet';
import type { ReceiverState, SenderState } from './senderKeys';

function mapVals<T>(obj: Record<string, T>, f: (v: T) => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, f(v)]));
}

export function serializeRatchet(s: RatchetState): string {
  return JSON.stringify({
    DHs: { publicKey: toB64(s.DHs.publicKey), secretKey: toB64(s.DHs.secretKey) },
    DHr: s.DHr ? toB64(s.DHr) : null,
    RK: toB64(s.RK),
    CKs: s.CKs ? toB64(s.CKs) : null,
    CKr: s.CKr ? toB64(s.CKr) : null,
    Ns: s.Ns,
    Nr: s.Nr,
    PN: s.PN,
    skipped: mapVals(s.skipped, toB64),
  });
}

export function deserializeRatchet(json: string): RatchetState {
  const o = JSON.parse(json);
  return {
    DHs: { publicKey: fromB64(o.DHs.publicKey), secretKey: fromB64(o.DHs.secretKey) },
    DHr: o.DHr ? fromB64(o.DHr) : null,
    RK: fromB64(o.RK),
    CKs: o.CKs ? fromB64(o.CKs) : null,
    CKr: o.CKr ? fromB64(o.CKr) : null,
    Ns: o.Ns,
    Nr: o.Nr,
    PN: o.PN,
    skipped: Object.fromEntries(Object.entries(o.skipped as Record<string, string>).map(([k, v]) => [k, fromB64(v)])),
  };
}

export function serializeSender(s: SenderState): string {
  return JSON.stringify({ chainKey: toB64(s.chainKey), iteration: s.iteration });
}
export function deserializeSender(json: string): SenderState {
  const o = JSON.parse(json);
  return { chainKey: fromB64(o.chainKey), iteration: o.iteration };
}

export function serializeReceiver(s: ReceiverState): string {
  return JSON.stringify({ chainKey: toB64(s.chainKey), iteration: s.iteration, skipped: mapVals(s.skipped, toB64) });
}
export function deserializeReceiver(json: string): ReceiverState {
  const o = JSON.parse(json);
  return {
    chainKey: fromB64(o.chainKey),
    iteration: o.iteration,
    skipped: Object.fromEntries(Object.entries(o.skipped as Record<string, string>).map(([k, v]) => [Number(k), fromB64(v)])),
  };
}
