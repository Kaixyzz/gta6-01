// City layout for SOLARA BAY: a road grid, building blocks, beach, marina,
// park, promenade and downtown, all generated from a fixed seed.
import { makeRng } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_HALF = 48;

// Block spans between roads (edge strips included).
const X_BLOCKS = [
  [48, 272], [368, 592], [688, 912], [1008, 1232],
  [1328, 1552], [1648, 1872], [1968, 2192], [2288, 2512],
];
const Y_BLOCKS = [
  [48, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552],
];

export function isOnRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
  return false;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const umbrellas = [];
  const trees = [];
  const boats = [];
  const neons = [];

  const blockKey = (x0, y0) => `${x0},${y0}`;

  // Special blocks: park, bank plaza, casino plaza, garage block.
  const special = new Set([
    blockKey(688, 368), // park
    blockKey(1328, 1008), // bank plaza (open)
    blockKey(1648, 1008), // casino plaza (open)
  ]);

  // Park: trees + paths, no buildings. Stash spot inside it.
  for (let i = 0; i < 26; i++) {
    trees.push({
      x: rng.range(700, 900),
      y: rng.range(380, 580),
      r: rng.range(10, 16),
    });
  }

  // Beach palms + umbrellas along the promenade strip.
  for (let x = 120; x < 2500; x += 90) {
    if (rng.chance(0.7)) palms.push({ x: x + rng.range(-20, 20), y: rng.range(1690, 1745) });
    if (rng.chance(0.45)) umbrellas.push({ x: x + rng.range(-30, 30), y: rng.range(1700, 1750), hue: rng.pick(['#ff6b6b', '#ffd93d', '#6bcbff', '#ff9f43']) });
  }
  // Downtown palms along the main avenue.
  for (let y = 380; y < 1560; y += 160) {
    palms.push({ x: 1290 + rng.range(-8, 8), y });
    palms.push({ x: 1590 + rng.range(-8, 8), y: y + 80 });
  }

  // Marina boats on the water, south-east corner.
  for (let i = 0; i < 7; i++) {
    boats.push({
      x: rng.range(2050, 2500),
      y: rng.range(1800, 1900),
      angle: rng.range(-0.4, 0.4),
      len: rng.range(46, 80),
    });
  }

  // Neon signs on downtown building fronts.
  const neonTexts = ['HOTEL', 'BAR', '24H', 'TAXI', 'CLUB', 'CAFE', 'BANK', 'CASINO', 'PIZZA', 'NEON'];
  const neonColors = ['#ff2d78', '#00e5ff', '#ffe600', '#7cff00', '#ff9f1c'];
  for (let i = 0; i < 12; i++) {
    neons.push({
      x: rng.range(1020, 1900),
      y: rng.pick([700, 1020, 1340]),
      text: neonTexts[i % neonTexts.length],
      color: neonColors[i % neonColors.length],
    });
  }

  // Normal blocks get 1-2 buildings; edge strips get one building each.
  for (const [x0, x1] of X_BLOCKS) {
    for (const [y0, y1] of Y_BLOCKS) {
      if (special.has(blockKey(x0, y0))) continue;
      if (x0 === 368 && y0 === 688) continue; // garage block (own building below)
      const w = x1 - x0;
      const h = y1 - y0;
      const count = rng.chance(0.55) ? 2 : 1;
      if (count === 1) {
        buildings.push({
          x: x0 + w * 0.12, y: y0 + h * 0.14,
          w: w * 0.76, h: h * 0.72,
          height: rng.int(1, 3),
          hue: rng.pick(['#e8b48a', '#d9a06b', '#c98f5f', '#e0c090', '#b98a68', '#d8b48f']),
        });
      } else {
        buildings.push({
          x: x0 + w * 0.08, y: y0 + h * 0.12,
          w: w * 0.4, h: h * 0.76,
          height: rng.int(1, 3),
          hue: rng.pick(['#e8b48a', '#d9a06b', '#c98f5f', '#e0c090']),
        });
        buildings.push({
          x: x0 + w * 0.52, y: y0 + h * 0.12,
          w: w * 0.4, h: h * 0.76,
          height: rng.int(1, 3),
          hue: rng.pick(['#b98a68', '#d8b48f', '#c98f5f', '#e0c090']),
        });
      }
    }
  }

  // Garage building (player home base), west side, entrance on avenue 640.
  buildings.push({ x: 400, y: 720, w: 160, h: 150, height: 1, hue: '#7fae7f', garage: true });
  // Bank building: north edge of the bank plaza block.
  buildings.push({ x: 1380, y: 1020, w: 120, h: 55, height: 2, hue: '#c9b458', bank: true });
  // Casino building: north edge of the casino plaza block.
  buildings.push({ x: 1700, y: 1020, w: 120, h: 55, height: 3, hue: '#b45fc9', casino: true });
  // Safehouse: small house near the north-east corner.
  buildings.push({ x: 2300, y: 380, w: 130, h: 110, height: 1, hue: '#7f9fb0', safehouse: true });

  // Downtown extra palms inside the park block edges are already trees.

  return {
    buildings, palms, umbrellas, trees, boats, neons,
    // Named open-ground spots (all verified reachable, none inside a building).
    spots: {
      spawn: { x: 320, y: 480 },
      garage: { x: 640, y: 800 },
      safehouse: { x: 2240, y: 320 },
      dropoff: { x: 1920, y: 640 },
      pickup: { x: 640, y: 640 },
      delivery: { x: 1920, y: 1280 },
      turf: { x: 640, y: 1280 },
      goods: { x: 960, y: 1600 },
      bankPlaza: { x: 1440, y: 1160 },
      bankCash: { x: 1440, y: 1170 },
      casinoPlaza: { x: 1760, y: 1160 },
      casinoCash: { x: 1760, y: 1170 },
      sportsCar: { x: 2240, y: 1560 },
    },
    stashes: [
      { x: 500, y: 1720, label: 'beach' },
      { x: 800, y: 480, label: 'park' },
      { x: 2350, y: 1700, label: 'marina' },
    ],
    gangSpawns: [
      { x: 640, y: 1160 }, { x: 640, y: 1400 },
      { x: 520, y: 1280 }, { x: 760, y: 1280 },
    ],
    bankGuardSpawns: [
      { x: 1380, y: 1150 }, { x: 1500, y: 1150 }, { x: 1440, y: 1210 },
    ],
    casinoGuardSpawns: [
      { x: 1700, y: 1150 }, { x: 1820, y: 1150 },
      { x: 1760, y: 1210 }, { x: 1700, y: 1210 },
    ],
  };
}

// True when the circle (x, y, r) overlaps any building.
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// True when the point is inside a building (with a small margin).
export function pointInBuilding(city, x, y) {
  return hitsBuilding(city, x, y, 1);
}

// Move a circle through the city one step at a time, stopping at walls.
// Returns the new position after collision-checked movement.
export function moveCircle(city, x, y, dx, dy, r) {
  let nx = x + dx;
  let ny = y + dy;
  nx = Math.max(r, Math.min(WORLD_W - r, nx));
  ny = Math.max(r, Math.min(WORLD_H - r, ny));
  // Water is blocked for walking/driving except the beach strip is fine;
  // the deep water band (y > 1760) blocks movement.
  if (ny > 1760 - r) ny = 1760 - r;
  if (hitsBuilding(city, nx, y, r)) nx = x;
  if (hitsBuilding(city, nx, ny, r)) ny = y;
  if (hitsBuilding(city, nx, ny, r)) { nx = x; ny = y; }
  return { x: nx, y: ny };
}

// Segment vs building test, for line of sight and bullets.
export function segmentBlocked(city, ax, ay, bx, by) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 16);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInBuilding(city, ax + (bx - ax) * t, ay + (by - ay) * t)) return true;
  }
  return false;
}

export function lineOfSight(city, ax, ay, bx, by) {
  return !segmentBlocked(city, ax, ay, bx, by);
}

// Find a nearby open spot (not in a building, not in deep water).
export function findOpenSpot(city, x, y, tries = 24) {
  if (!hitsBuilding(city, x, y, 14) && y < 1750) return { x, y };
  for (let r = 40; r <= 320; r += 40) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const nx = x + Math.cos(a) * r;
      const ny = y + Math.sin(a) * r;
      if (nx > 20 && nx < WORLD_W - 20 && ny > 20 && ny < 1750 && !hitsBuilding(city, nx, ny, 14)) {
        return { x: nx, y: ny };
      }
    }
  }
  return { x: 320, y: 480 };
}

// Nearest road intersection to a point (roads are the always-clear grid).
export function nearestIntersection(x, y) {
  let best = null;
  let bd = Infinity;
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const d = Math.hypot(ax - x, sy - y);
      if (d < bd) { bd = d; best = { x: ax, y: sy }; }
    }
  }
  return best;
}
