// Awards, record books, Hall of Fame (docs/legacy.md). Careers count from the start of the save (the real rosters bring
// last season's line as background only). No imports from world.js / season.js (avoids load-order cycles).

export const AWARDS = {
  npoy: ['ncaa', 'National Player of the Year'], naa1: ['ncaa', 'All-American, first team'], naa2: ['ncaa', 'All-American, second team'],
  nfoy: ['ncaa', 'Freshman of the Year'], ndpoy: ['ncaa', 'Defensive Player of the Year'], nmop: ['ncaa', 'Final Four Most Outstanding Player'],
  ncpoy: ['ncaa', 'Conference Player of the Year'], ncoy: ['ncaa', 'Coach of the Year'],
  mvp: ['wnba', 'WNBA MVP'], aw1: ['wnba', 'All-WNBA, first team'], aw2: ['wnba', 'All-WNBA, second team'], roy: ['wnba', 'Rookie of the Year'],
  dpoy: ['wnba', 'Defensive Player of the Year'], fmvp: ['wnba', 'Finals MVP'], wcoy: ['wnba', 'Coach of the Year'],
};
export const REC_KEYS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-pointers made']];
const N = 10;
const val = (b, k) => (k === 'reb' ? b.orb + b.drb : b[k]);
const recs = (G, lg) => { G.records ||= {}; return (G.records[lg] ||= { game: {}, season: {}, avg: {}, tgame: {}, tseason: {} }); };
const news = (G, text, me = 0) => { G.news.push({ day: G.day + 1, text, me }); if (G.news.length > 300) G.news.splice(0, G.news.length - 300); };
// keep a top-N list of [value, ...info] sorted by value (desc)
function push(list, entry) {
  if (list.length >= N && entry[0] <= list[list.length - 1][0]) return false;
  list.push(entry); list.sort((a, b) => b[0] - a[0]); if (list.length > N) list.length = N;
  return true;
}

// ---------------------------------------------------------------- single-game records (every game)
export function gameRecords(G, g, res) {
  const R = recs(G, g.lg), ut = G.coaches[G.user.coach]?.team;
  res.box.forEach((box, side) => {
    const tid = side ? g.a : g.h, opp = side ? g.h : g.a;
    for (const [pid, b] of Object.entries(box)) {
      if (!b.sec) continue;
      for (const [k] of REC_KEYS) {
        const v = val(b, k); if (!v) continue;
        const L = (R.game[k] ||= []), was = L[0]?.[0] ?? 0;
        if (push(L, [v, pid, G.players[pid]?.name || '?', tid, opp, G.season, g.day]) && v > was && L.length >= N && tid === ut) news(G, `Record! ${G.players[pid]?.name} sets the ${g.lg.toUpperCase()} single-game record with ${v} ${k === 'tpm' ? 'threes' : k === 'pts' ? 'points' : k}.`, 1);
      }
    }
  });
  const [a, b] = res.score;
  push((R.tgame.pts ||= []), [a, g.h, g.a, G.season, g.day]); push((R.tgame.pts ||= []), [b, g.a, g.h, G.season, g.day]);
  push((R.tgame.margin ||= []), [Math.abs(a - b), a > b ? g.h : g.a, a > b ? g.a : g.h, G.season, g.day, Math.max(a, b), Math.min(a, b)]);
}

// ---------------------------------------------------------------- season records + awards (after a league's archive)
const minG = lg => (lg === 'ncaa' ? 20 : 26);
function seasonLines(G, lg) {
  const out = [];
  for (const p of Object.values(G.players)) {
    const h = p.hist?.find(x => x.season === G.season && x.league === lg); if (!h || !h.st.g) continue;
    out.push({ p, h, st: h.st, t: G.teams[h.team] });
  }
  return out;
}
export function seasonRecords(G, lg) {
  const R = recs(G, lg);
  for (const { p, h, st } of seasonLines(G, lg)) {
    for (const [k] of REC_KEYS) { const v = val(st, k); if (v) push((R.season[k] ||= []), [v, p.id, p.name, h.team, G.season]); }
    if (st.g >= minG(lg)) for (const k of ['pts', 'reb', 'ast']) push((R.avg[k] ||= []), [Math.round(val(st, k) / st.g * 10) / 10, p.id, p.name, h.team, G.season]);
  }
  for (const t of Object.values(G.teams)) {
    if (t.league !== lg) continue;
    const h = t.hist?.[t.hist.length - 1]; if (!h || h.season !== G.season || !(h.w + h.l)) continue;
    push((R.tseason.w ||= []), [h.w, t.id, G.season, h.l]);
    push((R.tseason.pct ||= []), [Math.round(h.w / (h.w + h.l) * 1000) / 1000, t.id, G.season, h.w, h.l]);
    push((R.tseason.ppg ||= []), [Math.round(h.pf / (h.w + h.l) * 10) / 10, t.id, G.season]);
  }
}
// Player value for awards: production per game, scaled by availability and the team's success.
const prod = st => (st.pts + 1.1 * (st.orb + st.drb) + 1.4 * st.ast + 1.8 * st.stl + 1.6 * st.blk - 1.2 * st.tov) / st.g;
const defv = (p, st) => (2 * st.stl + 2.2 * st.blk + 0.35 * st.drb) / st.g + ((p.r?.perD || 10) + (p.r?.postD || 10)) * 0.12;
const tpct = t => { const h = t?.hist?.[t.hist.length - 1]; return h && h.w + h.l ? h.w / (h.w + h.l) : 0.5; };
function give(G, lg, k, who, tid, line, coach = false) {
  G.awards.push({ s: G.season, k, id: who.id, t: tid, v: line });
  (who.aw ||= []).push([G.season, k]);
  const mine = coach ? who.user : tid === G.coaches[G.user.coach]?.team;
  return mine;
}
const lineOf = st => `${(st.pts / st.g).toFixed(1)} pts, ${((st.orb + st.drb) / st.g).toFixed(1)} reb, ${(st.ast / st.g).toFixed(1)} ast`;
// Best player of `tid` over a set of games with box scores (Final Four / Finals MVP).
function seriesBest(G, games, tid) {
  const sum = {};
  for (const g of games) {
    if (!g.box) continue; const side = g.h === tid ? 0 : g.a === tid ? 1 : -1; if (side < 0) continue;
    for (const [pid, a] of Object.entries(g.box.box[side])) { const s = (sum[pid] ||= { pts: 0, reb: 0, ast: 0, g: 0 }); s.pts += a[1]; s.reb += a[8] + a[9]; s.ast += a[10]; s.g++; }
  }
  const best = Object.entries(sum).sort((a, b) => (b[1].pts + b[1].reb * 0.8 + b[1].ast) - (a[1].pts + a[1].reb * 0.8 + a[1].ast))[0];
  return best ? [best[0], `${(best[1].pts / best[1].g).toFixed(1)} pts, ${(best[1].reb / best[1].g).toFixed(1)} reb in ${best[1].g} games`] : null;
}
export function seasonAwards(G, lg, perfOf) {
  const lines = seasonLines(G, lg).filter(x => x.st.g >= minG(lg) * 0.75);
  const score = x => prod(x.st) * Math.min(1, x.st.g / (lg === 'ncaa' ? 28 : 38)) + tpct(x.t) * (lg === 'ncaa' ? 7 : 10);
  lines.sort((a, b) => score(b) - score(a));
  const said = [], mine = [];
  const award = (k, x, extra = '') => { const m = give(G, lg, k, x.p, x.h.team, lineOf(x.st) + extra); if (m) mine.push(`${x.p.name}: ${AWARDS[k][1]}`); return x; };
  if (lg === 'ncaa') {
    const poy = award('npoy', lines[0]); said.push(`National Player of the Year: ${poy.p.name} (${G.teams[poy.h.team]?.short})`);
    lines.slice(0, 5).forEach(x => award('naa1', x)); lines.slice(5, 10).forEach(x => award('naa2', x));
    const fr = lines.find(x => x.p.cls === 'FR'); if (fr) { award('nfoy', fr); said.push(`Freshman of the Year: ${fr.p.name}`); }
    const d = lines.slice().sort((a, b) => defv(b.p, b.st) - defv(a.p, a.st))[0]; if (d) award('ndpoy', d);
    const byConf = {}; for (const x of lines) { const c = x.t?.conf; if (c && c !== 'Independent' && !byConf[c]) byConf[c] = x; }
    for (const x of Object.values(byConf)) award('ncpoy', x, ` (${x.t.conf})`);
    if (G.bracket?.champ) { const b = seriesBest(G, G.games.filter(g => g.tid === G.bracket.id && g.tr >= 4), G.bracket.champ); if (b && G.players[b[0]]) { give(G, lg, 'nmop', G.players[b[0]], G.bracket.champ, b[1]); said.push(`Final Four MOP: ${G.players[b[0]].name}`); if (G.bracket.champ === G.coaches[G.user.coach]?.team) mine.push(`${G.players[b[0]].name}: Final Four Most Outstanding Player`); } }
  } else {
    const mvp = award('mvp', lines[0]); said.push(`MVP: ${mvp.p.name} (${G.teams[mvp.h.team]?.name})`);
    lines.slice(0, 5).forEach(x => award('aw1', x)); lines.slice(5, 10).forEach(x => award('aw2', x));
    const roy = lines.find(x => x.p.draft?.season === G.season || x.p.exp === 0); if (roy) { award('roy', roy); said.push(`Rookie of the Year: ${roy.p.name}`); }
    const d = lines.slice().sort((a, b) => defv(b.p, b.st) - defv(a.p, a.st))[0]; if (d) { award('dpoy', d); said.push(`Defensive Player of the Year: ${d.p.name}`); }
    if (G.wpo?.champ) { const b = seriesBest(G, G.games.filter(g => g.kind === 'po' && g.sr === 2), G.wpo.champ); if (b && G.players[b[0]]) { give(G, lg, 'fmvp', G.players[b[0]], G.wpo.champ, b[1]); said.push(`Finals MVP: ${G.players[b[0]].name}`); if (G.wpo.champ === G.coaches[G.user.coach]?.team) mine.push(`${G.players[b[0]].name}: Finals MVP`); } }
  }
  // Coach of the Year: best season vs expectations
  // Coach of the Year: beat expectations, but voters also reward winning big and going deep in the postseason
  const coyScore = t => { const h = t.hist[t.hist.length - 1], pf = perfOf(t); if (pf == null) return null; return pf + 0.35 * h.w / Math.max(1, h.w + h.l) + (h.f != null && h.f >= 0 ? 0.06 * h.f : 0); };
  const cands = Object.values(G.teams).filter(t => t.league === lg && G.coaches[t.coach]).map(t => [t, coyScore(t)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
  if (cands.length) {
    const [t] = cands[0], c = G.coaches[t.coach], h = t.hist[t.hist.length - 1];
    if (give(G, lg, lg === 'ncaa' ? 'ncoy' : 'wcoy', c, t.id, `${h.w}-${h.l} at ${t.short || t.name}`, true)) mine.push(`You: ${AWARDS[lg === 'ncaa' ? 'ncoy' : 'wcoy'][1]}`);
    said.push(`Coach of the Year: ${c.name} (${t.short || t.name})`);
  }
  news(G, `${G.season} ${lg === 'ncaa' ? 'college' : 'WNBA'} awards. ${said.join('. ')}.`);
  if (mine.length) news(G, `Awards for your team: ${mine.join('; ')}.`, 1);
  seasonRecords(G, lg);
}

// ---------------------------------------------------------------- career leaders (on demand)
export function careerTotals(p, lg) {
  const t = { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, seasons: 0 };
  for (const h of p.hist || []) if (h.league === lg) { t.seasons++; t.g += h.st.g; t.pts += h.st.pts; t.reb += h.st.orb + h.st.drb; t.ast += h.st.ast; t.stl += h.st.stl; t.blk += h.st.blk; t.tpm += h.st.tpm; }
  if (p.league === lg && p.st?.g) { const s = p.st; t.g += s.g; t.pts += s.pts; t.reb += s.orb + s.drb; t.ast += s.ast; t.stl += s.stl; t.blk += s.blk; t.tpm += s.tpm; }
  return t;
}
export function careerLeaders(G, lg, key, n = 10) {
  const out = [];
  for (const p of Object.values(G.players)) { if (!p.hist?.length && !p.st?.g) continue; const t = careerTotals(p, lg); if (!t.g) continue; out.push({ p, v: key === 'ppg' ? (t.g >= (lg === 'ncaa' ? 60 : 80) ? t.pts / t.g : 0) : t[key], t }); }
  return out.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n);
}
export function coachLeaders(G, key, n = 10) {
  return Object.values(G.coaches).filter(c => !c.asst && (c.career.w + c.career.l)).map(c => ({ c, v: key === 'titles' ? c.career.titles : c.career.w })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, n);
}

// ---------------------------------------------------------------- Hall of Fame (at rollover)
// Players: eligible two seasons after leaving the game world; scored on awards, titles and career production.
const AW_PTS = { npoy: 6, naa1: 2.5, naa2: 1.2, nmop: 2, nfoy: 0.5, ndpoy: 1, ncpoy: 0.3, mvp: 12, aw1: 5, aw2: 2.5, fmvp: 4, roy: 1.5, dpoy: 3 };
export function hofScore(G, p) {
  let s = p.pre || 0;   // real players: credit for the career before the save
  for (const [, k] of p.aw || []) s += AW_PTS[k] || 0;
  const c = careerTotals(p, 'ncaa'), w = careerTotals(p, 'wnba');
  s += c.pts / 1000 + w.pts / 1000 * 2.5 + w.seasons * 0.4;
  for (const h of p.hist || []) {
    const t = G.teams[h.team], th = t?.hist?.find(x => x.season === h.season);
    if (th && th.f === (h.league === 'ncaa' ? 6 : 3)) s += h.league === 'ncaa' ? 2.5 : 3;
  }
  return Math.round(s * 10) / 10;
}
export const coachHofScore = c => Math.round((c.career.titles * 5 + c.career.w / 60 + (c.aw || []).length * 1.5) * 10) / 10;
export const HOF_BAR = { player: 30, coach: 22 };
export function hallOfFame(G) {
  G.hof ||= [];
  const inducted = [];
  const pl = Object.values(G.players).filter(p => p.league === 'gone' && !p.hof && p.left && G.season - p.left >= 2 && G.season - p.left <= 8)
    .map(p => [p, hofScore(G, p)]).filter(x => x[1] >= HOF_BAR.player).sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [p, s] of pl) { p.hof = G.season; G.hof.push({ id: p.id, kind: 'player', s: G.season, score: s }); inducted.push(p.name); }
  const co = Object.values(G.coaches).filter(c => !c.hof && !c.user && (c.retired || (!c.team && c.age >= 64)) && coachHofScore(c) >= HOF_BAR.coach).slice(0, 2);
  for (const c of co) { c.hof = G.season; G.hof.push({ id: c.id, kind: 'coach', s: G.season, score: coachHofScore(c) }); inducted.push(`coach ${c.name}`); }
  if (inducted.length) news(G, `Hall of Fame class of ${G.season}: ${inducted.join(', ')}.`, 1);
}
