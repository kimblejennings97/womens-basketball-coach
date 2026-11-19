// Live game court animation (docs/animation.md). Pure presentation: it reads the events one engine step returns (one
// possession: shot / turnover / fouls + free throws / rebound, plus subs, timeouts, period ends) and plays them on a
// broadcast-angle court. Nothing here touches the simulation or its rng.
//
// World: feet. x = along the court 0..94 (home attacks +x in the first half), y = across 0..50 (0 = far sideline),
// z = up. A perspective camera sits behind the near sideline. A script = per-player keyframes + ball keyframes + labels
// over a normalised time 0..1; `frame()` samples it each animation frame.

const L = 94, W = 50, RIM_Z = 10;
const SKIN = '#a3a9b0', INK = '#0a0e12';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const hash = s => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const lum = hex => { const n = parseInt((hex || '#888888').slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const shade = (hex, k) => '#' + [1, 3, 5].map(i => clamp(Math.round(parseInt(hex.slice(i, i + 2), 16) * k), 0, 255).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

// Offensive spots: [depth from the baseline, across], in position order PG, SG, SF, PF, C.
const SETS = {
  base: [[24, 25], [18, 41], [4, 46.5], [16, 10], [6, 19]],
  fiveout: [[25, 25], [20, 41], [4, 47], [20, 9], [4, 3]],
  post: [[23, 28], [19, 43], [10, 46.5], [13, 15], [5.5, 20]],
  princeton: [[24, 25], [17, 42], [17, 8], [13, 31], [13, 19]],
};
const ZONES = {
  z23: [[20, 18], [20, 32], [7, 9], [5, 25], [7, 41]],
  z32: [[24, 25], [18, 10], [18, 40], [7, 17], [7, 33]],
  z131: [[27, 25], [17, 8], [15, 25], [17, 42], [5, 25]],
};

export class Court {
  constructor() {
    this.cv = document.createElement('canvas');
    this.cv.className = 'courtcv';
    this.ctx = this.cv.getContext('2d');
    this.pos = {};            // player id -> {x, y}
    this.script = null; this.t0 = 0; this.dur = 1;
    this.ball = { x: 47, y: 25, z: 3 };
    this.label = null; this.confetti = null;
    this.raf = null; this.logoImg = null;
    this.mult = 1; this.ballHold = null;
    this.size();
  }
  // ---- setup
  setGame({ home, away, lg, neutral, hasLogo, champ }) {
    this.lg = lg; this.neutral = neutral; this.home = home; this.away = away; this.champ = champ;
    const hc = home.color || '#2a6bd1', ac = away.color || '#c0392b';
    this.kit = [
      { shirt: '#f2f4f7', num: lum(hc) > 200 ? '#222' : hc, trim: hc },                                   // home: white
      { shirt: lum(ac) > 205 ? shade(away.color2 && lum(away.color2) < 200 ? away.color2 : '#555555', 1) : ac, num: '#ffffff', trim: '#ffffff' },
    ];
    this.paint = neutral ? '#22426b' : mixHex(shade(hc, 0.9), '#b98a4e', lum(hc) > 200 ? 0.7 : 0.18);
    this.apron = neutral ? '#18324f' : shade(lum(hc) > 200 ? (home.color2 || '#333333') : hc, 0.55);
    this.logoImg = null;
    if (!neutral && hasLogo && home.logo) { const im = new Image(); im.onload = () => { this.logoImg = im; }; im.src = home.logo; }
    this.pos = {}; this.script = null; this.label = null; this.confetti = null;
  }
  size() {
    const w = Math.max(320, Math.round(this.cv.parentElement?.clientWidth || 900)), h = Math.round(w * 0.4);
    const dpr = window.devicePixelRatio || 1;
    if (this.cv.width !== Math.round(w * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; }
    this.W = w; this.H = h; this.dpr = dpr;
    // camera behind the near sideline, fitted to the canvas
    this.cam = { x: 47, y: W + 30, z: 52 };
    const f = [0, 21 - this.cam.y, -this.cam.z], n = Math.hypot(...f); this.fw = f.map(v => v / n);
    this.up = [0, this.fw[2], -this.fw[1]];
    this.F = 1; this.ox = 0; this.oy = 0;
    const pts = [[-3, -3, 0], [L + 3, -3, 0], [-3, W + 3, 0], [L + 3, W + 3, 0], [4, 25, 13.5]].map(p => this.raw(...p));
    const minx = Math.min(...pts.map(p => p[0])), maxx = Math.max(...pts.map(p => p[0])), miny = Math.min(...pts.map(p => p[1])), maxy = Math.max(...pts.map(p => p[1]));
    const s = Math.min(w * 0.98 / (maxx - minx), h * 0.96 / (maxy - miny));
    this.F = s; this.ox = w / 2 - (minx + maxx) / 2 * s; this.oy = h / 2 - (miny + maxy) / 2 * s;
  }
  raw(x, y, z) {
    const v = [x - this.cam.x, y - this.cam.y, z - this.cam.z], d = v[0] * this.fw[0] + v[1] * this.fw[1] + v[2] * this.fw[2];
    return [v[0] / d, -(v[1] * this.up[1] + v[2] * this.up[2]) / d, d];
  }
  P(x, y, z = 0) { const r = this.raw(x, y, z); return [this.ox + r[0] * this.F, this.oy + r[1] * this.F, r[2]]; }

  // ---- scripts
  basketX(side, q) { const right = (side === 0) === (q <= 2); return right ? L - 5.25 : 5.25; }
  spot(dep, across, bx) { across = clamp(across, 2.5, W - 2.5); return bx > 47 ? { x: L - dep, y: across } : { x: dep, y: across }; }
  // Build the script for one engine step. st = { on: [[ids home], [ids away]], tactics: [t0, t1], q, nums }
  play(evs, st, durMs) {
    this.size();
    const now = performance.now();
    if (this.script) this.finish();
    const S = { tracks: {}, ball: [], labels: [], dur: durMs, fx: [] };
    this.mult = 1;
    const all = [...st.on[0], ...st.on[1]];
    if (st.home) this.homeIds = new Set(st.home);
    if (st.nums) this.nums = st.nums;
    for (const id of all) if (!this.pos[id]) this.pos[id] = this.benchSpot(id, st);
    this.onIds = all;
    for (const id of all) S.tracks[id] = [{ t: 0, x: this.pos[id].x, y: this.pos[id].y }];
    const key = (id, t, p, e) => { (S.tracks[id] ||= [{ t: 0, x: this.pos[id].x, y: this.pos[id].y }]).push({ t, x: p.x, y: p.y, e }); };
    const ballK = (t, x, y, z, mode = 'air', hold = null) => S.ball.push({ t, x, y, z, mode, hold });
    const lab = (t0, t1, text, side) => S.labels.push({ t0, t1, text, side });
    const act = evs.find(e => e.type === 'shot' || e.type === 'to') || evs.find(e => e.type === 'ft') || evs.find(e => e.type === 'foul');
    const per = evs.find(e => e.type === 'period'), fin = evs.find(e => e.type === 'final');
    const misc = evs.find(e => e.type === 'timeout' || e.type === 'media');
    if (!act) {
      // dead-ball step: period start / end, timeouts, subs
      if (per && per.text.startsWith('Start')) this.tipoff(S, st, key, ballK, per.q);
      else if (per || fin) { for (const id of all) key(id, 0.7, this.benchWalk(id, st)); lab(0.05, 0.98, fin ? 'FINAL' : per.text.replace(/:.*/, '').toUpperCase(), null); const ws = fin ? (fin.sc[0] > fin.sc[1] ? 0 : 1) : null; if (fin && this.champ && this.champ(ws)) { this.confetti = { t0: now, side: ws }; lab(0.05, 0.98, 'CHAMPIONS!', ws); } }
      else if (misc) lab(0.05, 0.9, misc.type === 'media' ? 'MEDIA TIMEOUT' : 'TIMEOUT', misc.side);
      else if (evs.some(e => e.type === 'sub')) lab(0.1, 0.8, 'SUBSTITUTION', evs.find(e => e.type === 'sub').side);
      this.start(S, now); return;
    }
    const O = act.type === 'foul' ? 1 - act.side : act.side, D = 1 - O, q = act.q;
    const bx = this.basketX(O, q), dir = bx > 47 ? 1 : -1, by = 25;
    const off = st.on[O], def = st.on[D], tac = st.tactics[O] || {}, dtac = st.tactics[D] || {};
    const h = hash(act.text + act.q + act.t);
    const set = SETS[tac.off === 'fiveout' ? 'fiveout' : tac.off === 'post' ? 'post' : tac.off === 'princeton' ? 'princeton' : 'base'];
    // Between possessions (docs/animation.md): when the offence starts at the other end it has to get there. Transition
    // possessions (engine fb flag) run a fast break; others walk the ball up (inbound after a make / dead ball, outlet
    // after a rebound) before setting up. The step's time is stretched (this.mult) so the trip doesn't look like a jump.
    const far = off.reduce((s2, id) => s2 + Math.abs((this.pos[id] || { x: 47 }).x - bx), 0) / 5 > 36;
    const fb = far && act.fb && act.type !== 'foul';
    const walk = far && !fb;
    const hold0 = off.includes(this.ballHold) ? this.ballHold : null;
    let spots;
    if (fb) {
      // lanes: the ball in the middle, wings wide and ahead, trailers behind
      const ballMan = hold0 || off[0], sh = act.p && off.includes(act.p) ? act.p : null;
      const lanes = [[7, 7], [7, 43], [24, 16], [30, 34]];
      let li = 0;
      spots = off.map(id => { if (id === ballMan) return this.spot(18, 25 + ((h & 7) - 3.5), bx); const [d, a] = lanes[(sh === id ? 0 : ++li) % 4]; return this.spot(d, a, bx); });
    } else spots = off.map((id, i) => { const [d, a] = set[i % 5]; return this.spot(d, a + (((h >> (i * 3)) & 3) - 1.5) * 1.2, bx); });
    const guard = (p, i) => {
      if (fb) { const cur = this.pos[def[i]] || { x: 47, y: 25 }; return i === 0 ? this.spot(5, 25, bx) : { x: cur.x + (bx - cur.x) * 0.62, y: cur.y + (25 - cur.y) * 0.3 }; }
      const z = ZONES[dtac.def];
      if (z) { const [d, a] = z[i % 5]; return this.spot(d, a, bx); }
      return { x: p.x + (bx - p.x) * 0.22, y: p.y + (by - p.y) * 0.22 };
    };
    // phase plan (fractions of the step): [walk-up] -> set up -> ball movement -> action -> result (-> free throws)
    const fts = evs.filter(e => e.type === 'ft'), reb = evs.find(e => e.type === 'reb');
    const s0 = walk ? 0.36 : 0;
    if (walk) this.mult = 1.35; else if (fb) this.mult = 1.15;
    S.dur = durMs * this.mult;
    const tEnd = s0 + (1 - s0) * (fts.length ? 0.55 : 1);
    const ph = f => s0 + (tEnd - s0) * f;
    const A = fb ? 0.34 * tEnd : ph(walk ? 0.16 : 0.3), B = fb ? 0.46 * tEnd : ph(0.62), C = fb ? 0.6 * tEnd : ph(0.78);
    const ballOf = id => { const k = off.indexOf(id); return k >= 0 ? spots[k] : this.pos[id] || { x: 47, y: 25 }; };
    let holder = off[0];
    if (walk) holder = this.walkUp(S, off, def, spots, guard, bx, dir, s0, hold0, key, ballK, h);
    else if (fb) {
      holder = hold0 || off[0];
      ballK(0, this.ball.x, this.ball.y, this.ball.z, hold0 ? 'dribble' : 'air', hold0);
      lab(0.02, Math.max(0.1, C - 0.04), 'FAST BREAK', O);
    }
    // set up (a fast break: everyone sprints to the lanes / back on defence)
    off.forEach((id, i) => key(id, A, spots[i], fb ? 'lin' : walk ? 'out' : undefined));
    def.forEach((id, i) => key(id, A, guard(spots[i], i), fb ? 'lin' : walk ? 'out' : undefined));
    if (!walk && !fb) ballK(0, this.ball.x, this.ball.y, this.ball.z, 'dribble', null);
    ballK(A * 0.95, ballOf(holder).x - dir * 1, ballOf(holder).y, 3, 'dribble', holder);
    // ball movement: a pass or two, then to the assister and the shooter
    const shooter = act.p && off.includes(act.p) ? act.p : off[h % 5];
    const chain = [];
    const extra = fb ? 0 : (h >> 7) % 3;
    for (let k = 0; k < extra; k++) { const c = off[(h >> (9 + k * 3)) % 5]; if (c !== holder && c !== chain[chain.length - 1]) chain.push(c); }
    if (act.a && off.includes(act.a) && act.a !== shooter) chain.push(act.a);
    if (shooter !== holder) chain.push(shooter);
    const stealer = act.type === 'to' && act.d ? act.d : null;
    const nP = Math.max(1, chain.length);
    chain.forEach((c, k) => {
      const t = A + (B - A) * (k + 1) / (nP + 0.3);
      if (stealer && k === chain.length - 1) return;
      const p = ballOf(c); ballK(t - 0.03 * tEnd, p.x, p.y, 3.5, 'air', null); ballK(t, p.x, p.y, 3.2, 'dribble', c); holder = c;
    });
    // offense drifts a little while the ball moves
    if (!fb) {
      off.forEach((id, i) => { if (id !== shooter) key(id, B, { x: spots[i].x + (((h >> i) & 1) ? 1.2 : -1.2), y: spots[i].y + (((h >> (i + 5)) & 1) ? 1.5 : -1.5) }); });
      def.forEach((id, i) => key(id, B, guard({ x: spots[i].x, y: spots[i].y }, i)));
    }

    if (act.type === 'to') {
      if (stealer) {
        const target = chain[chain.length - 1] || off[(h >> 4) % 5], tp = ballOf(target);
        const sp = { x: (ballOf(holder).x + tp.x) / 2, y: (ballOf(holder).y + tp.y) / 2 };
        key(stealer, C, sp); ballK(C, sp.x, sp.y, 3.5, 'air', null); ballK(C + 0.01, sp.x, sp.y, 3, 'dribble', stealer);
        const go = { x: 47 - dir * 18, y: 25 + ((h & 7) - 3.5) * 2 };
        key(stealer, 1, go); ballK(1, go.x, go.y, 3, 'dribble', stealer);
        off.forEach(id => { if (id !== stealer) key(id, 1, { x: this.pos[id].x - dir * 8, y: this.pos[id].y }); });
        lab(C, 1, 'STEAL', D);
      } else {
        const out = { x: ballOf(holder).x - dir * 3, y: ((h >> 3) & 1) ? -1.5 : W + 1.5 };
        ballK(C, out.x, out.y, 2, 'air', null); ballK(1, out.x, out.y, 0.4, 'roll', null);
        lab(C, 1, act.text.startsWith('Shot clock') ? 'SHOT CLOCK' : 'TURNOVER', O);
      }
      this.start(S, now); return;
    }
    if (act.type === 'foul' && !fts.length) {           // side out
      lab(B, 1, 'FOUL', act.side); key(act.p || def[0], C, { x: ballOf(holder).x + dir * 1.5, y: ballOf(holder).y });
      this.start(S, now); return;
    }
    if (act.type === 'shot') {
      const z = act.zone || 'mid';
      let sp;
      if (z === 'rim') sp = { x: bx - dir * (2 + (h % 3)), y: by + ((h >> 2) % 7 - 3) };
      else if (z === 'post') sp = { x: bx - dir * 5, y: ((h >> 3) & 1) ? 19.5 : 30.5 };
      else if (z === 'mid') { const a = ((h >> 4) % 140 - 70) * Math.PI / 180, r = 13 + (h % 4); sp = { x: bx - dir * Math.cos(a) * r, y: by + Math.sin(a) * r }; }
      else { const a = ((h >> 4) % 170 - 85) * Math.PI / 180, r = 23.2; sp = { x: bx - dir * Math.max(1.5, Math.cos(a) * r), y: clamp(by + Math.sin(a) * r, 2.6, 47.4) }; }
      key(shooter, C, sp);
      ballK(C - 0.005, sp.x, sp.y, 3.5, 'dribble', shooter);
      const di = def[off.indexOf(shooter)] ?? def[0], cl = { x: sp.x + (bx - sp.x) * 0.12, y: sp.y + (by - sp.y) * 0.12 };
      key(di, C + 0.04 * tEnd, cl);
      if (act.b && def.includes(act.b)) key(act.b, C + 0.05 * tEnd, { x: sp.x + (bx - sp.x) * 0.1, y: sp.y + (by - sp.y) * 0.1 + 1 });
      S.shoot = { id: shooter, t: C };
      const rim = { x: bx - dir * 0.4, y: by };
      const tFly = C + (tEnd - C) * 0.55;
      if (act.b) {
        const bp = { x: sp.x + (bx - sp.x) * 0.15, y: sp.y + (by - sp.y) * 0.15 };
        ballK(C + 0.02 * tEnd, bp.x, bp.y, 9, 'air', null); lab(C, tEnd, 'BLOCKED', D);
        this.rebound(S, reb, ballK, key, bp, tFly, tEnd, dir, h);
      } else if (act.made || act.fouled) {
        const arc = z === 'three' ? 16 : z === 'rim' ? 12 : 14.5;
        ballK((C + tFly) / 2, (sp.x + rim.x) / 2, (sp.y + rim.y) / 2, arc, 'air', null);
        if (act.made) {
          ballK(tFly, rim.x, rim.y, RIM_Z + 0.3, 'air', null); ballK(tFly + (tEnd - tFly) * 0.35, rim.x, rim.y, 2, 'air', null); ballK(tEnd, rim.x - dir * 1.5, rim.y + 1, 0.4, 'roll', null);
          S.fx.push({ t: tFly, kind: 'swish', x: bx, y: by });
          lab(tFly, tEnd, act.pts === 3 ? 'THREE!' : act.text.includes('and one') ? 'AND ONE!' : z === 'rim' && (h & 3) === 0 ? 'LAYUP' : 'SCORES', O);
        } else { ballK(tFly, rim.x, rim.y + 1.5, RIM_Z - 1, 'air', null); lab(tFly, tEnd, 'FOUL', D); }
      } else {
        const arc = z === 'three' ? 16 : 14;
        ballK((C + tFly) / 2, (sp.x + rim.x) / 2, (sp.y + rim.y) / 2, arc, 'air', null);
        ballK(tFly, rim.x + dir * 0.6, rim.y + ((h & 1) ? 0.8 : -0.8), RIM_Z + 0.4, 'air', null);
        S.fx.push({ t: tFly, kind: 'rim', x: bx, y: by });
        this.rebound(S, reb, ballK, key, rim, tFly, tEnd, dir, h);
      }
      // everyone crashes / gets back a little
      off.forEach((id, i) => { if (id !== shooter) key(id, tEnd, { x: spots[i].x + dir * (i >= 3 ? 4 : -3), y: spots[i].y + (by - spots[i].y) * 0.25 }); });
      def.forEach((id, i) => { if (id !== act.b && id !== di) key(id, tEnd, { x: bx - dir * (6 + i * 1.5), y: 25 + (i - 2) * 5 }); });
    }
    if (act.type === 'foul' && fts.length) lab(B, C, 'FOUL', act.side);
    if (fts.length) this.freeThrows(S, fts, evs, st, O, bx, dir, key, ballK, lab, tEnd, reb);
    this.start(S, now);
  }
  // Bring the ball up from the other end over [0, s0]: inbound (after a make / dead ball) or outlet (after a rebound),
  // then the point guard dribbles over half court while the rest jog up and the defence gets back. Returns the handler.
  walkUp(S, off, def, spots, guard, bx, dir, s0, hold0, key, ballK, h) {
    const pg = off[0], endX = bx > 47 ? -1.2 : L + 1.2;           // the baseline behind the basket the offence defends
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const cur = id => this.pos[id] || { x: 47, y: 25 };
    const side = ((h >> 2) & 1) ? 1 : -1;
    let tGet;
    if (hold0 && hold0 !== pg) {                                    // rebound: outlet pass to the point guard
      const r = cur(hold0), outlet = { x: r.x + dir * 14, y: clamp(25 + side * 15, 6, 44) };
      ballK(0, r.x, r.y, 3, 'dribble', hold0); ballK(0.07, r.x + dir * 0.6, r.y, 3, 'dribble', hold0);
      key(pg, 0.12, outlet, 'lin'); ballK(0.14, outlet.x, outlet.y, 3.4, 'dribble', pg);
      tGet = 0.14;
    } else if (hold0 === pg) { const r = cur(pg); ballK(0, r.x, r.y, 3, 'dribble', pg); tGet = 0; }
    else {                                                          // inbound: baseline after a make, sideline after a dead ball
      const ib = off[4] !== pg ? off[4] : off[1], b = this.ball;
      const sideline = b.y < 3 || b.y > W - 3;
      const spot = sideline ? { x: clamp(b.x, 6, L - 6), y: b.y < 25 ? -1.2 : W + 1.2 } : { x: endX, y: 25 + side * 4 };
      const recv = sideline ? { x: spot.x + dir * 4, y: spot.y < 0 ? 9 : W - 9 } : { x: endX + dir * 11, y: 25 - side * 9 };
      key(ib, 0.1, spot, 'lin'); key(ib, 0.15, spot);
      ballK(0, b.x, b.y, b.z, 'roll', null); ballK(0.1, spot.x, spot.y, 3.5, 'held', ib); ballK(0.15, spot.x, spot.y, 3.5, 'held', ib);
      key(pg, 0.15, recv); ballK(0.2, recv.x, recv.y, 3.4, 'dribble', pg);
      tGet = 0.2;
    }
    // the point guard pushes it over half court; the rest run up their lanes; the defence gets back
    const mid = { x: 47 + dir * 7, y: 25 + side * 5 };
    key(pg, s0, mid, 'lin'); ballK(Math.max(tGet + 0.01, s0), mid.x, mid.y, 3, 'dribble', pg);
    off.forEach((id, i) => { if (id === pg) return; const p = lerp(cur(id), spots[i], 0.62); key(id, s0, p, 'lin'); });
    def.forEach((id, i) => { const p = lerp(cur(id), guard(spots[i], i), 0.8); key(id, s0 * 0.9, p, 'lin'); });
    return pg;
  }
  rebound(S, reb, ballK, key, from, t0, t1, dir, h) {
    if (!reb) { ballK(t1, from.x - dir * 4, from.y + ((h & 2) ? 5 : -5), 0.5, 'roll', null); return; }
    const p = { x: from.x - dir * (3 + (h % 4)), y: from.y + (((h >> 5) % 9) - 4) };
    if (reb.p) { key(reb.p, t0 + (t1 - t0) * 0.6, p); ballK(t0 + (t1 - t0) * 0.6, p.x, p.y, 8, 'air', null); ballK(t1, p.x, p.y, 7.5, 'held', reb.p); }
    else ballK(t1, p.x, p.y, 0.5, 'roll', null);
  }
  freeThrows(S, fts, evs, st, O, bx, dir, key, ballK, lab, t0, reb) {
    const off = st.on[O], def = st.on[1 - O], ft = fts[fts.length - 1], shooter = ft.p && [...off, ...def].includes(ft.p) ? ft.p : off[0];
    const line = { x: bx - dir * 14.6, y: 25 };
    const lane = [[7, 17.5], [7, 32.5], [11, 17.5], [11, 32.5], [14, 17.5], [14, 32.5]];
    const tSet = t0 + (1 - t0) * 0.2;
    key(shooter, tSet, line);
    let k = 0;
    for (const id of def) { const [d, a] = lane[k++ % 6]; key(id, tSet, { x: bx - dir * d, y: a }); }
    for (const id of off) { if (id === shooter) continue; if (k < 6) { const [d, a] = lane[k++ % 6]; key(id, tSet, { x: bx - dir * d, y: a }); } else key(id, tSet, { x: bx - dir * 30, y: 25 + (k++ % 3 - 1) * 8 }); }
    const n = ft.n || fts.length, made = ft.made ?? 0, rim = { x: bx - dir * 0.4, y: 25 };
    ballK(tSet, line.x + dir * 0.5, line.y, 3.5, 'held', shooter);
    for (let i = 0; i < n; i++) {
      const a = tSet + (1 - tSet) * (i / n), b = tSet + (1 - tSet) * ((i + 0.6) / n), c = tSet + (1 - tSet) * ((i + 0.95) / n);
      const good = i < made;
      ballK(a + 0.01, line.x + dir * 0.5, line.y, 7, 'air', null);
      ballK((a + b) / 2, (line.x + rim.x) / 2, 25, 13, 'air', null);
      ballK(b, rim.x, rim.y + (good ? 0 : 0.9), RIM_Z + 0.3, 'air', null);
      S.fx.push({ t: b, kind: good ? 'swish' : 'rim', x: bx, y: 25 });
      if (i < n - 1) { ballK(c, line.x + dir * 0.5, line.y, 3.5, 'held', shooter); }
      else if (good || !reb) { ballK(c, rim.x - dir * 2, 25, 0.5, 'roll', null); }
      else { const p = { x: bx - dir * 5, y: 25 + (reb.off ? 6 : -6) }; if (reb.p) key(reb.p, c, p); ballK(c, p.x, p.y, 7.5, 'held', reb.p || null); }
    }
    lab(tSet, 1, `FREE THROWS ${made}/${n}`, O);
  }
  tipoff(S, st, key, ballK, q) {
    const [h, a] = st.on;
    const pos = [[47 - 2, 25], [43, 15], [43, 35], [36, 20], [36, 30]];
    const flip = q % 2 === 0 ? -1 : 1;
    h.forEach((id, i) => key(id, 0.6, { x: 47 - (47 - pos[i][0]) * flip, y: pos[i][1] }));
    a.forEach((id, i) => key(id, 0.6, { x: 47 + (47 - pos[i][0]) * flip, y: pos[i][1] }));
    ballK(0.6, 47, 25, 4, 'air', null); ballK(0.85, 47, 25, 13, 'air', null); ballK(1, 47, 25, 9, 'air', null);
    S.labels.push({ t0: 0.05, t1: 0.95, text: q === 1 ? 'TIP-OFF' : `START OF ${q <= 4 ? 'Q' + q : 'OT'}`, side: null });
  }
  benchSpot(id, st) { const home = st.on[0].includes(id); return { x: 47 + (home ? -6 : 6) - (hash(id) % 5) * (home ? 3 : -3), y: W + 3 }; }
  benchWalk(id, st) { const p = this.pos[id] || { x: 47, y: 25 }; return { x: p.x + (47 - p.x) * 0.3, y: p.y + (W - p.y) * 0.5 }; }
  start(S, now) {
    for (const ks of Object.values(S.tracks)) ks.sort((a, b) => a.t - b.t);
    S.ball.sort((a, b) => a.t - b.t);
    this.script = S; this.t0 = now; this.dur = S.dur; this.loop();
  }
  attach(box) {
    if (this.cv.parentElement !== box) box.appendChild(this.cv);
    this.size();
    if (this.script) this.loop(); else this.draw(1);
  }
  finish() { // jump to the end state of the running script
    const S = this.script; if (!S) return;
    for (const [id, ks] of Object.entries(S.tracks)) { const k = ks[ks.length - 1]; this.pos[id] = { x: k.x, y: k.y }; }
    const b = S.ball[S.ball.length - 1]; if (b) { this.ball = { x: b.x, y: b.y, z: b.z }; this.ballHold = b.hold || null; }
    this.script = null;
  }
  snap(evs, st) { this.play(evs, st, 1); this.finish(); this.draw(1); }
  loop() { if (this.raf) return; const f = () => { this.raf = null; const done = this.frame(); if (!done || this.confetti) this.raf = requestAnimationFrame(f); }; this.raf = requestAnimationFrame(f); }
  frame() {
    if (!this.cv.isConnected) return true;
    const S = this.script, t = S ? clamp((performance.now() - this.t0) / this.dur, 0, 1) : 1;
    this.draw(t);
    if (S && t >= 1) { this.finish(); return true; }
    return !S;
  }
  // sample keyframes
  at(ks, t) {
    if (!ks || !ks.length) return null;
    let i = 0; while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
    const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)];
    if (b === a || b.t <= a.t) return { ...a, u: 1, a, b };
    const r = clamp((t - a.t) / (b.t - a.t), 0, 1), u = b.e === 'lin' ? r : b.e === 'out' ? 1 - (1 - r) ** 2 : ease(r);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * u, u, a, b };
  }

  // ---- drawing
  draw(t) {
    const c = this.ctx, S = this.script;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    this.drawFloor(c);
    // players
    const now = performance.now();
    const shown = S ? Object.keys(S.tracks) : (this.onIds || []).filter(id => this.pos[id]);
    const people = shown.map(id => {
      const k = S && S.tracks[id] ? this.at(S.tracks[id], t) : this.pos[id];
      const moving = S && S.tracks[id] && k.a && k.b && (Math.abs(k.b.x - k.a.x) + Math.abs(k.b.y - k.a.y) > 0.5) && k.u < 1;
      return { id, x: k.x, y: k.y, moving };
    });
    this.lastPeople = people;
    // ball
    let ball = this.ball, held = null;
    if (S && S.ball.length) {
      const k = this.at(S.ball, t);
      const m = k.b && t >= k.a.t ? k.a.mode : 'air';
      ball = { x: k.x, y: k.y, z: k.z };
      held = (k.u >= 1 || k.a === k.b) ? k.a.hold : (k.a.mode === 'dribble' && k.b.hold === k.a.hold ? k.a.hold : null);
      if (held) { const p = people.find(q => q.id === held); if (p) { ball = { x: p.x + 0.9, y: p.y + 0.6, z: m === 'held' ? 4.2 : Math.abs(Math.sin(now / 140)) * 3 + 0.4 }; } }
      if (k.a.mode === 'roll' || k.b?.mode === 'roll') ball.z = Math.max(0.4, ball.z);
    }
    const shoot = S && S.shoot && t >= S.shoot.t - 0.04 && t <= S.shoot.t + 0.08 ? S.shoot.id : null;
    const items = people.map(p => ({ y: p.y, draw: () => this.drawPlayer(c, p, p.id === shoot, now) }));
    for (const bx of [5.25, L - 5.25]) items.push({ y: 25.01, draw: () => this.drawHoop(c, bx, S, t) });
    items.push({ y: ball.z > 6 ? 99 : ball.y + 0.02, draw: () => this.drawBall(c, ball) });
    items.sort((a, b) => a.y - b.y).forEach(it => it.draw());
    // labels
    const lb = S && S.labels.filter(l => t >= l.t0 && t <= l.t1).pop();
    if (lb) this.drawLabel(c, lb.text, lb.side);
    if (this.confetti) this.drawConfetti(c, now);
  }
  drawFloor(c) {
    const P = (x, y, z = 0) => this.P(x, y, z);
    const poly = (pts, fill) => { c.beginPath(); pts.forEach((p, i) => { const q = P(...p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fillStyle = fill; c.fill(); };
    poly([[-4, -4], [L + 4, -4], [L + 4, W + 4], [-4, W + 4]], this.apron);
    poly([[0, 0], [L, 0], [L, W], [0, W]], '#c8995a');
    // planks
    c.strokeStyle = 'rgba(90,55,20,0.12)'; c.lineWidth = 1;
    for (let y = 2.5; y < W; y += 2.5) { const a = P(0, y), b = P(L, y); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    // paint
    const lw = this.lg === 'wnba' ? 8 : 6;
    for (const side of [0, 1]) { const x0 = side ? L - 19 : 0, x1 = side ? L : 19; poly([[x0, 25 - lw], [x1, 25 - lw], [x1, 25 + lw], [x0, 25 + lw]], this.paint); }
    if (!this.logoImg) poly(this.circlePts(47, 25, 6), this.paint);
    // logo at centre court
    if (this.logoImg) {
      const a = P(41, 19), b = P(53, 19), d = P(41, 31);
      c.save(); c.globalAlpha = 0.85; c.globalCompositeOperation = 'multiply';   // white logo backgrounds vanish into the floor
      c.setTransform((b[0] - a[0]) / 1 * this.dpr / 100, (b[1] - a[1]) * this.dpr / 100, (d[0] - a[0]) * this.dpr / 100, (d[1] - a[1]) * this.dpr / 100, a[0] * this.dpr, a[1] * this.dpr);
      c.drawImage(this.logoImg, 0, 0, 100, 100); c.restore();
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    // lines
    c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = Math.max(1, this.W / 700);
    const line = pts => { c.beginPath(); pts.forEach((p, i) => { const q = P(...p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); };
    line([[0, 0], [L, 0], [L, W], [0, W], [0, 0]]); line([[47, 0], [47, W]]);
    line([...this.circlePts(47, 25, 6), this.circlePts(47, 25, 6)[0]]);
    for (const side of [0, 1]) {
      const s = side ? -1 : 1, bx = side ? L : 0, rx = bx + s * 5.25;
      line([[bx, 25 - lw], [bx + s * 19, 25 - lw], [bx + s * 19, 25 + lw], [bx, 25 + lw]]);
      line(this.arcPts(bx + s * 19, 25, 6, -90, 90, s));
      // three-point line: straight in the corners, arc of 22.15 ft
      const yc = 22, dx = Math.sqrt(22.15 ** 2 - yc ** 2);
      line([[bx, 25 - yc], [rx + s * dx, 25 - yc]]); line([[bx, 25 + yc], [rx + s * dx, 25 + yc]]);
      const ang = Math.asin(yc / 22.15) * 180 / Math.PI;
      line(this.arcPts(rx, 25, 22.15, -ang, ang, s));
      line(this.arcPts(rx, 25, 4, -90, 90, s));
    }
  }
  circlePts(cx, cy, r) { const out = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  arcPts(cx, cy, r, a0, a1, s) { const out = []; for (let i = 0; i <= 30; i++) { const a = (a0 + (a1 - a0) * i / 30) * Math.PI / 180; out.push([cx + s * Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  drawHoop(c, bx, S, t) {
    const s = bx > 47 ? -1 : 1, base = bx > 47 ? L + 2 : -2, bb = bx > 47 ? L - 4 : 4;
    const P = (x, y, z) => this.P(x, y, z);
    // stanchion + arm
    c.strokeStyle = '#2b2f35'; c.lineWidth = Math.max(2, this.W / 300);
    let a = P(base, 25, 0), b = P(base, 25, 11), d = P(bb, 25, 11);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.stroke();
    // backboard
    const q = [[bb, 22, 9.5], [bb, 28, 9.5], [bb, 28, 13], [bb, 22, 13]].map(p => P(...p));
    c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = 'rgba(235,240,245,0.55)'; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke();
    // rim + net
    const fx = S && S.fx.find(f => Math.abs(f.x - bx) < 1 && t >= f.t && t <= f.t + 0.12);
    const pts = []; for (let i = 0; i < 20; i++) { const an = i / 20 * Math.PI * 2; pts.push(P(bx + Math.cos(an) * 0.75, 25 + Math.sin(an) * 0.75, RIM_Z)); }
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1;
    const sw = fx && fx.kind === 'swish' ? Math.sin((t - fx.t) * 120) * 0.3 : 0;
    for (let i = 0; i < 20; i += 2) { const top = pts[i], an = i / 20 * Math.PI * 2, bot = P(bx + Math.cos(an) * 0.45 + sw, 25 + Math.sin(an) * 0.45, RIM_Z - 1.6); c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(bot[0], bot[1]); c.stroke(); }
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.strokeStyle = fx && fx.kind === 'rim' ? '#ffd27a' : '#e8590c'; c.lineWidth = Math.max(2, this.W / 380); c.stroke();
    void s;
  }
  drawPlayer(c, p, shooting, now) {
    const team = this.home && this.homeIds && this.homeIds.has(p.id) ? 0 : 1, kit = this.kit[team];
    const f = this.P(p.x, p.y, 0), hd = this.P(p.x, p.y, 9), h = f[1] - hd[1], w = h * 0.3;   // figures drawn ~1.5x life size so they read
    const x = f[0], y = f[1];
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(x, y, w * 0.75, h * 0.07, 0, 0, Math.PI * 2); c.fill();
    const run = p.moving ? Math.sin(now / 90 + (hash(p.id) % 7)) : 0, jump = shooting ? h * 0.12 : 0;
    const hip = y - h * 0.47 - jump, sh = y - h * 0.8 - jump, head = y - h * 0.91 - jump;
    c.lineCap = 'round';
    // legs
    c.strokeStyle = SKIN; c.lineWidth = w * 0.28;
    c.beginPath(); c.moveTo(x - w * 0.18, hip); c.lineTo(x - w * 0.22 + run * w * 0.3, y - jump * 0.5); c.moveTo(x + w * 0.18, hip); c.lineTo(x + w * 0.22 - run * w * 0.3, y - jump * 0.5); c.stroke();
    // shorts
    c.fillStyle = kit.shirt === '#f2f4f7' ? '#e6e9ee' : kit.shirt; c.strokeStyle = INK; c.lineWidth = 0.6;
    this.rrect(c, x - w * 0.45, hip - h * 0.08, w * 0.9, h * 0.16, w * 0.12); c.fill(); c.stroke();
    // arms
    c.strokeStyle = SKIN; c.lineWidth = w * 0.22;
    c.beginPath();
    if (shooting) { c.moveTo(x - w * 0.42, sh + h * 0.04); c.lineTo(x - w * 0.15, sh - h * 0.28); c.moveTo(x + w * 0.42, sh + h * 0.04); c.lineTo(x + w * 0.12, sh - h * 0.3); }
    else { c.moveTo(x - w * 0.48, sh + h * 0.03); c.lineTo(x - w * 0.62 - run * w * 0.2, hip); c.moveTo(x + w * 0.48, sh + h * 0.03); c.lineTo(x + w * 0.62 + run * w * 0.2, hip); }
    c.stroke();
    // jersey
    c.fillStyle = kit.shirt; c.strokeStyle = team === 0 ? kit.trim : INK; c.lineWidth = Math.max(1, w * 0.07);
    this.rrect(c, x - w * 0.5, sh, w, hip - sh + h * 0.02, w * 0.18); c.fill(); c.stroke();
    // number
    const num = this.nums?.[p.id];
    if (num != null && h > 18) { c.fillStyle = kit.num; c.font = `700 ${Math.round(h * 0.17)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(num), x, (sh + hip) / 2 + 1); }
    // head
    c.fillStyle = SKIN; c.strokeStyle = INK; c.lineWidth = 0.6; c.beginPath(); c.arc(x, head, h * 0.075, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  drawBall(c, b) {
    const g = this.P(b.x, b.y, 0), p = this.P(b.x, b.y, b.z), r = Math.max(2.5, (this.P(b.x, b.y, 0)[1] - this.P(b.x, b.y, 0.8)[1]));
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(g[0], g[1], r, r * 0.35, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e07b2a'; c.strokeStyle = '#4a2208'; c.lineWidth = 0.8;
    c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p[0] - r, p[1]); c.lineTo(p[0] + r, p[1]); c.stroke();
  }
  drawLabel(c, text, side) {
    const col = side == null ? '#20262e' : side === 0 ? (this.home.color && lum(this.home.color) < 200 ? this.home.color : '#2a3340') : this.kit[1].shirt;
    const fs = Math.round(this.W / 30);
    c.font = `800 ${fs}px system-ui, sans-serif`; const tw = c.measureText(text).width;
    const x = this.W / 2, y = this.H * 0.1;
    c.fillStyle = 'rgba(0,0,0,0.35)'; this.rrect(c, x - tw / 2 - fs * 0.6 + 3, y - fs * 0.75 + 3, tw + fs * 1.2, fs * 1.5, fs * 0.3); c.fill();
    c.fillStyle = col; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
    this.rrect(c, x - tw / 2 - fs * 0.6, y - fs * 0.75, tw + fs * 1.2, fs * 1.5, fs * 0.3); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + 1);
  }
  drawConfetti(c, now) {
    const C = this.confetti, el = (now - C.t0) / 1000; if (el > 9) { this.confetti = null; return; }
    const cols = [this.kit[C.side].shirt === '#f2f4f7' ? (this.home.color || '#f5b942') : this.kit[C.side].shirt, '#ffffff', '#f5b942'];
    for (let i = 0; i < 140; i++) {
      const hx = hash('c' + i), x = (hx % 1000) / 1000 * this.W, sp = 40 + (hx >> 10) % 60, y = ((el * sp + ((hx >> 4) % 400)) % (this.H + 20)) - 10;
      c.fillStyle = cols[i % 3]; c.save(); c.translate(x + Math.sin(el * 3 + i) * 8, y); c.rotate(el * 4 + i); c.fillRect(-3, -1.5, 6, 3); c.restore();
    }
  }
  rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
}
