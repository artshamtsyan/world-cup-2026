// Fetches FIFA World Cup 2026 results + top scorers from football-data.org
// and writes data.json (served alongside the app). Token via FOOTBALL_DATA_TOKEN env.
import { writeFileSync, readFileSync } from 'fs';

const T = process.env.FOOTBALL_DATA_TOKEN;
if (!T) { console.error('Missing FOOTBALL_DATA_TOKEN'); process.exit(1); }
const base = 'https://api.football-data.org/v4/competitions/WC';
const H = { headers: { 'X-Auth-Token': T } };

const j = async (u) => { const r = await fetch(u, H); if (!r.ok) throw new Error(u + ' -> ' + r.status); return r.json(); };

const m = await j(`${base}/matches`);
const s = await j(`${base}/scorers?limit=60`);

const results = (m.matches || [])
  .filter(x => x.status === 'FINISHED' && x.score?.fullTime?.home != null)
  .map(x => ({ home: x.homeTeam.name, away: x.awayTeam.name,
               hs: x.score.fullTime.home, as: x.score.fullTime.away, utc: x.utcDate }));

const scorers = (s.scorers || [])
  .map(x => ({ name: x.player.name, team: x.team.name, goals: x.goals || 0, pens: x.penalties || 0, assists: x.assists || 0 }))
  .filter(x => x.goals > 0);

const out = { updated: new Date().toISOString(), source: 'football-data.org', results, scorers };

let prev = ''; try { prev = readFileSync('data.json', 'utf8'); } catch {}
// compare ignoring the timestamp so we only commit on real data changes
const stripTs = o => JSON.stringify({ ...JSON.parse(o), updated: 0 });
let changed = true; try { changed = stripTs(prev) !== stripTs(JSON.stringify(out)); } catch { changed = true; }

if (changed) writeFileSync('data.json', JSON.stringify(out, null, 1));
console.log(`data.json: ${results.length} results, ${scorers.length} scorers, changed=${changed}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: 'a' });
