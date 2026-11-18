// City layout for SOLARA BAY: a seeded coastal grid city.
// Roads: avenues at AVENUES x, streets at STREETS y (road half-width 48).
// Beach + promenade along the east edge, marina at the NE corner, park in the centre.
import { makeRng, pick, range, rangeInt } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_HALF = 48;

export const SPOTS = {
  garage: { x: 400, y: 1600 },
  safehouse: { x: 320, y: 320 },
  bankVault: { x: 1600, y: 960 },
  turf: { x: 1280, y: 1280 },
  marinaCar: { x: 2240, y: 320 },
  dropoff: { x: 2240, y: 1600 },
  pickup: { x: 640, y: 320 },
  delivery: { x: 1920, y: 1600 },
  goods: { x: 1920, y: 320 },
  park: { x: 1120, y: 1120 },
  beach: { x: 2440, y: 960 },
  marina: { x: 2280, y: 420 },
};

const BUILDING_COLORS = ['#c9a37e', '#b98d6b', '#d8b48f', '#a8b8c4', '#c4b49a', '#9fb3a8'];
const ROOF_COLORS = ['#8a6b52', '#7d8a99', '#a08060', '#6f7f8c'];

export function buildCity() {
  const rng = makeRng(1337);
  const buildings = [];
  const palms = [];
  const umbrellas = [];
  const trees = [];
  const boats = [];
  const parkedSpots = [];

  // Buildings fill each block between roads (skip park, garage, marina, beach blocks).
  const parkBlock = { x0: 960, y0: 960, x1: 1280, y1: 1280 };
  const skipBlocks = [
    parkBlock,
    { x0: 320, y0: 1440, x1: 640, y1: 1760 }, // garage yard
    { x0: 2080, y0: 160, x1: 2400, y1: 480 }, // marina apron
    { x0: 2240, y0: 160, x1: 2560, y1: 1920 }, // beach strip
  ];
  const inSkip = (x, y) => skipBlocks.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);

  for (let ai = 0; ai < AVENUES.length - 1; ai++) {
    for (let si = 0; si < STREETS.length - 1; si++) {
      const bx0 = AVENUES[ai] + ROAD_HALF + 14;
      const by0 = STREETS[si] + ROAD_HALF + 14;
      const bx1 = AVENUES[ai + 1] - ROAD_HALF - 14;
      const by1 = STREETS[si + 1] - ROAD_HALF - 14;
      if (inSkip((bx0 + bx1) / 2, (by0 + by1) / 2)) continue;
      // One or two buildings per block.
      const downtown = bx0 >= 1280 && bx0 < 1920 && by0 >= 640 && by0 < 1280;
      const n = downtown ? 2 : (rng() < 0.55 ? 2 : 1);
      for (let k = 0; k < n; k++) {
        const w = range(rng, 90, Math.min(150, (bx1 - bx0) / n - 16));
        const h = range(rng, 80, Math.min(140, by1 - by0 - 16));
        const x = bx0 + 8 + (k * (bx1 - bx0 - 16)) / n + range(rng, 0, 10);
        const y = by0 + 8 + range(rng, 0, Math.max(1, by1 - by0 - h - 16));
        const height = downtown ? rangeInt(rng, 2, 3) : rangeInt(rng, 1, 2);
        buildings.push({
          x, y, w, h, height,
          color: pick(rng, BUILDING_COLORS),
          roof: pick(rng, ROOF_COLORS),
          windows: rangeInt(rng, 2, 4),
        });
      }
    }
  }

  // Park trees + paths.
  for (let i = 0; i < 26; i++) {
    trees.push({ x: range(rng, 990, 1250), y: range(rng, 990, 1250), r: range(rng, 9, 15) });
  }
  // Street trees scattered on sidewalks.
  for (let i = 0; i < 30; i++) {
    const ax = pick(rng, AVENUES);
    const sy = pick(rng, STREETS);
    trees.push({ x: ax + (rng() < 0.5 ? -62 : 62), y: sy + range(rng, -180, 180), r: range(rng, 8, 13) });
  }

  // Beach palms + umbrellas along the promenade (x ~2400) and beach (x 2440-2540).
  for (let y = 200; y < 1900; y += 130) {
    palms.push({ x: 2395 + range(rng, -8, 8), y: y + range(rng, -20, 20) });
  }
  for (let i = 0; i < 8; i++) {
    umbrellas.push({ x: range(rng, 2455, 2525), y: range(rng, 300, 1750), color: pick(rng, ['#ff6b6b', '#ffd166', '#4ecdc4', '#ff9f43']) });
  }
  // Marina boats on the water (x > 2480, y 200-560).
  for (let i = 0; i < 5; i++) {
    boats.push({ x: range(rng, 2485, 2545), y: 220 + i * 70 + range(rng, -12, 12), a: range(rng, -0.4, 0.4), len: range(rng, 26, 40) });
  }

  // Parked cars: on roads near the garage, turf, bank, pickup, delivery, goods.
  // The two garage cars face east (angle 0) so the first drive heads straight
  // down the street instead of needing a U-turn in the yard.
  const parkAt = [
    [460, 1600, 0], [560, 1600, 0], // garage, facing east
    [300, 1420, null],
    [1280, 1220, null], [1220, 1280, null], // near turf
    [1600, 880, null], [1600, 1040, null], // near bank
    [640, 380, null], [640, 260, null], // near pickup
    [2180, 1560, null], [1980, 1640, null], // near delivery / dropoff (road edges: center lane clear)
    [1920, 380, null], // near goods
    [1000, 700, null], [700, 1000, null], [2000, 1000, null], [1000, 1500, null],
  ];
  for (const [x, y, ang] of parkAt) {
    parkedSpots.push({ x, y, angle: ang === null ? pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]) : ang, kind: 'car' });
  }
  // Motorbike (fast, light) near the park; truck (slow, tough) on the docks road.
  parkedSpots.push({ x: 980, y: 900, angle: Math.PI / 2, kind: 'bike' });
  parkedSpots.push({ x: 2240, y: 760, angle: Math.PI / 2, kind: 'truck' });
  // Rival boss sports car at the marina (M6 target).
  parkedSpots.push({ x: 2240, y: 320, angle: Math.PI / 2, kind: 'sports' });

  return { buildings, palms, umbrellas, trees, boats, parkedSpots };
}

export function onRoad(x, y) {
  return AVENUES.some((ax) => Math.abs(x - ax) <= ROAD_HALF) ||
    STREETS.some((sy) => Math.abs(y - sy) <= ROAD_HALF);
}

export function nearestIntersection(x, y) {
  let best = null; let bd = 1e18;
  for (const ax of AVENUES) for (const sy of STREETS) {
    const d = (ax - x) * (ax - x) + (sy - y) * (sy - y);
    if (d < bd) { bd = d; best = { x: ax, y: sy }; }
  }
  return best;
}

export function pointInBuilding(buildings, x, y, pad = 0) {
  for (const b of buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}
