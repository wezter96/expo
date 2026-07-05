# Kinly backend — PocketBase

The Kinly backend is [PocketBase](https://pocketbase.io): a single open-source
Go binary that bundles **auth, a realtime database, file storage and a JS hook
engine**. That "all-in-one" design is what makes the $4.99 / 10-member plan
realistic — the whole thing runs on a ~$5/month VPS.

This folder holds only the parts that belong in version control — the schema
(`pb_migrations/`) and the server hooks (`pb_hooks/`). The binary and runtime
data (`pb_data/`) are git-ignored.

## Run it

```bash
cd apps/pocketbase
./pocketbase serve --http=0.0.0.0:8090      # binary from github.com/pocketbase/pocketbase/releases (v0.27.x)
# or, from the repo root, run PocketBase + LiveKit together:  docker compose up
```

On first start PocketBase auto-applies `pb_migrations/` (creating the schema)
and loads `pb_hooks/`. Create the first admin at `http://localhost:8090/_/`.

## Point the app at it

In `apps/native/.env`:

```
EXPO_PUBLIC_PB_URL=http://localhost:8090     # use your LAN IP on a real device
```

Leave it unset to run the app fully offline against on-device sample data.

## Schema

**users** (built-in auth) — extended with a unique **`phone`** so family can add
you by number. Standard `email`, `password`, `name`.

**conversations** — a 1:1 or group chat
| field | type | notes |
| --- | --- | --- |
| title | text | group name (empty for 1:1) |
| isGroup | bool | |
| members | relation→users (multi) | who's in the chat |
| createdBy | relation→users | |

**messages** — realtime-enabled
| field | type | notes |
| --- | --- | --- |
| conversation | relation→conversations | cascade delete |
| author | relation→users | who sent it |
| text | text | |
| created | autodate | |

**Access is membership-scoped:** you can only list/read a conversation and its
messages if you're a `member`; you can only create a message you `author`. See
the rules in `pb_migrations/1712000000_init.js`.

## Hook endpoints (`pb_hooks/main.pb.js`)

All require a signed-in user.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/kinly/find-user` `{phone}` | Look up a person by phone |
| `POST /api/kinly/direct` `{phone}` | Start (or reuse) a 1:1 chat |
| `GET  /api/kinly/conversations` | The caller's chats, mapped for the UI |
| `GET  /api/kinly/contacts` | People the caller knows (for building groups) |
| `POST /api/kinly/assistant` `{text}` | AI assistant → action (scoped to the caller) |
| `POST /api/kinly/video-token` `{room}` | Mint a LiveKit token (secret stays server-side) |

Groups are created directly by the app (a `conversations` record with the
caller in `members`), so no hook is needed.

## Optional AI

Set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`) in the PocketBase
environment to have the assistant use Claude tool-calling; otherwise it uses a
built-in rule-based parser.

## Notes for production

- **Realtime on device:** the app installs a `react-native-sse` EventSource
  polyfill so PocketBase realtime works outside the web build.
- Add email verification / password reset (PocketBase supports both) and, for
  stricter privacy, tighten the `find-user` lookup (e.g. rate-limit or require a
  mutual invite).
