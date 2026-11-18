// Possession-by-possession basketball sim. One Game object = one game; `step()` plays one possession (with any free
// throws and rebounds), so the live viewer can pause between possessions and let the coach sub, call a timeout or change
// tactics. `run()` plays to the final buzzer. Every random draw comes from the game's seeded rng, so a game replays exactly.
import { makeRng } from './rng.js';
import { RULES, OFFENSES, DEFENSES, PACES, defaultTactics } from './rules.js';

const POS = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };
const ZONES = ['rim', 'post', 'mid', 'three'];
const logit = p => Math.log(p / (1 - p));
const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const BOX = () => ({ sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, gs: 0 });
export const fmtClock = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return s < 60 ? r.toFixed(1) : `${m}:${String(Math.floor(r)).padStart(2, '0')}`; };
export const periodName = (q, n = 4) => q <= n ? `Q${q}` : (q === n + 1 ? 'OT' : `${q - n}OT`);

// Composite skills used by the engine (all 1-20 scale).
const offSkill = r => 0.27 * r.fin + 0.13 * r.post + 0.18 * r.mid + 0.24 * r.three + 0.1 * r.hdl + 0.08 * r.iq;
const zoneSkill = (p, z) => {
  const r = p.r, h = (p.ht - 72) * 0.35;
  if (z === 'rim') return 0.55 * r.fin + 0.15 * r.spd + 0.15 * r.vert + 0.15 * r.str + h * 0.5;
  if (z === 'post') return 0.6 * r.post + 0.25 * r.str + 0.15 * r.fin + h;
  if (z === 'mid') return 0.85 * r.mid + 0.15 * r.hdl;
  return r.three;
};
const zoneDef = (p, z) => {
  const r = p.r, h = (p.ht - 72) * 0.35;
  if (z === 'rim') return 0.35 * r.postD + 0.35 * r.blk + 0.15 * r.vert + 0.15 * r.str + h * 0.5;
  if (z === 'post') return 0.55 * r.postD + 0.25 * r.str + 0.2 * r.blk + h;
  return 0.75 * r.perD + 0.15 * r.spd + 0.1 * r.iq;
};

export class Game {
  // home/away: { id, name, abbr, players:[{id,name,pos,ht,r:{...}}], tactics, plan:{starters:[ids], min:{id:minutes}}, coach:{off,def,gm} }
  // opts: { league:'ncaa'|'wnba', seed, neutral, userSide: 0|1|null (that side's subs stay manual if plan.manual) }
  constructor(home, away, opts = {}) {
    this.L = RULES[opts.league || 'ncaa']; this.C = this.L.cal;
    this.seed = opts.seed >>> 0; this.rng = makeRng(this.seed);
    this.neutral = !!opts.neutral;
    this.s = [home, away].map((t, i) => this.makeSide(t, i));
    this.q = 1; this.clock = this.L.qLen; this.poss = this.rng() < 0.5 ? 0 : 1; this.jumpWinner = this.poss;
    this.ev = []; this.done = false; this.trans = 0; this.shotClockLeft = null; this.dead = true; this.mediaDone = {};
    this.log('period', null, `Start of ${periodName(1)}`);
  }

  makeSide(t, i) {
    const players = t.players.map(p => ({ ...p, e: 1, form: this.rng.gauss() * (1 - p.r.cons / 24) * 0.12 }));
    const by = Object.fromEntries(players.map(p => [p.id, p]));
    const plan = t.plan || {};
    let starters = (plan.starters || []).filter(id => by[id]);
    if (starters.length < 5) starters = players.slice().sort((a, b) => ovr(b) - ovr(a)).map(p => p.id).filter(id => !starters.includes(id)).slice(0, 5 - starters.length).concat(starters);
    const box = Object.fromEntries(players.map(p => [p.id, BOX()]));
    starters.forEach(id => { box[id].gs = 1; });
    return {
      i, id: t.id, name: t.name, abbr: t.abbr || t.name, players, by, box, tactics: { ...defaultTactics(), ...(t.tactics || {}) },
      min: plan.min || autoMinutes(players, starters), manual: !!plan.manual, coach: t.coach || { off: 10, def: 10, gm: 10 },
      on: this.order(starters.map(id => by[id])), score: 0, tf: 0, to: this.L.timeouts, run: 0, wantTO: false, qpts: [0],
      tm: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, poss: 0, last2f: 0 },
    };
  }
  order(list) { return list.slice().sort((a, b) => (POS[a.pos] || 3) - (POS[b.pos] || 3) || a.ht - b.ht); }

  log(type, side, text, extra = {}) {
    this.ev.push({ type, side, text, q: this.q, t: this.clock, sc: this.s ? [this.s[0].score, this.s[1].score] : [0, 0], ...extra });
  }

  // ---- public controls (live viewer) ----
  setTactics(side, t) { Object.assign(this.s[side].tactics, t); }
  callTimeout(side) { const S = this.s[side]; if (S.to > 0) S.wantTO = true; }
  setManual(side, on) { this.s[side].manual = on; }
  sub(side, outId, inId) {
    const S = this.s[side], pin = S.by[inId];
    if (!pin || S.on.includes(pin) || S.box[inId].pf >= this.L.foulOut) return false;
    const k = S.on.findIndex(p => p.id === outId); if (k < 0) return false;
    this.log('sub', side, `${pin.name} in for ${S.on[k].name}`);
    S.on[k] = pin; S.on = this.order(S.on); return true;
  }

  run() { while (!this.done) this.step(); return this.result(); }

  // ---- one possession ----
  step() {
    if (this.done) return [];
    const n0 = this.ev.length;
    if (this.clock < 0.3) { this.clock = 0; this.endPeriod(); return this.ev.slice(n0); }
    if (this.dead) this.deadBall();
    this.possession();
    return this.ev.slice(n0);
  }

  deadBall() {
    const n = this.L.quarters;
    // media timeout: first dead ball under 5:00 of each period (rest for everyone on the floor)
    const mk = this.q;
    if (this.clock <= 300 && !this.mediaDone[mk] && this.q <= n) { this.mediaDone[mk] = 1; this.rest(40); this.log('media', null, 'Media timeout'); }
    for (const S of this.s) {
      if (S.wantTO && S.to > 0) { S.wantTO = false; S.to--; this.rest(40); this.s[1 - S.i].run = 0; S.run = 0; this.log('timeout', S.i, `Timeout ${S.name} (${S.to} left)`); }
      else S.wantTO = false;
    }
    for (const S of this.s) if (!S.manual) this.autoSubs(S); else this.forcedSubs(S);
  }
  // Manual coaching still has to replace a player who fouled out.
  forcedSubs(S) {
    for (let k = 0; k < 5; k++) if (S.box[S.on[k].id].pf >= this.L.foulOut) {
      const b = S.players.filter(q => !S.on.includes(q) && S.box[q.id].pf < this.L.foulOut).sort((a, c) => ovr(c) * c.e - ovr(a) * a.e)[0];
      if (b) this.swap(S, k, b);
    }
  }

  rest(sec) { for (const S of this.s) for (const p of S.players) p.e = Math.min(1, p.e + sec * 0.0011 * (0.6 + p.r.sta / 25)); }

  elapsedFrac() { const n = this.L.quarters; const tot = n * this.L.qLen; const el = Math.min(tot, (Math.min(this.q, n) - 1) * this.L.qLen + (this.q <= n ? this.L.qLen - this.clock : this.L.qLen)); return el / tot; }

  // Auto rotation: keep players near their target minutes, rest tired ones, sit foul trouble, close with the best five.
  autoSubs(S) {
    const L = this.L, fr = this.elapsedFrac(), out = this.L.foulOut;
    const close = this.q >= L.quarters && this.clock <= 240 && Math.abs(S.score - this.s[1 - S.i].score) <= 10;
    const foulLimit = () => this.q >= L.quarters ? out : Math.min(out - 1, this.q + (L.foulOut === 6 ? 2 : 1) - (this.q === 2 && this.clock < 120 ? 0 : 0));
    const avail = p => S.box[p.id].pf < out && !p.inj;
    const val = p => ovr(p) * (0.55 + 0.45 * p.e);
    const need = p => (S.min[p.id] || 0) * 60 * fr - S.box[p.id].sec;   // seconds behind target
    if (close) {
      // closing lineup: best five, but only swap for a clear upgrade (no churn every dead ball)
      const best = S.players.filter(avail).filter(p => (S.min[p.id] || 0) >= 8).sort((a, b) => val(b) - val(a));
      const five = pickFive(best);
      if (five.length === 5) {
        for (let k = 0; k < 5; k++) {
          const p = S.on[k]; if (five.includes(p) && avail(p)) continue;
          const cand = five.filter(q => !S.on.includes(q)).sort((a, b) => val(b) - val(a))[0];
          if (cand && (!avail(p) || val(cand) > val(p) + 0.8)) this.swap(S, k, cand);
        }
        return;
      }
    }
    // Regular rotation: each dead ball pick the five with the best score (minutes behind the plan, freshness, a small
    // bonus for already being on the floor so lineups hold for stretches), then make only the swaps that differ.
    const score = p => {
      const tgt = S.min[p.id] || 0, on = S.on.includes(p);
      if (!avail(p)) return -1e9;
      if (S.box[p.id].pf >= foulLimit() && !on) return -50;
      if (S.box[p.id].pf >= foulLimit()) return -40;
      if (tgt <= 0) return -30 + p.e;
      return need(p) / 60 + (p.e - 0.86) * 14 + (on ? 1.4 : 0) + ovr(p) * 0.12;
    };
    const sc = new Map(S.players.map(p => [p, score(p)]));
    const ranked = S.players.filter(avail).sort((a, b) => sc.get(b) - sc.get(a));
    const five = pickFive(ranked);
    if (five.length < 5) return;
    const ins = five.filter(p => !S.on.includes(p));
    for (const q of ins) {
      const k = S.on.findIndex(p => !five.includes(p)); if (k < 0) break;
      this.swap(S, k, q);
    }
  }
  swap(S, k, b) { const p = S.on[k]; S.on[k] = b; this.log('sub', S.i, `${b.name} in for ${p.name}`); S.on = this.order(S.on); }
  setFive(S, five) { const ins = five.filter(p => !S.on.includes(p)); if (!ins.length) return; const outs = S.on.filter(p => !five.includes(p)); outs.forEach((p, j) => this.log('sub', S.i, `${ins[j].name} in for ${p.name}`)); S.on = this.order(five); }

  tick(t) {
    t = Math.max(0, Math.min(t, this.clock));
    this.clock -= t;
    for (const S of this.s) {
      const pace = PACES[S.tactics.pace].fat * (S.tactics.press ? 1.12 : 1);
      for (const p of S.players) {
        if (S.on.includes(p)) { S.box[p.id].sec += t; p.e = Math.max(0.3, p.e - t * 0.0007 * pace * (1.35 - p.r.sta / 22)); }
        else p.e = Math.min(1, p.e + t * 0.0016 * (0.6 + p.r.sta / 25));
      }
    }
    return t;
  }

  bonusFor(D) { // is the offence shooting free throws on the defence's next common foul?
    const L = this.L, n = L.quarters;
    if (this.q > n && L.otBonusAt) return D.tf >= L.otBonusAt;
    if (D.tf >= L.bonusAt) return true;
    return L.last2 && this.clock <= 120 && D.tm.last2f >= 2;
  }
  addTeamFoul(D, p) {
    D.tf++; D.box[p.id].pf++; D.tm.pf++;
    if (this.L.last2 && this.clock <= 120 && this.q <= this.L.quarters) D.tm.last2f++;
    if (D.box[p.id].pf >= this.L.foulOut) this.log('foulout', D.i, `${p.name} has fouled out`);
  }

  // ---- the possession ----
  possession() {
    const O = this.s[this.poss], D = this.s[1 - this.poss], L = this.L, C = this.C, rng = this.rng;
    const ot = OFFENSES[O.tactics.off], dt = DEFENSES[D.tactics.def], pc = PACES[O.tactics.pace];
    const n = L.quarters, late = this.q >= n;
    const diff = O.score - D.score;                // offence's lead
    const sc = this.shotClockLeft ?? L.shotClock; this.shotClockLeft = null;
    const trans = this.trans; this.trans = 0; this.dead = false;
    O.tm.poss++;

    // Trailing defence fouls on purpose late in the game.
    if (late && this.wantsLateFoul(D, O, diff)) {   // diff = offence lead = defence deficit
      const tt = this.tick(rng.range(1.5, 4.5));
      const target = O.on.slice().sort((a, b) => a.r.ft - b.r.ft)[rng() < 0.75 ? 0 : 1];
      const fouler = D.on.slice().sort((a, b) => D.box[a.id].pf - D.box[b.id].pf)[0];
      const bonus = this.bonusFor(D);
      this.addTeamFoul(D, fouler);
      this.log('foul', D.i, `${fouler.name} fouls ${target.name} on purpose`, { p: fouler.id });
      if (bonus) this.freeThrows(O, D, target, 2);
      else { O.tm.poss--; this.dead = true; this.poss = O.i; this.shotClockLeft = Math.max(1, sc - tt); } // side out
      return;
    }

    // Possession length.
    let t;
    if (trans) t = rng.range(3.5, 8);
    else {
      t = C.hcMean + pc.dt + ot.pace + (DEFENSES[D.tactics.def].zone ? 1.2 : 0) - (D.tactics.press ? 2.2 : 0) + rng.gauss() * C.hcSd;
      t = clamp(t, 4, sc + 1.5);
    }
    let rushed = 0, heave = false;
    if (late && this.clock <= 70) {
      if (diff > 0) t = Math.min(sc, this.clock) - rng.range(1, 3);        // milk the clock
      else if (diff < 0 && diff >= -3 && this.clock <= sc + 2) t = Math.max(2, this.clock - rng.range(2, 6)); // last shot
      else if (diff < -3) t = Math.min(t, rng.range(5, 10));               // hurry
    }
    if (t >= this.clock) { t = Math.max(0.3, this.clock - rng.range(0.2, 1.2)); if (this.clock < 3) heave = this.clock < 1.6; rushed = 0.25; }
    let shotClockViolation = false;
    if (!trans && t > sc - 1.5) {   // ran the clock down: usually a rushed late-clock shot, rarely a violation
      shotClockViolation = rng() < 0.08; t = sc - rng.range(0, 1.2); rushed = Math.max(rushed, 0.3);
    }

    // Turnover?
    const onO = O.on, onD = D.on;
    const hdlTeam = avg(onO, p => (p.r.hdl * 0.5 + p.r.iq * 0.3 + p.r.pas * 0.2) * (0.85 + 0.15 * p.e));
    const stlTeam = avg(onD, p => p.r.stl * 0.6 + p.r.perD * 0.2 + p.r.spd * 0.2);
    const press = D.tactics.press ? 1.22 + 0.02 * (stlTeam - 10) : 1;
    const pTO = C.tov * Math.exp(-0.06 * (hdlTeam - C.ratingRef) + 0.045 * (stlTeam - C.ratingRef)) * ot.tov * dt.tov * press * (trans ? 0.8 : 1) * (1 - (O.coach.off - 10) * 0.006);
    if (shotClockViolation || rng() < pTO) {
      this.tick(shotClockViolation ? t : t * rng.range(0.35, 0.9));
      const ball = rng.weighted(onO, p => usageW(p, O, ot) * Math.exp(-0.06 * (p.r.hdl - 10)));
      O.box[ball.id].tov++; O.tm.tov++; O.run = 0;
      if (shotClockViolation) { this.log('to', O.i, `Shot clock violation, ${O.name}`, { p: ball.id }); this.dead = true; }
      else if (rng() < C.stlShare * (D.tactics.press ? 1.15 : 1)) {
        const st = rng.weighted(onD, p => Math.pow(p.r.stl, 1.6));
        D.box[st.id].stl++; D.tm.stl++;
        this.log('to', O.i, `${st.name} steals it from ${ball.name}`, { p: ball.id, d: st.id });
        this.trans = rng() < C.transP.stl * PACES[D.tactics.pace].trans ** 0.5 ? 1 : 0;
      } else { this.log('to', O.i, `Turnover by ${ball.name}`, { p: ball.id }); this.dead = true; }
      this.poss = D.i; return;
    }

    // Non-shooting foul (reach-in, off the ball) during the possession.
    if (!heave && rng() < C.nsFoul * dt.foul * (D.tactics.press ? 1.25 : 1)) {
      const fouler = rng.weighted(onD, p => 1.6 - p.r.iq / 20);
      const fouled = rng.weighted(onO, p => usageW(p, O, ot));
      const used = this.tick(t * rng.range(0.2, 0.7));
      const bonus = this.bonusFor(D);
      this.addTeamFoul(D, fouler);
      this.log('foul', D.i, `Foul on ${fouler.name}`, { p: fouler.id });
      this.dead = true;
      if (bonus) this.freeThrows(O, D, fouled, 2);
      else { this.shotClockLeft = Math.max(L.orebClock, sc - used); O.tm.poss--; this.poss = O.i; }
      return;
    }

    this.tick(t);
    this.shoot(O, D, ot, dt, { trans, rushed, heave, diff });
  }

  wantsLateFoul(D, O, deficit) {
    const pref = D.tactics.late; if (pref === 'never' || deficit <= 0) return false;
    const rem = this.clock, L = this.L;
    if (rem < 1.5 || rem > 120) return false;
    const possLeft = rem / 9 + 1;
    if (deficit > 3 * possLeft + 1) return false;           // hopeless
    if (pref === 'foul') return deficit <= 12 && rem <= 90;
    const gm = (D.coach.gm || 10);
    if (deficit <= 3) return rem <= L.shotClock - 2 - (gm < 8 ? 6 : 0);
    return rem <= 40 + deficit * 8 + (gm - 10) * 1.5;
  }

  shoot(O, D, ot, dt, ctx) {
    const C = this.C, rng = this.rng;
    const onO = O.on, onD = D.on;
    const star = dt.star ? onO.reduce((a, b) => offSkill(b.r) > offSkill(a.r) ? b : a) : null;
    // Shooter.
    const shooter = rng.weighted(onO, p => usageW(p, O, ot) * (p === star ? dt.star : 1));
    // Shot zone.
    let zone;
    if (ctx.heave) zone = 'three';
    else {
      const base = shooter.r, avgZ = (zoneSkill(shooter, 'rim') + zoneSkill(shooter, 'post') + zoneSkill(shooter, 'mid') + base.three) / 4;
      const late = this.q >= this.L.quarters && ((ctx.diff === -3 && this.clock < 40) || (ctx.diff <= -4 && ctx.diff >= -9 && this.clock < 25));
      zone = rng.weighted(ZONES, z => {
        let w = C.mix[z] * ot.mix[z] * dt.mix[z] * Math.exp(0.2 * (zoneSkill(shooter, z) - avgZ));
        if (z === 'post') w *= clamp((shooter.ht - 68) / 8, 0.15, 1.6);
        if (z === 'three') w *= clamp(0.3 + base.three / 14, 0.25, 1.7);
        if (ctx.trans) w *= z === 'rim' ? 2.2 : z === 'three' ? 0.9 : 0.4;
        if (late && z === 'three') w *= 6;
        return w;
      });
    }
    // Defender: man = the matchup; zone = the zone's strength in that area.
    const k = onO.indexOf(shooter);
    let dv;
    const manDef = onD[k] || onD[0];
    const zoneDv = avg(onD, p => zoneDef(p, zone));
    const zw = dt.zone || 0;
    dv = zw * zoneDv + (1 - zw) * zoneDef(manDef, zone);
    if (dt.iq) dv += (avg(onD, p => p.r.iq) - 10) * 0.15;
    if (shooter === star) dv += 2.5;
    // Assisted?
    const astP = clamp(C.ast[zone] * ot.ast * (0.8 + avg(onO.filter(p => p !== shooter), p => p.r.pas * 0.6 + p.r.vis * 0.4) / 50), 0, 0.95);
    // Make probability (logit space).
    const sk = zoneSkill(shooter, zone) * (0.82 + 0.18 * shooter.e);
    let x = logit(C.make[zone]) + 0.055 * (sk - C.ratingRef) - 0.04 * (dv - C.ratingRef) + shooter.form;
    x += (O.coach.off - 10) * 0.006 - (D.coach.def - 10) * 0.006;
    if (!this.neutral) x += O.i === 0 ? 0.035 : -0.035;
    if (ctx.trans) x += zone === 'rim' ? 0.35 : 0.1;
    if (D.tactics.press && !ctx.trans) x += 0.07;              // beaten the press: numbers going the other way
    x -= ctx.rushed;
    if (O.run >= 8) x += 0.05;
    const clutch = this.q >= this.L.quarters && this.clock < 300 && Math.abs(ctx.diff) <= 5;
    if (clutch) x += 0.025 * (shooter.r.clu - 10);
    const willAst = rng() < astP;
    if (willAst) x += 0.12;
    let p = sig(x);
    if (ctx.heave) p = 0.06 + 0.002 * shooter.r.three;
    // Shooting foul?
    const fp = ctx.heave ? 0.01 : C.foul[zone] * (ot.foul || 1) * dt.foul * Math.exp(0.03 * (shooter.r.str + shooter.r.fin - 20) - 0.03 * (manDef.r.iq - 10));
    const fouled = rng() < fp;
    const made = rng() < (fouled ? p * 0.42 : p);
    const pts = zone === 'three' ? 3 : 2;
    const B = O.box[shooter.id];
    B.fga++; O.tm.fga++; if (pts === 3) { B.tpa++; O.tm.tpa++; }
    const where = { rim: 'layup', post: 'post shot', mid: 'jumper', three: 'three' }[zone];
    let fouler = null;
    if (fouled) { fouler = zone === 'rim' || zone === 'post' ? rng.weighted(onD, q => q === manDef ? 3 : 0.4 + q.r.blk / 20) : manDef; }
    if (made) {
      B.fgm++; O.tm.fgm++; if (pts === 3) { B.tpm++; O.tm.tpm++; }
      let assister = null;
      if (willAst && !ctx.heave) { assister = rng.weighted(onO.filter(q => q !== shooter), q => Math.pow(q.r.pas * 0.6 + q.r.vis * 0.4, 2) * (q.pos === 'PG' ? 1.6 : 1)); O.box[assister.id].ast++; O.tm.ast++; }
      this.score(O, D, shooter, pts);
      this.log('shot', O.i, `${shooter.name} ${pts === 3 ? 'hits a three' : 'scores on a ' + where}${assister ? ` (${assister.name} assist)` : ''}${fouled ? ', and one!' : ''}`, { p: shooter.id, a: assister && assister.id, zone, made: 1, pts });
      if (fouled) { this.addTeamFoul(D, fouler); this.freeThrows(O, D, shooter, 1, true); return; }
      this.dead = true; this.poss = D.i; this.trans = rng() < C.transP.make * PACES[D.tactics.pace].trans ? 1 : 0; return;
    }
    if (fouled) {
      this.addTeamFoul(D, fouler);
      this.log('shot', O.i, `${shooter.name} is fouled by ${fouler.name} on a ${where}`, { p: shooter.id, zone, made: 0, fouled: 1, fga: 0 });
      B.fga--; O.tm.fga--; if (pts === 3) { B.tpa--; O.tm.tpa--; }   // fouled misses are not field-goal attempts
      this.freeThrows(O, D, shooter, pts);
      return;
    }
    // Miss: blocked?
    let blocker = null;
    if ((zone === 'rim' || zone === 'post') && rng() < C.blk * 2 * Math.exp(0.07 * (avg(onD, q => q.r.blk) - C.ratingRef))) {
      blocker = rng.weighted(onD, q => Math.pow(q.r.blk, 2) * Math.max(0.3, (q.ht - 66) / 8));
      D.box[blocker.id].blk++; D.tm.blk++;
    } else if (zone === 'mid' && rng() < C.blk * 0.5) {
      blocker = rng.weighted(onD, q => Math.pow(q.r.blk, 2)); D.box[blocker.id].blk++; D.tm.blk++;
    }
    this.log('shot', O.i, blocker ? `${blocker.name} blocks ${shooter.name}'s ${where}` : `${shooter.name} misses a ${where}`, { p: shooter.id, zone, made: 0, b: blocker && blocker.id });
    if (this.clock <= 0) { this.poss = D.i; return; }
    this.rebound(O, D, zone, blocker);
  }

  rebound(O, D, zone, blocker) {
    const C = this.C, rng = this.rng, dt = DEFENSES[D.tactics.def];
    const rb = (p, k) => (p.r[k] * 0.55 + p.r.vert * 0.15 + p.r.str * 0.1 + (p.ht - 66) * 0.45) * (0.8 + 0.2 * p.e);
    const oR = avg(O.on, p => rb(p, 'oreb')), dR = avg(D.on, p => rb(p, 'dreb'));
    const pO = clamp((zone === 'ft' ? 0.13 - C.oreb : 0) + C.oreb + dt.oreb + 0.022 * (oR - dR) + (zone === 'three' ? 0.02 : 0) - (blocker ? -0.03 : 0), 0.08, 0.6);
    const tm = rng() < 0.04;   // team rebound (out of bounds etc.)
    if (rng() < pO) {
      if (!tm) { const r = rng.weighted(O.on, p => Math.pow(rb(p, 'oreb'), 1.8)); O.box[r.id].orb++; O.tm.orb++; this.log('reb', O.i, `Offensive rebound ${r.name}`, { p: r.id, off: 1 }); }
      else { this.dead = true; this.log('reb', O.i, `Offensive rebound ${O.name}`, { off: 1 }); }
      this.shotClockLeft = this.L.orebClock; this.poss = O.i;
      // put-backs come out of the next possession: short clock, rim-heavy
      if (!tm && rng() < 0.4) this.trans = 1;
    } else {
      if (!tm) { const r = rng.weighted(D.on, p => Math.pow(rb(p, 'dreb'), 1.8)); D.box[r.id].drb++; D.tm.drb++; this.log('reb', D.i, `Rebound ${r.name}`, { p: r.id }); }
      else { this.dead = true; }
      this.poss = D.i;
      this.trans = !tm && rng() < this.C.transP.dreb * PACES[D.tactics.pace].trans ? 1 : 0;
    }
  }

  freeThrows(O, D, shooter, n, andOne = false) {
    const C = this.C, rng = this.rng;
    let p = clamp(C.ftBase + C.ftPer * shooter.r.ft, 0.3, 0.96);
    if (this.q >= this.L.quarters && this.clock < 120) p = clamp(p + 0.004 * (shooter.r.clu - 10), 0.3, 0.97);
    let made = 0, lastMade = false;
    for (let i = 0; i < n; i++) {
      const m = lastMade = rng() < p; O.box[shooter.id].fta++; O.tm.fta++;
      if (m) { O.box[shooter.id].ftm++; O.tm.ftm++; made++; this.score(O, D, shooter, 1); }
    }
    this.log('ft', O.i, `${shooter.name} ${made}-of-${n} at the line`, { p: shooter.id, made, n });
    this.dead = true; this.poss = D.i;
    if (lastMade || this.clock <= 0) return;
    this.dead = false; this.rebound(O, D, 'ft', null);   // missed last free throw: live ball
  }

  score(O, D, p, pts) {
    O.score += pts; O.box[p.id].pts += pts; O.tm.pts += pts; O.qpts[this.q - 1] = (O.qpts[this.q - 1] || 0) + pts;
    O.run += pts; D.run = 0;
    for (const q of O.on) O.box[q.id].pm += pts;
    for (const q of D.on) D.box[q.id].pm -= pts;
    // AI timeout on an opponent run
    if (O.run >= 9 && D.to > 1 && !D.noAutoTO) D.wantTO = true;
  }

  endPeriod() {
    const n = this.L.quarters;
    const tied = this.s[0].score === this.s[1].score;
    this.log('period', null, `End of ${periodName(this.q)}: ${this.s[0].abbr} ${this.s[0].score}, ${this.s[1].abbr} ${this.s[1].score}`);
    if (this.q >= n && !tied) { this.done = true; this.log('final', null, `Final${this.q > n ? ' (' + periodName(this.q) + ')' : ''}: ${this.s[0].name} ${this.s[0].score}, ${this.s[1].name} ${this.s[1].score}`); return; }
    this.q++;
    this.clock = this.q > n ? this.L.otLen : this.L.qLen;
    for (const S of this.s) { S.qpts[this.q - 1] = 0; S.run = 0; S.tm.last2f = 0; if (this.q <= n || this.L.otBonusAt) S.tf = 0; }
    // possession arrow: alternating by quarter (NCAA) / jump ball winner rotation; OT = jump ball
    this.poss = this.q > n ? (this.rng() < 0.5 ? 0 : 1) : (this.jumpWinner + this.q - 1) % 2;   // alternating possession by quarter
    this.rest(this.q === 3 ? 400 : 120);
    this.dead = true; this.trans = 0; this.shotClockLeft = null;
    this.log('period', null, `Start of ${periodName(this.q)}`);
  }

  result() {
    const [h, a] = this.s;
    return {
      league: this.L.id, seed: this.seed, ot: Math.max(0, this.q - this.L.quarters),
      score: [h.score, a.score], qpts: [h.qpts, a.qpts], ids: [h.id, a.id],
      box: [h.box, a.box], tm: [h.tm, a.tm], winner: h.score > a.score ? 0 : 1,
    };
  }
}

// ---- helpers shared with the game layer ----
export function ovr(p) {
  const r = p.r;
  const o = offSkill(r), d = 0.35 * r.perD + 0.25 * r.postD + 0.15 * r.stl + 0.15 * r.blk + 0.1 * r.iq;
  const reb = (r.oreb + r.dreb) / 2, play = (r.pas + r.vis + r.hdl) / 3, ath = (r.spd + r.str + r.vert) / 3;
  const g = posGroup(p.pos);
  const w = g === 'G' ? [0.42, 0.24, 0.06, 0.18, 0.1] : g === 'F' ? [0.4, 0.26, 0.12, 0.1, 0.12] : [0.36, 0.28, 0.2, 0.04, 0.12];
  return w[0] * o + w[1] * d + w[2] * reb + w[3] * play + w[4] * ath;
}
export const posGroup = pos => (pos === 'PG' || pos === 'SG') ? 'G' : (pos === 'SF' || pos === 'PF') ? 'F' : 'C';
const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
function usageW(p, S, ot) {
  let w = Math.exp(0.13 * (offSkill(p.r) - 10) * (ot.usage || 0.8) + 0.1 * (p.r.hdl - 10) * ((ot.hdl || 1) - 1) * 4);
  if (ot.big && (p.pos === 'C' || p.pos === 'PF')) w *= ot.big;
  return w * (0.75 + 0.25 * p.e);
}
// Best five that still has at least one guard and no more than two centers.
function pickFive(sorted) {
  const five = [];
  for (const p of sorted) {
    if (five.length === 5) break;
    const g = posGroup(p.pos), cs = five.filter(q => posGroup(q.pos) === 'C').length, gs = five.filter(q => posGroup(q.pos) === 'G').length;
    if (g === 'C' && cs >= 2) continue;
    if (five.length === 4 && gs === 0 && g !== 'G') continue;
    five.push(p);
  }
  return five;
}
// Default minutes: starters ~30-34, then a tapering bench, total 200.
export function autoMinutes(players, starters) {
  const sorted = players.slice().sort((a, b) => ovr(b) - ovr(a));
  const order = starters.map(id => players.find(p => p.id === id)).filter(Boolean).concat(sorted.filter(p => !starters.includes(p.id)));
  const plan = [33, 31, 30, 29, 27, 18, 13, 10, 6, 3];
  const min = {};
  order.forEach((p, i) => { min[p.id] = plan[i] || 0; });
  return min;
}
