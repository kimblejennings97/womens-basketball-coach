// College recruiting, NIL and the transfer portal (docs/recruiting.md).
// - NIL: every college team has a yearly NIL budget (prestige, power conference). Current players hold deals (p.nil); recruits
//   and transfers are offered deals. Players paid well under their market value are likelier to enter the portal.
// - Recruiting: one high-school class per season (G.recruits), generated at the start of the college season; weekly interest
//   from each team's recruiting hours x pull (prestige fit, coach recruiting, NIL vs ask, playing time, a per-pair affinity);
//   commitments from late in the fall through the late signing period (calendar recruitEnd). Committed recruits join at rollover.
// - Portal: opens a few days after the national championship (players with little playing time, underpaid NIL, a coaching change,
//   or good players on weak teams leave); portal players are recruited the same way and join their new team at once.
import { makeRng } from '../engine/rng.js';
import { genPlayer } from '../data/gen.js';
import { posGroup } from '../engine/game.js';
import { ovr, MAX_ROSTER, staffRatings, userTeam } from './world.js';
import { calendar, weekday } from './sched.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hash = s => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
export const POWER = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East']);
const STATES = 'TX 12 CA 10 GA 6 FL 6 NY 5 IL 5 OH 5 NC 5 PA 4 VA 4 MD 4 NJ 4 TN 4 IN 4 MI 4 LA 3 AL 3 SC 3 MO 3 MN 3 WA 3 AZ 3 KY 3 MS 2 OK 2 IA 2 WI 2 CO 2 KS 2 AR 2 OR 2 CT 2 MA 2 UT 1 NV 1 NE 1 SD 1 ND 1 MT 1 ID 1 WV 1 DE 1 DC 1 HI 1 AK 1 ME 1 NH 1 VT 1 RI 1 NM 1 WY 1'.split(' ');
const STATE_W = []; for (let i = 0; i < STATES.length; i += 2) STATE_W.push([STATES[i], +STATES[i + 1]]);

// ---------------------------------------------------------------- NIL
export const nilBudget = t => Math.round((15000 + 3000 * t.prestige ** 1.75) * (POWER.has(t.conf) ? 1.3 : 1) / 1000) * 1000;
// What a college player could get on the open market (by overall). Recruits and transfers ask about this.
export const marketValue = p => Math.round(1500 * Math.exp(0.36 * (ovr(p) - 5)) / 500) * 500;
const STAR_ASK = { 5: 90000, 4: 35000, 3: 10000, 2: 2000 };
// NIL committed for next season: current players who are not leaving + committed recruits / transfers.
export function nilCommitted(G, t) {
  let s = 0;
  for (const id of t.roster) { const p = G.players[id]; if (p && !p.leaving) s += p.nil || 0; }
  for (const id of G.recruits || []) { const R = G.players[id]; if (R && R.rec.commit === t.id && !R.rec.portal) s += R.rec.nil?.[t.id] || 0; }
  return s;
}
export const nilAvailable = (G, t) => (t.nilB ?? nilBudget(t)) - nilCommitted(G, t);
// Initial deals: the better players get paid first, up to ~85% of the budget.
export function initNil(G) {
  for (const t of Object.values(G.teams)) {
    if (t.league !== 'ncaa') continue;
    t.nilB = nilBudget(t);
    aiNilDeals(G, t, makeRng((G.seed ^ hash(t.id + 'nil')) >>> 0));
  }
}
export function aiNilDeals(G, t, rng) {
  let left = t.nilB * 0.85;
  const ps = t.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a));
  for (const p of ps) { const v = Math.round(Math.min(left, marketValue(p) * (0.65 + rng() * 0.45)) / 500) * 500; p.nil = Math.max(0, v); left -= p.nil; }
}

// ---------------------------------------------------------------- recruiting class
// ~1,500 high-school seniors. Stars by rank: 1-30 five, 31-150 four, 151-500 three, the rest two.
export function genClass(G, rng) {
  const raw = [];
  for (let i = 0; i < 1500; i++) {
    const u = i / 1500;
    const lvl = 11.2 - 7.2 * Math.pow(u, 0.45) + rng.gauss() * 0.45;
    const p = genPlayer(rng, { level: lvl, league: 'ncaa', cls: 'FR', age: 18 });
    p.pot = clamp(Math.round(ovr(p) + 1.8 + (1 - u) ** 3 * 6 + rng.gauss() * 1.3), 1, 20);
    raw.push(p);
  }
  raw.sort((a, b) => (ovr(b) * 0.65 + b.pot * 0.35) - (ovr(a) * 0.65 + a.pot * 0.35));
  G.recruits = [];
  raw.forEach((p, i) => {
    const stars = i < 30 ? 5 : i < 150 ? 4 : i < 500 ? 3 : 2;
    const st = rng.weighted(STATE_W, x => x[1])[0];
    Object.assign(p, { team: null, league: 'hs', st: {}, hist: [], inj: null, home: `${st}`, cls: 'HS', num: null });
    p.rec = { stars, rank: i + 1, ask: Math.round(STAR_ASK[stars] * (0.7 + rng() * 0.6) / 500) * 500, int: {}, off: [], nil: {}, commit: null, wk: 0 };
    G.players[p.id] = p; G.recruits.push(p.id);
  });
  for (const t of Object.values(G.teams)) if (t.league === 'ncaa') t.rt = [];
  aiTargets(G, rng);
}
// Recruiting before November (the best seniors have often committed by then): six quiet weeks.
export function precommit(G, rng) { for (let w = 0; w < 6; w++) recruitWeek(G, null, rng, true); }
// A player leaves the game world: kept (without ratings) only if she has stats to remember.
// Kept: anyone who reached the WNBA, and college players with a real career (15+ ppg in a season or 60+ games and 8+ ppg).
export function retire(G, p) {
  const h = p.hist || [];
  const pro = h.some(x => x.league === 'wnba'), col = h.filter(x => x.league === 'ncaa');
  const g = col.reduce((s, x) => s + x.st.g, 0), pts = col.reduce((s, x) => s + x.st.pts, 0);
  const star = col.some(x => x.st.g >= 10 && x.st.pts / x.st.g >= 15);
  if (!pro && !star && !p.aw?.length && !(g >= 60 && pts / g >= 8)) { delete G.players[p.id]; return; }
  p.left = G.season; p.team = null; p.league = 'gone'; delete p.r; delete p.rec; delete p.contract; delete p.nil; delete p.askF; p.inj = null;
}

// Open roster spots for next season.
export function openSpots(G, t) {
  const cal = calendar(G.season);
  const after = G.day >= cal.collegeEnd;   // departures already happened
  let ret = 0, sr = 0;
  for (const id of t.roster) { const p = G.players[id]; if (!p || p.leaving) continue; if (!after && p.cls === 'GR') continue; if (!after && p.cls === 'SR') sr++; else ret++; }
  ret += after ? 0 : Math.round(sr * 0.65);
  const commits = (G.recruits || []).filter(id => { const R = G.players[id]; return R && R.rec.commit === t.id && !R.rec.portal; }).length;
  return MAX_ROSTER.ncaa - ret - commits;
}
const STAR_NEED = { 5: 16, 4: 12.5, 3: 8.5, 2: 5 };
const pstars = R => R.rec.stars;
// AI teams pick targets around their level: ordered by prestige (noisy), each takes recruits around its slot in the class.
function aiTargets(G, rng, portal = false) {
  const ut = userTeam(G), pool = (G.recruits || []).filter(id => { const R = G.players[id]; return R && !R.rec.commit && !!R.rec.portal === portal; });
  if (!pool.length) return;
  const byRank = pool.slice().sort((a, b) => G.players[a].rec.rank - G.players[b].rec.rank);
  const teams = Object.values(G.teams).filter(t => t.league === 'ncaa' && (t.id !== ut || G.user.auto)).map(t => ({ t, k: t.prestige + rng.gauss() * 1.5 })).sort((a, b) => b.k - a.k);
  const per = byRank.length / teams.length;
  teams.forEach(({ t }, j) => {
    const need = portal ? Math.max(0, openSpots(G, t)) : clamp(openSpots(G, t), 1, 6);
    if (!need) return;
    t.rt = (t.rt || []).filter(id => G.players[id]?.rec && !G.players[id].rec.commit);
    const lo = Math.max(0, Math.floor(j * per * 0.55) - 3), hi = Math.min(byRank.length, Math.ceil((j + 1) * per * 1.7) + 12);
    for (let k = 0; k < need * 3 && hi > lo; k++) {
      const id = byRank[lo + Math.floor(rng() * (hi - lo))];
      if (t.rt.includes(id)) continue;
      t.rt.push(id); const R = G.players[id];
      if (!R.rec.off.includes(t.id)) R.rec.off.push(t.id);
      const avail = nilAvailable(G, t);
      R.rec.nil[t.id] = Math.max(0, Math.round(Math.min(avail * 0.4, R.rec.ask * (0.6 + rng() * 0.5)) / 500) * 500);
    }
  });
}
// How strongly a recruit is drawn to a team (per hour of recruiting).
export function pull(G, R, t) {
  const sr = staffRatings(G, t), c = G.coaches[t.coach];
  let x = clamp(0.55 + (R.rec.stars >= 4 ? 0.13 : 0.1) * (t.prestige - (R.rec.portal ? (ovr(R) - 3) : STAR_NEED[pstars(R)])), 0.15, 1.9);
  x *= 0.7 + 0.6 * sr.rec / 20;
  const ask = R.rec.ask, off = R.rec.nil?.[t.id] || 0;
  if (ask > 0) x *= clamp(0.72 + 0.45 * off / ask, 0.72, 1.4);
  const g = posGroup(R.pos), better = t.roster.filter(id => { const p = G.players[id]; return p && !p.leaving && posGroup(p.pos) === g && ovr(p) >= ovr(R) - 0.5 && p.cls !== 'GR'; }).length;
  x *= clamp(1.18 - 0.08 * better, 0.7, 1.18);
  x *= 0.85 + (hash(R.id + t.id) % 1000) / 1000 * 0.3;
  x *= 0.9 + (c ? c.rep : 8) / 100;
  return x;
}
export const userHours = G => { const t = G.teams[userTeam(G)]; return Math.round(40 + 1.5 * (staffRatings(G, t).rec - 10)); };
// One recruiting week (Mondays). rng/quiet used for pre-commitments at class creation.
export function recruitWeek(G, d, rng = null, quiet = false) {
  rng ||= makeRng((G.seed ^ hash('rw' + d)) >>> 0);
  const ut = userTeam(G), cal = calendar(G.season);
  if (d && G.recruits?.some(id => G.players[id]?.rec?.portal) && rng() < 0.5) aiTargets(G, rng, true);
  else if (d && rng() < 0.25) aiTargets(G, rng, false);
  for (const t of Object.values(G.teams)) {
    if (t.league !== 'ncaa') continue;
    let board;
    if (t.id === ut && !G.user.auto) board = Object.entries(G.user.board || {}).filter(([id]) => G.players[id]?.rec && !G.players[id].rec.commit);
    else {
      const live = (t.rt || []).filter(id => G.players[id]?.rec && !G.players[id].rec.commit);
      if (openSpots(G, t) <= 0) continue;
      // AI staffs concentrate: 8 hours a week (the most anyone can spend on one recruit) on each of their four best targets, the rest share what is left
      live.sort((x, y) => G.players[x].rec.rank - G.players[y].rec.rank);
      board = live.map((id, i) => [id, i < 4 ? 8 : Math.max(1, (36 - 32) / Math.max(1, live.length - 4))]);
    }
    for (let [id, h] of board) {
      const R = G.players[id]; if (!R || !+h) continue; h = Math.min(8, +h);
      R.rec.int[t.id] = Math.round(((R.rec.int[t.id] || 0) + h * pull(G, R, t)) * 10) / 10;
    }
  }
  // commitments
  const late = d && d >= cal.collegeEnd;
  for (const id of G.recruits || []) {
    const R = G.players[id]; if (!R || !R.rec || R.rec.commit) continue;
    R.rec.wk++;
    const ranked = R.rec.off.filter(tid => G.teams[tid]?.league === 'ncaa').map(tid => [tid, R.rec.int[tid] || 0]).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;
    const [best, bv] = ranked[0], second = ranked[1]?.[1] || 0;
    const need = R.rec.portal ? 28 : 48 + (R.rec.stars - 2) * 8;
    if (bv < need || bv < second * (late ? 1.08 : 1.2) + 4) continue;
    if (openSpots(G, G.teams[best]) <= 0) continue;
    if (rng() > (R.rec.portal ? 0.45 : late ? 0.5 : 0.25)) continue;
    commit(G, R, best, quiet);
  }
}
export function commit(G, R, tid, quiet = false) {
  const t = G.teams[tid], ut = userTeam(G);
  R.rec.commit = tid;
  const nil = R.rec.nil?.[tid] || 0;
  if (R.rec.portal) {
    t.roster.push(R.id); R.team = tid; R.league = 'ncaa'; R.nil = nil; R.from = R.rec.from;
    delete R.rec; G.recruits = G.recruits.filter(x => x !== R.id);
    if (!quiet && tid === ut) news(G, `Transfer ${R.name} (${R.pos}) commits to ${t.short}.`, 1);
    else if (!quiet && R.from === ut) news(G, `${R.name} transfers to ${t.short}.`, 1);
    return;
  }
  if (!quiet && tid === ut) news(G, `${'★'.repeat(R.rec.stars)} ${R.name} (${R.pos}, No. ${R.rec.rank}) commits to ${t.short}!`, 1);
  else if (!quiet && R.rec.stars === 5) news(G, `Five-star ${R.name} (No. ${R.rec.rank}) commits to ${t.short}.`);
}
const news = (G, text, me = 0) => { G.news.push({ day: G.day + 1, text, me }); if (G.news.length > 300) G.news.splice(0, G.news.length - 300); };

// End of the signing period: teams with open spots take the best remaining recruits; the rest go elsewhere (gone).
export function closeSigning(G, rng) {
  const ut = userTeam(G);
  // undecided recruits with offers sign with the offering team they like most (that still has a spot), the user included
  for (const id of G.recruits || []) {
    const R = G.players[id]; if (!R?.rec || R.rec.commit || R.rec.portal) continue;
    const best = R.rec.off.filter(tid => G.teams[tid]?.league === 'ncaa' && (R.rec.int[tid] || 0) > 10 && openSpots(G, G.teams[tid]) > 0).sort((a, b) => (R.rec.int[b] || 0) - (R.rec.int[a] || 0))[0];
    if (best) commit(G, R, best, best !== ut);
  }
  const left = (G.recruits || []).map(id => G.players[id]).filter(R => R && R.rec && !R.rec.commit && !R.rec.portal).sort((a, b) => a.rec.rank - b.rec.rank);
  const teams = Object.values(G.teams).filter(t => t.league === 'ncaa' && (t.id !== ut || G.user.auto)).sort(() => rng() - 0.5);
  for (const t of teams) {
    let n = Math.min(2, openSpots(G, t));
    while (n-- > 0) {
      const i = left.findIndex(R => STAR_NEED[R.rec.stars] <= t.prestige + 1.5);
      if (i < 0) break;
      commit(G, left.splice(i, 1)[0], t.id, true);
    }
  }
  for (const R of left) delete G.players[R.id];
  G.recruits = (G.recruits || []).filter(id => G.players[id]);
}
// Rollover: committed recruits join their teams as freshmen.
export function joinClass(G) {
  const out = {};
  for (const id of G.recruits || []) {
    const R = G.players[id]; if (!R || !R.rec) continue;
    const t = R.rec.commit && G.teams[R.rec.commit];
    if (!t) { delete G.players[id]; continue; }
    R.team = t.id; R.league = 'ncaa'; R.cls = 'FR'; R.nil = R.rec.nil?.[t.id] || 0; R.stars = R.rec.stars; R.rk = R.rec.rank;
    delete R.rec; t.roster.push(id); (out[t.id] ||= []).push(id);
  }
  G.recruits = [];
  return out;
}

// ---------------------------------------------------------------- transfer portal
// Chance a player enters the portal this spring.
// Minutes per game this college season (after the season ends the stats live in the history).
export function seasonMpg(G, p) {
  const st = p.st && p.st.g ? p.st : p.hist?.find(h => h.season === G.season && h.league === 'ncaa')?.st;
  return st && st.g ? st.sec / 60 / st.g : 0;
}
export function portalRisk(G, p, t) {
  if (!p || p.cls === 'GR' || p.leaving) return 0;
  let r = 0.05;
  const ps = t.roster.map(id => G.players[id]).filter(q => q && !q.leaving).sort((a, b) => ovr(b) - ovr(a));
  const rank = ps.indexOf(p), mpg = seasonMpg(G, p);
  if (mpg < 8) r += 0.16; else if (mpg < 15) r += 0.08;
  if (rank >= 0 && rank < 8 && mpg < 15) r += 0.1;
  const mv = marketValue(p);
  if (mv > 4000) r += clamp((mv - (p.nil || 0)) / mv - 0.25, 0, 0.75) * 0.25;
  if (t.newCoach === G.season) r += 0.1;
  const lvl = ps.slice(0, 8).reduce((s, q) => s + ovr(q), 0) / Math.max(1, Math.min(8, ps.length));
  if (ovr(p) > lvl + 1.5 && t.prestige < 11) r += 0.05 * (ovr(p) - lvl);
  if (p.cls === 'FR') r += 0.03;
  return clamp(r, 0, 0.6);
}
export function openPortal(G, d) {
  const rng = makeRng((G.seed ^ hash('portal' + G.season)) >>> 0), ut = userTeam(G);
  let n = 0, mine = [];
  for (const t of Object.values(G.teams)) {
    if (t.league !== 'ncaa') continue;
    for (const id of t.roster.slice()) {
      const p = G.players[id];
      if (!p || rng() > portalRisk(G, p, t)) continue;
      t.roster = t.roster.filter(x => x !== id);
      p.team = null; p.league = 'portal';
      const stars = ovr(p) >= 13 ? 5 : ovr(p) >= 11 ? 4 : ovr(p) >= 9 ? 3 : 2;
      p.rec = { stars, rank: 0, ask: Math.round(marketValue(p) * (0.9 + rng() * 0.4) / 500) * 500, int: {}, off: [], nil: {}, commit: null, wk: 0, portal: 1, from: t.id };
      (G.recruits ||= []).push(id); n++;
      if (t.id === ut) mine.push(p.name);
    }
  }
  // portal ranks by overall
  const ps = (G.recruits || []).map(id => G.players[id]).filter(R => R?.rec?.portal).sort((a, b) => ovr(b) - ovr(a));
  ps.forEach((R, i) => { R.rec.rank = i + 1; });
  aiTargets(G, rng, true);
  news(G, `The transfer portal opens: ${n} players enter.`);
  if (mine.length) news(G, `Entering the portal from your team: ${mine.join(', ')}.`, 1);
  return n;
}
// Portal closes: teams with open spots take the best remaining transfers that improve them; the rest leave D1.
// Best transfers first; each picks among the three most prestigious teams with a spot that she would improve.
export function closePortal(G, rng) {
  const left = (G.recruits || []).map(id => G.players[id]).filter(R => R?.rec?.portal).sort((a, b) => ovr(b) - ovr(a));
  const ut = userTeam(G);
  const teams = Object.values(G.teams).filter(t => t.league === 'ncaa' && (t.id !== ut || G.user.auto)).sort((a, b) => b.prestige - a.prestige);
  const worst = t => Math.min(...t.roster.map(id => ovr(G.players[id])));
  const gone = [];
  for (const R of left) {
    const opts = teams.filter(t => t.id !== R.rec.from && openSpots(G, t) > 0 && ovr(R) > worst(t) + 0.5 && t.prestige >= ovr(R) - 7).slice(0, 3);
    if (opts.length && rng() < 0.75) commit(G, R, opts[Math.floor(rng() * opts.length)].id, true); else gone.push(R);
  }
  for (const R of gone) { delete R.rec; retire(G, R); }
  G.recruits = (G.recruits || []).filter(id => G.players[id]?.rec);
}
export const isRecruitDay = (G, d) => weekday(d) === 1;
