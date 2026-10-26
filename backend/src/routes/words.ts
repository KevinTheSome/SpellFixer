import { sql, num, isUniqueViolation } from "../db.ts";
import { listPacks, loadPack } from "../content.ts";
import { json, body, lockSession, type User } from "../http.ts";

export async function handleWords(req: Request, url: URL, user: User) {
  const path = url.pathname;
  if (path === "/api/words" && req.method === "GET") {
    const rows = await sql`
      SELECT w.id, w.word, w.locale, w.created_at, COUNT(a.id) FILTER (WHERE a.eligible) AS seen, COALESCE(SUM(a.correct) FILTER (WHERE a.eligible),0) AS correct
      FROM words w LEFT JOIN attempts a ON a.word_id=w.id
       WHERE w.user_id=${user.id} AND w.saved GROUP BY w.id ORDER BY w.created_at DESC`;
    return json((rows as any[]).map(r => ({
      id: r.id, word: r.word, locale:r.locale, createdAt: r.created_at,
      timesSeen: num(r.seen), timesCorrect: num(r.correct),
    })));
  }
  if (path === "/api/words" && req.method === "POST") {
    const { word, locale='en', confirmed=false } = await body<{word:string,locale?:string,confirmed?:boolean}>(req);
    if(typeof word!=='string' || !['en','de','es'].includes(locale)) return json({error:'word and language required'},400);
    const w = word.normalize('NFC').trim().toLowerCase();
    if(!/^[\p{L}\p{M}’'\- ]+$/u.test(w)) return json({error:'use letters, spaces, apostrophes or hyphens'},400);
    if (!w) return json({ error: "word required" }, 400);
    if (w.length > 50) return json({ error: "word too long" }, 400);
    const known=listPacks().filter(p=>p.locale===locale).some(p=>(loadPack(p.locale,p.name)??[]).some(e=>e.word.normalize('NFC').toLowerCase()===w));
    if(!known && confirmed!==true) return json({error:'confirm spelling for names or unusual words'},400);
    try {
      return await sql.begin(async tx => {
        if (!await lockSession(tx, req, user)) return json({ error: "unauthorized" }, 401);
        const rows = await tx`INSERT INTO words (user_id, word, locale) VALUES (${user.id},${w},${locale}) ON CONFLICT(user_id,locale,word) DO UPDATE SET saved=TRUE WHERE NOT words.saved RETURNING id, word, created_at`;
        if(!rows.length) return json({error:'word already exists'},409);
        const r = rows[0] as any;
        return json({ id: r.id, word: r.word, locale, timesSeen: 0, timesCorrect: 0 }, 201);
      });
    } catch (e:any) {
      if (isUniqueViolation(e)) return json({ error: "word already exists" }, 409);
      return json({ error: "db error" }, 500);
    }
  }
  if (path.match(/^\/api\/words\/\d+$/) && req.method === "DELETE") {
    const id = Number(path.split("/").pop());
    return sql.begin(async tx => {
      if (!await lockSession(tx, req, user)) return json({ error: "unauthorized" }, 401);
      const rows = await tx`UPDATE words SET saved=FALSE WHERE id=${id} AND user_id=${user.id} AND saved RETURNING id`;
      if (!rows.length) return json({ error: "not found" }, 404);
      return json({ ok: true });
    });
  }
}
