// Reusable ESPN bake: given a fixtures map, emit OFFICIAL + META (goals + starting XI + shootout) lines.
// Usage: node scripts/bake.mjs fixtures.json
//   fixtures.json = { "91": ["Brazil","Norway"], "92": ["Mexico","England"], ... }
//   (match number -> [team1, team2] in the app's M[] t1/t2 order; use resolved real teams for knockouts)
// Prints two blocks to stdout: "===OFFICIAL===" then lines, "===META===" then lines. Splice into index.html.
import { readFileSync } from 'fs';

const fixturesPath = process.argv[2];
if (!fixturesPath) { console.error('usage: node scripts/bake.mjs fixtures.json'); process.exit(1); }
const FIX = JSON.parse(readFileSync(fixturesPath, 'utf8'));

const ALIAS = { southkorea:'korearepublic', usa:'unitedstates', unitedstatesofamerica:'unitedstates', congodr:'drcongo',
  bosniaherzegovina:'bosniaandherzegovina', cotedivoire:'ivorycoast', caboverde:'capeverde', capeverdeislands:'capeverde', turkey:'turkiye' };
const nk = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const key = s => { const k = nk(s); return ALIAS[k] || k; };
const pair = (a,b) => [key(a),key(b)].sort().join('|');
const J = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u+' '+r.status); return r.json(); };

// index ESPN scoreboards across the whole tournament window
const byPair = {};
for (const [mo, d1, d2] of [[6,11,30],[7,1,19]]) {
  for (let d = d1; d <= d2; d++) {
    const dt = `2026${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}`;
    try { const sb = await J(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dt}`);
      for (const e of (sb.events||[])) { const c = e.competitions[0];
        if (!/FULL_TIME|FINAL/.test(e.status.type.name)) continue;
        byPair[pair(c.competitors[0].team.displayName, c.competitors[1].team.displayName)] = { c, comps: c.competitors, eventId: e.id };
      }
    } catch {}
  }
}

const off = [], meta = [];
for (const num of Object.keys(FIX)) {
  const [T1,T2] = FIX[num]; const ev = byPair[pair(T1,T2)];
  if (!ev) { console.error(`MISSING ${num} ${T1} v ${T2}`); continue; }
  const k1 = key(T1), k2 = key(T2); const id2t = {}, sc = {}, so = {};
  ev.comps.forEach(z => { const kk = key(z.team.displayName); const t = kk===k1?1:(kk===k2?2:null); id2t[z.team.id]=t;
    if (t) { sc[t] = parseInt(z.score,10); if (z.shootoutScore != null) so[t] = parseInt(z.shootoutScore,10); } });
  let o = `  ${num}:{a:${sc[1]},b:${sc[2]}`; if (so[1]!=null && so[2]!=null) o += `,pa:${so[1]},pb:${so[2]}`; o += '},'; off.push(o);
  const goals = [];
  (ev.c.details||[]).forEach(d => { if (!d.scoringPlay || d.shootout) return;   // exclude shootout kicks
    const t = id2t[d.team && d.team.id]; if (!t) return;
    const p = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || ''; if (!p) return;
    let g = `{t:${t},p:${JSON.stringify(p)},m:${JSON.stringify((d.clock&&d.clock.displayValue)||'')}`;
    if (d.ownGoal) g += ',n:"OG"'; else if (d.penaltyKick) g += ',n:"PEN"'; goals.push(g+'}'); });
  let xi1=null, xi2=null;
  try { const sum = await J(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${ev.eventId}`);
    (sum.rosters||[]).forEach(rt => { const kk = key(rt.team && rt.team.displayName);
      const st = (rt.roster||[]).filter(p=>p.starter).sort((a,b)=>(+a.formationPlace||99)-(+b.formationPlace||99))
        .map(p=>p.athlete && p.athlete.displayName).filter(Boolean).slice(0,11);
      if (st.length===11) { if (kk===k1) xi1=st; else if (kk===k2) xi2=st; } });
  } catch {}
  const xiStr = (xi1||xi2) ? `xi:{1:${xi1?JSON.stringify(xi1):'null'},2:${xi2?JSON.stringify(xi2):'null'}}` : '';
  const goalStr = goals.length ? `goals:[${goals.join(',')}]` : '';
  meta.push(`  ${num}:{${[goalStr,xiStr].filter(Boolean).join(',\n      ')}},`);
  console.error(`ok ${num} ${T1} ${sc[1]}-${sc[2]} ${T2}${so[1]!=null?` PENS ${so[1]}-${so[2]}`:''} | g${goals.length} xi${xi1?11:0}/${xi2?11:0}`);
}
console.log('===OFFICIAL==='); console.log(off.join('\n'));
console.log('===META==='); console.log(meta.join('\n'));
