// WebAudio sound: every sound is synthesized, no audio files.
// All calls are guarded so a missing or blocked AudioContext never breaks play.

let ctx = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;

export function setMuted(m) {
  muted = m;
  if (engineGain) engineGain.gain.value = 0;
  if (sirenGain) sirenGain.gain.value = 0;
}

export function isMuted() {
  return muted;
}

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    return true;
  } catch (e) {
    return false;
  }
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch (e) { /* ignore */ }
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || muted) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  } catch (e) { /* ignore */ }
}

export function startEngine() {
  if (!ctx || muted || engineOsc) return;
  try {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    engineOsc.connect(f).connect(engineGain).connect(ctx.destination);
    engineOsc.start();
  } catch (e) { /* ignore */ }
}

export function setEngine(speed01) {
  if (!engineOsc || !engineGain || muted) return;
  try {
    engineOsc.frequency.value = 52 + speed01 * 95;
    engineGain.gain.value = 0.02 + speed01 * 0.045;
  } catch (e) { /* ignore */ }
}

export function stopEngine() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch (e) { /* ignore */ }
  engineOsc = null;
  engineGain = null;
}

export function startSiren() {
  if (!ctx || muted || sirenOsc) return;
  try {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.035;
    sirenOsc.connect(sirenGain).connect(ctx.destination);
    sirenOsc.start();
    sirenTimer = 0;
  } catch (e) { /* ignore */ }
}

export function updateSiren(dt) {
  if (!sirenOsc || muted) return;
  sirenTimer += dt;
  try {
    sirenOsc.frequency.value = sirenTimer % 0.9 < 0.45 ? 720 : 980;
  } catch (e) { /* ignore */ }
}

export function stopSiren() {
  if (!sirenOsc) return;
  try { sirenOsc.stop(); } catch (e) { /* ignore */ }
  sirenOsc = null;
  sirenGain = null;
}

export const sfx = {
  shot() { noiseBurst(0.09, 0.22, 2600); tone(190, 0.07, 'square', 0.08, 60); },
  enemyShot() { noiseBurst(0.07, 0.1, 1800); },
  pickup() { tone(660, 0.09, 'sine', 0.14, 990); },
  coin() { tone(880, 0.12, 'sine', 0.14, 1320); tone(1320, 0.16, 'sine', 0.1, 1760); },
  crash() { noiseBurst(0.18, 0.25, 500); },
  bust() { tone(220, 0.5, 'sawtooth', 0.14, 110); },
  mission() { tone(523, 0.14, 'sine', 0.15); setTimeout(() => tone(659, 0.14, 'sine', 0.15), 130); setTimeout(() => tone(784, 0.22, 'sine', 0.16), 260); },
  enter() { tone(330, 0.08, 'square', 0.08, 440); },
};
