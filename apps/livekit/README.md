# Kinly video — LiveKit

Group video calls (Discord-style, up to ~10 people) run on
[LiveKit](https://livekit.io) — an open-source (Apache-2.0) WebRTC **SFU**. An
SFU forwards each person's stream to everyone else, which is what lets a call
scale past the ~4-person limit of peer-to-peer mesh.

**Why this keeps the $4.99 / 10-member plan viable:** the only real cost of
video is bandwidth. A 10-person call at 360p is ~16 GB/hour of server egress.
On a cheap-bandwidth host (Hetzner/OVH — ~20 TB included on a €5 box) that's
effectively free; on AWS/GCP egress or a per-minute managed video API it would
blow the whole budget. **Self-host on cheap-bandwidth hardware.**

## Run it

```bash
cd apps/livekit
# Dev mode with the built-in test key (devkey / secret):
docker run --rm --network host livekit/livekit-server --dev

# …or with this config (edit the key/secret first!):
docker compose up
```

LiveKit listens on `:7880` (signalling) and needs the UDP media range open.

## Wire it to the backend

The app never sees the LiveKit secret. It asks PocketBase for a token
(`POST /api/kinly/video-token`), and the PocketBase hook signs a LiveKit JWT.
Set these in the **PocketBase** environment (see `apps/pocketbase`):

```
LIVEKIT_URL=ws://<YOUR_LAN_OR_SERVER_IP>:7880   # wss:// in production
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret_change_me_to_a_32char_min_secret
```

The key/secret must match `livekit.yaml`. In production use a domain with TLS
(`wss://`) and strong, unique keys.

## App requirements

The mobile app uses `@livekit/react-native` + `@livekit/react-native-webrtc`,
which are **native modules** — they need a custom dev build and do **not** run
in Expo Go or the web bundle:

```bash
cd apps/native
npx expo run:ios      # or: npx expo run:android  (or an EAS dev build)
```

On web (and in Expo Go) the app shows a friendly "open on your phone"
placeholder instead of the call (`src/video/VideoCall.tsx`); the real call UI is
`src/video/VideoCall.native.tsx`.

## How a call flows

1. In a chat, tap the **video** icon in the header → `app/call/[id].tsx`.
2. The app requests a token from PocketBase for room = the conversation id.
3. It connects to LiveKit and joins; anyone else who opens the same
   conversation's call joins the same room.
4. Big on-screen controls: mute, camera on/off, and a red **Leave** button.

## Production notes

- Put LiveKit behind TLS (`wss://`) and open the UDP media ports.
- For clients behind strict NATs, enable LiveKit's built-in TURN (see
  `livekit.yaml`) or run coturn.
- One mid dedicated box handles many concurrent participants; scale out with
  additional nodes + Redis when needed.
