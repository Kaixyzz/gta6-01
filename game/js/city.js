// city.js — deterministic world generation for SOLARA BAY.
// One fixed seed builds the same city every run: road grid, 7 named
// districts with landmarks, detailed buildings, props, shells, pickups,
// race courses, mission anchor points. No network, no assets.
import { makeRng, clamp } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_HALF = 46;
export const BEACH_X0 = 2330; // sand strip starts here
export const WATER_X0 = 2426; // water starts here (blocked)

const DISTRICT_DEFS = [
  { name: 'Terrace Hills', accent: '#7fb069', x0: 0, y0: 0, x1: 960, y1: 640, standing: 55, landmark: 'gardens' },
  { name: 'Marina del Sol', accent: '#2fb3c9', x0: 1920, y0: 0, x1: 2560, y1: 640, standing: 72, landmark: 'marina' },
  { name: 'Mercado Verde', accent: '#e07856', x0: 0, y0: 640, x1: 960, y1: 1280, standing: 71, landmark: 'market' },
  { name: 'Neon Row', accent: '#ff5fa2', x0: 960, y0: 640, x1: 1920, y1: 1280, standing: 58, landmark: 'neon' },
  { name: 'Old Harbor', accent: '#e0a458', x0: 0, y0: 1280, x1: 960, y1: 1920, standing: 46, landmark: 'harbor' },
  { name: 'Palm Promenade', accent: '#4caf7d', x0: 960, y0: 1280, x1: 1920, y1: 1920, standing: 74, landmark: 'promenade' },
  { name: 'Sands Beach', accent: '#f2c14e', x0: 1920, y0: 640, x1: 2560, y1: 1920, standing: 52, landmark: 'beach' },
];

const WALL_COLORS = ['#f7e8c9', '#ffb08a', '#f2c98a', '#e07856', '#9adbb0', '#a8d8ea', '#f5d76e', '#e8a2b8', '#c9b8e8', '#ffd9a0'];
const NEON_TEXTS = ['HOTEL', 'BAR', 'SURF', 'TACOS', 'NEON', 'CLUB', 'PIZZA', 'MOTEL', 'CAFE', 'DANCE'];
const NEON_COLORS = ['#ff5fa2', '#37e6ff', '#b26bff', '#ff9d00', '#4dff88'];

export function districtAt(world, x, y) {
  for (const d of world.districts) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return world.districts[0];
}

export function isWater(x, y) {
  return x >= WATER_X0;
}

export function isBeach(x, y) {
  return x >= BEACH_X0 && x < WATER_X0;
}

export function onRoad(x, y) {
  return AVENUES.some((ax) => Math.abs(x - ax) <= ROAD_HALF) ||
    STREETS.some((sy) => Math.abs(y - sy) <= ROAD_HALF);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const world = {
    seed,
    districts: DISTRICT_DEFS.map((d) => ({ ...d, status: d.standing >= 70 ? 'FRIENDLY' : 'NEUTRAL' })),
    buildings: [],
    plazas: [],
    parks: [],
    props: [],
    signs: [],
    shells: [],
    pickups: [],
    boats: [],
    raceStarts: [],
    garage: { x: 640, y: 300 },
    safehouse: { x: 1920, y: 1600 },
    bank: { x: 1320, y: 1140 },
    casino: { x: 1760, y: 1140 },
    turf: { x: 800, y: 1120 },
    marina: { x: 2380, y: 320 },
    colliders: [],
  };

  const blocked = [];
  function addBuilding(b) {
    world.buildings.push(b);
    world.colliders.push(b);
    blocked.push(b);
  }

  // ---- special anchors -------------------------------------------------
  // Bank plaza block (avenues 1280-1600, streets 960-1280): open plaza with
  // the bank building on its north edge; the vault cash sits mid-plaza.
  world.plazas.push({ x: 1300, y: 1000, w: 280, h: 240, kind: 'bank', district: 'Neon Row' });
  addBuilding({ x: 1360, y: 1010, w: 170, h: 70, color: '#f7e8c9', trim: '#c9a86a', h: 3, kind: 'bank', sign: 'BANK' });
  // Casino block (1600-1920 x 960-1280): casino building + plaza in front.
  world.plazas.push({ x: 1620, y: 1000, w: 280, h: 240, kind: 'casino', district: 'Neon Row' });
  addBuilding({ x: 1680, y: 1010, w: 180, h: 70, color: '#2b2b4a', trim: '#ff5fa2', h: 3, kind: 'casino', sign: 'CASINO' });
  // Turf park block (640-960 x 960-1280): open park, gang turf at its heart.
  world.parks.push({ x: 660, y: 980, w: 280, h: 280, kind: 'turf', district: 'Mercado Verde' });
  // Garage: small home-base building south of the 640/320 intersection.
  addBuilding({ x: 600, y: 380, w: 90, h: 60, color: '#f2c98a', trim: '#b98a4a', h: 1, kind: 'garage', sign: 'GARAGE' });
  // Safehouse: small house just west of the 1920/1600 intersection.
  addBuilding({ x: 1800, y: 1500, w: 70, h: 55, color: '#9adbb0', trim: '#4caf7d', h: 1, kind: 'safehouse' });
  // Guaranteed neon signs above the bank + casino (the night shootout
  // stages right here, so the glow must be in frame).
  world.signs.push({ x: 1420, y: 1002, text: 'NEON', color: '#ff5fa2', w: 72 });
  world.signs.push({ x: 1760, y: 1002, text: 'CLUB', color: '#37e6ff', w: 72 });
  // Marina docks + boats in the north-east water.
  for (let i = 0; i < 5; i++) {
    const bx = 2445 + rng.range(0, 70);
    const by = 180 + i * 90 + rng.range(-12, 12);
    world.boats.push({ x: bx, y: by, angle: rng.range(-0.3, 0.3), color: rng.pick(['#ffffff', '#ffd9a0', '#a8d8ea', '#ff9d7e']) });
  }
  world.props.push({ kind: 'dock', x: 2380, y: 220, w: 26, h: 260 });

  // ---- generic blocks ---------------------------------------------------
  // Every block between roads gets buildings, a park, a plaza or parking —
  // never bare grass. Special blocks above are skipped.
  const specialBlocks = [
    { x0: 1280, y0: 960, x1: 1600, y1: 1280 },
    { x0: 1600, y0: 960, x1: 1920, y1: 1280 },
    { x0: 640, y0: 960, x1: 960, y1: 1280 },
  ];
  function inSpecial(x0, y0, x1, y1) {
    return specialBlocks.some((s) => x0 >= s.x0 && x1 <= s.x1 && y0 >= s.y0 && y1 <= s.y1);
  }
  const xs = [0, ...AVENUES, WORLD_W];
  const ys = [0, ...STREETS, WORLD_H];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + ROAD_HALF + 8;
      const y0 = ys[bj] + ROAD_HALF + 8;
      const x1 = xs[bi + 1] - ROAD_HALF - 8;
      const y1 = ys[bj + 1] - ROAD_HALF - 8;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      if (inSpecial(x0, y0, x1, y1)) continue;
      // Beach strip: no buildings in any block that reaches the sand line.
      // (The old check only skipped blocks STARTING east of the sand, so
      // a block starting at x=2294 could still drop a building in the
      // water at x>2426 — it covered the sea in the chase screenshot.)
      if (x1 >= BEACH_X0 - 10) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(world, cx, cy);
      const roll = rng.next();
      if (roll < 0.14) {
        // park block: trees, benches, paths — never bare grass
        world.parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'park', district: d.name });
        const nTrees = 4 + rng.int(0, 3);
        for (let i = 0; i < nTrees; i++) {
          world.props.push({ kind: 'tree', x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20) });
        }
        world.props.push({ kind: 'bench', x: cx - 30, y: cy });
        world.props.push({ kind: 'bench', x: cx + 30, y: cy + 20 });
      } else if (roll < 0.22) {
        // parking lot: painted bays + a few parked cars (props, not drivable)
        world.plazas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'parking', district: d.name });
        for (let i = 0; i < 3; i++) {
          world.props.push({ kind: 'parked', x: rng.range(x0 + 30, x1 - 30), y: rng.range(y0 + 30, y1 - 30), angle: rng.pick([0, Math.PI / 2]), color: rng.pick(WALL_COLORS) });
        }
      } else {
        // building cluster: 1-3 buildings with detail
        const nB = 1 + rng.int(0, 2);
        for (let i = 0; i < nB; i++) {
          const bw = rng.range(80, Math.min(150, (x1 - x0) / nB - 8));
          const bh = rng.range(70, Math.min(140, y1 - y0 - 8));
          const bx = x0 + 6 + (i * (x1 - x0 - 12)) / nB + rng.range(0, 10);
          const by = y0 + 6 + rng.range(0, Math.max(0, y1 - y0 - bh - 12));
          const b = {
            x: clamp(bx, x0, x1 - bw), y: clamp(by, y0, y1 - bh), w: bw, h: bh,
            color: rng.pick(WALL_COLORS), trim: d.accent, h: 1 + rng.int(0, 2), kind: 'block',
            windows: [], roof: [],
          };
          const cols = Math.max(2, Math.floor(bw / 26));
          const rows = Math.max(2, Math.floor(bh / 26));
          for (let cxi = 0; cxi < cols; cxi++) {
            for (let cyi = 0; cyi < rows; cyi++) {
              b.windows.push({ x: 8 + cxi * 26, y: 8 + cyi * 26 });
            }
          }
          const nRoof = rng.int(1, 3);
          for (let ri = 0; ri < nRoof; ri++) {
            b.roof.push({ kind: rng.pick(['ac', 'tank', 'garden']), x: rng.range(8, bw - 26), y: rng.range(8, bh - 26) });
          }
          if (!blocked.some((o) => rectsOverlap(o, b))) addBuilding(b);
          if (d.landmark === 'neon' && rng.chance(0.55)) {
            world.signs.push({
              x: b.x + b.w / 2, y: b.y - 4, text: rng.pick(NEON_TEXTS),
              color: rng.pick(NEON_COLORS), w: 64 + rng.range(0, 30),
            });
          }
        }
      }
      // District landmark props per block
      if (d.landmark === 'market' && rng.chance(0.5)) {
        world.props.push({ kind: 'stall', x: cx, y: cy, color: rng.pick(['#ff5fa2', '#37e6ff', '#ff9d00', '#4dff88']) });
      }
      if (d.landmark === 'harbor' && rng.chance(0.5)) {
        world.props.push({ kind: 'container', x: cx - 40, y: cy, color: rng.pick(['#e07856', '#2fb3c9', '#f2c14e']) });
        world.props.push({ kind: 'container', x: cx + 40, y: cy + 10, color: rng.pick(['#e07856', '#2fb3c9', '#f2c14e']) });
      }
      if (d.landmark === 'promenade' && rng.chance(0.6)) {
        world.props.push({ kind: 'palm', x: cx - 50, y: cy });
        world.props.push({ kind: 'palm', x: cx + 50, y: cy + 20 });
        world.props.push({ kind: 'bench', x: cx, y: cy - 20 });
      }
      if (d.landmark === 'gardens' && rng.chance(0.5)) {
        world.props.push({ kind: 'hedge', x: cx, y: cy, w: 90, h: 16 });
        world.props.push({ kind: 'tree', x: cx - 60, y: cy });
      }
    }
  }

  // ---- street props: palms along the boulevard, lamps, benches, hydrants
  for (const ax of AVENUES) {
    for (let y = 180; y < WORLD_H - 100; y += 320) {
      if (ax === 2240 || rng.chance(0.4)) {
        world.props.push({ kind: 'palm', x: ax + ROAD_HALF + 16, y: y + rng.range(-40, 40) });
      }
      if (rng.chance(0.5)) {
        world.props.push({ kind: 'lamp', x: ax - ROAD_HALF - 10, y: y + 120 });
      }
    }
  }
  for (const sy of STREETS) {
    for (let x = 180; x < WORLD_W - 100; x += 320) {
      if (rng.chance(0.35)) world.props.push({ kind: 'bench', x: x + rng.range(-30, 30), y: sy + ROAD_HALF + 14 });
      if (rng.chance(0.3)) world.props.push({ kind: 'hydrant', x: x + 90, y: sy - ROAD_HALF - 12 });
    }
  }
  // Beach props: umbrellas + towels on the sand.
  for (let i = 0; i < 10; i++) {
    const uy = 200 + i * 170 + rng.range(-30, 30);
    world.props.push({ kind: 'umbrella', x: 2370 + rng.range(-15, 15), y: uy, color: rng.pick(['#ff5fa2', '#37e6ff', '#ff9d00', '#ffffff']) });
    world.props.push({ kind: 'towel', x: 2395 + rng.range(-8, 8), y: uy + 26, color: rng.pick(['#ff5fa2', '#37e6ff', '#4dff88']) });
  }
  // Harbor crane silhouette (south-west).
  world.props.push({ kind: 'crane', x: 300, y: 1500 });

  // ---- Sun Shells: 8 hidden collectibles, one per district flavour spot
  const shellSpots = [
    { x: 2400, y: 800 }, { x: 800, y: 1120 }, { x: 2380, y: 500 }, { x: 2100, y: 1500 },
    { x: 500, y: 900 }, { x: 1500, y: 800 }, { x: 500, y: 1500 }, { x: 500, y: 400 },
  ];
  world.shells = shellSpots.map((s) => ({ ...s, collected: false }));

  // ---- pickups: ammo at garage + central intersection, health at two spots
  world.pickups = [
    { kind: 'ammo', x: 640, y: 400, taken: false, timer: 0 },
    { kind: 'ammo', x: 1280, y: 960, taken: false, timer: 0 },
    { kind: 'health', x: 960, y: 1280, taken: false, timer: 0 },
    { kind: 'health', x: 1920, y: 640, taken: false, timer: 0 },
  ];

  // ---- street races
  world.raceStarts = [
    {
      name: 'Promenade Sprint',
      start: { x: 2240, y: 1280 },
      checkpoints: [{ x: 2240, y: 960 }, { x: 2240, y: 640 }, { x: 2240, y: 320 }, { x: 1920, y: 320 }],
      timeLimit: 75,
    },
    {
      name: 'Harbor Loop',
      start: { x: 640, y: 1600 },
      checkpoints: [{ x: 320, y: 1600 }, { x: 320, y: 1280 }, { x: 640, y: 1280 }, { x: 960, y: 1600 }],
      timeLimit: 75,
    },
  ];

  return world;
}

// Collision: circle (x,y,r) vs building rects + water. Returns corrected pos.
export function collideCircle(world, x, y, r) {
  let nx = x;
  let ny = y;
  if (nx > WATER_X0 - r) nx = WATER_X0 - r;
  if (nx < r) nx = r;
  if (ny < r) ny = r;
  if (ny > WORLD_H - r) ny = WORLD_H - r;
  for (const b of world.colliders) {
    const cx = clamp(nx, b.x, b.x + b.w);
    const cy = clamp(ny, b.y, b.y + b.h);
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        ny = cy + (dy / d) * r;
      } else {
        ny = b.y - r;
      }
    }
  }
  return { x: nx, y: ny };
}

export function pointInBuilding(world, x, y) {
  return world.colliders.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

export function findOpenSpot(world, rng, cx, cy, radius) {
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(30, radius);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (x < 60 || x > WORLD_W - 60 || y < 60 || y > WORLD_H - 60) continue;
    if (isWater(x, y)) continue;
    if (!pointInBuilding(world, x, y) && (onRoad(x, y) || rng.chance(0.3))) return { x, y };
  }
  return { x: cx, y: cy };
}
