/**
 * QR device linking (platform layer). Encodes your identity secret into a
 * compact code (shown as a QR on your main device) protected by a 6-digit PIN
 * you read to the new device — far friendlier than typing 24 words.
 *
 * The QR alone is useless without the PIN; the PIN is PBKDF2-stretched so a
 * leaked-QR + PIN-guessing attack is costly. Still: only link over a short,
 * in-person window. Not audited.
 */
import { getIdentity, importIdentitySecret } from './identity';
import { openSecret, randomPin, sealSecret } from './linking-core';

export { openSecret, randomPin, sealSecret } from './linking-core';

/** This device: produce a QR code + PIN that shares this identity. */
export async function makeLinkCode(): Promise<{ code: string; pin: string }> {
  const id = await getIdentity();
  const pin = randomPin();
  return { code: sealSecret(id.secretKey, pin), pin };
}

/** New device: import an identity from a scanned code + its PIN. */
export async function importLinkCode(code: string, pin: string): Promise<void> {
  await importIdentitySecret(openSecret(code, pin));
}
