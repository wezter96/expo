# Kinly 👵📱

A **dead-simple messaging app for older adults** to stay in touch with family and
friends. Think Signal or Messenger, stripped down to only what matters, with big
text, big buttons, and a friendly AI assistant you can just *tell* what you want
to do.

Built with [Expo](https://expo.dev) (React Native) so it runs on both iOS and
Android from one codebase.

---

## Why Kinly

Most messaging apps are overwhelming for older users: tiny text, hidden menus,
endless settings, and confusing gestures. Kinly is designed around a few rules:

- **Large, high-contrast type** — body text never below 20pt, buttons at 24pt.
- **Big touch targets** — every tappable thing is at least 64pt tall.
- **One clear path** — a home screen with three obvious choices, no hidden menus.
- **Read aloud** — any received message can be spoken out loud (tap the speaker).
- **Talk, don't tap** — an AI assistant lets you say *"Call my daughter"* or
  *"Tell Tom I'll be late"* and it does it for you.

## The AI Assistant 🤖

The **Assistant** screen is the heart of the app. You type (or, on a real device,
dictate) a plain-language request and it figures out what to do:

| You say | What happens |
| --- | --- |
| "Call Mary" | Confirms, then places a phone call |
| "Tell Tom I'll be a little late" | Drafts the message, confirms, then sends it |
| "Read my messages from Mary" | Reads her latest messages aloud |
| "Message the Family group" | Opens the group chat |

Anything that reaches out (a call or a sent message) always shows a big
**Yes / No** confirmation first, so nothing happens by accident.

### Two engines, always works

1. **Claude (Anthropic) API** — when an API key is configured, free-form and
   fuzzy requests are understood robustly via tool-calling.
2. **Built-in offline parser** — a rule-based fallback so the app is fully usable
   with **no key and no network**. If an AI call fails, it silently falls back.

To enable the Claude engine, set your key in `app.json` under `expo.extra.aiApiKey`
(or the `EXPO_PUBLIC_AI_API_KEY` environment variable) and optionally choose a
model with `expo.extra.aiModel` (default: `claude-haiku-4-5-20251001`).

> Note: for a production app you would proxy AI requests through your own backend
> rather than shipping a key in the client.

## Screens

- **Home** (`app/index.tsx`) — big buttons: Talk to Assistant, Messages, People,
  plus recent conversations.
- **People** (`app/contacts.tsx`) — each person as a large card with **Message**
  and **Call** buttons. Groups too.
- **Chat** (`app/chat/[id].tsx`) — large message bubbles, tap the speaker to hear
  a message, big send box, call button in the header.
- **Assistant** (`app/assistant.tsx`) — the conversational AI helper.

## Getting started

This app is the `native` workspace of the Kinly monorepo. From the **repo
root**:

```bash
npm install
npm run dev:native      # or: npm --workspace native run start
```

Then scan the QR code with the **Expo Go** app on your phone, or press `i` / `a`
to open an iOS / Android simulator. See the root `README.md` for running the
tRPC server alongside it.

## How data works

Contacts and messages are seeded locally (`src/seed.ts`) and persisted on the
device with `AsyncStorage`, so the app is **fully usable offline**. When
`EXPO_PUBLIC_SERVER_URL` is set (see `.env.example`), the app instead hydrates
from the Kinly tRPC server (`../server`) as the source of truth, sends messages
through it, and routes the assistant server-side — all with graceful fallback to
local data when the server is unreachable. The tRPC client lives in
`src/api/client.ts`.

## Project structure

```
app/                 Screens (Expo Router file-based routing)
  _layout.tsx        Navigation + providers
  index.tsx          Home
  contacts.tsx       People
  assistant.tsx      AI assistant
  chat/[id].tsx      Conversation
src/
  theme.ts           Design tokens tuned for older eyes/hands
  store.tsx          Local persistent data (contacts, messages)
  seed.ts            First-run sample data
  types.ts           Data types
  time.ts            Friendly timestamps
  ai/agent.ts        On-device AI intent → action fallback
  api/client.ts      tRPC client (type-safe calls to the server)
  components/        Avatar, BigButton
```

## Roadmap ideas

- On-device speech-to-text for true hands-free use
- Real backend + end-to-end encryption
- Photo sharing and video calls
- An even larger "extra big" accessibility mode
- Emergency / favourite contact pinned to the top

---

Made with care for the people who taught us how to talk. ❤️
