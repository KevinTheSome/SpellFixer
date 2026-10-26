import { sql, num, isUniqueViolation } from "../db.ts";
import { json, body, getAuth, bearerToken } from "../http.ts";

export async function handleAuth(req: Request, url: URL) {
  const path = url.pathname;
  if (path === "/api/auth/register" && req.method === "POST") {
    const { username, password } = await body<{username:string,password:string}>(req);
    if(typeof username!=='string' || typeof password!=='string') return json({error:'username and password required'},400);
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
    if(typeof username!=='string' || typeof password!=='string') return json({error:'username and password required'},400);
    const u = (username||"").trim().toLowerCase();
    const rows = await sql`SELECT id, password_hash FROM users WHERE username=${u}`;
    const row = rows[0] as any;
    if (!row) return json({ error: "invalid credentials" }, 401);
    const ok = await Bun.password.verify(password.trim(), row.password_hash);
    if (!ok) return json({ error: "invalid credentials" }, 401);
    const token = crypto.randomUUID();
    await sql`INSERT INTO tokens (token, user_id) VALUES (${token},${row.id})`;
    return json({ token, username: u });
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    const user = await getAuth(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const tok = bearerToken(req);
    await sql`DELETE FROM tokens WHERE token=${tok}`;
    return json({ ok: true });
  }
  if (path === "/api/me" && req.method === "GET") {
    const user = await getAuth(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const rows = await sql`SELECT xp FROM users WHERE id=${user.id}`;
    return json({ ...user, xp: num((rows[0] as any)?.xp) });
  }
}
