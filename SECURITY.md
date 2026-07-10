# Kinly — security model & audit brief

This is the document to hand a cryptography auditor. It states what Kinly
protects, what it does not, where the keys live, and exactly which home-grown
parts need the hardest scrutiny.

> **Status: NOT audited.** Nothing here has had a professional review. Do not
> rely on Kinly for high-stakes confidentiality until it has.

## Assets we protect

- Message **content**: text, photos, voice notes.
- The **conversation keys** and **identity keys** that protect them.

## Assets we do NOT protect (be honest in-product)

- **Metadata**: who is in a conversation, who sent what and when, message sizes/
  timing. The server routes messages, so it sees this. We have no sealed sender
  or private contact discovery (yet).
- Anything on a compromised device past the OS keychain boundary.

## Adversary model

| Adversary | Outcome we intend |
| --- | --- |
| **Server operator / DB thief / subpoena** | Cannot read message content or media (only ciphertext + metadata). |
| **Network attacker** | TLS in transit; content is E2E-encrypted regardless. |
| **Harvest-now-decrypt-later quantum** | Conversation keys are wrapped with a **hybrid X25519 + ML-KEM-768** scheme, so a future quantum computer that breaks X25519 still can't unwrap them. |
| **Removed group member** | Key **rotation** on membership change means they can't read messages sent after they leave. |
| **Device thief** | Identity key is in the OS secure enclave; optional app lock; recovery phrase is the user's responsibility. |
| **Malicious group member** | Can read/post in that group (they're a member). Sender-key messages aren't individually signed yet — a member could spoof another member. Non-members can't read or forge. |

## Cryptographic inventory

- **Primitives** (`src/crypto/primitives.ts`): X25519 (`@noble/curves`),
  XChaCha20-Poly1305 AEAD (`@noble/ciphers`), HKDF/HMAC-SHA256 (`@noble/hashes`),
  ML-KEM-768 (`@noble/post-quantum`), PBKDF2 (device-link PIN). CSPRNG =
  WebCrypto, falling back to `expo-crypto` on native.
- **Identity**: X25519 identity key + X25519 ratchet prekey, stored in the OS
  secure enclave (`expo-secure-store` on mobile, Electron `safeStorage` on
  desktop). The ML-KEM keypair is derived deterministically from the identity
  key. 24-word BIP-39 recovery phrase encodes the identity key.
- **Conversation key distribution** (live path): one symmetric key per
  conversation, **hybrid-wrapped per member** (`wrapKeyHybrid`: ML-KEM
  encapsulation ‖ AEAD, wrap key = KDF(X25519-DH ‖ ML-KEM-ss)). Stored wrapped
  in `conversation_keys`; server never sees the key.
- **Message encryption**: XChaCha20-Poly1305 over a JSON payload; media files
  encrypted with a per-file key carried in the payload. `keyEpoch` records the
  rotation epoch.
- **Forward secrecy**: conversation-key **rotation** on membership change.
- **Built + tested but NOT in the live path**: Double Ratchet (`ratchet.ts`)
  and group sender keys (`senderKeys.ts`) — kept for a future single-device
  mode. (We chose rotation over a live ratchet because a ratchet session can't
  be shared across a user's devices.)
- **Device linking** (`linking-core.ts`): identity secret sealed under a
  6-digit PIN, PBKDF2-stretched (150k), shown as a QR.
- **Safety numbers** (`safety.ts`): iterated-hash fingerprint of both identity
  keys for out-of-band verification.

All of the above have **Node round-trip unit tests** (`src/crypto/*.test.ts`,
33 + 5 assertions) covering AEAD tamper-rejection, wrap/unwrap, hybrid PQ,
ratchet in/out-of-order, sender keys, linking, and safety-number symmetry.

## Where an auditor should focus (home-grown, highest risk)

1. **Hybrid KEM combiner** (`conversation.ts wrapKeyHybrid`) — is mixing
   KDF(DH) ‖ KDF(KEM-ss) into the wrap key sound? Domain separation correct?
2. **X3DH-lite** (`deriveSharedSecret`) — single static DH, no one-time prekey;
   deniability / PCS implications if the ratchet is ever enabled live.
3. **Conversation-key model** — rotation timing, epoch handling, the
   create/rotate race on the unique index, and whether `wrappedBy` trust is
   sound (a member wraps keys for others).
4. **Device-link PIN strength** — 6 digits + PBKDF2-150k over a short-lived QR.
5. **AAD / header binding** in the ratchet and sender-key AEAD calls.
6. **Randomness** source on all target platforms.

## Known limitations (tracked, not hidden)

- No sealed sender / private contact discovery → metadata exposure.
- Sender-key group messages aren't per-sender signed (spoofing within a group).
- Media file I/O, live encrypted send/receive, camera/QR, and rotation across
  real clients are **code-complete but not runtime-verified** (no backend/device
  in the build sandbox).
- Web has no secure key storage → E2EE disabled there by design (use the phone
  or desktop app).

## Dependencies (pin + review)

`@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `@noble/post-quantum`,
`@scure/bip39` (all audited upstream); `expo-secure-store`, `expo-crypto`,
`expo-file-system`, `expo-camera`, Electron `safeStorage`.

## Path to a shippable, audited 1.0

1. Stand up a real PocketBase + a dev build; exercise the full E2EE path on two
   devices (this is the gate that catches integration bugs).
2. **Commission a professional crypto audit** against this document.
3. Fix findings; add sender-key signatures; decide on live ratchet vs rotation.
4. Code-sign / notarize the mobile + desktop apps; set up auto-update.
5. Publish reproducible-build instructions and a plain-language privacy policy.
