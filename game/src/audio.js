// All sound is synthesized with WebAudio — no audio files, no network.
export function makeAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenTimer: 0,
    sirenHigh: false,
    musicTimer: null,
    musicStep: 0,
    ensure() {
      if (!audio.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          audio.ctx = new AC();
          audio.master = audio.ctx.createGain();
          audio.master.gain.value = audio.muted ? 0 : 0.5;
          audio.master.connect(audio.ctx.destination);
        } catch (e) { /* headless / no audio device: stay silent */ }
      }
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      return !!audio.ctx;
    },
    setMuted(m) {
      audio.muted = m;
      if (audio.master) audio.master.gain.value = m ? 0 : 0.5;
    },
    blip(freq, dur, type, vol, slideTo) {
      if (!audio.ensure() || audio.muted) return;
      const t = audio.ctx.currentTime;
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(audio.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (!audio.ensure() || audio.muted) return;
      const t = audio.ctx.currentTime;
      const len = Math.floor(audio.ctx.sampleRate * dur);
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const f = audio.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1800;
      const g = audio.ctx.createGain();
      g.gain.value = vol || 0.25;
      src.connect(f); f.connect(g); g.connect(audio.master);
      src.start(t);
    },
    shoot() { audio.noise(0.12, 0.3, 2400); audio.blip(180, 0.09, 'square', 0.12, 60); },
    enemyShoot() { audio.blip(140, 0.08, 'square', 0.07, 70); },
    pickup() { audio.blip(660, 0.1, 'sine', 0.18); setTimeout(() => audio.blip(990, 0.14, 'sine', 0.18), 90); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.16, 'sine', 0.2), i * 110)); },
    busted() { audio.blip(220, 0.5, 'sawtooth', 0.2, 55); },
    click() { audio.blip(880, 0.05, 'sine', 0.12); },
    engineStart() {
      if (!audio.ensure() || audio.engineOsc) return;
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55;
      g.gain.value = 0.0;
      o.connect(g); g.connect(audio.master);
      o.start();
      audio.engineOsc = o; audio.engineGain = g;
    },
    engineSet(speedFrac) {
      if (!audio.engineOsc) return;
      audio.engineOsc.frequency.value = 55 + speedFrac * 130;
      audio.engineGain.gain.value = audio.muted ? 0 : 0.05 + speedFrac * 0.05;
    },
    engineStop() {
      if (!audio.engineOsc) return;
      try { audio.engineOsc.stop(); } catch (e) {}
      audio.engineOsc = null; audio.engineGain = null;
    },
    sirenTick(dt) {
      if (!audio.ensure()) return;
      audio.sirenTimer -= dt;
      if (audio.sirenTimer <= 0) {
        audio.sirenTimer = 0.42;
        audio.sirenHigh = !audio.sirenHigh;
        audio.blip(audio.sirenHigh ? 920 : 680, 0.38, 'sine', 0.05);
      }
    },
    musicStart() {
      if (audio.musicTimer || !audio.ensure()) return;
      // Simple chiptune: A-minor bass + sparse lead, 8 steps per bar.
      const bass = [110, 0, 110, 0, 130.8, 0, 98, 0, 110, 0, 110, 0, 164.8, 0, 146.8, 0];
      const lead = [440, 0, 523, 659, 0, 523, 440, 0, 392, 0, 440, 523, 0, 659, 587, 0];
      audio.musicTimer = setInterval(() => {
        if (audio.muted) return;
        const i = audio.musicStep % 16;
        if (bass[i]) audio.blip(bass[i], 0.22, 'triangle', 0.09);
        if (lead[i]) audio.blip(lead[i], 0.18, 'square', 0.035);
        audio.musicStep++;
      }, 210);
    },
    musicStop() {
      if (audio.musicTimer) { clearInterval(audio.musicTimer); audio.musicTimer = null; }
    },
  };
  return audio;
}
