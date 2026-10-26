import { sql } from "../db.ts";
import { json, body, lockSession, type User } from "../http.ts";

export async function handleAccount(req: Request, url: URL, user: User) {
  const path = url.pathname;
  if (req.method !== "DELETE" || (path !== "/api/account" && path !== "/api/account/data")) return;
  const { password } = await body<{ password: string }>(req);
  if (typeof password !== "string" || !password.trim()) return json({ error: "current password required" }, 400);

  return sql.begin(async tx => {
    if (!await lockSession(tx, req, user)) return json({ error: "unauthorized" }, 401);
    const rows = await tx`SELECT password_hash FROM users WHERE id=${user.id}`;
    if (!await Bun.password.verify(password.trim(), rows[0].password_hash)) return json({ error: "incorrect password" }, 403);

    if (path === "/api/account") {
      // Foreign-key cascades remove tokens, words, attempts and learning history together.
      await tx`DELETE FROM users WHERE id=${user.id}`;
      return json({ ok: true });
    }
    await tx`DELETE FROM words WHERE user_id=${user.id}`;
    await tx`DELETE FROM learning_attempts WHERE user_id=${user.id}`;
    await tx`DELETE FROM learning_tests WHERE user_id=${user.id}`;
    await tx`UPDATE users SET xp=0 WHERE id=${user.id}`;
    // Old sessions must not re-upload their cached progress after the wipe.
    await tx`DELETE FROM tokens WHERE user_id=${user.id}`;
    const token = crypto.randomUUID();
    await tx`INSERT INTO tokens(token, user_id) VALUES (${token},${user.id})`;
    return json({ token, username: user.username }, 200, { "Cache-Control": "no-store" });
  });
}
