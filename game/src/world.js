// The city of Solara Bay: a road grid, blocks of buildings, a beach and water
// along the east edge, and the named places the story uses. Everything is built
// from one fixed seed, so the map never changes between loads.
import { makeRng } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_W = 96;
export const WORLD_SEED = 1337;

// Named places. Every mission marker sits on or beside a road, so a car can
// always reach it without crossing a block.
export const POINTS = {
  start: { x: 320, y: 1500 },
  garage: { x: 320, y: 1600 },
  safehouse: { x: 320, y: 320 },
  turf: { x: 1280, y: 960 },
  dropoff: { x: 1920, y: 1280 },
  pickup: { x: 1600, y: 640 },
  delivery: { x: 640, y: 1280 },
  goods: { x: 1920, y: 640 },
  ammoGarage: { x: 368, y: 1480 },
  ammoCross: { x: 960, y: 900 },
  healthPost: { x: 320, y: 430 },
  policeStation: { x: 1920, y: 960 },
};

// Where the named buildings are drawn: beside their road point, never on a
// road or an intersection, so no route is ever blocked by them.
export const PLACES = {
  garage: { x: 200, y: 1720 },
  safehouse: { x: 200, y: 200 },
  police: { x: 2070, y: 800 },
};

const ROOF_COLORS = ['#c96f4a', '#4a7fc9', '#7fb069', '#c9a44a', '#8e6fc9', '#4ac9b0', '#d97b9c', '#e07a5f'];

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  for (let i = 0; i < AVENUES.length - 1; i++) {
    for (let j = 0; j < STREETS.length - 1; j++) {
      const x0 = AVENUES[i] + ROAD_W / 2;
      const x1 = AVENUES[i + 1] - ROAD_W / 2;
      const y0 = STREETS[j] + ROAD_W / 2;
      const y1 = STREETS[j + 1] - ROAD_W / 2;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      let keepClear = false;
      for (const p of [...Object.values(POINTS), ...Object.values(PLACES)]) {
        if (Math.hypot(p.x - cx, p.y - cy) < 175) {
          keepClear = true;
          break;
        }
      }
      if (keepClear) {
        if (rng.chance(0.55)) parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 3; t++) {
          trees.push({ x: rng.range(x0 + 24, x1 - 24), y: rng.range(y0 + 24, y1 - 24) });
        }
        continue;
      }
      const roll = rng.next();
      if (roll < 0.62) {
        const w = (x1 - x0) * rng.range(0.55, 0.82);
        const h = (y1 - y0) * rng.range(0.55, 0.82);
        buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, c: rng.pick(ROOF_COLORS) });
      } else if (roll < 0.8) {
        const w = (x1 - x0) * 0.38;
        const h = (y1 - y0) * 0.42;
        buildings.push({ x: x0 + 12, y: y0 + 14, w, h, c: rng.pick(ROOF_COLORS) });
        buildings.push({ x: x1 - w - 12, y: y1 - h - 14, w, h, c: rng.pick(ROOF_COLORS) });
      } else {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 5; t++) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20) });
        }
      }
    }
  }
  for (let t = 0; t < 10; t++) {
    trees.push({ x: rng.range(2300, 2460), y: rng.range(120, 1800) });
  }
  // The named buildings collide too, so nobody drives through the garage.
  buildings.push({ x: PLACES.garage.x - 70, y: PLACES.garage.y - 46, w: 140, h: 92, c: '#2f6fb2' });
  buildings.push({ x: PLACES.safehouse.x - 70, y: PLACES.safehouse.y - 46, w: 140, h: 92, c: '#3f7d4e' });
  buildings.push({ x: PLACES.police.x - 70, y: PLACES.police.y - 46, w: 140, h: 92, c: '#5b4a8a' });
  return { buildings, trees, parks, seed };
}

export function isWater(x, y) {
  return x >= 2480;
}

export function isRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

function hitsBuilding(world, x, y, r) {
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if (Math.hypot(x - nx, y - ny) < r) return b;
  }
  return null;
}

export function pointBlocked(world, x, y, r) {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  if (isWater(x, y)) return true;
  return hitsBuilding(world, x, y, r) !== null;
}

// Move a circle by (dx, dy), sliding along walls: try the full step, then
// x-only, then y-only. Returns the new position and whether anything blocked it.
export function slideMove(world, x, y, dx, dy, r) {
  if (!pointBlocked(world, x + dx, y + dy, r)) return { x: x + dx, y: y + dy, hit: false };
  if (!pointBlocked(world, x + dx, y, r)) return { x: x + dx, y, hit: true };
  if (!pointBlocked(world, x, y + dy, r)) return { x, y: y + dy, hit: true };
  return { x, y, hit: true };
}

export function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const d = Math.hypot(ax - x, sy - y);
      if (d < bestD) {
        bestD = d;
        best = { x: ax, y: sy };
      }
    }
  }
  return best;
}

export function intersectionNeighbors(p) {
  const out = [];
  const ai = AVENUES.indexOf(p.x);
  const si = STREETS.indexOf(p.y);
  if (ai > 0) out.push({ x: AVENUES[ai - 1], y: p.y });
  if (ai < AVENUES.length - 1) out.push({ x: AVENUES[ai + 1], y: p.y });
  if (si > 0) out.push({ x: p.x, y: STREETS[si - 1] });
  if (si < STREETS.length - 1) out.push({ x: p.x, y: STREETS[si + 1] });
  return out;
}
