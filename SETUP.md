# Kinly — first-run setup & shakeout guide

This walks you from a fresh clone to two phones talking to each other. Budget
~1 hour the first time; most of it is one-time backend setup.

> ⚠️ The backend has never been booted in the dev sandbox where this was
> built, so the first `docker compose up` is where you'll shake out any
> PocketBase issues. The **Likely gotchas** section at the bottom lists what to
> watch for — skim it first.

---

## 0. Prerequisites

- **Node 22+**
- **Docker** (easiest) — or the PocketBase + LiveKit binaries
- For video/push you need a **native dev build** (not Expo Go): Xcode / Android
  Studio, or an [EAS](https://expo.dev) account for cloud builds
- Your computer and phones on the **same Wi-Fi**

Find your computer's LAN IP (you'll need it): `ipconfig getifaddr en0` (macOS) /
`hostname -I` (Linux) / `ipconfig` (Windows). Example below: `192.168.1.20`.

## 1. Start the backend (PocketBase + LiveKit)

Edit `docker-compose.yml` at the repo root and set, under the `pocketbase`
service `environment`:

```yaml
LIVEKIT_URL: "ws://192.168.1.20:7880"     # your LAN IP
LIVEKIT_API_KEY: "devkey"
LIVEKIT_API_SECRET: "devsecret_change_me_to_a_32char_min_secret"   # ≥32 chars
# ANTHROPIC_API_KEY: "sk-ant-..."         # optional: smarter AI assistant
```

Make the same key/secret match `apps/livekit/livekit.yaml`. Then:

```bash
docker compose up
```

Watch the **PocketBase logs**. On first boot it applies the migration in
`apps/pocketbase/pb_migrations` (creating users/conversations/messages/reactions/
reads/calls) and loads `apps/pocketbase/pb_hooks`. **If you see a migration
error, fix it here before continuing** (see gotchas).

## 2. Configure PocketBase

1. Open `http://localhost:8090/_/` and create the **admin** account.
2. Confirm the collections exist: `conversations`, `messages`, `reactions`,
   `reads`, `calls`, `reports`, and `users` (with `phone`, `pushToken`,
   `lastSeen`, `blocked`). The `reports` collection is admin-only — safety
   reports filed from the app land here for you to review.
3. **Email** (needed for password reset / verification): Settings → Mail
   settings → configure SMTP (e.g. a Gmail app password or a transactional
   provider). Without this, "Forgot password" silently does nothing.

## 3. Point the app at the backend

```bash
cp apps/native/.env.example apps/native/.env
```

Set in `apps/native/.env`:

```
EXPO_PUBLIC_PB_URL=http://192.168.1.20:8090     # your LAN IP, NOT localhost
```

## 4. Install + push credentials

```bash
npm install
cd apps/native && npx eas init      # creates the EAS project id push needs
```

(Skip `eas init` if you don't want push yet — everything else works without it.)

## 5. Run the app (dev build)

Video (WebRTC), push, and audio recording need a dev build, not Expo Go:

```bash
# from apps/native
npx expo run:ios        # or: npx expo run:android
# (or `eas build --profile development` for a cloud dev build)
```

Install on **two phones** (or a phone + a simulator).

## 6. Test the happy path

1. Sign up two accounts (each with a **name + phone**).
2. On phone A: **＋ → Add a person**, enter phone B's number → chat opens.
3. Send text, a photo, a voice message. Confirm they appear on phone B live.
4. Tap the phone / video icons — phone B should **ring** (Answer / Decline).
5. Try the **Assistant** ("Call Mary", "Tell Tom I'll be late").
6. Make a group (＋ → New group), set an **Emergency contact**, try **Dark mode**
   (Settings → Display).

---

## Likely gotchas (the shakeout checklist)

**PocketBase**
- **Version drift.** The migration/hooks target the **v0.27** JSVM API
  (`new Collection`, `new Field`, `routerAdd`, `onRecordAfterCreateSuccess`,
  `e.requestInfo()`, `$security.createJWT`). If your PocketBase is a different
  major/minor, some of these signatures change — the boot log will point at the
  exact line. The `muchobien/pocketbase:0.27.0` image in compose keeps you on
  0.27.
- **Collection rule syntax.** Rules use the multi-relation "any" operator, e.g.
  `members.id ?= @request.auth.id`. If a rule is rejected on save, check that
  operator and the relation path.
- **Client-set message ids.** The app sends messages with a client-generated
  15-char id (for optimistic send + dedupe). PocketBase allows this; if you
  tightened id generation, relax it.
- **`users` privacy.** `users.viewRule` is open to any signed-in user (so names
  & photos of people you chat with resolve). Tighten for production. The
  `find-user` phone lookup allows number enumeration — consider rate-limiting.

**Video (LiveKit)**
- Secret must be **≥32 chars** and match in `livekit.yaml` + PocketBase env.
- `LIVEKIT_URL` must be reachable **from the phone** — use the LAN IP, `ws://`
  in dev, `wss://` in production. Open the UDP media port range (50000-60000).

**Push**
- Needs `eas init` (project id). No project id → tokens silently don't register.
- Doesn't work in Expo Go or on web (the app degrades gracefully).

**Realtime**
- On device, realtime uses the `react-native-sse` EventSource polyfill (already
  wired). On web it uses the browser's EventSource.

**Safety (block / report / unsend).** From a 1:1 chat's ⋮ menu you can **block**
a person (either side blocked → messages and 1:1 start are refused server-side,
enforced in `pb_hooks` and the `direct` route) or **report** them (writes to the
admin-only `reports` collection). Long-press your own message to **unsend** it
(`messages.deleteRule` = author; the delete streams to everyone over realtime).

**Known deferrals** (documented, not bugs): typing indicators (PocketBase has no
ephemeral channel), fully-backgrounded CallKit-style ringing, and contacts-only
message gating (anyone who knows your number + is on Kinly can start a 1:1 unless
you block them — a request/accept flow would make this opt-in rather than
opt-out).

**Reminder:** SOS is a convenience shortcut to a chosen contact — it is **not a
replacement for emergency services (911/112)**. Say so in-product if you ship.
