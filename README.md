# Kinly 👵📱

A **dead-simple messaging app for older adults** to stay in touch with family
and friends — plus a friendly **AI assistant** you can just *tell* what to do
("Call Mary", "Tell Tom I'll be late"). Think Signal or Messenger, stripped down
to only what matters, with big text, big buttons, and read-aloud everywhere.

Built to run **cheap**: an Expo (React Native) app on top of
[PocketBase](https://pocketbase.io) — a single open-source Go binary that
bundles auth, a realtime database, file storage and JS hooks. The whole backend
fits on a ~$5/month VPS, the target for a **$4.99 / month, up-to-10-member**
family plan.

---

## What's inside

```
apps/
  native/       Expo (React Native) app — the elderly-friendly UI
  pocketbase/   PocketBase backend: schema (pb_migrations) + AI/video hooks (pb_hooks)
  livekit/      LiveKit SFU config for group video calls
```

**Stack:** Expo Router · React Native · PocketBase (SQLite + realtime + hooks) ·
LiveKit (WebRTC video) · Turborepo · TypeScript.

## Why Kinly

Most messaging apps overwhelm older users: tiny text, hidden menus, confusing
gestures. Kinly is built around a few rules:

- **Large, high-contrast type** — body text never below 20pt, buttons at 24pt.
- **Big touch targets** — every tappable thing is at least 64pt tall.
- **Three tabs, one clear path** — Messages · Assistant · Settings, with a big
  circular AI button in the middle.
- **Read aloud** — any received message can be spoken out loud (tap the speaker).
- **Talk, don't tap** — the AI assistant turns plain language into actions.

## The AI Assistant 🤖

The center tab is the heart of the app. You type (or, on a real device, dictate)
a plain-language request and it figures out what to do:

| You say | What happens |
| --- | --- |
| "Call Mary" | Confirms, then places a phone call |
| "Tell Tom I'll be a little late" | Drafts the message, confirms, then sends it |
| "Read my messages from Mary" | Reads her latest messages aloud |
| "Message the Family group" | Opens the group chat |

Anything that reaches out (a call or a sent message) always shows a big
**Yes / No** confirmation first, so nothing happens by accident.

**The AI runs inside PocketBase** as a JS hook (`POST /api/kinly/assistant`), so
any Anthropic API key stays on the server, never on the device. Two engines, so
it always works:

1. **Claude (Anthropic) API** — when `ANTHROPIC_API_KEY` is set in the
   PocketBase environment, free-form requests are understood via tool-calling.
2. **Built-in rule-based parser** — a fallback so it works with no key. If the
   server is unreachable, the app even falls back to an on-device copy of the
   parser, so the feature is never dead.

## Accounts, family & groups

- **Sign up / sign in** (email + password) — the app is gated behind auth when a
  server is configured. You register with your **name + phone number**.
- **Add family by phone** — type in a relative's number to find them and start a
  1:1 chat (`New chat`).
- **Create groups** — name a group and pick people from your chats; every
  conversation (1:1 or group) has the video-call button built in.
- Access is **membership-scoped** in PocketBase: you only see your own chats.

## Real-time chat & offline-first

Messages live in PocketBase and stream to every device over **PocketBase
realtime** (Server-Sent Events), so a chat updates live. When
`EXPO_PUBLIC_PB_URL` is set the app hydrates from PocketBase, sends through it,
subscribes for live updates, and routes the assistant server-side. With **no
server** configured it runs fully offline against a local sample family
(`AsyncStorage`) — handy for a quick preview.

## Group video calls 📹

Discord-style group video runs on a self-hosted **LiveKit** SFU (`apps/livekit`)
— open source, and cheap because bandwidth is the only real cost (keep it on a
Hetzner-class host, not per-minute managed video). Tap the video icon in any
chat: the app asks PocketBase for a LiveKit token (secret stays server-side),
joins the conversation's room, and shows big mute / camera / **Leave** controls.

Because WebRTC needs native modules, video runs in a **dev build** (not Expo Go
or the web bundle) — `npx expo run:ios` / `run:android`. On web/Expo Go the app
shows a friendly "open on your phone" placeholder. See `apps/livekit/README.md`.

## Getting started

**1. Start the backend** (see `apps/pocketbase/README.md` for details):

```bash
cd apps/pocketbase
./pocketbase serve --http=0.0.0.0:8090     # or: docker compose up
```

It auto-applies the schema and seeds a sample family on first run. Admin UI at
`http://localhost:8090/_/`.

**2. Start the app:**

```bash
npm install
npm run dev:native
```

Scan the QR code with **Expo Go**, or press `i` / `a` for a simulator.

**3. Connect them:** copy `apps/native/.env.example` to `apps/native/.env` and
set `EXPO_PUBLIC_PB_URL` to your machine's LAN IP (e.g.
`http://192.168.1.20:8090`) — `localhost` won't resolve from a phone. Leave it
unset to run the app fully offline.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:native` | Start the Expo app |
| `npm run pb` | Run the PocketBase server (needs the binary in apps/pocketbase) |
| `npm run check-types` | Type-check the app |

## Roadmap

- Push notifications for new messages (Expo Push)
- Profile photos, presence (online dots), read receipts
- Photo & voice-note sharing (PocketBase file storage)
- On-device speech-to-text for true hands-free use

---

Made with care for the people who taught us how to talk. ❤️
