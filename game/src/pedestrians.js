// pedestrians.js — the people of SOLARA BAY. They stroll along sidewalks,
// change direction at intersections, and run away from gunfire and crashes.

import { WORLD, ROADS_V, ROADS_H, TUNING, PALETTE } from './config.js';
import { resolveCircle } from './city.js';

export function makePedestrian(rng, x, y) {
  const vertical = rng.chance(0.5);
  const road = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
  return {
    x: x !== undefined ? x : (vertical ? road + (rng.chance(0.5) ? 34 : -34) : rng.range(160, WORLD.w - 160)),
    y: y !== undefined ? y : (vertical ? rng.range(160, 1620) : road + (rng.chance(0.5) ? 34 : -34)),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(TUNING.pedSpeed * 0.7, TUNING.pedSpeed * 1.3),
    color: rng.pick(PALETTE.pedColors),
    // Walking the sidewalk: which road edge and which way.
    roadKind: vertical ? 'v' : 'h',
    roadValue: road,
    side: rng.chance(0.5) ? 1 : -1,
    dir: rng.chance(0.5) ? 1 : -1,
    fleeUntil: 0,
    fleeX: 0,
    fleeY: 0,
    wanderT: rng.range(1, 4),
  };
}

export function scarePedestrians(peds, x, y, radius, now) {
  for (const p of peds) {
    if (Math.hypot(p.x - x, p.y - y) < radius) {
      p.fleeUntil = now + 2.5;
      p.fleeX = x;
      p.fleeY = y;
    }
  }
}

export function updatePedestrian(p, rng, dt, now, city) {
  if (now < p.fleeUntil) {
    // Run away from the scare point.
    const dx = p.x - p.fleeX;
    const dy = p.y - p.fleeY;
    const d = Math.hypot(dx, dy) || 1;
    p.angle = Math.atan2(dy / d, dx / d);
    p.x += Math.cos(p.angle) * TUNING.pedFleeSpeed * dt;
    p.y += Math.sin(p.angle) * TUNING.pedFleeSpeed * dt;
    resolveCircle(city, p, 10);
    return;
  }

  p.wanderT -= dt;
  if (p.wanderT <= 0) {
    p.wanderT = rng.range(2, 6);
    // At an intersection, sometimes turn or reverse.
    const nearV = ROADS_V.find((rx) => Math.abs(p.x - rx) < 40);
    const nearH = ROADS_H.find((ry) => Math.abs(p.y - ry) < 40);
    if (p.roadKind === 'v' && nearH !== undefined && rng.chance(0.4)) {
      p.roadKind = 'h';
      p.roadValue = nearH;
      p.side = rng.chance(0.5) ? 1 : -1;
      p.dir = rng.chance(0.5) ? 1 : -1;
      p.y = nearH + p.side * 34;
    } else if (p.roadKind === 'h' && nearV !== undefined && rng.chance(0.4)) {
      p.roadKind = 'v';
      p.roadValue = nearV;
      p.side = rng.chance(0.5) ? 1 : -1;
      p.dir = rng.chance(0.5) ? 1 : -1;
      p.x = nearV + p.side * 34;
    } else if (rng.chance(0.3)) {
      p.dir *= -1;
    }
  }

  if (p.roadKind === 'v') {
    p.angle = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.y += p.dir * p.speed * dt;
    p.x += (p.roadValue + p.side * 34 - p.x) * Math.min(1, dt * 2);
    if (p.y < 120) { p.y = 120; p.dir = 1; }
    if (p.y > 1660) { p.y = 1660; p.dir = -1; }
  } else {
    p.angle = p.dir > 0 ? 0 : Math.PI;
    p.x += p.dir * p.speed * dt;
    p.y += (p.roadValue + p.side * 34 - p.y) * Math.min(1, dt * 2);
    if (p.x < 120) { p.x = 120; p.dir = 1; }
    if (p.x > WORLD.w - 120) { p.x = WORLD.w - 120; p.dir = -1; }
  }
  resolveCircle(city, p, 10);
}
