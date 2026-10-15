# SpellingImprover9000

## Warning this whole project is "vibe-coded"
The only human writen line of code.

A spelling drill web app: listen to a word, type what you hear, get scored.
Works as a guest (offline, browser storage) or with an account (progress synced
to the server). Word lists (“packs”) come in three languages with per-word audio.

## Layout

| Path | What |
| --- | --- |
| `backend/` | Bun + Postgres API. Serves packs, audio, auth, words, attempts, stats |
| `backend/content/<locale>/packs/*.json` | Word packs (the actual curriculum) |
| `backend/content/<locale>/audio/*.mp3` | One static audio file per word |
| `backend/scripts/tts-backfill.py` | Generates missing audio files via edge-tts |
| `frontend/` | Vue 3 + TypeScript + Vite SPA |
| `e2e/` | Playwright tests, run against the docker stack |
| `docker-compose.yml` | Postgres (:5432) + backend (:3000) + frontend (:5173) |

## Run locally (no docker)

You need Postgres running locally (or `docker compose up db`), plus
[Bun](https://bun.sh) for the backend:

```sh
cd backend
bun install
bun src/index.ts        # or: bun --watch src/index.ts
```

`DATABASE_URL` defaults to `postgres://app:app@localhost:5432/app` — make sure
a database exists there (compose's `db` service uses user/password/db `app`).

Frontend needs Node:

```sh
cd frontend
npm install
npm run dev             # vite dev server (proxies to VITE_API_URL or localhost:3000)
```

Open the vite URL. Guest mode works without the backend except packs/audio,
which are fetched from `VITE_API_URL` (default `http://localhost:3000`).

## Run with docker

```sh
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000 (`/health` for a quick check)

Notes:

- The backend image bakes in `backend/content` (`COPY content`), so after
  changing packs or audio you must rebuild (`up --build`), not just restart.
- `VITE_API_URL` is baked into the frontend at build time (compose sets it to
  `http://localhost:3000`).
- The Postgres data lives on the `pgdata` volume and survives rebuilds.
  `docker compose down -v` deletes it by design.

## Test

Backend unit tests + typecheck (no network):

```sh
cd backend
bun test
bunx tsc --noEmit
```

End-to-end (needs the docker stack up on :3000/:5173):

```sh
cd e2e
npm install
npx playwright install chromium   # first time only (browsers)
npx playwright test
```

What’s covered:

| File | What |
| --- | --- |
| `tests/drill.spec.ts` | Word drill works (Listen → type → score); sequential mode advances in list order; random mode advances to a different listed word; stats record correct + wrong attempts (header counts, accuracy, per-word details) |
| `tests/spelling.spec.ts` | Backend health, guest drill feedback, register/login/logout, word list management |
| `tests/features.spec.ts` | Drill-mode picker + weakest-mode lock, hint skips scoring, stats grouped by language/difficulty, pack API serves hints |
| `tests/audio.spec.ts` | `/api/audio` serves mp3 (incl. case-insensitive), 404 falls back to browser voice, Listen button actually plays backend audio |
| `tests/wanted-features.spec.ts` | Dark themes, full-width responsive statistics, shared date filters, personal-word persistence and account isolation |

`drill.spec.ts` seeds guest `localStorage` with a known word list and tracks the
hidden current word via the `/api/audio/` request the Listen/Next buttons fire
(the word itself is never shown on screen — that’s the point of the exercise).
When waiting for the *next* word it filters out stale `<audio>` range
re-requests of the previous file, which otherwise makes the test flaky.

## Language packs

Packs live at `backend/content/<locale>/packs/*.json` and are served as-is:

- `GET /api/packs` → `[{ id, locale, name, count, minDifficulty, maxDifficulty }]`
- `GET /api/packs/:locale/:name` → word entries

Three tiers per language, matching the app’s difficulty bands:

| Pack | Stars | en | de | es |
| --- | --- | --- | --- | --- |
| `starter.json` | ★1–2 | 105 | 55 | 59 |
| `intermediate.json` | ★3–4 | 75 | 50 | 46 |
| `expert.json` | ★5 | 48 | 30 | 30 |

Entry schema (`difficulty` 1–5, rest optional except `word`/`locale`):

```json
{ "word": "accommodate", "locale": "en", "syllables": ["ac","com","mo","date"],
  "tags": ["double-consonant"], "difficulty": 3, "hint": "2 c's, 2 m's" }
```

Conventions: entries are sorted by (difficulty, word length, alphabet) so each
pack ramps up; a pack’s words must stay inside its star band. Adding a pack is
just adding a file — the backend discovers it on `/api/packs` automatically.

## Scripts

`backend/scripts/tts-backfill.py` — generates every missing
`content/<locale>/audio/<word>.mp3` with edge-tts (skips existing files):

```sh
cd backend
pip install edge-tts
python3 scripts/tts-backfill.py            # add --force to regenerate all
```

Voices default to `en-US-AvaNeural` / `de-DE-AmalaNeural` / `es-ES-ElviraNeural`,
overridable via `VOICE_EN`, `VOICE_DE`, `VOICE_ES` (or `VOICE_DEFAULT`).
Rebuild the backend image afterwards so the new files are served from docker.

## Important behaviors

- **My words:** add words in English, German or Spanish; confirm unusual spellings.
  Guest words stay on this device; account words are saved to the backend.
  “Practice these words” switches from a pack to your saved list.
- **Statistics:** the top Day / Week / Month control filters all sections, including
  the leaderboard. Week and month mean the last 7 and 30 local calendar days.
  The main header still shows lifetime progress; review status retains earlier learning evidence.
- **Themes:** Settings includes Navy and Forest dark presets alongside the existing themes.
- **Guest vs account:** guests store words/stats in `localStorage` only; logging
  in moves everything server-side (per-word seen/correct, per-day activity).
- **Audio fallback:** missing mp3 → backend 404 → frontend uses the browser’s
  built-in voice, so drills never break. The per-word file is just cached
  (`Cache-Control: immutable`) for consistent pronunciation.
- **Hints are unscored:** showing a hint excludes that attempt from stats.
- **Weakest-first mode** unlocks after spelling over half the pack at least once.
