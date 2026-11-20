// Sound for SOLARA BAY, all synthesized with WebAudio: no audio files.
// Everything is guarded so a browser without audio (or a headless run)
// never throws.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOn = false;
  let sirenTimer = null;
  let sirenHigh = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  function engine(speed01) {
    if (!ctx || !engineOsc) return;
    try {
      engineOsc.frequency.value = 50 + speed01 * 130;
      engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
    } catch (e) {}
  }

  function blip(freq, dur) {
    if (!ensure() || !ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 880;
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.12));
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + (dur || 0.12));
    } catch (e) {}
  }

  function shot() {
    if (!ensure() || !ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 900;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch (e) {}
  }

  function crash() {
    if (!ensure() || !ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch (e) {}
  }

  function siren(on) {
    if (on === sirenOn) return;
    sirenOn = on;
    if (!on) {
      if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
      return;
    }
    if (!ensure() || !ctx) return;
    sirenTimer = setInterval(function () {
      if (!sirenOn || !ctx) return;
      sirenHigh = !sirenHigh;
      blip(sirenHigh ? 920 : 660, 0.28);
    }, 300);
  }

  SB.Audio = { ensure: ensure, engine: engine, blip: blip, shot: shot, crash: crash, siren: siren };
})();
