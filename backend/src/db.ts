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

// fresh schema — no migrations, data is disposable
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

export async function getUserByToken(token: string) {
  const rows = await sql`
    SELECT u.id, u.username FROM tokens t
    JOIN users u ON u.id = t.user_id WHERE t.token = ${token}`;
  return (rows[0] as unknown as { id: number; username: string } | undefined) ?? null;
}

// postgres reports counts/sums as strings (int8/numeric) — coerce once here
export const num = (v: unknown) => (v == null ? 0 : Number(v));

export function isUniqueViolation(e: any) {
  return e?.code === "23505" || /unique|duplicate/i.test(String(e?.message ?? e));
}
