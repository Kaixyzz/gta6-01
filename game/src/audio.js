// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// Every call is guarded, so a browser without audio still plays the game fine.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function ensure() {
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
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lowpass || 1200, ctx.currentTime);
      src.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (muted) {
        this.setEngine(false, 0);
        this.setSiren(false);
      }
    },
    setEngine(on, speed01) {
      if (!ctx || muted) {
        if (engineOsc) {
          try { engineOsc.stop(); } catch (e) {}
          engineOsc = null;
        }
        return;
      }
      try {
        if (on && !engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.setValueAtTime(70, ctx.currentTime);
          engineGain.gain.setValueAtTime(0.03, ctx.currentTime);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(420, ctx.currentTime);
          engineOsc.connect(f);
          f.connect(engineGain);
          engineGain.connect(ctx.destination);
          engineOsc.start();
        } else if (!on && engineOsc) {
          engineOsc.stop();
          engineOsc = null;
        }
        if (engineOsc) {
          engineOsc.frequency.setTargetAtTime(65 + speed01 * 110, ctx.currentTime, 0.08);
          engineGain.gain.setTargetAtTime(0.025 + speed01 * 0.035, ctx.currentTime, 0.08);
        }
      } catch (e) {}
    },
    setSiren(on) {
      if (!ctx || muted) {
        if (sirenOsc) {
          try { sirenOsc.stop(); } catch (e) {}
          sirenOsc = null;
        }
        return;
      }
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'sine';
          sirenOsc.frequency.setValueAtTime(720, ctx.currentTime);
          sirenLfo = ctx.createOscillator();
          sirenLfo.frequency.setValueAtTime(0.7, ctx.currentTime);
          const lfoGain = ctx.createGain();
          lfoGain.gain.setValueAtTime(260, ctx.currentTime);
          sirenLfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          sirenGain.gain.setValueAtTime(0.028, ctx.currentTime);
          sirenOsc.connect(sirenGain);
          sirenGain.connect(ctx.destination);
          sirenOsc.start();
          sirenLfo.start();
        } else if (!on && sirenOsc) {
          sirenOsc.stop();
          sirenLfo.stop();
          sirenOsc = null;
          sirenLfo = null;
        }
      } catch (e) {}
    },
    shot() {
      noiseBurst(0.14, 0.22, 2400);
      tone(180, 0.08, 'square', 0.08, 60);
    },
    enemyShot() {
      noiseBurst(0.1, 0.1, 1600);
    },
    blip() {
      tone(880, 0.12, 'sine', 0.12, 1320);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.12, 990);
      setTimeout(() => tone(990, 0.12, 'sine', 0.1, 1320), 90);
    },
    crash() {
      noiseBurst(0.25, 0.3, 700);
    },
    missionDone() {
      tone(523, 0.14, 'sine', 0.14);
      setTimeout(() => tone(659, 0.14, 'sine', 0.14), 130);
      setTimeout(() => tone(784, 0.22, 'sine', 0.16), 260);
    },
  };
}
