// audio.js — all sound is synthesized with WebAudio. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenTimer = 0;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      this.engineOsc.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) {
      this.ctx = null;
    }
  }

  engine(speed, inCar) {
    if (!this.ctx || !this.engineOsc) return;
    const target = inCar ? 0.035 + Math.min(0.05, Math.abs(speed) / 6000) : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(46 + Math.abs(speed) * 0.16, this.ctx.currentTime, 0.08);
  }

  blip(freq = 880, dur = 0.08, vol = 0.12) {
    if (!this.ctx || !this.enabled) return;
    try {
      const o = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, this.ctx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(gn);
      gn.connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch (e) { /* headless: ignore */ }
  }

  gunshot() {
    if (!this.ctx || !this.enabled) return;
    try {
      const len = this.ctx.sampleRate * 0.09;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gn = this.ctx.createGain();
      gn.gain.value = 0.22;
      src.connect(gn);
      gn.connect(this.ctx.destination);
      src.start();
    } catch (e) { /* ignore */ }
  }

  siren(dt, wanted) {
    if (!this.ctx) return;
    if (wanted >= 2) {
      this.sirenTimer += dt;
      const f = Math.floor(this.sirenTimer * 1.4) % 2 === 0 ? 660 : 520;
      if (Math.floor(this.sirenTimer * 1.4) !== this._lastSirenStep) {
        this._lastSirenStep = Math.floor(this.sirenTimer * 1.4);
        this.blip(f, 0.32, 0.045);
      }
    }
  }

  pickup() { this.blip(1320, 0.1, 0.12); this.blip(1760, 0.12, 0.1); }
  mission() { this.blip(660, 0.12, 0.12); this.blip(880, 0.12, 0.12); this.blip(1100, 0.2, 0.12); }
}
