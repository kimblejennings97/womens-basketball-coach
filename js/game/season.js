// Season loop on the shared calendar: play each day's games, standings, polls, conference tournaments, Selection Sunday,
// the 68-team NCAA tournament (top-16 seeds host rounds 1-2), WNBA regular season.
import { Game } from '../engine/game.js';
import { makeRng } from '../engine/rng.js';
import { calendar, fmtDay } from './sched.js';
import { gameTeam, teamStrength, userTeam, emptyRec } from './world.js';

export const STAT_KEYS = ['g', 'gs', 'sec', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'];
const BRACKET16 = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
export const ROUND_NAMES = ['First round', 'Second round', 'Sweet 16', 'Elite Eight', 'Final Four', 'Championship'];

export const gameById = (G, id) => G.games.find(g => g.id === id);
export const userGames = G => { const t = userTeam(G); return G.games.filter(g => g.h === t || g.a === t); };
export const nextUserGame = G => { const t = userTeam(G); return G.games.find(g => !g.done && (g.h === t || g.a === t)); };
export const news = (G, text, me = 0) => { G.news.push({ day: G.day + 1, text, me }); if (G.news.length > 300) G.news.splice(0, G.news.length - 300); };

// ---------------------------------------------------------------- results
export function simGame(G, g) {
  const seed = (G.seed ^ hash(g.id)) >>> 0;
  const game = new Game(gameTeam(G, g.h), gameTeam(G, g.a), { league: g.lg, seed, neutral: !!g.neutral });
  return game;
}
const hash = s => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

export function applyResult(G, g, res, keepBox = false) {
  g.done = 1; g.s = res.score; if (res.ot) g.ot = res.ot;
  const [H, A] = [G.teams[g.h], G.teams[g.a]];
  const hw = res.score[0] > res.score[1];
  const conf = g.kind === 'conf';
  for (const [T, won, home, pf, pa] of [[H, hw, true, res.score[0], res.score[1]], [A, !hw, false, res.score[1], res.score[0]]]) {
    const r = T.rec;
    if (g.kind === 'po' || g.kind === 'ncaa' || g.kind === 'ct') { (T.post ||= { w: 0, l: 0 }); won ? T.post.w++ : T.post.l++; }
    won ? r.w++ : r.l++;
    if (conf) won ? r.cw++ : r.cl++;
    if (!g.neutral) { if (home) won ? r.hw++ : r.hl++; else won ? r.aw++ : r.al++; }
    r.pf += pf; r.pa += pa; r.strk = won ? Math.max(1, r.strk + 1) : Math.min(-1, r.strk - 1);
    const hc = G.coaches[T.coach]; if (hc) { won ? hc.career.w++ : hc.career.l++; hc.xp = (hc.xp || 0) + (won ? 2 : 1); }
  }
  // player stats
  res.box.forEach((box, side) => {
    for (const [pid, b] of Object.entries(box)) {
      if (!b.sec) continue;
      const p = G.players[pid]; if (!p) continue;
      const st = (p.st ||= {}); if (!st.g) for (const k of STAT_KEYS) st[k] = 0;
      st.g++; st.gs += b.gs;
      for (const k of STAT_KEYS) if (k !== 'g' && k !== 'gs') st[k] += b[k];
      if (b.pts > (p.hi || 0)) p.hi = b.pts;
    }
  });
  injuries(G, g, res);
  // what we keep per game: full box for the user's games and the NCAA tournament / playoffs, else just the top scorers
  const ut = userTeam(G);
  if (keepBox || g.h === ut || g.a === ut || g.kind === 'ncaa' || g.kind === 'po') g.box = compactBox(res);
  g.top = res.box.map(b => { const [pid, x] = Object.entries(b).sort((a, c) => c[1].pts - a[1].pts)[0] || []; return pid ? [pid, x.pts, x.orb + x.drb, x.ast] : null; });
  if (g.tid) tourneyResult(G, g, hw ? g.h : g.a);
  if (g.ser != null) seriesResult(G, g, hw ? g.h : g.a);
  if (g.h === ut || g.a === ut) {
    const me = g.h === ut ? 0 : 1, opp = G.teams[me ? g.h : g.a];
    news(G, `${res.score[me] > res.score[1 - me] ? 'Won' : 'Lost'} ${res.score[me]}-${res.score[1 - me]}${res.ot ? ' (OT)' : ''} ${me ? 'at' : 'vs'} ${opp.short || opp.name}`, 1);
  }
}
const BOXK = ['sec', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'gs'];
export const compactBox = res => ({ box: res.box.map(b => Object.fromEntries(Object.entries(b).filter(([, x]) => x.sec > 0).map(([pid, x]) => [pid, BOXK.map(k => Math.round(x[k]))]))), q: res.qpts, tm: res.tm.map(t => ({ ...t })) });
export const expandLine = arr => Object.fromEntries(BOXK.map((k, i) => [k, arr[i]]));

// ---------------------------------------------------------------- the day loop
// Advance until something needs the user: their next game (returned, not played), Selection Sunday, end of a season,
// or maxDays. Returns { stop, game?, day }.
export function advance(G, { maxDays = 400, stopAtUserGame = true } = {}) {
  for (let i = 0; i < maxDays; i++) {
    const d = G.day + 1;
    const ev = dayEvents(G, d);
    if (stopAtUserGame) {
      const ug = G.games.find(g => g.day === d && !g.done && (g.h === userTeam(G) || g.a === userTeam(G)));
      if (ug) return { stop: 'game', game: ug, day: d };
    }
    playDay(G, d);
    G.day = d;
    const after = afterDay(G, d);
    if (ev || after) return { stop: ev || after, day: d };
  }
  return { stop: 'max', day: G.day };
}
// The user's game for day d has been played (live or simmed): record it, then play the rest of the day.
export function finishUserDay(G, g, res) {
  applyResult(G, g, res, true);
  playDay(G, g.day);
  G.day = g.day;
  return afterDay(G, g.day);
}
// Injuries: ~1 per team every 12-15 games. 60% short (days), 30% weeks, 10% season-ending.
const INJ = [['Ankle sprain', 3, 10, 0.4], ['Knee soreness', 2, 7, 0.2], ['Concussion', 7, 14, 0.1], ['Hamstring strain', 10, 28, 0.15], ['Broken hand', 21, 42, 0.07], ['Torn ACL', 240, 300, 0.05], ['Foot fracture', 45, 90, 0.03]];
function injuries(G, g, res) {
  const rng = makeRng((G.seed ^ hash(g.id + 'inj')) >>> 0);
  res.box.forEach(box => {
    for (const [pid, b] of Object.entries(box)) {
      if (!b.sec || rng() > 0.0042 * (b.sec / 60 / 30)) continue;
      const p = G.players[pid]; if (!p) continue;
      const [name, lo, hi] = rng.weighted(INJ, x => x[3]);
      const days = Math.round(lo + rng() * (hi - lo));
      p.inj = { name, until: g.day + days };
      const T = G.teams[p.team];
      if (T && T.id === userTeam(G)) news(G, `${p.name} is out with a ${name.toLowerCase()} (about ${days < 14 ? days + ' days' : Math.round(days / 7) + ' weeks'}).`, 1);
    }
  });
}
function heal(G, d) {
  for (const p of Object.values(G.players)) if (p.inj && p.inj.until <= d) {
    if (p.team === userTeam(G)) news(G, `${p.name} is back from injury.`, 1);
    p.inj = null;
  }
}
export function playDay(G, d) {
  heal(G, d);
  for (const g of G.games) if (g.day === d && !g.done) applyResult(G, g, simGame(G, g).run());
}
// Things that happen at the start of day d (may create games for that day). Returns an event name to stop on.
function dayEvents(G, d) {
  const cal = calendar(G.season);
  if (G.dayDone === d) return null;
  G.dayDone = d;
  let stop = null;
  if (d === cal.start) { updatePoll(G); news(G, `The ${G.season - 1}-${String(G.season).slice(2)} college season tips off.`); }
  if (d === cal.ct && !G.ct) startConfTourneys(G, d);
  if (d === cal.selection && !G.bracket) { selectNcaa(G, d); stop = 'selection'; }
  if (d === cal.wnbaStart) news(G, `The ${G.season} WNBA season opens.`);
  if (d >= cal.playoffs && !G.wpo && !G.games.some(g => g.lg === 'wnba' && g.kind === 'wnba' && !g.done)) startWnbaPlayoffs(G, d);
  if (G.wpo && !G.wpo.champ && G.wpo.r.length) advanceWnbaPlayoffs(G, d);
  for (const T of [...Object.values(G.tourneys || {}), G.bracket]) if (T) advanceTourney(G, T, d);
  return stop;
}
function afterDay(G, d) {
  const cal = calendar(G.season);
  if (d >= cal.start && (new Date(d * 86400000).getUTCDay() === 1)) updatePoll(G);
  if (G.bracket && G.bracket.champ && !G.bracket.done) { G.bracket.done = 1; return 'ncaa-champion'; }
  if (G.wpo && G.wpo.champ && !G.wpo.done) { G.wpo.done = 1; return 'wnba-champion'; }
  return null;
}

// ---------------------------------------------------------------- standings + power + polls
export function standings(G, lg, conf) {
  return Object.values(G.teams).filter(t => t.league === lg && (!conf || t.conf === conf)).sort((a, b) => {
    const pa = lg === 'ncaa' ? pct(a.rec.cw, a.rec.cl) : pct(a.rec.w, a.rec.l), pb = lg === 'ncaa' ? pct(b.rec.cw, b.rec.cl) : pct(b.rec.w, b.rec.l);
    return pb - pa || (b.rec.w - b.rec.l) - (a.rec.w - a.rec.l) || (b.rec.pf - b.rec.pa) - (a.rec.pf - a.rec.pa);
  });
}
const pct = (w, l) => (w + l ? w / (w + l) : 0.5);
export const confsOf = (G, lg) => [...new Set(Object.values(G.teams).filter(t => t.league === lg).map(t => t.conf))].sort();

// SRS-style power rating from margins (capped at 25, 3-point home edge), blended with roster strength early in the season.
export function powerRatings(G, lg) {
  const teams = Object.values(G.teams).filter(t => t.league === lg);
  const str = Object.fromEntries(teams.map(t => [t.id, teamStrength(G, t)]));
  const mean = teams.reduce((s, t) => s + str[t.id], 0) / teams.length;
  const prior = Object.fromEntries(teams.map(t => [t.id, (str[t.id] - mean) * (lg === 'ncaa' ? 6 : 4)]));
  const games = G.games.filter(g => g.lg === lg && g.done);
  const opp = {}; for (const t of teams) opp[t.id] = [];
  for (const g of games) {
    const m = Math.max(-25, Math.min(25, g.s[0] - g.s[1] - (g.neutral ? 0 : 3)));
    opp[g.h].push([g.a, m]); opp[g.a].push([g.h, -m]);
  }
  let r = { ...prior };
  for (let it = 0; it < 30; it++) {
    const nr = {};
    for (const t of teams) {
      const L = opp[t.id], k = 5;
      const sum = L.reduce((s, [o, m]) => s + m + r[o], 0);
      nr[t.id] = (sum + prior[t.id] * k) / (L.length + k);
    }
    r = nr;
  }
  return r;
}
export function updatePoll(G) {
  const pw = powerRatings(G, 'ncaa');
  const prev = Object.fromEntries((G.polls.ncaa?.list || []).map(x => [x.id, x.rank]));
  const score = t => pw[t.id] + 14 * (pct(t.rec.w, t.rec.l) - 0.5) * Math.min(1, (t.rec.w + t.rec.l) / 10) - 1.2 * t.rec.l;
  const list = Object.values(G.teams).filter(t => t.league === 'ncaa').sort((a, b) => score(b) - score(a)).slice(0, 25).map((t, i) => ({ id: t.id, rank: i + 1, prev: prev[t.id] || null, w: t.rec.w, l: t.rec.l }));
  G.polls.ncaa = { day: G.day + 1, list };
}
export const pollRank = (G, tid) => (G.polls.ncaa?.list || []).find(x => x.id === tid)?.rank || null;

// ---------------------------------------------------------------- brackets (conference tournaments + NCAA)
function seedPositions(P) { let a = [1]; while (a.length < P) { const n = a.length * 2; a = a.flatMap(s => [s, n + 1 - s]); } return a; }
function startConfTourneys(G, d) {
  G.tourneys ||= {};
  for (const conf of confsOf(G, 'ncaa')) {
    if (conf === 'Independent') continue;
    const st = standings(G, 'ncaa', conf); if (st.length < 2) continue;
    const n = Math.min(st.length, 16), P = 2 ** Math.ceil(Math.log2(n));
    const slot = seedPositions(P).map(s => (s <= n ? st[s - 1].id : null));
    const rounds = Math.log2(P);
    const id = 'ct-' + conf;
    G.tourneys[id] = { id, name: `${conf} Tournament`, lg: 'ncaa', kind: 'ct', conf, P, slot, seeds: Object.fromEntries(st.slice(0, n).map((t, i) => [t.id, i + 1])), w: [], g: [], days: Array.from({ length: rounds }, (_, r) => d + r), neutral: 1 };
  }
  G.ct = 1;
  news(G, 'Conference tournaments begin.');
}
function entrants(G, T, r) {
  if (r === 0) return T.slot.map(s => (typeof s === 'string' && s.startsWith('pi:') ? (T.pre[+s.slice(3)].win ?? undefined) : s));
  return T.w[r - 1] || [];
}
function advanceTourney(G, T, d) {
  if (T.champ) return;
  const rounds = Math.log2(T.P);
  for (let r = 0; r < rounds; r++) {
    const E = entrants(G, T, r);
    T.w[r] ||= Array(E.length / 2).fill(undefined); T.g[r] ||= Array(E.length / 2).fill(null);
    for (let i = 0; i < E.length / 2; i++) {
      if (T.w[r][i] !== undefined) continue;
      const a = E[2 * i], b = E[2 * i + 1];
      if (a === undefined || b === undefined) continue;
      if (a === null || b === null) { T.w[r][i] = a ?? b; continue; }
      if (T.g[r][i]) continue;
      const day = T.kind === 'ncaa' ? bracketDay(T, r, i) : T.days[r];
      if (d < day) continue;
      const [h, aw] = hostOrder(G, T, a, b, r);
      const g = { id: `${T.id}-${r}-${i}`, day: d, lg: T.lg, h, a: aw, kind: T.kind, tid: T.id, tr: r, ti: i, neutral: neutralFor(G, T, h, r) ? 1 : 0 };
      G.games.push(g); T.g[r][i] = g.id;
    }
    if (T.w[r].some(x => x === undefined)) return;
  }
  const last = T.w[rounds - 1]; if (last && last[0] !== undefined) T.champ = last[0];
}
function hostOrder(G, T, a, b, r) {
  const sa = T.seeds?.[a] ?? 99, sb = T.seeds?.[b] ?? 99;
  return sa <= sb ? [a, b] : [b, a];
}
function neutralFor(G, T, h, r) {
  if (T.kind !== 'ncaa') return true;
  return !(r <= 1 && T.hosts && T.hosts.includes(h));
}
function tourneyResult(G, g, winner) {
  const T = (G.tourneys || {})[g.tid] || (G.bracket && G.bracket.id === g.tid ? G.bracket : null);
  if (!T) return;
  if (g.pre != null) { T.pre[g.pre].win = winner; return; }
  T.w[g.tr][g.ti] = winner;
  const rounds = Math.log2(T.P);
  if (g.tr === rounds - 1) {
    T.champ = winner;
    if (T.kind === 'ct') { G.teams[winner].autoBid = G.season; news(G, `${G.teams[winner].short} wins the ${T.name}.`, G.teams[winner].id === userTeam(G) ? 1 : 0); }
    if (T.kind === 'ncaa') { news(G, `${G.teams[winner].name} are the ${G.season} national champions!`, winner === userTeam(G) ? 1 : 0); G.teams[winner].titles = (G.teams[winner].titles || 0) + 1; }
  }
}
export const tourneyOf = (G, id) => (G.tourneys || {})[id] || (G.bracket && G.bracket.id === id ? G.bracket : null);

// Selection Sunday: 32-ish automatic bids (conference tournament champions) + at-large by power rating. First Four: the
// last four at-large teams (two games for 11-seed lines) and the four lowest automatic qualifiers (two games for 16 seeds).
function selectNcaa(G, d) {
  const cal = calendar(G.season);
  const pw = powerRatings(G, 'ncaa');
  const auto = Object.values(G.tourneys || {}).filter(T => T.kind === 'ct' && T.champ).map(T => T.champ);
  const autoSet = new Set(auto);
  const nAt = 68 - auto.length;
  const all = Object.values(G.teams).filter(t => t.league === 'ncaa' && !autoSet.has(t.id)).sort((a, b) => pw[b.id] - pw[a.id]);
  const pool = all.filter(t => t.rec.w >= t.rec.l - 2);
  if (pool.length < nAt) pool.push(...all.filter(t => !pool.includes(t)).slice(0, nAt - pool.length));
  const atLarge = pool.slice(0, nAt).map(t => t.id);
  const lastFour = atLarge.slice(-4), lowAuto = auto.slice().sort((a, b) => pw[a] - pw[b]).slice(0, 4);
  const playIn = new Set([...lastFour, ...lowAuto]);
  const pre = [[lastFour[0], lastFour[3]], [lastFour[1], lastFour[2]], [lowAuto[2], lowAuto[1]], [lowAuto[3], lowAuto[0]]].map(([a, b], k) => ({ a, b, win: undefined, k }));
  const entries = [...auto, ...atLarge].filter(id => !playIn.has(id)).map(id => ({ id, v: pw[id] }));
  pre.forEach((p, k) => entries.push({ id: 'pi:' + k, v: k < 2 ? -1e3 + k : -2e3 + k, pi: k }));
  entries.sort((a, b) => b.v - a.v);
  // at-large play-in winners are 11 seeds: place them on line 11
  const lines = [];
  const ordered = entries.filter(e => !e.pi), atPI = entries.filter(e => e.pi != null && e.pi < 2), autoPI = entries.filter(e => e.pi != null && e.pi >= 2);
  for (let L = 0, k = 0; L < 16; L++) {
    const line = [];
    if (L === 10) line.push(...atPI);
    if (L === 15) line.push(...autoPI);
    while (line.length < 4 && k < ordered.length) line.push(ordered[k++]);
    lines.push(line);
  }
  // S-curve into four regions
  const region = [[], [], [], []], seeds = {};
  lines.forEach((line, L) => line.forEach((e, j) => { const rg = L % 2 ? 3 - j : j; region[rg][L + 1] = e.id; seeds[e.id] = L + 1; }));
  pre.forEach(p => { const s = p.k < 2 ? 11 : 16; seeds[p.a] = s; seeds[p.b] = s; });
  const slot = [];
  for (let rg = 0; rg < 4; rg++) for (const s of BRACKET16) slot.push(region[rg][s]);
  const hosts = lines.slice(0, 4).flat().map(e => e.id);
  const days = [cal.ncaa.r1, cal.ncaa.r2, cal.ncaa.s16, cal.ncaa.e8, cal.ncaa.f4, cal.ncaa.ch];
  const T = { id: 'ncaa-' + G.season, name: `${G.season} NCAA Tournament`, lg: 'ncaa', kind: 'ncaa', P: 64, slot, seeds, hosts, pre, w: [], g: [], days,
    regions: ['Region 1', 'Region 2', 'Region 3', 'Region 4'], selDay: d };
  G.bracket = T;
  // First Four games
  pre.forEach((p, k) => { const g = { id: `${T.id}-pi-${k}`, day: cal.ncaa.ff + (k % 2), lg: 'ncaa', h: p.a, a: p.b, kind: 'ncaa', tid: T.id, pre: k, neutral: 1 }; G.games.push(g); p.gid = g.id; });
  const ut = userTeam(G);
  if (G.teams[ut].league === 'ncaa') news(G, seeds[ut] ? `Selection Sunday: ${G.teams[ut].short} is in the field as a No. ${seeds[ut]} seed!` : `Selection Sunday: ${G.teams[ut].short} did not make the NCAA Tournament.`, 1);
}
// restore the day function after load (functions are not saved)
export function bracketDay(T, r, i) {
  const base = T.days[r];
  if (r <= 3) { const per = T.P / 2 ** (r + 1), region = Math.floor(i / (per / 4)); return base + (region >= 2 ? 1 : 0); }
  return base;
}

// ---------------------------------------------------------------- WNBA playoffs
// Top 8 by record (no conferences): first round best-of-3 (1-1-1), semifinals best-of-5 (2-2-1), Finals best-of-7 (2-2-1-1-1).
export const WPO_ROUNDS = [{ name: 'First round', need: 2, pat: [1, 0, 1] }, { name: 'Semifinals', need: 3, pat: [1, 1, 0, 0, 1] }, { name: 'WNBA Finals', need: 4, pat: [1, 1, 0, 0, 1, 0, 1] }];
function startWnbaPlayoffs(G, d) {
  const seeds = standings(G, 'wnba').slice(0, 8).map(t => t.id);
  if (seeds.length < 8) { G.wpo = { seeds, r: [], champ: null, done: 1 }; return; }
  const mk = (a, b) => ({ a, b, wa: 0, wb: 0, g: [], next: d });
  G.wpo = { seeds, r: [[mk(seeds[0], seeds[7]), mk(seeds[3], seeds[4]), mk(seeds[2], seeds[5]), mk(seeds[1], seeds[6])]], champ: null };
  const ut = userTeam(G);
  news(G, 'The WNBA playoffs begin.' + (G.teams[ut].league === 'wnba' ? (seeds.includes(ut) ? ` ${G.teams[ut].name} are the No. ${seeds.indexOf(ut) + 1} seed.` : ` ${G.teams[ut].name} missed the playoffs.`) : ''), G.teams[ut].league === 'wnba' ? 1 : 0);
}
function advanceWnbaPlayoffs(G, d) {
  const P = G.wpo, ri = P.r.length - 1, R = WPO_ROUNDS[ri];
  for (const [i, sr] of P.r[ri].entries()) {
    if (sr.win || sr.pending || d < sr.next) continue;
    const k = sr.wa + sr.wb, higherHome = R.pat[k];
    const g = { id: `wpo-${G.season}-${ri}-${i}-${k}`, day: d, lg: 'wnba', h: higherHome ? sr.a : sr.b, a: higherHome ? sr.b : sr.a, kind: 'po', ser: i, sr: ri };
    G.games.push(g); sr.g.push(g.id); sr.pending = 1;
  }
  if (P.r[ri].every(sr => sr.win) && ri < 2) {
    const w = P.r[ri].map(sr => sr.win), seedOf = id => P.seeds.indexOf(id);
    const pair = (x, y) => (seedOf(x) < seedOf(y) ? [x, y] : [y, x]);
    const next = ri === 0 ? [pair(w[0], w[1]), pair(w[2], w[3])] : [pair(w[0], w[1])];
    P.r.push(next.map(([a, b]) => ({ a, b, wa: 0, wb: 0, g: [], next: d + 2 })));
  }
}
function seriesResult(G, g, winner) {
  const P = G.wpo, sr = P.r[g.sr][g.ser], R = WPO_ROUNDS[g.sr];
  sr.pending = 0; sr.next = g.day + 2;
  winner === sr.a ? sr.wa++ : sr.wb++;
  if (sr.wa === R.need || sr.wb === R.need) {
    sr.win = winner;
    if (g.sr === 2) { P.champ = winner; G.teams[winner].titles = (G.teams[winner].titles || 0) + 1; news(G, `${G.teams[winner].name} win the ${G.season} WNBA championship!`, winner === userTeam(G) ? 1 : 0); }
  }
}

// ---------------------------------------------------------------- season stats helpers
export const perGame = (st, k) => (st && st.g ? st[k] / st.g : 0);
export const mpg = st => (st && st.g ? st.sec / 60 / st.g : 0);
export function leaders(G, lg, key, n = 10, minG = 3) {
  return Object.values(G.players).filter(p => p.league === lg && p.team && p.st && p.st.g >= minG).map(p => ({ p, v: key === 'reb' ? (p.st.orb + p.st.drb) / p.st.g : key === 'fgp' ? (p.st.fga >= 5 * p.st.g ? p.st.fgm / p.st.fga : 0) : p.st[key] / p.st.g }))
    .sort((a, b) => b.v - a.v).slice(0, n);
}
export { fmtDay, emptyRec };
