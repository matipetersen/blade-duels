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
  const ME = { name: 'You', title: 'Contender', color: '#58c0d6' };
  // Six rivals, weakest to strongest. Each one fights with a random weapon and shield from its own arsenal (matching its style).
  const ROSTER = [
    { name: 'Taro', title: 'The Apprentice', level: 1, persona: 'balanced', arsenal: ['katana', 'sabre', 'staff', 'spear'], shields: ['kite', 'buckler', 'none'], style: 'Plays it straight: a bit of everything, slow to react.', counter: 'Good place to learn. Block one height, attack another, and try a Quick into his Heavy.', color: '#8fd77a', taunt: 'My first tournament... don\'t underestimate me!' },
    { name: 'Hana', title: 'The Heron', level: 2, persona: 'trickster', arsenal: ['rapier', 'whip', 'dagger', 'sai'], shields: ['buckler', 'none'], style: 'Feints constantly to open your guard.', counter: 'A Thrust punishes a Feint (×1.5, ignores your block). Do not block the same height twice in a row.', color: '#e8a04a', taunt: 'Are you sure you saw where my blade was going?' },
    { name: 'Gorm', title: 'The Anvil', level: 3, persona: 'brute', arsenal: ['axe', 'greatsword', 'hammer', 'flail'], shields: ['tower', 'none', 'spiked'], style: 'Throws Heavy after Heavy.', counter: 'Your Quick cuts a Heavy short and counters it. Never leave a Heavy unblocked: guard breaks drain your stamina.', color: '#e0605a', taunt: 'I will split your guard in two.' },
    { name: 'Madame Kuro', title: 'The Widow', level: 4, persona: 'turtle', arsenal: ['gladius', 'staff', 'halberd', 'spear'], shields: ['tower', 'spiked', 'kite'], style: 'Blocks everything and rests to wait you out.', counter: 'Feint to open her guard, then land the follow-up. Chain combos while she turtles.', color: '#b583e0', perks: ['guard'], taunt: 'Patience... I always win by waiting.' },
    { name: 'Ren', title: 'Silent Wall', level: 4, persona: 'duelist', arsenal: ['rapier', 'spear', 'katana', 'sai'], shields: ['kite', 'buckler', 'spiked'], style: 'Pokes with Thrust and Quick.', counter: 'Do not Feint into his Thrust: it punishes you. Block his height, then answer with a combo.', color: '#62c98c', perks: ['armor'], taunt: '...' },
    { name: 'Ryuga', title: 'The Champion', level: 5, persona: 'aggressive', arsenal: ['nunchaku', 'scythe', 'greatsword', 'dagger', 'katana'], shields: ['none', 'buckler', 'spiked'], style: 'Never stops attacking and burns his stamina.', counter: 'Block and let him run dry, then strike. A Quick cuts his Heavy short.', color: '#e0558f', perks: ['edge', 'lungs'], taunt: 'Three years undefeated. Show me something new.' },
  ];
  const FIGHT_NAMES = ['First Duel', 'Second Duel', 'Third Duel', 'Fourth Duel', 'Semifinal', 'Grand Final'];
  const G = {
    theme: store.get('theme', 'neon'), weapon: 'katana', shield: 'kite', perks: [],
    scene: null, fights: null,
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
    const b = $('#btn-theme'); if (b) b.textContent = t === 'neon' ? 'Neon' : 'Primal';
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
    t0: 0, tAtk: null, tBlk: null, timerId: 0, lastTick: 0, paused: 0,
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
        if (!this.resolve || this.paused || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
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
    // the help guide freezes the 3-second clock while it is open
    pause() { if (this.resolve && !this.paused) this.paused = performance.now(); },
    resume() {
      if (!this.paused) return;
      const d = performance.now() - this.paused; this.paused = 0;
      this.t0 += d; if (this.tAtk != null) this.tAtk += d; if (this.tBlk != null) this.tBlk += d;
    },
    startTimer() {
      this.t0 = performance.now(); this.tAtk = null; this.tBlk = null; this.lastTick = 3; this.paused = 0;
      clearInterval(this.timerId);
      this.timerId = setInterval(() => {
        if (this.paused) return;
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
        b.querySelector('small').textContent = t === 'rest' ? '+rest' : '⚡' + BD.attackCost(me, t, n);
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
      const chip = (cls, txt) => `<span class="hc ${cls || ''}">${txt}</span>`;
      const c = [];
      c.push(chip('', 'Streak ' + '●'.repeat(n) + '○'.repeat(3 - n)));
      if (n === 1) c.push(chip('', 'new height'));
      else if (n === 2) c.push(chip('warn', 'parry risk'));
      else if (n >= 3) c.push(chip('warn', 'finisher: Heavy / Thrust'));
      if (me.open) c.push(chip('bad', 'You are OPEN'));
      if (foe.open) c.push(chip('good', 'Rival OPEN: any hit lands'));
      if (s.type && s.type !== 'rest') {
        const cb = BD.findCombo(me.chain.map((x) => x.type).concat(s.type));
        if (cb) c.push(chip('good', `${cb.name} ×${cb.mult}`));
      }
      $('#hint').innerHTML = c.join('');
      const r = me.mods.reader && this.habit && BD.readout(this.habit);
      $('#reader').textContent = r ? `Hawk Eye: attacks ${ZN[r.zone]} ${Math.round(r.zoneP * 100)}% · blocks ${ZN[r.block]} ${Math.round(r.blockP * 100)}% · ${TN(r.type)} ${Math.round(r.typeP * 100)}%` : '';
    },
    choose(me, foe, habit) {
      this.me = me; this.foe = foe; this.habit = habit; this.sel = { type: null, zone: null, block: null };
      vitals(me, foe);
      $('#panel').classList.remove('locked');
      this.refresh();
      return new Promise((res) => { this.resolve = res; this.startTimer(); });
    },
  };

  // ---------- screens ----------
  const fx = (n) => (+n.toFixed(2)).toString();
  const bar = (label, v, max, txt) => `<span class="bl">${label}</span><span class="bt"><i style="width:${Math.round(100 * Math.min(1, v / max))}%"></i></span><span class="bv">${txt}</span>`;
  const WEAPON_STATS = (w) => {
    const rows = `<div class="bars">${bar('Health', w.hp, 120, w.hp)}${bar('Quick', w.dmg.quick, 1.6, '×' + fx(w.dmg.quick))}${bar('Heavy', w.dmg.heavy, 1.4, '×' + fx(w.dmg.heavy))}` +
      `${bar('Thrust', w.dmg.thrust, 1.3, '×' + fx(w.dmg.thrust))}${bar('Recovery', w.regen, 10, '+' + w.regen)}</div>`;
    const cost = `<div class="cst">Stamina cost ×: Quick ${fx(w.cost.quick)} · Heavy ${fx(w.cost.heavy)} · Thrust ${fx(w.cost.thrust)} · Feint ${fx(w.cost.feint)}` +
      (w.zoneMult ? `<br>Direction: High ×${w.zoneMult[0]} · Mid ×${w.zoneMult[1]} · Low ×${w.zoneMult[2]}` : '') + '</div>';
    return rows + cost;
  };
  const weaponBody = (w, label) => `<small class="lbl">${label}</small><h3>${w.name}</h3><p>${w.desc}</p>` +
    `<div class="trait">${w.trait}</div>${WEAPON_STATS(w)}`;
  const shieldBody = (sh, w) => `<div class="shl">${BD.Guide.shieldIcon(sh.id, 30)}<span><b>${sh.name}</b>${w && w.twoHanded ? ' (two-handed grip)' : ''}<br>${sh.trait}</span></div>`;
  const weaponCard = (w, label, cls, sh) => `<div class="card static ${cls || ''}">${weaponBody(w, label)}${sh ? shieldBody(sh, w) : ''}</div>`;

  async function titleScreen() {
    for (;;) {
      const v = await ask(`<img class="app-icon" src="${globalThis.BD_ICON || 'icons/icon-192.png'}" alt="" width="88" height="88"><h2>Blade Duels</h2>
        <p class="tagline">${ROSTER.length} rivals. One champion.</p>
        <div class="feats"><span>${BD.Guide.ATK.heavy}<b>Pick in secret</b></span><span>${BD.Guide.shieldIcon('kite', 34)}<b>${BD.WEAPON_IDS.length} weapons</b></span><span>${BD.Guide.ATK.quick}<b>3 s a turn</b></span></div>
        <div><button class="cta" data-val="go">Play</button></div>
        <div><button class="cta alt" data-val="guide">How to play</button></div>`);
      if (v !== 'guide') break;
      await BD.Guide.open({ final: 'Back to the menu' }); store.set('seen', '1');
    }
    // first time: walk through the basics before the first fight (can be skipped)
    if (store.get('seen', '0') !== '1') { await BD.Guide.open({ final: 'Start the tournament' }); store.set('seen', '1'); }
  }

  // compact progress strip for the choice screens (the full ladder is kept for the end screen)
  function stripHtml(cur) {
    const pips = G.fights.map((f, i) => {
      const st = f.won === true ? 'done' : f.won === false ? 'lost' : i === cur ? 'now' : 'next';
      const mark = f.won === true ? '✔' : f.won === false ? '✘' : i === cur ? '⚔' : String(i + 1);
      return `<span class="pip ${st}" title="${i > cur ? 'Locked' : esc(f.foe.name)}">${mark}</span>`;
    });
    return `<div class="strip" aria-label="Tournament progress">${pips.join('')}</div>`;
  }

  function ladderHtml(cur) {
    const rows = G.fights.map((f, i) => {
      const st = f.won === true ? 'done' : f.won === false ? 'lost' : i === cur ? 'now' : 'next';
      const sp = f.foe, hidden = i > cur;
      const mark = f.won === true ? '✔' : f.won === false ? '✘' : i === cur ? '⚔' : String(i + 1);
      return `<div class="rung ${st}"><span class="mk">${mark}</span><span class="nm"><span class="dot" style="background:${hidden ? '#555' : sp.color}"></span>` +
        `${hidden ? '???' : esc(sp.name)}<small>${FIGHT_NAMES[i]}</small></span><span class="lv">${stars(sp.level).slice(0, sp.level)}</span></div>`;
    });
    return `<div class="ladder">${rows.join('')}</div>`;
  }

  async function fightScreen(i) {
    const f = G.fights[i], foe = f.foe;
    const perks = (G.perks.length ? '<ul class="perks">' + G.perks.map((id) => { const p = BD.PERKS.find((x) => x.id === id); return `<li>✔ ${p.name}: ${p.desc}</li>`; }).join('') + '</ul>' : '');
    await ask(`<h2>Fight ${i + 1} of ${G.fights.length} · ${FIGHT_NAMES[i]}</h2>${stripHtml(i)}
      <div class="vs"><b>${esc(ME.name)} vs ${esc(foe.name)}</b> — ${esc(foe.title)}<br>level ${stars(foe.level)}<br><span class="taunt">“${esc(foe.taunt)}”</span></div>
      <div class="brief"><p><b>Their style:</b> ${esc(foe.style)}</p><p><b>How to counter:</b> ${esc(foe.counter)}</p></div>
      <div class="cards duo">${weaponCard(BD.WEAPONS[f.weapon], 'Your weapon', 'mine', BD.SHIELDS[f.shield])}${weaponCard(BD.WEAPONS[foe.weapon], esc(foe.name) + '\'s weapon', 'theirs', BD.SHIELDS[foe.shield])}</div>${perks}
      <button class="cta" data-val="fight">Fight!</button>`);
  }

  // Before every fight: three weapons you have not used yet, and you see the rival's weapon first.
  async function weaponScreen(i, options) {
    const f = G.fights[i], foe = f.foe;
    const cards = options.map((id) => `<button class="card" data-val="${id}">${weaponBody(BD.WEAPONS[id], 'Pick')}</button>`).join('');
    return ask(`<h2>Fight ${i + 1} of ${G.fights.length} · Choose your weapon</h2>${stripHtml(i)}
      <div class="vs"><b>${esc(foe.name)}</b> — ${esc(foe.title)}<br>carries:</div>
      <div class="cards duo">${weaponCard(BD.WEAPONS[foe.weapon], esc(foe.name) + '\'s weapon', 'theirs', BD.SHIELDS[foe.shield])}</div>
      <p>Pick the weapon that counters it.</p><div class="cards">${cards}</div>`);
  }

  // Off-hand: any shield, or none for two-handing. Two-handed weapons skip this (no shield possible).
  async function shieldScreen(i, weaponId) {
    const ids = BD.legalShields(weaponId);
    if (ids.length === 1) return ids[0];
    const foe = G.fights[i].foe, w = BD.WEAPONS[weaponId];
    const cards = ids.map((id) => { const sh = BD.SHIELDS[id]; return `<button class="card" data-val="${id}"><small class="lbl">Off-hand</small><div class="ico">${BD.Guide.shieldIcon(sh.id, 52)}</div><h3>${sh.name}</h3><p>${sh.desc}</p><div class="trait">${sh.trait}</div></button>`; }).join('');
    return ask(`<h2>Fight ${i + 1} of ${G.fights.length} · Off-hand</h2>
      <div class="vs"><b>${esc(foe.name)}</b> carries a ${BD.WEAPONS[foe.weapon].name} and ${foe.shield === 'none' ? 'no shield' : 'a ' + BD.SHIELDS[foe.shield].name}.<br>You hold a ${w.name}.</div>
      <p>Shield or no shield? A shield guards, going without hits harder.</p><div class="cards">${cards}</div>`);
  }

  async function perkScreen() {
    const pool = BD.PERKS.filter((p) => !G.perks.includes(p.id)).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!pool.length) return;
    const cards = pool.map((p) => `<button class="card" data-val="${p.id}"><h3>${p.name}</h3><p>${p.desc}</p></button>`).join('');
    const id = await ask(`<h2>Victory!</h2><p>Pick an upgrade for the next fight.</p><div class="cards">${cards}</div>`);
    G.perks.push(id);
  }

  async function endScreen(champion, r) {
    BD.Audio.sfx(champion ? 'win' : 'lose');
    const html = champion
      ? `<h2>Champion of the Supreme Blade!</h2><p>You beat all ${G.fights.length} rivals with ${G.fights.length} different weapons.</p>${ladderHtml(G.fights.length)}`
      : `<h2>Eliminated</h2><p>You fell in fight ${r + 1} of ${G.fights.length} (${FIGHT_NAMES[r].toLowerCase()}). The combo tree rewards whoever reads, not whoever insists.</p>${ladderHtml(r)}`;
    return ask(html + `<div><button class="cta" data-val="again">Try again</button></div>`);
  }

  // ---------- recap of the last turn + a read on the rival ----------
  const ZA = ['▲', '▬', '▼'];
  const zl = (z) => (z == null || z < 0 ? '–' : ZA[z] + ' ' + ZN[z]);
  function outcomeOf(e, mine) {
    const d = e.dmg || 0, g = mine ? 'good' : 'bad', b = mine ? 'bad' : 'good';
    switch (e.kind) {
      case 'hit': return [(e.counter ? 'Counter hit −' : 'Hit −') + d, g];
      case 'punish': return ['Punish −' + d, g];
      case 'block': return e.perfect ? ['Perfect block', b] : [d > 0 ? 'Blocked −' + d : 'Blocked', 'neutral'];
      case 'guardbreak': return ['Guard break −' + d, g];
      case 'parry': return [mine ? 'Parried' : 'You parried', b];
      case 'interrupt': return ['Cut off', b];
      case 'feintOpen': return [mine ? 'They are open' : 'You are open', g];
      case 'whiff': return ['Missed', 'neutral'];
      default: return ['Rested', 'neutral'];
    }
  }
  const recap = {
    hist: [],
    reset() { this.hist = []; const el = $('#recap'); el.hidden = true; el.innerHTML = ''; },
    read() {
      const h = this.hist.slice(-8), n = h.length;
      if (n < 3) return '';
      const atk = h.filter((m) => m.type !== 'rest');
      const top = (arr) => { const c = {}; arr.forEach((k) => { c[k] = (c[k] || 0) + 1; }); const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return k == null ? null : [k, c[k]]; };
      const parts = [];
      const z = top(atk.map((m) => m.zone)), bl = top(h.map((m) => m.block)), ty = top(h.map((m) => m.type));
      if (z && z[1] >= Math.ceil(atk.length * 0.5) && atk.length >= 3) parts.push(`aims <b>${zl(+z[0])}</b> ${z[1]}/${atk.length}`);
      if (bl && bl[1] >= Math.ceil(n * 0.5)) parts.push(`blocks <b>${zl(+bl[0])}</b> ${bl[1]}/${n}`);
      const tips = { heavy: 'Heavy → use Quick', quick: 'Quick → skip Heavy', thrust: 'Thrust → no Feint', feint: 'Feint → Thrust it', rest: 'rests → press on' };
      if (ty && ty[1] >= Math.ceil(n * 0.4) && tips[ty[0]]) parts.push(tips[ty[0]]);
      return parts.length ? parts.join(' · ') : 'no clear habit yet';
    },
    update(mvA, mvB, res) {
      this.hist.push({ type: mvB.type, zone: mvB.zone, block: mvB.block });
      const ea = res.events.find((e) => e.src === 'a'), eb = res.events.find((e) => e.src === 'b');
      const line = (who, mv, e, mine, vs, foeBlock) => {
        const [txt, cls] = outcomeOf(e, mine);
        const body = mv.type === 'rest' ? `<b>${who}</b> rested <i>· ${vs}</i> ${zl(foeBlock)}` : `<b>${who}</b> ${TN(mv.type)} ${zl(mv.zone)} <i>· ${vs}</i> ${zl(foeBlock)}`;
        return `<div class="rc-line">${body} <span class="res ${cls}">${txt}</span></div>`;
      };
      const rd = this.read();
      const el = $('#recap');
      el.innerHTML = line('They', mvB, eb, false, 'you blocked', mvA.block) + line('You', mvA, ea, true, 'they blocked', mvB.block) + (rd ? `<div class="rc-read"><i>Habits:</i> ${rd}</div>` : '');
      el.hidden = false;
    },
  };

  // ---------- match ----------
  function snapF(f) { return { hp: f.hp, st: f.st, chain: f.chain.slice(), open: f.open }; }

  async function playMatch(oppSpec) {
    const sc = G.scene;
    const me = BD.makeFighter(Object.assign({}, ME, { weapon: G.weapon, shield: G.shield, perks: G.perks, level: 3 }));
    const foe = BD.makeFighter(oppSpec);
    const brain = BD.makeBrain(foe.level, foe.persona), habit = BD.makeBrain(1, 'balanced');
    sc.setFighters(me, foe);
    const wins = { a: 0, b: 0 };
    let round = 1;
    recap.reset();
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
        recap.update(mvA, mvB, res);
        const ro = BD.roundOver(duel);
        if (ro.over) { wins[ro.winner]++; sc.hud.a.wins = wins.a; sc.hud.b.wins = wins.b; await sc.ko(ro.winner, ro.ko); break; }
      }
      round++;
    }
    return wins.a > wins.b;
  }

  // ---------- tournament ----------
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Each rival fights with a weapon from its own arsenal. Yours is chosen before the fight (see weaponScreen).
  function dealFights() {
    return ROSTER.map((r) => {
      const weapon = pickOne(r.arsenal), legal = BD.legalShields(weapon);
      const shield = pickOne(r.shields.filter((id) => legal.includes(id)).concat(legal.length === 1 ? legal : []));
      return { foe: Object.assign({}, r, { weapon, shield }), weapon: null, shield: null, won: null };
    });
  }

  async function tournament() {
    G.perks = [];
    G.fights = dealFights();
    const unused = new Set(BD.WEAPON_IDS);
    for (let i = 0; i < G.fights.length; i++) {
      const f = G.fights[i];
      f.weapon = await weaponScreen(i, shuffle(Array.from(unused)).slice(0, 3));
      unused.delete(f.weapon);
      f.shield = await shieldScreen(i, f.weapon);
      G.weapon = f.weapon; G.shield = f.shield;
      await fightScreen(i);
      f.won = await playMatch(f.foe);
      if (!f.won) { G.scene.hud.round = 1; return { champion: false, r: i }; }
      if (i < G.fights.length - 1) { BD.Audio.sfx('win'); await perkScreen(); }
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
    const fa = BD.makeFighter({ name: 'You', weapon: 'katana', color: ME.color }), fb = BD.makeFighter({ name: 'Ryuga', weapon: 'katana', color: '#e0558f' });
    G.scene.setFighters(fa, fb); G.scene.setHud('a', fa, 0); G.scene.setHud('b', fb, 0); G.scene.syncHudInstant();

    const bT = $('#btn-theme'), bS = $('#btn-sound'), bV = $('#btn-speed'), bH = $('#btn-help');
    bH.onclick = async () => { panel.pause(); BD.Audio.unlock(); await BD.Guide.open({ final: 'Back to the duel', focus: false }); store.set('seen', '1'); panel.resume(); };
    bT.onclick = () => applyTheme(G.theme === 'neon' ? 'primal' : 'neon');
    const syncSound = () => { bS.textContent = BD.Audio.muted ? 'Muted' : 'Sound'; bS.setAttribute('aria-pressed', String(!BD.Audio.muted)); };
    bS.onclick = () => { BD.Audio.muted = !BD.Audio.muted; store.set('mute', BD.Audio.muted ? '1' : '0'); syncSound(); BD.Audio.unlock(); };
    const syncSpeed = () => { bV.textContent = '×' + G.scene.speed; };
    bV.onclick = () => { G.scene.speed = G.scene.speed === 1 ? 1.6 : 1; store.set('speed', G.scene.speed); syncSpeed(); };
    syncSound(); syncSpeed();

    await titleScreen(); BD.Audio.unlock();
    for (;;) {
      const r = await tournament();
      await endScreen(r.champion, r.r);
    }
  }

  // installable web app: offline fallback (network-first, so updates always show up). Not inside iframes.
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window) {
      window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    }
  } catch (e) { /* no service worker */ }

  window.BDGame = { G, panel, scene: () => G.scene };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', main); else main();
})();
