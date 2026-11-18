// Calendar (one shared world clock for both leagues) and schedule builders.
// Days are integers: days since 1970-01-01 UTC. G.season = the year the college season ends and the WNBA season is played
// (season 2027 = the 2026-27 college season, then the 2027 WNBA season).
const MS = 86400000;
export const dayOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / MS);
export const dateOf = day => new Date(day * MS);
export const fmtDay = (day, long = false) => dateOf(day).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(long ? { weekday: 'short', year: 'numeric' } : {}) });
export const weekday = day => dateOf(day).getUTCDay();   // 0 = Sunday
export const seasonLabel = Y => `${Y - 1}-${String(Y).slice(2)}`;
const nthWeekday = (y, m, wd, n) => { let d = dayOf(y, m, 1); while (weekday(d) !== wd) d++; return d + 7 * (n - 1); };

export function calendar(Y) {
  const start = nthWeekday(Y - 1, 11, 2, 1);                      // first Tuesday of November
  const nonconf = [0, 4, 7, 10, 14, 18, 22, 25, 30, 34, 41, 47].map(x => start + x);
  const confStart = dayOf(Y - 1, 12, 30), conf = [];
  for (let i = 0, d = confStart; i < 18; i++) { conf.push(d); d += i % 2 ? 4 : 3; }
  let selection = dayOf(Y, 3, 12); while (weekday(selection) !== 0) selection++;   // Selection Sunday: first Sunday on/after Mar 12
  const ct = conf[conf.length - 1] + 4;                            // conference tournaments start
  const ncaa = { ff: selection + 3, r1: selection + 5, r2: selection + 7, s16: selection + 12, e8: selection + 14, f4: selection + 19, ch: selection + 21 };
  const collegeEnd = ncaa.ch + 1;
  let draft = nthWeekday(Y, 4, 1, 2);                              // second Monday of April, at least 4 days after the final
  while (draft < collegeEnd + 4) draft += 7;
  return {
    Y, start, nonconf, conf, ct, selection, ncaa,
    collegeEnd,
    portal: collegeEnd + 3, portalClose: collegeEnd + 45,          // transfer portal window (entries, then signings)
    recruitEnd: dayOf(Y, 5, 20),                                   // end of the late signing period
    faStart: dayOf(Y, 1, 21), faOpen: dayOf(Y, 2, 1),              // WNBA re-sign window, then the open market
    deadline: dayOf(Y, 8, 5),                                      // WNBA trade deadline
    draft,
    wnbaCuts: nthWeekday(Y, 5, 5, 2) - 3,                          // rosters down to 12
    wnbaStart: nthWeekday(Y, 5, 5, 2),                             // second Friday of May
    wnbaEnd: nthWeekday(Y, 9, 0, 2),
    playoffs: nthWeekday(Y, 9, 0, 2) + 5,
    nextStart: nthWeekday(Y, 11, 2, 1),
    rollover: nthWeekday(Y, 11, 2, 1) - 4,                         // new season: development, classes, schedules
  };
}

// Pair a list of teams into games for one round, avoiding repeats when possible (greedy on a shuffled order).
function pairRound(ids, rng, avoid, near) {
  const pool = ids.slice(); const games = [];
  // order by strength with noise so opponents are similar-ish (buy games still happen through the noise)
  pool.sort((a, b) => near(a) - near(b));
  const used = new Set();
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]; if (used.has(a)) continue;
    let best = null;
    for (let j = i + 1; j < Math.min(pool.length, i + 25); j++) {
      const b = pool[j]; if (used.has(b) || avoid(a, b)) continue;
      best = b; if (rng() < 0.55) break;
    }
    if (best) { used.add(a); used.add(best); games.push([a, best]); }
  }
  return games;
}

// Circle-method round robin. Returns rounds of [a,b] pairs (byes dropped).
export function roundRobin(ids) {
  const t = ids.slice(); if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const rd = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) rd.push(r % 2 ? [b, a] : [a, b]); }
    rounds.push(rd);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}

let gid = 0;
const mk = (day, lg, h, a, kind, extra = {}) => ({ id: 'x' + (gid++).toString(36) + Math.floor(Math.random() * 1e6).toString(36), day, lg, h, a, kind, ...extra });

// NCAA regular season: 12 non-conference rounds + an 18-game conference schedule (double round robin where it fits).
export function buildNcaaSchedule(G, rng) {
  const cal = calendar(G.season), games = [];
  const ids = Object.values(G.teams).filter(t => t.league === 'ncaa').map(t => t.id);
  const confOf = id => G.teams[id].conf, str = id => G.teams[id].prestige;
  const met = new Set(), key = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  for (const day of cal.nonconf) {
    const near = id => str(id) + rng.gauss() * 4.5;
    for (const [a, b] of pairRound(ids, rng, (a, b) => confOf(a) === confOf(b) || met.has(key(a, b)), near)) {
      met.add(key(a, b));
      // the stronger program usually hosts (buy games); some neutral-site early-season events
      const neutral = day >= cal.nonconf[6] && day <= cal.nonconf[7] && rng() < 0.6;
      const hostA = rng() < (str(a) >= str(b) ? 0.68 : 0.32);
      games.push(mk(day, 'ncaa', hostA ? a : b, hostA ? b : a, 'nc', neutral ? { neutral: 1 } : {}));
    }
  }
  const confs = {};
  for (const id of ids) (confs[confOf(id)] ||= []).push(id);
  for (const [cname, members] of Object.entries(confs)) {
    if (members.length < 2 || cname === 'Independent') continue;
    const order = members.slice().sort(() => rng() - 0.5);
    const rr = roundRobin(order), rr2 = rr.map(rd => rd.map(([a, b]) => [b, a]));
    let rounds = rr.concat(rr2);
    const per = members.length - 1;
    const target = Math.min(18, rounds.length);
    rounds = rounds.slice(0, Math.max(target, per));
    rounds.slice(0, cal.conf.length).forEach((rd, i) => { for (const [h, a] of rd) games.push(mk(cal.conf[i], 'ncaa', h, a, 'conf')); });
  }
  return games;
}

// WNBA regular season: 44 games. Each pair plays 3 times, plus 2 extra games per team; spread over May-September.
export function buildWnbaSchedule(G, rng) {
  const cal = calendar(G.season);
  const ids = Object.values(G.teams).filter(t => t.league === 'wnba').map(t => t.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = 0; k < 3; k++) pairs.push(k % 2 ? [ids[j], ids[i]] : [ids[i], ids[j]]);
  // extra games until everyone has 44 (same conference first)
  const cnt = Object.fromEntries(ids.map(id => [id, (ids.length - 1) * 3]));
  for (let guard = 0; guard < 500; guard++) {
    const need = ids.filter(id => cnt[id] < 44).sort(() => rng() - 0.5);
    if (need.length < 2) break;
    const a = need[0], b = need.find(x => x !== a && G.teams[x].conf === G.teams[a].conf) || need[1];
    pairs.push(rng() < 0.5 ? [a, b] : [b, a]); cnt[a]++; cnt[b]++;
  }
  pairs.sort(() => rng() - 0.5);
  const games = [], lastDay = {}, nDays = cal.wnbaEnd - cal.wnbaStart;
  // fill days greedily: each team at most one game per day and a day of rest after a game where possible
  let day = cal.wnbaStart, left = pairs.slice();
  while (left.length && day <= cal.wnbaEnd + 30) {
    const busy = new Set(), keep = [];
    const slots = Math.ceil(left.length / Math.max(1, cal.wnbaEnd - day + 1) * 1.15) + 1;
    let used = 0;
    for (const p of left) {
      const [h, a] = p;
      if (used < slots && !busy.has(h) && !busy.has(a) && !(lastDay[h] === day - 1 || lastDay[a] === day - 1)) {
        busy.add(h); busy.add(a); lastDay[h] = lastDay[a] = day; used++;
        games.push(mk(day, 'wnba', h, a, 'wnba'));
      } else keep.push(p);
    }
    left = keep; day++;
  }
  void nDays;
  return games;
}
