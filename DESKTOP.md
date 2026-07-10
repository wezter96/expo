# Kinly — Desktop & multi-device

How Kinly runs on macOS / Windows / Linux and on more than one device, and why
that works with our encryption model.

## Multi-device: why it already works

Kinly's live E2EE uses a **per-conversation symmetric key** wrapped for each
member's identity key (not a per-device pairwise ratchet). The happy
consequence: **any device holding your identity key can read your
conversations.** So "multi-device" reduces to "get your identity key onto the
other device" — which the recovery phrase already does:

1. On device A: Settings → Encryption → show the 24-word recovery phrase.
2. On device B (or desktop): Settings → Encryption → restore from phrase.
3. Device B now has the same identity key, unwraps the same conversation keys,
   and reads everything. `publishE2EEKeys()` keeps the published public keys in
   sync.

> This is the deliberate trade-off from the E2EE decision (see E2EE.md): we
> chose the multi-device-friendly conversation-key model over a pairwise Double
> Ratchet. A ratchet session lives on one device and can't be shared, so it
> would have *broken* multi-device. Forward secrecy is provided by **key
> rotation** instead (rotate the conversation key on membership change).

**QR device linking (done):** instead of typing 24 words, Settings → Encryption
→ *Add another device* shows a QR + 6-digit PIN on device A; device B scans it
and enters the PIN to import the identity key. The QR is useless without the
PIN (PBKDF2-stretched). See `crypto/linking.ts` + `app/link-device.tsx`.

## Desktop app (Electron)

`apps/desktop/` is an Electron shell that **reuses the exact web build** and
adds the one thing a browser can't provide: **OS-backed secure key storage**.

- `main.js` — loads `web-dist/index.html` and exposes `secure:get/set/delete`
  IPC handlers backed by Electron **`safeStorage`** (macOS Keychain, Windows
  DPAPI, Linux libsecret). Values are encrypted before they touch disk.
- `preload.js` — exposes a locked-down `window.kinlySecureStore` bridge.
- The app's storage adapter (`src/crypto/secure-store.ts`) detects that bridge
  and uses it, so **E2EE is enabled on desktop** (identity keys live in the OS
  keychain) — while a bare browser tab correctly reports E2EE unavailable and
  shows the "use the app" notice.

### Build & run

```bash
cd apps/desktop
npm install
npm run dev      # builds the web bundle then launches Electron
npm run dist     # packaged installers (dmg / nsis / AppImage) via electron-builder
```

Point the web build at your server the same way as the app
(`EXPO_PUBLIC_PB_URL`) before `build:web`.

## What's still needed for true parity

- **QR device linking** (above) — nicer than the recovery phrase.
- **Code signing + notarization** (Apple), Authenticode (Windows), and an
  **auto-update** feed — table stakes for a trusted desktop app.
- **Native window chrome / tray / notifications** polish.
- **Conversation-key rotation** wired (the forward-secrecy mechanism) — the
  primitive (`newConvKey` + re-wrap at a new epoch) exists; rotate-on-membership
  -change and periodic rotation need wiring.
- The Electron shell is **scaffolded but not built/run in this environment** —
  it needs a desktop machine with the Electron toolchain to verify.

## Status

| Piece | Status |
|---|---|
| Multi-device via shared identity (recovery phrase) | ✅ Works with current model |
| Pluggable secure storage (native / desktop / web) | ✅ Built (`secure-store.ts`) |
| Electron shell + safeStorage bridge | ✅ Scaffolded (unbuilt here) |
| QR device linking | ✅ Built (`link-device.tsx`) |
| Conversation-key rotation (forward secrecy) | ✅ Wired (rotates on membership change) |
| Code signing / notarization / auto-update | ⏳ Not started |
