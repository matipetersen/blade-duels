// node tests/balance.js [duels-per-pair] [shard] [shards]   -> weapon round-robin (level 3, balanced bots)
// Run all shards in parallel and merge with: node tests/balance.js merge file1 file2 ...
const fs = require('fs');
const BD = require('../core.js');
require('../ai.js');

function duel(wa, wb, seed) {
  const rng = BD.mulberry32(seed);
  const mk = (w) => BD.makeFighter({ name: w, weapon: w, level: 3, persona: 'balanced', color: '#fff' });
  const A = mk(wa), B = mk(wb);
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
  return wins.a > wins.b ? 'a' : 'b';
}

if (process.argv[2] === 'merge') {
  const tot = {};
  process.argv.slice(3).forEach((f) => {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    Object.keys(r).forEach((k) => { tot[k] = tot[k] || { w: 0, n: 0 }; tot[k].w += r[k].w; tot[k].n += r[k].n; });
  });
  report(tot);
} else {
  const N = +process.argv[2] || 10, shard = +process.argv[3] || 0, shards = +process.argv[4] || 1;
  const ids = BD.WEAPON_IDS, res = {};
  let idx = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (idx++ % shards !== shard) continue;
    let wi = 0;
    for (let k = 0; k < N; k++) {
      // alternate sides so seat advantage cancels out
      const iFirst = k % 2 === 0;
      const r = iFirst ? duel(ids[i], ids[j], 5000 + k) : duel(ids[j], ids[i], 5000 + k);
      if ((r === 'a') === iFirst) wi++;
    }
    res[ids[i] + '>' + ids[j]] = { w: wi, n: N };
  }
  const out = process.env.OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(res));
  else report(res);
}

function report(res) {
  const sum = {};
  BD.WEAPON_IDS.forEach((w) => { sum[w] = { w: 0, n: 0 }; });
  Object.keys(res).forEach((k) => {
    const [a, b] = k.split('>'), r = res[k];
    sum[a].w += r.w; sum[a].n += r.n; sum[b].w += r.n - r.w; sum[b].n += r.n;
  });
  Object.keys(sum).sort((a, b) => sum[b].w / sum[b].n - sum[a].w / sum[a].n).forEach((w) => {
    console.log(`${w.padEnd(12)} ${(100 * sum[w].w / sum[w].n).toFixed(0).padStart(3)}%  (${sum[w].w}/${sum[w].n})`);
  });
}
