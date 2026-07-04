# Kinly 👵📱

A **dead-simple messaging app for older adults** to stay in touch with family
and friends — plus a friendly **AI assistant** you can just *tell* what to do
("Call Mary", "Tell Tom I'll be late"). Think Signal or Messenger, stripped down
to only what matters, with big text, big buttons, and read-aloud everywhere.

This is a **type-safe monorepo** scaffolded with
[Better-T-Stack](https://www.better-t-stack.dev/): an Expo (React Native) app
talking to a Hono + tRPC backend over end-to-end typed APIs.

---

## What's inside

```
apps/
  native/      Expo (React Native) app — the elderly-friendly UI
  server/      Hono server exposing the tRPC API (Node runtime)
packages/
  api/         tRPC routers (contacts, messages, assistant) + AI agent
  db/          Drizzle ORM schema + libSQL (SQLite) client + seed data
  env/         Type-safe environment variables (server & native)
  config/      Shared TypeScript config
```

**Stack:** Expo Router · React Native · tRPC · Hono · Drizzle ORM · libSQL
(SQLite) · Turborepo · TypeScript.

## Why Kinly

Most messaging apps overwhelm older users: tiny text, hidden menus, confusing
gestures. Kinly is built around a few rules:

- **Large, high-contrast type** — body text never below 20pt, buttons at 24pt.
- **Big touch targets** — every tappable thing is at least 64pt tall.
- **One clear path** — a home screen with a few obvious choices, no hidden menus.
- **Read aloud** — any received message can be spoken out loud (tap the speaker).
- **Talk, don't tap** — the AI assistant turns plain language into actions.

## The AI Assistant 🤖

The **Assistant** screen is the heart of the app. You type (or, on a real
device, dictate) a plain-language request and it figures out what to do:

| You say | What happens |
| --- | --- |
| "Call Mary" | Confirms, then places a phone call |
| "Tell Tom I'll be a little late" | Drafts the message, confirms, then sends it |
| "Read my messages from Mary" | Reads her latest messages aloud |
| "Message the Family group" | Opens the group chat |

Anything that reaches out (a call or a sent message) always shows a big
**Yes / No** confirmation first, so nothing happens by accident.

**The AI runs on the server** (`packages/api/src/lib/agent.ts`), reached through
the `assistant.run` tRPC procedure. That keeps any Anthropic API key on the
server, never on the device. Two engines, so it always works:

1. **Claude (Anthropic) API** — when `ANTHROPIC_API_KEY` is set on the server,
   free-form requests are understood via tool-calling.
2. **Built-in rule-based parser** — a fallback so the assistant works with no
   key and no network. If the server is unreachable, the app even falls back to
   an on-device copy of the parser, so the feature is never dead.

## Offline-first

The app is fully usable with **no server running**: contacts and messages are
seeded locally and persisted with `AsyncStorage`. When `EXPO_PUBLIC_SERVER_URL`
is set, the app hydrates from the server (source of truth), sends messages
through `messages.send`, and routes the assistant through `assistant.run` — all
best-effort, with graceful fallback to local data.

## Getting started

Requires Node 22+ (a `bun`-based flow works too). From the repo root:

```bash
npm install

# 1. Create the SQLite tables
npm run db:push

# 2. Start the tRPC server (http://localhost:3000)
npm run dev:server

# 3. In another terminal, start the app
npm run dev:native
```

Then scan the QR code with **Expo Go**, or press `i` / `a` for a simulator.

To connect the app to the server, copy `apps/native/.env.example` to
`apps/native/.env` and set `EXPO_PUBLIC_SERVER_URL` to your machine's LAN IP
(e.g. `http://192.168.1.20:3000`) — `localhost` won't resolve from a phone.
Leave it unset to run the app fully offline.

Optional AI: copy `apps/server/.env.example` to `apps/server/.env` and set
`ANTHROPIC_API_KEY` to enable Claude-powered understanding.

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run everything via Turborepo |
| `npm run dev:server` | Start only the tRPC/Hono server |
| `npm run dev:native` | Start only the Expo app |
| `npm run db:push` | Apply the Drizzle schema to SQLite |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run check-types` | Type-check every package |

## The API

Type-safe tRPC procedures (see `packages/api/src/routers`):

- `contacts.list` — all contacts and groups
- `messages.list({ contactId })` — a conversation, oldest first
- `messages.send({ contactId, text })` — send a message (persisted)
- `assistant.run({ text })` — interpret a request → `{ say, action, needsConfirm }`

The app imports only `import type { AppRouter }`, so no server code is bundled
into the mobile app — just full end-to-end type safety over HTTP.

## Roadmap ideas

- On-device speech-to-text for true hands-free use
- Real auth + end-to-end encryption
- Photo sharing and video calls
- Push notifications for new messages
- An even larger "extra big" accessibility mode

---

Made with care for the people who taught us how to talk. ❤️
