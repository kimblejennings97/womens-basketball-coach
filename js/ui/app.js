// Game shell: Football-Manager-style screens over the game core.
import { OFFENSES, DEFENSES, PACES, LATE_FOUL, RULES } from '../engine/rules.js';
import { fmtClock, periodName, ovr as engOvr } from '../engine/game.js';
import { RATING_NAMES, RATING_GROUPS, fmtHt, randomName } from '../data/gen.js';
import { makeRng } from '../engine/rng.js';
import * as W from '../game/world.js';
import * as S from '../game/season.js';
import { calendar, fmtDay, seasonLabel } from '../game/sched.js';
import { initSaves, loadLast, loadSlot, saveGame, deleteSlot, listSaves } from '../game/saves.js';
import * as OF from '../game/offseason.js';
import * as RC from '../game/recruit.js';

const $app = document.getElementById('app');
await initSaves();
let G = await loadLast();
const ui = { screen: 'home', arg: null, tab: {}, live: null, pending: null, msg: '', sel: null,
  start: { mode: 'unknown', name: '', league: 'ncaa', team: null, q: '', seed: Math.floor(Math.random() * 2 ** 31) } };

// ---------------------------------------------------------------- helpers
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tier = v => (v >= 17 ? 't4' : v >= 13 ? 't3' : v >= 9 ? 't2' : 't1');
const rt = v => `<span class="rt ${tier(v)}">${Math.round(v)}</span>`;
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const pctS = (m, a) => (a ? (m / a).toFixed(3).replace(/^0/, '') : '-');
const hue = str => [...String(str)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const ovr = p => engOvr(p);
const me = () => G.teams[W.userTeam(G)];
const myCoach = () => G.coaches[G.user.coach];
function badge(name, px, color) {
  const ini = String(name).replace(/[^A-Za-z& ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  return `<span class="logo badge" style="width:${px}px;height:${px}px;line-height:${px}px;font-size:${Math.round(px * 0.42)}px;background:${color || `hsl(${hue(name)} 42% 36%)`}">${ini}</span>`;
}
function logo(t, px = 22) {
  if (!t) return '';
  return `<img class="logo" src="${t.logo}" width="${px}" height="${px}" alt="" loading="lazy" data-b="${esc(badge(t.short || t.name, px, t.color))}" onerror="this.outerHTML=this.dataset.b">`;
}
const teamName = t => (t.league === 'ncaa' ? t.short : t.name);
const tn = (tid, px = 20, label) => { const t = G.teams[tid]; if (!t) return '-'; const rk = t.league === 'ncaa' ? S.pollRank(G, tid) : null; return `<span class="tn">${px ? logo(t, px) : ""}${rk ? `<small class="muted">${rk}</small>` : ''}<a class="wlink" data-act="team" data-v="${tid}">${esc(label ?? teamName(t))}</a></span>`; };
const pl = (pid, label) => { const p = G.players[pid]; return p ? `<a class="wlink" data-act="player" data-v="${pid}">${esc(label ?? p.name)}</a>` : esc(label ?? '?'); };
const cl = cid => { const c = G.coaches[cid]; return c ? `<a class="wlink" data-act="coach" data-v="${cid}">${esc(c.name)}</a>` : '-'; };
const rec = t => `${t.rec.w}-${t.rec.l}`;
const clsS = p => W.CLASS_SHORT[p.cls] || p.cls || '';
const clsAge = p => (p.league === 'wnba' || !p.cls) ? `${p.age ?? ''}` : clsS(p);
const stars = n => `<span class="stars">${'★'.repeat(n || 0)}</span>`;
const K = n => '$' + Math.round((n || 0) / 1000) + 'K';
const money = n => '$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'K');
const stLine = st => st && st.g ? `${f1(st.pts / st.g)} pts, ${f1((st.orb + st.drb) / st.g)} reb, ${f1(st.ast / st.g)} ast` : '';
function save() { if (G) saveGame(G); }
function go(screen, arg = null) { ui.screen = screen; ui.arg = arg; ui.msg = ui.msg && screen === ui.screen ? ui.msg : ''; render(); window.scrollTo(0, 0); }

// ---------------------------------------------------------------- render root
function render() {
  if (!G) { $app.innerHTML = renderStart(); return; }
  if (ui.screen === 'live' && ui.live) { $app.innerHTML = topbar() + `<div class="content">${renderLive()}</div>`; return; }
  const lgNav = me().league === 'ncaa' ? [['recruit', 'Recruiting']] : [['fa', 'Free agency'], ['trade', 'Trades']];
  const nOff = (G.user.offers || []).length;
  const nav = [['home', 'Home'], ['roster', 'Roster'], ['tactics', 'Tactics'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['rankings', 'Rankings'], ['bracket', 'Tournaments'], ['stats', 'Stats'], ['teams', 'Teams'], ...lgNav, ['draft', 'Draft'], ['staff', 'Staff'], ...(nOff ? [['jobs', `Job offers (${nOff})`]] : [])];
  const body = ({ home: renderHome, roster: renderRoster, tactics: renderTactics, schedule: renderSchedule, standings: renderStandings, rankings: renderRankings, bracket: renderBracket,
    stats: renderStats, teams: renderTeams, staff: renderStaff, team: renderTeam, player: renderPlayer, coach: renderCoach, box: renderBox, pregame: renderPregame, menu: renderMenu,
    recruit: renderRecruit, draft: renderDraft, fa: renderFA, trade: renderTrade, jobs: renderJobs }[ui.screen] || renderHome)();
  $app.innerHTML = topbar() + `<div class="layout"><nav>${nav.map(([k, l]) => `<a class="${ui.screen === k ? 'on' : ''}" data-act="go" data-v="${k}">${l}</a>`).join('')}<hr><a data-act="go" data-v="menu" class="off2">Game menu</a></nav><div class="content">${ui.msg ? `<div class="card">${ui.msg}</div>` : ''}${body}</div></div>`;
}
function topbar() {
  const t = me(), c = myCoach();
  const ng = S.nextUserGame(G);
  let next = 'Continue';
  const pend = S.pendingStop(G);
  if (ui.pending) next = 'Go to game';
  else if (pend === 'jobs') next = 'Choose a new job';
  else if (pend === 'draft') next = 'You are on the clock';
  else if (ng) next = `Continue ▶ <small style="font-weight:400">${fmtDay(ng.day)} ${ng.h === t.id ? 'vs' : '@'} ${esc(teamName(G.teams[ng.h === t.id ? ng.a : ng.h]))}</small>`;
  const live = ui.screen === 'live';
  return `<div class="top">${t ? `<span class="tn">${logo(t, 30)}<span class="brand">${esc(t.name)}</span></span><span class="rec">${rec(t)}${t.league === 'ncaa' ? ` (${t.rec.cw}-${t.rec.cl})` : ''}</span>` : '<span class="brand">Unemployed</span>'}
    <span class="muted">${esc(c.name)}</span><span class="grow"></span><span class="muted">${fmtDay(G.day + 1, true)}</span>
    ${live ? '' : `<button class="big" data-act="continue">${next}</button>`}</div>`;
}

// ---------------------------------------------------------------- start screen
function renderStart() {
  const st = ui.start, saves = listSaves();
  const offers = W.jobOffersForNewCoach(st.seed);
  if (st.mode === 'unknown' && !offers.find(o => o.id === st.team)) st.team = offers[0]?.id;
  let pick = '';
  if (st.mode === 'pick') {
    const all = TEAMS_LIST().filter(t => t.league === st.league && (!st.q || (t.name + ' ' + t.conf).toLowerCase().includes(st.q.toLowerCase())));
    pick = `<div class="row"><div class="tabs">${['ncaa', 'wnba'].map(l => `<button class="${st.league === l ? 'on' : ''}" data-act="st-league" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div>
      <input type="search" placeholder="Search teams or conferences" value="${esc(st.q)}" data-ch="st-q" style="flex:1"></div>
      <div style="max-height:340px;overflow:auto"><table class="tbl">${all.map(t => `<tr class="${st.team === t.id ? 'me' : ''}" data-act="st-team" data-v="${t.id}" style="cursor:pointer"><td>${logoRaw(t, 22)} ${esc(t.name)}</td><td class="muted">${esc(t.conf)}</td><td>${rt(t.prestige)}</td></tr>`).join('')}</table></div>`;
  } else {
    pick = `<p class="hint">Nobody knows your name yet. These small programs are willing to give you a shot. Win there and bigger jobs (and the WNBA) will come calling.</p>
      ${offers.map(o => `<div class="offer ${st.team === o.id ? 'on' : ''}" data-act="st-team" data-v="${o.id}">${logoRaw(o, 40)}<div><b>${esc(o.name)}</b><div class="muted">${esc(o.conf)} · prestige ${o.prestige}/20 · 3-year contract</div></div></div>`).join('')}`;
  }
  return `<div class="start">
    <div class="card"><h1>Women's Basketball Coach</h1><p class="muted">College and pro. Start as an unknown and work your way up, or take over any program.</p>
      <div class="row"><label>Coach name</label><input type="text" value="${esc(st.name)}" data-ch="st-name" placeholder="Your name" style="flex:1"></div>
      <div class="tabs"><button class="${st.mode === 'unknown' ? 'on' : ''}" data-act="st-mode" data-v="unknown">Unknown coach</button><button class="${st.mode === 'pick' ? 'on' : ''}" data-act="st-mode" data-v="pick">Pick any team</button></div>
      ${pick}
      <div class="row" style="margin-top:12px"><button class="big" data-act="st-go" ${st.team ? '' : 'disabled'}>Start career</button></div></div>
    ${saves.length ? `<div class="card"><h2>Saved games</h2><table class="tbl">${saves.map(s => `<tr><td><b>${esc(s.name)}</b><div class="muted">${seasonLabel(s.season)} · ${fmtDay(s.day + 1)}</div></td><td style="text-align:right"><button data-act="load" data-v="${s.id}">Load</button> <button class="secondary" data-act="del" data-v="${s.id}">Delete</button></td></tr>`).join('')}</table></div>` : ''}
  </div>`;
}
let _teams = null;
const TEAMS_LIST = () => _teams || [];
import('../data/real.js').then(m => { _teams = m.TEAMS.map(t => ({ ...t, prestige: t.league === 'ncaa' ? Math.max(1, Math.min(20, Math.round(10 + t.srs / 4.5))) : Math.max(1, Math.min(20, Math.round(10 + t.srs / 1.5))) })).sort((a, b) => a.name.localeCompare(b.name)); if (!G) render(); });
const logoRaw = (t, px) => `<img class="logo" src="${t.logo}" width="${px}" height="${px}" alt="" data-b="${esc(badge(t.short || t.name, px))}" onerror="this.outerHTML=this.dataset.b">`;

// ---------------------------------------------------------------- home
function renderHome() {
  const t = me(), ng = ui.pending || S.nextUserGame(G);
  const lg = t.league;
  const confRows = S.standings(G, lg, t.conf).slice(0, 12);
  const poll = (G.polls.ncaa?.list || []).slice(0, 10);
  const newsL = G.news.slice(-14).reverse();
  return `<div class="grid2">
    <div class="card"><div class="hero">${logo(t, 64)}<div><h1>${esc(t.name)}</h1><div class="sub">${esc(t.conf)} · ${rec(t)}${lg === 'ncaa' ? ` · conf ${t.rec.cw}-${t.rec.cl}` : ''} · coach ${cl(t.coach)}</div>
      <div class="sub">${seasonLabel(G.season)} · ${OFFENSES[t.tactics.off].name} / ${DEFENSES[t.tactics.def].name}${t.tactics.press ? ' + press' : ''}</div></div></div>
      ${ng ? `<h2 style="margin-top:14px">Next game</h2><div class="row">${fmtDay(ng.day, true)} · ${ng.h === t.id ? 'vs' : '@'} ${tn(ng.h === t.id ? ng.a : ng.h, 28)} ${ng.neutral ? '<span class="pill">neutral</span>' : ''} ${kindLabel(ng)}</div>` : `<p class="muted">No games scheduled right now.</p>`}
    </div>
    <div class="card"><h2>News</h2>${newsL.map(n => `<div class="msg ${n.me ? '' : 'muted'}"><small class="muted">${fmtDay(n.day)}</small> ${esc(n.text)}</div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div>
    <div class="card"><h2>Coming up</h2>${upcoming().map(([d, l]) => `<div class="row" style="margin:2px 0"><span class="muted" style="min-width:90px">${fmtDay(d, true)}</span> ${esc(l)}</div>`).join('')}</div>
    <div class="card"><h2>${esc(t.conf)} standings</h2>${standingsTable(confRows, lg)}</div>
    ${lg === 'ncaa' ? `<div class="card"><h2>AP Top 25 <small class="muted">(top 10)</small></h2><table class="tbl">${poll.map(x => `<tr class="${x.id === t.id ? 'me' : ''}"><td>${x.rank}</td><td>${tn(x.id)}</td><td>${rec(G.teams[x.id])}</td></tr>`).join('')}</table></div>` : ''}
  </div>`;
}
function upcoming() {
  const out = [];
  for (const Y of [G.season, G.season + 1]) {
    const c = calendar(Y);
    out.push([c.start, `${seasonLabel(Y)} college season tips off`], [c.ct, 'Conference tournaments'], [c.selection, 'Selection Sunday'], [c.ncaa.f4, 'Final Four'], [c.collegeEnd, 'College offseason: departures, coaching carousel'],
      [c.portal, 'Transfer portal opens'], [c.draft, `${Y} WNBA draft`], [c.recruitEnd, 'Signing period ends'], [c.portalClose, 'Transfer portal closes'], [c.faStart, 'WNBA re-signing window'], [c.faOpen, 'WNBA free agency opens'],
      [c.wnbaCuts, 'WNBA roster cuts (12)'], [c.wnbaStart, `${Y} WNBA season opens`], [c.deadline, 'WNBA trade deadline'], [c.playoffs, 'WNBA playoffs'], [c.rollover, 'New season: development, freshmen arrive']);
  }
  return out.filter(([d]) => d > G.day).sort((a, b) => a[0] - b[0]).slice(0, 6);
}
const kindLabel = g => ({ conf: '<span class="pill">conference</span>', ct: '<span class="pill">conf. tournament</span>', ncaa: '<span class="pill">NCAA Tournament</span>', po: '<span class="pill">playoffs</span>' }[g.kind] || '');
function standingsTable(rows, lg) {
  return `<table class="tbl"><tr><th></th><th>Team</th>${lg === 'ncaa' ? '<th class="num">Conf</th>' : ''}<th class="num">W-L</th><th class="num">Diff</th><th class="num">Strk</th></tr>
    ${rows.map((t, i) => `<tr class="${W.isUserTeam(G, t.id) ? 'me' : ''}"><td>${i + 1}</td><td>${tn(t.id)}</td>${lg === 'ncaa' ? `<td class="num">${t.rec.cw}-${t.rec.cl}</td>` : ''}<td class="num">${rec(t)}</td><td class="num ${t.rec.pf - t.rec.pa >= 0 ? 'pos' : 'neg'}">${t.rec.w + t.rec.l ? f1((t.rec.pf - t.rec.pa) / (t.rec.w + t.rec.l)) : '-'}</td><td class="num">${t.rec.strk > 0 ? 'W' + t.rec.strk : t.rec.strk < 0 ? 'L' + -t.rec.strk : '-'}</td></tr>`).join('')}</table>`;
}

// ---------------------------------------------------------------- roster
const ROSTER_COLS = [['fin', 'FIN'], ['post', 'PST'], ['mid', 'MID'], ['three', '3PT'], ['ft', 'FT'], ['hdl', 'HDL'], ['pas', 'PAS'], ['perD', 'PER'], ['postD', 'INT'], ['stl', 'STL'], ['blk', 'BLK'], ['dreb', 'REB'], ['spd', 'SPD'], ['iq', 'IQ']];
function rosterTable(team, full = true) {
  const mine = W.isUserTeam(G, team.id) && !ui.live;
  const sort = ui.tab.rsort || 'ovr';
  const ps = team.roster.map(id => G.players[id]).filter(Boolean);
  const key = p => sort === 'ovr' ? -ovr(p) : sort === 'pos' ? ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(p.pos) : sort === 'name' ? p.name : -(p.r[sort] ?? 0);
  ps.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const h = (k, l) => `<th class="num" data-act="rsort" data-v="${k}" style="cursor:pointer">${l}</th>`;
  return `<div style="overflow-x:auto"><table class="tbl dense"><tr><th>#</th><th data-act="rsort" data-v="name" style="cursor:pointer">Name</th><th data-act="rsort" data-v="pos" style="cursor:pointer">Pos</th><th>Ht</th><th>${team.league === 'ncaa' ? 'Cls' : 'Age'}</th>${h('ovr', 'OVR')}<th>POT</th>${full ? ROSTER_COLS.map(([k, l]) => h(k, l)).join('') : ''}<th>Season</th>${team.league === 'wnba' ? '<th>Contract</th>' : '<th>NIL</th>'}${mine ? '<th></th>' : ''}</tr>
    ${ps.map(p => `<tr><td class="muted">${esc(p.num ?? '')}</td><td>${pl(p.id)}${p.inj ? ` <span class="neg" title="${esc(p.inj.name)}">INJ</span>` : ''}</td><td>${p.pos}</td><td>${fmtHt(p.ht)}</td><td>${clsAge(p)}</td><td>${rt(ovr(p))}</td><td>${rt(p.pot)}</td>${full ? ROSTER_COLS.map(([k]) => `<td>${rt(p.r[k])}</td>`).join('') : ''}<td class="muted">${stLine(p.st)}</td>${team.league === 'wnba' ? `<td class="muted">${p.contract ? money(p.contract.sal) + ' thru ' + p.contract.thru : '-'}</td>` : `<td class="muted">${p.nil ? K(p.nil) : '-'}</td>`}${mine ? `<td><button class="secondary small" data-act="release" data-v="${p.id}">Release</button></td>` : ''}</tr>`).join('')}</table></div>`;
}
function renderRoster() { const t = me(); return `<div class="card"><h2>${esc(t.name)} roster <small class="muted">${t.roster.length} players</small></h2>${rosterTable(t)}<p class="hint">Click a column to sort. Ratings are 1-20.</p></div>`; }

// ---------------------------------------------------------------- tactics + rotation
function renderTactics() {
  const t = me(), tac = t.tactics, plan = W.teamPlan(G, t);
  const sel = (key, obj) => `<select data-ch="tac" data-k="${key}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${tac[key] === k ? 'selected' : ''}>${esc(v.name ?? v)}</option>`).join('')}</select>`;
  const ps = t.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => (plan.starters.includes(b.id) - plan.starters.includes(a.id)) || (plan.min[b.id] || 0) - (plan.min[a.id] || 0) || ovr(b) - ovr(a));
  const tot = Object.values(plan.min).reduce((s, x) => s + x, 0);
  return `<div class="grid2"><div class="card"><h2>Game plan</h2>
    <div class="kv"><span>Offense</span><span>${sel('off', OFFENSES)}<div class="hint">${esc(OFFENSES[tac.off].desc)}</div></span>
    <span>Pace</span><span>${sel('pace', PACES)}</span>
    <span>Defense</span><span>${sel('def', DEFENSES)}<div class="hint">${esc(DEFENSES[tac.def].desc)}</div></span>
    <span>Full-court press</span><span><select data-ch="tac" data-k="press"><option value="0" ${!tac.press ? 'selected' : ''}>Off</option><option value="1" ${tac.press ? 'selected' : ''}>On</option></select><div class="hint">More turnovers and a faster game, but tires your players and gives up easy baskets when broken.</div></span>
    <span>Late-game fouling</span><span>${sel('late', LATE_FOUL)}</span></div>
    <p class="hint">The game plan is used in every game. In a live game you can change it at any time.</p></div>
  <div class="card"><h2>Rotation</h2><p class="hint">Tick five starters and set target minutes (total ${t.league === 'ncaa' || true ? 200 : 200}). In games the bench rotates in to hit the targets; tired players and players in foul trouble come out.${t.plan ? '' : ' <b>Currently automatic.</b>'}</p>
    <table class="tbl dense"><tr><th>Start</th><th class="l">Name</th><th>Pos</th><th>OVR</th><th>Min</th></tr>
    ${ps.map(p => `<tr><td><input type="checkbox" data-ch="starter" data-v="${p.id}" ${plan.starters.includes(p.id) ? 'checked' : ''}></td><td class="l">${pl(p.id)}</td><td>${p.pos}</td><td>${rt(ovr(p))}</td><td><input class="mins" type="number" min="0" max="40" value="${plan.min[p.id] || 0}" data-ch="mins" data-v="${p.id}"></td></tr>`).join('')}
    </table><div class="row"><span class="${Math.abs(tot - 200) > 5 ? 'neg' : 'muted'}">Total ${tot} / 200</span><span class="grow"></span><button class="secondary" data-act="autoplan">Automatic rotation</button></div></div></div>`;
}

// ---------------------------------------------------------------- schedule
function renderSchedule() {
  const tid = ui.arg || W.userTeam(G), t = G.teams[tid];
  const gs = G.games.filter(g => g.h === tid || g.a === tid).sort((a, b) => a.day - b.day);
  return `<div class="card"><h2>${tn(tid, 26)} schedule <small class="muted">${seasonLabel(G.season)}</small></h2>${schedTable(gs, tid)}</div>`;
}
function schedTable(gs, tid) {
  return `<table class="tbl"><tr><th>Date</th><th>Opponent</th><th></th><th>Result</th><th class="muted">Top scorer</th></tr>${gs.map(g => {
    const home = g.h === tid, opp = home ? g.a : g.h, side = home ? 0 : 1;
    let res = '';
    if (g.done) { const w = g.s[side] > g.s[1 - side]; res = `<a class="wlink ${w ? 'pos' : 'neg'}" data-act="box" data-v="${g.id}">${w ? 'W' : 'L'} ${g.s[side]}-${g.s[1 - side]}${g.ot ? ' OT' : ''}</a>`; }
    const top = g.top && g.top[side] ? `${pl(g.top[side][0])} ${g.top[side][1]}` : '';
    return `<tr><td>${fmtDay(g.day)}</td><td>${g.neutral ? 'vs' : home ? 'vs' : '@'} ${tn(opp)}</td><td>${kindLabel(g)}</td><td>${res}</td><td class="muted">${top}</td></tr>`;
  }).join('')}</table>`;
}

// ---------------------------------------------------------------- standings / rankings / stats / teams
function renderStandings() {
  const lg = ui.tab.slg || me().league;
  const confs = S.confsOf(G, lg);
  const conf = ui.tab.sconf && confs.includes(ui.tab.sconf) ? ui.tab.sconf : (me().league === lg ? me().conf : confs[0]);
  return `<div class="card"><div class="tabs">${['ncaa', 'wnba'].map(l => `<button class="${lg === l ? 'on' : ''}" data-act="tab" data-k="slg" data-v="${l}">${l.toUpperCase()}</button>`).join('')}
    <select data-ch="tabsel" data-k="sconf">${confs.map(c => `<option ${c === conf ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <h2>${esc(conf)}</h2>${standingsTable(S.standings(G, lg, conf), lg)}</div>`;
}
function renderRankings() {
  const poll = G.polls.ncaa?.list || [];
  const pw = S.powerRatings(G, 'wnba');
  const wn = Object.values(G.teams).filter(t => t.league === 'wnba').sort((a, b) => pw[b.id] - pw[a.id]);
  return `<div class="grid2"><div class="card"><h2>AP Top 25 <small class="muted">${G.polls.ncaa ? fmtDay(G.polls.ncaa.day) : ''}</small></h2><table class="tbl"><tr><th>#</th><th>Team</th><th>W-L</th><th>Prev</th></tr>
    ${poll.map(x => `<tr class="${W.isUserTeam(G, x.id) ? 'me' : ''}"><td>${x.rank}</td><td>${tn(x.id)}</td><td>${rec(G.teams[x.id])}</td><td class="muted">${x.prev || 'NR'}</td></tr>`).join('')}</table></div>
    <div class="card"><h2>WNBA power ranking</h2><table class="tbl"><tr><th>#</th><th>Team</th><th>W-L</th><th class="num">Rating</th></tr>${wn.map((t, i) => `<tr class="${W.isUserTeam(G, t.id) ? 'me' : ''}"><td>${i + 1}</td><td>${tn(t.id)}</td><td>${rec(t)}</td><td class="num">${f1(pw[t.id])}</td></tr>`).join('')}</table></div></div>`;
}
function renderStats() {
  const lg = ui.tab.stlg || me().league;
  const cats = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-pointers made'], ['fgp', 'FG% (5+ FGA/g)']];
  return `<div class="card"><div class="tabs">${['ncaa', 'wnba'].map(l => `<button class="${lg === l ? 'on' : ''}" data-act="tab" data-k="stlg" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div>
    <div class="rgroups" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cats.map(([k, l]) => `<div><h3>${l} per game</h3><table class="tbl dense">${S.leaders(G, lg, k, 10).map((x, i) => `<tr><td>${i + 1}</td><td>${pl(x.p.id)}</td><td>${tn(x.team, 16)}</td><td class="num">${k === 'fgp' ? x.v.toFixed(3) : f1(x.v)}</td></tr>`).join('') || '<tr><td class="muted">No games yet</td></tr>'}</table></div>`).join('')}</div></div>`;
}
function renderTeams() {
  const lg = ui.tab.tlg || 'ncaa', q = (ui.tab.tq || '').toLowerCase();
  const ts = Object.values(G.teams).filter(t => t.league === lg && (!q || (t.name + ' ' + t.conf).toLowerCase().includes(q)));
  const by = {}; for (const t of ts) (by[t.conf] ||= []).push(t);
  return `<div class="card"><div class="row"><div class="tabs">${['ncaa', 'wnba'].map(l => `<button class="${lg === l ? 'on' : ''}" data-act="tab" data-k="tlg" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div><input type="search" placeholder="Search" value="${esc(ui.tab.tq || '')}" data-ch="tabsel" data-k="tq"></div>
    <div class="rgroups" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${Object.keys(by).sort().map(c => `<div><h3>${esc(c)}</h3>${by[c].sort((a, b) => b.prestige - a.prestige).map(t => `<div class="row" style="margin:3px 0">${tn(t.id)} <span class="muted">${rec(t)}</span> <span class="grow"></span>${rt(t.prestige)}</div>`).join('')}</div>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------- team / player / coach profiles
function renderTeam() {
  const t = G.teams[ui.arg]; if (!t) return '';
  const tab = ui.tab.team || 'roster';
  const rk = t.league === 'ncaa' ? S.pollRank(G, t.id) : null;
  const sr = W.staffRatings(G, t);
  const gs = G.games.filter(g => g.h === t.id || g.a === t.id).sort((a, b) => a.day - b.day);
  return `<div class="card"><div class="hero">${logo(t, 72)}<div><h1>${esc(t.name)}</h1><div class="sub">${esc(t.conf)} · ${rec(t)}${t.league === 'ncaa' ? ` (${t.rec.cw}-${t.rec.cl} conf)` : ''}${rk ? ` · AP #${rk}` : ''} · prestige ${rt(t.prestige)}</div>
      <div class="sub">Head coach ${cl(t.coach)} · staff: ${t.staff.map(cl).join(', ') || 'none'}</div><div class="sub">Plays ${OFFENSES[t.tactics.off].name}, ${PACES[t.tactics.pace].name.toLowerCase()} pace · ${DEFENSES[t.tactics.def].name}${t.tactics.press ? ' + full-court press' : ''}</div></div></div></div>
    <div class="card"><div class="tabs">${[['roster', 'Roster'], ['schedule', 'Schedule'], ['staff', 'Coaching'], ['hist', 'History']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-k="team" data-v="${k}">${l}</button>`).join('')}</div>
    ${tab === 'hist' ? teamHist(t) : tab === 'roster' ? rosterTable(t) : tab === 'schedule' ? schedTable(gs, t.id) : `<div class="kv">${W.COACH_KEYS.map(k => `<span>${W.COACH_NAMES[k]}</span><span>${rt(sr[k])}</span>`).join('')}</div><p class="hint">Staff ratings: head coach plus what the assistants add in their specialties.</p>`}</div>`;
}
function teamHist(t) {
  const h = (t.hist || []).slice().reverse();
  if (!h.length) return '<p class="muted">No completed seasons in this save yet.</p>';
  return `<table class="tbl dense"><tr><th>Season</th><th class="num">W-L</th>${t.league === 'ncaa' ? '<th class="num">Conf</th><th>Poll</th>' : ''}<th>Postseason</th><th>Coach</th></tr>${h.map(x => `<tr><td>${t.league === 'ncaa' ? seasonLabel(x.season) : x.season}</td><td class="num">${x.w}-${x.l}</td>${t.league === 'ncaa' ? `<td class="num">${x.cw}-${x.cl}</td><td>${x.rk ? '#' + x.rk : ''}</td>` : ''}<td>${esc(OF.finishLabel(t.league, x.f))}${x.ct ? ' <span class="pill">conf. champ</span>' : ''}</td><td>${cl(x.coach)}</td></tr>`).join('')}</table>
    <p class="hint">Titles in this save: ${t.titles || 0}.</p>`;
}
function renderPlayer() {
  const p = G.players[ui.arg]; if (!p) return '<div class="card">Player not found.</div>';
  const t = p.team && G.teams[p.team];
  const st = p.st && p.st.g ? p.st : null;
  const bio = p.league === 'gone' ? 'Retired / left the game world' : p.league !== 'wnba' && p.cls ? `${W.CLASS_NAMES[p.cls] || p.cls || ''} · ${esc(p.home || '')}${p.hs ? ' · ' + esc(p.hs) : ''}` : `Age ${p.age}${p.exp != null ? ` · ${p.exp} yrs exp` : ''}${p.college ? ' · ' + esc(p.college) : ''}`;
  const extra = [p.rec ? `${stars(p.rec.stars)} ${p.rec.portal ? `Transfer portal (from ${G.teams[p.rec.from] ? tn(p.rec.from, 14) : '?'})` : `Recruit No. ${p.rec.rank}`}${p.rec.commit ? ` · committed to ${tn(p.rec.commit, 14)}` : ` · ${p.rec.off.length} offers`}` : '',
    p.stars ? `${stars(p.stars)} recruit (No. ${p.rk})` : '', p.draft ? `Drafted ${p.draft.season}, round ${p.draft.rd}, No. ${p.draft.pick} by ${tn(p.draft.team, 14)}` : '', p.league === 'ncaa' && p.nil ? `NIL deal ${K(p.nil)}/yr` : ''].filter(Boolean).join(' · ');
  if (!p.r) return `<div class="card"><div class="hero"><div><h1>${esc(p.name)}</h1><div class="sub">${p.pos} · ${bio}</div>${extra ? `<div class="sub">${extra}</div>` : ''}</div></div></div>` + careerCard(p);
  const prev = p.prev ? `<p class="hint">Last season (real stats): ${p.prev.g} games at ${G.teams[p.prev.team] ? tn(p.prev.team, 16) : esc(p.prev.team)}, ${f1(p.prev.pts / Math.max(1, p.prev.g))} pts, ${f1(p.prev.trb / Math.max(1, p.prev.g))} reb, ${f1(p.prev.ast / Math.max(1, p.prev.g))} ast in ${f1(p.prev.mp / Math.max(1, p.prev.g))} min.</p>` : '';
  const line = s => `<td class="num">${s.g}</td><td class="num">${s.gs}</td><td class="num">${f1(s.sec / 60 / s.g)}</td><td class="num">${f1(s.pts / s.g)}</td><td class="num">${f1((s.orb + s.drb) / s.g)}</td><td class="num">${f1(s.ast / s.g)}</td><td class="num">${f1(s.stl / s.g)}</td><td class="num">${f1(s.blk / s.g)}</td><td class="num">${f1(s.tov / s.g)}</td><td class="num">${pctS(s.fgm, s.fga)}</td><td class="num">${pctS(s.tpm, s.tpa)}</td><td class="num">${pctS(s.ftm, s.fta)}</td>`;
  const hdr = '<tr><th>Season</th><th>Team</th><th class="num">G</th><th class="num">GS</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th><th class="num">TO</th><th class="num">FG%</th><th class="num">3P%</th><th class="num">FT%</th></tr>';
  const rows = (p.hist || []).map(h => `<tr><td>${h.league === 'ncaa' ? seasonLabel(h.season) : h.season}</td><td>${G.teams[h.team] ? tn(h.team, 16) : esc(h.team)}</td>${line(h.st)}</tr>`).join('') + (st ? `<tr><td>${p.league === 'ncaa' ? seasonLabel(G.season) : G.season}</td><td>${t ? tn(t.id, 16) : '-'}</td>${line(st)}</tr>` : '');
  return `<div class="card"><div class="hero">${t ? logo(t, 64) : ''}<div><h1>${esc(p.name)} <small class="muted">#${esc(p.num ?? '')}</small></h1><div class="sub">${p.pos} · ${fmtHt(p.ht)} · ${t ? tn(t.id, 16) : 'Free agent'}</div><div class="sub">${bio}</div>
      ${extra ? `<div class="sub">${extra}</div>` : ''}<div class="sub">Overall ${rt(ovr(p))} · Potential ${rt(p.pot)}${p.contract ? ` · Contract ${money(p.contract.sal)} through ${p.contract.thru}` : ''}${p.inj ? ` · <span class="neg">Injured: ${esc(p.inj.name)}, back ${fmtDay(p.inj.until)}</span>` : ''}</div></div></div>${prev}</div>
    <div class="card"><h2>Ratings</h2><div class="rgroups">${RATING_GROUPS.map(([g, ks]) => `<div><h3>${g}</h3>${ks.map(k => `<div class="attr"><span>${RATING_NAMES[k]}</span><div class="bar"><i class="${tier(p.r[k])}" style="width:${p.r[k] * 5}%"></i></div><b>${p.r[k]}</b></div>`).join('')}</div>`).join('')}</div></div>
    ${gameLog(p)}
    <div class="card"><h2>Stats</h2>${rows ? `<div style="overflow-x:auto"><table class="tbl dense">${hdr}${rows}</table></div>` : '<p class="muted">No games played yet in this game.</p>'}${p.hi ? `<p class="hint">Career high: ${p.hi} points</p>` : ''}</div>`;
}
function careerCard(p) {
  const line = s => `<td class="num">${s.g}</td><td class="num">${f1(s.sec / 60 / s.g)}</td><td class="num">${f1(s.pts / s.g)}</td><td class="num">${f1((s.orb + s.drb) / s.g)}</td><td class="num">${f1(s.ast / s.g)}</td><td class="num">${pctS(s.fgm, s.fga)}</td>`;
  const rows = (p.hist || []).map(h => `<tr><td>${h.league === 'ncaa' ? seasonLabel(h.season) : h.season}</td><td>${G.teams[h.team] ? tn(h.team, 16) : esc(h.team || '')}</td>${line(h.st)}</tr>`).join('');
  return rows ? `<div class="card"><h2>Career</h2><table class="tbl dense"><tr><th>Season</th><th>Team</th><th class="num">G</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">FG%</th></tr>${rows}</table></div>` : '';
}
function gameLog(p) {
  const rows = [];
  for (const g of G.games) {
    if (!g.box || (g.h !== p.team && g.a !== p.team)) continue;
    const side = g.h === p.team ? 0 : 1, a = g.box.box[side][p.id]; if (!a) continue;
    const b = S.expandLine(a), w = g.s[side] > g.s[1 - side];
    rows.push(`<tr><td>${fmtDay(g.day)}</td><td>${side ? '@' : 'vs'} ${tn(side ? g.h : g.a, 16)}</td><td><a class="wlink ${w ? 'pos' : 'neg'}" data-act="box" data-v="${g.id}">${w ? 'W' : 'L'} ${g.s[side]}-${g.s[1 - side]}</a></td><td class="num">${Math.round(b.sec / 60)}</td><td class="num"><b>${b.pts}</b></td><td class="num">${b.orb + b.drb}</td><td class="num">${b.ast}</td><td class="num">${b.stl}</td><td class="num">${b.blk}</td><td class="num">${b.fgm}-${b.fga}</td><td class="num">${b.tpm}-${b.tpa}</td><td class="num">${b.ftm}-${b.fta}</td></tr>`);
  }
  if (!rows.length) return '';
  return `<div class="card"><h2>Game log <small class="muted">(games with a box score)</small></h2><div style="overflow-x:auto;max-height:360px"><table class="tbl dense"><tr><th>Date</th><th>Opponent</th><th>Result</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th><th class="num">FG</th><th class="num">3PT</th><th class="num">FT</th></tr>${rows.reverse().join('')}</table></div></div>`;
}
function renderCoach() {
  const c = G.coaches[ui.arg]; if (!c) return '';
  const t = c.team && G.teams[c.team];
  return `<div class="card"><div class="hero">${t ? logo(t, 64) : ''}<div><h1>${esc(c.name)}</h1><div class="sub">${c.asst ? W.ASST_ROLES[c.asst] : 'Head coach'}${t ? ' · ' + tn(t.id, 16) : ' · unemployed'} · age ${c.age} · reputation ${rt(c.rep)}</div>
      ${c.contract ? `<div class="sub">Contract ${money(c.contract.sal)}/yr through ${seasonLabel(c.contract.thru)}</div>` : ''}<div class="sub">Record since the start of this save: ${c.career.w}-${c.career.l}${c.career.titles ? ` · ${c.career.titles} title${c.career.titles > 1 ? 's' : ''}` : ''}</div></div></div></div>
    <div class="card"><h2>Ratings</h2><div class="rgroups">${W.COACH_KEYS.map(k => `<div class="attr"><span>${W.COACH_NAMES[k]}</span><div class="bar"><i class="${tier(c.r[k])}" style="width:${c.r[k] * 5}%"></i></div><b>${Math.round(c.r[k])}</b></div>`).join('')}</div></div>
    ${c.hist.length ? `<div class="card"><h2>Career</h2><table class="tbl dense"><tr><th>Season</th><th>Team</th><th class="num">W-L</th><th>Finish</th></tr>${c.hist.slice().reverse().map(h => `<tr><td>${h.lg === 'wnba' ? h.season : seasonLabel(h.season)}</td><td>${G.teams[h.team] ? tn(h.team, 16) : ''}</td><td class="num">${h.w != null ? `${h.w}-${h.l}` : ''}</td><td>${h.note ? esc(h.note) : esc(OF.finishLabel(h.lg, h.f))}</td></tr>`).join('')}</table></div>` : ''}`;
}

// ---------------------------------------------------------------- staff
function renderStaff() {
  const t = me(), c = myCoach(), sr = W.staffRatings(G, t);
  const open = G.user.staffWindow;
  const cands = open && t.staff.length < 3 ? candidates() : [];
  return `<div class="grid2"><div class="card"><h2>${esc(c.name)}</h2><div class="sub">Head coach · reputation ${rt(c.rep)} · contract ${money(c.contract.sal)}/yr through ${seasonLabel(c.contract.thru)}</div>
      <div class="rgroups" style="grid-template-columns:1fr">${W.COACH_KEYS.map(k => `<div class="attr"><span>${W.COACH_NAMES[k]}</span><div class="bar"><i class="${tier(c.r[k])}" style="width:${c.r[k] * 5}%"></i></div><b>${Math.round(c.r[k])}</b></div>`).join('')}</div>
      <p class="hint">Your ratings grow every season: experience, results against expectations (worth much more at a low-prestige program), how much your players develop and the recruiting classes you sign.</p></div>
    <div class="card"><h2>Assistant coaches <small class="muted">${t.staff.length}/3</small></h2>
      <table class="tbl dense"><tr><th>Name</th><th>Role</th>${W.COACH_KEYS.map(k => `<th>${k.toUpperCase()}</th>`).join('')}<th>Salary</th><th></th></tr>
      ${t.staff.map(id => { const a = G.coaches[id]; return `<tr><td>${cl(id)}</td><td>${W.ASST_ROLES[a.asst]}</td>${W.COACH_KEYS.map(k => `<td>${rt(a.r[k])}</td>`).join('')}<td>${money(a.contract.sal)}</td><td>${open ? `<button class="secondary" data-act="fire" data-v="${id}">Release</button>` : ''}</td></tr>`; }).join('')}</table>
      <p class="hint">${open ? 'Staff window open: you just took this job, so you can rebuild your staff (up to 3 assistants). It closes at your first game.' : 'You can change assistants when you move to a new job or when an assistant\'s contract runs out.'}</p>
      ${cands.length ? `<h3>Available assistants</h3><table class="tbl dense"><tr><th>Name</th><th>Specialty</th>${W.COACH_KEYS.map(k => `<th>${k.toUpperCase()}</th>`).join('')}<th>Salary</th><th></th></tr>${cands.map(a => `<tr><td>${esc(a.name)}</td><td>${W.ASST_ROLES[a.asst]}</td>${W.COACH_KEYS.map(k => `<td>${rt(a.r[k])}</td>`).join('')}<td>${money(a.contract.sal)}</td><td><button data-act="hire" data-v="${a.id}">Hire</button></td></tr>`).join('')}</table>` : ''}
      <h3>Effective staff ratings</h3><div class="kv">${W.COACH_KEYS.map(k => `<span>${W.COACH_NAMES[k]}</span><span>${rt(sr[k])}</span>`).join('')}</div></div></div>`;
}
function candidates() {
  if (!G.user.cands) {
    const rng = makeRng((G.seed + G.day * 7) >>> 0), t = me(), out = [];
    for (let i = 0; i < 8; i++) { const role = Object.keys(W.ASST_ROLES)[i % 4]; const a = W.makeAssistant(G, rng, t, role); a.r[role] = Math.min(20, a.r[role] + rng.int(-2, 3)); out.push(a.id); }
    G.user.cands = out;
  }
  return G.user.cands.map(id => G.coaches[id]).filter(a => a && !a.team);
}

// ---------------------------------------------------------------- tournaments
function renderBracket() {
  const opts = [];
  if (G.wpo) opts.push(['wpo', `${G.season} WNBA Playoffs`]);
  if (G.bracket) opts.push([G.bracket.id, G.bracket.name]);
  for (const T of Object.values(G.tourneys || {}).sort((a, b) => a.name.localeCompare(b.name))) opts.push([T.id, T.name]);
  if (!opts.length) return `<div class="card"><h2>Tournaments</h2><p class="muted">Conference tournaments start ${fmtDay(calendar(G.season).ct, true)}; Selection Sunday is ${fmtDay(calendar(G.season).selection, true)}.</p></div>`;
  const myCt = G.tourneys && G.tourneys['ct-' + me().conf];
  const id = ui.tab.bk && opts.find(o => o[0] === ui.tab.bk) ? ui.tab.bk : (G.wpo && me().league === 'wnba' ? 'wpo' : G.bracket ? G.bracket.id : myCt ? myCt.id : opts[0][0]);
  if (id === 'wpo') return `<div class="card"><div class="row"><select data-ch="tabsel" data-k="bk">${opts.map(([k, n]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${G.wpo.champ ? `<span>Champion: ${tn(G.wpo.champ, 22)}</span>` : ''}</div>${wpoView()}</div>`;
  const T = S.tourneyOf(G, id);
  return `<div class="card"><div class="row"><select data-ch="tabsel" data-k="bk">${opts.map(([k, n]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${T.champ ? `<span>Champion: ${tn(T.champ, 22)}</span>` : ''}</div>${bracketView(T)}</div>`;
}
function wpoView() {
  const P = G.wpo, seed = id => P.seeds.indexOf(id) + 1;
  return `<div class="bk">${P.r.map((rd, ri) => `<div class="rd"><h3>${S.WPO_ROUNDS[ri].name}</h3>${rd.map(sr => `<div class="m"><div class="${sr.win === sr.a ? 'w' : ''}"><span><span class="sd">${seed(sr.a)}</span>${tn(sr.a, 14)}</span><span>${sr.wa}</span></div><div class="${sr.win === sr.b ? 'w' : ''}"><span><span class="sd">${seed(sr.b)}</span>${tn(sr.b, 14)}</span><span>${sr.wb}</span></div></div>`).join('')}</div>`).join('')}</div>`;
}
function bracketView(T) {
  const rounds = Math.log2(T.P);
  const slotTeam = s => (typeof s === 'string' && s.startsWith('pi:') ? (T.pre[+s.slice(3)].win ?? null) : s);
  const cell = (a, b, gid, w) => {
    const g = gid && S.gameById(G, gid);
    const row = (x, k) => x === undefined ? `<div class="muted">TBD</div>` : x === null ? `<div class="muted">bye</div>` : `<div class="${w !== undefined && w === x ? 'w' : ''}"><span><span class="sd">${T.seeds?.[x] ?? ''}</span>${tn(x, 14)}</span><span>${g && g.done ? `<a class="wlink" data-act="box" data-v="${g.id}">${g.s[g.h === x ? 0 : 1]}</a>` : ''}</span></div>`;
    return `<div class="m">${row(a, 0)}${row(b, 1)}</div>`;
  };
  const cols = [];
  const regionPer = T.kind === 'ncaa' ? 16 : T.P;
  const sections = T.kind === 'ncaa' ? 4 : 1;
  let html = '';
  if (T.kind === 'ncaa' && T.pre) html += `<h3>First Four</h3><div class="bk"><div class="rd" style="flex-direction:row">${T.pre.map(p => cell(p.a, p.b, p.gid, p.win)).join('')}</div></div>`;
  for (let sct = 0; sct < sections; sct++) {
    const rs = [];
    for (let r = 0; r < (T.kind === 'ncaa' ? 4 : rounds); r++) {
      const E = r === 0 ? T.slot.map(slotTeam) : (T.w[r - 1] || []);
      const per = regionPer / 2 ** r, from = sct * per, ms = [];
      for (let i = from / 2; i < (from + per) / 2; i++) ms.push(cell(E[2 * i], E[2 * i + 1], T.g[r]?.[i], T.w[r]?.[i]));
      rs.push(`<div class="rd">${ms.join('')}</div>`);
    }
    html += `${T.kind === 'ncaa' ? `<h3>${T.regions[sct]}</h3>` : ''}<div class="bk">${rs.join('')}</div>`;
  }
  if (T.kind === 'ncaa') {
    const E4 = T.w[3] || [], E5 = T.w[4] || [];
    html += `<h3>Final Four</h3><div class="bk"><div class="rd">${cell(E4[0], E4[1], T.g[4]?.[0], T.w[4]?.[0])}${cell(E4[2], E4[3], T.g[4]?.[1], T.w[4]?.[1])}</div><div class="rd">${cell(E5[0], E5[1], T.g[5]?.[0], T.w[5]?.[0])}</div></div>`;
  }
  void cols;
  return html;
}

// ---------------------------------------------------------------- box score
function renderBox() {
  const g = S.gameById(G, ui.arg); if (!g) return '';
  if (!g.box) return `<div class="card"><h2>${tn(g.a)} ${g.s[1]} @ ${tn(g.h)} ${g.s[0]}</h2><p class="muted">Box scores are kept for your games and the postseason. Top scorers: ${g.top.map((x, i) => x ? `${pl(x[0])} ${x[1]} pts` : '').join(', ')}</p></div>`;
  const boxes = g.box.box.map(b => Object.fromEntries(Object.entries(b).map(([pid, a]) => [pid, S.expandLine(a)])));
  return boxScore([g.h, g.a], boxes, g.box.tm, g.box.q, g.s, `${fmtDay(g.day, true)}${g.neutral ? ' · neutral site' : ''}`);
}
function boxScore(ids, boxes, tms, q, score, sub = '') {
  const nq = Math.max(q[0].length, q[1].length);
  const qline = `<table class="tbl dense qline" style="max-width:420px"><tr><th></th>${Array.from({ length: nq }, (_, i) => `<th>${periodName(i + 1)}</th>`).join('')}<th>T</th></tr>${[0, 1].map(s => `<tr><td>${tn(ids[s], 16)}</td>${Array.from({ length: nq }, (_, i) => `<td>${q[s][i] ?? 0}</td>`).join('')}<td><b>${score[s]}</b></td></tr>`).join('')}</table>`;
  const tbl = s => {
    const rows = Object.entries(boxes[s]).filter(([, b]) => b.sec > 0).sort((a, b) => b[1].gs - a[1].gs || b[1].sec - a[1].sec);
    const r = (n, b) => `<td class="num">${Math.round(b.sec / 60)}</td><td class="num"><b>${b.pts}</b></td><td class="num">${b.fgm}-${b.fga}</td><td class="num">${b.tpm}-${b.tpa}</td><td class="num">${b.ftm}-${b.fta}</td><td class="num">${b.orb}</td><td class="num">${b.orb + b.drb}</td><td class="num">${b.ast}</td><td class="num">${b.stl}</td><td class="num">${b.blk}</td><td class="num">${b.tov}</td><td class="num">${b.pf}</td><td class="num ${b.pm > 0 ? 'pos' : b.pm < 0 ? 'neg' : ''}">${b.pm > 0 ? '+' : ''}${b.pm ?? ''}</td>`;
    const t = tms[s];
    return `<h3 style="margin-top:12px">${tn(ids[s], 20)}</h3><div style="overflow-x:auto"><table class="tbl dense"><tr><th>Player</th><th class="num">MIN</th><th class="num">PTS</th><th class="num">FG</th><th class="num">3PT</th><th class="num">FT</th><th class="num">OR</th><th class="num">REB</th><th class="num">AST</th><th class="num">STL</th><th class="num">BLK</th><th class="num">TO</th><th class="num">PF</th><th class="num">+/-</th></tr>
      ${rows.map(([pid, b]) => `<tr><td>${pl(pid)}${b.gs ? '' : ' <small class="muted">bench</small>'}</td>${r(pid, b)}</tr>`).join('')}
      <tr><td><b>Team</b></td><td></td><td class="num"><b>${t.pts}</b></td><td class="num">${t.fgm}-${t.fga} <small class="muted">${pctS(t.fgm, t.fga)}</small></td><td class="num">${t.tpm}-${t.tpa}</td><td class="num">${t.ftm}-${t.fta}</td><td class="num">${t.orb}</td><td class="num">${t.orb + t.drb}</td><td class="num">${t.ast}</td><td class="num">${t.stl}</td><td class="num">${t.blk}</td><td class="num">${t.tov}</td><td class="num">${t.pf}</td><td></td></tr></table></div>`;
  };
  return `<div class="card"><h2>${tn(ids[1], 26)} ${score[1]} &nbsp;@&nbsp; ${tn(ids[0], 26)} ${score[0]}</h2><div class="sub">${sub}</div>${qline}${tbl(1)}${tbl(0)}</div>`;
}

// ---------------------------------------------------------------- pregame + live game
function renderPregame() {
  const g = ui.pending; if (!g) return renderHome();
  const t = me(), oppId = g.h === t.id ? g.a : g.h, opp = G.teams[oppId];
  const scout = tm => { const ps = tm.roster.map(id => G.players[id]).filter(p => p && !p.inj).sort((a, b) => ovr(b) - ovr(a)).slice(0, 5); return ps.map(p => `<div class="row" style="margin:2px 0">${pl(p.id)} <span class="muted">${p.pos}</span> ${rt(ovr(p))} <span class="muted">${stLine(p.st)}</span></div>`).join(''); };
  return `<div class="card"><h2>${fmtDay(g.day, true)} ${kindLabel(g)}</h2>
    <div class="sb"><div class="tm">${logo(G.teams[g.a], 64)}<b>${tn(g.a, 0)}</b><span class="meta">${rec(G.teams[g.a])}</span></div><div class="per">${g.neutral ? 'neutral site' : '@'}</div><div class="tm">${logo(G.teams[g.h], 64)}<b>${tn(g.h, 0)}</b><span class="meta">${rec(G.teams[g.h])}</span></div></div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="big" data-act="watch">Coach the game live</button><button class="big secondary" data-act="simgame">Sim the game</button></div></div>
    <div class="grid2"><div class="card"><h2>Scouting: ${esc(teamName(opp))}</h2><div class="sub">${OFFENSES[opp.tactics.off].name} · ${DEFENSES[opp.tactics.def].name}${opp.tactics.press ? ' + press' : ''} · ${PACES[opp.tactics.pace].name}</div>${scout(opp)}</div>
    <div class="card"><h2>Your plan</h2><div class="sub">${OFFENSES[t.tactics.off].name} · ${DEFENSES[t.tactics.def].name}${t.tactics.press ? ' + press' : ''} · ${PACES[t.tactics.pace].name}</div>${scout(t)}<div class="row"><a class="wlink" data-act="go" data-v="tactics">Change tactics / rotation</a></div></div></div>`;
}
const SPEEDS = { slow: 1400, normal: 650, fast: 220, turbo: 40 };
function startLive(g) {
  const game = S.simGame(G, g);
  const side = g.h === W.userTeam(G) ? 0 : 1;
  game.s[side].noAutoTO = true;
  if (G.user.manualSubs) game.setManual(side, true);
  ui.live = { g, game, side, ev: [], speed: ui.live?.speed || 'normal', paused: false, sel: null, tab: 'pbp' };
  G.user.staffWindow = false;
  ui.screen = 'live';
  tickLive();
}
function tickLive() {
  clearTimeout(ui.timer);
  const L = ui.live; if (!L || ui.screen !== 'live') return;
  if (!L.paused && !L.game.done) {
    const evs = L.game.step(); L.ev.push(...evs);
    // pause on period ends so the coach can adjust
    if (evs.some(e => e.type === 'period' && e.text.startsWith('End')) && L.autoPause !== false) L.paused = true;
  }
  render();
  if (!L.paused && !L.game.done) ui.timer = setTimeout(tickLive, SPEEDS[L.speed]);
}
function renderLive() {
  const L = ui.live, game = L.game, [H, A] = game.s, me_ = game.s[L.side];
  const sideCls = i => (i === 0 ? 'h' : 'a');
  const evRow = e => `<div class="ev ${e.side != null ? sideCls(e.side) : ''} ${e.made || (e.type === 'ft' && e.made) ? 'made' : ''} ${e.type}"><span class="t">${e.q ? periodName(e.q) : ''} ${fmtClock(e.t)}</span>${esc(e.text)} <small class="muted">${e.sc[1]}-${e.sc[0]}</small></div>`;
  const bonus = S2 => game.bonusFor(S2) ? '<span class="bonus">BONUS</span>' : '';
  const sbT = (S2, i) => `<div class="tm">${logo(G.teams[S2.id], 54)}<b>${esc(S2.name)}</b><div class="pts" style="color:${scoreColor(G.teams[S2.id], i)}">${S2.score}</div><span class="meta">TO left ${S2.to} · fouls ${S2.tf} ${bonus(game.s[1 - i])}</span></div>`;
  const plRow = (p, on) => {
    const b = me_.box[p.id], out = b.pf >= game.L.foulOut;
    return `<div class="pl ${on ? '' : 'bench'} ${L.sel === p.id ? 'sel' : ''} ${out ? 'out' : ''}" data-act="lsel" data-v="${p.id}"><span>${p.pos}</span><span>${esc(p.name)} <small class="muted">${b.pts}p ${b.pf}f</small></span><div class="ebar"><i style="width:${Math.round(p.e * 100)}%;background:${p.e > 0.8 ? 'var(--green)' : p.e > 0.65 ? 'var(--gold)' : 'var(--red)'}"></i></div><small class="muted">${Math.round(b.sec / 60)}m</small>${rt(ovr(p))}</div>`;
  };
  const tac = me_.tactics;
  const sel = (key, obj) => `<select data-ch="ltac" data-k="${key}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${tac[key] === k ? 'selected' : ''}>${esc(v.name ?? v)}</option>`).join('')}</select>`;
  const done = game.done;
  const boxes = [H.box, A.box];
  return `<div class="card"><div class="sb">${sbT(A, 1)}<div><div class="per">${done ? 'FINAL' + (game.q > 4 ? ' (' + periodName(game.q) + ')' : '') : periodName(game.q)}</div><div class="clk">${done ? '' : fmtClock(game.clock)}</div>
      <div class="ctrl" style="justify-content:center;margin-top:6px">${done ? `<button data-act="lfinish">Continue</button>` : `<button data-act="lpause">${L.paused ? '▶ Play' : '❚❚ Pause'}</button><select data-ch="lspeed">${Object.keys(SPEEDS).map(k => `<option ${L.speed === k ? 'selected' : ''}>${k}</option>`).join('')}</select><button class="secondary" data-act="lsim">Sim to end</button>`}</div></div>${sbT(H, 0)}</div></div>
    <div class="gamewrap"><div class="card"><div class="tabs">${[['pbp', 'Play-by-play'], ['box', 'Box score']].map(([k, l]) => `<button class="${L.tab === k ? 'on' : ''}" data-act="ltab" data-v="${k}">${l}</button>`).join('')}</div>
      ${L.tab === 'pbp' ? `<div id="feed">${L.ev.slice(-160).reverse().map(evRow).join('')}</div>` : boxScore([H.id, A.id], boxes, [H.tm, A.tm], [H.qpts, A.qpts], [H.score, A.score])}</div>
    <div class="card"><h2>Your bench</h2>${done ? '' : `<div class="ctrl"><button data-act="lto" ${me_.to > 0 && !me_.wantTO ? '' : 'disabled'}>${me_.wantTO ? 'Timeout called' : 'Call timeout'}</button><label><input type="checkbox" data-ch="lmanual" ${me_.manual ? 'checked' : ''}> Manual subs</label></div>`}
      <div class="kv" style="margin:8px 0"><span>Offense</span><span>${sel('off', OFFENSES)}</span><span>Pace</span><span>${sel('pace', PACES)}</span><span>Defense</span><span>${sel('def', DEFENSES)}</span><span>Press</span><span><select data-ch="ltac" data-k="press"><option value="0" ${!tac.press ? 'selected' : ''}>Off</option><option value="1" ${tac.press ? 'selected' : ''}>On</option></select></span><span>Late fouling</span><span>${sel('late', LATE_FOUL)}</span></div>
      <p class="hint">${L.sel ? 'Now click the player to swap with.' : 'Click a player on the floor, then one on the bench, to sub.'}</p>
      <div class="court">${me_.on.map(p => plRow(p, true)).join('')}<hr style="border:0;border-top:1px solid var(--line);width:100%">${me_.players.filter(p => !me_.on.includes(p)).sort((a, b) => ovr(b) - ovr(a)).map(p => plRow(p, false)).join('')}</div></div></div>`;
}
// a team colour light enough to read on the dark scoreboard, else the default home/away colours
function scoreColor(t, i) {
  for (const c of [t.color, t.color2]) { if (!c) continue; const n = parseInt(c.slice(1), 16), l = 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); if (l > 90 && l < 235) return c; }
  return i ? 'var(--b)' : 'var(--a)';
}
function finishLive() {
  const L = ui.live; if (!L) return;
  clearTimeout(ui.timer);
  if (!L.game.done) L.game.run();
  const res = L.game.result();
  const stop = S.finishUserDay(G, L.g, res);
  ui.live = null; ui.pending = null; save();
  ui.screen = 'box'; ui.arg = L.g.id;
  handleStop(stop);
  render();
}

// ---------------------------------------------------------------- continue / day loop
function doContinue() {
  if (ui.pending) { go('pregame'); return; }
  const r = S.advance(G);
  G.user.staffWindow = G.user.staffWindow && r.stop !== 'game' ? G.user.staffWindow : G.user.staffWindow;
  if (r.stop === 'game') { ui.pending = r.game; save(); go('pregame'); return; }
  save();
  handleStop(r.stop);
  render();
}
function handleStop(stop) {
  if (stop === 'selection') { ui.msg = `<b>Selection Sunday.</b> The 68-team NCAA Tournament field is set.`; ui.screen = 'bracket'; ui.tab.bk = G.bracket.id; }
  else if (stop === 'ncaa-champion') { ui.msg = `<b>${esc(G.teams[G.bracket.champ].name)}</b> win the national championship.`; ui.screen = 'bracket'; ui.tab.bk = G.bracket.id; }
  else if (stop === 'wnba-champion') { ui.msg = `<b>${esc(G.teams[G.wpo.champ].name)}</b> win the ${G.season} WNBA championship.`; ui.screen = 'bracket'; ui.tab.bk = 'wpo'; }
  else if (stop === 'college-offseason') { const c = calendar(G.season); ui.msg = `<b>The college season is over.</b> Seniors moving on and 5th years leave, the transfer portal opens ${fmtDay(c.portal)} and closes ${fmtDay(c.portalClose)}, the WNBA draft is ${fmtDay(c.draft)}, and the signing period runs until ${fmtDay(c.recruitEnd)}. Check NIL deals for players who might transfer.`; ui.screen = 'recruit'; ui.tab.rc = 'nil'; }
  else if (stop === 'jobs') { ui.msg = G.user.fired ? '<b>You need a new job.</b> Pick one of the offers.' : '<b>You have job offers.</b> Take one or keep your current job (offers expire in a few days).'; ui.screen = 'jobs'; }
  else if (stop === 'draft') { ui.msg = '<b>You are on the clock.</b>'; ui.screen = 'draft'; }
  else if (stop === 'draft-done') { ui.msg = `<b>The ${G.season} WNBA draft is complete.</b>`; ui.screen = 'draft'; }
  else if (stop === 'fa') { ui.msg = '<b>Re-signing window.</b> Re-sign the expiring players you want to keep; the rest hit the open market on Feb 1.'; ui.screen = 'fa'; }
  else if (stop === 'new-season') { ui.msg = `<b>Welcome to the ${seasonLabel(G.season)} season.</b> Players developed over the summer${me().league === 'ncaa' ? ', the freshmen have arrived and a new recruiting class is on the board' : ''}.`; ui.screen = 'roster'; }
  else if (stop === 'max') ui.msg = 'Nothing happened for a long stretch of days.';
}
function simUserGame() {
  const g = ui.pending; if (!g) return;
  const res = S.simGame(G, g).run();
  G.user.staffWindow = false;
  const stop = S.finishUserDay(G, g, res);
  ui.pending = null; save();
  ui.screen = 'box'; ui.arg = g.id; ui.msg = '';
  handleStop(stop);
  render();
}

// ---------------------------------------------------------------- recruiting (college)
function interest(R, u) {
  const list = R.rec.off.map(tid => [tid, R.rec.int[tid] || 0]).sort((a, b) => b[1] - a[1]);
  const pos = list.findIndex(x => x[0] === u);
  return { mine: R.rec.int[u] || 0, pos: pos >= 0 ? pos + 1 : null, n: list.length, lead: list[0] };
}
function recruitRows(list, mode) {
  const u = W.userTeam(G), board = G.user.board || {};
  const hdr = `<tr><th>Rk</th><th></th><th class="l">Name</th><th>Pos</th><th>Ht</th><th>${mode === 'portal' ? 'From' : 'Home'}</th><th>OVR</th><th>POT</th>${mode === 'board' ? '<th>Your interest</th><th>Leader</th><th>Hours</th><th>Offer</th><th>NIL $K</th><th></th>' : '<th>Status</th><th></th>'}</tr>`;
  return `<div style="overflow-x:auto"><table class="tbl dense">${hdr}${list.map(R => {
    const r = R.rec, I = interest(R, u), off = r.off.includes(u);
    const status = r.commit ? `<b>${tn(r.commit, 14)}</b>` : `${r.off.length} offers${I.lead && I.lead[1] > 0 ? ` · leader ${tn(I.lead[0], 14)}` : ''}`;
    const base = `<td>${r.rank}</td><td>${stars(r.stars)}</td><td class="l">${pl(R.id)}</td><td>${R.pos}</td><td>${fmtHt(R.ht)}</td><td>${mode === 'portal' ? (G.teams[r.from] ? tn(r.from, 14) : '') : esc(R.home || '')}</td><td>${rt(ovr(R))}</td><td>${rt(R.pot)}</td>`;
    if (mode !== 'board') return `<tr>${base}<td>${status}</td><td>${r.commit ? '' : board[R.id] != null ? '<span class="muted">on board</span>' : `<button class="small" data-act="radd" data-v="${R.id}">+ Board</button>`}</td></tr>`;
    const need = r.portal ? 28 : 48 + (r.stars - 2) * 8;
    return `<tr>${base}<td><div class="bar" style="width:90px;display:inline-block"><i class="t3" style="width:${Math.min(100, I.mine / need * 100)}%"></i></div> <small>${I.pos ? `${I.pos} of ${I.n}` : 'no offer'}</small></td>
      <td>${r.commit ? `<b>${tn(r.commit, 14)}</b>` : I.lead ? tn(I.lead[0], 14) : '-'}</td>
      <td><select data-ch="rhours" data-v="${R.id}" ${r.commit ? 'disabled' : ''}>${[0, 2, 4, 6, 8, 10].map(h => `<option ${+board[R.id] === h ? 'selected' : ''}>${h}</option>`).join('')}</select></td>
      <td>${off ? '<span class="pos">offered</span>' : `<button class="small" data-act="roff" data-v="${R.id}">Offer</button>`}</td>
      <td><input type="number" min="0" step="1" style="width:64px" value="${Math.round((r.nil[u] || 0) / 1000)}" data-ch="rnil" data-v="${R.id}" title="asks about ${K(r.ask)}"> <small class="muted">ask ${K(r.ask)}</small></td>
      <td><button class="secondary small" data-act="rdel" data-v="${R.id}">✕</button></td></tr>`;
  }).join('')}</table></div>`;
}
function renderRecruit() {
  const t = me(); if (t.league !== 'ncaa') return '<div class="card">Recruiting is for college coaches. WNBA teams build through the draft, free agency and trades.</div>';
  const u = t.id, cal = calendar(G.season), board = (G.user.board ||= {});
  const tab = ui.tab.rc || 'board';
  const live = id => G.players[id]?.rec;
  const used = Object.entries(board).filter(([id]) => live(id) && !G.players[id].rec.commit).reduce((s, [, h]) => s + (+h || 0), 0), H = RC.userHours(G);
  const commits = (G.recruits || []).map(id => G.players[id]).filter(R => R?.rec?.commit === u && !R.rec.portal);
  const portalN = (G.recruits || []).filter(id => G.players[id]?.rec?.portal).length;
  const head = `<div class="card"><h2>Recruiting <small class="muted">class joining for ${seasonLabel(G.season + 1)}</small></h2>
    <div class="kv"><span>Recruiting hours / week</span><span>${used} / ${H} <small class="muted">(head coach + recruiting coordinator)</small></span>
      <span>Open roster spots next season</span><span>${RC.openSpots(G, t)} <small class="muted">(limit ${W.MAX_ROSTER.ncaa})</small></span>
      <span>NIL budget</span><span>${K(t.nilB)} · committed ${K(RC.nilCommitted(G, t))} · available <b>${K(RC.nilAvailable(G, t))}</b></span>
      <span>Calendar</span><span>${G.day <= cal.recruitEnd ? `Commitments until ${fmtDay(cal.recruitEnd)} (weekly updates on Mondays)` : 'Signing period over: a new class arrives with the new season'}${portalN ? ` · transfer portal open until ${fmtDay(cal.portalClose)}` : ''}</span></div>
    ${commits.length ? `<p>Committed: ${commits.map(R => `${stars(R.rec.stars)} ${pl(R.id)} <span class="muted">${R.pos}</span>`).join(', ')}</p>` : ''}
    <div class="tabs">${[['board', `Board (${Object.keys(board).filter(live).length})`], ['pros', 'Prospects'], ...(portalN ? [['portal', `Transfer portal (${portalN})`]] : []), ['nil', 'NIL + retention']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-k="rc" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="hint">Recruits commit to the team they are most interested in once it clearly leads and has offered. Interest grows each week with your hours x how much the recruit likes you: prestige vs her level, your recruiting rating, NIL offered vs her ask, playing time at her position, and some personal fit.</p></div>`;
  if (tab === 'nil') {
    const ps = t.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a));
    const risk = p => { const r = RC.portalRisk(G, p, t); return r < 0.08 ? '<span class="pos">low</span>' : r < 0.18 ? 'medium' : '<span class="neg">high</span>'; };
    return head + `<div class="card"><h2>NIL deals</h2><table class="tbl dense"><tr><th class="l">Name</th><th>Cls</th><th>OVR</th><th>MIN</th><th>Deal $K/yr</th><th>Market value</th><th>Transfer risk</th></tr>
      ${ps.map(p => `<tr><td class="l">${pl(p.id)}</td><td>${clsS(p)}</td><td>${rt(ovr(p))}</td><td>${RC.seasonMpg(G, p) ? f1(RC.seasonMpg(G, p)) : '-'}</td><td><input type="number" min="0" style="width:70px" value="${Math.round((p.nil || 0) / 1000)}" data-ch="pnil" data-v="${p.id}"></td><td class="muted">${K(RC.marketValue(p))}</td><td>${p.cls === 'GR' ? '<span class="muted">final year</span>' : risk(p)}</td></tr>`).join('')}</table>
      <p class="hint">Players paid well under their market value, players who barely play, and good players on weak teams are likelier to enter the transfer portal when it opens (${fmtDay(cal.portal)}). A coaching change adds risk too.</p></div>`;
  }
  let list;
  if (tab === 'board') list = Object.keys(board).filter(live).map(id => G.players[id]).sort((a, b) => a.rec.rank - b.rec.rank);
  else {
    const portal = tab === 'portal', pos = ui.tab.rpos || '', st = +(ui.tab.rst || 0), q = (ui.tab.rq || '').toLowerCase(), hide = ui.tab.rhide !== '0';
    list = (G.recruits || []).map(id => G.players[id]).filter(R => R?.rec && !!R.rec.portal === portal && (!pos || R.pos === pos) && (!st || R.rec.stars === st) && (!q || R.name.toLowerCase().includes(q)) && (!hide || !R.rec.commit)).sort((a, b) => a.rec.rank - b.rec.rank).slice(0, 150);
    return head + `<div class="card"><div class="row"><select data-ch="tabsel" data-k="rpos"><option value="">All positions</option>${['PG', 'SG', 'SF', 'PF', 'C'].map(x => `<option ${pos === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select data-ch="tabsel" data-k="rst"><option value="0">All stars</option>${[5, 4, 3, 2].map(x => `<option value="${x}" ${st === x ? 'selected' : ''}>${x} stars</option>`).join('')}</select>
      <select data-ch="tabsel" data-k="rhide"><option value="1" ${hide ? 'selected' : ''}>Uncommitted only</option><option value="0" ${!hide ? 'selected' : ''}>Include committed</option></select>
      <input type="search" placeholder="Search name" value="${esc(ui.tab.rq || '')}" data-ch="tabsel" data-k="rq"></div>${recruitRows(list, portal ? 'portal' : 'pros')}<p class="hint">Showing up to 150.</p></div>`;
  }
  return head + `<div class="card">${list.length ? recruitRows(list, 'board') : '<p class="muted">Your board is empty. Add recruits from Prospects (or the transfer portal), give them weekly hours, and offer.</p>'}</div>`;
}

// ---------------------------------------------------------------- WNBA draft
function renderDraft() {
  const D = G.draft, L = G.lottery, u = W.userTeam(G), cal = calendar(G.season);
  const prow = (p, btn) => `<tr><td class="l">${pl(p.id)}</td><td>${p.pos}</td><td>${fmtHt(p.ht)}</td><td>${p.age ?? ''}</td><td>${p.from && G.teams[p.from] ? tn(p.from, 14) : esc(p.college || (p.team && G.teams[p.team] ? G.teams[p.team].short : ''))}</td><td>${rt(ovr(p))}</td><td>${rt(p.pot)}</td><td class="muted">${p.hist?.length ? stLine(p.hist[p.hist.length - 1].st) : stLine(p.st)}</td><td>${btn || ''}</td></tr>`;
  const phdr = '<tr><th class="l">Name</th><th>Pos</th><th>Ht</th><th>Age</th><th>College</th><th>OVR</th><th>POT</th><th>Last season</th><th></th></tr>';
  if (D) {
    const k = D.picks.length, onClock = OF.userOnClock(G);
    const picks = D.picks.map(([tid, pid], i) => `<tr class="${tid === u ? 'me' : ''}"><td>${i + 1}</td><td>${tn(tid, 16)}</td><td>${pid ? pl(pid) : '-'}</td><td>${pid ? G.players[pid].pos : ''}</td><td class="muted">${pid ? esc(G.players[pid].college || '') : ''}</td><td>${pid && G.players[pid].r ? rt(ovr(G.players[pid])) : ''}</td></tr>`).reverse().join('');
    const pool = D.done ? [] : D.pool.map(id => G.players[id]).filter(Boolean).sort((a, b) => OF.draftValue(b) - OF.draftValue(a)).slice(0, 60);
    return `<div class="card"><h2>${D.season} WNBA draft</h2><p>${D.done ? 'The draft is complete.' : onClock ? `<b>You are on the clock</b> with pick No. ${k + 1}.` : `Pick No. ${k + 1}: ${tn(D.order[k], 16)}`}</p>
      ${onClock ? '<button data-act="dauto">Auto-pick for me</button>' : ''}<p class="hint">College players' ratings drop by about ${OF.PRO_ADJ} when they turn pro (the pro game is a level up); the board shows their college ratings.</p></div>
      <div class="grid2">${pool.length ? `<div class="card"><h2>Best available</h2><div style="overflow-x:auto"><table class="tbl dense">${phdr}${pool.map(p => prow(p, onClock ? `<button class="small" data-act="dpick" data-v="${p.id}">Draft</button>` : '')).join('')}</table></div></div>` : ''}
      <div class="card"><h2>Picks</h2><table class="tbl dense"><tr><th>#</th><th>Team</th><th>Player</th><th>Pos</th><th>College</th><th>OVR</th></tr>${picks || '<tr><td class="muted">No picks yet</td></tr>'}</table></div></div>`;
  }
  const lot = L && L.draft >= G.season ? `<div class="card"><h2>${L.draft} draft order <small class="muted">(lottery held)</small></h2><table class="tbl dense"><tr><th>Pick</th><th>Team</th><th>Lottery odds</th></tr>${L.r1.map((tid, i) => { const o = L.odds.find(x => x[0] === tid); return `<tr class="${tid === u ? 'me' : ''}"><td>${i + 1}</td><td>${tn(tid, 16)}</td><td class="muted">${o ? (o[1] / 10).toFixed(1) + '%' : 'playoff team'}</td></tr>`; }).join('')}</table>
    <p class="hint">WNBA rules: every non-playoff team is in the lottery, with odds from its combined record over the last two seasons. Picks 1 and 2 are drawn; the rest follow worst record first. Rounds 2 and 3 go by inverse record.</p></div>` : '';
  const pool = (G.draftPool?.length ? G.draftPool.map(id => G.players[id]) : Object.values(G.players).filter(p => p.league === 'ncaa' && p.team && p.r && (p.cls === 'GR' || p.cls === 'SR'))).filter(Boolean).sort((a, b) => OF.draftValue(b) - OF.draftValue(a)).slice(0, 40);
  const last = G.lastDraft ? `<div class="card"><h2>${G.lastDraft.season} draft: first round</h2><table class="tbl dense">${G.lastDraft.picks.slice(0, 15).map(([tid, pid], i) => `<tr><td>${i + 1}</td><td>${tn(tid, 16)}</td><td>${pid ? pl(pid) : '-'}</td></tr>`).join('')}</table></div>` : '';
  return `<div class="card"><h2>WNBA draft</h2><p>The ${cal.Y} draft is ${fmtDay(cal.draft, true)}: three rounds of 15 picks.</p></div><div class="grid2">${lot}
    <div class="card"><h2>${G.draftPool?.length ? 'Declared prospects' : 'Projected prospects'}</h2><div style="overflow-x:auto"><table class="tbl dense">${phdr}${pool.map(p => prow(p)).join('')}</table></div>${G.draftPool?.length ? '' : '<p class="hint">Seniors and 5th years now; who declares is decided when the college season ends.</p>'}</div>${last}</div>`;
}

// ---------------------------------------------------------------- WNBA free agency + trades
function renderFA() {
  const t = me(); if (t.league !== 'wnba') return '<div class="card">Free agency is for WNBA coaches.</div>';
  const cal = calendar(G.season), pay = OF.payroll(G, t), room = OF.capRoom(G, t);
  const exp = t.roster.map(id => G.players[id]).filter(p => p?.expiring);
  const fa = G.fa.map(id => G.players[id]).filter(p => p && p.r).sort((a, b) => ovr(b) - ovr(a)).slice(0, 80);
  const row = (p, btn) => `<tr><td class="l">${pl(p.id)}</td><td>${p.pos}</td><td>${p.age}</td><td>${rt(ovr(p))}</td><td>${rt(p.pot)}</td><td class="muted">${esc(p.college || '')}</td><td>${money(OF.askSalary(p))} x ${OF.askYears(p)}</td><td>${btn}</td></tr>`;
  return `<div class="card"><h2>Free agency</h2><div class="kv"><span>Payroll</span><span>${money(pay)} / cap ${money(W.SAL.cap)} · room <b class="${room < 0 ? 'neg' : ''}">${money(room)}</b></span><span>Roster</span><span>${t.roster.length} (12 in season, up to ${OF.MAX_OFF_ROSTER} in the offseason)</span>
    <span>Calendar</span><span>Re-signing window ${fmtDay(cal.faStart)} · market opens ${fmtDay(cal.faOpen)} · cuts to 12 on ${fmtDay(cal.wnbaCuts)}</span></div>
    <p class="hint">Simplified CBA: hard cap, minimum ${money(W.SAL.min)}, maximum ${money(W.SAL.max)}, 1-4 year deals. Minimum contracts are always allowed. Unsigned players lower their asks every week.</p>${ui.faMsg ? `<p class="neg">${esc(ui.faMsg)}</p>` : ''}</div>
    ${exp.length ? `<div class="card"><h2>Your expiring contracts</h2><table class="tbl dense"><tr><th class="l">Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th><th></th><th>Asks</th><th></th></tr>${exp.map(p => row(p, `<button class="small" data-act="resign" data-v="${p.id}">Re-sign</button>`)).join('')}</table><p class="hint">Not re-signed by ${fmtDay(cal.faOpen)}: they become free agents.</p></div>` : ''}
    <div class="card"><h2>Free agents <small class="muted">${G.fa.length}</small></h2><div style="overflow-x:auto"><table class="tbl dense"><tr><th class="l">Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th><th>College</th><th>Asks</th><th></th></tr>${fa.map(p => row(p, `<button class="small" data-act="fasign" data-v="${p.id}">Sign</button>`)).join('') || '<tr><td class="muted">Nobody available</td></tr>'}</table></div></div>`;
}
function renderTrade() {
  const t = me(); if (t.league !== 'wnba') return '<div class="card">Trades are for WNBA coaches.</div>';
  const others = Object.values(G.teams).filter(x => x.league === 'wnba' && x.id !== t.id).sort((a, b) => a.name.localeCompare(b.name));
  const P = G.teams[ui.tab.trp] && ui.tab.trp !== t.id ? G.teams[ui.tab.trp] : others[0];
  const tr = (ui.trade ||= { give: [], get: [], p: P.id });
  if (tr.p !== P.id) { tr.get = []; tr.p = P.id; }
  const side = (team, key) => `<table class="tbl dense"><tr><th></th><th class="l">Name</th><th>Pos</th><th>Age</th><th>OVR</th><th>Contract</th><th>Value</th></tr>${team.roster.map(id => G.players[id]).filter(Boolean).sort((a, b) => ovr(b) - ovr(a)).map(p => `<tr><td><input type="checkbox" data-ch="trchk" data-k="${key}" data-v="${p.id}" ${tr[key].includes(p.id) ? 'checked' : ''}></td><td class="l">${pl(p.id)}</td><td>${p.pos}</td><td>${p.age}</td><td>${rt(ovr(p))}</td><td class="muted">${p.contract ? money(p.contract.sal) + ' thru ' + p.contract.thru : '-'}</td><td class="muted">${f1(OF.tradeValue(G, p))}</td></tr>`).join('')}</table>`;
  const v = ids => ids.reduce((s, id) => s + (G.players[id] ? OF.tradeValue(G, G.players[id]) : 0), 0), sal = ids => ids.reduce((s, id) => s + (G.players[id]?.contract?.sal || 0), 0);
  return `<div class="card"><h2>Trades</h2><div class="row"><span>Trade partner</span><select data-ch="tabsel" data-k="trp">${others.map(x => `<option value="${x.id}" ${x.id === P.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <span class="muted">You give ${f1(v(tr.give))} value / ${money(sal(tr.give))} · you get ${f1(v(tr.get))} / ${money(sal(tr.get))}</span><span class="grow"></span><button data-act="tprop" ${OF.tradeOpen(G) ? '' : 'disabled'}>Propose trade</button></div>
      ${ui.tradeMsg ? `<p class="${ui.tradeMsg.ok ? 'pos' : 'neg'}">${esc(ui.tradeMsg.msg)}</p>` : ''}<p class="hint">AI teams accept when they get clearly more value back (about 8% more). Value = quality, age and contract. Both teams must stay under the cap (or not add salary while over it). Deadline ${fmtDay(calendar(G.season).deadline)}; trades reopen after the Finals.</p></div>
    <div class="grid2"><div class="card"><h2>You give (${esc(t.name)})</h2>${side(t, 'give')}</div><div class="card"><h2>You get (${esc(P.name)})</h2>${side(P, 'get')}</div></div>`;
}

// ---------------------------------------------------------------- job offers
function renderJobs() {
  const offers = G.user.offers || [], c = myCoach(), t = me();
  return `<div class="card"><h2>Job offers</h2><p>${esc(c.name)} · reputation ${rt(c.rep)}${t ? ` · currently ${esc(t.name)} (contract through ${c.contract ? seasonLabel(c.contract.thru) : '-'})` : ''}</p>
    ${offers.length ? offers.map(o => { const x = G.teams[o.tid]; return `<div class="offer">${logo(x, 44)}<div style="flex:1"><b>${esc(x.name)}</b><div class="muted">${x.league.toUpperCase()} · ${esc(x.conf)} · prestige ${Math.round(x.prestige)}/20 · last season ${x.hist?.length ? `${x.hist[x.hist.length - 1].w}-${x.hist[x.hist.length - 1].l}` : '-'}</div><div class="muted">${o.yrs}-year contract · ${money(o.sal)}/yr · offer expires ${fmtDay(o.until)}</div></div><button data-act="jaccept" data-v="${o.tid}">Accept</button></div>`; }).join('') : '<p class="muted">No offers right now. Openings come after each league\'s season (college in April, WNBA in October); teams make offers when your reputation is high enough.</p>'}
    ${offers.length && !G.user.fired ? '<div class="row" style="margin-top:10px"><button class="secondary" data-act="jdecline">Stay where I am</button></div>' : ''}</div>`;
}

// ---------------------------------------------------------------- game menu
function renderMenu() {
  return `<div class="card"><h2>Game menu</h2><div class="row"><button data-act="savenow">Save now</button><button class="secondary" data-act="quit">Main menu (saved)</button></div>
    <p class="hint">The game saves automatically after every day and every game.</p>
    <label class="row"><input type="checkbox" data-ch="auto" ${G.user.auto ? 'checked' : ''}> Let my staff handle the offseason (recruiting, NIL, draft picks, free agency)</label></div>`;
}

// ---------------------------------------------------------------- events
const ACTS = {
  go: v => go(v),
  team: v => { ui.tab.team = 'roster'; go('team', v); },
  player: v => go('player', v), coach: v => go('coach', v), box: v => go('box', v),
  tab: (v, el) => { ui.tab[el.dataset.k] = v; render(); },
  rsort: v => { ui.tab.rsort = v; render(); },
  continue: () => doContinue(),
  watch: () => startLive(ui.pending), simgame: () => simUserGame(),
  lpause: () => { ui.live.paused = !ui.live.paused; tickLive(); },
  lsim: () => { ui.live.game.run(); ui.live.ev = ui.live.game.ev.slice(); render(); },
  lfinish: () => finishLive(),
  ltab: v => { ui.live.tab = v; render(); },
  lto: () => { ui.live.game.callTimeout(ui.live.side); render(); },
  lsel: v => {
    const L = ui.live, S2 = L.game.s[L.side];
    if (!L.sel) { L.sel = v; render(); return; }
    if (L.sel === v) { L.sel = null; render(); return; }
    const onA = S2.on.some(p => p.id === L.sel), onB = S2.on.some(p => p.id === v);
    if (onA !== onB) { const out = onA ? L.sel : v, inn = onA ? v : L.sel; L.game.sub(L.side, out, inn); L.ev.push(L.game.ev[L.game.ev.length - 1]); }
    L.sel = null; render();
  },
  autoplan: () => { me().plan = null; save(); render(); },
  fire: v => { W.fireAssistant(G, me(), v); save(); render(); },
  hire: v => { const a = G.coaches[v]; if (a && W.hireAssistant(G, me(), a)) { G.news.push({ day: G.day + 1, text: `${a.name} joins the staff as ${W.ASST_ROLES[a.asst].toLowerCase()}.`, me: 1 }); } save(); render(); },
  savenow: () => { save(); ui.msg = 'Saved.'; render(); },
  release: v => { const p = G.players[v]; if (!p || !confirm(`Release ${p.name}?${me().league === 'wnba' ? ' She becomes a free agent.' : ' She leaves the program.'}`)) return; OF.release(G, v); me().plan = null; save(); render(); },
  radd: v => { if (G.players[v]?.rec) { (G.user.board ||= {})[v] = 0; save(); render(); } },
  rdel: v => { delete G.user.board[v]; save(); render(); },
  roff: v => { const R = G.players[v], u = W.userTeam(G); if (R?.rec && !R.rec.off.includes(u)) { R.rec.off.push(u); if (G.user.board[v] == null) G.user.board[v] = 0; } save(); render(); },
  dpick: v => { if (OF.userOnClock(G)) { OF.draftPick(G, W.userTeam(G), v); OF.runDraft(G); save(); render(); } },
  dauto: () => { if (!OF.userOnClock(G)) return; const best = G.draft.pool.map(id => G.players[id]).sort((a, b) => OF.draftValue(b) - OF.draftValue(a))[0]; if (best) ACTS.dpick(best.id); },
  resign: v => { ui.faMsg = OF.userResign(G, v) || ''; save(); render(); },
  fasign: v => { const p = G.players[v]; ui.faMsg = OF.userSign(G, v, OF.askSalary(p), OF.askYears(p)) || ''; save(); render(); },
  tprop: () => { const tr = ui.trade; if (!tr) return; ui.tradeMsg = OF.proposeTrade(G, tr.p, tr.give, tr.get); if (ui.tradeMsg.ok) { tr.give = []; tr.get = []; } save(); render(); },
  jaccept: v => { if (OF.acceptJob(G, v)) { ui.msg = `<b>Welcome to ${esc(G.teams[v].name)}.</b> Your staff window is open: keep or replace the assistants on the Staff screen.`; ui.trade = null; save(); go('staff'); } },
  jdecline: () => { OF.declineOffers(G); save(); go('home'); },
  quit: () => { save(); G = null; ui.screen = 'home'; render(); },
  // start screen
  'st-mode': v => { ui.start.mode = v; ui.start.team = null; render(); },
  'st-league': v => { ui.start.league = v; render(); },
  'st-team': v => { ui.start.team = v; render(); },
  'st-go': () => {
    const st = ui.start; if (!st.team) return;
    G = W.newGame({ seed: st.seed, coachName: st.name || 'Coach', mode: st.mode, team: st.team });
    G.user.staffWindow = true; S.updatePoll(G);
    ui.screen = 'home'; ui.pending = null; save(); render();
  },
  load: async v => { G = await loadSlot(v); ui.screen = 'home'; ui.pending = null; render(); },
  del: v => { if (confirm('Delete this saved game?')) { deleteSlot(v); render(); } },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = ACTS[el.dataset.act]; if (f) { e.preventDefault(); f(el.dataset.v, el); }
});
document.addEventListener('change', e => {
  const el = e.target, k = el.dataset.ch; if (!k) return;
  if (k === 'st-name') { ui.start.name = el.value; return; }
  if (k === 'tac') { const t = me(); t.tactics[el.dataset.k] = el.dataset.k === 'press' ? el.value === '1' : el.value; save(); render(); return; }
  if (k === 'starter' || k === 'mins') {
    const t = me(), plan = W.teamPlan(G, t);
    if (k === 'starter') { const id = el.dataset.v; if (el.checked) { plan.starters.push(id); if (plan.starters.length > 5) plan.starters.shift(); } else plan.starters = plan.starters.filter(x => x !== id); }
    else plan.min[el.dataset.v] = Math.max(0, Math.min(40, +el.value || 0));
    t.plan = { starters: plan.starters, min: plan.min }; save(); render(); return;
  }
  if (k === 'tabsel') { ui.tab[el.dataset.k] = el.value; render(); return; }
  if (k === 'auto') { G.user.auto = el.checked; save(); return; }
  if (k === 'rhours') {
    const b = G.user.board, used = Object.entries(b).filter(([id]) => id !== el.dataset.v && G.players[id]?.rec && !G.players[id].rec.commit).reduce((s, [, h]) => s + (+h || 0), 0);
    b[el.dataset.v] = Math.max(0, Math.min(+el.value, RC.userHours(G) - used)); save(); render(); return;
  }
  if (k === 'rnil' || k === 'pnil') {
    const t = me(), id = el.dataset.v, p = G.players[id], u = t.id;
    const cur = k === 'rnil' ? (p.rec.nil[u] || 0) : (p.nil || 0), want = Math.max(0, Math.round(+el.value || 0) * 1000);
    const v = Math.min(want, cur + Math.max(0, RC.nilAvailable(G, t)));
    if (k === 'rnil') p.rec.nil[u] = v; else p.nil = v;
    if (v < want) ui.msg = `Only ${K(v)} fits in your NIL budget.`;
    save(); render(); return;
  }
  if (k === 'trchk') { const tr = ui.trade, arr = tr[el.dataset.k]; if (el.checked) arr.push(el.dataset.v); else tr[el.dataset.k] = arr.filter(x => x !== el.dataset.v); ui.tradeMsg = null; render(); return; }
  if (k === 'ltac') { const v = el.dataset.k === 'press' ? el.value === '1' : el.value; ui.live.game.setTactics(ui.live.side, { [el.dataset.k]: v }); render(); return; }
  if (k === 'lspeed') { ui.live.speed = el.value; tickLive(); return; }
  if (k === 'lmanual') { ui.live.game.setManual(ui.live.side, el.checked); G.user.manualSubs = el.checked; render(); return; }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.ch === 'st-q') { ui.start.q = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-ch="st-q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  if (el.dataset.ch === 'tabsel' && el.dataset.k === 'tq') { ui.tab.tq = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-k="tq"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});
render();
window.__dbg = { get G() { return G; }, ui, ACTS, render, handleStop };
