/* Blade Duels - illustrated "How to play" guide (inline SVG, follows the neon / primal theme).
 * BD.Guide.open() shows the pages in the overlay and resolves when the player closes it.
 * BD.Guide.shieldIcon(id) is also used by the shield cards. */
(function () {
  const BD = (globalThis.BD = globalThis.BD || {});

  const V = { acc: 'var(--acc)', acc2: 'var(--acc2)', ink: 'var(--ink)', dim: 'var(--dim)', line: 'var(--line)', panel: 'var(--panel)', ok: 'var(--ok)', warn: 'var(--warn)' };
  // style helpers: fill / stroke / width
  const S = (fill, stroke, w) => `style="fill:${fill || 'none'};stroke:${stroke || 'none'};stroke-width:${w || 0};stroke-linecap:round;stroke-linejoin:round"`;
  const T = (x, y, txt, o) => { o = o || {}; return `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" style="fill:${o.c || V.ink};font-size:${o.s || 13}px;font-weight:${o.w || 600};font-family:inherit">${txt}</text>`; };
  const svg = (w, h, label, inner) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${inner}</svg>`;

  // ---------- icons ----------
  const ic = (inner, size) => `<svg class="ic" viewBox="0 0 34 34" width="${size || 34}" height="${size || 34}" aria-hidden="true">${inner}</svg>`;
  const ATK = {
    quick: ic(`<path d="M6 26 L18 8 M15 28 L27 10" ${S('none', V.acc, 3.5)}/>`),
    heavy: ic(`<path d="M5 28 L27 6" ${S('none', V.acc2, 7)}/><path d="M22 27 L30 29 M25 21 L32 21" ${S('none', V.dim, 2)}/>`),
    thrust: ic(`<path d="M3 17 H28" ${S('none', V.warn, 3.5)}/><path d="M21 9 L29 17 L21 25" ${S('none', V.warn, 3.5)}/>`),
    feint: ic(`<path d="M5 27 Q12 5 28 12" style="fill:none;stroke:${V.ink};stroke-width:3;stroke-dasharray:3 3.5;stroke-linecap:round"/><path d="M23 6 L29 12 L22 16" ${S('none', V.ink, 3)}/>`),
  };

  function shieldIcon(id, size) {
    const st = S(V.panel, V.acc, 3), st2 = S('none', V.dim, 2);
    let g;
    if (id === 'none') g = `<rect x="19" y="24" width="22" height="20" rx="7" ${st}/><path d="M25 24 V19 M30 24 V17 M35 24 V19" ${S('none', V.acc, 3)}/>`;
    else if (id === 'kite') g = `<path d="M12 9 H48 V30 Q48 46 30 56 Q12 46 12 30 Z" ${st}/><path d="M30 14 V46 M18 26 H42" ${st2}/>`;
    else if (id === 'tower') g = `<rect x="17" y="5" width="26" height="50" rx="5" ${st}/><path d="M30 5 V55 M17 30 H43" ${st2}/><circle cx="23" cy="12" r="2" style="fill:${V.dim}"/><circle cx="37" cy="12" r="2" style="fill:${V.dim}"/><circle cx="23" cy="48" r="2" style="fill:${V.dim}"/><circle cx="37" cy="48" r="2" style="fill:${V.dim}"/>`;
    else if (id === 'spiked') {
      let sp = '';
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283, b1 = a - 0.2, b2 = a + 0.2, r1 = 15, r2 = 25; sp += `<path d="M${(30 + Math.cos(b1) * r1).toFixed(1)} ${(30 + Math.sin(b1) * r1).toFixed(1)} L${(30 + Math.cos(a) * r2).toFixed(1)} ${(30 + Math.sin(a) * r2).toFixed(1)} L${(30 + Math.cos(b2) * r1).toFixed(1)} ${(30 + Math.sin(b2) * r1).toFixed(1)} Z" ${S(V.dim, V.acc, 1.5)}/>`; }
      g = sp + `<circle cx="30" cy="30" r="16" ${st}/><path d="M25 32 L30 15 L35 32 Z" ${S(V.acc, V.acc, 1)}/>`;
    } else g = `<circle cx="30" cy="30" r="19" ${st}/><circle cx="30" cy="30" r="10" ${st2}/><circle cx="30" cy="30" r="4" style="fill:${V.acc}"/>`;
    return `<svg class="ic" viewBox="0 0 60 60" width="${size || 56}" height="${size || 56}" aria-hidden="true">${g}</svg>`;
  }

  // small weapon glyphs, drawn left to right on a 60x30 box
  function weaponGlyph(kind) {
    if (kind === 'axe') return `<path d="M8 22 L44 8" ${S('none', V.dim, 3.5)}/><path d="M38 4 Q52 8 50 20 Q42 18 38 14 Z" ${S(V.panel, V.acc2, 2.5)}/>`;
    if (kind === 'spear') return `<path d="M4 24 L46 10" ${S('none', V.dim, 3)}/><path d="M44 5 L58 8 L48 17 Z" ${S(V.panel, V.acc2, 2.5)}/>`;
    return `<path d="M6 25 L50 7" ${S('none', V.ink, 4)}/><path d="M12 14 L20 26" ${S('none', V.warn, 3.5)}/>`;
  }

  // ---------- pages ----------
  const row = (a, b, text) => `<div class="gr"><div class="gc">${a}<span class="vs2">vs</span>${b}</div><p>${text}</p></div>`;
  const chip = (icon, label) => `<span class="gchip">${icon}<small>${label}</small></span>`;

  const PAGES = [
    {
      title: 'Three secret picks',
      art: () => {
        const card = (x, n, name, inner) => `<rect x="${x}" y="6" width="108" height="112" rx="10" ${S(V.panel, V.line, 2)}/><circle cx="${x + 18}" cy="26" r="11" ${S(V.acc2, 'none', 0)}/>${T(x + 18, 31, n, { c: '#fff', s: 14, w: 800 })}${inner}${T(x + 54, 108, name, { s: 14, w: 800 })}`;
        const sword = (x) => `<path d="M${x + 36} 84 L${x + 72} 40" ${S('none', V.acc2, 5)}/><path d="M${x + 38} 62 L${x + 52} 76" ${S('none', V.warn, 4)}/>`;
        const dirs = (x) => `<rect x="${x + 32}" y="40" width="44" height="9" rx="3" ${S(V.acc2)}/><rect x="${x + 32}" y="55" width="44" height="9" rx="3" ${S(V.dim)}/><rect x="${x + 32}" y="70" width="44" height="9" rx="3" ${S(V.dim)}/>${T(x + 86, 48, '▲', { s: 10, c: V.acc2 })}${T(x + 86, 78, '▼', { s: 10, c: V.dim })}`;
        const shield = (x) => `<path d="M${x + 54} 38 L${x + 78} 46 L${x + 78} 62 Q${x + 78} 78 ${x + 54} 90 Q${x + 30} 78 ${x + 30} 62 L${x + 30} 46 Z" ${S(V.panel, V.acc, 3.5)}/>`;
        return svg(360, 150, 'Three picks per turn: attack, direction and block',
          card(0, '1', 'Attack', sword(0)) + card(126, '2', 'Direction', dirs(126)) + card(252, '3', 'Block', shield(252)) +
          T(180, 142, 'Both sides pick at once. Then the turn plays out.', { s: 12, c: V.dim, w: 500 }));
      },
      body: '<p>Every turn you choose <b>how</b> to attack, <b>where</b> (high, mid or low) and <b>where to block</b>. The rival chooses too, and neither sees the other\'s picks until the turn plays out.</p><p>Once all three are set the turn goes by itself. Everything you do costs <b>stamina</b>; with none left you can only rest.</p>',
    },
    {
      title: 'Height decides everything',
      art: () => {
        const ZY = [48, 90, 146];
        const scene = (ox, hit, blk, ok, label) => {
          const cx = ox + 100;
          return `<circle cx="${cx}" cy="40" r="13" ${S(V.panel, V.ink, 2.5)}/><rect x="${cx - 20}" y="56" width="40" height="62" rx="7" ${S(V.panel, V.ink, 2.5)}/><path d="M${cx - 10} 118 L${cx - 13} 172 M${cx + 10} 118 L${cx + 13} 172" ${S('none', V.ink, 3)}/>` +
            `<path d="M${ox + 6} ${ZY[hit]} H${cx - 30}" ${S('none', V.acc2, 4)}/><path d="M${cx - 38} ${ZY[hit] - 7} L${cx - 28} ${ZY[hit]} L${cx - 38} ${ZY[hit] + 7}" ${S('none', V.acc2, 4)}/>` +
            `<path d="M${cx + 30} ${ZY[blk] - 16} H${cx + 52} V${ZY[blk] + 2} Q${cx + 52} ${ZY[blk] + 14} ${cx + 41} ${ZY[blk] + 20} Q${cx + 30} ${ZY[blk] + 14} ${cx + 30} ${ZY[blk] + 2} Z" ${S(V.panel, V.acc, 3)}/>` +
            T(ox + 90, 198, label, { c: ok ? V.ok : V.warn, s: 13, w: 800 });
        };
        const labels = [['H', 52], ['M', 94], ['L', 150]].map(([t, y]) => T(8, y, t, { a: 'start', s: 11, c: V.dim, w: 800 })).join('');
        return svg(380, 206, 'A block at the same height stops the attack; a different height does not',
          labels + scene(14, 0, 0, true, 'Same height: blocked') + scene(196, 0, 2, false, 'Different height: HIT'));
      },
      body: '<p>The arrow is your attack, the shield is their block. <b>Same height = blocked. Different height = it lands.</b></p><p>High hits hardest (×1.2), low the least (×0.85). Some weapons bend those numbers.</p><p>While a turn plays, the screen marks <b>H / M / L</b> on each side: where they attacked, where you blocked, where you attacked, where they blocked. A recap of the last turn stays above the buttons, with a read on the rival\'s habits.</p>',
    },
    {
      title: 'The four attacks',
      art: () => '',
      body: row(chip(ATK.quick, 'Quick'), chip(ATK.heavy, 'their Heavy'), 'Your Quick cuts a Heavy short and counters it for <b>×1.25</b>.') +
        row(chip(ATK.heavy, 'Heavy'), chip(shieldIcon('kite', 34), 'a block'), '<b>Guard break</b>: partial damage, drains their stamina and ends their streak.') +
        row(chip(ATK.feint, 'Feint'), chip(shieldIcon('kite', 34), 'a block'), 'No damage, but they are left <b>OPEN</b>: next turn their block does not count and hits do +20%.') +
        row(chip(ATK.thrust, 'Thrust'), chip(ATK.feint, 'their Feint'), '<b>Punish</b>: ×1.5 damage that ignores their block.') +
        '<p class="gnote">A blocked Quick does nothing, and a blocked Thrust only leaks a little. Rest recovers stamina but leaves you doing nothing this turn.</p>',
    },
    {
      title: 'Streaks and combos',
      art: () => {
        const bar = (y, w, label, c) => `<rect x="${(380 - w) / 2}" y="${y}" width="${w}" height="32" rx="8" ${S(V.panel, c, 3)}/>${T(190, y + 21, label, { s: 12.5, w: 700 })}`;
        return svg(380, 160, 'Each move in a streak narrows the options',
          bar(4, 360, '1st move: any attack, any height', V.dim) + bar(42, 316, '2nd: fewer attacks, a new height', V.ink) +
          bar(80, 272, '3rd: adjacent height, 1-2 attacks', V.acc) + bar(118, 228, '4th: Heavy or Thrust only', V.acc2));
      },
      body: '<p>Each attack that is not cut off adds to your <b>streak</b>, and your options shrink. The 4th move is a forced finisher, then the streak resets.</p>' +
        '<div class="gcombos"><span><b>Eclipse</b> Feint · Thrust · Heavy <i>×2.0</i></span><span><b>Guillotine</b> Quick · Quick · Heavy <i>×1.8</i></span><span><b>Tide</b> Quick · Heavy · Thrust <i>×1.7</i></span><span><b>Decoy</b> Feint · Heavy <i>×1.4</i></span></div>' +
        '<p class="gnote">Careful: a Quick or Thrust that gets blocked deep in a streak is a <b>parry</b>. You end up open.</p>',
    },
    {
      title: 'Beat the clock',
      art: () => {
        const pt = (a, r) => [(190 + Math.cos(a * Math.PI / 180) * r).toFixed(1), (140 - Math.sin(a * Math.PI / 180) * r).toFixed(1)];
        const [nx, ny] = pt(52, 104), [px, py] = pt(36, 150);
        return `<svg viewBox="0 -24 380 204" role="img" aria-label="Faster picks hit harder: from times 0.8 when slow to times 1.3 when instant"><defs><linearGradient id="gclk" x1="0" x2="1"><stop offset="0" style="stop-color:${V.dim}"/><stop offset="1" style="stop-color:${V.acc2}"/></linearGradient></defs>` +
          `<path d="M40 140 A150 150 0 0 1 340 140" style="fill:none;stroke:url(#gclk);stroke-width:16;stroke-linecap:round"/>` +
          `<path d="M${px} ${py} A150 150 0 0 1 340 140" ${S('none', V.ok, 16)}/>` +
          `<path d="M190 140 L${nx} ${ny}" ${S('none', V.ink, 4)}/><circle cx="190" cy="140" r="8" style="fill:${V.ink}"/>` +
          T(40, 170, 'Slow ×0.8', { s: 12, c: V.dim }) + T(340, 170, 'Instant ×1.3', { s: 12, c: V.acc2 }) + T(190, 172, '3 s per turn', { s: 15, w: 800 }) +
          T(322, 8, 'Perfect block', { s: 11, c: V.ok, w: 800 }) + `</svg>`;
      },
      body: '<p>You have <b>3 seconds</b> per turn. The sooner you lock in, the harder you hit (<b>×0.8 slow to ×1.3 instant</b>) and the less a guard break or thrust gets through your block.</p><p>Block <b>very fast</b> (green zone) and it is a <b>perfect block</b>: it also breaks their streak. If time runs out, the missing picks are filled in at random with no bonus.</p>',
    },
    {
      title: 'Weapon and off-hand',
      art: () => {
        const wcard = (x, kind, name) => `<rect x="${x}" y="22" width="112" height="52" rx="9" ${S(V.panel, V.line, 2)}/><g transform="translate(${x + 26} 24)">${weaponGlyph(kind)}</g>${T(x + 56, 69, name, { s: 11, c: V.dim, w: 600 })}`;
        const scard = (x, id, name) => `<rect x="${x}" y="116" width="66" height="70" rx="9" ${S(V.panel, V.line, 2)}/><g transform="translate(${x + 7} 120) scale(.86)">${shieldIcon(id, 60).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>${T(x + 33, 180, name, { s: 10, c: V.dim, w: 600 })}`;
        return svg(380, 192, 'Pick one of three weapons, then a shield or no shield',
          T(4, 14, '1  Pick 1 of 3 weapons', { a: 'start', s: 12, c: V.acc2, w: 800 }) + wcard(2, 'sword', 'Blade') + wcard(134, 'axe', 'Axe') + wcard(266, 'spear', 'Spear') +
          T(4, 106, '2  Choose your off-hand', { a: 'start', s: 12, c: V.acc, w: 800 }) +
          scard(2, 'buckler', 'Buckler') + scard(78, 'kite', 'Heater') + scard(154, 'tower', 'Tower') + scard(230, 'spiked', 'Spiked') + scard(306, 'none', 'None'));
      },
      body: '<p>Before every fight you <b>see the rival\'s weapon</b> first, then pick one of three weapons you have not used yet. After that you choose a shield, or go without for +12% damage and a leakier guard.</p><p class="gnote">Two-handed weapons (Greatsword, Halberd, Scythe, Bo Staff) cannot take a shield. Each rival has its own style, so read what they carry.</p>',
    },
    {
      title: 'How you win',
      art: () => {
        const names = ['Taro', 'Hana', 'Gorm', 'Kuro', 'Ren', 'Ryuga'];
        let g = '';
        names.forEach((n, i) => {
          const h = 28 + i * 14, x = 8 + i * 61;
          g += `<rect x="${x}" y="${120 - h}" width="52" height="${h}" rx="6" ${S(i === 5 ? V.acc2 : V.panel, i === 5 ? V.acc2 : V.line, 2)}/>` + T(x + 26, 116, String(i + 1), { s: 15, w: 800, c: i === 5 ? '#fff' : V.dim }) + T(x + 26, 140, n, { s: 11, c: V.dim, w: 600 });
        });
        return svg(380, 150, 'Six fights of rising difficulty', g + T(8 + 5 * 61 + 26, 120 - 28 - 5 * 14 - 8, '★', { s: 18, c: V.warn }));
      },
      body: '<p>Six fights against tougher rivals. Each fight is <b>best of 3 rounds</b>. A round ends by <b>KO</b>, or after 14 turns the fighter with more health wins.</p><p>Win a fight and you choose an <b>upgrade</b> for the next one. Lose a fight and the tournament is over. Damage shows on the bodies: there are no health bars, just how hurt they look.</p>',
    },
  ];

  // ---------- viewer ----------
  function open(opts) {
    opts = opts || {};
    const overlay = document.querySelector('#overlay');
    let i = Math.max(0, Math.min(PAGES.length - 1, opts.page || 0)), done = null, x0 = null;
    const last = PAGES.length - 1;
    function render(dir) {
      const p = PAGES[i];
      const dots = PAGES.map((_, k) => `<button class="gdot${k === i ? ' on' : ''}" data-go="${k}" aria-label="Page ${k + 1}"></button>`).join('');
      overlay.innerHTML = `<div class="screen guide" role="document">
        <div class="g-top"><span class="g-step">How to play · ${i + 1} / ${PAGES.length}</span><button class="g-skip" data-act="close">${i === last ? 'Close' : 'Skip'}</button></div>
        <h2>${p.title}</h2>
        <div class="gv ${dir || ''}">${p.art()}</div>
        <div class="g-body ${dir || ''}">${p.body}</div>
        <div class="g-dots">${dots}</div>
        <div class="g-nav">${i > 0 ? '<button class="cta alt" data-act="prev">Back</button>' : ''}<button class="cta" data-act="${i === last ? 'close' : 'next'}">${i === last ? (opts.final || 'Got it') : 'Next'}</button></div>
      </div>`;
      overlay.classList.add('on'); overlay.scrollTop = 0;
      const nx = overlay.querySelector('.g-nav .cta:last-child'); if (nx && opts.focus !== false) nx.focus({ preventScroll: true });
    }
    function go(k, dir) { if (k < 0 || k > last) return; i = k; render(dir); }
    function close() {
      overlay.onclick = null; overlay.ontouchstart = null; overlay.ontouchend = null;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('on'); overlay.innerHTML = '';
      done();
    }
    function onKey(e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (i < last) go(i + 1, 'fwd'); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, 'back'); } else if (e.key === 'Escape') { e.preventDefault(); close(); }
      e.stopPropagation();
    }
    return new Promise((resolve) => {
      done = resolve;
      overlay.onclick = (e) => {
        const b = e.target.closest('[data-act],[data-go]'); if (!b) return;
        if (BD.Audio) BD.Audio.sfx('ui');
        if (b.dataset.go != null) go(+b.dataset.go, +b.dataset.go > i ? 'fwd' : 'back');
        else if (b.dataset.act === 'next') go(i + 1, 'fwd');
        else if (b.dataset.act === 'prev') go(i - 1, 'back');
        else close();
      };
      overlay.ontouchstart = (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; };
      overlay.ontouchend = (e) => {
        if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (dx < -60) go(i + 1, 'fwd'); else if (dx > 60) go(i - 1, 'back');
      };
      document.addEventListener('keydown', onKey, true);
      render();
    });
  }

  BD.Guide = { open, shieldIcon, ATK, PAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = BD;
})();
