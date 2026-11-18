// Generated players and coaches (recruits, walk-ons, fill-ins, harness teams). Ratings are 1-20.
import { FIRST, LAST } from './names.js';

export const RATINGS = ['fin', 'post', 'mid', 'three', 'ft', 'hdl', 'pas', 'vis', 'perD', 'postD', 'stl', 'blk', 'oreb', 'dreb', 'spd', 'str', 'vert', 'sta', 'iq', 'cons', 'clu'];
export const RATING_NAMES = {
  fin: 'Finishing', post: 'Post moves', mid: 'Mid-range', three: 'Three-point', ft: 'Free throw', hdl: 'Ball handling', pas: 'Passing', vis: 'Court vision',
  perD: 'Perimeter D', postD: 'Post D', stl: 'Steals', blk: 'Blocks', oreb: 'Off. rebounding', dreb: 'Def. rebounding',
  spd: 'Speed', str: 'Strength', vert: 'Vertical', sta: 'Stamina', iq: 'Basketball IQ', cons: 'Consistency', clu: 'Clutch',
};
export const RATING_GROUPS = [
  ['Scoring', ['fin', 'post', 'mid', 'three', 'ft']], ['Playmaking', ['hdl', 'pas', 'vis']], ['Defense', ['perD', 'postD', 'stl', 'blk']],
  ['Rebounding', ['oreb', 'dreb']], ['Physical', ['spd', 'str', 'vert', 'sta']], ['Mental', ['iq', 'cons', 'clu']],
];
// Position archetypes: offsets from the player's level.
export const ARCH = {
  PG: { fin: 0, post: -4, mid: 1, three: 1, ft: 1, hdl: 3.5, pas: 3.5, vis: 3, perD: 1, postD: -3, stl: 1.5, blk: -4, oreb: -3.5, dreb: -2, spd: 2.5, str: -2, vert: 0, sta: 1, iq: 1, cons: 0, clu: 0 },
  SG: { fin: 0.5, post: -3, mid: 2, three: 2.5, ft: 1.5, hdl: 1.5, pas: 0.5, vis: 0, perD: 1, postD: -2, stl: 1, blk: -3, oreb: -2.5, dreb: -1.5, spd: 1.5, str: -1, vert: 0.5, sta: 1, iq: 0, cons: 0, clu: 0 },
  SF: { fin: 1, post: -0.5, mid: 0.5, three: 0.5, ft: 0, hdl: 0, pas: 0, vis: 0, perD: 1, postD: 0, stl: 0.5, blk: -0.5, oreb: 0, dreb: 0.5, spd: 0.5, str: 0.5, vert: 1, sta: 0.5, iq: 0, cons: 0, clu: 0 },
  PF: { fin: 1.5, post: 2, mid: 0, three: -1.5, ft: -0.5, hdl: -2, pas: -1, vis: -1, perD: -0.5, postD: 2, stl: -0.5, blk: 1.5, oreb: 2.5, dreb: 2.5, spd: -1, str: 2, vert: 0.5, sta: 0, iq: 0, cons: 0, clu: 0 },
  C: { fin: 2, post: 3, mid: -1.5, three: -4.5, ft: -1.5, hdl: -4, pas: -1.5, vis: -1.5, perD: -2.5, postD: 3.5, stl: -1.5, blk: 3.5, oreb: 3.5, dreb: 3.5, spd: -2.5, str: 3, vert: 0, sta: -1, iq: 0, cons: 0, clu: 0 },
};
export const HEIGHT = { PG: 67.5, SG: 69.5, SF: 71.5, PF: 73.5, C: 75.5 };
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const CLASSES = ['FR', 'SO', 'JR', 'SR', 'GR'];

const clampR = x => Math.max(1, Math.min(20, Math.round(x)));
export const fmtHt = ht => `${Math.floor(ht / 12)}-${Math.round(ht % 12)}`;

export function randomName(rng) {
  const w = arr => arr[Math.min(arr.length - 1, Math.floor(Math.pow(rng(), 1.8) * arr.length))];
  return `${w(FIRST)} ${w(LAST)}`;
}

// level = the player's average rating (college starters ~9-12, WNBA ~13-15). spread = how spiky the profile is.
export function genRatings(rng, pos, level, spread = 1.6) {
  const a = ARCH[pos], r = {};
  for (const k of RATINGS) r[k] = clampR(level + a[k] + rng.gauss() * spread);
  r.cons = clampR(level - 1 + rng.gauss() * 2.5); r.clu = clampR(10 + (level - 10) * 0.4 + rng.gauss() * 3); r.sta = clampR(level + rng.gauss() * 2.5);
  return r;
}

let nextId = 1;
export const setNextId = n => { nextId = n; };
export function genPlayer(rng, { pos, level = 9, league = 'ncaa', cls = null, age = null, pot = null } = {}) {
  pos = pos || rng.pick(POSITIONS);
  const ht = Math.round((HEIGHT[pos] + (league === 'wnba' ? 1 : 0) + rng.gauss() * 1.4) * 1) ;
  return {
    id: 'g' + (nextId++), name: randomName(rng), pos, ht, r: genRatings(rng, pos, level),
    cls: cls || (league === 'ncaa' ? rng.pick(CLASSES.slice(0, 4)) : null), age: age || (league === 'ncaa' ? 18 + rng.int(0, 4) : 22 + rng.int(0, 10)),
    pot: pot ?? clampR(level + 2 + rng.gauss() * 2.5),
  };
}

// A generated team of 13 (college) / 12 (WNBA) around a level.
export function genRoster(rng, level, league = 'ncaa') {
  const n = league === 'ncaa' ? 13 : 12, out = [];
  const plan = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C', 'SG', 'SF', 'PF'];
  for (let i = 0; i < n; i++) out.push(genPlayer(rng, { pos: plan[i], level: level + (i < 5 ? 1.5 : i < 8 ? 0 : -2) + rng.gauss() * 1.2, league }));
  return out;
}
