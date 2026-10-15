// node tests/shields.js [duels per pairing]  -> shield round-robin (mirror weapon, level 3 balanced bots)
const BD = require('../core.js');
require('../ai.js');

const WEAPONS = ['katana', 'spear', 'axe', 'dagger', 'rapier', 'flail'];
function duel(wp, sa, sb, seed) {
  const rng = BD.mulberry32(seed);
  const mk = (s) => BD.makeFighter({ name: s, weapon: wp, shield: s, level: 3, persona: 'balanced', color: '#fff' });
  const A = mk(sa), B = mk(sb);
  const brA = BD.makeBrain(3, 'balanced', rng), brB = BD.makeBrain(3, 'balanced', rng);
  const wins = { a: 0, b: 0 };
  while (wins.a < 2 && wins.b < 2) {
    const s = BD.newDuel(A, B);
    for (;;) {
      const ma = BD.decide(brA, s, 'a'), mb = BD.decide(brB, s, 'b');
      ma.pa = ma.pb = BD.botSpeed(3, rng); mb.pa = mb.pb = BD.botSpeed(3, rng);
      BD.observe(brA, mb); BD.observe(brB, ma);
      BD.step(s, { a: ma, b: mb });
      const ro = BD.roundOver(s);
      if (ro.over) { wins[ro.winner]++; break; }
    }
  }
  return wins.a > wins.b;
}

const N = +process.argv[2] || 8;
const tot = {};
BD.SHIELD_IDS.forEach((s) => { tot[s] = { w: 0, n: 0 }; });
WEAPONS.forEach((wp) => BD.SHIELD_IDS.forEach((sa, i) => BD.SHIELD_IDS.forEach((sb, j) => {
  if (i >= j) return;
  for (let k = 0; k < N; k++) {
    const a = k % 2 === 0, w = a ? duel(wp, sa, sb, 500 + k) : !duel(wp, sb, sa, 900 + k);
    tot[sa].n++; tot[sb].n++; if (w) tot[sa].w++; else tot[sb].w++;
  }
})));
Object.keys(tot).sort((a, b) => tot[b].w / tot[b].n - tot[a].w / tot[a].n)
  .forEach((s) => console.log(s.padEnd(8), (100 * tot[s].w / tot[s].n).toFixed(0).padStart(3) + '%', `(${tot[s].w}/${tot[s].n})`));
