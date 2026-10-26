import { sql, num } from "../db.ts";
import { json, lockSession, type User } from "../http.ts";
import { XP_PER_CORRECT, xpProgress } from "../xp.ts";

type DayRow = { date: string; total: number; correct: number };

function fmtDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ponytail: day streak derived from per-day attempt rows — same data, works on any device
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
    const t = new Date(k + "T00:00:00Z").getTime();
    cur = prev && t - prev === 864e5 ? cur + 1 : 1;
    bestDayStreak = Math.max(bestDayStreak, cur);
    prev = t;
  }
  return { days, dayStreak, bestDayStreak, totalActiveDays: active.size };
}

// Public: guest XP stays in localStorage, never listed.
export async function handleLeaderboard(req: Request, url: URL) {
  if (url.pathname !== "/api/leaderboard" || req.method !== "GET") return;
  const n = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  if (url.searchParams.has('days')) {
    const days=Number(url.searchParams.get('days')), today=url.searchParams.get('today') || fmtDay(new Date());
    if (![1,7,30].includes(days) || !/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(today+'T12:00:00Z')) || new Date(today+'T12:00:00Z').toISOString().slice(0,10)!==today) return json({error:'invalid leaderboard period'},400);
    const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
    const rows=await sql`
      SELECT u.username, COUNT(DISTINCT (a.word_id,a.day))*${XP_PER_CORRECT} AS xp
      FROM users u JOIN words w ON w.user_id=u.id JOIN attempts a ON a.word_id=w.id
      WHERE a.eligible AND a.exercise<>'test' AND a.correct=1 AND a.day>=${start.toISOString().slice(0,10)} AND a.day<=${today}
      GROUP BY u.id ORDER BY xp DESC, u.username ASC LIMIT ${n}`;
    return json(rows.map((r:any)=>({username:r.username,xp:num(r.xp)})));
  }
  const rows = await sql`
    SELECT username, xp FROM users ORDER BY xp DESC, username ASC LIMIT ${n}`;
  return json((rows as any[]).map(r => ({ username: r.username, xp: num(r.xp) })));
}

export async function handleStatistics(req: Request, url: URL, user: User) {
  const path = url.pathname;
  if (path === "/api/activity" && req.method === "GET") {
    // ?date=YYYY-MM-DD -> per-hour breakdown for the day view (local hours, from client-sent hour)
    const dateParam = url.searchParams.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const rows = await sql`
        SELECT hour, COUNT(*) as total, SUM(correct) as correct
        FROM attempts a JOIN words w ON w.id=a.word_id
        WHERE w.user_id=${user.id} AND a.day=${dateParam} GROUP BY hour`;
      const byHour = new Map(
        (rows as any[]).filter(r => r.hour != null).map(r => [Number(r.hour), r]));
      const hourly = Array.from({ length: 24 }, (_, hour) => {
        const r = byHour.get(hour);
        return { hour, total: r ? num(r.total) : 0, correct: r ? num(r.correct) : 0 };
      });
      return json({ date: dateParam, hourly });
    }
    const n = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 182));
    return json(await dayActivity(user.id, n, url.searchParams.get("today") || undefined));
  }
  if (path === "/api/stats" && req.method === "GET") {
    const s = (await sql`SELECT COUNT(*) as total, SUM(correct) as correct FROM attempts a JOIN words w ON w.id=a.word_id WHERE w.user_id=${user.id} AND a.eligible`)[0] as any;
    const total = num(s?.total);
    const correct = num(s?.correct);
    const rows = await sql`SELECT correct, eligible FROM attempts a JOIN words w ON w.id=a.word_id WHERE w.user_id=${user.id} ORDER BY a.created_at ASC, a.event_id ASC NULLS FIRST, a.id ASC` as any[];
    const events = await sql`SELECT (payload->>'correct')::boolean AS correct, payload->>'assistance' AS assistance, payload->>'exercise' AS exercise FROM learning_attempts WHERE user_id=${user.id} ORDER BY payload->>'date' ASC, id ASC` as any[];
    // Complete ledgers also recover original event order for answers synced before timestamps were stored.
    // shortcut: mixed legacy histories keep recorded timestamps until a verified historical migration is available.
    const vals = events.length===rows.length
      ? events.filter(r=>r.assistance==='none' && r.exercise!=='test').map(r=>Number(r.correct))
      : rows.filter(r=>r.eligible).map(r=>Number(r.correct));
    let streak=0, best=0, cur=0;
    for (const v of vals) {
      if (v) { cur++; best=Math.max(best,cur); } else cur=0;
    }
    // current streak is trailing correct run
    cur=0;
    for (let i=vals.length-1;i>=0;i--) { if (vals[i]) cur++; else break; }
    streak=cur;
    const da = await dayActivity(user.id, 365);
    const xpRow = (await sql`SELECT xp FROM users WHERE id=${user.id}`)[0] as any;
    const xp = num(xpRow?.xp);
    const { level, prev, next } = xpProgress(xp);
    return json({ total, correct, accuracy: total?Math.round(correct/total*100):0, streak, best,
      dayStreak: da.dayStreak, bestDayStreak: da.bestDayStreak, activeDays: da.totalActiveDays,
      xp, level, xpPrev: prev, xpNext: next });
  }
  if (path === "/api/stats" && req.method === "DELETE") {
    return sql.begin(async tx=>{
      if (!await lockSession(tx, req, user)) return json({ error: "unauthorized" }, 401);
      await tx`DELETE FROM attempts WHERE word_id IN (SELECT id FROM words WHERE user_id=${user.id})`;
      await tx`DELETE FROM learning_attempts WHERE user_id=${user.id}`;
      await tx`DELETE FROM learning_tests WHERE user_id=${user.id}`;
      await tx`UPDATE users SET xp=0 WHERE id=${user.id}`;
      return json({ ok: true });
    });
  }
}
