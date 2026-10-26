import { corsHeaders, getAuth, json } from "./http.ts";
import { handleContent } from "./content.ts";
import { handleAuth } from "./routes/auth.ts";
import { handleAccount } from "./routes/account.ts";
import { handleLearning } from "./routes/learning.ts";
import { handleWords } from "./routes/words.ts";
import { handleLeaderboard, handleStatistics } from "./routes/statistics.ts";

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (path === "/health") return json({ ok: true });

  const publicResponse = handleContent(req, url)
    ?? await handleAuth(req, url)
    ?? await handleLeaderboard(req, url);
  if (publicResponse) return publicResponse;

  // Protected handlers only receive an authenticated user; ownership checks stay in their queries.
  const user = await getAuth(req);
  if (!user) {
    if (path.startsWith("/api/words") || path.startsWith("/api/attempts") || path.startsWith("/api/stats") || path.startsWith("/api/activity") || path.startsWith("/api/learning") || path.startsWith("/api/account")) {
      return json({ error: "unauthorized - login or use guest mode (local)" }, 401);
    }
    return json({ error: "not found" }, 404);
  }
  return await handleAccount(req, url, user)
    ?? await handleLearning(req, url, user)
    ?? await handleWords(req, url, user)
    ?? await handleStatistics(req, url, user)
    ?? json({ error: "not found" }, 404);
}
