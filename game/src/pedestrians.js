// Pedestrians: sidewalk walkers who run from gunfire and speeding cars.
import { CFG } from './config.js';
import { rand, pick } from './rng.js';
import { dist } from './city.js';

const SHIRT_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#ecf0f1', '#e67e22'];

export function makePeds(G, n) {
  const rng = G.rng;
  for (let i = 0; i < n; i++) {
    const vertical = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    let x;
    let y;
    let axis;
    if (vertical) {
      const rx = pick(rng, G.city.roadsV);
      x = rx + dir * (CFG.ROAD_W / 2 + 22);
      y = rand(rng, 150, CFG.WORLD_H - 150);
      axis = 'v';
    } else {
      const ry = pick(rng, G.city.roadsH);
      x = rand(rng, 150, CFG.BEACH_X - 150);
      y = ry + dir * (CFG.ROAD_W / 2 + 22);
      axis = 'h';
    }
    G.peds.push({
      x,
      y,
      axis,
      dir,
      speed: rand(rng, 45, 80),
      shirt: pick(rng, SHIRT_COLORS),
      fleeT: 0,
      fleeX: 0,
      fleeY: 0,
      wobble: rand(rng, 0, Math.PI * 2),
    });
  }
}

export function updatePeds(G, dt) {
  const rng = G.rng;
  for (const p of G.peds) {
    // What makes them run: a recent gunshot, or a fast car close by.
    if (G.lastShot && G.time - G.lastShot.t < 1.2 && dist(p.x, p.y, G.lastShot.x, G.lastShot.y) < 260) {
      p.fleeT = 2.2;
      const d = Math.max(1, dist(p.x, p.y, G.lastShot.x, G.lastShot.y));
      p.fleeX = (p.x - G.lastShot.x) / d;
      p.fleeY = (p.y - G.lastShot.y) / d;
    }
    for (const c of G.traffic) {
      if (Math.abs(c.speed) > 240 && dist(p.x, p.y, c.x, c.y) < 130) {
        p.fleeT = 1.6;
        const d = Math.max(1, dist(p.x, p.y, c.x, c.y));
        p.fleeX = (p.x - c.x) / d;
        p.fleeY = (p.y - c.y) / d;
      }
    }
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      p.x += p.fleeX * 175 * dt;
      p.y += p.fleeY * 175 * dt;
    } else {
      const sp = p.speed;
      if (p.axis === 'v') p.y += sp * p.dir * dt;
      else p.x += sp * p.dir * dt;
      // Turn around at the map edges; occasionally reverse at a crossing.
      if (p.axis === 'v' && (p.y < 120 || p.y > CFG.WORLD_H - 120)) p.dir *= -1;
      if (p.axis === 'h' && (p.x < 120 || p.x > CFG.BEACH_X - 120)) p.dir *= -1;
      if (rng() < dt * 0.02) p.dir *= -1;
    }
    p.x = Math.max(20, Math.min(CFG.WATER_X - 20, p.x));
    p.y = Math.max(20, Math.min(CFG.WORLD_H - 20, p.y));
    p.wobble += dt * 6;
  }
}
