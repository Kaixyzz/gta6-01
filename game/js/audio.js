// WebAudio sound for SOLARA BAY: everything is synthesized, no audio files.
// All calls are guarded so a missing AudioContext can never throw.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      return true;
    } catch (e) {
      return false;
    }
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  blip(freq = 880, dur = 0.09, type = 'sine', vol = 0.12) {
    if (!this.ensure()) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }

  gunshot() {
    if (!this.ensure()) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * 0.09);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(g).connect(this.ctx.destination);
      src.start(t);
    } catch (e) {}
  }

  crash() {
    this.blip(90, 0.18, 'sawtooth', 0.2);
  }

  engine(on, speed = 0) {
    if (!this.ensure()) return;
    try {
      if (on && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 55;
        this.engineGain.gain.value = 0.03;
        this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
        this.engineOsc.start();
      }
      if (this.engineOsc) {
        this.engineOsc.frequency.value = 50 + Math.min(1, Math.abs(speed) / 320) * 90;
        this.engineGain.gain.value = on ? 0.03 + Math.min(1, Math.abs(speed) / 320) * 0.03 : 0;
      }
    } catch (e) {}
  }

  siren(on) {
    if (!this.ensure()) return;
    try {
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'sine';
        this.sirenOsc.frequency.value = 700;
        this.sirenGain.gain.value = 0.025;
        this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
        this.sirenOsc.start();
        this.sirenTimer = setInterval(() => {
          if (this.sirenOsc) {
            this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 900 ? 650 : 1100;
          }
        }, 420);
      } else if (!on && this.sirenOsc) {
        clearInterval(this.sirenTimer);
        this.sirenTimer = null;
        const o = this.sirenOsc;
        const g = this.sirenGain;
        this.sirenOsc = null;
        this.sirenGain = null;
        g.gain.value = 0;
        o.stop();
      }
    } catch (e) {}
  }
}
