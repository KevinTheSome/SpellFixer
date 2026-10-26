const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Credentials and the ledger must keep the same identity when another tab signs in.
function storedSession():{token:string;username:string} {
  try {
    const saved=JSON.parse(localStorage.getItem('st-session') || 'null');
    if(typeof saved?.token==='string' && typeof saved?.username==='string') return saved;
  } catch { /* Fall back to credentials saved before atomic sessions were introduced. */ }
  return {token:localStorage.getItem('st-token') || '',username:localStorage.getItem('st-user') || ''};
}
let session=storedSession();
function token() { return session.token; }
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
export type PackEntry = { word: string; locale: string; syllables?: string[]; tags?: string[]; difficulty?: number; hint?: string; variants?:string[] };
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
   getWords: ()=> req<{id:number,word:string,locale:string,timesSeen:number,timesCorrect:number}[]>("/api/words"),
   addWord: (word:string,locale='en',confirmed=false)=> req<{id:number,word:string}>("/api/words",{method:"POST",body:JSON.stringify({word,locale,confirmed})}),
   learning: ()=>req<{attempts:Attempt[],tests:SavedTest[]}>('/api/learning'),
   syncLearning: (attempts:Attempt[],tests:SavedTest[])=>req<{ok:boolean}>('/api/learning',{method:'POST',body:JSON.stringify({attempts,tests})}),
  deleteWord: (id:number)=> req<{ok:boolean}>(`/api/words/${id}`,{method:"DELETE"}),
  stats: ()=> req<Stats>("/api/stats"),
  resetStats: ()=> req<{ok:boolean}>("/api/stats",{method:"DELETE"}),
  deleteAccountData: (password:string)=> req<{token:string,username:string}>("/api/account/data",{method:"DELETE",body:JSON.stringify({password})}),
  deleteAccount: (password:string)=> req<{ok:boolean}>("/api/account",{method:"DELETE",body:JSON.stringify({password})}),
  activity: (days=182, today?:string)=> req<Activity>(`/api/activity?days=${days}${today ? `&today=${encodeURIComponent(today)}` : ''}`),
  activityHourly: (date:string)=> req<{date:string, hourly:HourActivity[]}>(`/api/activity?date=${encodeURIComponent(date)}`),
  leaderboard: (limit=10,days=30,today='')=> req<LeaderEntry[]>(`/api/leaderboard?limit=${limit}&days=${days}&today=${encodeURIComponent(today)}`),
  getPacks: ()=> req<PackMeta[]>("/api/packs"),
  curriculum: ()=>req<Curriculum>('/api/curriculum'),
  getPack: (locale:string, name:string)=> req<PackEntry[]>(`/api/packs/${encodeURIComponent(locale)}/${encodeURIComponent(name)}`),
  audioUrl: (locale:string, word:string)=> `${BASE}/api/audio/${encodeURIComponent(locale)}/${encodeURIComponent(word.trim().toLowerCase())}`,
   setToken(t:string,username=''){
     const previous=session.token,next={token:t,username};
     if(t || storedSession().token===previous) localStorage.setItem('st-session',JSON.stringify(next));
     session=next;
     if(t) {localStorage.setItem('st-token',t);localStorage.setItem('st-user',username)}
     else if(localStorage.getItem('st-token')===previous) {localStorage.removeItem('st-token');localStorage.removeItem('st-user')}
   },
   getToken: token,
   getUsername: ()=>session.username,
};

export function isLoggedIn() { return !!token(); }
import type { Attempt, SavedTest, Curriculum } from './learning'
