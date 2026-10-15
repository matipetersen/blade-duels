/* Blade Duels - duel rules (no graphics, no DOM).
 *
 * Each turn both fighters pick IN SECRET: attack type, attack direction and
 * block direction. Then the picks are revealed and resolved at the same time.
 * step() returns a list of events that the visual layer plays back.
 */
(function () {
  const BD = (globalThis.BD = globalThis.BD || {});

  const ZONES = ['High', 'Mid', 'Low'];
  const ZONE_MULT = [1.2, 1.0, 0.85];
  const TYPES = {
    quick: { name: 'Quick', dmg: 8, cost: 6 },
    heavy: { name: 'Heavy', dmg: 22, cost: 18 },
    thrust: { name: 'Thrust', dmg: 14, cost: 12 },
    feint: { name: 'Feint', dmg: 0, cost: 8 },
    rest: { name: 'Rest', dmg: 0, cost: 0 },
  };
  const TYPE_ORDER = ['quick', 'heavy', 'thrust', 'feint', 'rest'];
  const BLOCK_COST = 3;
  const MAX_CHAIN = 3; // the 4th move of a streak is the forced finisher
  const TURN_LIMIT = 14;
  // Decision speed (0 = ran out of time, 1 = instant). 0.4 is neutral.
  // Attack: x0.8 (slow) to x1.3 (instant). Block: scales the punishment that leaks through
  // (guard break, thrust) from x1.4 (slow) to x0.4; at >= 0.8 it is a perfect block.
  const NEUTRAL_SPEED = 0.4, PERFECT_BLOCK = 0.8;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const speedOf = (m, key) => (m[key] == null ? NEUTRAL_SPEED : clamp01(m[key]));
  const attackPower = (sp) => 0.8 + 0.5 * sp;

  // What may follow each move (the combo tree).
  const FOLLOW1 = {
    quick: ['quick', 'heavy', 'thrust', 'feint'],
    heavy: ['quick', 'feint'],
    thrust: ['quick', 'heavy'],
    feint: ['quick', 'heavy', 'thrust'],
  };
  const FOLLOW2 = {
    quick: ['heavy', 'thrust'],
    heavy: ['quick'],
    thrust: ['heavy'],
    feint: ['heavy', 'thrust'],
  };
  const FINISH = ['heavy', 'thrust'];

  const COMBOS = [
    { seq: ['feint', 'thrust', 'heavy'], name: 'Eclipse', mult: 2.0 },
    { seq: ['quick', 'quick', 'heavy'], name: 'Guillotine', mult: 1.8 },
    { seq: ['quick', 'heavy', 'thrust'], name: 'Tide', mult: 1.7 },
    { seq: ['feint', 'heavy'], name: 'Decoy', mult: 1.4 },
    { seq: ['quick', 'thrust'], name: 'Stinger', mult: 1.3 },
    { seq: ['thrust', 'heavy'], name: 'Charge', mult: 1.3 },
    { seq: ['quick', 'quick'], name: 'Scissors', mult: 1.25 },
  ];

  // Weapon fields:
  //   dmg / cost   multipliers per attack type (cost also has feint)
  //   hp, st, regen, len, shape
  // Optional traits (all read in step()/makeFighter()):
  //   zoneMult [high, mid, low]  multiplies the damage of each direction
  //   blockChip     share of the damage that leaks through a correct block (quick/thrust/heavy)
  //   gbMult        guard-break damage and stamina drain multiplier
  //   noInterrupt   a Heavy is not cut off by a Quick
  //   punishMult    damage of a Thrust that punishes a Feint (default 1.5)
  //   parryAt       streak length at which a Quick/Thrust the rival throws into YOUR block becomes a parry (default 2)
  //   perfectAt     decision speed that makes a block perfect (default 0.8)
  //   restBonus     extra stamina recovered when resting (default 14)
  //   comboBoost    added to the combo damage boost
  //   armor         damage taken multiplier;  blockFree: blocking costs no stamina
  const W = (id, name, trait, desc, o) => Object.assign({ id, name, trait, desc }, o);
  const D = (quick, heavy, thrust) => ({ quick, heavy, thrust });
  const C = (quick, heavy, thrust, feint) => ({ quick, heavy, thrust, feint });
  const WEAPONS = {
    katana: W('katana', 'Katana', 'Balanced', 'Balanced. No weak spots.',
      { dmg: D(1, 1, 1), cost: C(1, 1, 1, 1), hp: 106, st: 100, regen: 8, len: 84, shape: 'blade' }),
    dagger: W('dagger', 'Dagger', 'Cheap quick strikes', 'Cheap, deadly quick strikes. Weak heavy. Low health.',
      { dmg: D(1.6, 0.75, 1.05), cost: C(0.65, 1, 1, 0.8), hp: 98, st: 100, regen: 9, len: 46, shape: 'dagger' }),
    spear: W('spear', 'Spear', 'Cheap, strong thrusts', 'Devastating, cheap thrusts. Weak quick strikes.',
      { dmg: D(0.85, 0.9, 1.25), cost: C(1, 1, 0.9, 1), hp: 100, st: 100, regen: 8, len: 138, shape: 'spear' }),
    axe: W('axe', 'Axe', 'Brutal heavies', 'Brutal heavy strikes and lots of health. Tires quickly.',
      { dmg: D(0.8, 1.28, 0.9), cost: C(1.1, 1, 1.1, 1.1), hp: 108, st: 100, regen: 7, len: 76, shape: 'axe' }),
    rapier: W('rapier', 'Rapier', 'Feints cost half · Feint punish ×2', 'A duelist\'s needle: cheap feints and a vicious punish, but fragile and weak on heavy blows.',
      { dmg: D(1.05, 0.65, 1.3), cost: C(0.9, 1.1, 0.85, 0.5), punishMult: 2.0, hp: 98, st: 100, regen: 8, len: 112, shape: 'rapier' }),
    greatsword: W('greatsword', 'Greatsword', 'Guard breaks hit ×1.5', 'Huge swings that shatter guards. Slow, tiring and poor at quick strikes.',
      { dmg: D(0.8, 1.35, 0.85), cost: C(1.2, 1.1, 1.1, 1.2), gbMult: 1.5, hp: 112, st: 95, regen: 7, len: 120, shape: 'greatsword', twoHanded: true }),
    hammer: W('hammer', 'War Hammer', 'Guard breaks drain ×2 stamina', 'Crushes shields: a guard break also drains a lot of the rival\'s stamina. Clumsy otherwise.',
      { dmg: D(0.75, 1.2, 0.7), cost: C(1.1, 1.05, 1.1, 1.1), gbMult: 2.0, hp: 104, st: 100, regen: 7, len: 90, shape: 'hammer' }),
    flail: W('flail', 'Flail', 'Heavy cannot be interrupted · Blocks leak 15%', 'The ball swings around the guard: Quick cannot cut off your Heavy and every block leaks a little.',
      { dmg: D(0.8, 1.1, 0.7), cost: C(1.05, 1.1, 1.1, 1.1), noInterrupt: true, blockChip: 0.15, hp: 100, st: 100, regen: 8, len: 100, shape: 'flail' }),
    sabre: W('sabre', 'Sabre', 'Tireless: +2 recovery', 'Fast curved cuts and good wind, but poor thrusts.',
      { dmg: D(1.25, 1.1, 0.8), cost: C(0.85, 1, 1.1, 1), hp: 101, st: 100, regen: 10, len: 90, shape: 'sabre' }),
    sai: W('sai', 'Sai', 'Parries from streak 1', 'Trapping forks: when you block a Quick or Thrust it is already a parry after a single move. Little damage on heavy blows.',
      { dmg: D(1.25, 0.8, 1.1), cost: C(0.8, 1.05, 1, 0.9), parryAt: 1, hp: 100, st: 100, regen: 8, len: 52, shape: 'sai' }),
    nunchaku: W('nunchaku', 'Nunchaku', 'Combos hit +50% harder', 'Whirling chains: very cheap, very fast, a combo machine. Poor thrust and low health.',
      { dmg: D(1.4, 0.95, 0.85), cost: C(0.8, 1.05, 1.1, 0.9), comboBoost: 0.5, hp: 100, st: 100, regen: 8, len: 70, shape: 'nunchaku' }),
    staff: W('staff', 'Bo Staff', 'Rest recovers +6 stamina · Perfect block at 0.7', 'A monk\'s staff: endurance and a sturdy guard, nothing flashy.',
      { dmg: D(1.05, 0.9, 0.95), cost: C(1, 1, 1, 1), restBonus: 6, perfectAt: 0.7, hp: 106, st: 100, regen: 10, len: 130, shape: 'staff', twoHanded: true }),
    scythe: W('scythe', 'Scythe', 'Low attacks ×1.35 · High ×0.85', 'Reaps the legs: low strikes hit far harder, high ones barely scratch.',
      { dmg: D(1.05, 1.2, 0.8), zoneMult: [0.85, 1, 1.35], cost: C(1, 1, 1.1, 1), hp: 107, st: 100, regen: 8, len: 128, shape: 'scythe', twoHanded: true }),
    halberd: W('halberd', 'Halberd', 'High attacks ×1.3 · Low ×0.85', 'A long pole with axe and spike: strong overhead, poor against the legs. Clumsy quick strikes.',
      { dmg: D(0.75, 1.1, 1.05), zoneMult: [1.25, 1, 0.85], cost: C(1.1, 1.05, 0.95, 1.05), hp: 110, st: 100, regen: 7, len: 150, shape: 'halberd', twoHanded: true }),
    whip: W('whip', 'Whip', 'Blocks leak 25% · Cheap feints', 'Wraps around the guard: even a correct block lets some damage through. Fragile, and weak when it must hit hard.',
      { dmg: D(1.35, 0.85, 0.95), cost: C(0.75, 1.1, 1, 0.6), blockChip: 0.25, hp: 98, st: 100, regen: 9, len: 135, shape: 'whip' }),
    gladius: W('gladius', 'Sword & Board', 'Free blocks · -8% damage taken · Perfect block at 0.7', 'A short sword behind a heavy shield: blocking is free and sturdy, but you hit softly.',
      { dmg: D(0.85, 0.85, 0.85), cost: C(1, 1, 1, 1), blockFree: true, armor: 0.92, perfectAt: 0.7, hp: 108, st: 100, regen: 7, len: 60, shape: 'gladius' }),
  };
  const WEAPON_IDS = Object.keys(WEAPONS);

  // Off-hand: a shield, or none (two-handing the weapon). Two-handed weapons (twoHanded) cannot take a shield.
  // Fields (all optional, all defender/self side):
  //   dmgMult  multiplies the damage you deal      costMult  multiplies the stamina cost of attacks
  //   armor    damage taken multiplier             blockFree blocking costs no stamina
  //   leak     extra share of damage that leaks through a correct block
  //   gbTaken  guard-break damage and stamina drain you suffer (multiplier)
  //   parryAt  streak length at which a Quick/Thrust the rival throws into your block becomes a parry
  //   perfectAt decision speed that makes your block perfect   reflect  flat damage a blocked attacker takes
  //   regen    added stamina recovery
  const S = (id, name, trait, desc, o) => Object.assign({ id, name, trait, desc }, o);
  const SHIELDS = {
    kite: S('kite', 'Heater Shield', '-5% damage taken', 'A sturdy all-round shield. No weak spots, no tricks.', { armor: 0.95 }),
    buckler: S('buckler', 'Buckler', 'Perfect block at 0.7 · +2 recovery · You hit ×1.05 · Guard breaks hurt ×1.15',
      'Small and quick: easy to time a perfect block and light on the arm, but a Heavy folds it.', { perfectAt: 0.7, regen: 2, dmgMult: 1.05, gbTaken: 1.15 }),
    tower: S('tower', 'Tower Shield', 'Free blocks · -8% damage taken · Guard breaks hurt ×0.5',
      'A wall of iron. You are nearly unbreakable, but it is heavy: attacks cost +12% stamina, you hit ×0.9 and recover 1 less.',
      { blockFree: true, armor: 0.92, gbTaken: 0.5, costMult: 1.12, dmgMult: 0.9, regen: -1 }),
    spiked: S('spiked', 'Spiked Shield', 'Blocked attackers take 2 damage',
      'Studded with iron: every attack the rival throws into your guard costs them blood. A little heavy, you hit ×0.95.', { reflect: 2, dmgMult: 0.95 }),
    none: S('none', 'No Shield', 'Two-handed: +12% damage · Blocks leak 12% · Guard breaks hurt ×1.25',
      'Both hands on the weapon. More bite, but your guard is just the blade.', { dmgMult: 1.12, leak: 0.12, gbTaken: 1.25 }),
  };
  const SHIELD_IDS = Object.keys(SHIELDS);
  const DEFAULT_SHIELD = 'kite';
  // two-handed weapons are always held with both hands; anything else may take any shield or none
  const legalShields = (weaponId) => ((WEAPONS[weaponId] || {}).twoHanded ? ['none'] : SHIELD_IDS.slice());

  const PERKS = [
    { id: 'hp', name: 'Heart of Stone', desc: '+15 max health', apply: (m) => { m.hp += 15; } },
    { id: 'lungs', name: 'Steel Lungs', desc: '+3 recovery and +10 stamina', apply: (m) => { m.regen += 3; m.st += 10; } },
    { id: 'edge', name: 'Sharpened Edge', desc: '+12% damage', apply: (m) => { m.dmgMult *= 1.12; } },
    { id: 'armor', name: 'Light Armor', desc: '-10% damage taken', apply: (m) => { m.armor *= 0.9; } },
    { id: 'guard', name: 'Steady Guard', desc: 'Blocking costs no stamina', apply: (m) => { m.blockFree = true; } },
    { id: 'combo', name: 'Combo Master', desc: 'Combos hit much harder', apply: (m) => { m.comboBoost += 0.5; } },
    { id: 'reader', name: 'Hawk Eye', desc: 'See your rival\'s habits', apply: (m) => { m.reader = true; } },
  ];

  function makeFighter(spec) {
    const w = WEAPONS[spec.weapon] || WEAPONS.katana;
    const sid = legalShields(w.id).includes(spec.shield) ? spec.shield : legalShields(w.id)[0] === 'none' ? 'none' : DEFAULT_SHIELD;
    const sh = SHIELDS[sid];
    const m = { hp: 0, st: 0, regen: sh.regen || 0, dmgMult: sh.dmgMult || 1, armor: (w.armor || 1) * (sh.armor || 1), blockFree: !!(w.blockFree || sh.blockFree),
      comboBoost: 1 + (w.comboBoost || 0), reader: false, costMult: sh.costMult || 1, leak: sh.leak || 0, gbTaken: sh.gbTaken || 1,
      parryAt: sh.parryAt || 99, perfectAt: sh.perfectAt || 99, reflect: sh.reflect || 0 };
    (spec.perks || []).forEach((id) => {
      const p = PERKS.find((x) => x.id === id);
      if (p) p.apply(m);
    });
    const f = {
      name: spec.name, title: spec.title || '', weapon: w.id, shield: sid, color: spec.color, level: spec.level || 3,
      persona: spec.persona || 'balanced', taunt: spec.taunt || '', perks: (spec.perks || []).slice(),
      maxHp: w.hp + m.hp, maxSt: w.st + m.st, regen: w.regen + m.regen, mods: m,
    };
    return resetFighter(f);
  }

  function resetFighter(f) {
    f.hp = f.maxHp;
    f.st = f.maxSt;
    f.chain = [];
    f.open = false;
    return f;
  }

  function cloneFighter(f) {
    return Object.assign({}, f, { chain: f.chain.slice() });
  }
  function cloneState(s) {
    return { a: cloneFighter(s.a), b: cloneFighter(s.b), turn: s.turn };
  }
  function newDuel(a, b) {
    return { a: resetFighter(a), b: resetFighter(b), turn: 0 };
  }

  function attackCost(f, type, chainLen) {
    if (type === 'rest') return 0;
    const w = WEAPONS[f.weapon];
    return Math.max(2, Math.round(TYPES[type].cost * (w.cost[type] || 1) * f.mods.costMult * (1 + 0.2 * chainLen)));
  }
  function blockCost(f) {
    return f.mods.blockFree ? 0 : BLOCK_COST;
  }

  // Attacks the fighter may pick now. The tree narrows as the streak grows.
  function legalAttacks(f) {
    const out = [];
    const n = f.chain.length;
    const last = f.chain[n - 1];
    let types;
    if (n === 0) types = ['quick', 'heavy', 'thrust', 'feint'];
    else if (n === 1) types = FOLLOW1[last.type];
    else if (n === 2) types = FOLLOW2[last.type];
    else types = FINISH;
    types.forEach((t) => {
      if (attackCost(f, t, n) > f.st) return;
      for (let z = 0; z < 3; z++) {
        if (n === 1 && last.type !== 'feint' && z === last.zone) continue;
        if (n === 2 && Math.abs(z - last.zone) !== 1) continue;
        out.push({ type: t, zone: z });
      }
    });
    out.push({ type: 'rest', zone: -1 });
    return out;
  }
  function isLegal(f, mv) {
    return legalAttacks(f).some((a) => a.type === mv.type && a.zone === mv.zone);
  }

  function findCombo(types) {
    for (const c of COMBOS) {
      if (types.length >= c.seq.length && c.seq.every((t, i) => types[types.length - c.seq.length + i] === t)) return c;
    }
    return null;
  }

  // Resolves a turn. mv = { a:{type,zone,block}, b:{type,zone,block} }. Mutates the state.
  function step(s, mv) {
    const F = { a: s.a, b: s.b };
    const other = { a: 'b', b: 'a' };
    const events = [];
    const out = {};
    const info = {};
    const flags = { a: { broken: false, open: false }, b: { broken: false, open: false } };
    const dmgTaken = { a: 0, b: 0 };
    const stLoss = { a: 0, b: 0 };

    ['a', 'b'].forEach((k) => {
      const f = F[k], m = mv[k];
      const types = f.chain.map((c) => c.type).concat(m.type);
      info[k] = { cost: attackCost(f, m.type, f.chain.length), combo: m.type === 'rest' ? null : findCombo(types), streak: f.chain.length };
    });

    ['a', 'b'].forEach((att) => {
      const def = other[att];
      const A = F[att], D = F[def], ma = mv[att], md = mv[def];
      if (ma.type === 'rest') { out[att] = { kind: 'rest' }; return; }
      const dBlock = D.open ? -1 : md.block;
      const blocked = dBlock === ma.zone;
      const wm = WEAPONS[A.weapon].dmg[ma.type] || 1;
      const pw = attackPower(speedOf(ma, 'pa'));
      const sB = speedOf(md, 'pb'), chipMult = 1.4 - sB;
      let perfect = false;
      const base = TYPES[ma.type].dmg * wm * A.mods.dmgMult * pw;
      const WA = WEAPONS[A.weapon];
      const zm = ZONE_MULT[ma.zone] * (WA.zoneMult ? WA.zoneMult[ma.zone] : 1);
      const openMult = D.open ? 1.2 : 1;
      const combo = info[att].combo;
      const comboMult = combo ? 1 + (combo.mult - 1) * A.mods.comboBoost : 1;
      const chip = (WA.blockChip || 0) + D.mods.leak, gb = (WA.gbMult || 1) * D.mods.gbTaken;
      const DW = WEAPONS[D.weapon], parryAt = Math.min(DW.parryAt || 2, D.mods.parryAt);
      let kind, dmg = 0, counter = false;

      if (ma.type === 'heavy' && md.type === 'quick' && !WA.noInterrupt) {
        kind = 'interrupt'; flags[att].broken = true;
      } else if (ma.type === 'thrust' && md.type === 'feint') {
        kind = 'punish'; dmg = base * zm * (WA.punishMult || 1.5) * openMult;
        flags[def].broken = true;
      } else if (blocked) {
        if (ma.type === 'feint') {
          kind = 'feintOpen'; flags[def].open = true;
        } else if (ma.type === 'heavy') {
          kind = 'guardbreak'; dmg = base * zm * 0.4 * gb * chipMult; stLoss[def] += Math.round(12 * gb * chipMult); flags[def].broken = true;
        } else if (ma.type === 'thrust') {
          if (info[att].streak >= parryAt) { kind = 'parry'; flags[att].broken = true; flags[att].open = true; }
          else { kind = 'block'; dmg = base * zm * (0.35 + chip) * chipMult; flags[att].broken = true; }
        } else { // quick
          if (info[att].streak >= parryAt) { kind = 'parry'; flags[att].broken = true; flags[att].open = true; }
          else { kind = 'block'; dmg = base * zm * chip * chipMult; }
        }
        if (kind === 'block' && sB >= Math.min(DW.perfectAt || PERFECT_BLOCK, D.mods.perfectAt, PERFECT_BLOCK)) { perfect = true; flags[att].broken = true; stLoss[att] += 5; }
      } else if (ma.type === 'feint') {
        kind = 'whiff';
      } else {
        kind = 'hit';
        if (ma.type === 'quick' && md.type === 'heavy') counter = true;
        dmg = base * zm * comboMult * openMult * (counter ? 1.25 : 1);
      }
      dmg = Math.round(dmg * D.mods.armor);
      out[att] = { kind, dmg, counter, power: pw, perfect, combo: kind === 'hit' || kind === 'punish' ? combo : null };
      dmgTaken[def] += dmg;
      if (D.mods.reflect && (kind === 'block' || kind === 'parry' || kind === 'guardbreak')) { dmgTaken[att] += D.mods.reflect; out[att].reflect = D.mods.reflect; }
    });

    // apply
    ['a', 'b'].forEach((k) => {
      const f = F[k], m = mv[k], o = out[k];
      const foeOut = out[other[k]];
      f.hp -= dmgTaken[k];
      f.rawHp = f.hp;
      f.hp = Math.max(0, f.hp);
      f.st -= info[k].cost + blockCost(f) + stLoss[k];
      f.st = Math.max(0, f.st);
      f.st = Math.min(f.maxSt, f.st + f.regen + (m.type === 'rest' ? 14 + (WEAPONS[f.weapon].restBonus || 0) : 0));
      // streak
      if (m.type === 'rest' || flags[k].broken || info[k].streak >= MAX_CHAIN) f.chain = [];
      else f.chain.push({ type: m.type, zone: m.zone });
      f.open = flags[k].open;
      if (foeOut && foeOut.kind === 'guardbreak') f.chain = [];
      const ev = Object.assign({ src: k, dst: other[k], type: m.type, zone: m.zone, streak: info[k].streak }, o);
      events.push(ev);
    });
    s.turn += 1;
    return { events, out };
  }

  function roundOver(s) {
    const a = s.a, b = s.b;
    if (a.hp <= 0 || b.hp <= 0) {
      if (a.hp <= 0 && b.hp <= 0) {
        const ra = a.rawHp, rb = b.rawHp;
        return { over: true, winner: ra > rb ? 'a' : rb > ra ? 'b' : (a.st >= b.st ? 'a' : 'b'), ko: true };
      }
      return { over: true, winner: a.hp > 0 ? 'a' : 'b', ko: true };
    }
    if (s.turn >= TURN_LIMIT) {
      const w = a.hp !== b.hp ? (a.hp > b.hp ? 'a' : 'b') : (a.st >= b.st ? 'a' : 'b');
      return { over: true, winner: w, ko: false };
    }
    return { over: false };
  }

  Object.assign(BD, {
    ZONES, ZONE_MULT, TYPES, TYPE_ORDER, BLOCK_COST, MAX_CHAIN, TURN_LIMIT, COMBOS, WEAPONS, SHIELDS, SHIELD_IDS, DEFAULT_SHIELD, legalShields, PERKS, NEUTRAL_SPEED, attackPower,
    WEAPON_IDS, makeFighter, resetFighter, cloneState, newDuel, attackCost, blockCost, legalAttacks, isLegal, findCombo, step, roundOver,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
})();
