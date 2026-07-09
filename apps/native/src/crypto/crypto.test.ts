import {
  aeadDecrypt,
  aeadEncrypt,
  fromB64,
  generateKeyPair,
  randomBytes,
  toB64,
  utf8,
} from './primitives';
import {
  deriveSharedSecret,
  newConversationKey,
  unwrapKey,
  wrapKey,
} from './conversation';
import {
  initInitiator,
  initResponder,
  ratchetDecrypt,
  ratchetEncrypt,
  type RatchetMessage,
} from './ratchet';
import {
  createSenderState,
  initReceiver,
  receiverDecrypt,
  senderDistribution,
  senderEncrypt,
} from './senderKeys';
import { decodePayload, encodePayload } from './messages';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log('  ✗ FAIL:', name);
  }
}
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

// 1. base64 round-trips for every remainder class
for (const n of [0, 1, 2, 3, 16, 31, 32, 100]) {
  const b = randomBytes(n);
  ok(`b64 len ${n}`, same(fromB64(toB64(b)), b));
}

// 2. AEAD
{
  const key = randomBytes(32);
  const pt = utf8.encode('hello disappearing world');
  const ct = aeadEncrypt(key, pt);
  ok('aead roundtrip', utf8.decode(aeadDecrypt(key, ct)) === 'hello disappearing world');
  const tampered = ct.slice();
  tampered[tampered.length - 1] ^= 1;
  let threw = false;
  try {
    aeadDecrypt(key, tampered);
  } catch {
    threw = true;
  }
  ok('aead rejects tampering', threw);
}

// 3. conversation key wrap/unwrap between two identities
{
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const convKey = newConversationKey();
  const wrapped = wrapKey(alice.secretKey, bob.publicKey, convKey);
  const got = unwrapKey(bob.secretKey, alice.publicKey, wrapped);
  ok('conv key wrap/unwrap', same(got, convKey));
  const ss1 = deriveSharedSecret(alice.secretKey, bob.publicKey);
  const ss2 = deriveSharedSecret(bob.secretKey, alice.publicKey);
  ok('shared secret symmetric', same(ss1, ss2));
}

// 4. Double Ratchet — in-order both directions
{
  const bobPrekey = generateKeyPair();
  const alicePub = generateKeyPair();
  const SK = deriveSharedSecret(alicePub.secretKey, bobPrekey.publicKey);
  const SKb = deriveSharedSecret(bobPrekey.secretKey, alicePub.publicKey);
  ok('ratchet SK symmetric', same(SK, SKb));
  const alice = initInitiator(SK, bobPrekey.publicKey);
  const bob = initResponder(SK, bobPrekey);

  const m1 = ratchetEncrypt(alice, utf8.encode('A->B 1'));
  ok('ratchet a1', utf8.decode(ratchetDecrypt(bob, m1)) === 'A->B 1');
  const m2 = ratchetEncrypt(bob, utf8.encode('B->A 1'));
  ok('ratchet b1', utf8.decode(ratchetDecrypt(alice, m2)) === 'B->A 1');
  const m3 = ratchetEncrypt(alice, utf8.encode('A->B 2'));
  const m4 = ratchetEncrypt(alice, utf8.encode('A->B 3'));
  ok('ratchet a2', utf8.decode(ratchetDecrypt(bob, m3)) === 'A->B 2');
  ok('ratchet a3', utf8.decode(ratchetDecrypt(bob, m4)) === 'A->B 3');
}

// 5. Double Ratchet — out-of-order delivery (skipped keys)
{
  const bobPrekey = generateKeyPair();
  const alicePub = generateKeyPair();
  const SK = deriveSharedSecret(alicePub.secretKey, bobPrekey.publicKey);
  const alice = initInitiator(SK, bobPrekey.publicKey);
  const bob = initResponder(SK, bobPrekey);
  const msgs: RatchetMessage[] = [];
  for (let i = 0; i < 5; i++) msgs.push(ratchetEncrypt(alice, utf8.encode('m' + i)));
  // deliver 4,2,0,3,1
  ok('ooo m4', utf8.decode(ratchetDecrypt(bob, msgs[4])) === 'm4');
  ok('ooo m2', utf8.decode(ratchetDecrypt(bob, msgs[2])) === 'm2');
  ok('ooo m0', utf8.decode(ratchetDecrypt(bob, msgs[0])) === 'm0');
  ok('ooo m3', utf8.decode(ratchetDecrypt(bob, msgs[3])) === 'm3');
  ok('ooo m1', utf8.decode(ratchetDecrypt(bob, msgs[1])) === 'm1');
}

// 6. Sender keys (group) with skips + multiple receivers
{
  const sender = createSenderState();
  const dist = senderDistribution(sender);
  const rx1 = initReceiver({ chainKey: dist.chainKey.slice(), iteration: dist.iteration });
  const rx2 = initReceiver({ chainKey: dist.chainKey.slice(), iteration: dist.iteration });
  const g0 = senderEncrypt(sender, utf8.encode('g0'));
  const g1 = senderEncrypt(sender, utf8.encode('g1'));
  const g2 = senderEncrypt(sender, utf8.encode('g2'));
  ok('group rx1 g0', utf8.decode(receiverDecrypt(rx1, g0)) === 'g0');
  ok('group rx1 g2 (skip)', utf8.decode(receiverDecrypt(rx1, g2)) === 'g2');
  ok('group rx1 g1 (stashed)', utf8.decode(receiverDecrypt(rx1, g1)) === 'g1');
  ok('group rx2 g0', utf8.decode(receiverDecrypt(rx2, g0)) === 'g0');
}

// 7. payload encode/decode
{
  const p = { t: 'hi', m: { key: toB64(randomBytes(32)), kind: 'photo' as const } };
  const round = decodePayload(encodePayload(p));
  ok('payload roundtrip', round.t === 'hi' && round.m?.kind === 'photo' && round.m.key === p.m.key);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
