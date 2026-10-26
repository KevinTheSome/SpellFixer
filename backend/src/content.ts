import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { audioFileFor } from "./audio.ts";
import { json, corsHeaders } from "./http.ts";
import { loadCurriculum } from "./curriculum.ts";

const CONTENT_DIR = process.env.CONTENT_DIR || join(dirname(fileURLToPath(import.meta.url)), "../content");

type PackEntry = { word: string; locale: string; syllables?: string[]; tags?: string[]; difficulty?: number; hint?: string; variants?:string[] };
type PackMeta = { id: string; locale: string; name: string; count: number; minDifficulty: number | null; maxDifficulty: number | null };

// ponytail: directory scan, new pack = new folder/file, no code change
export function listPacks(): PackMeta[] {
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

export function loadPack(locale: string, name: string): PackEntry[] | null {
  if (!/^[a-zA-Z-]{2,10}$/.test(locale) || !/^[a-zA-Z0-9-]+$/.test(name)) return null;
  const p = join(CONTENT_DIR, locale, "packs", `${name}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackEntry[];
  } catch { return null; }
}

export function handleContent(req: Request, url: URL) {
  const path = url.pathname;
  // Word packs and audio are public so guest practice works without an account.
  if (path === "/api/curriculum" && req.method === "GET") return json(loadCurriculum());
  if (path === "/api/packs" && req.method === "GET") return json(listPacks());
  const packMatch = path.match(/^\/api\/packs\/([^/]+)\/([^/]+)$/);
  if (packMatch && req.method === "GET") {
    const pack = loadPack(decodeURIComponent(packMatch[1]), decodeURIComponent(packMatch[2]));
    if (!pack) return json({ error: "pack not found" }, 404);
    return json(pack);
  }
  const audioMatch = path.match(/^\/api\/audio\/([^/]+)\/([^/]+)$/);
  if (audioMatch && req.method === "GET") {
    const file = audioFileFor(CONTENT_DIR, decodeURIComponent(audioMatch[1]), decodeURIComponent(audioMatch[2]));
    if (!file || !existsSync(file)) return json({ error: "no audio for word" }, 404);
    return new Response(Bun.file(file), { status: 200, headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable", ...corsHeaders() } });
  }
}
