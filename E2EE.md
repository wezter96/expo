# Kinly — End-to-End Encryption design

Status: **proposal / not yet implemented.** This documents the plan, the
trade-offs, and the decisions to make *before* writing crypto code. Kinly's
positioning is "Signal-level privacy with a UX an 80-year-old loves," so the
guiding rule is: **maximize privacy without adding a single concept the user
has to understand.**

---

## 1. Goal & threat model

**Goal:** the server (and anyone who compromises it, or compels its operator)
cannot read message text, photos, or voice notes. Only the participating
devices can.

**In scope (what E2EE must protect):**
- Message content — text, images, audio.
- Ideally, media stored at rest on the server (already just ciphertext blobs).

**Explicitly out of scope (metadata we cannot hide with E2EE alone):**
- *Who talks to whom*, and *when* — the server routes messages, so it sees
  conversation membership and timing. (Signal spends huge effort on sealed
  sender / private contact discovery to shrink this; we will not, initially.)
- Message sizes and frequency.
- Phone numbers used for discovery (mitigated separately by lookup
  rate-limiting, already shipped).

Being honest about this boundary in-product matters: we can truthfully say
"we can't read your messages," **not** "we know nothing about you."

## 2. Where we are today

- Messages/media are stored **plaintext** in PocketBase; the server can read
  everything.
- Transport is TLS; auth is email+password.
- Push payloads no longer contain message content (shipped).
- Contact lookups are rate-limited (shipped).

So the gap to close is exactly #1: content confidentiality.

## 3. Options considered

| Approach | Pros | Cons for Kinly |
| --- | --- | --- |
| **libsignal** (Double Ratchet + X3DH) | Gold standard; forward secrecy + post-compromise security; battle-tested | Heavy native dependency; **per-device sessions** make group + multi-device complex; hardest to self-host understand |
| **MLS** (RFC 9420, Messaging Layer Security) | Designed for **groups** at scale; efficient key rotation on add/remove; an IETF standard | Younger ecosystem; RN library maturity is the risk; still need per-device identity |
| **libsodium + per-conversation key, TOFU** | Simple to reason about and implement; small; works with PocketBase as-is | Weaker than Signal: no automatic forward secrecy unless we ratchet ourselves; key distribution is trust-on-first-use |

## 4. Recommendation: phased, MLS-leaning

Start pragmatic, leave the door open to MLS:

**Phase 1 — "encrypted at the server" (libsodium, sealed-box):**
- Every user has a long-term **identity keypair** (Curve25519). The public key
  lives on the server; the **private key never leaves the device** (stored in
  the OS keystore — iOS Keychain / Android Keystore, via `expo-secure-store`).
- Each message is encrypted to every conversation member's public key using
  `crypto_box_seal` (anonymous sealed box) — or, better, a **per-conversation
  symmetric key** wrapped for each member. The server stores only ciphertext.
- Group membership changes: re-wrap the conversation key for the new member
  set. Simple, no ratchet.
- This alone gets us the headline property: **the server can't read messages.**

**Phase 2 — forward secrecy / post-compromise:** introduce ratcheting. This is
where MLS earns its keep for groups (it rotates the group key on every
membership change and periodically). If the RN MLS story is solid when we get
here, adopt MLS; otherwise implement a Double-Ratchet per 1:1 and a
sender-keys scheme for groups (the WhatsApp model).

Rationale: Phase 1 is achievable on top of PocketBase without a ratchet server,
delivers the property users actually care about, and doesn't block Phase 2.

## 5. The hard parts (and the UX cost)

E2EE breaks things that are currently simple. Each needs a decision:

1. **Key backup & recovery.** If the private key is only on the device, losing
   the phone = losing all history, and "forgot password" can no longer restore
   messages. Options, worst-to-best for elderly UX:
   - Recovery phrase (24 words) — *most secure, worst UX*. Rejected as default.
   - **Encrypted key escrow in the OS cloud keychain** (iCloud Keychain /
     Android Block Store) — the key rides along with the platform backup the
     user already has. **Recommended default.** Optional passphrase for the
     paranoid.
   - Server-side encrypted backup unlocked by a PIN (Signal's SVR model) — most
     work; revisit later.
2. **Multi-device.** Per-device keys mean a new device must be *linked*
   (Signal's QR pairing) and back-filled. Phase 1 can sidestep this by keeping
   **one active device per account** and re-encrypting history on migration;
   full multi-device is a Phase 2 project.
3. **Push.** Already content-free — good, because the server couldn't include
   plaintext anyway. The device fetches ciphertext and decrypts locally.
4. **Search.** Server-side search is impossible; search must be **on-device**
   over decrypted content only.
5. **The AI assistant.** Today the server-side assistant reads the contact
   roster (names only, never message content) to route "Call Mary." That stays
   fine. But any feature that would have the server read *message text* (e.g.
   server-side summarization) becomes impossible — such work must run
   **on-device** or be dropped. Design assistant features accordingly.
6. **Web client.** The current web build has no secure key storage; treat web
   as **unsupported for E2EE** (or view-only), and keep E2EE on native.

## 6. Media

Encrypt files client-side before upload (XChaCha20-Poly1305 with a random
per-file key; wrap that key like a message). The server stores an opaque blob;
thumbnails are generated on-device. Voice notes identical.

## 7. Verification (optional, off by default)

Provide **safety numbers / a QR code** to verify a contact's identity key, but
**never gate messaging on it** — key verification is the least elderly-friendly
Signal feature. Surface a gentle, non-blocking notice if a contact's key
changes ("Mary got a new phone — say hi to confirm it's really her").

## 8. Data model changes (Phase 1 sketch)

- `users.identityPublicKey` (text) — published public key.
- `users` private key — **device only**, in secure storage (never in PB).
- `messages`: replace `text` with `ciphertext` (+ `nonce`); `image`/`audio`
  become encrypted blobs; keep `kind`, `author`, `conversation`, `created`
  (these are the unavoidable metadata).
- `conversations.keyEpoch` + per-member wrapped keys (a `conversation_keys`
  collection: `{conversation, member, wrappedKey, epoch}`) so a new member
  gets the current key and rotation is possible.
- Collection rules unchanged in spirit (membership-scoped); the server just
  never sees plaintext.

## 9. Rollout

1. Ship key generation + publishing silently (no behavior change).
2. Start encrypting **new** 1:1 messages; show a subtle "🔒 end-to-end
   encrypted" note once both sides have keys.
3. Extend to groups (wrapped conversation key).
4. Encrypt media.
5. Cloud-keychain key backup + new-device migration.
6. (Phase 2) ratcheting / MLS; optional verification UI.

Old plaintext history can be left as-is or re-encrypted on migration; decide
per data-retention policy.

## 10. Open decisions (need a call before coding)

- [ ] Phase-1 crypto: libsodium sealed-box vs per-conversation wrapped key
      (recommend wrapped key — enables rotation).
- [ ] Key backup default: iCloud/Block Store keychain (recommended) vs recovery
      phrase.
- [ ] Multi-device now or later (recommend later).
- [ ] Ratchet in Phase 2: MLS vs Double-Ratchet + sender keys.
- [ ] Web: unsupported vs view-only for E2EE chats.
- [ ] Retention: re-encrypt old history or leave/expire it.

---

**Bottom line:** Phase 1 (identity keys in secure storage + per-conversation
wrapped keys, media encrypted client-side, key backed up via the OS cloud
keychain) makes "the server can't read your messages" true, keeps the UX nearly
unchanged, and leaves a clean path to forward secrecy. That is the right first
increment for Kinly.
