# Kinly backend — PocketBase

The Kinly backend is [PocketBase](https://pocketbase.io): a single open-source
Go binary that bundles **auth, a realtime database, file storage and a JS hook
engine**. That "all-in-one" design is what makes the $4.99 / 10-member plan
realistic — the whole thing runs on a ~$5/month VPS.

This folder holds only the parts that belong in version control — the schema
(`pb_migrations/`) and the assistant hook (`pb_hooks/`). The binary and runtime
data (`pb_data/`) are git-ignored.

## Run it

### Option A — download the binary (fastest)

```bash
# from https://github.com/pocketbase/pocketbase/releases (v0.27.x)
cd apps/pocketbase
./pocketbase serve --http=0.0.0.0:8090
```

### Option B — Docker

```bash
cd apps/pocketbase
docker compose up
```

On first start PocketBase auto-applies the migrations in `pb_migrations/`
(creating the `conversations` and `messages` collections and seeding a sample
family) and loads the hook in `pb_hooks/`. The admin UI is at
`http://localhost:8090/_/`.

## Point the app at it

In `apps/native/.env`:

```
EXPO_PUBLIC_PB_URL=http://localhost:8090   # use your LAN IP on a real device
```

Leave it unset to run the app fully offline.

## Schema

**conversations** — a person or group
| field | type | notes |
| --- | --- | --- |
| title | text | display name |
| relation | text | "Daughter", "Friend", "Group"… |
| phone | text | for the Call button |
| isGroup | bool | |
| memberNames | json | group member first names |

**messages** — realtime-enabled
| field | type | notes |
| --- | --- | --- |
| conversation | relation → conversations | cascade delete |
| text | text | |
| mine | bool | sent by the local user |
| created | autodate | |

The app subscribes to the `messages` collection over PocketBase realtime
(Server-Sent Events), so new messages appear live on every device.

## Assistant endpoint

`POST /api/kinly/assistant` with `{ "text": "Call Mary" }` returns:

```json
{ "say": "Calling Mary Johnson now. Is that right?",
  "action": { "type": "call", "contactId": "<id>" },
  "needsConfirm": true }
```

It runs a built-in rule-based parser, or Claude tool-calling when
`ANTHROPIC_API_KEY` is set in the PocketBase environment. The key stays on the
server. See `pb_hooks/main.pb.js`.

## Notes for production

- **Access rules** are currently public (`""`) so the demo works with no auth.
  Before shipping, enable PocketBase auth and scope the collection list/view/
  create rules to conversation membership.
- **Realtime on device:** React Native has no global `EventSource`. Add a
  polyfill (e.g. `react-native-sse`) so realtime works outside the web build;
  the app degrades gracefully without it.
- **`mine` flag:** this single-user demo stores whether the local user sent a
  message. A multi-user build should replace it with an `author` relation to
  the `users` collection and compute "mine" per viewer.
