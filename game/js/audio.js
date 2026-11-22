// WebAudio sound effects for SOLARA BAY — everything synthesised live,
// no audio files, no network requests.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenTimer = null;
    this.muted = false;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
    }
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }
  noiseBurst(dur, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(g).connect(this.ctx.destination);
      src.start(t);
    } catch (e) {}
  }
  shoot() {
    this.noiseBurst(0.09, 0.16);
    this.blip(180, 0.07, 'sawtooth', 0.05);
  }
  enemyShoot() {
    this.noiseBurst(0.07, 0.07);
  }
  pickup() {
    this.blip(660, 0.09, 'sine', 0.1);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.1), 70);
  }
  cash() {
    this.blip(880, 0.1, 'sine', 0.1);
    setTimeout(() => this.blip(1174, 0.14, 'sine', 0.1), 80);
  }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.1), i * 110));
  }
  crash() {
    this.noiseBurst(0.18, 0.2);
  }
  setEngine(speed, maxSpeed) {
    if (!this.ctx || this.muted) return;
    try {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 420;
        this.engineOsc.connect(filt).connect(this.engineGain).connect(this.ctx.destination);
        this.engineOsc.start();
      }
      const ratio = Math.max(0, Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed)));
      this.engineOsc.frequency.setValueAtTime(55 + ratio * 130, this.ctx.currentTime);
      this.engineGain.gain.setValueAtTime(0.02 + ratio * 0.035, this.ctx.currentTime);
    } catch (e) {}
  }
  setSiren(on) {
    if (on === this.sirenOn || !this.ctx) return;
    this.sirenOn = on;
    if (on) {
      let hi = false;
      this.sirenTimer = setInterval(() => {
        if (!this.ctx || this.muted) return;
        this.blip(hi ? 960 : 720, 0.32, 'sine', 0.045);
        hi = !hi;
      }, 340);
    } else if (this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
  }
}
