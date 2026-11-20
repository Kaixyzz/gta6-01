// SOLARA BAY audio: every sound is synthesized with WebAudio — engine hum,
// sirens, gunshots, pickup blips. No audio files, no network. Everything
// is guarded: if the browser has no audio context, the game stays silent.
(function () {
  'use strict';

  var ctx = null;
  var engineOsc = null;
  var engineGain = null;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenTimer = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() { ensure(); }

  function blip(freq, dur, vol, type) {
    var c = ensure();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    } catch (e) { /* silent */ }
  }

  function gunshot() {
    var c = ensure();
    if (!c) return;
    try {
      var len = Math.floor(c.sampleRate * 0.12);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource();
      src.buffer = buf;
      var g = c.createGain();
      g.gain.value = 0.25;
      src.connect(g);
      g.connect(c.destination);
      src.start();
    } catch (e) { /* silent */ }
  }

  function crash() { blip(70, 0.25, 0.25, 'triangle'); }

  function pickup() { blip(880, 0.12, 0.12); blip(1320, 0.15, 0.1); }

  function setEngine(speed, maxSpeed) {
    var c = ensure();
    if (!c) return;
    try {
      if (!engineOsc) {
        engineOsc = c.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = c.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineGain);
        engineGain.connect(c.destination);
        engineOsc.start();
      }
      var f = 55 + (Math.abs(speed) / maxSpeed) * 130;
      engineOsc.frequency.setTargetAtTime(f, c.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(speed !== 0 ? 0.045 : 0.015, c.currentTime, 0.1);
    } catch (e) { /* silent */ }
  }

  function setSiren(on) {
    var c = ensure();
    if (!c) return;
    try {
      if (on && !sirenOsc) {
        sirenOsc = c.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = c.createGain();
        sirenGain.gain.value = 0.03;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(c.destination);
        sirenOsc.start();
        var hi = false;
        sirenTimer = setInterval(function () {
          if (!sirenOsc) return;
          hi = !hi;
          sirenOsc.frequency.setTargetAtTime(hi ? 950 : 650, c.currentTime, 0.05);
        }, 420);
      } else if (!on && sirenOsc) {
        clearInterval(sirenTimer);
        sirenTimer = null;
        sirenOsc.stop();
        sirenOsc = null;
        sirenGain = null;
      }
    } catch (e) { /* silent */ }
  }

  window.SBAudio = {
    unlock: unlock,
    blip: blip,
    gunshot: gunshot,
    crash: crash,
    pickup: pickup,
    setEngine: setEngine,
    setSiren: setSiren
  };
})();
