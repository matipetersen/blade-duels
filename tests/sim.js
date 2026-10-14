// node tests/sim.js [duels]   -> rules tests + weapon trait tests + balance simulation
// node tests/balance.js       -> full weapon round-robin
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

// --- weapon traits ---
(function weapons() {
  assert.strictEqual(BD.WEAPON_IDS.length, 16);
  BD.WEAPON_IDS.forEach((id) => { const w = BD.WEAPONS[id]; assert.ok(w.name && w.trait && w.desc && w.shape && w.hp > 0, id); });
  const lost = (s, who) => s[who].maxHp - s[who].hp;
  let s, r;
  // flail: Quick does not cut off the Heavy
  s = fresh('flail', 'katana'); r = BD.step(s, { a: dm('heavy', 1, 1), b: dm('quick', 1, 0) });
  assert.notStrictEqual(r.out.a.kind, 'interrupt');
  s = fresh('katana', 'katana'); r = BD.step(s, { a: dm('heavy', 1, 1), b: dm('quick', 1, 0) });
  assert.strictEqual(r.out.a.kind, 'interrupt');
  // whip / flail: a correct block still leaks some damage; katana leaks none
  const leak = (w) => { const q = fresh(w, 'katana'); BD.step(q, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) }); return lost(q, 'b'); };
  assert.strictEqual(leak('katana'), 0); assert.ok(leak('whip') > 0 && leak('flail') > 0);
  // hammer: guard break drains more stamina than a katana's
  const drain = (w) => { const q = fresh(w, 'katana'); q.b.st = 60; const st0 = q.b.st; BD.step(q, { a: dm('heavy', 1, 1), b: dm('rest', -1, 1) }); return st0 - q.b.st; };
  assert.ok(drain('hammer') > drain('katana') + 5, 'hammer drain ' + drain('hammer') + ' vs ' + drain('katana'));
  // rapier: thrust punishing a feint hits harder than the spear-free baseline
  const pun = (w) => { const q = fresh(w, 'katana'); BD.step(q, { a: dm('thrust', 1, 0), b: dm('feint', 1, 0) }); return lost(q, 'b') / BD.WEAPONS[w].dmg.thrust; };
  assert.ok(pun('rapier') > pun('katana') * 1.25);
  // sai: a blocked Quick after ONE move is already a parry
  s = fresh('sai', 'katana'); s.a.chain = [{ type: 'quick', zone: 0 }];
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) }); assert.strictEqual(r.out.a.kind, 'parry');
  s = fresh('katana', 'katana'); s.a.chain = [{ type: 'quick', zone: 0 }];
  r = BD.step(s, { a: dm('quick', 1, 0), b: dm('rest', -1, 1) }); assert.strictEqual(r.out.a.kind, 'block');
  // perfect block threshold: a 0.75 block is perfect for a staff, not for a katana
  const perfect = (w) => { const q = fresh('katana', w); q.a.chain = [{ type: 'quick', zone: 0 }]; return BD.step(q, { a: dm('quick', 1, 0), b: { type: 'rest', zone: -1, block: 1, pb: 0.75 } }).out.a.perfect; };
  assert.strictEqual(perfect('staff'), true); assert.strictEqual(perfect('katana'), false);
  // scythe hits low harder than high; halberd the opposite
  const zone = (w, z) => { const q = fresh(w, 'katana'); BD.step(q, { a: dm('quick', z, 2 - z), b: dm('rest', -1, z === 1 ? 0 : 1) }); return lost(q, 'b'); };
  assert.ok(zone('scythe', 2) > zone('scythe', 0)); assert.ok(zone('halberd', 0) > zone('halberd', 2));
  // sword & board: free blocks and less damage taken
  s = fresh('gladius', 'katana'); s.a.st = 50; BD.step(s, { a: dm('rest', -1, 1), b: dm('rest', -1, 1) });
  const t = fresh('katana', 'katana'); t.a.st = 50; BD.step(t, { a: dm('rest', -1, 1), b: dm('rest', -1, 1) });
  assert.ok(s.a.st > t.a.st);
  // staff recovers extra stamina on rest
  s = fresh('staff', 'katana'); s.a.st = 40; t.a.st = 40; BD.step(s, { a: dm('rest', -1, 1), b: dm('rest', -1, 1) });
  const u = fresh('katana', 'katana'); u.a.st = 40; BD.step(u, { a: dm('rest', -1, 1), b: dm('rest', -1, 1) });
  assert.ok(s.a.st > u.a.st + 5);
  // nunchaku: combos hit harder than the same combo with a katana (per unit of base damage)
  const combo = (w) => { const q = fresh(w, 'katana'); BD.step(q, { a: dm('quick', 0, 0), b: dm('rest', -1, 0) }); const h0 = q.b.hp; BD.step(q, { a: dm('quick', 1, 0), b: dm('rest', -1, 2) }); return (h0 - q.b.hp) / BD.WEAPONS[w].dmg.quick; };
  assert.ok(combo('nunchaku') > combo('katana'));
  // every weapon only ever produces legal bot moves in a full duel against another one
  BD.WEAPON_IDS.forEach((id, i) => { const o = BD.WEAPON_IDS[(i + 5) % BD.WEAPON_IDS.length]; const r2 = duel(id, 2, 'balanced', o, 2, 'balanced', 77 + i); assert.ok(r2.rounds >= 2); });
  console.log('weapons OK');
})();

const N = +process.argv[2] || 40;
const t0 = Date.now();
batch('level 5 vs level 1', 'katana', 5, 'balanced', 'katana', 1, 'balanced', N);
batch('level 3 vs level 1', 'katana', 3, 'balanced', 'katana', 1, 'balanced', N);
batch('level 3 vs level 3 (mirror)', 'katana', 3, 'balanced', 'katana', 3, 'balanced', N);
['dagger', 'spear', 'axe', 'rapier', 'greatsword', 'whip'].forEach((w) => batch(`katana vs ${w} (level 3)`, 'katana', 3, 'balanced', w, 3, 'balanced', N));
batch('spear vs axe (level 3)', 'spear', 3, 'balanced', 'axe', 3, 'balanced', N);
batch('dagger vs axe (level 3)', 'dagger', 3, 'balanced', 'axe', 3, 'balanced', N);
['aggressive', 'turtle', 'trickster', 'brute', 'duelist'].forEach((p) => batch(`${p} vs balanced (level 4)`, 'katana', 4, p, 'katana', 4, 'balanced', N));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
