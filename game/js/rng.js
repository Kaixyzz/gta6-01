// rng.js — deterministic seeded random numbers and small math helpers.
// Everything the world generates comes from one fixed seed, so every run
// builds the same city, the same traffic and the same pedestrians.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  // Mulberry32: a tiny, fast seeded PRNG with a good spread.
  SB.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  SB.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  SB.dist = function (x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };
  SB.normAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  SB.lerp = function (a, b, t) { return a + (b - a) * t; };
})();
