// Synthesized sound effects via WebAudio. No audio files, no network.
// Everything is guarded: in a headless browser (or before any user
// gesture) the audio context may not exist, and the game must keep
// running silently instead of throwing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOn = false;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || !master) return;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.3, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    } catch (e) { /* silent */ }
  }

  function noiseBurst(dur, vol, filterFreq) {
    const c = ensure();
    if (!c || !master) return;
    try {
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = c.createGain();
      g.gain.value = vol || 0.4;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch (e) { /* silent */ }
  }

  return {
    // Call on the first user gesture (Start button) so the context may run.
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') {
        c.resume().catch(() => {});
      }
    },
    // Continuous engine hum; speed01 is 0..1.
    setEngine(speed01) {
      const c = ensure();
      if (!c || !master) return;
      try {
        if (!engineOsc) {
          engineOsc = c.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = c.createGain();
          engineGain.gain.value = 0;
          const f = c.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 500;
          engineOsc.connect(f);
          f.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        const target = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
        engineGain.gain.setTargetAtTime(target, c.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + speed01 * 110, c.currentTime, 0.1);
      } catch (e) { /* silent */ }
    },
    // Two-tone siren while the police are after the player.
    setSiren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      const c = ensure();
      if (!c || !master) {
        sirenOn = false;
        return;
      }
      try {
        if (on) {
          sirenOsc = c.createOscillator();
          sirenOsc.type = 'triangle';
          sirenGain = c.createGain();
          sirenGain.gain.value = 0.05;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenHigh = false;
          sirenTimer = 0;
        } else if (sirenOsc) {
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch (e) { /* silent */ }
    },
    // Called every frame while the siren runs: flips the tone.
    tickSiren(dt) {
      if (!sirenOn || !sirenOsc) return;
      try {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, sirenOsc.context.currentTime);
        }
      } catch (e) { /* silent */ }
    },
    shot() {
      noiseBurst(0.09, 0.5, 2400);
    },
    enemyShot() {
      noiseBurst(0.08, 0.25, 1800);
    },
    blip() {
      tone(880, 0.08, 'sine', 0.25, 1320);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.3, 990);
      setTimeout(() => tone(990, 0.12, 'sine', 0.25, 1320), 90);
    },
    crash() {
      noiseBurst(0.18, 0.5, 700);
    },
    busted() {
      tone(220, 0.5, 'square', 0.2, 110);
    },
  };
}
