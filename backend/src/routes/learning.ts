import { sql } from "../db.ts";
import { listPacks, loadPack } from "../content.ts";
import { json, body, lockSession, type User } from "../http.ts";
import { XP_PER_CORRECT } from "../xp.ts";
import { loadCurriculum, gradeExercise } from "../curriculum.ts";

export async function handleLearning(req: Request, url: URL, user: User) {
  const path = url.pathname;
  // Append-only, idempotent sync. A guest can import the same history without double counting.
  if (path === '/api/learning' && req.method === 'GET') {
    const attempts = await sql`SELECT payload FROM learning_attempts WHERE user_id=${user.id}`;
    const tests = await sql`SELECT payload FROM learning_tests WHERE user_id=${user.id}`;
    return json({ attempts:attempts.map((r:any)=>r.payload), tests:tests.map((r:any)=>({...r.payload,owner:user.username})) });
  }
  if (path === '/api/learning' && req.method === 'POST') {
    const data = await body<any>(req);
    const uuid = (v:unknown) => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const text = (v:unknown,max:number) => typeof v==='string' && v.length>0 && v.length<=max;
    if (!Array.isArray(data.attempts) || !Array.isArray(data.tests) || data.attempts.length>500 || data.tests.length>100) return json({error:'invalid sync batch'},400);
    const normalized:any[]=[];
    const content=new Map(listPacks().flatMap(p=>loadPack(p.locale,p.name)??[]).map(e=>[`${e.locale}:${e.word.normalize('NFC').toLowerCase()}`,e]));
    const exercises=new Map(loadCurriculum().exercises.map(e=>[e.exerciseId,e]));
    for (const a of data.attempts) {
      if (!a || !uuid(a.id) || !uuid(a.session) || !text(a.word,50) || !/^[\p{L}\p{M}’'\- ]+$/u.test(a.word) || !text(a.submitted,200) || !['en','de','es'].includes(a.locale) || !['practice','test','daily','weak'].includes(a.exercise) || !['none','hint','copy','retry'].includes(a.assistance) || !text(a.date,40) || !Number.isFinite(Date.parse(a.date)) || Date.parse(a.date)>Date.now()+300000 || !/^\d{4}-\d{2}-\d{2}$/.test(a.day) || !Number.isInteger(a.hour) || a.hour<0 || a.hour>23 || !['default','US','UK'].includes(a.standard)) return json({error:'invalid learning answer'},400);
      const writing=a.exerciseId===undefined ? undefined : exercises.get(a.exerciseId);
      if(a.exerciseId!==undefined && (!writing || writing.locale!==a.locale || writing.word.normalize('NFC').toLowerCase()!==a.word.normalize('NFC').trim().toLowerCase())) return json({error:'unknown or mismatched exercise'},400);
      const word=writing?.word ?? a.word.normalize('NFC').trim().toLowerCase(), submitted=a.submitted.normalize('NFC').trim();
      if(!word || !submitted) return json({error:'empty learning answer'},400);
      const entry=content.get(`${a.locale}:${word}`);
      const correct=writing ? gradeExercise(writing,submitted) : [word,...(entry?.variants??[])].some(w=>w.normalize('NFC').toLowerCase()===submitted.toLowerCase());
      normalized.push({id:a.id,session:a.session,word,submitted,locale:a.locale,date:new Date(a.date).toISOString(),day:a.day,hour:a.hour,exercise:a.exercise,assistance:a.assistance,standard:a.standard,correct,...(writing?{exerciseId:writing.exerciseId,skill:writing.skill,variants:writing.variants,caseSensitive:writing.caseSensitive}:{})});
    }
    for (const r of data.tests) if (!r || !uuid(r.id) || !text(r.date,40) || !Number.isFinite(Date.parse(r.date)) || !['en','de','es'].includes(r.locale) || !['starter','intermediate','expert'].includes(r.level) || !Number.isInteger(r.total) || r.total<1 || r.total>10 || !Number.isInteger(r.correct) || r.correct<0 || r.correct>r.total || (r.answers && (!Array.isArray(r.answers) || r.answers.length!==r.total || r.answers.some((a:any)=>!uuid(a?.id))))) return json({error:'invalid test result'},400);
    const synced = await sql.begin(async tx => {
      // Serialize XP awards per learner, including simultaneous retries of the same sync batch.
      if (!await lockSession(tx, req, user)) return false;
      for (const a of normalized) {
        if(a.assistance==='none') {
          const prior=await tx`SELECT 1 FROM learning_attempts WHERE user_id=${user.id} AND id<>${a.id} AND payload->>'session'=${a.session} AND payload->>'word'=${a.word} AND payload->>'locale'=${a.locale} AND COALESCE(payload->>'exerciseId','')=${a.exerciseId??''} LIMIT 1`;
          if(prior.length) a.assistance='retry';
        }
        const inserted=await tx`INSERT INTO learning_attempts(user_id,id,payload) VALUES (${user.id},${a.id},${a}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;
        if (!inserted.length) continue;
        const independent=a.assistance==='none';
        const practice=independent && a.exercise!=='test';
        // Keep activity and legacy statistics, but only independent practice contributes to accuracy.
        // Writing exercises still target one real word, never a sentence or a saved word-list entry.
        const w=await tx`INSERT INTO words(user_id,word,locale,saved) VALUES (${user.id},${a.word.toLowerCase()},${a.locale},FALSE) ON CONFLICT(user_id,locale,word) DO UPDATE SET word=EXCLUDED.word RETURNING id`;
        await tx`INSERT INTO attempts(word_id,correct,day,hour,eligible,exercise,created_at,event_id) VALUES (${w[0].id},${a.correct?1:0},${a.day},${a.hour},${practice},${a.exercise},${a.date},${a.id})`;
        if (practice && a.correct) {
          const prior=await tx`SELECT 1 FROM learning_attempts WHERE user_id=${user.id} AND id<>${a.id} AND lower(payload->>'word')=${a.word.toLowerCase()} AND payload->>'locale'=${a.locale} AND payload->>'day'=${a.day} AND payload->>'assistance'='none' AND payload->>'correct'='true' AND payload->>'exercise'<>'test' LIMIT 1`;
          if (!prior.length) await tx`UPDATE users SET xp=xp+${XP_PER_CORRECT} WHERE id=${user.id}`;
        }
      }
      for (const r of data.tests) {
        // Resolve answers from owned, validated events rather than trusting embedded answer data.
        let answers:any[]=[];
        if (r.answers) for(const a of r.answers) {
          const found=await tx`SELECT payload FROM learning_attempts WHERE user_id=${user.id} AND id=${a.id}`;
          if (found.length && found[0].payload.exercise==='test') answers.push(found[0].payload);
        }
        const result={id:r.id,owner:user.username,date:r.date,locale:r.locale,level:r.level,total:r.total,correct:r.answers?answers.filter(a=>a.correct).length:r.correct,...(answers.length===r.total?{answers}:{})};
        await tx`INSERT INTO learning_tests(user_id,id,payload) VALUES (${user.id},${r.id},${result}::jsonb) ON CONFLICT DO NOTHING`;
      }
      return true;
    });
    if (!synced) return json({ error: "unauthorized" }, 401);
    return json({ok:true});
  }
  // The legacy writer trusted client-supplied scores and bypassed event deduplication.
  if (path === "/api/attempts" && req.method === "POST") {
    return json({error:'use /api/learning with answer events'},410);
  }
}
