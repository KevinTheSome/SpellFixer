import { beforeEach, expect, mock, test } from "bun:test";

// Route wiring can be checked without starting a server or touching a real database.
const sql = mock(async (_query: TemplateStringsArray, ..._values: unknown[]) => [] as any[]);
mock.module("./db.ts", () => ({
  sql,
  getUserByToken: async (token: string) => token === "valid-token" ? { id: 42, username: "learner" } : null,
  num: (value: unknown) => value == null ? 0 : Number(value),
  isUniqueViolation: () => false,
}));
const { handleRequest } = await import("./app.ts");

beforeEach(() => sql.mockClear());

function request(path: string, method = "GET", token = "", data?: unknown) {
  return handleRequest(new Request(`http://localhost${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }));
}

test("health, preflight, packs and missing content remain public", async () => {
  expect(await (await request("/health")).json()).toEqual({ ok: true });
  const preflight = await request("/api/learning", "OPTIONS");
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  const packs = await (await request("/api/packs")).json();
  expect(packs.some((pack: any) => pack.id === "en/starter")).toBe(true);
  expect((await request("/api/packs/en/starter")).status).toBe(200);
  const curriculum=await (await request('/api/curriculum')).json();
  expect(curriculum.skills).toHaveLength(3);
  expect(curriculum.exercises.length).toBeGreaterThanOrEqual(30);
  expect((await request("/api/packs/en/missing-pack")).status).toBe(404);
  expect((await request("/api/audio/en/missing-audio")).status).toBe(404);
  expect((await request("/missing")).status).toBe(404);
  expect(sql).not.toHaveBeenCalled();
});

test("every protected route rejects missing or invalid credentials before querying data", async () => {
  for (const token of ["", "invalid-token"]) {
    for (const path of ["/api/words", "/api/words/1", "/api/learning", "/api/attempts", "/api/stats", "/api/activity", "/api/account", "/api/account/data"]) {
      for (const method of ["GET", "POST", "DELETE"]) {
        expect((await request(path, method, token)).status).toBe(401);
      }
    }
    expect((await request("/api/me", "GET", token)).status).toBe(401);
    expect((await request("/api/auth/logout", "POST", token)).status).toBe(401);
  }
  expect(sql).not.toHaveBeenCalled();
});

test("authenticated word, learning and activity reads reach their modules with the user ID", async () => {
  for (const path of ["/api/words", "/api/learning", "/api/activity?date=2026-10-26"]) {
    sql.mockClear();
    expect((await request(path, "GET", "valid-token")).status).toBe(200);
    expect(sql).toHaveBeenCalled();
    for (const [, ...values] of sql.mock.calls) expect(values).toContain(42);
  }
  expect((await request("/api/attempts", "POST", "valid-token")).status).toBe(410);
});

test("auth, word, learning and leaderboard validation survives the split", async () => {
  expect((await request("/api/auth/register", "POST", "", {})).status).toBe(400);
  expect((await request("/api/auth/login", "POST", "", {})).status).toBe(400);
  expect((await request("/api/words", "POST", "valid-token", { word: "<script>" })).status).toBe(400);
  expect((await request("/api/learning", "POST", "valid-token", {})).status).toBe(400);
  expect((await request("/api/leaderboard?days=999")).status).toBe(400);
  expect((await request("/api/account", "DELETE", "valid-token", {})).status).toBe(400);
  expect((await request("/api/account/data", "DELETE", "valid-token", { password: [] })).status).toBe(400);
  expect(sql).not.toHaveBeenCalled();
});

const writingAnswer=()=>({id:crypto.randomUUID(),session:crypto.randomUUID(),word:'because',locale:'en',submitted:'because',date:new Date().toISOString(),day:'2026-10-26',hour:12,exercise:'daily',assistance:'none',standard:'default',exerciseId:'spelling_because_01'});

test('unknown exercises, mismatched targets and blank submissions are rejected before database writes',async()=>{
  for(const change of [{exerciseId:'made_up'},{word:'fake'},{locale:'de'},{submitted:'   '},{exerciseId:null}]) {
    expect((await request('/api/learning','POST','valid-token',{attempts:[{...writingAnswer(),...change}],tests:[]})).status).toBe(400);
  }
  expect(sql).not.toHaveBeenCalled();
});

test('writing answers use trusted content, not client scores, variants or skill labels',async()=>{
  const saved:any[]=[];
  const tx=mock(async(query:TemplateStringsArray,...values:any[])=>{
    const text=query.join('?');
    if(text.includes('SELECT id FROM users') || text.includes('SELECT 1 FROM tokens')) return [{id:42}];
    if(text.includes('INSERT INTO learning_attempts')) {saved.push(structuredClone(values[2]));return [{id:values[1]}]}
    if(text.includes('INSERT INTO words')) return [{id:1}];
    return [];
  });
  Object.assign(sql,{begin:async(run:(tx:unknown)=>unknown)=>run(tx)});
  const a={...writingAnswer(),submitted:'fake',correct:true,variants:['fake'],skill:'invented'};
  expect((await request('/api/learning','POST','valid-token',{attempts:[a],tests:[]})).status).toBe(200);
  expect(saved[0]).toMatchObject({correct:false,word:'because',skill:'common_spelling',exerciseId:'spelling_because_01'});
  expect(saved[0].variants).toBeUndefined();
  const wordInsert=tx.mock.calls.find(([query])=>query.join('?').includes('INSERT INTO words'))!;
  expect(wordInsert[2]).toBe('because');
  expect(wordInsert[0].join('?')).toContain('FALSE');
});
