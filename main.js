/* Blade Duels - tournament flow and interface. */
(function () {
  const BD = globalThis.BD;
  const $ = (s) => document.querySelector(s);
  const ZN = BD.ZONES;
  const TN = (t) => BD.TYPES[t].name;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bd_' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bd_' + k, v); } catch (e) { /* no storage */ } },
  };

  const TURN_MS = 3000;
  const ME = { name: 'You', title: 'Contender', color: '#19e6ff' };
  const ROSTER = [
    { name: 'Taro', title: 'The Apprentice', weapon: 'katana', level: 1, persona: 'balanced', color: '#7cff6b', taunt: 'My first tournament... don\'t underestimate me!' },
    { name: 'Hana', title: 'The Heron', weapon: 'dagger', level: 2, persona: 'trickster', color: '#ff9f1c', taunt: 'Are you sure you saw where my blade was going?' },
    { name: 'Gorm', title: 'The Anvil', weapon: 'axe', level: 3, persona: 'brute', color: '#ff3b30', taunt: 'I will split your guard in two.' },
    { name: 'Sora', title: 'Cutting Wind', weapon: 'spear', level: 3, persona: 'duelist', color: '#ffd60a', taunt: 'Nobody reaches me at range.' },
    { name: 'Madame Kuro', title: 'The Widow', weapon: 'dagger', level: 4, persona: 'turtle', color: '#bf5af2', perks: ['guard'], taunt: 'Patience... I always win by waiting.' },
    { name: 'Ren', title: 'Silent Wall', weapon: 'katana', level: 4, persona: 'balanced', color: '#30d158', perks: ['armor'], taunt: '...' },
    { name: 'Ryuga', title: 'The Champion', weapon: 'katana', level: 5, persona: 'aggressive', color: '#ff2d95', perks: ['edge', 'lungs'], taunt: 'Three years undefeated. Show me something new.' },
  ];
  const ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Grand Final'];

  const G = {
    theme: store.get('theme', 'neon'), weapon: 'katana', perks: [],
    scene: null, round: 0, bracket: null,
  };

  // ---------- screen helpers ----------
  const overlay = $('#overlay');
  function ask(html) {
    return new Promise((resolve) => {
      overlay.innerHTML = '<div class="screen">' + html + '</div>';
      overlay.classList.add('on'); overlay.scrollTop = 0;
      overlay.onclick = (e) => {
        const el = e.target.closest('[data-val]');
        if (!el) return;
        BD.Audio.sfx('ok');
        resolve(el.dataset.val);
        if (!el.dataset.keep) overlay.classList.remove('on');
      };
    });
  }
  function hideOverlay() { overlay.classList.remove('on'); }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  function applyTheme(t) {
    G.theme = t; document.body.classList.toggle('theme-neon', t === 'neon'); document.body.classList.toggle('theme-primal', t === 'primal');
    G.scene.setTheme(t); store.set('theme', t);
    const b = $('#btn-theme'); if (b) b.textContent = t === 'neon' ? 'Style: Neon' : 'Style: Primal';
  }

  // body condition and stamina (no health bars: damage shows on the mannequin)
  function vitals(me, foe) {
    [['a', me], ['b', foe]].forEach(([k, f]) => {
      const c = BD.condition(f.hp / f.maxHp), el = $('#vc-' + k);
      el.textContent = c.text; el.style.background = c.col; el.style.color = '#10080c';
      $('#vs-' + k).style.width = Math.round(100 * f.st / f.maxSt) + '%';
      $('#vt-' + k).textContent = f.st + '/' + f.maxSt;
    });
    $('#vn-b').textContent = foe.name;
  }

  // ---------- choice panel ----------
  const panel = {
    sel: { type: null, zone: null, block: null }, me: null, foe: null, habit: null, resolve: null,
    t0: 0, tAtk: null, tBlk: null, timerId: 0, lastTick: 0,
    build() {
      const types = $('#types'), az = $('#azones'), bz = $('#bzones');
      const keysT = ['Q', 'W', 'E', 'R', 'T'], keysA = ['1', '2', '3'], keysB = ['Z', 'X', 'C'];
      types.innerHTML = BD.TYPE_ORDER.map((t, i) => `<button class="btn" data-t="${t}"><kbd>${keysT[i]}</kbd><span>${TN(t)}</span><small></small></button>`).join('');
      const zl = ['▲ High', '▬ Mid', '▼ Low'];
      az.innerHTML = zl.map((z, i) => `<button class="btn" data-z="${i}"><kbd>${keysA[i]}</kbd><span>${z}</span></button>`).join('');
      bz.innerHTML = zl.map((z, i) => `<button class="btn blk" data-b="${i}"><kbd>${keysB[i]}</kbd><span>${z}</span></button>`).join('');
      types.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b && !b.disabled) this.pickType(b.dataset.t); };
      az.onclick = (e) => { const b = e.target.closest('[data-z]'); if (b && !b.disabled) this.pickZone(+b.dataset.z); };
      bz.onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) this.pickBlock(+b.dataset.b); };
      document.addEventListener('keydown', (e) => {
        if (!this.resolve || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toUpperCase();
        const iT = keysT.indexOf(k), iA = keysA.indexOf(k), iB = keysB.indexOf(k);
        if (iT >= 0) { const t = BD.TYPE_ORDER[iT]; if (this.legalTypes().has(t)) this.pickType(t); }
        else if (iA >= 0) { if (!$('#azones [data-z="' + iA + '"]').disabled) this.pickZone(iA); }
        else if (iB >= 0) this.pickBlock(iB);
      });
    },
    legalTypes() { return new Set(BD.legalAttacks(this.me).map((m) => m.type)); },
    pickType(t) {
      BD.Audio.sfx('ui');
      this.sel.type = t;
      if (t === 'rest') this.sel.zone = -1;
      else if (this.sel.zone === -1 || (this.sel.zone != null && !BD.isLegal(this.me, { type: t, zone: this.sel.zone }))) this.sel.zone = null;
      this.markAtk(); this.refresh(); this.maybeGo();
    },
    pickZone(z) {
      BD.Audio.sfx('ui');
      this.sel.zone = z;
      if (this.sel.type && this.sel.type !== 'rest' && !BD.isLegal(this.me, { type: this.sel.type, zone: z })) this.sel.type = null;
      this.markAtk(); this.refresh(); this.maybeGo();
    },
    pickBlock(b) { BD.Audio.sfx('ui'); this.sel.block = b; this.tBlk = performance.now(); this.refresh(); this.maybeGo(); },
    attackDone() { const s = this.sel; return !!s.type && (s.type === 'rest' || (s.zone != null && s.zone >= 0)); },
    // the attack counts as "decided" once type and direction are both set (changing it keeps the clock running)
    markAtk() { if (this.attackDone()) this.tAtk = performance.now(); },
    ready() { return this.attackDone() && this.sel.block != null; },
    maybeGo() { if (this.ready()) this.confirm(); },
    speedOf(t) { return t == null ? 0 : Math.max(0, Math.min(1, 1 - (t - this.t0) / TURN_MS)); },
    confirm() {
      if (!this.resolve || !this.ready()) return;
      const s = this.sel;
      const mv = { type: s.type, zone: s.type === 'rest' ? -1 : s.zone, block: s.block, pa: this.speedOf(this.tAtk), pb: this.speedOf(this.tBlk) };
      this.finish(mv);
    },
    finish(mv) {
      clearInterval(this.timerId); this.timerId = 0; G.scene.timer = null;
      const r = this.resolve; this.resolve = null; $('#panel').classList.add('locked');
      BD.Audio.unlock(); r(mv);
    },
    // time is up: fill in whatever is missing at random, with no speed bonus
    timeout() {
      if (!this.resolve) return;
      const s = this.sel, legal = BD.legalAttacks(this.me).filter((m) => m.type !== 'rest');
      let atk;
      if (this.attackDone()) atk = { type: s.type, zone: s.type === 'rest' ? -1 : s.zone };
      else {
        const pool = legal.filter((m) => (!s.type || m.type === s.type) && (s.zone == null || s.zone < 0 || m.zone === s.zone));
        atk = (!s.type && (s.zone == null || s.zone < 0)) || !pool.length ? { type: 'rest', zone: -1 } : pool[Math.floor(Math.random() * pool.length)];
      }
      const slowA = !this.attackDone();
      this.finish({ type: atk.type, zone: atk.zone, block: s.block != null ? s.block : Math.floor(Math.random() * 3), pa: slowA ? 0 : this.speedOf(this.tAtk), pb: s.block != null ? this.speedOf(this.tBlk) : 0 });
    },
    startTimer() {
      this.t0 = performance.now(); this.tAtk = null; this.tBlk = null; this.lastTick = 3;
      clearInterval(this.timerId);
      this.timerId = setInterval(() => {
        const left = Math.max(0, 1 - (performance.now() - this.t0) / TURN_MS);
        G.scene.timer = { frac: left, power: BD.attackPower(left) };
        const sec = left * TURN_MS / 1000;
        if (sec <= 1 && this.lastTick > 1) { this.lastTick = 1; BD.Audio.sfx('tick'); }
        if (sec <= 0.5 && this.lastTick > 0.5) { this.lastTick = 0.5; BD.Audio.sfx('tick'); }
        if (left <= 0) this.timeout();
      }, 30);
    },
    refresh() {
      const me = this.me, s = this.sel, legal = BD.legalAttacks(me), n = me.chain.length;
      document.querySelectorAll('#types .btn').forEach((b) => {
        const t = b.dataset.t, ok = legal.some((m) => m.type === t && (s.zone == null || s.zone === -1 || m.zone === s.zone || t === 'rest'));
        b.disabled = !ok; b.classList.toggle('sel', s.type === t);
        b.querySelector('small').textContent = t === 'rest' ? '+stamina' : BD.attackCost(me, t, n) + ' stamina';
      });
      document.querySelectorAll('#azones .btn').forEach((b) => {
        const z = +b.dataset.z;
        const ok = s.type === 'rest' ? false : legal.some((m) => m.type !== 'rest' && m.zone === z && (!s.type || m.type === s.type));
        b.disabled = !ok; b.classList.toggle('sel', s.zone === z);
      });
      document.querySelectorAll('#bzones .btn').forEach((b) => b.classList.toggle('sel', s.block === +b.dataset.b));
      this.hint();
    },
    hint() {
      const me = this.me, foe = this.foe, n = me.chain.length, s = this.sel;
      const chainTxt = me.chain.map((c) => TN(c.type) + ' ' + ZN[c.zone]).join(' → ');
      let h = '';
      if (n === 0) h = 'No streak: the whole tree is open.';
      else {
        h = `Streak <b>${n}/3</b>: ${chainTxt}. `;
        if (n === 1) h += 'You can no longer repeat a direction (except Feint) and options narrow.';
        else if (n === 2) h += 'Only adjacent directions and 1-2 types. <span class="warn">A blocked Quick or Thrust now = PARRY.</span>';
        else h += '<b>Forced finisher!</b> Only Heavy or Thrust.';
      }
      if (me.open) h += ' <span class="warn">You are OPEN: your block does not count this turn.</span>';
      if (foe.open) h += ' <span class="combo">The rival is OPEN! Their block does not count: any hit lands.</span>';
      if (s.type && s.type !== 'rest') {
        const c = BD.findCombo(me.chain.map((x) => x.type).concat(s.type));
        if (c) h += ` <span class="combo">Combo: ${c.name} ×${c.mult} if it connects.</span>`;
      }
      $('#hint').innerHTML = h;
      const r = me.mods.reader && this.habit && BD.readout(this.habit);
      $('#reader').textContent = r ? `Hawk Eye: ${foe.name} tends to attack ${ZN[r.zone]} (${Math.round(r.zoneP * 100)}%), block ${ZN[r.block]} (${Math.round(r.blockP * 100)}%) and use ${TN(r.type)} (${Math.round(r.typeP * 100)}%).` : '';
    },
    choose(me, foe, habit) {
      this.me = me; this.foe = foe; this.habit = habit; this.sel = { type: null, zone: null, block: null };
      vitals(me, foe);
      $('#panel').classList.remove('locked');
      this.refresh();
      return new Promise((res) => { this.resolve = res; this.startTimer(); });
    },
  };

  // ---------- headless simulation of the other bracket matches ----------
  function simulate(specA, specB) {
    const A = BD.makeFighter(specA), B = BD.makeFighter(specB);
    const brA = BD.makeBrain(A.level, A.persona), brB = BD.makeBrain(B.level, B.persona);
    const w = { a: 0, b: 0 };
    while (w.a < 2 && w.b < 2) {
      const s = BD.newDuel(A, B);
      for (;;) {
        const ma = BD.decide(brA, s, 'a'), mb = BD.decide(brB, s, 'b');
        ma.pa = BD.botSpeed(A.level); ma.pb = BD.botSpeed(A.level); mb.pa = BD.botSpeed(B.level); mb.pb = BD.botSpeed(B.level);
        BD.observe(brA, mb); BD.observe(brB, ma);
        BD.step(s, { a: ma, b: mb });
        const r = BD.roundOver(s);
        if (r.over) { w[r.winner]++; break; }
      }
    }
    return w.a > w.b ? specA : specB;
  }

  // ---------- screens ----------
  const WEAPON_STATS = (w) => `${w.hp} health · Quick ×${w.dmg.quick} · Heavy ×${w.dmg.heavy} · Thrust ×${w.dmg.thrust}`;

  async function titleScreen() {
    const rules = `<div class="legend">
      <b>Each turn you pick 3 things in secret</b> (so does the rival): <b>attack type</b>, <b>direction</b> (high/mid/low) and <b>block</b> (high/mid/low).<br>
      <b>Quick</b> interrupts Heavy · <b>Heavy</b> breaks the guard · <b>Feint</b> opens up whoever blocks · <b>Thrust</b> punishes the Feint.<br>
      Chaining attacks builds <b>combos</b> with more damage, but the tree narrows: on the 3rd move only the finisher is left, and a Quick/Thrust blocked in a long streak is a <b>parry</b>.<br>
      <b>You get 3 seconds per turn:</b> the faster you pick, the harder your attack hits (×0.8 to ×1.3) and the better your block holds (very fast = perfect block). If time runs out, the rest is filled in at random with no bonus. Everything costs <b>stamina</b>. You win a round by KO or by having more health at turn 14. Best of 3 rounds per match.</div>`;
    await ask(`<h2>Blade Duels</h2><p>Supreme Blade Tournament · 8 fighters · 3 matches to glory</p>${rules}
      <div><button class="cta" data-val="go">Enter the tournament</button></div>`);
  }

  async function weaponScreen() {
    const cards = Object.values(BD.WEAPONS).map((w) => `<button class="card" data-val="${w.id}"><h3>${w.name}</h3><p>${w.desc}</p><div class="stats">${WEAPON_STATS(w)}</div></button>`).join('');
    return ask(`<h2>Choose your weapon</h2><p>Each weapon changes damage, costs and health. The combo tree is the same.</p><div class="cards">${cards}</div>`);
  }

  function bracketHtml(br, current) {
    const slot = (sp, m) => {
      if (!sp) return '<div class="slot"><span class="nm">—</span></div>';
      const cls = ['slot', sp.isMe ? 'me' : '', m.winner ? (m.winner === sp ? 'win' : 'lose') : ''].join(' ');
      return `<div class="${cls}"><span class="nm"><span class="dot" style="background:${sp.color}"></span>${esc(sp.name)}</span><span>${sp.isMe ? '' : stars(sp.level).slice(0, sp.level)}</span></div>`;
    };
    const col = (r) => `<div class="col"><h5>${ROUND_NAMES[r].toUpperCase()}</h5>${br[r].map((m, i) => `<div class="match ${current && current.r === r && current.i === i ? 'now' : ''}">${slot(m.a, m)}${slot(m.b, m)}</div>`).join('')}</div>`;
    return `<div class="bracket">${col(0)}${col(1)}${col(2)}</div>`;
  }

  async function bracketScreen(r) {
    const m = G.bracket[r][0], foe = m.b;
    const weapon = BD.WEAPONS[foe.weapon];
    const perks = (G.perks.length ? '<ul class="perks">' + G.perks.map((id) => { const p = BD.PERKS.find((x) => x.id === id); return `<li>✔ ${p.name}: ${p.desc}</li>`; }).join('') + '</ul>' : '');
    await ask(`<h2>${ROUND_NAMES[r]}</h2>${bracketHtml(G.bracket, { r, i: 0 })}
      <div class="vs"><b>${esc(ME.name)} vs ${esc(foe.name)}</b> — ${esc(foe.title)}<br>${weapon.name} · level ${stars(foe.level)}<br><span class="taunt">“${esc(foe.taunt)}”</span></div>${perks}
      <button class="cta" data-val="fight">Fight!</button>`);
  }

  async function perkScreen() {
    const pool = BD.PERKS.filter((p) => !G.perks.includes(p.id)).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!pool.length) return;
    const cards = pool.map((p) => `<button class="card" data-val="${p.id}"><h3>${p.name}</h3><p>${p.desc}</p></button>`).join('');
    const id = await ask(`<h2>Victory!</h2><p>Pick an upgrade for the next match.</p><div class="cards">${cards}</div>`);
    G.perks.push(id);
  }

  async function endScreen(champion, r) {
    BD.Audio.sfx(champion ? 'win' : 'lose');
    const html = champion
      ? `<h2>Champion of the Supreme Blade!</h2><p>You beat all 7 rivals in the tournament.</p>${bracketHtml(G.bracket)}`
      : `<h2>Eliminated</h2><p>You fell in the ${ROUND_NAMES[r].toLowerCase()}. The combo tree rewards whoever reads, not whoever insists.</p>${bracketHtml(G.bracket)}`;
    return ask(html + `<div><button class="cta" data-val="same">Retry with ${BD.WEAPONS[G.weapon].name}</button><button class="cta alt" data-val="new">Change weapon</button></div>`);
  }

  // ---------- match ----------
  function snapF(f) { return { hp: f.hp, st: f.st, chain: f.chain.slice(), open: f.open }; }

  async function playMatch(oppSpec) {
    const sc = G.scene;
    const me = BD.makeFighter(Object.assign({}, ME, { weapon: G.weapon, perks: G.perks, level: 3 }));
    const foe = BD.makeFighter(oppSpec);
    const brain = BD.makeBrain(foe.level, foe.persona), habit = BD.makeBrain(1, 'balanced');
    sc.setFighters(me, foe);
    const wins = { a: 0, b: 0 };
    let round = 1;
    while (wins.a < 2 && wins.b < 2) {
      const duel = BD.newDuel(me, foe);
      sc.hud.round = round; sc.hud.turn = 0; sc.hud.limit = BD.TURN_LIMIT;
      sc.setHud('a', me, wins.a); sc.setHud('b', foe, wins.b); sc.syncHudInstant(); sc.idleAll();
      await sc.banner('ROUND ' + round, '', 1.0);
      await sc.banner('FIGHT!', '', 0.8);
      for (;;) {
        const mvA = await panel.choose(duel.a, duel.b, habit);
        const mvB = BD.decide(brain, duel, 'b');
        mvB.pa = BD.botSpeed(foe.level); mvB.pb = BD.botSpeed(foe.level);
        BD.observe(brain, mvA); BD.observe(habit, mvB);
        const res = BD.step(duel, { a: mvA, b: mvB });
        const after = { a: snapF(duel.a), b: snapF(duel.b) };
        await sc.playTurn({ a: mvA, b: mvB }, res, after);
        sc.setHud('a', duel.a, wins.a); sc.setHud('b', duel.b, wins.b);
        const ro = BD.roundOver(duel);
        if (ro.over) { wins[ro.winner]++; sc.hud.a.wins = wins.a; sc.hud.b.wins = wins.b; await sc.ko(ro.winner, ro.ko); break; }
      }
      round++;
    }
    return wins.a > wins.b;
  }

  // ---------- tournament ----------
  async function tournament() {
    const meSpec = Object.assign({ isMe: true, level: 3 }, ME);
    const R = ROSTER.map((r) => Object.assign({}, r));
    G.perks = [];
    G.bracket = [
      [{ a: meSpec, b: R[0] }, { a: R[1], b: R[2] }, { a: R[3], b: R[4] }, { a: R[5], b: R[6] }],
      [{}, {}],
      [{}],
    ];
    for (let r = 0; r < 3; r++) {
      if (r > 0) G.bracket[r].forEach((m, i) => { m.a = G.bracket[r - 1][i * 2].winner; m.b = G.bracket[r - 1][i * 2 + 1].winner; });
      // the other matches resolve on their own
      G.bracket[r].forEach((m, i) => { if (i > 0) m.winner = simulate(m.a, m.b); });
      await bracketScreen(r);
      const won = await playMatch(G.bracket[r][0].b);
      G.bracket[r][0].winner = won ? meSpec : G.bracket[r][0].b;
      if (!won) { G.scene.hud.round = 1; return { champion: false, r }; }
      if (r < 2) { BD.Audio.sfx('win'); await perkScreen(); }
    }
    return { champion: true };
  }

  async function main() {
    G.scene = new BD.Scene($('#cv'));
    G.scene.start();
    BD.Audio.muted = store.get('mute', '0') === '1';
    G.scene.speed = +store.get('speed', '1') || 1;
    panel.build();
    $('#panel').classList.add('locked');
    applyTheme(G.theme);
    // background demo while the title is shown
    const fa = BD.makeFighter({ name: 'You', weapon: 'katana', color: ME.color }), fb = BD.makeFighter({ name: 'Ryuga', weapon: 'katana', color: '#ff2d95' });
    G.scene.setFighters(fa, fb); G.scene.setHud('a', fa, 0); G.scene.setHud('b', fb, 0); G.scene.syncHudInstant();

    const bT = $('#btn-theme'), bS = $('#btn-sound'), bV = $('#btn-speed');
    bT.onclick = () => applyTheme(G.theme === 'neon' ? 'primal' : 'neon');
    const syncSound = () => { bS.textContent = BD.Audio.muted ? 'Sound: off' : 'Sound: on'; bS.setAttribute('aria-pressed', String(!BD.Audio.muted)); };
    bS.onclick = () => { BD.Audio.muted = !BD.Audio.muted; store.set('mute', BD.Audio.muted ? '1' : '0'); syncSound(); BD.Audio.unlock(); };
    const syncSpeed = () => { bV.textContent = 'Speed ×' + G.scene.speed; };
    bV.onclick = () => { G.scene.speed = G.scene.speed === 1 ? 1.6 : 1; store.set('speed', G.scene.speed); syncSpeed(); };
    syncSound(); syncSpeed();

    await titleScreen(); BD.Audio.unlock();
    for (;;) {
      G.weapon = await weaponScreen();
      for (;;) {
        const r = await tournament();
        const next = await endScreen(r.champion, r.r);
        if (next === 'new') break;
      }
    }
  }

  // installable web app: offline fallback (network-first, so updates always show up). Not inside iframes.
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window) {
      window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    }
  } catch (e) { /* no service worker */ }

  window.BDGame = { G, panel, scene: () => G.scene };
  window.addEventListener('DOMContentLoaded', main);
})();
