/* Blade Duels - sound effects synthesized with WebAudio (no files). */
(function () {
  const BD = (globalThis.BD = globalThis.BD || {});
  let ctx = null, master = null, noiseBuf = null;
  const A = { muted: false };

  function init() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }
  function noise(dur, type, f0, f1, vol) {
    const t = ctx.currentTime, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; flt.type = type; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    flt.Q.value = 1.2; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, vol, delay) {
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  const SFX = {
    tick: () => tone('square', 880, 700, 0.05, 0.09),
    splat: () => { noise(0.22, 'lowpass', 1100, 140, 0.55); tone('sine', 130, 55, 0.2, 0.35); },
    heart: () => { tone('sine', 62, 38, 0.16, 0.8); tone('sine', 58, 36, 0.2, 0.7, 0.2); },
    whoosh: () => noise(0.3, 'bandpass', 400, 1800, 0.12),
    swing: () => noise(0.16, 'bandpass', 900, 3200, 0.3),
    hit: () => { noise(0.14, 'lowpass', 2400, 200, 0.7); tone('sine', 150, 50, 0.18, 0.7); },
    heavy: () => { noise(0.3, 'lowpass', 3000, 120, 0.9); tone('sine', 110, 35, 0.35, 0.9); },
    block: () => { tone('triangle', 1700, 1400, 0.22, 0.28); tone('square', 2450, 2300, 0.12, 0.1); noise(0.05, 'highpass', 4000, 6000, 0.25); },
    parry: () => { tone('triangle', 2200, 2000, 0.5, 0.3); tone('triangle', 3300, 3100, 0.45, 0.2, 0.02); noise(0.08, 'highpass', 5000, 8000, 0.35); },
    break: () => { noise(0.4, 'bandpass', 3000, 400, 0.7); tone('sawtooth', 400, 70, 0.3, 0.3); },
    feint: () => tone('sine', 900, 300, 0.25, 0.2),
    ko: () => { tone('sine', 90, 25, 1.1, 1); noise(0.6, 'lowpass', 1500, 60, 0.8); },
    ui: () => tone('square', 660, 880, 0.07, 0.07),
    ok: () => { tone('square', 523, 523, 0.08, 0.08); tone('square', 784, 784, 0.12, 0.08, 0.08); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.25, 0.18, i * 0.11)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.3, 0.1, i * 0.16)); },
  };

  A.sfx = function (name) {
    if (A.muted || !init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    try { SFX[name] && SFX[name](); } catch (e) { /* audio is optional */ }
  };
  A.unlock = function () { if (init() && ctx.state === 'suspended') ctx.resume(); };
  BD.Audio = A;
})();
