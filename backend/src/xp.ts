// Shared XP/level curve (levels derived from XP, never stored).
// level 0 starts at 0 XP, level 1 at 100 XP, then:
//   threshold(n) = threshold(n-1) + 100 + ln(threshold(n-1))^2
// No level cap — loop until the threshold exceeds the XP.
export const XP_PER_CORRECT = 10;

export function thresholdForLevel(level: number): number {
  if (level <= 0) return 0;
  let t = 100; // level 1
  for (let n = 2; n <= level; n++) t = Math.floor(t + 100 + Math.log(t) ** 2);
  return t;
}

export function levelForXp(xp: number): number {
  if (!(xp > 0)) return 0;
  let level = 0;
  let next = 100;
  while (xp >= next) {
    level++;
    next = Math.floor(next + 100 + Math.log(next) ** 2);
  }
  return level;
}

export function xpProgress(xp: number): { level: number; prev: number; next: number } {
  const level = levelForXp(xp);
  const prev = thresholdForLevel(level);
  const next = thresholdForLevel(level + 1);
  return { level, prev, next };
}
