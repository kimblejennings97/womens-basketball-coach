// The game world: state G, new game (real rosters), coaches + assistants, team strength, AI tactics, lineups.
import { TEAMS, PLAYERS, RATING_KEYS } from '../data/real.js';
import { makeRng } from '../engine/rng.js';
import { ovr as engOvr, autoMinutes, posGroup } from '../engine/game.js';
import { defaultTactics } from '../engine/rules.js';
import { genPlayer, randomName, setNextId } from '../data/gen.js';
import { buildNcaaSchedule, buildWnbaSchedule, calendar } from './sched.js';

export const VERSION = 1;
export const COACH_KEYS = ['off', 'def', 'gm', 'rec', 'dev', 'mot'];
export const COACH_NAMES = { off: 'Offense', def: 'Defense', gm: 'Game management', rec: 'Recruiting', dev: 'Development', mot: 'Motivation' };
export const ASST_ROLES = { off: 'Offensive coordinator', def: 'Defensive coordinator', rec: 'Recruiting coordinator', dev: 'Player development' };
export const CLASS_NAMES = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate' };
export const MAX_ROSTER = { ncaa: 15, wnba: 12 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r20 = x => clamp(Math.round(x), 1, 20);

export const ovr = p => engOvr(p);
export const ovrI = p => Math.round(engOvr(p));
export const isUserTeam = (G, tid) => G.teams[tid] && G.teams[tid].coach === G.user.coach;
export const userTeam = G => G.coaches[G.user.coach].team;

// ---------------------------------------------------------------- new game
// opts: { seed, coachName, mode: 'unknown' | 'pick', team }  (for 'unknown' the team is one of the offers from jobOffersForNewCoach)
export function newGame(opts) {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const rng = makeRng(seed);
  setNextId(1);
  const G = { v: VERSION, seed, season: 2027, teams: {}, players: {}, coaches: {}, games: [], news: [], fa: [], user: {}, polls: {}, awards: [], records: {}, hof: [], ctr: { coach: 1, player: 1 } };
  // players
  for (const [id, p] of Object.entries(PLAYERS)) {
    const r = {}; RATING_KEYS.forEach((k, i) => { r[k] = p.r[i]; });
    const q = { ...p, r, real: 1, inj: null, st: {}, hist: [] };
    delete q.L;
    G.players[id] = q;
  }
  // teams
  for (const t of TEAMS) {
    const team = {
      id: t.id, league: t.league, name: t.name, short: t.short, abbr: t.abbr, conf: t.conf, confId: t.confId, logo: t.logo, color: t.color || null, color2: t.color2 || null,
      srs: t.srs, prestige: t.league === 'ncaa' ? r20(10 + t.srs / 4.5) : r20(10 + t.srs / 1.5), roster: t.roster.filter(id => G.players[id]), tactics: defaultTactics(), plan: null,
      rec: emptyRec(), coach: null, staff: [], hist: [],
    };
    for (const id of team.roster) { G.players[id].team = t.id; G.players[id].league = t.league; }
    G.teams[t.id] = team;
  }
  // roster sizes: college 10-15 (walk-ons fill short rosters), WNBA 12 (extra players become free agents)
  for (const t of Object.values(G.teams)) {
    if (t.league === 'ncaa') {
      while (t.roster.length < 11) addPlayer(G, t, genPlayer(rng, { level: 5 + t.prestige * 0.2, league: 'ncaa', cls: rng.pick(['FR', 'SO', 'JR']) }));
      if (t.roster.length > MAX_ROSTER.ncaa) t.roster.sort((a, b) => ovr(G.players[b]) - ovr(G.players[a])).splice(MAX_ROSTER.ncaa).forEach(id => { delete G.players[id]; });
    } else {
      t.roster.sort((a, b) => ovr(G.players[b]) - ovr(G.players[a]));
      for (const id of t.roster.splice(MAX_ROSTER.wnba)) { const p = G.players[id]; p.team = null; G.fa.push(id); }
      while (t.roster.length < MAX_ROSTER.wnba) addPlayer(G, t, genPlayer(rng, { level: 11.5, league: 'wnba' }));
      for (const id of t.roster) G.players[id].contract ||= genContract(rng, G.players[id], G.season);
    }
    for (const id of t.roster) if (!G.players[id].num) G.players[id].num = String(rng.int(0, 55));
  }
  // coaches
  for (const t of TEAMS) {
    const team = G.teams[t.id];
    const c = makeCoach(G, rng, { name: t.coach || randomName(rng), level: t.league === 'ncaa' ? 8.2 + t.srs * 0.07 : 11 + t.srs * 0.15, real: !!t.coach, league: t.league });
    hireHead(G, c, team, rng.int(1, 5));
    for (const role of Object.keys(ASST_ROLES).slice(0, 3)) hireAssistant(G, team, makeAssistant(G, rng, team, role));
  }
  // the user
  const name = (opts.coachName || 'Coach').trim() || 'Coach';
  const unknown = opts.mode !== 'pick';
  const uc = makeCoach(G, rng, { name, level: unknown ? 7 : 10, spread: 0.8, age: unknown ? 32 : 40, league: G.teams[opts.team].league });
  uc.user = 1; uc.rep = unknown ? 3 : Math.max(5, G.teams[opts.team].prestige - 3);
  G.user = { coach: uc.id, mode: unknown ? 'unknown' : 'pick' };
  const tm = G.teams[opts.team];
  const old = tm.coach && G.coaches[tm.coach];
  if (old) { old.team = null; old.contract = null; old.hist.push({ season: G.season, team: tm.id, note: 'replaced' }); }
  hireHead(G, uc, tm, unknown ? 3 : 4);
  for (const t of Object.values(G.teams)) t.tactics = aiTactics(G, t);
  // calendar + schedules
  const cal = calendar(G.season);
  G.day = cal.start - 1; G.phase = 'regular';
  G.games = buildNcaaSchedule(G, rng).concat(buildWnbaSchedule(G, rng)).sort((a, b) => a.day - b.day);
  G.news.push({ day: G.day, text: `${uc.name} is the new head coach of ${tm.name}.`, me: 1 });
  return G;
}

export const emptyRec = () => ({ w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, strk: 0 });

export function addPlayer(G, team, p) {
  p.team = team.id; p.league = team.league; p.st = {}; p.hist = []; p.inj = null;
  G.players[p.id] = p; team.roster.push(p.id);
  return p;
}

// WNBA contracts (simplified CBA, see docs/recruiting.md): salary by quality, 1-4 years.
export const SAL = { min: 66000, max: 250000, cap: 1500000 };
export function genContract(rng, p, season) {
  const q = ovr(p);
  const sal = Math.round(clamp(SAL.min + (q - 11) / 6 * (SAL.max - SAL.min) * 0.85 + rng.gauss() * 12000, SAL.min, SAL.max) / 1000) * 1000;
  return { sal, thru: season + rng.int(0, 3), rookie: 0 };
}

// ---------------------------------------------------------------- coaches
export function makeCoach(G, rng, { name, level = 9, spread = 2, age = null, real = false, league = 'ncaa' }) {
  const id = 'c' + (G.ctr.coach++);
  const r = {};
  for (const k of COACH_KEYS) r[k] = r20(level + rng.gauss() * spread);
  if (league === 'wnba') r.rec = r20(level - 1 + rng.gauss() * 2);
  const c = { id, name, age: age ?? rng.int(36, 66), r, rep: r20(level + rng.gauss()), team: null, contract: null, real: real ? 1 : 0, hist: [], xp: 0, career: { w: 0, l: 0, titles: 0, ncaa: 0, wnba: 0 } };
  G.coaches[id] = c;
  return c;
}
export function makeAssistant(G, rng, team, role) {
  const lvl = team.league === 'ncaa' ? 6 + team.prestige * 0.3 : 10;
  const c = makeCoach(G, rng, { name: randomName(rng), level: lvl, spread: 1.5, league: team.league });
  c.r[role] = r20(lvl + 2 + rng.gauss() * 1.5);
  c.asst = role;
  c.contract = { sal: Math.round((40 + lvl * 8) / 5) * 5000, thru: G.season + rng.int(0, 2) };
  return c;
}
export function hireHead(G, c, team, years) {
  if (team.coach && G.coaches[team.coach] && G.coaches[team.coach] !== c) { const o = G.coaches[team.coach]; o.team = null; o.contract = null; }
  c.team = team.id; team.coach = c.id;
  const sal = team.league === 'ncaa' ? Math.round((120 + team.prestige ** 2 * 7) / 10) * 10000 : Math.round((400 + team.prestige * 40) / 10) * 1000 * 10 / 10;
  c.contract = { sal, thru: G.season + years - 1, start: G.season, team: team.id };
}
export function hireAssistant(G, team, c) {
  if (team.staff.length >= 3) return false;
  c.team = team.id; team.staff.push(c.id); return true;
}
export function fireAssistant(G, team, cid) {
  team.staff = team.staff.filter(x => x !== cid);
  const c = G.coaches[cid]; if (c) { c.team = null; c.contract = null; }
}
// Effective coaching ratings: head coach plus what the assistants add in their areas (each assistant above the head coach
// in their specialty lifts it by 40% of the gap; any assistant adds a little to everything).
export function staffRatings(G, team) {
  const h = G.coaches[team.coach]; if (!h) return { off: 10, def: 10, gm: 10, rec: 10, dev: 10, mot: 10 };
  const out = { ...h.r };
  for (const cid of team.staff) {
    const a = G.coaches[cid]; if (!a) continue;
    const k = a.asst;
    if (k && a.r[k] > out[k]) out[k] += (a.r[k] - out[k]) * 0.4;
  }
  for (const k of COACH_KEYS) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

// Job offers for a brand-new unknown coach: small programs (lowest prestige), one per region where possible.
export function jobOffersForNewCoach(seed) {
  const rng = makeRng((seed ^ 0x5bd1e995) >>> 0);
  const low = TEAMS.filter(t => t.league === 'ncaa' && t.srs < -12);
  const out = [];
  while (out.length < 4 && low.length) { const i = Math.floor(rng() * low.length); out.push(low.splice(i, 1)[0]); }
  return out.map(t => ({ id: t.id, name: t.name, conf: t.conf, prestige: r20(10 + t.srs / 4.5), logo: t.logo }));
}

// ---------------------------------------------------------------- strength + tactics + lineups
const W8 = [1.2, 1.1, 1.05, 1, 0.95, 0.6, 0.45, 0.3];
export function teamStrength(G, team) {
  const v = team.roster.map(id => G.players[id]).filter(p => p && !p.inj).map(ovr).sort((a, b) => b - a);
  let s = 0, w = 0; W8.forEach((k, i) => { if (v[i] != null) { s += v[i] * k; w += k; } });
  return w ? s / w : 0;
}

export function aiTactics(G, team) {
  const ps = team.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a)).slice(0, 8);
  const avg = (f, list = ps) => list.reduce((s, p) => s + f(p), 0) / Math.max(1, list.length);
  const bigs = ps.filter(p => p.pos === 'C' || p.pos === 'PF'), guards = ps.filter(p => p.pos === 'PG' || p.pos === 'SG');
  const c = G.coaches[team.coach] || { r: { off: 10, def: 10 } };
  const h = [...team.id].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 5381);   // stable per-team flavour
  const lvl = avg(ovr);
  const sc = {
    motion: 0.25 + (avg(p => p.r.pas) - lvl) * 0.2,
    pnr: (avg(p => p.r.hdl, guards) - lvl) * 0.25 + (avg(p => p.r.fin, bigs) - lvl) * 0.15,
    post: (avg(p => p.r.post, bigs) - lvl) * 0.35 - 0.3,
    fiveout: (avg(p => p.r.three) - lvl) * 0.4,
    drive: (avg(p => p.r.spd + p.r.fin, guards) / 2 - lvl) * 0.25,
    princeton: (avg(p => p.r.iq + p.r.pas) / 2 - lvl) * 0.2 - 0.5,
  };
  Object.keys(sc).forEach((k, i) => { sc[k] += ((h >> (i * 3)) & 7) / 14; });
  const off = Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
  const perim = avg(p => p.r.perD), inside = avg(p => p.r.postD, bigs.length ? bigs : ps);
  const dsc = { man: 1.0 + (perim - lvl) * 0.2, z23: (inside - perim) * 0.25 + 0.2, z32: (perim - inside) * 0.2, matchup: (avg(p => p.r.iq) - lvl) * 0.2, z131: (avg(p => p.r.stl) - lvl) * 0.25 - 0.2 };
  Object.keys(dsc).forEach((k, i) => { dsc[k] += ((h >> (i * 4 + 2)) & 7) / 12; });
  const def = Object.entries(dsc).sort((a, b) => b[1] - a[1])[0][0];
  const fast = avg(p => p.r.spd + p.r.sta) / 2 - lvl;
  const press = (fast > 0.4 || avg(p => p.r.stl) - lvl > 0.6) && ((h >> 20) & 3) < 2;   // deep, quick or ball-hawking teams often press
  return { ...defaultTactics(), off, def, press, pace: fast > 1 ? 'fast' : fast < -1 ? 'slow' : 'normal' };
}

// Starting five: best players with at least two guards and one big, at most two centers.
export function pickStarters(players) {
  const s = players.slice().sort((a, b) => ovr(b) - ovr(a)), five = [];
  const g = p => posGroup(p.pos);
  for (const p of s) {
    if (five.length === 5) break;
    const n = k => five.filter(q => g(q) === k).length, left = 5 - five.length;
    const needG = Math.max(0, 2 - n('G')), needB = Math.max(0, 1 - five.filter(q => q.pos === 'PF' || q.pos === 'C').length);
    if (g(p) === 'C' && n('C') >= 2) continue;
    if (left <= needG + needB && !((needG && g(p) === 'G') || (needB && (p.pos === 'PF' || p.pos === 'C')))) continue;
    five.push(p);
  }
  for (const p of s) if (five.length < 5 && !five.includes(p)) five.push(p);
  return five.map(p => p.id);
}

// Game-ready plan for a team: user plan if set (cleaned), else automatic.
export function teamPlan(G, team) {
  const avail = team.roster.map(id => G.players[id]).filter(p => p && !p.inj);
  const ids = new Set(avail.map(p => p.id));
  if (team.plan && team.plan.starters) {
    const starters = team.plan.starters.filter(id => ids.has(id));
    const auto = pickStarters(avail).filter(id => !starters.includes(id));
    while (starters.length < 5 && auto.length) starters.push(auto.shift());
    const min = {}; for (const p of avail) min[p.id] = team.plan.min?.[p.id] ?? 0;
    const tot = Object.values(min).reduce((s, x) => s + x, 0);
    return { starters, min: tot >= 150 ? min : autoMinutes(avail, starters), manual: !!team.plan.manual };
  }
  const starters = pickStarters(avail);
  return { starters, min: autoMinutes(avail, starters) };
}

// Engine-ready team object.
export function gameTeam(G, tid) {
  const t = G.teams[tid], sr = staffRatings(G, t);
  const players = t.roster.map(id => G.players[id]).filter(p => p && !p.inj).map(p => ({ id: p.id, name: p.name, pos: p.pos, ht: p.ht, r: p.r }));
  return { id: t.id, name: t.short || t.name, abbr: t.abbr, players, tactics: t.tactics, plan: teamPlan(G, t), coach: { off: sr.off, def: sr.def, gm: sr.gm } };
}
