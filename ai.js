/* Blade Duels - bot.
 * No cheating: it cannot see your move. It learns your habits (a frequency model
 * conditioned on your previous move), samples what you might do and scores each
 * candidate by simulating the turn with the SAME step() the game uses.
 */
(function () {
  const BD = (globalThis.BD = globalThis.BD || {});

  const PERSONAS = {
    balanced: { dealt: 1, taken: 1, bias: {} },
    aggressive: { dealt: 1.15, taken: 0.9, bias: { heavy: 1, rest: -2 } },
    turtle: { dealt: 0.85, taken: 1.35, bias: { rest: 1.5, feint: 1 } },
    trickster: { dealt: 1, taken: 1, bias: { feint: 3, quick: 1 } },
    brute: { dealt: 1.15, taken: 0.9, bias: { heavy: 3 } },
    duelist: { dealt: 1.05, taken: 1.05, bias: { thrust: 2, quick: 1 } },
  };
  const EPS = [0.3, 0.2, 0.1, 0.05, 0.02];
  const TEMP = [6, 4, 2.5, 1.5, 0.8];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // bot decision speed by level (noisy so it is never constant)
  const BOT_SPEED = [0.3, 0.42, 0.55, 0.68, 0.8];
  function botSpeed(level, rng) {
    const r = rng || Math.random;
    return Math.max(0.05, Math.min(0.98, BOT_SPEED[Math.max(1, Math.min(5, level)) - 1] + (r() + r() - 1) * 0.2));
  }

  function emptyCounts() {
    return { zone: [0, 0, 0], block: [0, 0, 0], type: { quick: 0, heavy: 0, thrust: 0, feint: 0, rest: 0 } };
  }

  function makeBrain(level, persona, rng) {
    return { level: Math.max(1, Math.min(5, level)), persona: PERSONAS[persona] || PERSONAS.balanced, rng: rng || Math.random, cnt: { any: emptyCounts() }, prev: null };
  }

  function ctxKey(m) {
    return m ? m.type + (m.zone >= 0 ? m.zone : '') : null;
  }

  // Records what the rival did this turn.
  function observe(brain, foeMove) {
    const keys = ['any'];
    const ck = ctxKey(brain.prev);
    if (ck) keys.push(ck);
    keys.forEach((k) => {
      const c = brain.cnt[k] || (brain.cnt[k] = emptyCounts());
      if (foeMove.zone >= 0) c.zone[foeMove.zone]++;
      c.block[foeMove.block]++;
      c.type[foeMove.type]++;
    });
    brain.prev = foeMove;
  }

  function dist(brain, field) {
    const any = brain.cnt.any, ctx = brain.cnt[ctxKey(brain.prev)];
    const isArr = Array.isArray(any[field]);
    const keys = isArr ? [0, 1, 2] : Object.keys(any[field]);
    const useModel = brain.level >= 2;
    const p = {};
    let tot = 0;
    keys.forEach((k) => {
      let v = 1; // uniform prior
      if (useModel) {
        v += any[field][k] * 0.5;
        if (ctx && brain.level >= 3) v += ctx[field][k] * 1.5;
      }
      p[k] = v; tot += v;
    });
    keys.forEach((k) => { p[k] /= tot; });
    return p;
  }

  function pick(rng, weights) { // weights: array of [item, w]
    let tot = 0;
    weights.forEach((x) => { tot += x[1]; });
    let r = rng() * tot;
    for (const x of weights) { r -= x[1]; if (r <= 0) return x[0]; }
    return weights[weights.length - 1][0];
  }

  function sampleFoe(brain, foe, pt, pz, pb) {
    const legal = BD.legalAttacks(foe);
    const att = pick(brain.rng, legal.map((m) => [m, m.type === 'rest' ? pt.rest : (pt[m.type] * pz[m.zone] * 3)]));
    const block = pick(brain.rng, [[0, pb[0]], [1, pb[1]], [2, pb[2]]]);
    return { type: att.type, zone: att.zone, block };
  }

  function decide(brain, state, side) {
    const other = side === 'a' ? 'b' : 'a';
    const me = state[side], foe = state[other];
    const lvl = brain.level, pers = brain.persona;
    const pt = dist(brain, 'type'), pz = dist(brain, 'zone'), pb = dist(brain, 'block');
    const N = 5 + 3 * lvl;
    const samples = [];
    for (let i = 0; i < N; i++) samples.push(sampleFoe(brain, foe, pt, pz, pb));

    const cands = [];
    BD.legalAttacks(me).forEach((a) => { for (let b = 0; b < 3; b++) cands.push({ type: a.type, zone: a.zone, block: b }); });

    const scored = cands.map((c) => {
      let tot = 0;
      samples.forEach((fm) => {
        const s = BD.cloneState(state);
        const mv = {}; mv[side] = c; mv[other] = fm;
        const hp0 = [s[side].hp, s[other].hp];
        const r = BD.step(s, mv);
        const myLoss = hp0[0] - s[side].hp, foeLoss = hp0[1] - s[other].hp;
        let v = pers.dealt * foeLoss - pers.taken * myLoss;
        v += 0.1 * (s[side].st - s[other].st);
        if (s[other].open) v += 3;
        if (s[side].open) v -= 3;
        tot += v;
      });
      return { c, v: tot / samples.length + (pers.bias[c.type] || 0) };
    });

    if (brain.rng() < EPS[lvl - 1]) return scored[Math.floor(brain.rng() * scored.length)].c;
    const T = TEMP[lvl - 1];
    const best = Math.max.apply(null, scored.map((x) => x.v));
    return pick(brain.rng, scored.map((x) => [x.c, Math.exp((x.v - best) / T)]));
  }

  // Readable summary of the rival's habits (Hawk Eye perk).
  function readout(brain) {
    const pz = dist(brain, 'zone'), pb = dist(brain, 'block'), pt = dist(brain, 'type');
    const argmax = (o) => Object.keys(o).reduce((a, b) => (o[a] >= o[b] ? a : b));
    const total = brain.cnt.any.block.reduce((a, b) => a + b, 0);
    if (total < 3) return null;
    const z = argmax(pz), b = argmax(pb), t = argmax(pt);
    return { zone: +z, zoneP: pz[z], block: +b, blockP: pb[b], type: t, typeP: pt[t] };
  }

  Object.assign(BD, { PERSONAS, botSpeed, mulberry32, makeBrain, observe, decide, readout });
  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
})();
