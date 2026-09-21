const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

function token() { return localStorage.getItem("st-token") || ""; }
function headers(): Record<string,string> {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  const t = token();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers as any||{}) } });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`);
  return data as T;
}

export type PackMeta = { id: string; locale: string; name: string; count: number; minDifficulty: number | null; maxDifficulty: number | null };
export type PackEntry = { word: string; locale: string; syllables?: string[]; tags?: string[]; difficulty?: number; hint?: string };
export type Stats = { total:number; correct:number; accuracy:number; streak:number; best:number; dayStreak:number; bestDayStreak:number; activeDays:number; xp:number; level:number; xpPrev:number; xpNext:number };
export type LeaderEntry = { username:string; xp:number };
export type DayActivity = { date:string; total:number; correct:number };
export type Activity = { days: DayActivity[]; dayStreak:number; bestDayStreak:number; totalActiveDays:number };
export type HourActivity = { hour:number; total:number; correct:number };

export const api = {
  base: BASE,
 health: () => req<{ok:boolean}>("/health"),
  register: (u:string,p:string)=> req<{token:string,username:string}>("/api/auth/register",{method:"POST",body:JSON.stringify({username:u,password:p})}),
  login: (u:string,p:string)=> req<{token:string,username:string}>("/api/auth/login",{method:"POST",body:JSON.stringify({username:u,password:p})}),
  logout: ()=> req<{ok:boolean}>("/api/auth/logout",{method:"POST"}),
  me: ()=> req<{id:number,username:string}>("/api/me"),
  getWords: ()=> req<{id:number,word:string,timesSeen:number,timesCorrect:number}[]>("/api/words"),
  addWord: (word:string)=> req<{id:number,word:string}>("/api/words",{method:"POST",body:JSON.stringify({word})}),
  deleteWord: (id:number)=> req<{ok:boolean}>(`/api/words/${id}`,{method:"DELETE"}),
  attempt: (wordId:number, correct:boolean, day?:string, hour?:number)=> req<{ok:boolean}>("/api/attempts",{method:"POST",body:JSON.stringify({wordId,correct,day,hour})}),
  stats: ()=> req<Stats>("/api/stats"),
  resetStats: ()=> req<{ok:boolean}>("/api/stats",{method:"DELETE"}),
  activity: (days=182, today?:string)=> req<Activity>(`/api/activity?days=${days}${today ? `&today=${encodeURIComponent(today)}` : ''}`),
  activityHourly: (date:string)=> req<{date:string, hourly:HourActivity[]}>(`/api/activity?date=${encodeURIComponent(date)}`),
  leaderboard: (limit=10)=> req<LeaderEntry[]>(`/api/leaderboard?limit=${limit}`),
  getPacks: ()=> req<PackMeta[]>("/api/packs"),
  getPack: (locale:string, name:string)=> req<PackEntry[]>(`/api/packs/${encodeURIComponent(locale)}/${encodeURIComponent(name)}`),
  audioUrl: (locale:string, word:string)=> `${BASE}/api/audio/${encodeURIComponent(locale)}/${encodeURIComponent(word.trim().toLowerCase())}`,
  setToken(t:string){ if(t) localStorage.setItem("st-token",t); else localStorage.removeItem("st-token"); },
  getToken: token,
};

export function isLoggedIn() { return !!token(); }
