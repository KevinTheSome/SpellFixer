import { getUserByToken } from "./db.ts";
import type { TransactionSQL } from "bun";

export type User = NonNullable<Awaited<ReturnType<typeof getUserByToken>>>;

export function json(data: unknown, status = 200, extraHeaders: Record<string,string>={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extraHeaders },
  });
}
export function corsHeaders(): Record<string,string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}
export const bearerToken = (req:Request) => req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
export async function getAuth(req: Request) {
  const token=bearerToken(req);
  return token ? getUserByToken(token) : null;
}
export async function lockSession(tx: TransactionSQL, req: Request, user: User) {
  // Check the token after acquiring the learner lock: deletion may have revoked it while this request waited.
  const rows = await tx`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`;
  if (!rows.length) return false;
  const tokens = await tx`SELECT 1 FROM tokens WHERE user_id=${user.id} AND token=${bearerToken(req)}`;
  return tokens.length > 0;
}
export async function body<T>(req: Request): Promise<T> {
  try { const data=await req.json();return data && typeof data==='object' && !Array.isArray(data) ? data as T : {} as T; } catch { return {} as T; }
}
