// city.js — builds the city of SOLARA BAY from the fixed seed: road grid,
// blocks, buildings, parks, the garage and the safehouse, plus the collision
// helpers everything else uses (circle vs building rects, water bounds).

import { WORLD, ROADS_V, ROADS_H, ROAD_HALF, BEACH_Y, WATER_Y, SEED, PALETTE } from './config.js';
import { Rng } from './rng.js';

// The turf lot block (roads 1950..2210 x 1230..1450) stays open ground.
const TURF_BLOCK = { x0: 1950, x1: 2210, y0: 1230, y1: 1450 };
// The garage block and the safehouse block get custom buildings.
const GARAGE_BLOCK = { x0: 130, x1: 390, y0: 130, y1: 350 };
const SAFE_BLOCK = { x0: 2210, x1: 2470, y0: 130, y1: 350 };

function blockKey(x0, y0) {
  return `${x0},${y0}`;
}

export function buildCity() {
  const rng = new Rng(SEED);
  const buildings = [];
  const parks = [];

  for (let vi = 0; vi < ROADS_V.length - 1; vi++) {
    for (let hi = 0; hi < ROADS_H.length - 1; hi++) {
      const x0 = ROADS_V[vi] + ROAD_HALF;
      const x1 = ROADS_V[vi + 1] - ROAD_HALF;
      const y0 = ROADS_H[hi] + ROAD_HALF;
      const y1 = ROADS_H[hi + 1] - ROAD_HALF;
      const key = blockKey(x0, y0);
      void key;

      const isTurf = x0 === TURF_BLOCK.x0 + ROAD_HALF && y0 === TURF_BLOCK.y0 + ROAD_HALF;
      const isGarage = x0 === GARAGE_BLOCK.x0 + ROAD_HALF && y0 === GARAGE_BLOCK.y0 + ROAD_HALF;
      const isSafe = x0 === SAFE_BLOCK.x0 + ROAD_HALF && y0 === SAFE_BLOCK.y0 + ROAD_HALF;
      const downtown =
        x0 >= 910 && x1 <= 1430 && y0 >= 570 && y1 <= 1010;

      if (isTurf) {
        parks.push({ x: x0 + 8, y: y0 + 8, w: x1 - x0 - 16, h: y1 - y0 - 16, kind: 'lot' });
        continue;
      }
      if (isGarage) {
        buildings.push({
          x: x0 + 18, y: y0 + 18, w: 180, h: 120,
          color: PALETTE.garage, tall: false, label: 'GARAGE',
        });
        continue;
      }
      if (isSafe) {
        buildings.push({
          x: x0 + 30, y: y0 + 18, w: 160, h: 110,
          color: PALETTE.safehouse, tall: false, label: 'SAFEHOUSE',
        });
        continue;
      }

      const roll = rng.float();
      if (roll < 0.14) {
        parks.push({ x: x0 + 8, y: y0 + 8, w: x1 - x0 - 16, h: y1 - y0 - 16, kind: 'park' });
        continue;
      }
      if (roll < 0.34 && x1 - x0 > 170) {
        // Two small buildings side by side.
        const half = (x1 - x0) / 2;
        for (let k = 0; k < 2; k++) {
          buildings.push({
            x: x0 + 12 + k * half, y: y0 + 16,
            w: half - 24, h: y1 - y0 - 32,
            color: downtown ? rng.pick(PALETTE.tower) : rng.pick(PALETTE.building),
            tall: downtown,
          });
        }
        continue;
      }
      buildings.push({
        x: x0 + 16, y: y0 + 16,
        w: x1 - x0 - 32, h: y1 - y0 - 32,
        color: downtown ? rng.pick(PALETTE.tower) : rng.pick(PALETTE.building),
        tall: downtown,
      });
    }
  }

  return { buildings, parks };
}

// True when the point is inside any building rect.
export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// True when the point is in water (impassable).
export function pointInWater(x, y) {
  return y >= WATER_Y;
}

// Push a circle (x, y, r) out of buildings and water. Mutates and returns
// the position object {x, y}. Also clamps to the world bounds.
export function resolveCircle(city, pos, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.y = cy + (dy / d) * r;
      } else {
        // Center inside the rect: push out along the smallest overlap.
        const left = pos.x - b.x;
        const right = b.x + b.w - pos.x;
        const top = pos.y - b.y;
        const bottom = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
    }
  }
  if (pos.y + r > WATER_Y) pos.y = WATER_Y - r;
  if (pos.y - r < 0) pos.y = r;
  if (pos.x - r < 0) pos.x = r;
  if (pos.x + r > WORLD.w) pos.x = WORLD.w - r;
  return pos;
}

// Nearest point on a road center line to (x, y), for spawning cars.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      best = { x: rx, y: Math.max(ROAD_HALF + 30, Math.min(y, 1670 - 30)) };
    }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.max(ROAD_HALF + 30, Math.min(x, WORLD.w - 30)), y: ry };
    }
  }
  return best;
}

export { BEACH_Y, WATER_Y };
