# Spelling backend (Bun + Postgres)

## Setup

Postgres must be running first (docker or local):

```sh
docker compose up db        # from the repo root, or run your own Postgres
cd backend
bun install
bun src/index.ts
```

## Environment

| Var | Required | Default | Notes |
| --- | -------- | ------- | ----- |
| `DATABASE_URL` | no | `postgres://app:app@localhost:5432/app` | compose sets `postgres://app:app@db:5432/app` |
| `PORT` / `CONTENT_DIR` | no | `3000` / `../content` | — |

## Audio endpoint

`GET /api/audio/:locale/:word` — public (guest mode needs it).

- Serves the static file `content/<locale>/audio/<word>.mp3` (lowercased) as
  `audio/mpeg` with a long immutable `Cache-Control` (browser caches it).
- To add audio for a word, drop an `.mp3` at e.g.
  `backend/content/en/audio/beautiful.mp3` and rebuild/restart the backend
  (the file is served from the image's `content/` dir).
- Missing/invalid word → `404`, and the frontend falls back to the browser's
  built-in voice (`speechSynthesis`), so the exercise always works.

## Docker persistence

`docker-compose.yml` mounts `pgdata:/var/lib/postgresql/data` on the `db`
service, so Postgres data survives `down`, `up --build`, and image rebuilds.
Only `docker compose down -v` deletes it (that destroys the volume by design).
Audio files are baked into the image via `COPY content`, not stored on the volume.

## Tests

```sh
bun test            # unit tests, no network calls
bunx tsc --noEmit   # typecheck
```
