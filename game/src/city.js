// Solara Bay layout: road grid, building blocks, beach on the east edge,
// harbor docks in the south-west corner. Generation is seeded, so the city
// is identical on every load.
import { CFG } from './config.js';
import { rand, randInt, pick } from './rng.js';

export function buildCity(rng) {
  const buildings = [];
  const v = CFG.ROADS_V;
  const h = CFG.ROADS_H;
  const half = CFG.ROAD_W / 2;
  // Column edges: left map edge, each road's edges, beach start, map edge.
  const colEdges = [0, ...v.flatMap((x) => [x - half, x + half]), CFG.BEACH_X, CFG.WORLD_W];
  const rowEdges = [0, ...h.flatMap((y) => [y - half, y + half]), CFG.WORLD_H];
  for (let ci = 0; ci < colEdges.length - 1; ci++) {
    for (let ri = 0; ri < rowEdges.length - 1; ri++) {
      const x0 = colEdges[ci], x1 = colEdges[ci + 1];
      const y0 = rowEdges[ri], y1 = rowEdges[ri + 1];
      const w = x1 - x0, ht = y1 - y0;
      // Skip road strips themselves, the beach strip and the harbor block.
      const isRoadCol = ci % 2 === 1;
      const isRoadRow = ri % 2 === 1;
      if (isRoadCol || isRoadRow) continue;
      if (x0 >= CFG.BEACH_X) continue;
      if (x0 >= CFG.HARBOR.x0 && x1 <= CFG.HARBOR.x1 && y0 >= CFG.HARBOR.y0) continue;
      if (w < 90 || ht < 90) continue;
      const n = randInt(rng, 1, 2);
      for (let k = 0; k < n; k++) {
        const bw = rand(rng, 110, Math.min(260, w - 40));
        const bh = rand(rng, 100, Math.min(220, ht - 40));
        const bx = x0 + 20 + rand(rng, 0, Math.max(1, w - bw - 40));
        const by = y0 + 20 + rand(rng, 0, Math.max(1, ht - bh - 40));
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: pick(rng, CFG.BUILDING_COLORS),
          roof: rng() < 0.5,
        });
      }
    }
  }
  return {
    buildings,
    roadsV: v,
    roadsH: h,
    beach: { x0: CFG.BEACH_X, x1: CFG.WATER_X },
    water: { x0: CFG.WATER_X, x1: CFG.WORLD_W },
    harbor: CFG.HARBOR,
    spawn: CFG.SPAWN,
    garage: CFG.GARAGE,
    goldSpot: CFG.GOLD_SPOT,
    deliver: CFG.DELIVER,
    turf: CFG.TURF,
    safehouse: CFG.SAFEHOUSE,
    hospital: CFG.HOSPITAL,
  };
}

export function onRoad(city, x, y, margin) {
  const m = margin || 0;
  for (const rx of city.roadsV) {
    if (Math.abs(x - rx) <= CFG.ROAD_W / 2 + m) return true;
  }
  for (const ry of city.roadsH) {
    if (Math.abs(y - ry) <= CFG.ROAD_W / 2 + m) return true;
  }
  return false;
}

// Push a circle out of every building it overlaps. Returns true on contact.
export function collideCircle(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        p.y = b.y - r;
      }
    }
  }
  // Keep inside the world (water edge blocks walking/driving too).
  p.x = Math.max(16, Math.min(CFG.WATER_X - 16, p.x));
  p.y = Math.max(16, Math.min(CFG.WORLD_H - 16, p.y));
  return hit;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function randomRoadPoint(rng, city) {
  const vertical = rng() < 0.5;
  if (vertical) {
    const rx = pick(rng, city.roadsV);
    return { x: rx + rand(rng, -40, 40), y: rand(rng, 120, CFG.WORLD_H - 120) };
  }
  const ry = pick(rng, city.roadsH);
  return { x: rand(rng, 120, CFG.BEACH_X - 120), y: ry + rand(rng, -40, 40) };
}
