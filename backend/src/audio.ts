import { join, basename } from "path";

// Static per-word audio: backend/content/<locale>/audio/<word>.mp3 (lowercase).
// Returns null for invalid input (caller answers 404, frontend falls back to browser voice).
export function audioFileFor(contentDir: string, locale: string, word: string): string | null {
  const w = word.trim().toLowerCase();
  if (!/^[a-zA-Z-]{2,10}$/.test(locale) || !/^[\p{L}\p{N}'-]{1,50}$/u.test(w)) return null;
  // ponytail: basename blocks ../ traversal, single mp3 convention until a pack needs more
  return join(contentDir, locale, "audio", `${basename(w)}.mp3`);
}
