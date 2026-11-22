// SOLARA BAY city generation — deterministic from one seed.
// A fictional bay city on a road grid: avenues every 320 px, streets every
// 320 px. The east edge is the sea (beach + water). Seven named districts,
// each with its own standing value.
import { RNG, hashSeed } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const SEA_X = 2400;      // water starts here
export const BEACH_X = 2320;    // sand starts here

export function buildCity() {
  const rng = new RNG(hashSeed('solara-bay-v21'));
  const city = {
    width: WORLD_W,
    height: WORLD_H,
    avenues: AVENUES,
    streets: STREETS,
    buildings: [],
    palms: [],
    umbrellas: [],
    boats: [],
    trees: [],
    neons: [],
    districts: [],
    pois: {},
    shells: [],
    races: [],
    ammoSpots: [],
    healthSpots: [],
  };

  // ---- districts (rectangles aligned to the road grid) ----
  const defs = [
    { name: 'Terrace Hills', x0: 0, y0: 0, x1: 960, y1: 640, standing: 52, desc: 'Quiet villas above the bay' },
    { name: 'Marina del Sol', x0: 1600, y0: 0, x1: 2560, y1: 640, standing: 72, desc: 'Yachts, docks and salt air' },
    { name: 'Mercado Verde', x0: 0, y0: 640, x1: 960, y1: 1280, standing: 58, desc: 'Stalls, spice and shouting vendors' },
    { name: 'Neon Row', x0: 960, y0: 640, x1: 1600, y1: 1280, standing: 46, desc: 'Downtown lights that never sleep' },
    { name: 'Palm Promenade', x0: 1600, y0: 640, x1: 2560, y1: 1280, standing: 74, desc: 'Beachfront walkway under the palms' },
    { name: 'Old Harbor', x0: 0, y0: 1280, x1: 960, y1: 1920, standing: 41, desc: 'Cranes, crates and old sailors' },
    { name: 'Sands Beach', x0: 960, y0: 1280, x1: 2560, y1: 1920, standing: 55, desc: 'Sun, surf and beach bars' },
  ];
  for (const d of defs) city.districts.push({ ...d, start: d.standing });
  city.districtAt = function (x, y) {
    for (const d of city.districts) {
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
    }
    return city.districts[3];
  };

  // ---- named places (all on open ground or beside a road) ----
  city.pois = {
    spawn: { x: 640, y: 500 },
    garage: { x: 640, y: 720 },
    safehouse: { x: 1600, y: 1600 },
    bank: { x: 1320, y: 1080 },
    bankCash: { x: 1320, y: 1140 },
    casino: { x: 1400, y: 860 },
    casinoCash: { x: 1420, y: 960 },
    marina: { x: 2050, y: 400 },
    sportsCar: { x: 2240, y: 420 },
    turf: { x: 1120, y: 1440 },
    goods: { x: 640, y: 1100 },
    pickup: { x: 640, y: 1400 },
    delivery: { x: 1920, y: 960 },
    dropoff: { x: 1920, y: 1280 },
    park: { x: 1120, y: 1440 },
  };

  // ---- buildings: one or two per block, inset from the roads ----
  const palette = ['#d9a05b', '#c97e4e', '#e0b070', '#b56b4a', '#d8c49a', '#a87c5a', '#e8c98a'];
  const blockXs = [0, 320, 640, 960, 1280, 1600, 1920, 2240];
  const blockYs = [0, 320, 640, 960, 1280, 1600];
  const parkBlock = { bx: 3, by: 4 };       // x 960-1280, y 1280-1600: Terrace Park
  const plazaBank = { bx: 4, by: 3 };       // bank plaza block
  const plazaCasino = { bx: 4, by: 2 };     // casino plaza block
  const marinaBlock = { bx: 6, by: 0 };     // marina docks block
  for (let by = 0; by < blockYs.length; by++) {
    for (let bx = 0; bx < blockXs.length; bx++) {
      const x0 = blockXs[bx];
      const y0 = blockYs[by];
      const x1 = bx + 1 < blockXs.length ? blockXs[bx + 1] : WORLD_W;
      const y1 = by + 1 < blockYs.length ? blockYs[by + 1] : WORLD_H;
      if (x0 >= 2240) continue; // coastal strip: promenade + beach, no buildings
      if (x0 >= BEACH_X) continue; // beach / sea: no buildings
      if (bx === parkBlock.bx && by === parkBlock.by) {
        for (let i = 0; i < 9; i++) {
          city.trees.push({ x: rng.range(x0 + 30, x1 - 30), y: rng.range(y0 + 30, y1 - 30), r: rng.range(9, 14) });
        }
        continue;
      }
      if (bx === marinaBlock.bx && by === marinaBlock.by) continue; // open docks
      if ((bx === plazaBank.bx && by === plazaBank.by) || (bx === plazaCasino.bx && by === plazaCasino.by)) {
        // one big building on the north side, open plaza to the south
        const bw = rng.range(180, 220);
        city.buildings.push({
          x: x0 + 50, y: y0 + 40, w: bw, h: 110,
          hgt: 3, color: rng.pick(palette), roof: rng.pick(['#7a5a3a', '#5d6b7a', '#8a6a4a']),
        });
        continue;
      }
      const n = rng.chance(0.35) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const w = rng.range(90, 170);
        const h = rng.range(80, 150);
        const x = x0 + 34 + (n === 2 ? i * (w + 26) : rng.range(0, Math.max(1, (x1 - x0) - w - 68)));
        const y = y0 + 34 + rng.range(0, Math.max(1, (y1 - y0) - h - 68));
        if (x + w > x1 - 30 || y + h > y1 - 30) continue;
        const b = {
          x, y, w, h,
          hgt: rng.int(1, 3),
          color: rng.pick(palette),
          roof: rng.pick(['#7a5a3a', '#5d6b7a', '#8a6a4a', '#6b7a5d']),
        };
        city.buildings.push(b);
        // downtown neon signs on tall buildings in Neon Row
        if (b.hgt === 3 && x >= 960 && x < 1600 && y >= 640 && y < 1280) {
          city.neons.push({
            x: b.x + b.w / 2, y: b.y + b.h + 4,
            text: rng.pick(['SOLAR', 'TACOS', 'HOTEL', 'BAR', 'PIER 9', 'CLUB', '24H', 'SURF']),
            color: rng.pick(['#ff4d6d', '#39d0ff', '#ffe14d', '#7dff5e', '#ff9de2']),
          });
        }
      }
    }
  }

  // ---- palms along the promenade and beach, umbrellas on the sand ----
  for (let y = 120; y < 1900; y += 130) {
    city.palms.push({ x: 2290 + rng.range(-14, 14), y });
    if (rng.chance(0.6)) city.palms.push({ x: 2260 + rng.range(-10, 10), y: y + 60 });
  }
  for (let i = 0; i < 12; i++) {
    city.umbrellas.push({ x: rng.range(2340, 2390), y: rng.range(120, 1820), color: rng.pick(['#ff5e78', '#ffd23e', '#3ec6ff', '#ff9f1c']) });
  }
  // boats on the water by the marina
  for (let i = 0; i < 7; i++) {
    city.boats.push({ x: rng.range(2430, 2530), y: rng.range(120, 560), angle: rng.range(-0.4, 0.4) });
  }
  for (let i = 0; i < 4; i++) {
    city.boats.push({ x: rng.range(2430, 2520), y: rng.range(900, 1700), angle: rng.range(-0.4, 0.4) });
  }

  // ---- Sun Shells: 8 hidden collectibles ----
  city.shells = [
    { x: 2352, y: 500, label: 'beach' },
    { x: 2352, y: 1400, label: 'beach' },
    { x: 1000, y: 1560, label: 'park' },
    { x: 2100, y: 320, label: 'marina' },
    { x: 2280, y: 1000, label: 'promenade' },
    { x: 640, y: 900, label: 'market' },
    { x: 1280, y: 800, label: 'downtown' },
    { x: 640, y: 1500, label: 'harbor' },
  ];

  // ---- street races: 2 courses, checkpoints are road intersections ----
  city.races = [
    {
      name: 'Promenade Sprint',
      start: { x: 2280, y: 700 },
      timeLimit: 50,
      checkpoints: [
        { x: 2240, y: 960 }, { x: 2240, y: 1280 }, { x: 2240, y: 1600 }, { x: 1920, y: 1600 },
      ],
    },
    {
      name: 'Harbor Loop',
      start: { x: 640, y: 1400 },
      timeLimit: 65,
      checkpoints: [
        { x: 640, y: 1280 }, { x: 960, y: 1280 }, { x: 1280, y: 1280 }, { x: 1280, y: 1600 }, { x: 960, y: 1600 },
      ],
    },
  ];

  // ---- pickups ----
  city.ammoSpots = [{ x: 640, y: 760 }, { x: 1280, y: 1280 }, { x: 960, y: 960 }];
  city.healthSpots = [{ x: 960, y: 700 }, { x: 1600, y: 1280 }];

  // ---- collision helpers ----
  city.isWater = (x, y) => x >= SEA_X;
  city.isBeach = (x, y) => x >= BEACH_X && x < SEA_X;
  city.onRoad = (x, y) => {
    for (const ax of AVENUES) if (Math.abs(x - ax) <= 48) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= 48) return true;
    return false;
  };
  city.hitsBuilding = (x, y, r) => {
    for (const b of city.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  };
  city.inBounds = (x, y) => x >= 24 && x <= WORLD_W - 24 && y >= 24 && y <= WORLD_H - 24;
  city.findOpenSpot = (x, y) => {
    for (let r = 0; r <= 320; r += 16) {
      for (let a = 0; a < 8; a++) {
        const nx = x + Math.cos((a / 8) * Math.PI * 2) * r;
        const ny = y + Math.sin((a / 8) * Math.PI * 2) * r;
        if (city.inBounds(nx, ny) && !city.hitsBuilding(nx, ny, 22) && !city.isWater(nx, ny)) {
          return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  };
  return city;
}
