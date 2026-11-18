// audio.js — all sound is synthesized with WebAudio: no audio files.
// Engine hum, police sirens, gunshots, pickup blips and crash thuds.
// Everything is guarded: if the browser refuses audio, the game plays on
// silently instead of throwing.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  var ctx = null;
  var master = null;
  var engineOsc = null;
  var engineGain = null;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenTimer = 0;
  var muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch (e) { /* audio stays optional */ }
  }

  SB.audio = {
    unlock: function () { ensure(); },
    setMuted: function (m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.35;
    },
    isMuted: function () { return muted; },
    engine: function (on, speedFrac) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      try {
        if (ctx.state === 'suspended') ctx.resume();
        engineOsc.frequency.value = 48 + speedFrac * 130;
        engineGain.gain.value = on ? 0.05 + speedFrac * 0.06 : 0;
      } catch (e) { /* ignore */ }
    },
    siren: function (on, dt) {
      if (!ensure() || muted) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      try {
        sirenTimer += dt;
        var high = Math.floor(sirenTimer * 1.6) % 2 === 0;
        sirenOsc.frequency.value = high ? 720 : 540;
        sirenGain.gain.value = on ? 0.045 : 0;
      } catch (e) { /* ignore */ }
    },
    shot: function () {
      if (!ensure() || muted) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        var len = Math.floor(ctx.sampleRate * 0.09);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var g = ctx.createGain();
        g.gain.value = 0.4;
        var hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 900;
        src.connect(hp);
        hp.connect(g);
        g.connect(master);
        src.start();
      } catch (e) { /* ignore */ }
    },
    pickup: function () { blip(880, 0.12, 'sine', 0.25); setTimeout(function () { blip(1320, 0.1, 'sine', 0.2); }, 70); },
    crash: function () { blip(90, 0.18, 'triangle', 0.4); },
    missionDone: function () {
      blip(523, 0.12, 'sine', 0.25);
      setTimeout(function () { blip(659, 0.12, 'sine', 0.25); }, 110);
      setTimeout(function () { blip(784, 0.22, 'sine', 0.3); }, 220);
    }
  };
})();
