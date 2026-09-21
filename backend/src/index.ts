import { sql, getUserByToken, num, isUniqueViolation } from "./db.ts";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { audioFileFor } from "./audio.ts";
import { XP_PER_CORRECT, xpProgress } from "./xp.ts";

const PORT = Number(process.env.PORT || 3000);
const CONTENT_DIR = process.env.CONTENT_DIR || join(dirname(fileURLToPath(import.meta.url)), "../content");

type PackEntry = { word: string; locale: string; syllables?: string[]; tags?: string[]; difficulty?: number; hint?: string };
type PackMeta = { id: string; locale: string; name: string; count: number; minDifficulty: number | null; maxDifficulty: number | null };

// ponytail: directory scan, new pack = new folder/file, no code change
function listPacks(): PackMeta[] {
  const out: PackMeta[] = [];
  if (!existsSync(CONTENT_DIR)) return out;
  for (const locale of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const packsDir = join(CONTENT_DIR, locale.name, "packs");
    if (!existsSync(packsDir)) continue;
    for (const f of readdirSync(packsDir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith(".json")) continue;
      const name = f.name.slice(0, -5);
      try {
        const entries = JSON.parse(readFileSync(join(packsDir, f.name), "utf8")) as PackEntry[];
        const diffs = entries.map(e => e.difficulty).filter((d): d is number => typeof d === "number");
        out.push({
          id: `${locale.name}/${name}`,
          locale: locale.name,
          name,
          count: entries.length,
          minDifficulty: diffs.length ? Math.min(...diffs) : null,
          maxDifficulty: diffs.length ? Math.max(...diffs) : null,
        });
      } catch { /* skip unreadable pack */ }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function loadPack(locale: string, name: string): PackEntry[] | null {
  if (!/^[a-zA-Z-]{2,10}$/.test(locale) || !/^[a-zA-Z0-9-]+$/.test(name)) return null;
  const p = join(CONTENT_DIR, locale, "packs", `${name}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackEntry[];
  } catch { return null; }
}

type DayRow = { date: string; total: number; correct: number };

// ponytail: day streak derived from per-day attempt rows — same data, works on any device
function fmtDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function dayActivity(userId: number, nDays: number, anchor?: string) {
  const raw = await sql`
    SELECT day as date, COUNT(*) as total, SUM(correct) as correct
    FROM attempts a JOIN words w ON w.id=a.word_id
    WHERE w.user_id=${userId} AND a.day IS NOT NULL GROUP BY day ORDER BY day ASC`;
  const rows: DayRow[] = raw.map((r: any) => ({ date: r.date, total: num(r.total), correct: num(r.correct) }));
  const byDay = new Map(rows.map(r => [r.date, r]));
  const days: DayRow[] = [];
  const today = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? new Date(anchor + "T12:00:00") : new Date();
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = fmtDay(d);
    const r = byDay.get(k);
    days.push({ date: k, total: r?.total ?? 0, correct: r?.correct ?? 0 });
  }
  const active = new Set(rows.filter(r => r.total > 0).map(r => r.date));
  // current streak: consecutive active days ending today, or yesterday if today is empty
  let dayStreak = 0;
  const cursor = new Date(today);
  if (!active.has(fmtDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(fmtDay(cursor))) { dayStreak++; cursor.setDate(cursor.getDate() - 1); }
  // best streak over all history
  let bestDayStreak = 0, cur = 0, prev = 0;
  for (const k of [...active].sort()) {
    const t = new Date(k + "T00:00:00").getTime();
    cur = prev && t - prev === 864e5 ? cur + 1 : 1;
    bestDayStreak = Math.max(bestDayStreak, cur);
    prev = t;
  }
  return { days, dayStreak, bestDayStreak, totalActiveDays: active.size };
}

function json(data: unknown, status = 200, extraHeaders: Record<string,string>={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extraHeaders },
  });
}
function corsHeaders(): Record<string,string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}
async function getAuth(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)/);
  if (!m) return null;
  return getUserByToken(m[1]);
}
async function body<T>(req: Request): Promise<T> {
  try { return await req.json() as T; } catch { return {} as T; }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    // health — public
    if (path === "/health") return json({ ok: true });

    // word packs — public, served from backend/content/<locale>/packs/*.json
    if (path === "/api/packs" && req.method === "GET") return json(listPacks());
    {
      const m = path.match(/^\/api\/packs\/([^/]+)\/([^/]+)$/);
      if (m && req.method === "GET") {
        const pack = loadPack(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
        if (!pack) return json({ error: "pack not found" }, 404);
        return json(pack);
      }
    }

    // audio — public (guest mode needs audio), static per-word files:
    // backend/content/<locale>/audio/<word>.mp3 (lowercase). Missing file -> 404, frontend falls back to browser voice.
    {
      const m = path.match(/^\/api\/audio\/([^/]+)\/([^/]+)$/);
      if (m && req.method === "GET") {
        const file = audioFileFor(CONTENT_DIR, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
        if (!file || !existsSync(file)) return json({ error: "no audio for word" }, 404);
        return new Response(Bun.file(file), { status: 200, headers: {
          "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable", ...corsHeaders() } });
      }
    }

    // auth — public
    if (path === "/api/auth/register" && req.method === "POST") {
      const { username, password } = await body<{username:string,password:string}>(req);
      const u = (username||"").trim().toLowerCase();
      const p = (password||"").trim();
      if (!u || u.length < 2 || !p || p.length < 3) return json({ error: "username (2+) and password (3+) required" }, 400);
      if (!/^[a-z0-9_\-]+$/.test(u)) return json({ error: "username: a-z 0-9 _ - only" }, 400);
      const hash = await Bun.password.hash(p);
      try {
        const rows = await sql`INSERT INTO users (username, password_hash) VALUES (${u},${hash}) RETURNING id`;
        const token = crypto.randomUUID();
        await sql`INSERT INTO tokens (token, user_id) VALUES (${token},${(rows[0] as any).id})`;
        return json({ token, username: u });
      } catch (e:any) {
        if (isUniqueViolation(e)) return json({ error: "username taken" }, 409);
        return json({ error: "db error" }, 500);
      }
    }
    if (path === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await body<{username:string,password:string}>(req);
      const u = (username||"").trim().toLowerCase();
      const rows = await sql`SELECT id, password_hash FROM users WHERE username=${u}`;
      const row = rows[0] as any;
      if (!row) return json({ error: "invalid credentials" }, 401);
      const ok = await Bun.password.verify(password||"", row.password_hash);
      if (!ok) return json({ error: "invalid credentials" }, 401);
      const token = crypto.randomUUID();
      await sql`INSERT INTO tokens (token, user_id) VALUES (${token},${row.id})`;
      return json({ token, username: u });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const user = await getAuth(req);
      if (!user) return json({ error: "unauthorized" }, 401);
      const tok = req.headers.get("authorization")!.split(" ")[1];
      await sql`DELETE FROM tokens WHERE token=${tok}`;
      return json({ ok: true });
    }
    if (path === "/api/me" && req.method === "GET") {
      const user = await getAuth(req);
      if (!user) return json({ error: "unauthorized" }, 401);
      const rows = await sql`SELECT xp FROM users WHERE id=${user.id}`;
      return json({ ...user, xp: num((rows[0] as any)?.xp) });
    }

    // leaderboard — public, top XP only (guest XP stays in localStorage, never listed)
    if (path === "/api/leaderboard" && req.method === "GET") {
      const n = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
      const rows = await sql`
        SELECT username, xp FROM users ORDER BY xp DESC, username ASC LIMIT ${n}`;
      return json((rows as any[]).map(r => ({ username: r.username, xp: num(r.xp) })));
    }

    // protected routes (guest = no backend call, so 401 is correct for unauthenticated)
    const user = await getAuth(req);
    if (!user) {
      if (path.startsWith("/api/words") || path.startsWith("/api/attempts") || path.startsWith("/api/stats") || path.startsWith("/api/activity")) {
        return json({ error: "unauthorized - login or use guest mode (local)" }, 401);
      }
    }

    // words
    if (path === "/api/words" && req.method === "GET") {
      const rows = await sql`
        SELECT w.id, w.word, w.created_at, COUNT(a.id) AS seen, COALESCE(SUM(a.correct),0) AS correct
        FROM words w LEFT JOIN attempts a ON a.word_id=w.id
        WHERE w.user_id=${user!.id} GROUP BY w.id ORDER BY w.created_at DESC`;
      return json((rows as any[]).map(r => ({
        id: r.id, word: r.word, createdAt: r.created_at,
        timesSeen: num(r.seen), timesCorrect: num(r.correct),
      })));
    }
    if (path === "/api/words" && req.method === "POST") {
      const { word } = await body<{word:string}>(req);
      const w = (word||"").trim().toLowerCase();
      if (!w) return json({ error: "word required" }, 400);
      if (w.length > 50) return json({ error: "word too long" }, 400);
      try {
        const rows = await sql`INSERT INTO words (user_id, word) VALUES (${user!.id},${w}) RETURNING id, word, created_at`;
        const r = rows[0] as any;
        return json({ id: r.id, word: r.word, timesSeen: 0, timesCorrect: 0 }, 201);
      } catch (e:any) {
        if (isUniqueViolation(e)) return json({ error: "word already exists" }, 409);
        return json({ error: "db error" }, 500);
      }
    }
    if (path.match(/^\/api\/words\/\d+$/) && req.method === "DELETE") {
      const id = Number(path.split("/").pop());
      const rows = await sql`DELETE FROM words WHERE id=${id} AND user_id=${user!.id} RETURNING id`;
      if (!rows.length) return json({ error: "not found" }, 404);
      return json({ ok: true });
    }
    // attempts
    if (path === "/api/attempts" && req.method === "POST") {
      const { wordId, word, correct, day, hour } = await body<{wordId?:number, word?:string, correct:boolean, day?:string, hour?:number}>(req);
      if (typeof correct !== "boolean") return json({ error: "correct boolean required" }, 400);
      const d = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : fmtDay(new Date());
      const h = typeof hour === "number" && hour >= 0 && hour <= 23 ? Math.floor(hour) : null;
      let wid = wordId;
      if (!wid && word) {
        const rows = await sql`SELECT id FROM words WHERE user_id=${user!.id} AND word=${word.trim().toLowerCase()}`;
        if (!rows.length) return json({ error: "word not found" }, 404);
        wid = (rows[0] as any).id;
      }
      if (!wid) return json({ error: "wordId or word required" }, 400);
      // verify ownership
      const own = await sql`SELECT id FROM words WHERE id=${wid} AND user_id=${user!.id}`;
      if (!own.length) return json({ error: "not found" }, 404);
      await sql`INSERT INTO attempts (word_id, correct, day, hour) VALUES (${wid}, ${correct?1:0}, ${d}, ${h})`;
      // ponytail: correct word = +10 XP, level derived client-side from XP
      let xp = 0;
      if (correct) {
        await sql`UPDATE users SET xp = xp + ${XP_PER_CORRECT} WHERE id=${user!.id}`;
        const r = await sql`SELECT xp FROM users WHERE id=${user!.id}`;
        xp = num((r[0] as any).xp);
      }
      return json({ ok: true, xpAwarded: correct ? XP_PER_CORRECT : 0, xp });
    }
    if (path === "/api/activity" && req.method === "GET") {
      // ?date=YYYY-MM-DD -> per-hour breakdown for the day view (local hours, from client-sent hour)
      const dateParam = url.searchParams.get("date");
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const rows = await sql`
          SELECT hour, COUNT(*) as total, SUM(correct) as correct
          FROM attempts a JOIN words w ON w.id=a.word_id
          WHERE w.user_id=${user!.id} AND a.day=${dateParam} GROUP BY hour`;
        const byHour = new Map(
          (rows as any[]).filter(r => r.hour != null).map(r => [Number(r.hour), r]));
        const hourly = Array.from({ length: 24 }, (_, hour) => {
          const r = byHour.get(hour);
          return { hour, total: r ? num(r.total) : 0, correct: r ? num(r.correct) : 0 };
        });
        return json({ date: dateParam, hourly });
      }
      const n = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 182));
      return json(await dayActivity(user!.id, n, url.searchParams.get("today") || undefined));
    }
    if (path === "/api/stats" && req.method === "GET") {
      const s = (await sql`SELECT COUNT(*) as total, SUM(correct) as correct FROM attempts a JOIN words w ON w.id=a.word_id WHERE w.user_id=${user!.id}`)[0] as any;
      const total = num(s?.total);
      const correct = num(s?.correct);
      // streak/best computed from sequential attempts — simple: current consecutive correct at end
      const rows = await sql`SELECT correct FROM attempts a JOIN words w ON w.id=a.word_id WHERE w.user_id=${user!.id} ORDER BY a.id ASC` as any[];
      const vals = rows.map(r => Number(r.correct));
      let streak=0, best=0, cur=0;
      for (const v of vals) {
        if (v) { cur++; best=Math.max(best,cur); } else cur=0;
      }
      // current streak is trailing correct run
      cur=0;
      for (let i=vals.length-1;i>=0;i--) { if (vals[i]) cur++; else break; }
      streak=cur;
      const da = await dayActivity(user!.id, 365);
      const xpRow = (await sql`SELECT xp FROM users WHERE id=${user!.id}`)[0] as any;
      const xp = num(xpRow?.xp);
      const { level, prev, next } = xpProgress(xp);
      return json({ total, correct, accuracy: total?Math.round(correct/total*100):0, streak, best,
        dayStreak: da.dayStreak, bestDayStreak: da.bestDayStreak, activeDays: da.totalActiveDays,
        xp, level, xpPrev: prev, xpNext: next });
    }
    if (path === "/api/stats" && req.method === "DELETE") {
      await sql`DELETE FROM attempts WHERE word_id IN (SELECT id FROM words WHERE user_id=${user!.id})`;
      await sql`UPDATE users SET xp=0 WHERE id=${user!.id}`;
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`backend listening on ${PORT} (postgres=${(process.env.DATABASE_URL || "postgres://app:app@localhost:5432/app").replace(/:[^:@/]+@/, ":***@")})`);
