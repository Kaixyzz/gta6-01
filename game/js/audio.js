// WebAudio sound: everything synthesized, no audio files.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine hum: low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 320;
      this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: alternating two-tone triangle.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (e) { /* audio unavailable: play silent */ }
  }

  engine(speed01, inCar) {
    if (!this.ctx || !this.engineOsc) return;
    const target = inCar ? 0.035 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 90, this.ctx.currentTime, 0.1);
  }

  siren(active, dt) {
    if (!this.ctx || !this.sirenOsc) return;
    if (active && !this.sirenOn) { this.sirenOn = true; this.sirenTimer = 0; }
    if (!active && this.sirenOn) {
      this.sirenOn = false;
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (this.sirenOn) {
      this.sirenTimer += dt;
      const hi = Math.floor(this.sirenTimer * 1.6) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, this.ctx.currentTime, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.02, this.ctx.currentTime, 0.1);
    }
  }

  blip(freq, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  shot() {
    if (!this.ctx) return;
    try {
      const len = this.ctx.sampleRate * 0.09;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = 0.16;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      src.connect(f); f.connect(g); g.connect(this.ctx.destination);
      src.start();
    } catch (e) { /* ignore */ }
  }

  pickup() { this.blip(880, 0.12, 0.12); setTimeout(() => this.blip(1320, 0.14, 0.1), 70); }
  cash() { this.blip(660, 0.1, 0.12); setTimeout(() => this.blip(990, 0.12, 0.12), 80); setTimeout(() => this.blip(1320, 0.16, 0.1), 170); }
  crash() { this.blip(90, 0.18, 0.2, 'square'); }
}
