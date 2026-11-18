// Offseasons on the shared calendar (docs/offseason.md):
// college (after the national final): season archive, coach growth, prestige, departures (5th years, seniors who move on,
//   draft declarations), coaching carousel, transfer portal, end of signing; the WNBA draft (lottery for the non-playoff teams,
//   3 rounds); WNBA: roster cuts, free agency (re-sign window, then open market), trades, carousel after the Finals;
// rollover to the next season: development + aging, classes advance, recruits join, schedules, new recruiting class.
import { makeRng } from '../engine/rng.js';
import { genPlayer, randomName as randomCoachName } from '../data/gen.js';
import * as W from './world.js';
import { calendar, buildNcaaSchedule, buildWnbaSchedule } from './sched.js';
import * as RC from './recruit.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = x => Math.round(x * 10) / 10;
const hash = s => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const rngFor = (G, key) => makeRng((G.seed ^ hash(key + G.season)) >>> 0);
const ovr = p => W.ovr(p);   // (not W.ovr directly: world.js imports this module, so W is not ready at load time)
const news = (G, text, me = 0) => { G.news.push({ day: G.day + 1, text, me }); if (G.news.length > 300) G.news.splice(0, G.news.length - 300); };
const ut = G => W.userTeam(G);
const teamsOf = (G, lg) => Object.values(G.teams).filter(t => t.league === lg);
const pct = (w, l) => (w + l ? w / (w + l) : 0.5);
const nm = t => t.short || t.name;

// ---------------------------------------------------------------- season archive
export const NCAA_FINISH = ['First round', 'Second round', 'Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'];
export const WNBA_FINISH = ['First round', 'Semifinals', 'Finals', 'Champion'];
// How far a team went: ncaa = index into NCAA_FINISH (-1 First Four loss, null not in), wnba = index into WNBA_FINISH.
export function finish(G, t) {
  if (t.league === 'ncaa') {
    const B = G.bracket; if (!B || !B.seeds?.[t.id]) return null;
    let wins = 0, ff = false;
    for (const g of G.games) if (g.tid === B.id && (g.h === t.id || g.a === t.id) && g.done) { const won = (g.h === t.id) === (g.s[0] > g.s[1]); if (g.pre != null) { if (!won) ff = true; } else if (won) wins++; }
    return ff ? -1 : wins;
  }
  const P = G.wpo; if (!P || !P.seeds?.includes(t.id)) return null;
  let wins = 0; P.r.forEach(rd => rd.forEach(sr => { if (sr.win === t.id) wins++; }));
  return wins;
}
export const finishLabel = (lg, f) => f == null ? '' : lg === 'ncaa' ? (f === -1 ? 'First Four' : 'NCAA ' + NCAA_FINISH[f]) : (f === 3 ? 'WNBA Champion' : 'Playoffs: ' + WNBA_FINISH[f]);

function archive(G, lg) {
  for (const p of Object.values(G.players)) {
    if (p.st && p.st.g && (p.league === lg || (lg === 'ncaa' && p.league === 'portal'))) { (p.hist ||= []).push({ season: G.season, team: p.team || p.rec?.from || p.from, league: lg, st: p.st }); p.st = {}; }
  }
  const poll = G.polls.ncaa?.list || [];
  for (const t of teamsOf(G, lg)) {
    const f = finish(G, t);
    const h = { season: G.season, w: t.rec.w, l: t.rec.l, cw: t.rec.cw, cl: t.rec.cl, pf: t.rec.pf, pa: t.rec.pa, f, coach: t.coach, p: t.prestige };
    if (lg === 'ncaa') { const rk = poll.find(x => x.id === t.id)?.rank; if (rk) h.rk = rk; if (t.autoBid === G.season) h.ct = 1; }
    (t.hist ||= []).push(h);
    if (t.hist.length > 40) t.hist.shift();
  }
}

// ---------------------------------------------------------------- coaches: growth, reputation
// Expected win% from the prestige the team had going into the season.
const expWin = (t) => clamp(0.5 + ((t.p0 ?? t.prestige) - 10) * (t.league === 'ncaa' ? 0.04 : 0.03), 0.12, 0.9);
// Postseason vs what the prestige promises (a Final Four is expected at a 20, a miracle at an 8).
function postBonus(t, f) {
  const p = t.p0 ?? t.prestige;
  if (t.league === 'ncaa') {
    const expF = clamp((p - 12) / 2.7, -1, 3.5), got = f == null ? -1.5 : f === -1 ? -0.5 : f;
    return 0.05 * (got - expF) + (f === 6 ? 0.1 : 0);
  }
  const expF = clamp((p - 10) / 3, -1, 2), got = f == null ? -1 : f;
  return 0.06 * (got - expF) + (f === 3 ? 0.08 : 0);
}
// Season performance vs expectations (positive = beat them).
export function seasonPerf(t, h) { return pct(h.w, h.l) - expWin(t) + postBonus(t, h.f) + (h.ct ? 0.03 : 0); }
// Growth: experience (more when young) + results vs expectations, worth much more at a low-prestige program.
export function coachGrowth(G, lg) {
  const rng = rngFor(G, 'cg' + lg);
  for (const t of teamsOf(G, lg)) {
    const c = G.coaches[t.coach], h = t.hist?.[t.hist.length - 1]; if (!c || !h || h.season !== G.season) continue;
    const perf = seasonPerf(t, h);
    const mult = clamp(1 + (11 - (t.p0 ?? t.prestige)) / 7, 0.6, 2.4);   // underdog multiplier
    const base = c.age < 40 ? 0.35 : c.age < 50 ? 0.25 : c.age < 60 ? 0.12 : c.age < 67 ? 0 : -0.15;
    const gain = base + (perf > 0 ? perf * 3 * mult : perf * 0.8);
    for (const k of ['off', 'def', 'gm', 'mot']) {
      const room = c.r[k] >= 17 ? (20 - c.r[k]) / 4 : 1;
      c.r[k] = r1(clamp(c.r[k] + gain * (0.6 + rng() * 0.8) * (gain > 0 ? room : 1), 1, 20));
    }
    // reputation: drifts toward the level of program you coach, jumps when you beat expectations (more at a small school)
    const pp = t.p0 ?? t.prestige;
    c.rep = r1(clamp((c.rep ?? 8) + (pp - (c.rep ?? 8)) * 0.12 + (perf > 0 ? perf * 6 * mult : perf * 5) + (h.f === 6 || (h.f === 3 && lg === 'wnba') ? 1.5 : 0), 1, 20));
    (c.perf ||= []).push(r1(perf * 100) / 100); if (c.perf.length > 4) c.perf.shift();
    c.hist.push({ season: G.season, team: t.id, w: h.w, l: h.l, f: h.f, lg });
    if (h.f === (lg === 'ncaa' ? 6 : 3)) { c.career.titles++; c.career[lg]++; }
    if (c.user) news(G, `Season review: ${h.w}-${h.l}${h.f != null ? ', ' + finishLabel(lg, h.f) : ''}. ${perf > 0.12 ? 'Well above expectations' : perf > 0.04 ? 'Above expectations' : perf > -0.05 ? 'About what was expected' : 'Below expectations'}${perf > 0.04 && mult > 1.2 ? ' for a program like this, and people noticed' : ''}. Reputation ${Math.round(c.rep)}.`, 1);
    for (const aid of t.staff) { const a = G.coaches[aid]; if (a && a.asst) a.r[a.asst] = r1(clamp(a.r[a.asst] + 0.15 + Math.max(0, perf) * mult * 0.6 + rng.gauss() * 0.2, 1, 20)); }
  }
}
// Prestige moves 20% a year toward a target: the team's rank this season (power rating + postseason) mapped onto the
// league's prestige distribution at the start of the save (G.presQ), so the spread of prestige stays the same over time.
function prestigeUpdate(G, lg) {
  const pw = lg === 'ncaa' ? powerOf(G) : null;
  const ts = teamsOf(G, lg).filter(t => t.hist?.[t.hist.length - 1]?.season === G.season);
  const score = t => { const h = t.hist[t.hist.length - 1]; return lg === 'ncaa' ? (pw[t.id] ?? 0) + (h.f != null ? 2 + 1.5 * Math.max(0, h.f) : 0) : (h.pf - h.pa) / Math.max(1, h.w + h.l) + (h.f != null ? 1 + h.f : 0); };
  const Q = G.presQ?.[lg] || ts.map(t => t.prestige).sort((a, b) => a - b);
  const order = ts.slice().sort((a, b) => score(a) - score(b));
  order.forEach((t, i) => {
    const target = Q[Math.round(i / Math.max(1, order.length - 1) * (Q.length - 1))];
    t.prestige = clamp(Math.round((t.prestige * 0.8 + target * 0.2) * 10) / 10, 1, 20);
  });
}
function powerOf(G) { return G._pw || {}; }

// ---------------------------------------------------------------- college departures + draft pool
export const draftValue = p => ovr(p) * 0.75 + (p.pot ?? ovr(p)) * 0.25;
function departures(G, rng) {
  G.draftPool = [];
  const u = ut(G), mine = [];
  for (const t of teamsOf(G, 'ncaa')) {
    for (const id of t.roster.slice()) {
      const p = G.players[id]; if (!p) continue;
      const dv = draftValue(p);
      let go = null;
      if (p.cls === 'GR') go = dv >= 10.5 ? 'draft' : 'grad';
      else if (p.cls === 'SR') go = dv >= 12.3 && rng() < 0.85 ? 'draft' : rng() < 0.3 ? (dv >= 10.5 ? 'draft' : 'grad') : null;
      else if (p.cls === 'JR' && dv >= 14.3 && rng() < 0.35) go = 'draft';
      if (!go) { if (p.cls === 'SR') p.ret = 1; continue; }
      t.roster = t.roster.filter(x => x !== id);
      p.from = t.id;
      if (t.id === u) mine.push(`${p.name} (${go === 'draft' ? 'WNBA draft' : 'graduating'})`);
      if (go === 'draft') { p.team = null; p.league = 'draft'; G.draftPool.push(id); }
      else RC.retire(G, p);
    }
  }
  // international prospects
  for (let i = 0; i < 8; i++) {
    const p = genPlayer(rng, { level: 11 + rng() * 2.6, league: 'wnba', age: 20 + rng.int(0, 3) });
    Object.assign(p, { team: null, league: 'draft', st: {}, hist: [], inj: null, college: 'International', cls: null });
    p.pot = clamp(Math.round(ovr(p) + 2 + rng() * 3), 1, 20);
    G.players[p.id] = p; G.draftPool.push(p.id);
  }
  if (mine.length) news(G, `Leaving the program: ${mine.join(', ')}.`, 1);
}

// ---------------------------------------------------------------- WNBA draft lottery + draft
// Lottery (WNBA rules): every non-playoff team; odds from the combined win% of the last two seasons (one for new teams);
// picks 1 and 2 are drawn, the rest of the lottery teams follow worst record first. Then playoff teams by inverse record.
// Rounds 2 and 3: inverse record of the season just played.
const LOTTO_ODDS = [300, 250, 180, 120, 80, 45, 25];
export function runLottery(G, recOf, playoffIds, draftYear, rng) {
  const teams = teamsOf(G, 'wnba');
  // the season just played (recOf) + the one before it (team history), when the team existed
  const two = t => { const cur = recOf(t), prev = (t.hist || []).find(x => x.season === draftYear - 2); return pct(cur.w + (prev?.w || 0), cur.l + (prev?.l || 0)); };
  const non = teams.filter(t => !playoffIds.includes(t.id)).sort((a, b) => two(a) - two(b) || pct(recOf(a).w, recOf(a).l) - pct(recOf(b).w, recOf(b).l));
  const odds = non.map((t, i) => [t.id, LOTTO_ODDS[i] ?? 10]);
  const pool = odds.slice(), drawn = [];
  for (let k = 0; k < Math.min(2, pool.length); k++) { const pick = rng.weighted(pool, x => x[1]); drawn.push(pick[0]); pool.splice(pool.indexOf(pick), 1); }
  const lotto = drawn.concat(non.map(t => t.id).filter(id => !drawn.includes(id)));
  const inv = teams.slice().sort((a, b) => pct(recOf(a).w, recOf(a).l) - pct(recOf(b).w, recOf(b).l)).map(t => t.id);
  const r1 = lotto.concat(inv.filter(id => !lotto.includes(id)));
  G.lottery = { draft: draftYear, odds, r1, r2: inv.slice(), r3: inv.slice() };
  const u = ut(G), ul = G.teams[u].league === 'wnba';
  news(G, `${draftYear} WNBA draft lottery: ${G.teams[r1[0]].name} win the No. 1 pick${r1[1] ? `, ${G.teams[r1[1]].name} pick second` : ''}.` + (ul && r1.includes(u) ? ` You pick No. ${r1.indexOf(u) + 1}.` : ''), ul ? 1 : 0);
}
export function startDraft(G) {
  const L = G.lottery || (() => { const rng = rngFor(G, 'lot'); runLottery(G, t => t.rec, standingsTop8(G), G.season, rng); return G.lottery; })();
  const order = [...L.r1, ...L.r2, ...L.r3];
  G.draft = { season: G.season, order, picks: [], pool: (G.draftPool || []).filter(id => G.players[id]), done: 0 };
  news(G, `The ${G.season} WNBA draft is under way.`);
}
const standingsTop8 = G => teamsOf(G, 'wnba').sort((a, b) => pct(b.rec.w, b.rec.l) - pct(a.rec.w, a.rec.l)).slice(0, 8).map(t => t.id);
export const userOnClock = G => !!(G.draft && !G.draft.done && G.draft.order[G.draft.picks.length] === ut(G) && !G.user.auto);
export function draftPick(G, tid, pid) {
  const D = G.draft, p = G.players[pid], t = G.teams[tid];
  if (!D || D.done || !p || !D.pool.includes(pid)) return false;
  const k = D.picks.length, rd = Math.floor(k / 15) + 1, inRd = k % 15;
  D.pool = D.pool.filter(x => x !== pid); D.picks.push([tid, pid]);
  const col = p.from && G.teams[p.from] ? nm(G.teams[p.from]) : (p.college || '');
  toPro(p);
  Object.assign(p, { team: tid, league: 'wnba', college: col, cls: null, exp: 0, nil: 0, ret: 0, draft: { season: G.season, rd, pick: k + 1, team: tid } });
  p.contract = { sal: rd === 1 ? Math.round((W.SAL.min + (15 - inRd) / 15 * 45000) / 1000) * 1000 : W.SAL.min, thru: G.season + (rd === 1 ? 2 : 1), rookie: 1 };
  t.roster.push(pid);
  if (tid === ut(G)) news(G, `With pick No. ${k + 1} you select ${p.name} (${p.pos}, ${col}).`, 1);
  else if (p.from === ut(G)) news(G, `${p.name} is drafted No. ${k + 1} by ${t.name}.`, 1);
  return true;
}
// College ratings run about 1.8 above the pro scale for the same player (a college 15 is a WNBA rotation player, ~13):
// applied once when a college player turns pro (draft or undrafted free agent).
export const PRO_ADJ = 1.8;
function toPro(p) {
  if (p.pro || p.college === 'International' && !p.from) { p.pro = 1; return; }
  for (const k of Object.keys(p.r)) p.r[k] = clamp(Math.round(p.r[k] - PRO_ADJ), 1, 20);
  if (p.pot != null) p.pot = clamp(Math.round(p.pot - PRO_ADJ), 1, 20);
  p.pro = 1;
}
function aiDraftPick(G, tid, rng) {
  const D = G.draft, t = G.teams[tid];
  const have = t.roster.map(id => G.players[id]).filter(Boolean);
  const best = D.pool.map(id => G.players[id]).map(p => ({ p, v: draftValue(p) + rng.gauss() * 0.5 + (have.filter(q => W.ovr(q) > W.ovr(p) && q.pos === p.pos).length > 2 ? -0.4 : 0) })).sort((a, b) => b.v - a.v)[0];
  if (best) draftPick(G, tid, best.p.id); else D.picks.push([tid, null]);
}
// Run the draft until the user is on the clock (returns 'user') or it is over ('done').
export function runDraft(G) {
  const D = G.draft; if (!D || D.done) return 'done';
  const rng = makeRng((G.seed ^ hash('dr' + D.season + D.picks.length)) >>> 0);
  while (D.picks.length < D.order.length) {
    if (userOnClock(G)) return 'user';
    aiDraftPick(G, D.order[D.picks.length], rng);
  }
  finishDraft(G);
  return 'done';
}
function finishDraft(G) {
  const D = G.draft; D.done = 1;
  const left = D.pool.map(id => G.players[id]).filter(Boolean).sort((a, b) => draftValue(b) - draftValue(a));
  left.forEach((p, i) => {
    if (i < 20) { toPro(p); Object.assign(p, { league: 'wnba', team: null, college: p.from && G.teams[p.from] ? nm(G.teams[p.from]) : (p.college || ''), cls: null, exp: 0, nil: 0 }); p.contract = null; G.fa.push(p.id); }
    else RC.retire(G, p);
  });
  G.draftPool = [];
  const top = D.picks.slice(0, 3).map(([tid, pid], i) => `${i + 1}. ${G.players[pid]?.name} (${G.teams[tid].name})`).join(', ');
  news(G, `Draft complete. Top picks: ${top}.`);
}

// ---------------------------------------------------------------- WNBA contracts, free agency, cuts
export const payroll = (G, t) => t.roster.reduce((s, id) => s + (G.players[id]?.contract?.sal || 0), 0);
export const capRoom = (G, t) => W.SAL.cap - payroll(G, t);
export function askSalary(p) {
  const q = ovr(p); let s = W.SAL.min + (q - 11) / 6 * (W.SAL.max - W.SAL.min) * 0.85;
  if (p.age >= 32) s *= 0.8;
  return Math.round(clamp(s * (p.askF ?? 1), W.SAL.min, W.SAL.max) / 1000) * 1000;
}
export const askYears = p => (p.age <= 26 ? 3 : p.age <= 30 ? 2 : 1);
function sign(G, t, p, sal, yrs) {
  G.fa = G.fa.filter(x => x !== p.id);
  if (p.team && p.team !== t.id) { const o = G.teams[p.team]; if (o) o.roster = o.roster.filter(x => x !== p.id); }
  if (!t.roster.includes(p.id)) t.roster.push(p.id);
  p.team = t.id; p.league = 'wnba'; p.contract = { sal, thru: G.season + yrs - 1 + (G.day >= calendar(G.season).wnbaEnd ? 1 : 0), rookie: 0 }; delete p.askF; delete p.expiring; delete p.fa0;
}
export const MAX_OFF_ROSTER = 14;   // offseason roster max (cut to 12 before the season)
// User signs a free agent at her asking price (open market).
export function userSign(G, pid, sal, yrs) {
  const t = G.teams[ut(G)], p = G.players[pid];
  if (!p || !G.fa.includes(pid)) return 'Not a free agent.';
  const cal = calendar(G.season), inSeason = G.day >= cal.wnbaCuts && !(G.wpo && G.wpo.champ);
  if (t.roster.length >= (inSeason ? W.MAX_ROSTER.wnba : MAX_OFF_ROSTER)) return `Roster is full (${inSeason ? W.MAX_ROSTER.wnba + ' in season' : MAX_OFF_ROSTER + ' in the offseason'}): release someone first.`;
  if (sal < askSalary(p)) return `${p.name} wants at least ${askSalary(p).toLocaleString()}.`;
  if (sal > capRoom(G, t) && sal > W.SAL.min) return 'Not enough cap room (minimum contracts are always allowed).';
  sign(G, t, p, sal, yrs); news(G, `${p.name} signs with ${t.name}: $${Math.round(sal / 1000)}K for ${yrs} year${yrs > 1 ? 's' : ''}.`, 1);
  return null;
}
export function userResign(G, pid) {
  const t = G.teams[ut(G)], p = G.players[pid];
  if (!p || p.team !== t.id || !p.expiring) return 'Not an expiring contract.';
  const sal = askSalary(p);
  if (sal - (p.contract?.sal || 0) > capRoom(G, t) && sal > W.SAL.min) return 'Not enough cap room.';
  p.contract = { sal, thru: G.season + askYears(p) - 1, rookie: 0 }; delete p.expiring;
  news(G, `${p.name} re-signs: $${Math.round(sal / 1000)}K through ${p.contract.thru}.`, 1);
  return null;
}
export function release(G, pid) {
  const p = G.players[pid], t = p && G.teams[p.team]; if (!t) return;
  t.roster = t.roster.filter(x => x !== pid); p.team = null; p.contract = null; delete p.expiring;
  if (t.league === 'wnba') G.fa.push(pid); else RC.retire(G, p);
}
// Jan 21: expiring contracts (thru < season). AI teams re-sign the players they want; the user's are flagged.
export function faStart(G) {
  const u = ut(G);
  for (const t of teamsOf(G, 'wnba')) {
    const ps = t.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a));
    const keepBar = ovr(ps[Math.min(8, ps.length - 1)] || { r: {} }) - 0.3;
    for (const p of ps) {
      if (!p.contract || p.contract.thru >= G.season) continue;
      if (t.id === u && !G.user.auto) { p.expiring = 1; continue; }
      const sal = askSalary(p);
      if (ovr(p) >= keepBar && p.age <= 33 && (payroll(G, t) - p.contract.sal + sal <= W.SAL.cap || sal === W.SAL.min)) p.contract = { sal, thru: G.season + askYears(p) - 1, rookie: 0 };
      else p.expiring = 1;
    }
  }
  if (G.teams[u].league === 'wnba') news(G, 'Free agency: re-sign your expiring players before the market opens on Feb 1.', 1);
}
// Feb 1: unsigned expiring players hit the market; offers made by the user are answered first, then AI teams sign.
export function faOpen(G) {
  const u = ut(G);
  for (const p of Object.values(G.players)) if (p.expiring && p.team) { const t = G.teams[p.team]; t.roster = t.roster.filter(x => x !== p.id); p.team = null; p.contract = null; delete p.expiring; G.fa.push(p.id); }
  news(G, `The WNBA free-agent market opens with ${G.fa.length} players.`);
  void u;
  aiSignFA(G, makeRng((G.seed ^ hash('fa' + G.season)) >>> 0), 13);
}
// Free agents sign best first; each picks among the AI teams that want her (an open spot she improves) and can pay her
// ask, preferring winning teams (stars chase contenders), so talent concentrates the way it does in the real league.
export function aiSignFA(G, rng, upTo = 12) {
  const u = ut(G);
  const win = t => { const h = t.hist?.[t.hist.length - 1], r = t.rec.w + t.rec.l ? t.rec : h || { w: 1, l: 1 }; return pct(r.w, r.l); };
  const fas = G.fa.map(id => G.players[id]).filter(p => p && p.r).sort((a, b) => ovr(b) - ovr(a));
  for (const p of fas) {
    const ask = askSalary(p);
    const want = teamsOf(G, 'wnba').filter(t => (t.id !== u || G.user.auto) && t.roster.length < upTo && (ask <= capRoom(G, t) || ask === W.SAL.min)
      && (t.roster.length < 11 || ovr(p) > Math.min(...t.roster.map(id => ovr(G.players[id])))));
    if (!want.length) continue;
    const t = want.map(t => ({ t, s: win(t) * 2 + rng() })).sort((a, b) => b.s - a.s)[0].t;
    sign(G, t, p, ask, askYears(p));
  }
}
// Weekly in the offseason: unsigned players lower their asks.
export function faWeek(G) { for (const id of G.fa) { const p = G.players[id]; if (p) p.askF = Math.max(0.5, (p.askF ?? 1) * 0.93); } }
// Before the season: everyone down to 12 (lowest value cut), short rosters filled.
export function cutDown(G) {
  const rng = rngFor(G, 'cut'), u = ut(G);
  for (const t of teamsOf(G, 'wnba')) {
    while (t.roster.length > W.MAX_ROSTER.wnba) {
      const ps = t.roster.map(id => G.players[id]).sort((a, b) => cutVal(a) - cutVal(b));
      release(G, ps[0].id);
      if (t.id === u) news(G, `${ps[0].name} is cut to get the roster to 12.`, 1);
    }
  }
  aiSignFA(G, rng, 12);
  for (const t of teamsOf(G, 'wnba')) while (t.roster.length < W.MAX_ROSTER.wnba) { const p = W.addPlayer(G, t, genPlayer(rng, { level: 11, league: 'wnba' })); p.contract = { sal: W.SAL.min, thru: G.season, rookie: 0 }; p.num = String(rng.int(0, 55)); }
}
const cutVal = p => ovr(p) + (p.contract?.rookie ? 0.2 : 0) + (p.age <= 24 ? 0.1 : 0);

// ---------------------------------------------------------------- trades (WNBA)
export function tradeValue(G, p) {
  const q = ovr(p), age = p.age || 26;
  let v = Math.exp(0.38 * (q - 12));
  v *= age <= 24 ? 1.15 + Math.max(0, (p.pot ?? q) - q) * 0.06 : age <= 29 ? 1 : age <= 32 ? 0.8 : 0.55;
  const fair = askSalary(p), sal = p.contract?.sal || fair;
  v -= (sal - fair) / 100000 * 0.35 * Math.max(1, (p.contract?.thru ?? G.season) - G.season + 1);
  return Math.max(0.05, v);
}
export function tradeOpen(G) {
  const cal = calendar(G.season);
  return !(G.day >= cal.deadline && !(G.wpo && G.wpo.champ));
}
// give = user's players, get = partner's. Returns { ok, msg }.
export function proposeTrade(G, partner, give, get) {
  const U = G.teams[ut(G)], P = G.teams[partner];
  if (!tradeOpen(G)) return { ok: false, msg: 'The trade deadline has passed (trades reopen after the Finals).' };
  if (!give.length || !get.length) return { ok: false, msg: 'Pick players on both sides.' };
  const sum = ids => ids.reduce((s, id) => s + (G.players[id]?.contract?.sal || 0), 0);
  const payU = payroll(G, U) - sum(give) + sum(get), payP = payroll(G, P) - sum(get) + sum(give);
  if (payU > W.SAL.cap && payU > payroll(G, U)) return { ok: false, msg: 'That puts you over the salary cap.' };
  if (payP > W.SAL.cap && payP > payroll(G, P)) return { ok: false, msg: `That puts ${P.name} over the salary cap.` };
  const nU = U.roster.length - give.length + get.length, nP = P.roster.length - get.length + give.length, inSeason = G.day >= calendar(G.season).wnbaStart - 3 && !(G.wpo && G.wpo.champ);
  const hi = inSeason ? W.MAX_ROSTER.wnba : MAX_OFF_ROSTER;
  if (nU > hi || nP > hi || nU < 9 || nP < 9) return { ok: false, msg: `Rosters must stay between 9 and ${hi} players.` };
  const vIn = give.reduce((s, id) => s + tradeValue(G, G.players[id]), 0), vOut = get.reduce((s, id) => s + tradeValue(G, G.players[id]), 0);
  if (vIn < vOut * 1.08) return { ok: false, msg: `${P.name} decline: they want more value back (${(vIn / vOut * 100).toFixed(0)}% of what they would give).` };
  for (const id of give) { U.roster = U.roster.filter(x => x !== id); P.roster.push(id); G.players[id].team = P.id; }
  for (const id of get) { P.roster = P.roster.filter(x => x !== id); U.roster.push(id); G.players[id].team = U.id; }
  U.plan = null; P.plan = null; P.tactics = W.aiTactics(G, P);
  news(G, `Trade with ${P.name}: you get ${get.map(id => G.players[id].name).join(', ')} for ${give.map(id => G.players[id].name).join(', ')}.`, 1);
  return { ok: true, msg: 'Trade accepted.' };
}

// ---------------------------------------------------------------- coaching carousel
const tenure = (G, c) => G.season - (c.contract?.start ?? G.season) + 1;
const perf2 = c => { const p = (c.perf || []).slice(-2); return p.length ? p.reduce((s, x) => s + x, 0) / p.length : 0; };
const coachSal = (t) => t.league === 'ncaa' ? Math.round((120 + t.prestige ** 2 * 7) / 10) * 10000 : Math.round((400 + t.prestige * 40) / 10) * 10000;
export function carousel(G, lg, d) {
  const rng = rngFor(G, 'car' + lg), u = ut(G), uc = G.coaches[G.user.coach];
  const open = [];
  for (const t of teamsOf(G, lg)) {
    const c = G.coaches[t.coach]; if (!c) { open.push(t.id); continue; }
    const p2 = perf2(c), exp = c.contract && c.contract.thru <= G.season;
    if (c.user) {
      if (exp) {
        if (p2 > -0.12) { const yrs = 4; c.contract = { ...c.contract, sal: Math.round(coachSal(t) * (1 + Math.max(0, p2)) / 10000) * 10000, thru: G.season + yrs }; news(G, `${t.name} extend your contract through ${G.season + yrs}.`, 1); }
        else { fireUser(G, t, 'Your contract was not renewed.'); open.push(t.id); }
      } else if (tenure(G, c) >= 3 && p2 < -0.3) { fireUser(G, t, 'You have been fired.'); open.push(t.id); }
      continue;
    }
    if (c.age >= 67 && rng() < 0.4) { news(G, `${c.name} retires as head coach of ${nm(t)}.`); vacate(G, t, 'retired'); open.push(t.id); continue; }
    if (exp) {
      if (p2 > -0.08 || rng() < 0.3) { c.contract.thru = G.season + rng.int(2, 5); c.contract.sal = coachSal(t); continue; }
      vacate(G, t, 'not renewed'); open.push(t.id); continue;
    }
    if (tenure(G, c) >= 2 && p2 < -0.22 && rng() < 0.6) { news(G, `${nm(t)} fire ${c.name}.`); vacate(G, t, 'fired'); open.push(t.id); }
  }
  // offers for the user
  const offers = [];
  const rep = uc.rep ?? 5, cur = G.teams[u];
  const cands = open.map(id => G.teams[id]).filter(t => t.id !== u).sort((a, b) => b.prestige - a.prestige);
  for (const t of cands) {
    if (offers.length >= 4) break;
    const ok = lg === 'ncaa' ? t.prestige <= rep + 4 : rep >= 12 && t.prestige <= rep + 5;
    const better = G.user.fired || !cur || t.league !== cur.league || t.prestige > cur.prestige + 0.5;
    if (ok && better && rng() < 0.75) offers.push(t.id);
  }
  if (G.user.fired && G.user.firedLg === lg && offers.length < 2) {
    // a fired coach always gets a couple of small-program offers
    const low = teamsOf(G, 'ncaa').filter(t => t.id !== u && !offers.includes(t.id) && G.coaches[t.coach] && !G.coaches[t.coach].user).sort((a, b) => a.prestige - b.prestige).slice(0, 12).sort(() => rng() - 0.5).slice(0, 2 - offers.length);
    for (const t of low) { vacate(G, t, 'resigned'); open.push(t.id); offers.push(t.id); }
  }
  G.carousel = { lg, open, fill: d + 4 };
  G.user.offers = offers.map(tid => ({ tid, yrs: G.teams[tid].league === 'wnba' ? 3 : 5, sal: coachSal(G.teams[tid]), until: d + 4 }));
  const nOpen = open.length;
  if (nOpen) news(G, `Coaching carousel (${lg.toUpperCase()}): ${nOpen} head coaching job${nOpen > 1 ? 's' : ''} open.`);
  if (offers.length) news(G, `You have ${offers.length} job offer${offers.length > 1 ? 's' : ''}: ${offers.map(id => G.teams[id].name).join(', ')}.`, 1);
  return offers.length > 0;
}
// Hired after the team's season ended: the contract starts with next season.
function offYear(G, t) { const cal = calendar(G.season); return (t.league === 'ncaa' ? G.day >= cal.collegeEnd : G.wOff === G.season) ? 1 : 0; }
function vacate(G, t, note) {
  const c = G.coaches[t.coach]; if (c) { c.team = null; c.contract = null; c.hist.push({ season: G.season, team: t.id, note }); }
  t.coach = null;
}
function fireUser(G, t, msg) {
  const c = G.coaches[G.user.coach];
  c.hist.push({ season: G.season, team: t.id, note: 'fired' });
  G.user.fired = true; G.user.firedLg = t.league; G.user.firedFrom = t.id;
  news(G, `${msg} You must find a new job.`, 1);
}
// The user takes an offer.
export function acceptJob(G, tid) {
  const o = (G.user.offers || []).find(x => x.tid === tid); if (!o) return false;
  const uc = G.coaches[G.user.coach], old = G.teams[uc.team], t = G.teams[tid];
  if (old) { old.coach = null; old.plan = null; old.tactics = W.aiTactics(G, old); (G.carousel?.open || []).push(old.id); if (!G.carousel) fillOne(G, old, rngFor(G, 'fo' + old.id)); }
  W.hireHead(G, uc, t, o.yrs + offYear(G, t)); uc.contract.sal = o.sal;
  t.plan = null; t.newCoach = G.season;
  G.user.fired = false; G.user.offers = []; G.user.staffWindow = true; G.user.cands = null; G.user.board = {};
  if (G.carousel) G.carousel.open = G.carousel.open.filter(x => x !== tid);
  news(G, `${uc.name} is the new head coach of ${t.name}!`, 1);
  return true;
}
export function declineOffers(G) { if (!G.user.fired) G.user.offers = []; }
// Fill open jobs: unemployed head coaches, assistants, or coaches moving up from smaller programs (which opens their job).
export function fillOpenings(G) {
  const C = G.carousel; if (!C) return;
  const rng = rngFor(G, 'fill' + C.lg), u = ut(G);
  if (G.user.fired) { // offers expired: take the best one automatically
    const o = (G.user.offers || [])[0]; if (o) acceptJob(G, o.tid);
  }
  G.user.offers = [];
  const queue = C.open.slice().filter(id => !G.teams[id].coach).sort((a, b) => G.teams[b].prestige - G.teams[a].prestige);
  for (let i = 0; i < queue.length && i < 200; i++) {
    const t = G.teams[queue[i]]; if (t.coach) continue;
    const moved = fillOne(G, t, rng);
    if (moved && !moved.coach && moved.id !== u) queue.push(moved.id);
  }
  G.carousel = null;
}
function fillOne(G, t, rng) {
  const avg = c => W.COACH_KEYS.reduce((s, k) => s + c.r[k], 0) / 6;
  const pool = [];
  for (const c of Object.values(G.coaches)) {
    if (c.user || c.retired) continue;
    const ct = c.team && G.teams[c.team];
    if (!ct) { if (c.hist.length && c.age < 66) pool.push([c, null, (c.rep ?? 8) + avg(c) * 0.4 - 1]); continue; }
    if (c.asst) { if (ct.league === t.league || rng() < 0.2) pool.push([c, ct, (c.rep ?? 8) + avg(c) * 0.4 - 1.5]); continue; }
    if (ct.coach === c.id && ct.prestige <= t.prestige - 3 && perf2(c) > 0.02 && ct.league === t.league && ct.id !== t.id) pool.push([c, ct, (c.rep ?? 8) + avg(c) * 0.4 + perf2(c) * 10]);
  }
  pool.forEach(x => { x[2] += rng.gauss() * 1.5; });
  pool.sort((a, b) => b[2] - a[2]);
  const pick = pool[Math.floor(rng() * Math.min(4, pool.length))];
  let c, from = null;
  if (pick) {
    [c, from] = pick;
    if (from) {
      if (c.asst) { from.staff = from.staff.filter(x => x !== c.id); delete c.asst; replaceAssistant(G, from, rng); }
      else { from.coach = null; }
    }
  } else c = W.makeCoach(G, rng, { name: randomCoachName(rng), level: t.league === 'ncaa' ? 7 + t.prestige * 0.15 : 10.5, league: t.league });
  c.retired = 0;
  W.hireHead(G, c, t, rng.int(3, 5) + offYear(G, t));
  t.newCoach = G.season;
  t.tactics = W.aiTactics(G, t); t.plan = null;
  news(G, `${nm(t)} hire ${c.name}${from ? ` (from ${nm(from)})` : ''} as head coach.`, from?.id === ut(G) ? 1 : 0);
  return from && from.coach == null && !c.asst ? from : null;
}
function replaceAssistant(G, t, rng) {
  if (t.id === ut(G) && !G.user.auto) { G.user.staffWindow = true; G.user.cands = null; news(G, 'One of your assistants left for a head coaching job. You can hire a replacement (Staff).', 1); return; }
  const role = Object.keys(W.ASST_ROLES).find(r => !t.staff.some(id => G.coaches[id]?.asst === r)) || 'off';
  W.hireAssistant(G, t, W.makeAssistant(G, rng, t, role));
}

// ---------------------------------------------------------------- development + aging
// College: toward potential, faster with a good development staff and minutes. WNBA: by age.
function develop(G, rng) {
  const gains = {};
  for (const p of Object.values(G.players)) {
    if (!p.r || p.league === 'gone' || p.league === 'hs') continue;
    p.age = (p.age || 20) + 1;
    const before = ovr(p);
    let d;
    const t = p.team && G.teams[p.team];
    if (p.league === 'ncaa' || p.league === 'portal') {
      const dev = t ? W.staffRatings(G, t).dev : 10;
      const last = p.hist?.[p.hist.length - 1], mpg = last && last.season === G.season && last.st.g ? last.st.sec / 60 / last.st.g : 0;
      // closes a share of the gap to potential that grows as eligibility runs out (most of it by the end of year 5)
      const left = { FR: 4, SO: 3.5, JR: 3, SR: 2.5, GR: 2 }[p.cls] || 3;
      d = clamp(((p.pot ?? before + 2) - before) * (0.62 + 0.02 * (dev - 10)) / left + 0.1 * Math.min(1, mpg / 30) + rng.gauss() * 0.4, -0.6, 2.5);
    } else {
      const a = p.age;
      d = a <= 22 ? 0.3 + Math.max(0, (p.pot ?? before) - before) * 0.08 : a <= 25 ? 0.25 : a <= 28 ? 0.1 : a <= 30 ? 0 : a <= 32 ? -0.25 : a <= 34 ? -0.5 : -0.9;
      d += rng.gauss() * 0.45;
    }
    for (const k of Object.keys(p.r)) {
      let x = d;
      if ((k === 'spd' || k === 'vert' || k === 'sta') && p.age >= 31) x -= 0.3;
      if (k === 'iq' && d < 0) x = d * 0.3;
      const v = p.r[k] + x + rng.gauss() * 0.45;
      p.r[k] = clamp(Math.round(v), 1, 20);
    }
    if (p.pot != null) p.pot = Math.max(p.pot, Math.round(ovr(p)));
    if (t && t.league === 'ncaa') (gains[t.id] ||= []).push(ovr(p) - before);
  }
  return gains;
}

// ---------------------------------------------------------------- event hooks (called from season.js dayEvents)
export function collegeOffseason(G, d, pw) {
  G._pw = pw;
  const rng = rngFor(G, 'colOff');
  archive(G, 'ncaa'); coachGrowth(G, 'ncaa'); prestigeUpdate(G, 'ncaa'); delete G._pw;
  departures(G, rng);
  G.colOff = G.season;
  const offers = carousel(G, 'ncaa', d);
  // NIL budgets for next season follow the new prestige
  for (const t of teamsOf(G, 'ncaa')) t.nilB = RC.nilBudget(t);
  return offers;
}
export function wnbaOffseason(G, d) {
  archive(G, 'wnba'); coachGrowth(G, 'wnba'); prestigeUpdate(G, 'wnba');
  runLottery(G, t => t.rec, G.wpo?.seeds || standingsTop8(G), G.season + 1, rngFor(G, 'lottery'));
  G.wOff = G.season;
  return carousel(G, 'wnba', d);
}
export function rollover(G) {
  const rng = rngFor(G, 'roll'), u = ut(G);
  const gains = develop(G, rng);
  // coaches: development rating follows how much the players improved; age; assistants' contracts
  for (const t of Object.values(G.teams)) {
    const c = G.coaches[t.coach];
    if (c && gains[t.id]?.length) { const g = gains[t.id].reduce((s, x) => s + x, 0) / gains[t.id].length; c.r.dev = r1(clamp(c.r.dev + 0.1 + (g - 0.9) * 0.5, 1, 20)); }
    for (const aid of t.staff.slice()) {
      const a = G.coaches[aid]; if (!a?.contract || a.contract.thru > G.season) continue;
      if (t.id === u && !G.user.auto) { W.fireAssistant(G, t, aid); G.user.staffWindow = true; G.user.cands = null; news(G, `${a.name}'s contract has run out. Hire a replacement on the Staff screen.`, 1); }
      else if (rng() < 0.6) a.contract.thru = G.season + rng.int(1, 3);
      else { W.fireAssistant(G, t, aid); replaceAssistant(G, t, rng); }
    }
  }
  for (const c of Object.values(G.coaches)) {
    c.age++;
    if (!c.team && !c.user && c.age > 66) c.retired = 1;
    if (!c.team && !c.user && (c.asst || !c.hist.length)) delete G.coaches[c.id];   // unemployed assistants / never-hired candidates
  }
  // WNBA retirements + free agents who never signed
  for (const p of Object.values(G.players)) {
    if (p.league !== 'wnba' || !p.r) continue;
    const q = ovr(p);
    if (!p.team) { if (p.age >= 31 || q < 10.5 || p.fa0 != null) { G.fa = G.fa.filter(x => x !== p.id); RC.retire(G, p); } else p.fa0 = G.season; continue; }
    if ((p.age >= 36 && rng() < 0.6) || (p.age >= 34 && q < 12.5 && rng() < 0.35) || (p.age >= 31 && q < 11 && rng() < 0.4)) {
      const t = G.teams[p.team]; t.roster = t.roster.filter(x => x !== p.id);
      if (t.id === u) news(G, `${p.name} retires.`, 1);
      RC.retire(G, p);
    } else p.exp = (p.exp ?? 0) + 1;
  }
  // college: classes advance, recruits join, roster limits
  const NEXT = { FR: 'SO', SO: 'JR', JR: 'SR', SR: 'GR' };
  for (const t of teamsOf(G, 'ncaa')) for (const id of t.roster.slice()) {
    const p = G.players[id]; if (!p) continue;
    if (p.cls === 'GR') { t.roster = t.roster.filter(x => x !== id); RC.retire(G, p); continue; }
    p.cls = NEXT[p.cls] || 'SO'; delete p.ret; delete p.from;
  }
  const joined = RC.joinClass(G);
  for (const t of teamsOf(G, 'ncaa')) {
    const c = G.coaches[t.coach], ids = joined[t.id] || []; if (!c || !ids.length) continue;
    const stars = ids.reduce((s, id) => s + (G.players[id].stars || 2), 0) / ids.length, expect = clamp(2 + (t.prestige - 6) / 6, 2, 4.2);
    const mult = clamp(1 + (11 - t.prestige) / 7, 0.6, 2.4);
    c.r.rec = r1(clamp(c.r.rec + 0.1 + (stars - expect) * 0.35 * (stars > expect ? mult : 1), 1, 20));
  }
  for (const t of teamsOf(G, 'ncaa')) {
    while (t.roster.length > W.MAX_ROSTER.ncaa) {
      const ps = t.roster.map(id => G.players[id]).sort((a, b) => ovr(a) - ovr(b));
      t.roster = t.roster.filter(x => x !== ps[0].id);
      if (t.id === u) news(G, `${ps[0].name} is released (roster limit ${W.MAX_ROSTER.ncaa}).`, 1);
      RC.retire(G, ps[0]);
    }
    while (t.roster.length < 12) { const p = W.addPlayer(G, t, genPlayer(rng, { level: 3.6 + t.prestige * 0.2, league: 'ncaa', cls: 'FR', age: 18 })); p.nil = 0; p.walkon = 1; p.num = String(rng.int(0, 55)); }
    for (const id of t.roster) { const p = G.players[id]; if (!p.num) p.num = String(rng.int(0, 55)); }
  }
  if (joined[u]?.length) news(G, `${joined[u].length} freshmen join the program.`, 1);
  // new season
  G.season++;
  for (const t of Object.values(G.teams)) {
    t.rec = W.emptyRec(); t.post = null; t.p0 = t.prestige; delete t.rt;
    if (t.id !== u || G.user.auto) { t.tactics = W.aiTactics(G, t); t.plan = null; }
    if (t.league === 'ncaa') { t.nilB = RC.nilBudget(t); if (t.id !== u || G.user.auto) RC.aiNilDeals(G, t, rng); }
  }
  G.tourneys = null; G.ct = 0; G.bracket = null; G.wpo = null; G.lastDraft = G.draft ? { season: G.draft.season, picks: G.draft.picks } : G.lastDraft; G.draft = null; G.carousel = null;
  G.polls = {}; G.dayDone = null; G.colOff = 0; G.wOff = 0;
  G.games = buildNcaaSchedule(G, rng).concat(buildWnbaSchedule(G, rng)).sort((a, b) => a.day - b.day);
  RC.genClass(G, rng); RC.precommit(G, rng);
  G.user.board = {}; G.user.cands = null;
  G.rolled = G.season;
  news(G, `Welcome to the ${G.season - 1}-${String(G.season).slice(2)} season.`, 1);
}
