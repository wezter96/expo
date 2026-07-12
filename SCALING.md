# Scaling Kinly

How far the current architecture goes, what to enable at launch, and what to
do at each growth stage. Companion to `SETUP.md` (first boot) and
`SECURITY.md` (threat model).

## TL;DR

| Users | What's needed |
|---|---|
| ~1,000 | One box (4 vCPU / 8 GB), defaults as shipped. |
| ~10,000 | Bigger box (8–16 cores, NVMe), S3 media + CDN, ulimits raised. The code-level fixes below are already in. |
| 30–50,000 | LiveKit as its own node(s), Litestream warm standby, consider moving typing/pushes out of the request path. |
| 100,000+ | Re-platform the data layer (Postgres-backed API with the same client contract) or shard by family cluster. Separate project. |

The hard constraint: **PocketBase does not cluster.** One writer, vertical
scaling only. Everything below maximizes how far that one node goes and keeps
the exits open.

## Already built for scale (in the code)

- **Windowed message sync.** Clients fetch only the newest 200 messages per
  conversation, in parallel, and merge; older pages load on demand ("Load
  earlier messages" in the chat). No full-history pulls, ever.
- **Batched hot paths.** The conversations endpoint and the push
  fan-out resolve all user records in chunked single queries (no N+1); a
  message push does one mute query per conversation, not one per member.
- **Paged sweeps.** All crons (check-in, reminders, scheduled sends,
  disappearing messages) page through their full result sets — no silent
  500/1000-row truncation. They log if they hit the 20k-row safety cap.
- **Typing-indicator load bounds.** Pings at most every 6s, rows expire at
  10s, and groups larger than 10 members skip typing entirely — typing churn
  is the main SQLite write pressure at scale.
- **Push send timeouts** are 5s so a slow Expo API can't stall message
  creation for long. (A real queue is the 30k+ move; see below.)
- **Indexes** on every sweep/lookup filter (messages by conversation+time,
  users by phone/username/caregiver, guardianships by status, etc.).

## Enable at launch (cheap, hours each — do from day one)

1. **S3 media + CDN.** PocketBase admin → Settings → Files storage → S3
   (Backblaze B2 / Cloudflare R2 / AWS S3), CDN in front. Media is the bulk
   of disk and bandwidth; migrating files later is the painful version.
2. **Litestream replication** (commented service in `docker-compose.yml`).
   Streams the SQLite database to a bucket continuously: point-in-time
   restore + a warm-standby story for the single node.
3. **Raise file limits** (`ulimits` block in the compose file). Every open
   app holds one SSE connection; default limits cap you around ~1k.
4. **Reverse proxy in front of PocketBase** (Caddy/nginx/Cloudflare):
   TLS, gzip/brotli (the web bundle is 3.2 MB → 0.8 MB gzipped), rate
   limiting (the in-process limiter is per-VM and best-effort), and
   request logs.
5. **Host choice = bandwidth pricing.** Video calls relay through the SFU
   (~1.5 Mbps per leg). On Hetzner-style included-traffic plans this is
   free; on per-GB egress clouds it's the biggest line item.
6. **Monitoring**: uptime check + disk alerts + the PocketBase logs UI.
   Watch p95 latency on `/api/kinly/conversations` and message creates —
   they degrade first.

## At ~30k users

- **LiveKit → own node(s)**, then multi-node with Redis (built-in support).
  A single SFU node saturates on bandwidth long before PocketBase does on
  writes.
- **Push queue.** Move Expo pushes out of the message-create path into an
  outbox table + a worker (or a tiny sidecar service). Today's inline send
  costs one 5s-capped HTTP call per message.
- **Typing out of the database.** The cleanest option is a tiny in-memory
  WebSocket sidecar (or LiveKit data channels, already deployed) — typing
  is ephemeral and doesn't belong in SQLite at that write rate.
- **Read replicas aren't a thing in SQLite** — but Litestream read replicas
  or moving PocketBase to a beefier machine (NVMe, 16+ cores) both work.

## The 100k+ exit

Two viable paths, both preserving the client contract (the app only knows
`/api/kinly/*` + the PocketBase record API):

1. **Re-platform**: reimplement the API on Postgres (PocketBase's API shapes
   are simple; the hooks file is the spec). Horizontal reads, real HA.
2. **Shard by family**: Kinly's data is naturally clustered — families
   rarely span shards. Route each account cluster to one of N PocketBase
   nodes. Cheaper than a rewrite, operationally more exotic.

Decide only when >30k is actually in sight; neither is worth building
speculatively.

## Honest caveats

- None of this has run under real load — the backend has never been booted
  in the development sandbox. Load-test before launch (k6/artillery against
  message create + conversations list + SSE connect) and validate the
  assumptions above in the first month of metrics.
- The single node is a single point of failure until Litestream (restore
  runbook!) is enabled and tested.
