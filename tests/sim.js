// node tests/sim.js [duels]   -> rules tests + balance simulation
const assert = require('assert');
const BD = require('../core.js');
require('../ai.js');

const mk = (weapon, level, persona, perks) => BD.makeFighter({ name: weapon, weapon, level, persona, color: '#fff', perks });
const dm = (type, zone, block) => ({ type, zone, block });
const fresh = (wa = 'katana', wb = 'katana') => BD.newDuel(mk(wa), mk(wb));

// --- rules ---
(function rules() {
  let s = fresh();
  // clean hit: Quick High vs Low block
  let r = BD.step(s, { a: dm('quick', 0, 2), b: dm('rest', -1, 2) });
  assert.strictEqual(r.out.a.kind, 'hit');
  assert.strictEqual(s.b.hp, s.b.maxHp - Math.round(8 * 1.2));

  // correct block
  s = fresh();
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) });
  assert.strictEqual(r.out.a.kind, 'block'); assert.strictEqual(s.b.hp, s.b.maxHp);

  // Quick interrupts Heavy
  s = fresh();
  r = BD.step(s, { a: dm('heavy', 1, 1), b: dm('quick', 1, 0) });
  assert.strictEqual(r.out.a.kind, 'interrupt'); assert.strictEqual(r.out.b.kind, 'block');
  assert.strictEqual(s.b.hp, s.b.maxHp);

  // Heavy breaks the guard
  s = fresh();
  r = BD.step(s, { a: dm('heavy', 1, 0), b: dm('rest', -1, 1) });
  assert.strictEqual(r.out.a.kind, 'guardbreak'); assert.ok(s.b.hp < s.b.maxHp && s.b.hp > s.b.maxHp - 12);

  // Feint vs block => open; the next hit ignores the block
  s = fresh();
  r = BD.step(s, { a: dm('feint', 1, 0), b: dm('rest', -1, 1) });
  assert.strictEqual(r.out.a.kind, 'feintOpen'); assert.strictEqual(s.b.open, true);
  const hp = s.b.hp;
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) });
  assert.strictEqual(r.out.a.kind, 'hit'); assert.ok(s.b.hp < hp);

  // Thrust punishes Feint
  s = fresh();
  r = BD.step(s, { a: dm('thrust', 1, 0), b: dm('feint', 1, 1) });
  assert.strictEqual(r.out.a.kind, 'punish'); assert.ok(s.b.hp < s.b.maxHp);

  // the tree narrows with the streak
  s = fresh();
  const n0 = BD.legalAttacks(s.a).length;
  BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) }); // blocked but the chain continues
  assert.strictEqual(s.a.chain.length, 1);
  const n1 = BD.legalAttacks(s.a).length;
  BD.step(s, { a: dm('quick', 0, 0), b: dm('rest', -1, 0) });
  const n2 = BD.legalAttacks(s.a).length;
  assert.ok(n0 > n1 && n1 > n2, `options must shrink: ${n0} ${n1} ${n2}`);

  // parry: streak>=2 blocked with Quick
  s = fresh();
  s.a.chain = [{ type: 'quick', zone: 0 }, { type: 'quick', zone: 1 }];
  r = BD.step(s, { a: dm('heavy', 2, 0), b: dm('rest', -1, 2) });
  assert.strictEqual(r.out.a.kind, 'guardbreak');
  s = fresh();
  s.a.chain = [{ type: 'heavy', zone: 0 }, { type: 'quick', zone: 1 }];
  s.a.st = 100;
  r = BD.step(s, { a: dm('thrust', 2, 0), b: dm('rest', -1, 2) });
  assert.strictEqual(r.out.a.kind, 'parry'); assert.strictEqual(s.a.open, true);

  // combo
  s = fresh();
  BD.step(s, { a: dm('quick', 0, 0), b: dm('rest', -1, 0) });
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 2) });
  assert.strictEqual(r.out.a.kind, 'hit'); assert.strictEqual(r.out.a.combo.name, 'Scissors');

  // the forced finisher resets the chain
  s = fresh();
  s.a.chain = [{ type: 'quick', zone: 0 }, { type: 'quick', zone: 1 }, { type: 'quick', zone: 0 }];
  assert.deepStrictEqual([...new Set(BD.legalAttacks(s.a).map((m) => m.type))].sort(), ['heavy', 'rest', 'thrust']);
  BD.step(s, { a: dm('heavy', 0, 0), b: dm('rest', -1, 2) });
  assert.strictEqual(s.a.chain.length, 0);

  // no stamina => rest only
  s = fresh(); s.a.st = 0;
  assert.deepStrictEqual(BD.legalAttacks(s.a).map((m) => m.type), ['rest']);
  // speed: faster attack hits harder; faster block lets less through; perfect block breaks the streak
  const hit = (pa) => { const q = fresh(); BD.step(q, { a: { type: 'quick', zone: 1, block: 0, pa }, b: dm('rest', -1, 2) }); return q.b.maxHp - q.b.hp; };
  assert.ok(hit(1) > hit(0.4) && hit(0.4) > hit(0), 'faster, more damage: ' + [hit(0), hit(0.4), hit(1)]);
  const gb = (pb) => { const q = fresh(); BD.step(q, { a: dm('heavy', 1, 0), b: { type: 'rest', zone: -1, block: 1, pb } }); return q.b.maxHp - q.b.hp; };
  assert.ok(gb(1) < gb(0.4) && gb(0.4) < gb(0), 'faster block leaks less: ' + [gb(0), gb(0.4), gb(1)]);
  s = fresh(); s.a.chain = [{ type: 'quick', zone: 0 }];
  r = BD.step(s, { a: dm('quick', 1, 0), b: { type: 'rest', zone: -1, block: 1, pb: 0.9 } });
  assert.strictEqual(r.out.a.perfect, true); assert.strictEqual(s.a.chain.length, 0);
  s = fresh(); s.a.chain = [{ type: 'quick', zone: 0 }];
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) });
  assert.strictEqual(r.out.a.perfect, false); assert.strictEqual(s.a.chain.length, 2);
  console.log('rules OK');
})();

// --- simulation ---
function duel(wa, la, pa, wb, lb, pb, seed) {
  const rng = BD.mulberry32(seed);
  const A = mk(wa, la, pa), B = mk(wb, lb, pb);
  const brA = BD.makeBrain(la, pa, rng), brB = BD.makeBrain(lb, pb, rng);
  const wins = { a: 0, b: 0 };
  let turns = 0, rounds = 0, rests = 0, moves = 0;
  while (wins.a < 2 && wins.b < 2) {
    const s = BD.newDuel(A, B);
    for (;;) {
      const ma = BD.decide(brA, s, 'a'), mb = BD.decide(brB, s, 'b');
      if (!BD.isLegal(s.a, ma) || !BD.isLegal(s.b, mb)) throw new Error('illegal move');
      moves += 2; if (ma.type === 'rest') rests++; if (mb.type === 'rest') rests++;
      BD.observe(brA, mb); BD.observe(brB, ma);
      BD.step(s, { a: ma, b: mb });
      turns++;
      const ro = BD.roundOver(s);
      if (ro.over) { wins[ro.winner]++; rounds++; break; }
    }
  }
  return { winner: wins.a > wins.b ? 'a' : 'b', turns, rounds, rests, moves };
}

function batch(label, wa, la, pa, wb, lb, pb, n) {
  let w = 0, turns = 0, rounds = 0, rests = 0, moves = 0;
  for (let i = 0; i < n; i++) {
    const r = duel(wa, la, pa, wb, lb, pb, 1000 + i);
    if (r.winner === 'a') w++;
    turns += r.turns; rounds += r.rounds; rests += r.rests; moves += r.moves;
  }
  console.log(`${label.padEnd(34)} A wins ${(100 * w / n).toFixed(0).padStart(3)}%  turns/round ${(turns / rounds).toFixed(1)}  rests ${(100 * rests / moves).toFixed(0)}%`);
}

const N = +process.argv[2] || 40;
const t0 = Date.now();
batch('level 5 vs level 1', 'katana', 5, 'balanced', 'katana', 1, 'balanced', N);
batch('level 3 vs level 1', 'katana', 3, 'balanced', 'katana', 1, 'balanced', N);
batch('level 3 vs level 3 (mirror)', 'katana', 3, 'balanced', 'katana', 3, 'balanced', N);
['dagger', 'spear', 'axe'].forEach((w) => batch(`katana vs ${w} (level 3)`, 'katana', 3, 'balanced', w, 3, 'balanced', N));
batch('spear vs axe (level 3)', 'spear', 3, 'balanced', 'axe', 3, 'balanced', N);
batch('dagger vs axe (level 3)', 'dagger', 3, 'balanced', 'axe', 3, 'balanced', N);
['aggressive', 'turtle', 'trickster', 'brute', 'duelist'].forEach((p) => batch(`${p} vs balanced (level 4)`, 'katana', 4, p, 'katana', 4, 'balanced', N));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
