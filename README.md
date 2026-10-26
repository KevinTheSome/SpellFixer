# SpellingImprover9000

## Warning this whole project is "vibe-coded"
The only human writen line of code.

A spelling and grammar practice app: read a sentence, type one corrected word
or contraction, and learn why the spelling works. New profiles start in
**Correct spelling** mode; existing drill preferences are preserved.
Works as a guest (offline, browser storage) or with an account (progress synced
to the server). The text-first pilot is in English. Existing word lists and
optional dictation remain available in English, German and Spanish.

## Text-first learning

- **42 exercises, three skills:** common spelling patterns, confusing words,
  and apostrophes/contractions. Correct a marked word or type a missing word;
  no audio or answer-choice buttons are required.
- **Teach, then apply:** daily and skill lessons introduce one rule with two
  examples before practice. Answers receive a correction, an explanation and
  a contrasting example. British `colour` and American `color` are both accepted
  in the relevant exercise; typographic apostrophes are accepted, but meaningful
  punctuation and explicitly tested capitalization are not ignored.
- **Personalized sessions:** eight main questions mix due reviews, weak skills
  and fresh examples. Up to two missed questions return after two intervening
  questions, without replacing the main questions. Later mistakes stay due for
  a future session. Reviews retain the existing 10-minute / 1 / 3 / 7 / 14-day
  schedule; assisted answers never establish mastery.
- **My mistakes:** Statistics includes actual submitted mistakes, their corrected
  words, and exercise explanations, with a practice action. A revealed notebook
  answer is assisted study when practised again. Skill progress uses up to the
  latest 20 independent answers per skill within the selected statistics period;
  remembering an item does not prove mastery of a whole skill.
- **Persistence:** public lesson content is cached after download; guest and
  account answer histories remain separate. Account sync, guest import, resets
  and deletion use the existing ledger. Exercise IDs distinguish contexts with
  the same target word. XP remains limited to one award per word per day.

Curriculum lives in `backend/content/en/practice.json` and is served publicly by
`GET /api/curriculum`. Exercise IDs identify immutable prompts: give a materially
different prompt or answer a new ID. Every exercise targets one real word or
contraction; whole sentences are never added to a user's word bank. The server
resolves IDs and grades against its own content, not client-provided answer keys,
variants, skill labels or scores. No new dependencies or database migration are
needed. Free-form writing grading and diagnostic placement are not included.

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

### Source structure

- `frontend/src/App.vue` is the shared shell; `pages/` contains Practice, My words, Test, Statistics and Settings.
- `frontend/src/components/` holds the header/account menu and reusable word manager. Shared styles live in `styles/app.css`.
- `frontend/src/composables/` separates theme, audio, self-test and statistics logic. `createSpellingApp.ts` coordinates practice, accounts and learning sync; `appContext.ts` shares that single instance so navigating does not reset progress. Translations live in `i18n.ts`.
- `backend/src/index.ts` starts Bun; `app.ts` dispatches requests and guards protected routes. `routes/` contains auth, account deletion, learning, words and statistics; `content.ts` serves packs/audio and `http.ts` holds request/response helpers.

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
| `tests/regressions.spec.ts` | Mocked-API checks for safe resets, tab isolation, login recovery, sync limits, weakest mode, test loading and DST |
| `tests/api-regressions.spec.ts` | Password/logout handling, retired score writer, event ordering, concurrent reset/sync and calendar-day streaks |
| `tests/page-state.spec.ts` | Shared shell/preferences and unfinished practice, tests, word forms and statistics periods survive page changes (mocked API) |
| `tests/account-deletion.spec.ts` | Password checks, confirmation/cancellation, failed deletes, complete account/data erasure, session revocation, concurrent writes and guest-data preservation |
| `tests/writing-practice.spec.ts` | Fresh-profile text-first practice, explanations, micro-lessons, bounded delayed retries, mistake notebook, navigation, offline content, spelling variants and guest-to-account import (mocked API) |
| `tests/learning-logic.spec.ts` | Client/server writing-grade parity, exercise identities, skill evidence, balanced lesson selection, non-destructive retries and legacy learning/sync logic |

Existing browser drill tests explicitly start with the saved `rand` mode;
writing-practice tests use a fresh profile to verify the new `correct` default.

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
- **Guest vs account:** guest progress stays in `localStorage`; logging in uses
  a separate server-synced account ledger. Registration can import guest words,
  answers and tests without deleting the guest copy on this device.
- **Audio fallback:** missing mp3 → backend 404 → frontend uses the browser’s
  built-in voice, so drills never break. The per-word file is just cached
  (`Cache-Control: immutable`) for consistent pronunciation.
- **Hints are unscored:** showing a hint excludes that attempt from stats.
- **Weakest-first mode** unlocks after spelling over half the pack at least once.
- **Reset settings** changes appearance and app language only. **Clear stats** separately deletes learning history, tests, activity and XP.
- **Account deletion:** signed-in Settings includes **Delete data** (saved words, answers, tests, activity and XP; account kept) and **Delete account** (account and all its data). Both require the current password and explicit confirmation. Deletion is permanent; the current browser's account cache is cleared, but guest data and offline copies on other devices are not erased. Data deletion rotates the current session and signs out other sessions so stale uploads cannot immediately restore deleted progress.
- **Deletion API:** `DELETE /api/account/data` and `DELETE /api/account` accept `{ "password": "current password" }` with Bearer authentication. The former returns a replacement `{ token, username }`; the latter revokes every session. Writes are serialized with deletion and recheck the session after acquiring the learner lock.
- **Answer limits:** new answers are limited to 200 characters. Older oversized answers and tests that depend on them stay on this device, with a warning; they do not block other uploads.
- **Account tabs:** each open tab keeps its own credentials and does not adopt another tab's login. Logging out still revokes that session on the server.
- **Attempt API:** `POST /api/attempts` is retired (HTTP 410). Submit answer events through `/api/learning`; client-supplied scores are not accepted.
- **Historical streaks:** complete answer ledgers are ordered by original answer time. Mixed legacy histories without event timestamps keep their recorded timestamps rather than inventing historical dates.

Run regressions only against a disposable, isolated stack with dummy accounts, no external network, an allowlisted environment, read-only source/toolchain, scratch-only writes, and CPU/memory/process/file-size/disk/time limits. API tests create disposable users and clear only their progress. Repeat the calendar-day API check with the backend's `TZ=Europe/Berlin`; changing the browser timezone alone does not cover the backend.
