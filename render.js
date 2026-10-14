/* Blade Duels - FIRST-PERSON renderer.
 * You are the camera: your weapon (right hand) and your buckler (left hand) are on screen,
 * the rival mannequin stands in front of you. There is no health bar: damage shows on the
 * body (persistent wounds that run and drip, cracks, posture) and in your own vision
 * (red vignette, blood on the lens, slashes).
 * Skins: neon and primal. Rules logic arrives as events from BD.step().
 */
(function () {
  const BD = (globalThis.BD = globalThis.BD || {});
  const W = 960, H = 540, HZ = 172, WALL = 205, CX = 480, FEET = 402, D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const E = {
    lin: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c = 2.70158; return 1 + c * Math.pow(t - 1, 3) + (c - 1) * Math.pow(t - 1, 2); },
    in: (t) => t * t * t,
  };

  function condition(f) {
    if (f > 0.9) return { text: 'Unhurt', col: '#7dffb0' };
    if (f > 0.7) return { text: 'Scratched', col: '#c8ff7d' };
    if (f > 0.45) return { text: 'Wounded', col: '#ffd60a' };
    if (f > 0.2) return { text: 'Badly hurt', col: '#ff8c00' };
    return { text: 'Near death', col: '#ff3b3b' };
  }

  // ---------- pose interpolation ----------
  class Tween {
    constructor(base) { this.keys = Object.keys(base); this.cur = Object.assign({}, base); this.from = Object.assign({}, base); this.to = Object.assign({}, base); this.t = 1; this.dur = 0.001; this.ease = E.out; }
    go(p, dur, ease) { this.from = Object.assign({}, this.cur); this.to = p; this.t = 0; this.dur = Math.max(0.001, dur); this.ease = ease || E.out; }
    snap(p) { this.cur = Object.assign({}, p); this.from = Object.assign({}, p); this.to = p; this.t = 1; }
    update(dt) {
      if (this.t >= 1) return;
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = this.ease(this.t);
      this.keys.forEach((key) => { this.cur[key] = lerp(this.from[key], this.to[key], k); });
    }
  }
  const mixP = (a, b, t) => { const r = {}; Object.keys(a).forEach((k) => { r[k] = lerp(a[k], b[k], t); }); return r; };

  // ---------- mannequin poses (local coordinates, origin at the feet, negative y = up) ----------
  const EP0 = { x: 0, y: 0, sc: 1, lean: 0, tilt: 0, sink: 0, rot: 0, hx: -70, hy: -192, w: -82, wl: 1, bx: 60, by: -172, bs: 1 };
  const ep = (o) => Object.assign({}, EP0, o);
  const ZYE = [-262, -190, -112];
  const BZE = [{ bx: 20, by: -262 }, { bx: 30, by: -190 }, { bx: 22, by: -112 }];
  const ESL_W = [ep({ hx: -52, hy: -292, w: -108, sc: 0.96 }), ep({ hx: -112, hy: -195, w: -155, sc: 0.96 }), ep({ hx: -100, hy: -100, w: 168, sc: 0.96 })];
  const ESL_S = [ep({ hx: -8, hy: -190, w: 64, sc: 1.28 }), ep({ hx: 46, hy: -172, w: -24, sc: 1.25 }), ep({ hx: 40, hy: -130, w: -38, sc: 1.24 })];
  function enemyAttack(type, zone, phase) {
    let p;
    if (type === 'rest') p = ep({});
    else if (type === 'thrust') p = phase === 'wind' ? ep({ hx: -50, hy: -178, w: -78, wl: 0.95, sc: 0.95 }) : ep({ hx: -4, hy: ZYE[zone] - 6, w: -90, wl: 0.3, sc: 1.4 });
    else {
      p = phase === 'wind' ? ESL_W[zone] : ESL_S[zone];
      if (type === 'quick' || type === 'feint') p = phase === 'wind' ? mixP(EP0, p, 0.68) : Object.assign({}, p, { sc: 1.14 });
      if (type === 'heavy') p = phase === 'wind' ? Object.assign({}, p, { sc: 0.92, hy: p.hy - 14 }) : Object.assign({}, p, { sc: 1.36 });
      if (type === 'feint' && phase === 'strike') p = mixP(enemyAttack('feint', zone, 'wind'), p, 0.45);
    }
    return p;
  }
  const withBlock = (p, z) => Object.assign({}, p, BZE[z], { bs: 1.1 });
  const EHIT = (d) => ep({ sc: 0.9, lean: 9 * d, tilt: 18 * d, x: 16 * d, hx: -84, hy: -170, w: -50, bx: 66, by: -150 });
  const ESTAG = ep({ sc: 0.88, lean: -14, tilt: -22, x: -18, hx: -100, hy: -250, w: -140, by: -150, bx: 80 });
  const EDIZ = ep({ lean: 8, tilt: 20, hx: -80, hy: -150, w: -30, bx: 70, by: -140, sink: 10 });
  const EKO = ep({ rot: 78, x: 70, y: 60, sc: 0.86, hx: -100, hy: -120, w: -10, bx: 90, by: -100, sink: 22 });

  // ---------- your hand poses (screen space) ----------
  const PP0 = { hx: 790, hy: 476, a: -78, ls: 1, bx: 150, by: 468, bs: 1 };
  const pp = (o) => Object.assign({}, PP0, o);
  const PBLOCK = [{ bx: 380, by: 150 }, { bx: 380, by: 275 }, { bx: 380, by: 405 }];
  const PSL_W = [pp({ hx: 840, hy: 300, a: -100 }), pp({ hx: 890, hy: 410, a: -35 }), pp({ hx: 860, hy: 505, a: 15 })];
  const PSL_S = [pp({ hx: 590, hy: 430, a: -75, ls: 0.6 }), pp({ hx: 330, hy: 380, a: -135 }), pp({ hx: 560, hy: 420, a: -105, ls: 0.9 })];
  const PTH_Y = [300, 380, 450];
  function playerAttack(type, zone, phase) {
    let p;
    if (type === 'rest') p = pp({ hx: 800, hy: 490, a: -82 });
    else if (type === 'thrust') p = phase === 'wind' ? pp({ hx: 870, hy: 460, a: -70 }) : pp({ hx: 560, hy: PTH_Y[zone], a: -88, ls: 0.42 });
    else {
      p = phase === 'wind' ? PSL_W[zone] : PSL_S[zone];
      if (type === 'quick' || type === 'feint') p = phase === 'wind' ? mixP(PP0, p, 0.68) : p;
      if (type === 'heavy' && phase === 'wind') p = Object.assign({}, p, { hy: p.hy + 20, hx: p.hx + 20 });
      if (type === 'feint' && phase === 'strike') p = mixP(playerAttack('feint', zone, 'wind'), p, 0.45);
    }
    return p;
  }
  const withPBlock = (p, z) => Object.assign({}, p, PBLOCK[z], { bs: 1.05 });
  const PHIT = pp({ hx: 810, hy: 520, a: -60, ls: 0.95 });
  const PSTAG = pp({ hx: 860, hy: 570, a: -40 });
  const PKO = pp({ hx: 900, hy: 720, a: -20, by: 700 });
  const PWIN = pp({ hx: 700, hy: 330, a: -95 });

  // ---------- stroke helpers (neon / primal) ----------
  function path(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
  function glowStroke(ctx, col, w, a) {
    a = a == null ? 1 : a;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 * a; ctx.lineWidth = w * 3.5; ctx.stroke();
    ctx.globalAlpha = 0.26 * a; ctx.lineWidth = w * 1.9; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.lineWidth = w; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.7 * a; ctx.lineWidth = Math.max(1, w * 0.3); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // fills the already-built path according to the style
  function paint(ctx, st, o) {
    if (st.sil) { ctx.fillStyle = '#0b0b0b'; ctx.fill(); return; }
    if (st.neon) { ctx.fillStyle = o.nfill || '#0d0822'; ctx.fill(); glowStroke(ctx, o.col || '#19e6ff', o.w || 2.5, o.a); }
    else { ctx.fillStyle = o.pfill || '#efe0c2'; ctx.fill(); ctx.lineWidth = o.pw || 5; ctx.strokeStyle = '#0b0b0b'; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function thick(ctx, st, pts, w, col, pcol) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (st.sil) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = w; path(ctx, pts); return; }
    if (st.neon) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); glowStroke(ctx, col, Math.max(2.5, w * 0.34)); return; }
    ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = w + 8; path(ctx, pts);
    ctx.strokeStyle = pcol || col; ctx.lineWidth = w; path(ctx, pts);
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }
  function capsule(ctx, a, b, w1, w2) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    poly(ctx, [{ x: a.x + nx * w1 / 2, y: a.y + ny * w1 / 2 }, { x: b.x + nx * w2 / 2, y: b.y + ny * w2 / 2 }, { x: b.x - nx * w2 / 2, y: b.y - ny * w2 / 2 }, { x: a.x - nx * w1 / 2, y: a.y - ny * w1 / 2 }]);
  }

  // weapon geometry: o = hand origin, ang in degrees, L length, t thickness
  function weaponShape(ctx, st, shape, ox, oy, ang, L, t, col) {
    const c = Math.cos(ang * D2R), s = Math.sin(ang * D2R);
    const P = (d, n) => ({ x: ox + c * d - s * (n || 0), y: oy + s * d + c * (n || 0) });
    const steel = '#e8eef5';
    const blade = (pts) => { poly(ctx, pts); paint(ctx, st, { nfill: '#0d1a2a', col, w: Math.max(2, t * 0.12), pfill: steel, pw: Math.max(3, t * 0.2) }); };
    if (shape === 'spear') {
      thick(ctx, st, [P(-L * 0.25), P(L * 0.78)], t * 0.55, col, '#7a4a25');
      blade([P(L * 0.74, -t * 0.7), P(L), P(L * 0.74, t * 0.7)]);
    } else if (shape === 'axe') {
      thick(ctx, st, [P(-L * 0.2), P(L * 0.92)], t * 0.5, col, '#7a4a25');
      blade([P(L * 0.7), P(L * 0.68, -t * 2.2), P(L * 0.92, -t * 2.7), P(L, -t * 0.5), P(L * 0.9)]);
    } else {
      thick(ctx, st, [P(-L * 0.28), P(0)], t * 0.5, col, '#3a2418');
      blade([P(0, t / 2), P(L * 0.9, t * 0.22), P(L), P(L * 0.9, -t * 0.22), P(0, -t / 2)]);
      thick(ctx, st, [P(2, -t * 1.5), P(2, t * 1.5)], t * 0.42, col, '#d4a017');
    }
  }

  // two-bone IK in screen space
  function ik(sx, sy, tx, ty, l1, l2, out) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 0.001;
    const mx = l1 + l2 - 0.5;
    if (d > mx) { tx = sx + dx * mx / d; ty = sy + dy * mx / d; dx = tx - sx; dy = ty - sy; d = mx; }
    const mn = Math.abs(l1 - l2) + 0.5; if (d < mn) d = mn;
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d, px = sx + ux * a, py = sy + uy * a;
    const c1 = { x: px - uy * h, y: py + ux * h }, c2 = { x: px + uy * h, y: py - ux * h };
    const sc = (c) => c.y + out * (c.x - sx) * 0.8;
    return { el: sc(c1) >= sc(c2) ? c1 : c2, hd: { x: tx, y: ty } };
  }
  // comic-book sound effects, by kind of impact
  const WORDS = {
    quick: ['SLASH!', 'SWISH!', 'SNIKT!', 'SLICE!', 'ZIP!'],
    heavy: ['WHAM!', 'CRUNCH!', 'SMASH!', 'THWACK!', 'KA-POW!'],
    thrust: ['STAB!', 'THWIP!', 'PIERCE!', 'SKEWER!'],
    punish: ['GOTCHA!', 'BUSTED!'],
    block: ['CLANG!', 'CLASH!', 'KLANK!', 'CLINK!'],
    break: ['KRAKOOM!', 'SHATTER!'],
    parry: ['CLING!', 'DEFLECT!'],
    interrupt: ['THUD!', 'BONK!'],
    open: ['WHOOSH!', 'WHIFF!'],
  };
  const TONE = { hit: '#e63946', heavy: '#c1121f', block: '#1d6fd8', break: '#f77f00', parry: '#7b2cbf', open: '#0aa89e' };
  const WLEN = { blade: 330, dagger: 190, spear: 470, axe: 300 };
  const WTHK = { blade: 34, dagger: 42, spear: 28, axe: 26 };

    // ---------- Scene ----------
  class Scene {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
      this.theme = 'neon'; this.speed = 1; this.time = 0; this.clock = 0; this.sched = [];
      this.en = new Tween(EP0); this.pl = new Tween(PP0);
      this.eF = { dizzy: false, swinging: false, broken: false, flash: 0 }; this.pF = { swinging: false, open: false, broken: false };
      this.eWeapon = BD.WEAPONS.katana; this.pWeapon = BD.WEAPONS.katana; this.eColor = '#ff2d95'; this.pColor = '#19e6ff'; this.eName = '';
      this.parts = []; this.lens = []; this.slits = []; this.wounds = []; this.cracks = []; this.pool = 0;
      this.trailE = []; this.trailP = [];
      this.texts = []; this.banners = []; this.callouts = [];
      this.comics = []; this.dots = []; this.kirby = []; this.lastWord = '';
      this.cam = { shake: 0, roll: 0, rollT: 0, dy: 0, dyT: 0, zoom: 0 };
      this.busy = false; this.idleAmp = 1; this.idlePh = 0; this.agit = 0;
      this.freeze = 0; this.slowmo = 0; this.impact = 0; this.flashWhite = 0; this.flashRed = 0; this.koFade = 0;
      this.fx = { mb: 0, dx: 1, dy: 0, rad: 0 }; this.speedLines = 0; this.timer = null;
      this.wcv = document.createElement('canvas'); this.wcv.width = W; this.wcv.height = H; this.wctx = this.wcv.getContext('2d');
      this.dmg = { a: 0, b: 0 }; this.dmgT = { a: 0, b: 0 };
      this.hud = { a: this.blankHud(), b: this.blankHud(), round: 1, turn: 0, limit: 14 };
      this.bg = {}; this.last = 0; this.running = false;
      this.decal = document.createElement('canvas'); this.decal.width = W; this.decal.height = H; this.dctx = this.decal.getContext('2d');
      this.idleAll();
    }
    blankHud() { return { name: '', title: '', hp: 1, maxHp: 1, st: 1, maxSt: 1, chain: 0, open: false, wins: 0 }; }
    setTheme(t) { this.theme = t; }
    get neon() { return this.theme === 'neon'; }

    setFighters(fa, fb) {
      this.pWeapon = BD.WEAPONS[fa.weapon]; this.eWeapon = BD.WEAPONS[fb.weapon];
      this.pColor = fa.color; this.eColor = fb.color; this.eName = fb.name;
      this.dctx.clearRect(0, 0, W, H);
      this.idleAll();
    }
    setHud(side, f, wins) {
      const h = this.hud[side];
      Object.assign(h, { name: f.name, title: f.title, hp: f.hp, maxHp: f.maxHp, st: f.st, maxSt: f.maxSt, chain: f.chain.length, open: f.open, wins: wins == null ? h.wins : wins });
      this.dmgT[side] = 1 - f.hp / f.maxHp;
      if (side === 'b') this.eF.dizzy = f.open; else this.pF.open = f.open;
    }
    syncHudInstant() { this.dmg.a = this.dmgT.a; this.dmg.b = this.dmgT.b; }

    // new round: clean body and vision
    idleAll() {
      this.busy = false; this.idleAmp = 1;
      this.en.snap(EP0); this.pl.snap(PP0);
      this.eF = { dizzy: false, swinging: false, broken: false, flash: 0 }; this.pF = { swinging: false, open: false, broken: false };
      this.parts = []; this.lens = []; this.slits = []; this.wounds = []; this.trailE = []; this.trailP = []; this.pool = 0;
      this.comics = []; this.dots = []; this.kirby = [];
      this.cam = { shake: 0, roll: 0, rollT: 0, dy: 0, dyT: 0, zoom: 0 }; this.koFade = 0; this.flashRed = 0;
      this.dmg.a = this.dmg.b = 0; this.dmgT.a = this.dmgT.b = 0;
      this.makeCracks();
    }
    makeCracks() {
      this.cracks = [];
      for (let i = 0; i < 9; i++) {
        const pts = []; let x = rnd(-34, 34), y = rnd(-270, -130);
        for (let j = 0; j < 5; j++) { pts.push({ x, y }); x += rnd(-12, 12); y += rnd(6, 20); }
        this.cracks.push({ pts, th: 0.12 + i * 0.09 });
      }
    }

    at(t, fn) { this.sched.push({ at: this.clock + t, fn }); this.sched.sort((x, y) => x.at - y.at); }
    wait(t) { return new Promise((res) => this.at(t, res)); }

    // ---------- loop ----------
    start() {
      if (this.running) return; this.running = true;
      const loop = (ts) => {
        if (!this.running) return;
        const real = Math.min(0.05, (ts - (this.last || ts)) / 1000); this.last = ts;
        this.tick(real); this.draw(); requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    puppet() {
      const c = this.en.cur, d = this.dmg.b, t = this.time, P = Object.assign({}, c);
      const col = this.eF.collapsed ? 0 : 1;
      P.lean += (Math.sin(t * 1.4) * (1.5 + d * 3) + d * 8) * col;
      P.tilt += (d * 16 + Math.sin(t * 1.1) * (1 + d * 4)) * col;
      P.sink += (d * 16 + Math.sin(t * 2.2) * 1.5) * col;
      P.hy += d * 30 * col; P.w += d * 16 * col;
      if (this.eF.dizzy) { P.tilt += Math.sin(t * 2.2) * 7; P.lean += Math.sin(t * 1.7) * 4; }
      // waiting for your move: a relaxed fighting stance. Slow weight shifts, a gentle breathing sway,
      // an occasional probing jab. Everything runs on one accumulated phase (this.idlePh), so speeding
      // up when the clock runs low never makes the phase jump.
      const amp = this.idleAmp * col;
      if (amp > 0.01) {
        const ph = this.idlePh, ag = 1 + this.agit * 0.3;
        const wob = (a) => Math.sin(a) + 0.4 * Math.sin(a * 2.31 + 1.3);     // organic, never perfectly periodic
        const ease = (v) => v * v * (3 - 2 * v);                              // smoothstep
        const k = (ph * 0.2) % 1, jab = k > 0.86 ? Math.sin(((k - 0.86) / 0.14) * Math.PI) : 0, pump = jab * jab; // ~0.7 s, soft in and out
        void ease;
        P.x += wob(ph * 0.62) * 13 * amp * ag * (1 - d * 0.5);
        P.sc += (wob(ph * 0.5 + 2) * 0.014 + pump * 0.045) * amp;
        P.hx += (wob(ph * 0.9 + 1) * 5 + pump * 14) * amp; P.hy += (wob(ph * 0.8 + 3) * 4 - pump * 8) * amp; P.w += wob(ph * 0.85) * 3 * amp;
        P.bx += wob(ph * 0.55 + 4) * 7 * amp; P.by += wob(ph * 0.6 + 5) * 12 * amp * ag;
        P.lean += wob(ph * 0.6 + 6) * 1.6 * amp; P.sink += (Math.sin(ph * 1.5) * 0.5 + 0.5) * 3.5 * amp;
      }
      P.fy = FEET + (P.sc - 1) * 150 + P.y;
      return P;
    }
    // local torso/head point -> world
    ubWorld(P, x, y) {
      const a = P.lean * D2R, ux = x * Math.cos(a) - (y + 110) * Math.sin(a), uy = x * Math.sin(a) + (y + 110) * Math.cos(a) - 110;
      const r = P.rot * D2R, rx = ux * Math.cos(r) - uy * Math.sin(r), ry = ux * Math.sin(r) + uy * Math.cos(r);
      return { x: CX + P.x + rx * P.sc, y: P.fy + ry * P.sc };
    }
    legWorld(P, x, y) {
      const r = P.rot * D2R, rx = x * Math.cos(r) - y * Math.sin(r), ry = x * Math.sin(r) + y * Math.cos(r);
      return { x: CX + P.x + rx * P.sc, y: P.fy + ry * P.sc };
    }
    woundWorld(P, w, dy) { return w.part === 'legs' ? this.legWorld(P, w.x, w.y + (dy || 0)) : this.ubWorld(P, w.x, w.y + (dy || 0)); }
    enemyTip(P) {
      const wl = (WLEN[this.eWeapon.shape] * 0.5) * P.wl;
      const h = this.ubWorld(P, P.hx, P.hy), ang = (P.w + P.lean + P.rot) * D2R;
      return { h, t: { x: h.x + Math.cos(ang) * wl * P.sc, y: h.y + Math.sin(ang) * wl * P.sc } };
    }
    playerTip() {
      const p = this.pl.cur, L = WLEN[this.pWeapon.shape] * p.ls, a = p.a * D2R;
      return { b: { x: p.hx + Math.cos(a) * L * 0.3, y: p.hy + Math.sin(a) * L * 0.3 }, t: { x: p.hx + Math.cos(a) * L, y: p.hy + Math.sin(a) * L } };
    }

    tick(real) {
      this.time += real;
      const cam = this.cam;
      cam.shake = Math.max(0, cam.shake - real * 30); cam.zoom = Math.max(0, cam.zoom - real * 0.25);
      cam.roll += (cam.rollT - cam.roll) * Math.min(1, real * 6); cam.dy += (cam.dyT - cam.dy) * Math.min(1, real * 3);
      this.flashWhite = Math.max(0, this.flashWhite - real * 4); this.flashRed = Math.max(0, this.flashRed - real * 2.2);
      this.impact = Math.max(0, this.impact - real);
      this.agit += ((this.timer ? 1 - this.timer.frac : 0) - this.agit) * Math.min(1, real * 1.5);
      this.idlePh += real * 1.3 * (1 + this.agit * 0.35);
      const fx = this.fx; fx.mb = Math.max(0, fx.mb - real * 3.4); fx.rad = Math.max(0, fx.rad - real * 3.4); this.speedLines = Math.max(0, this.speedLines - real);
      if (this.timer && this.timer.frac < 0.35) cam.zoom = Math.max(cam.zoom, 0.025 * (0.5 + 0.5 * Math.sin(this.time * 14)) * ((0.35 - this.timer.frac) / 0.35));
      if (this.freeze > 0) { this.freeze -= real; return; }
      const dt = real * this.speed * (this.slowmo > 0 ? 0.3 : 1);
      this.idleAmp += ((this.busy ? 0 : 1) - this.idleAmp) * Math.min(1, real * (this.busy ? 5 : 1.8));
      if (this.slowmo > 0) this.slowmo -= real;
      this.clock += dt;
      while (this.sched.length && this.sched[0].at <= this.clock) this.sched.shift().fn();
      this.en.update(dt); this.pl.update(dt);
      if (this.eF.flash > 0) this.eF.flash -= dt;
      ['a', 'b'].forEach((k) => { this.dmg[k] += (this.dmgT[k] - this.dmg[k]) * Math.min(1, dt * 3); });
      // trails
      const P = this.puppet();
      if (this.eF.swinging) { const g = this.enemyTip(P); this.trailE.push({ bx: lerp(g.h.x, g.t.x, 0.3), by: lerp(g.h.y, g.t.y, 0.3), tx: g.t.x, ty: g.t.y, age: 0 }); }
      if (this.pF.swinging) { const g = this.playerTip(); this.trailP.push({ bx: g.b.x, by: g.b.y, tx: g.t.x, ty: g.t.y, age: 0 }); }
      [this.trailE, this.trailP].forEach((tr) => tr.forEach((t) => { t.age += dt; }));
      this.trailE = this.trailE.filter((t) => t.age < 0.22).slice(-16); this.trailP = this.trailP.filter((t) => t.age < 0.22).slice(-16);
      // wounds: grow, run and drip
      this.wounds.forEach((w) => {
        w.age += dt; w.streak = Math.min(w.maxStreak, w.streak + dt * (26 + w.rate * 20));
        w.acc += dt * w.rate * Math.max(0.12, 1 - w.age / 28);
        while (w.acc > 1) {
          w.acc -= 1; const p = this.woundWorld(P, w, w.streak);
          this.parts.push({ type: 'drop', x: p.x + rnd(-2, 2), y: p.y, vx: rnd(-8, 8), vy: rnd(20, 90), z: 0, vz: 0, r: rnd(2, 4.2), landY: P.fy + rnd(-6, 24), life: 4 });
        }
      });
      // particles
      this.parts.forEach((p) => {
        p.life -= dt;
        if (p.type === 'drop' || p.type === 'chunk') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += 1500 * dt; if (p.rot != null) p.rot += p.vr * dt;
          if (p.z > 260 && p.type === 'drop') { p.life = 0; if (Math.random() < 0.55) this.lensSplat(p.x, p.y, p.r * rnd(1.8, 3.4)); }
          else if (p.y >= p.landY && p.vy > 0) { p.life = 0; this.splat(p.x, p.landY, p.r * (p.type === 'chunk' ? 1.5 : 1)); }
        } else if (p.type === 'spark' || p.type === 'shard') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 1 - dt * 2;
        } else if (p.type === 'ring') p.r += p.vr * dt;
      });
      this.parts = this.parts.filter((p) => p.life > 0);
      // lens: drops slide down
      this.lens.forEach((l) => { l.age += dt; l.vy = Math.min(l.vmax, l.vy + l.r * 0.5 * dt); l.y += l.vy * dt; });
      this.lens = this.lens.filter((l) => l.age < l.life && l.y < H + 40);
      this.slits.forEach((s) => { s.age += dt; });
      this.texts.forEach((t) => { t.life -= dt; t.y -= t.vy * dt; }); this.texts = this.texts.filter((t) => t.life > 0);
      this.banners.forEach((b) => { b.t += dt; }); this.banners.filter((b) => b.t >= b.dur).forEach((b) => b.done()); this.banners = this.banners.filter((b) => b.t < b.dur);
      this.callouts.forEach((c) => { c.t += dt; }); this.callouts = this.callouts.filter((c) => c.t < c.dur);
      [this.comics, this.dots, this.kirby].forEach((l) => l.forEach((c) => { c.t += dt; }));
      this.comics = this.comics.filter((c) => c.t < c.dur); this.dots = this.dots.filter((c) => c.t < c.dur); this.kirby = this.kirby.filter((c) => c.t < c.dur);
    }

    // ---------- fluids and wounds ----------
    bloodCol(sil) { return sil ? '#ffffff' : (this.neon ? '#ff1744' : '#a4161a'); }
    splat(x, y, r) {
      const g = this.dctx, neon = this.neon;
      g.save(); g.globalAlpha = 0.9;
      const rx = r * rnd(1.4, 2.6), ry = rx * rnd(0.25, 0.4);
      g.fillStyle = neon ? '#b0002a' : '#7a0d12';
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill();
      if (!neon) { g.strokeStyle = '#0b0b0b'; g.lineWidth = 1.5; g.stroke(); }
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + rnd(-rx * 1.6, rx * 1.6), y + rnd(-ry * 1.4, ry * 1.6), rnd(1, 3), rnd(0.6, 1.6), 0, 0, 6.283); g.fill(); }
      g.restore();
    }
    lensSplat(x, y, r) {
      const bl = []; const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) bl.push({ dx: rnd(-r, r) * 1.1, dy: rnd(-r, r) * 0.9, r: r * rnd(0.35, 0.8) });
      this.lens.push({ x, y, y0: y, r, vy: rnd(2, 10), vmax: rnd(14, 46) * (r > 12 ? 1.4 : 1), age: 0, life: rnd(10, 17), bl });
      if (this.lens.length > 70) this.lens.shift();
    }
    // burst of drops from (x,y); power scales speed and amount
    spray(x, y, n, power) {
      const P = this.puppet();
      for (let i = 0; i < n; i++) {
        this.parts.push({ type: 'drop', x, y, vx: rnd(-300, 300) * power, vy: rnd(-470, -30) * power, z: 0, vz: rnd(40, 540) * power, r: rnd(1.5, 5.8), landY: P.fy + rnd(-6, 30), life: 3 });
      }
    }
    chunks(x, y, n) {
      const P = this.puppet();
      for (let i = 0; i < n; i++) this.parts.push({ type: 'chunk', x, y, vx: rnd(-320, 320), vy: rnd(-420, -60), z: 0, vz: rnd(-60, 120), r: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-12, 12), landY: P.fy + rnd(0, 30), life: 3 });
    }
    sparks(x, y, n, col, speed, dir, spread) {
      for (let i = 0; i < n; i++) {
        const a = dir == null ? Math.random() * 6.283 : dir + (Math.random() - 0.5) * (spread || 1.6), sp = speed * (0.4 + Math.random());
        this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 500, life: 0.25 + Math.random() * 0.3, max: 0.5, col, size: 2 + Math.random() * 2 });
      }
    }
    ring(x, y, col, r1, w) { this.parts.push({ type: 'ring', x, y, r: 6, vr: r1 * 5, life: 0.28, max: 0.28, col, size: w || 4 }); }
    shards(x, y, n, col) {
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 120 + Math.random() * 280; this.parts.push({ type: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 900, life: 0.5 + Math.random() * 0.3, max: 0.8, col, size: 5 + Math.random() * 7, rot: Math.random() * 6 }); }
    }
    addWound(zone, type, dmg) {
      let part = 'up', x, y;
      if (zone === 0) { if (Math.random() < 0.6) { x = rnd(-14, 14); y = -254 + rnd(-18, 18); } else { x = rnd(-36, 36); y = -200 + rnd(-6, 8); } }
      else if (zone === 1) { x = rnd(-24, 24); y = -168 + rnd(-26, 26); }
      else if (Math.random() < 0.5) { x = rnd(-20, 20); y = -138 + rnd(-8, 8); } else { part = 'legs'; x = (Math.random() < 0.5 ? -1 : 1) * 17; y = -80 + rnd(-24, 24); }
      const kind = type === 'heavy' ? 'gash' : type === 'thrust' ? 'stab' : 'slash';
      const size = 20 + dmg * 1.5;
      const w = { x, y, part, kind, ang: kind === 'slash' ? rnd(-55, 55) + (Math.random() < 0.5 ? 0 : 180) : rnd(-40, 40), size, age: 0, streak: 0, maxStreak: rnd(20, 48) + dmg * 1.6, acc: 0, rate: 0.7 + dmg * 0.07, w: 2.2 + dmg * 0.06, jit: Array.from({ length: 8 }, () => rnd(0.55, 1.3)), hole: kind === 'gash' && dmg >= 14 };
      this.wounds.push(w); if (this.wounds.length > 26) this.wounds.shift();
      this.pool += dmg * 0.9;
      return w;
    }
    slit(x, y, ang, len, w) {
      this.slits.push({ x, y, ang, len, w, age: 0 });
      for (let i = 0; i < 4; i++) this.lensSplat(x + Math.cos(ang) * rnd(-len, len) * 0.5, y + Math.sin(ang) * rnd(-len, len) * 0.5, rnd(4, 9));
    }

    pickWord(pool) {
      let w; for (let i = 0; i < 4; i++) { w = pool[Math.floor(Math.random() * pool.length)]; if (w !== this.lastWord) break; }
      this.lastWord = w; return w;
    }
    // comic-book hit: sound-effect word on a starburst, halftone dots and kinetic lines
    comic(x, y, word, tone, size, opt) {
      const o = opt || {}, sz = size, w = this.wctx;
      w.save(); w.font = '400 ' + sz + 'px Bangers, Impact, "Arial Black", sans-serif'; const tw = w.measureText(word).width; w.restore();
      const R = Math.max(tw * 0.56, sz * 0.98) + 22, n = 13 + Math.floor(Math.random() * 5);
      const cx = clamp(x, R * 0.7, W - R * 0.7), cy = clamp(y, R * 0.55 + 20, H - R * 0.55);
      const jit = Array.from({ length: n }, () => rnd(0.82, 1.12));
      this.comics.push({ x: cx, y: cy, word, tone, size: sz, R, n, jit, rot: rnd(-0.22, 0.22), t: 0, dur: o.big ? 0.95 : 0.7 });
      this.dots.push({ x, y, r: 120 + sz * 1.5, step: 11, col: this.neon ? tone : '#0b0b0b', alpha: this.neon ? 0.8 : 0.45, t: 0, dur: 0.4 });
      if (o.big) this.dots.push({ x: W / 2, y: H / 2, r: 560, step: 24, col: this.neon ? tone : '#0b0b0b', alpha: this.neon ? 0.22 : 0.16, t: 0, dur: 0.26 });
      this.kirby.push({ x, y, n: 12 + Math.floor(Math.random() * 6), base: rnd(0, 6.283), r0: R * 0.8, len: R * (o.big ? 1.7 : 1.15), tone, t: 0, dur: 0.3 });
    }
    floatText(x, y, text, col, size) { this.texts.push({ x, y, text, col, size: size || 26, life: 1.0, max: 1.0, vy: 40 }); }
    callout(text, col) { this.callouts.push({ text, col, t: 0, dur: 1.2 }); }
    banner(text, sub, dur) { return new Promise((res) => { this.banners.push({ text, sub: sub || '', t: 0, dur: dur || 1.1, done: res }); }); }
    fxBlur(mb, dx, dy, rad) {
      const f = this.fx;
      if (mb > f.mb) { f.mb = mb; if (dx || dy) { const d = Math.hypot(dx, dy) || 1; f.dx = dx / d; f.dy = dy / d; } }
      f.rad = Math.max(f.rad, rad || 0);
    }
    doFreeze(s) { this.freeze = Math.max(this.freeze, s); }
    doShake(m) { this.cam.shake = Math.max(this.cam.shake, m); }

    // ---------- one turn ----------
    // a = you (camera), b = mannequin
    playTurn(mv, res, after) {
      return new Promise((resolve) => {
        const ev = {}; res.events.forEach((e) => { ev[e.src] = e; });
        this.busy = true;
        this.pF.swinging = false; this.eF.swinging = false;
        this.en.go(withBlock(enemyAttack(mv.b.type, Math.max(0, mv.b.zone), 'wind'), mv.b.block), mv.b.type === 'rest' ? 0.3 : (mv.b.type === 'heavy' ? 0.42 : 0.34), E.out);
        this.pl.go(withPBlock(playerAttack(mv.a.type, Math.max(0, mv.a.zone), 'wind'), mv.a.block), mv.a.type === 'rest' ? 0.3 : (mv.a.type === 'heavy' ? 0.42 : 0.34), E.out);
        this.hud.turn += 1;
        ['a', 'b'].forEach((k) => { this.hud[k].st = after[k].st; this.hud[k].chain = after[k].chain.length; });
        if (this.dmgT.a > 0.6 && BD.Audio) BD.Audio.sfx('heart');
        BD.Audio && BD.Audio.sfx('whoosh');
        this.at(0.38, () => {
          if (mv.b.type !== 'rest') { this.eF.swinging = true; this.en.go(withBlock(enemyAttack(mv.b.type, mv.b.zone, 'strike'), mv.b.block), mv.b.type === 'quick' ? 0.09 : 0.12, E.back); }
          if (mv.a.type !== 'rest') { this.pF.swinging = true; this.pl.go(withPBlock(playerAttack(mv.a.type, mv.a.zone, 'strike'), mv.a.block), mv.a.type === 'quick' ? 0.09 : 0.12, E.back); }
          let mb = 0, rad = 0, dx = 0, dy = 0;
          if (mv.b.type !== 'rest') rad = mv.b.type === 'heavy' ? 0.9 : mv.b.type === 'thrust' ? 0.8 : 0.5;
          if (mv.a.type !== 'rest') {
            if (mv.a.type === 'thrust') rad = Math.max(rad, 0.6);
            else { mb = mv.a.type === 'heavy' ? 0.95 : 0.75; [dx, dy] = [[0.4, 1], [-1, 0], [0.5, -1]][mv.a.zone]; }
            if ((mv.a.pa || 0) >= 0.65) this.speedLines = 0.5;
          }
          this.fxBlur(mb, dx, dy, rad);
          BD.Audio && BD.Audio.sfx('swing');
        });
        this.at(0.5, () => {
          ['a', 'b'].forEach((k) => { this.hud[k].hp = after[k].hp; this.hud[k].open = after[k].open; this.dmgT[k] = 1 - after[k].hp / this.hud[k].maxHp; });
          ['a', 'b'].forEach((k) => { if (ev[k]) this.applyEvent(ev[k]); });
        });
        this.at(1.0, () => {
          this.pF.swinging = false; this.eF.swinging = false;
          this.eF.dizzy = after.b.open; this.pF.open = after.a.open;
          if (after.b.hp > 0) this.en.go(this.eF.dizzy ? EDIZ : EP0, 0.35, E.inout);
          if (after.a.hp > 0) this.pl.go(PP0, 0.35, E.inout);
        });
        this.at(1.5, () => { this.busy = false; resolve(); });
      });
    }

    enemyContact(zone) { const P = this.puppet(); return zone === 0 ? this.ubWorld(P, 0, -254) : zone === 1 ? this.ubWorld(P, 0, -168) : this.legWorld(P, 0, -92); }
    playerContact(zone) { return { x: 480 + rnd(-70, 70), y: [150, 275, 400][Math.max(0, zone)] }; }

    applyEvent(e) {
      const mine = e.src === 'a'; // you attack
      const zone = e.zone, ap = BD.Audio ? (n) => BD.Audio.sfx(n) : () => {};
      const P = this.puppet();
      const eBuck = this.ubWorld(P, P.bx, P.by), pBuck = { x: this.pl.cur.bx, y: this.pl.cur.by };
      switch (e.kind) {
        case 'hit': case 'punish': {
          let cx = 480, cy = 270;
          if (mine) {
            const w = this.addWound(zone, e.type, e.dmg), pos = this.woundWorld(P, w);
            this.en.go(EHIT(Math.random() < 0.5 ? -1 : 1), 0.09, E.out); this.eF.flash = 0.16;
            this.spray(pos.x, pos.y, 12 + Math.round(e.dmg * 1.6), 0.7 + e.dmg * 0.03);
            if (e.type === 'heavy' || e.dmg >= 16) { this.chunks(pos.x, pos.y, 4 + Math.round(e.dmg / 5)); this.lensSplat(rnd(260, 700), rnd(120, 400), rnd(10, 26)); }
            this.sparks(pos.x, pos.y, 8, '#ff5c6e', 300);
            this.ring(pos.x, pos.y, this.bloodCol(false), 30 + e.dmg);
            this.doFreeze(0.05 + e.dmg * 0.003); this.doShake(4 + e.dmg * 0.5); this.cam.zoom = Math.min(0.08, 0.02 + e.dmg * 0.002);
            this.fxBlur(0.7, rnd(-1, 1), rnd(-1, 1), e.dmg >= 14 ? 0.8 : 0.4); cx = pos.x; cy = pos.y;
            if (e.power >= 1.2 && !e.combo) this.callout('FAST!', '#19e6ff');
          } else {
            const c = this.playerContact(zone), big = e.dmg >= 14; cx = c.x; cy = c.y;
            this.cam.roll += (Math.random() < 0.5 ? -1 : 1) * (3 + e.dmg * 0.25); this.cam.rollT = 0;
            this.flashRed = Math.min(0.8, 0.3 + e.dmg * 0.02);
            const ang = zone === 0 ? 0.7 : zone === 2 ? -0.6 : rnd(-0.2, 0.2);
            if (e.type === 'thrust') { this.lensSplat(c.x, c.y, 16 + e.dmg * 0.8); for (let i = 0; i < 4; i++) this.lensSplat(c.x + rnd(-60, 60), c.y + rnd(-50, 50), rnd(4, 11)); } else this.slit(c.x, c.y, ang, 110 + e.dmg * 5, 6 + e.dmg * 0.25);
            for (let i = 0; i < 3 + Math.round(e.dmg / 4); i++) this.lensSplat(rnd(120, 840), rnd(60, 470), rnd(4, big ? 24 : 12));
            this.doFreeze(0.06 + e.dmg * 0.003); this.doShake(5 + e.dmg * 0.6);
            this.pl.go(PHIT, 0.09, E.out); this.fxBlur(0.8, rnd(-1, 1), rnd(-1, 1), e.dmg >= 14 ? 0.9 : 0.5);
          }
          this.comic(cx, cy - 24, e.combo ? e.combo.name.toUpperCase() + '!!' : this.pickWord(e.kind === 'punish' ? WORDS.punish : (WORDS[e.type] || WORDS.quick)),
            e.type === 'heavy' || e.combo ? TONE.heavy : TONE.hit, 54 + Math.min(46, e.dmg * 1.7) + (e.power >= 1.2 ? 10 : 0), { big: e.dmg >= 16 || !!e.combo });
          if (e.kind === 'punish') this.callout('PUNISHED!', '#ffd60a');
          if (e.counter) this.callout('COUNTER!', '#ffd60a');
          if (e.combo) { this.callout(e.combo.name.toUpperCase() + '!', mine ? this.pColor : this.eColor); this.doShake(14); this.impact = 0.14; }
          else if (e.dmg >= 18) this.impact = 0.12;
          ap('splat'); ap(e.dmg >= 18 ? 'heavy' : 'hit');
          break;
        }
        case 'block': {
          const at = mine ? eBuck : pBuck;
          this.sparks(at.x, at.y, 12, '#ffe08a', 320, Math.random() * 6.283, 6.283);
          this.ring(at.x, at.y, '#fff', 36, 3); this.doFreeze(0.04); this.doShake(mine ? 3 : 6);
          this.comic(at.x + (mine ? 0 : 40), at.y - 10, this.pickWord(WORDS.block), TONE.block, 48);
          if (e.dmg > 0) { if (mine) { const w = this.addWound(zone, 'quick', e.dmg * 0.6); this.spray(at.x, at.y, 4, 0.5); w.size *= 0.7; } else { this.lensSplat(rnd(300, 660), rnd(120, 400), rnd(6, 12)); } }
          if (e.perfect && !mine) this.callout('PERFECT BLOCK!', '#7dffb0');
          ap('block');
          break;
        }
        case 'guardbreak': {
          const at = mine ? eBuck : pBuck;
          if (mine) this.eF.broken = true; else this.pF.broken = true;
          this.shards(at.x, at.y, 18, mine ? this.eColor : this.pColor);
          this.sparks(at.x, at.y, 16, '#ffe08a', 400);
          if (mine) { this.en.go(EHIT(1), 0.1, E.out); if (e.dmg > 0) this.addWound(zone, 'quick', e.dmg * 0.7); } else { this.pl.go(PHIT, 0.1, E.out); this.lensSplat(rnd(300, 660), rnd(120, 400), rnd(8, 16)); }
          this.comic(at.x, at.y - 20, this.pickWord(WORDS.break), TONE.break, 78, { big: true });
          this.callout('GUARD BREAK!', '#ff8c00'); this.ring(at.x, at.y, '#ff8c00', 80); this.doFreeze(0.1); this.doShake(12); this.impact = 0.1;
          ap('break');
          break;
        }
        case 'parry': {
          const at = mine ? pBuck : eBuck;
          if (mine) this.pl.go(PSTAG, 0.12, E.out); else this.en.go(ESTAG, 0.12, E.out);
          this.pF.swinging = false; this.eF.swinging = false;
          this.ring(480, 270, '#fff', 100, 6); this.sparks(480, 270, 24, '#fff', 480);
          this.comic(480, 260, this.pickWord(WORDS.parry), TONE.parry, 66, { big: true });
          this.callout('PARRY!', '#ffffff'); this.doFreeze(0.12); this.doShake(10); this.flashWhite = 0.5; this.impact = 0.1;
          ap('parry');
          void at;
          break;
        }
        case 'interrupt': {
          if (mine) this.pl.go(PSTAG, 0.1, E.out); else this.en.go(ESTAG, 0.1, E.out);
          this.sparks(480, 250, 12, '#ffd60a', 260); this.comic(480, 250, this.pickWord(WORDS.interrupt), TONE.parry, 56); this.callout('INTERRUPTED!', '#ffd60a'); this.doFreeze(0.06); this.doShake(5);
          ap('block');
          break;
        }
        case 'feintOpen': {
          if (mine) { this.en.go(EDIZ, 0.15, E.out); this.eF.dizzy = true; this.ring(eBuck.x, eBuck.y, '#ffd60a', 60); }
          else { this.pF.open = true; this.cam.roll += 6; this.ring(pBuck.x, pBuck.y, '#ffd60a', 60); }
          this.comic(mine ? eBuck.x : 480, mine ? eBuck.y - 20 : 300, this.pickWord(WORDS.open), TONE.open, 54);
          this.callout(mine ? 'OPEN!' : 'YOU\'RE OPEN!', '#ffd60a'); this.doShake(4);
          ap('feint');
          break;
        }
        case 'rest': if (mine) { this.floatText(480, 420, 'breathe', '#7dffb0', 22); } break;
        default: break;
      }
    }

    async ko(winner, isKo) {
      this.busy = true;
      if (isKo) {
        this.slowmo = 0.9; this.impact = 0.2; this.doShake(18); this.eF.swinging = this.pF.swinging = false;
        BD.Audio && BD.Audio.sfx('ko');
        if (winner === 'a') {
          const P = this.puppet(), c = this.enemyContact(1);
          this.eF.collapsed = true; this.en.go(EKO, 0.8, E.in); this.pl.go(PWIN, 0.5, E.out);
          this.spray(c.x, c.y, 60, 1.3); this.chunks(c.x, c.y, 16); this.pool += 40; void P;
          this.comic(c.x, c.y - 10, 'KA-BOOM!!', TONE.heavy, 112, { big: true });
          await this.wait(0.6);
        } else {
          this.comic(480, 280, 'THUD...', TONE.parry, 90, { big: true });
          this.cam.rollT = 24; this.cam.dyT = 150; this.pl.go(PKO, 0.8, E.in); this.koFade = 0.001;
          await this.wait(0.6);
        }
        await this.banner('K.O.!', '', 1.3);
      } else {
        await this.banner('TIME!', '', 1.2);
      }
    }

    // ---------- drawing ----------
    font(size, neon) { return (neon ? '800 ' : '900 ') + size + 'px ' + (neon ? 'Orbitron, "Trebuchet MS", "Segoe UI", sans-serif' : 'Bangers, Impact, "Arial Black", sans-serif'); }

    softAmt() { return clamp((this.dmg.a - 0.45) * 1.3, 0, 0.8) + (this.pF.open ? 0.4 : 0) + this.koFade * 0.6; }

    draw() {
      const ctx = this.ctx, w = this.wctx, neon = this.neon, cam = this.cam;
      if (this.koFade > 0) this.koFade = Math.min(0.85, this.koFade + 0.01);
      // 1) the world (with camera) on a separate canvas
      w.save(); w.clearRect(0, 0, W, H);
      const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
      const wob = this.pF.open ? Math.sin(this.time * 4) * 2 : 0;
      const z = (this.cv.clientWidth < 600 ? 1.12 : 1) * (1 + cam.zoom) * 1.04;
      w.translate(W / 2 + sx, H / 2 + sy + cam.dy); w.rotate((cam.roll + wob) * D2R); w.scale(z, z); w.translate(-W / 2, -H / 2);
      const sil = !neon && this.impact > 0;
      if (sil) this.drawImpactBg(w); else { this.drawBg(w); w.drawImage(this.decal, 0, 0); this.drawPool(w); }
      const st = { neon, sil };
      this.drawShadow(w); this.drawPuppet(w, st);
      this.drawTrail(w, this.trailE, this.eColor, neon);
      this.drawParts(w, neon);
      this.drawTrail(w, this.trailP, this.pColor, neon);
      this.drawPlayer(w, st);
      w.restore();
      // 2) compositing: directional motion blur, radial zoom blur, blurred vision
      this.compose(ctx, neon);
      this.drawLens(ctx, neon);
      this.drawVignette(ctx);
      if (this.speedLines > 0) this.drawSpeedLines(ctx, neon);
      this.drawComic(ctx, neon);
      if (this.flashWhite > 0) { ctx.globalAlpha = Math.min(1, this.flashWhite) * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (this.flashRed > 0) { ctx.globalAlpha = Math.min(1, this.flashRed) * 0.55; ctx.fillStyle = '#c1121f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      this.drawHud(ctx, neon); this.drawTimer(ctx, neon); this.drawTexts(ctx, neon);
    }
    compose(ctx, neon) {
      const wc = this.wcv, f = this.fx;
      ctx.clearRect(0, 0, W, H); ctx.drawImage(wc, 0, 0);
      if (f.mb > 0.05) { const len = 34 * f.mb; ctx.globalAlpha = 0.17; for (let j = -3; j <= 3; j++) if (j) ctx.drawImage(wc, (j / 3) * len * f.dx, (j / 3) * len * f.dy); ctx.globalAlpha = 1; }
      if (f.rad > 0.05) { ctx.globalAlpha = 0.15; for (let j = 1; j <= 4; j++) { const s = 1 + j * 0.022 * f.rad; ctx.drawImage(wc, (W / 2) * (1 - s), (H / 2) * (1 - s), W * s, H * s); } ctx.globalAlpha = 1; }
      const soft = this.softAmt();
      if (soft > 0.05) { const o = soft * 4; ctx.globalAlpha = 0.22; [[-o, 0], [o, 0], [0, -o], [0, o]].forEach(([x, y]) => ctx.drawImage(wc, x, y)); ctx.globalAlpha = 1; }
      if (neon && this.impact > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22; ctx.drawImage(wc, 7, 0); ctx.drawImage(wc, -7, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; this.drawGlitch(ctx); }
    }
    drawComic(ctx, neon) {
      // halftone (Ben-Day) dots that shrink away from the impact point
      this.dots.forEach((d) => {
        const k = d.t / d.dur, R = d.r * (0.55 + 0.55 * k);
        ctx.save(); ctx.globalAlpha = (1 - k) * d.alpha; ctx.fillStyle = d.col; if (neon) ctx.globalCompositeOperation = 'lighter';
        for (let gy = -R; gy <= R; gy += d.step) for (let gx = -R; gx <= R; gx += d.step) {
          const px = gx + (Math.round(gy / d.step) & 1 ? d.step / 2 : 0), dist = Math.hypot(px, gy); if (dist > R) continue;
          const rad = (1 - dist / R) * d.step * 0.5; if (rad < 0.8) continue;
          ctx.beginPath(); ctx.arc(d.x + px, d.y + gy, rad, 0, 6.283); ctx.fill();
        }
        ctx.restore();
      });
      // kinetic lines radiating from the impact
      this.kirby.forEach((c) => {
        const k = c.t / c.dur, r0 = c.r0 * (0.9 + 0.5 * k), L = c.len * (1 - 0.4 * k);
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = neon ? c.tone : '#0b0b0b'; if (neon) ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < c.n; i++) {
          const a = c.base + (i / c.n) * 6.283 + Math.sin(i * 12.9) * 0.12, nx = -Math.sin(a), ny = Math.cos(a), w = 7 + (i % 3) * 3;
          ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r0 + nx * w, c.y + Math.sin(a) * r0 + ny * w); ctx.lineTo(c.x + Math.cos(a) * (r0 + L * (0.7 + 0.3 * ((i * 7) % 3) / 2)), c.y + Math.sin(a) * (r0 + L * (0.7 + 0.3 * ((i * 7) % 3) / 2)));
          ctx.lineTo(c.x + Math.cos(a) * r0 - nx * w, c.y + Math.sin(a) * r0 - ny * w); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
      // starburst + sound effect word
      this.comics.forEach((c) => {
        const k = c.t / c.dur, sc = k < 0.16 ? E.back(k / 0.16) * 1.18 : 1.18 - Math.min(0.18, (k - 0.16) * 0.5) + Math.sin(c.t * 32) * 0.012 * (1 - k), al = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
        const star = (r) => { ctx.beginPath(); for (let i = 0; i < c.n * 2; i++) { const a = (i / (c.n * 2)) * 6.283, rr = r * (i % 2 ? 0.66 : c.jit[i >> 1]); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.82); } ctx.closePath(); };
        ctx.save(); ctx.translate(c.x + rnd(-2, 2) * (1 - k), c.y + rnd(-2, 2) * (1 - k)); ctx.rotate(c.rot); ctx.scale(sc, sc); ctx.globalAlpha = al; ctx.lineJoin = 'round';
        ctx.fillStyle = '#0b0b0b'; ctx.save(); ctx.translate(6, 7); star(c.R * 1.04); ctx.fill(); ctx.restore();
        if (neon) { ctx.shadowColor = c.tone; ctx.shadowBlur = 26; }
        ctx.fillStyle = c.tone; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 7; star(c.R); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; star(c.R * 0.74); ctx.fill();
        ctx.font = '400 ' + c.size + 'px Bangers, Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0b0b0b'; ctx.fillText(c.word, 5, 6); ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = c.size * 0.26; ctx.strokeText(c.word, 0, 0);
        ctx.fillStyle = '#fff'; ctx.fillText(c.word, 0, 0);
        ctx.restore();
      });
    }
    drawSpeedLines(ctx, neon) {
      const a = Math.min(1, this.speedLines * 3);
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = neon ? 'rgba(25,230,255,' + 0.85 * a + ')' : 'rgba(255,255,255,' + 0.9 * a + ')';
      for (let i = 0; i < 30; i++) { const ang = Math.random() * 6.283, r0 = rnd(300, 380), r1 = r0 + rnd(160, 320); ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(ang) * r0, H / 2 + Math.sin(ang) * r0 * 0.75); ctx.lineTo(W / 2 + Math.cos(ang) * r1, H / 2 + Math.sin(ang) * r1 * 0.75); ctx.stroke(); }
      ctx.restore();
    }
    // 3 s bar: the sooner you pick, the more power
    drawTimer(ctx, neon) {
      const t = this.timer; if (!t) return;
      const c = this.cv.clientWidth < 600, bw = c ? 520 : 400, bh = c ? 30 : 20, x = W / 2 - bw / 2, y = c ? 92 : 74;
      const col = t.frac > 0.55 ? '#2fd46b' : t.frac > 0.25 ? '#ffb020' : '#ff3b3b';
      ctx.save();
      ctx.fillStyle = 'rgba(8,4,16,.85)'; ctx.strokeStyle = neon ? col : '#0b0b0b'; ctx.lineWidth = neon ? 2 : 5;
      roundRect(ctx, x, y, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; if (neon) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      roundRect(ctx, x + 3, y + 3, Math.max(0, (bw - 6) * t.frac), bh - 6, 4); ctx.fill(); ctx.shadowBlur = 0;
      ctx.textAlign = 'center'; ctx.font = this.font(c ? 22 : 14, neon); ctx.lineJoin = 'round';
      const label = 'POWER ×' + t.power.toFixed(2) + (t.frac < 0.25 ? '  NOW!' : '');
      ctx.lineWidth = 5; ctx.strokeStyle = '#0b0b0b'; ctx.strokeText(label, W / 2, y + bh / 2 + (c ? 8 : 5)); ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, y + bh / 2 + (c ? 8 : 5));
      ctx.restore();
    }

    drawBg(ctx) {
      if (!this.bg[this.theme]) this.bg[this.theme] = this.neon ? this.makeNeonBg() : this.makePrimalBg();
      ctx.drawImage(this.bg[this.theme], 0, 0);
      const t = this.time;
      if (!this.neon) {
        [[120, 130], [840, 130]].forEach(([x, y]) => {
          const f = Math.sin(t * 9 + x) * 6, g = Math.sin(t * 7 + x * 2) * 4;
          ctx.fillStyle = '#ff8c00'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.quadraticCurveTo(x - 24, y - 30 - f, x + g, y - 62 - f * 2); ctx.quadraticCurveTo(x + 24, y - 30 + f, x + 20, y); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.quadraticCurveTo(x - 12, y - 18, x + g * 0.5, y - 36 - f); ctx.quadraticCurveTo(x + 12, y - 18, x + 10, y); ctx.closePath(); ctx.fill();
        });
      } else {
        ctx.globalAlpha = 0.07 + Math.sin(t * 2) * 0.03; ctx.fillStyle = '#ff2d95'; ctx.fillRect(0, 0, W, WALL); ctx.globalAlpha = 1;
      }
    }
    makeNeonBg() {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      let gr = g.createLinearGradient(0, 0, 0, WALL); gr.addColorStop(0, '#05020c'); gr.addColorStop(1, '#1c0740'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) { g.strokeStyle = '#2d1170'; g.lineWidth = 2; g.strokeRect(36 + i * 132, 24, 92, 150); }
      g.shadowColor = '#ff2d95'; g.shadowBlur = 26; g.strokeStyle = '#ff2d95'; g.lineWidth = 5; g.beginPath(); g.arc(480, 160, 126, 0, 6.283); g.stroke();
      g.shadowColor = '#19e6ff'; g.strokeStyle = '#19e6ff'; g.lineWidth = 2; g.beginPath(); g.arc(480, 160, 94, 0, 6.283); g.stroke();
      g.lineWidth = 6; [70, 890].forEach((x) => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WALL); g.stroke(); });
      g.shadowBlur = 0;
      gr = g.createLinearGradient(0, WALL, 0, H); gr.addColorStop(0, '#220845'); gr.addColorStop(1, '#04030a'); g.fillStyle = gr; g.fillRect(0, WALL, W, H - WALL);
      g.save(); g.beginPath(); g.rect(0, WALL, W, H - WALL); g.clip(); g.strokeStyle = '#ff2d95'; g.lineWidth = 1.5; g.shadowColor = '#ff2d95'; g.shadowBlur = 6;
      for (let i = -18; i <= 18; i++) { g.beginPath(); g.moveTo(480, HZ); g.lineTo(480 + i * 210, H); g.stroke(); }
      for (let k = 1; k < 11; k++) { const y = HZ + Math.pow(k / 10, 1.9) * (H - HZ); g.globalAlpha = 0.25 + (k / 10) * 0.6; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.restore();
      const sp = g.createRadialGradient(480, 420, 10, 480, 420, 230); sp.addColorStop(0, 'rgba(25,230,255,.22)'); sp.addColorStop(1, 'rgba(25,230,255,0)'); g.fillStyle = sp; g.fillRect(0, WALL, W, H - WALL);
      g.strokeStyle = '#ff2d95'; g.lineWidth = 2; g.shadowColor = '#ff2d95'; g.shadowBlur = 12; g.beginPath(); g.moveTo(0, WALL); g.lineTo(W, WALL); g.stroke();
      return c;
    }
    makePrimalBg() {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#7a4a32'; g.fillRect(0, 0, W, WALL);
      g.fillStyle = '#5c3322'; g.fillRect(0, 0, W, 60);
      g.strokeStyle = '#0b0b0b'; g.lineWidth = 4;
      for (let r = 0; r * 41 < WALL; r++) { const y = r * 41; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (r % 2) * 45; x < W; x += 90) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 41); g.stroke(); } }
      g.fillStyle = '#1a0d08'; g.beginPath(); g.moveTo(370, WALL); g.lineTo(370, 90); g.quadraticCurveTo(480, -10, 590, 90); g.lineTo(590, WALL); g.closePath(); g.fill(); g.lineWidth = 6; g.stroke();
      g.fillStyle = '#d9a566'; g.fillRect(0, WALL, W, H - WALL);
      g.fillStyle = '#c28c52'; g.beginPath(); g.ellipse(480, 420, 380, 90, 0, 0, 6.283); g.fill();
      g.strokeStyle = '#0b0b0b'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, WALL); g.lineTo(W, WALL); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(11,11,11,.55)';
      for (let i = -9; i <= 9; i++) { g.beginPath(); g.moveTo(480 + i * 11, WALL); g.lineTo(480 + i * 230, H); g.stroke(); }
      g.fillStyle = '#000'; for (let i = 0; i < 900; i++) { g.globalAlpha = 0.05 + Math.random() * 0.06; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      return c;
    }
    drawImpactBg(ctx) {
      ctx.fillStyle = '#d62828'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
      for (let i = 0; i < 46; i++) { const a = (i / 46) * 6.283 + this.time * 0.3, r0 = 150 + Math.random() * 120; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, 250 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * 700, 250 + Math.sin(a) * 700); ctx.stroke(); }
    }
    drawGlitch(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const y = Math.random() * H, h = 4 + Math.random() * 18; ctx.globalAlpha = 0.35; ctx.drawImage(this.wcv, 0, y, W, h, (Math.random() - 0.5) * 40, y, W, h); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    drawVignette(ctx) {
      if (!this.bg.vig) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const r = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = r; g.fillRect(0, 0, W, H); this.bg.vig = c; }
      ctx.drawImage(this.bg.vig, 0, 0);
      const d = this.dmg.a;
      if (d > 0.05) {
        const pulse = d > 0.5 ? (Math.sin(this.time * (4 + d * 6)) * 0.5 + 0.5) * 0.18 : 0;
        const a = clamp(d * 0.85 + pulse, 0, 0.95), r = ctx.createRadialGradient(W / 2, H / 2, 140 + (1 - d) * 160, W / 2, H / 2, 560);
        r.addColorStop(0, 'rgba(120,0,12,0)'); r.addColorStop(1, 'rgba(150,0,16,' + a + ')'); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
        if (d > 0.7) { ctx.fillStyle = 'rgba(40,0,6,' + (d - 0.7) * 0.7 + ')'; ctx.fillRect(0, 0, W, H); }
      }
      if (this.koFade > 0) { ctx.fillStyle = 'rgba(25,0,4,' + this.koFade + ')'; ctx.fillRect(0, 0, W, H); }
    }
    drawShadow(ctx) {
      const P = this.puppet();
      ctx.save(); ctx.globalAlpha = this.neon ? 0.4 : 0.5; ctx.fillStyle = this.neon ? this.eColor : '#000';
      ctx.beginPath(); ctx.ellipse(CX + P.x * 0.9, FEET + (P.sc - 1) * 150 + 6, 70 * P.sc, 12 * P.sc, 0, 0, 6.283); ctx.fill(); ctx.restore();
    }
    drawPool(ctx) {
      if (this.pool <= 0) return;
      const P = this.puppet(), rx = Math.min(190, 20 + this.pool * 1.5), ry = rx * 0.26, y = FEET + (P.sc - 1) * 150 + 12, x = CX + P.x * 0.6;
      ctx.save();
      if (this.neon) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(190,0,40,.4)'; } else ctx.fillStyle = '#7a0d12';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fill();
      if (!this.neon) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.25, ry * 0.18, 0, 0, 6.283); ctx.fill(); }
      ctx.restore();
    }
    drawTrail(ctx, tr, col, neon) {
      if (tr.length < 2) return;
      ctx.save();
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i], k = 1 - b.age / 0.22; if (k <= 0) continue;
        ctx.beginPath(); ctx.moveTo(a.bx, a.by); ctx.lineTo(a.tx, a.ty); ctx.lineTo(b.tx, b.ty); ctx.lineTo(b.bx, b.by); ctx.closePath();
        if (neon) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * k; ctx.fillStyle = col; ctx.fill(); }
        else { ctx.globalAlpha = 0.9 * k; ctx.fillStyle = '#fff6df'; ctx.fill(); ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      ctx.restore();
    }

    // ----- mannequin -----
    drawPuppet(ctx, st) {
      const P = this.puppet(), d = this.dmg.b, neon = st.neon, sil = st.sil;
      const col = this.eF.flash > 0 ? '#ffffff' : this.eColor;
      const skin = shade('#efe0c2', -Math.round(d * 55));
      const wep = this.eWeapon, wlen = WLEN[wep.shape] * 0.5 * P.wl, wthk = WTHK[wep.shape] * 0.5;
      ctx.save(); ctx.translate(CX + P.x, P.fy); ctx.scale(P.sc, P.sc); ctx.rotate(P.rot * D2R);
      // legs
      const hipY = -122 + P.sink;
      [-1, 1].forEach((sd) => {
        const hip = { x: sd * 15, y: hipY }, knee = { x: sd * (21 + P.sink * 0.4), y: hipY * 0.5 }, foot = { x: sd * 25, y: 0 };
        thick(ctx, st, [hip, knee, foot], 15, col, shade(col, -70));
        ctx.beginPath(); ctx.ellipse(foot.x + sd * 4, -2, 17, 8, 0, 0, 6.283); paint(ctx, st, { col, pfill: '#2b2118', pw: 4 });
        ctx.beginPath(); ctx.arc(knee.x, knee.y, 9, 0, 6.283); paint(ctx, st, { col, pfill: skin, pw: 3 });
      });
      ctx.beginPath(); ctx.moveTo(-30, hipY - 8); ctx.lineTo(30, hipY - 8); ctx.lineTo(26, hipY + 16); ctx.lineTo(-26, hipY + 16); ctx.closePath(); paint(ctx, st, { col, pfill: shade(col, -70) });
      this.drawWoundsPart(ctx, st, P, 'legs');
      // upper body (leans over the hips)
      ctx.save(); ctx.translate(0, -110); ctx.rotate(P.lean * D2R); ctx.translate(0, 110);
      // buckler arm
      const S2 = { x: 44, y: -204 }, A2 = ik(S2.x, S2.y, P.bx + 10, P.by + 8, 54, 50, 1);
      thick(ctx, st, [S2, A2.el, A2.hd], 13, col, skin);
      ctx.beginPath(); ctx.arc(P.bx, P.by, 48 * P.bs, 0, 6.283); paint(ctx, st, { col, pfill: this.eF.broken ? '#8a7a66' : '#b9b3a8', w: 3, pw: 5 });
      ctx.beginPath(); ctx.arc(P.bx, P.by, 14 * P.bs, 0, 6.283); paint(ctx, st, { col, pfill: shade(col, -20), pw: 4 });
      if (this.eF.broken && !sil) { ctx.strokeStyle = neon ? '#ff1744' : '#0b0b0b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(P.bx - 30, P.by - 26); ctx.lineTo(P.bx - 4, P.by + 4); ctx.lineTo(P.bx - 18, P.by + 34); ctx.moveTo(P.bx - 4, P.by + 4); ctx.lineTo(P.bx + 30, P.by + 8); ctx.stroke(); }
      // torso
      ctx.beginPath(); ctx.moveTo(-44, -208); ctx.lineTo(44, -208); ctx.lineTo(30, -130); ctx.lineTo(-30, -130); ctx.closePath(); paint(ctx, st, { col, pfill: skin });
      if (!sil) {
        ctx.strokeStyle = neon ? col : '#0b0b0b'; ctx.globalAlpha = neon ? 0.5 : 1; ctx.lineWidth = neon ? 1.5 : 3;
        ctx.beginPath(); ctx.moveTo(0, -208); ctx.lineTo(0, -130); ctx.moveTo(-40, -166); ctx.quadraticCurveTo(0, -150, 40, -166); ctx.stroke(); ctx.globalAlpha = 1;
        if (!neon) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-40, -204); ctx.lineTo(24, -140); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke(); }
      }
      // neck and head
      ctx.beginPath(); ctx.rect(-9, -228, 18, 22); paint(ctx, st, { col, pfill: skin, pw: 4 });
      ctx.save(); ctx.translate(0, -222); ctx.rotate(P.tilt * D2R); ctx.translate(0, 222);
      ctx.beginPath(); ctx.ellipse(0, -254, 23, 29, 0, 0, 6.283); paint(ctx, st, { col, pfill: skin });
      if (!sil) {
        ctx.fillStyle = neon ? col : '#2a1a10'; ctx.globalAlpha = neon ? 0.6 : 0.85;
        ctx.beginPath(); ctx.ellipse(-9, -258, 4.5, 3.2, 0, 0, 6.283); ctx.ellipse(9, -258, 4.5, 3.2, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = neon ? col : '#0b0b0b'; ctx.globalAlpha = neon ? 0.5 : 0.8; ctx.lineWidth = neon ? 1.2 : 2;
        ctx.beginPath(); ctx.moveTo(0, -283); ctx.lineTo(0, -226); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
      // damage cracks
      if (!sil) this.cracks.forEach((c) => {
        if (d < c.th) return;
        ctx.strokeStyle = neon ? '#ff1744' : '#2a1a10'; ctx.lineWidth = neon ? 1.6 : 2.4; ctx.globalAlpha = Math.min(1, (d - c.th) * 5);
        ctx.beginPath(); c.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.globalAlpha = 1;
      });
      this.drawWoundsPart(ctx, st, P, 'up');
      // weapon arm
      const S1 = { x: -44, y: -204 }, A1 = ik(S1.x, S1.y, P.hx, P.hy, 54, 50, -1);
      thick(ctx, st, [S1, A1.el, A1.hd], 13, col, skin);
      weaponShape(ctx, st, wep.shape, A1.hd.x, A1.hd.y, P.w, wlen, wthk, col);
      ctx.beginPath(); ctx.arc(A1.hd.x, A1.hd.y, 10, 0, 6.283); paint(ctx, st, { col, pfill: skin, pw: 4 });
      [[S1.x, S1.y], [S2.x, S2.y], [A1.el.x, A1.el.y], [A2.el.x, A2.el.y]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); paint(ctx, st, { col, pfill: skin, pw: 3 }); });
      if (this.eF.dizzy) this.drawStars(ctx, { x: 0, y: -262 }, neon);
      ctx.restore();
      ctx.restore();
    }
    drawWoundsPart(ctx, st, P, part) {
      const sil = st.sil, neon = st.neon, col = this.bloodCol(sil), dark = neon ? '#5a0016' : '#3d070a';
      this.wounds.forEach((w) => {
        if (w.part !== part) return;
        const s = w.size * Math.min(1, w.age * 3 + 0.35);
        ctx.save(); ctx.translate(w.x, w.y);
        // drip streak
        const len = w.streak;
        if (len > 2) {
          const pts = []; for (let i = 0; i <= 5; i++) pts.push({ x: Math.sin(i * 1.7 + w.x) * 2.2 * (i / 5), y: (len * i) / 5 });
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          if (!neon && !sil) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = w.w + 4; path(ctx, pts); }
          ctx.strokeStyle = col; ctx.lineWidth = w.w; if (neon) { ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 8; } path(ctx, pts); ctx.shadowBlur = 0;
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pts[5].x, pts[5].y + 1, w.w * 0.95, 0, 6.283); ctx.fill();
          if (!neon && !sil) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2; ctx.stroke(); }
        }
        ctx.rotate(w.ang * D2R);
        if (neon) { ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 12; }
        ctx.fillStyle = col; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 3;
        if (w.kind === 'slash') {
          ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.24, s, 0); ctx.quadraticCurveTo(0, s * 0.24, -s, 0); ctx.fill(); if (!neon && !sil) ctx.stroke();
          ctx.shadowBlur = 0; ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.quadraticCurveTo(0, -s * 0.09, s * 0.8, 0); ctx.quadraticCurveTo(0, s * 0.09, -s * 0.8, 0); ctx.fill();
        } else if (w.kind === 'stab') {
          ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 6.283); ctx.fill(); if (!neon && !sil) ctx.stroke();
          ctx.shadowBlur = 0; ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, s * 0.19, 0, 6.283); ctx.fill();
        } else {
          ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, r = s * (i % 2 ? 0.42 : 0.9) * w.jit[i]; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55); } ctx.closePath(); ctx.fill(); if (!neon && !sil) ctx.stroke();
          ctx.shadowBlur = 0; ctx.fillStyle = dark; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, r = s * (i % 2 ? 0.2 : 0.55) * w.jit[i]; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.5); } ctx.closePath(); ctx.fill();
          if (w.hole) { ctx.fillStyle = '#1a0306'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.24, s * 0.13, 0, 0, 6.283); ctx.fill(); }
        }
        ctx.restore();
      });
    }
    drawStars(ctx, head, neon) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + i * 2.1, x = head.x + Math.cos(a) * 30, y = head.y - 36 + Math.sin(a) * 7;
        ctx.fillStyle = neon ? '#ffe14d' : '#fbd34d'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = neon ? 0 : 2; ctx.beginPath();
        for (let j = 0; j < 10; j++) { const rr = j % 2 ? 4 : 9, aa = (j / 10) * 6.283 - 1.57; ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
        ctx.closePath(); ctx.fill(); if (!neon) ctx.stroke();
      }
    }

    // ----- your hands -----
    drawPlayer(ctx, st) {
      const p = this.pl.cur, neon = st.neon, col = this.pColor, wep = this.pWeapon, d = this.dmg.a, t = this.time;
      const tr = d * 4, jx = (Math.random() - 0.5) * tr, jy = (Math.random() - 0.5) * tr;
      const bob = Math.sin(t * 2) * (3 + 3 * this.idleAmp);
      const hx = p.hx + jx + Math.sin(t * 1.6) * 7 * this.idleAmp, hy = p.hy + bob + jy, L = WLEN[wep.shape] * p.ls, th = WTHK[wep.shape];
      const skin = shade('#e8b88a', -Math.round(d * 40)), sleeve = neon ? '#0d0822' : shade(col, -60);
      // left hand + buckler (behind the weapon)
      const bx = p.bx + jx, by = p.by + jy, br = 84 * p.bs;
      capsule(ctx, { x: bx - 40, y: by + 70 }, { x: -60, y: H + 140 }, 110, 160); paint(ctx, st, { nfill: sleeve, col, w: 3, pfill: sleeve });
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); paint(ctx, st, { col, w: 4, pfill: this.pF.broken ? '#8a7a66' : '#c9c3b8', pw: 7 });
      ctx.beginPath(); ctx.arc(bx, by, br * 0.62, 0, 6.283); paint(ctx, st, { col, w: 2, pfill: '#a9a398', pw: 4 });
      ctx.beginPath(); ctx.arc(bx, by, br * 0.2, 0, 6.283); paint(ctx, st, { col, w: 3, pfill: shade(col, -10), pw: 5 });
      if (this.pF.broken && !st.sil) { ctx.strokeStyle = neon ? '#ff1744' : '#0b0b0b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx - br * 0.7, by - br * 0.5); ctx.lineTo(bx - br * 0.1, by + 6); ctx.lineTo(bx - br * 0.4, by + br * 0.7); ctx.moveTo(bx - br * 0.1, by + 6); ctx.lineTo(bx + br * 0.7, by + br * 0.1); ctx.stroke(); }
      // weapon and right hand
      weaponShape(ctx, st, wep.shape, hx, hy, p.a, L, th, col);
      const vx = 1020 - hx, vy = 640 - hy, vd = Math.hypot(vx, vy) || 1;
      capsule(ctx, { x: hx + (vx / vd) * 20, y: hy + (vy / vd) * 20 }, { x: 1020, y: 640 }, 76, 150); paint(ctx, st, { nfill: sleeve, col, w: 3, pfill: sleeve });
      ctx.beginPath(); ctx.arc(hx, hy, 38, 0, 6.283); paint(ctx, st, { col, w: 3, pfill: skin });
      if (!st.sil) { ctx.strokeStyle = neon ? col : '#0b0b0b'; ctx.lineWidth = neon ? 1.5 : 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(hx + i * 2, hy + 8 + i * 12, 22, 3.6, 5.6); ctx.stroke(); } }
    }

    // ----- particles, lens, text, HUD -----
    drawParts(ctx, neon) {
      this.parts.forEach((p) => {
        const k = clamp(p.life / (p.max || 1), 0, 1);
        ctx.save();
        if (p.type === 'drop') {
          const r = p.r * (1 + p.z / 300), sil = !neon && this.impact > 0;
          ctx.fillStyle = this.bloodCol(sil); ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 1.5;
          if (neon) { ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 6; }
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 2.4); ctx.quadraticCurveTo(p.x + r, p.y - r * 0.4, p.x, p.y + r); ctx.quadraticCurveTo(p.x - r, p.y - r * 0.4, p.x, p.y - r * 2.4); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill(); if (!neon && !sil) ctx.stroke();
        } else if (p.type === 'chunk') {
          ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = neon ? '#ff1744' : '#8a1018'; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-p.r, -p.r * 0.6); ctx.lineTo(p.r, -p.r * 0.2); ctx.lineTo(p.r * 0.4, p.r); ctx.lineTo(-p.r * 0.8, p.r * 0.6); ctx.closePath(); ctx.fill(); if (!neon) ctx.stroke();
        } else {
          if (neon) ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k;
          if (p.type === 'spark') { ctx.strokeStyle = neon ? p.col : (k > 0.5 ? '#fff6df' : p.col); ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); }
          else if (p.type === 'ring') {
            if (!neon) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = p.size * k + 5; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.r), 0, 6.283); ctx.stroke(); }
            ctx.strokeStyle = p.col; ctx.lineWidth = p.size * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.r), 0, 6.283); ctx.stroke();
          } else if (p.type === 'shard') {
            ctx.translate(p.x, p.y); ctx.rotate(p.rot + (p.max - p.life) * 6); ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.moveTo(-p.size, -p.size / 2); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size / 3, p.size / 1.5); ctx.closePath(); ctx.fill(); if (!neon) { ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 2; ctx.stroke(); }
          }
        }
        ctx.restore();
      });
    }
    drawLens(ctx, neon) {
      const fill = neon ? 'rgba(255,23,68,.82)' : '#9d141b';
      this.slits.forEach((s) => {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang); const L = s.len * Math.min(1, s.age * 8 + 0.3), w = s.w;
        if (neon) { ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 16; }
        ctx.fillStyle = fill; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -w * 2, L, 0); ctx.quadraticCurveTo(0, w * 2, -L, 0); ctx.fill(); if (!neon) ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = '#2a0408'; ctx.beginPath(); ctx.moveTo(-L * 0.9, 0); ctx.quadraticCurveTo(0, -w * 0.7, L * 0.9, 0); ctx.quadraticCurveTo(0, w * 0.7, -L * 0.9, 0); ctx.fill();
        ctx.restore();
      });
      this.lens.forEach((l) => {
        const a = clamp((l.life - l.age) / 3, 0, 1);
        ctx.save(); ctx.globalAlpha = a;
        if (l.y - l.y0 > 2) { ctx.fillStyle = fill; ctx.fillRect(l.x - l.r * 0.22, l.y0, l.r * 0.44, l.y - l.y0); }
        if (neon) { ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 10; }
        ctx.fillStyle = fill; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 3;
        const blobs = [{ dx: 0, dy: 0, r: l.r }].concat(l.bl);
        blobs.forEach((b) => { ctx.beginPath(); ctx.arc(l.x + b.dx, l.y + b.dy, b.r, 0, 6.283); ctx.fill(); if (!neon) ctx.stroke(); });
        blobs.forEach((b) => { ctx.beginPath(); ctx.arc(l.x + b.dx, l.y + b.dy, b.r, 0, 6.283); ctx.fill(); });
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(l.x - l.r * 0.3, l.y - l.r * 0.35, l.r * 0.22, l.r * 0.12, -0.6, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(l.x, l.y + l.r * 0.9, l.r * 0.42, 0, 6.283); ctx.fillStyle = fill; ctx.fill();
        ctx.restore();
      });
    }
    drawTexts(ctx, neon) {
      this.texts.forEach((t) => {
        const k = clamp(t.life / t.max, 0, 1);
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 2.2); ctx.textAlign = 'center'; ctx.font = this.font(t.size, neon);
        ctx.lineWidth = 7; ctx.strokeStyle = '#0b0b0b'; ctx.lineJoin = 'round'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = '#fff'; ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });
      this.callouts.forEach((c, ci) => {
        const k = c.t / c.dur, sc = k < 0.15 ? E.back(k / 0.15) : 1, al = k > 0.75 ? 1 - (k - 0.75) * 4 : 1;
        ctx.save(); ctx.translate(W / 2, 488 - ci * 66); ctx.scale(sc, sc); ctx.rotate(neon ? 0 : -0.04); ctx.globalAlpha = al; ctx.textAlign = 'center'; ctx.font = this.font(42, neon); ctx.lineJoin = 'round';
        const tw = ctx.measureText(c.text).width;
        ctx.fillStyle = 'rgba(8,4,16,.88)'; ctx.strokeStyle = c.col === '#ffffff' ? '#e8e8e8' : c.col; ctx.lineWidth = 5;
        if (neon) { ctx.shadowColor = c.col; ctx.shadowBlur = 18; }
        roundRect(ctx, -tw / 2 - 24, -44, tw + 48, 62, 10); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.lineWidth = 8; ctx.strokeStyle = '#0b0b0b'; ctx.strokeText(c.text, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(c.text, 0, 0);
        ctx.restore();
      });
      this.banners.forEach((b) => {
        const k = b.t / b.dur, sc = k < 0.18 ? E.back(k / 0.18) : 1 + (k - 0.18) * 0.06, al = k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1;
        ctx.save(); ctx.translate(W / 2, H / 2 - 20); ctx.scale(sc, sc); ctx.globalAlpha = al; ctx.textAlign = 'center'; ctx.font = this.font(96, neon);
        if (neon) { ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 30; ctx.fillStyle = '#fff'; ctx.fillText(b.text, 0, 0); ctx.shadowColor = '#19e6ff'; ctx.shadowBlur = 50; ctx.globalAlpha = al * 0.5; ctx.fillText(b.text, 0, 0); }
        else { ctx.rotate(-0.06); ctx.lineWidth = 18; ctx.strokeStyle = '#0b0b0b'; ctx.lineJoin = 'round'; ctx.strokeText(b.text, 0, 0); ctx.fillStyle = '#fff6df'; ctx.fillText(b.text, 0, 0); }
        ctx.restore();
      });
    }
    // HUD without health bars: name, body condition, streak and rounds won
    drawHud(ctx, neon) {
      const c = this.cv.clientWidth < 600, f = (n) => this.font(c ? n * 1.55 : n, neon);
      const side = (k, x, al) => {
        const h = this.hud[k], cond = condition(1 - this.dmg[k]), y = c ? 34 : 30;
        ctx.save(); ctx.textAlign = al;
        ctx.font = f(17); const nm = (k === 'a' ? 'YOU' : h.name.toUpperCase());
        if (neon) { ctx.shadowColor = k === 'a' ? this.pColor : this.eColor; ctx.shadowBlur = 10; ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y); ctx.shadowBlur = 0; }
        else { ctx.lineWidth = 5; ctx.strokeStyle = '#0b0b0b'; ctx.lineJoin = 'round'; ctx.strokeText(nm, x, y); ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y); }
        ctx.font = f(13); const y2 = y + (c ? 26 : 20);
        pill(ctx, cond.text, x, y2, al, cond.col, c);
        if (h.open) pill(ctx, 'OPEN!', x, y2 + (c ? 30 : 23), al, '#ffd60a', c);
        // streak and rounds
        const dir = al === 'left' ? 1 : -1, py = c ? 14 : 12;
        for (let i = 0; i < 3; i++) { const px = x + dir * (i * (c ? 22 : 16) + 6) + (dir > 0 ? 0 : 0); ctx.beginPath(); ctx.arc(px, py, c ? 8 : 5.5, 0, 6.283); ctx.fillStyle = i < h.chain ? '#ffd60a' : 'rgba(255,255,255,.14)'; ctx.fill(); ctx.strokeStyle = neon ? '#ffd60a' : '#0b0b0b'; ctx.lineWidth = neon ? 1 : 2.5; ctx.stroke(); }
        ctx.restore();
        const cx0 = W / 2 + (k === 'a' ? -1 : 1) * 36;
        for (let i = 0; i < 2; i++) { const px = cx0 + (k === 'a' ? -1 : 1) * i * (c ? 24 : 18); ctx.beginPath(); ctx.arc(px, c ? 76 : 62, c ? 9 : 6.5, 0, 6.283); ctx.fillStyle = i < h.wins ? '#ffd60a' : 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = neon ? '#ffd60a' : '#0b0b0b'; ctx.lineWidth = neon ? 1.5 : 3; ctx.stroke(); }
      };
      side('a', 20, 'left'); side('b', W - 20, 'right');
      ctx.save(); ctx.textAlign = 'center'; ctx.font = f(18);
      const label = (c ? 'R' : 'ROUND ') + this.hud.round;
      if (neon) { ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff'; } else { ctx.lineWidth = 5; ctx.strokeStyle = '#0b0b0b'; ctx.strokeText(label, W / 2, c ? 36 : 32); ctx.fillStyle = '#fff'; }
      ctx.fillText(label, W / 2, c ? 36 : 32);
      ctx.font = f(13); ctx.fillStyle = neon ? '#bbb' : '#f2e8cf'; ctx.shadowBlur = 0;
      ctx.fillText((c ? '' : 'TURN ') + Math.min(this.hud.turn + 1, this.hud.limit) + '/' + this.hud.limit, W / 2, c ? 62 : 52);
      ctx.restore();
    }

    // for test screenshots: leaves the mannequin and you at a given damage level
    demo(dEnemy, dPlayer) {
      this.idleAll(); this.dmgT.a = this.dmg.a = dPlayer; this.dmgT.b = this.dmg.b = dEnemy;
      const n = Math.round(dEnemy * 11);
      for (let i = 0; i < n; i++) { const w = this.addWound(i % 3, ['quick', 'heavy', 'thrust'][i % 3], 8 + Math.random() * 14); w.age = 6; w.streak = w.maxStreak * rnd(0.5, 1); }
      for (let i = 0; i < Math.round(dPlayer * 14); i++) this.lensSplat(rnd(80, 880), rnd(60, 450), rnd(5, 24));
      if (dPlayer > 0.4) this.slit(rnd(300, 600), rnd(150, 380), rnd(-0.6, 0.6), 130, 8);
      for (let i = 0; i < n * 3; i++) this.splat(rnd(300, 660), FEET + rnd(-6, 40), rnd(2, 6));
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // colour pill with dark text: readable on any background
  function pill(ctx, text, x, y, al, col, big) {
    ctx.save(); ctx.font = (big ? '800 21px ' : '800 13px ') + 'system-ui, "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width, ph = big ? 26 : 18, px = big ? 12 : 9, x0 = al === 'left' ? x : x - tw - px * 2;
    ctx.fillStyle = col; ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = 3; roundRect(ctx, x0, y - ph + 4, tw + px * 2, ph, ph / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10080c'; ctx.textAlign = 'left'; ctx.fillText(text, x0 + px, y - (big ? 2 : 1)); ctx.restore();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  Object.assign(BD, { Scene, condition, W, H });
})();
