import { SQL } from "bun";

// ponytail: Bun's built-in postgres client, no extra dependency
export const sql = new SQL(
  process.env.DATABASE_URL || "postgres://app:app@localhost:5432/app",
);

// postgres may still be starting (docker) — retry briefly
for (let i = 0; i < 30; i++) {
  try {
    await sql`SELECT 1`;
    break;
  } catch {
    if (i === 29) throw new Error("cannot reach postgres (DATABASE_URL)");
    await Bun.sleep(1000);
  }
}

// Additive schema changes preserve existing learner data.
await sql`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`;
await sql`
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`;
await sql`
CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word)
)`;
await sql`
CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  correct INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  day TEXT,
  hour INTEGER
)`;

await sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`;
await sql`ALTER TABLE words ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT TRUE`;
await sql`ALTER TABLE words DROP CONSTRAINT IF EXISTS words_user_id_word_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS words_language_key ON words(user_id, locale, word)`;
await sql`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS eligible BOOLEAN NOT NULL DEFAULT TRUE`;
await sql`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS exercise TEXT NOT NULL DEFAULT 'practice'`;
await sql`ALTER TABLE attempts ADD COLUMN IF NOT EXISTS event_id UUID`;
await sql`CREATE TABLE IF NOT EXISTS learning_attempts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL, payload JSONB NOT NULL, PRIMARY KEY(user_id,id)
)`;
await sql`CREATE TABLE IF NOT EXISTS learning_tests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL, payload JSONB NOT NULL, PRIMARY KEY(user_id,id)
)`;
await sql`UPDATE learning_attempts SET payload=(payload #>> '{}')::jsonb WHERE jsonb_typeof(payload)='string'`;
await sql`UPDATE learning_tests SET payload=(payload #>> '{}')::jsonb WHERE jsonb_typeof(payload)='string'`;

export async function getUserByToken(token: string) {
  const rows = await sql`
    SELECT u.id, u.username FROM tokens t
    JOIN users u ON u.id = t.user_id WHERE t.token = ${token}`;
  return (
    (rows[0] as unknown as { id: number; username: string } | undefined) ?? null
  );
}

// postgres reports counts/sums as strings (int8/numeric) — coerce once here
export const num = (v: unknown) => (v == null ? 0 : Number(v));

export function isUniqueViolation(e: any) {
  return (
    e?.code === "23505" || /unique|duplicate/i.test(String(e?.message ?? e))
  );
}

export function hello(number: number) {}
