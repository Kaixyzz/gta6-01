// Deterministic randomness for Solara Bay. A single seeded generator
// (mulberry32) builds the city, so every fresh load produces the same
// streets, the same parked cars and the same pedestrians. Gameplay
// randomness also draws from this stream, never from Math.random, which
// keeps a scripted run reproducible.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A float in [lo, hi).
export function rand(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// An integer in [lo, hi], both ends inclusive.
export function randInt(rng, lo, hi) {
  return Math.floor(lo + rng() * (hi - lo + 1));
}

// One element of an array, uniformly.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// True with probability p.
export function chance(rng, p) {
  return rng() < p;
}
