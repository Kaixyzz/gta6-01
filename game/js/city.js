// Solara Bay city layout: a coastal grid city generated from a fixed seed.
// Roads are avenues (vertical) and streets (horizontal); buildings fill the
// blocks between them. The beach and water run along the east and south edges.

import { makeRng, range, intRange, pick, chance } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_HALF = 48;
export const SEED = 20261119;

export const GARAGE = { x: 172, y: 154, w: 120, h: 84 };
export const SAFEHOUSE = { x: 2080, y: 1440, w: 96, h: 72 };
export const STATION = { x: 448, y: 150, w: 120, h: 90 };
export const SPAWN = { x: 320, y: 400 };

export const TURF = { x: 1280, y: 960 };
export const DROPOFF = { x: 1920, y: 320 };
export const PICKUP_POINT = { x: 640, y: 1280 };
export const DELIVERY_POINT = { x: 2240, y: 640 };
export const GOODS_POINT = { x: 960, y: 1600 };
export const SAFEHOUSE_POINT = { x: 2240, y: 1600 };

export const AMMO_SPOTS = [
  { x: 300, y: 340 },
  { x: 1280, y: 900 },
];
export const HEALTH_SPOTS = [
  { x: 1150, y: 960 },
  { x: 384, y: 400 },
];

const PALETTES = {
  house: ['#e8a87c', '#d9a066', '#c98f5f', '#e0b48f', '#b7d3a8'],
  shop: ['#7fb8d8', '#e07a6a', '#f2c14e', '#9b7fd4', '#5fb8a6'],
  tower: ['#5d7ea6', '#7a6a9b', '#4f8a7d', '#8a6d4f', '#6b8e9e'],
};

export function onRoad(x, y, pad = 0) {
  const r = ROAD_HALF + pad;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= r) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= r) return true;
  return false;
}

export function inWater(x, y) {
  return x >= 2440 || y >= 1840;
}

export function onBeach(x, y) {
  return (x >= 2340 && x < 2440 && y < 1840) || (y >= 1740 && y < 1840 && x < 2340);
}

export function buildCity() {
  const rng = makeRng(SEED);
  const buildings = [];
  const trees = [];

  // Special buildings first, so the generator can avoid their blocks.
  buildings.push({ ...GARAGE, kind: 'garage', color: '#8a5a3b', roof: '#6e4529' });
  buildings.push({ ...SAFEHOUSE, kind: 'safehouse', color: '#7fb069', roof: '#4c7a3f' });
  buildings.push({ ...STATION, kind: 'station', color: '#4a6fa5', roof: '#33507e' });

  // Block interiors sit strictly between the roads (avenue/street ± 48).
  const colSpans = [[64, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1872], [1968, 2192]];
  const rowSpans = [[64, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1730]];
  const downtown = (cx, cy) => cx >= 3 && cx <= 5 && cy >= 2 && cy <= 3;

  for (let cy = 0; cy < rowSpans.length; cy++) {
    for (let cx = 0; cx < colSpans.length; cx++) {
      const x0 = colSpans[cx][0] + 8;
      const x1 = colSpans[cx][1] - 8;
      const y0 = rowSpans[cy][0] + 8;
      const y1 = rowSpans[cy][1] - 8;
      // Keep the garage block, the station block and the safehouse block clear.
      if (cx === 0 && cy === 0) continue;
      if (cx === 1 && cy === 0) continue;
      if (cx === 6 && cy === 4) continue;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 60 || bh < 60) continue;
      const isDowntown = downtown(cx, cy);
      const n = isDowntown ? intRange(rng, 2, 3) : intRange(rng, 1, 2);
      for (let i = 0; i < n; i++) {
        const w = isDowntown ? range(rng, 70, 110) : range(rng, 60, Math.min(150, bw - 16));
        const h = isDowntown ? range(rng, 70, 110) : range(rng, 55, Math.min(120, bh - 16));
        const x = range(rng, x0, x1 - w);
        const y = range(rng, y0, y1 - h);
        const kind = isDowntown ? 'tower' : chance(rng, 0.45) ? 'shop' : 'house';
        const color = pick(rng, PALETTES[kind]);
        buildings.push({
          x, y, w, h, kind, color,
          roof: isDowntown ? '#2e3a4a' : shade(color, -28),
          tall: isDowntown,
        });
      }
      // A few palm trees along the block edges.
      const nt = intRange(rng, 0, 3);
      for (let i = 0; i < nt; i++) {
        trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1) });
      }
    }
  }
  return { buildings, trees };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

export function pointInBuilding(buildings, x, y, pad = 0) {
  for (const b of buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

export function circleHitsBuilding(buildings, x, y, r) {
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

export function nearestIntersection(x, y) {
  let best = null;
  let bd = 1e18;
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const d = (ax - x) ** 2 + (sy - y) ** 2;
      if (d < bd) { bd = d; best = { x: ax, y: sy }; }
    }
  }
  return best;
}
