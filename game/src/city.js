// The city of Solara Bay: a seeded road grid with building blocks in
// between, a beach and the sea along the east edge, and harbor docks in
// the south-west corner. Generation runs once per world build and is
// fully seeded, so the map is identical on every load.
import { CFG } from './config.js';
import { rand, randInt, pick } from './rng.js';

export function buildCity(rng) {
  const half = CFG.ROAD_W / 2;
  // Vertical strips: map edge, each avenue's two kerbs, the beach, the edge.
  const colEdges = [0, ...CFG.ROADS_V.flatMap((x) => [x - half, x + half]), CFG.BEACH_X, CFG.WORLD_W];
  const rowEdges = [0, ...CFG.ROADS_H.flatMap((y) => [y - half, y + half]), CFG.WORLD_H];
  const buildings = [];
  for (let ci = 0; ci < colEdges.length - 1; ci++) {
    for (let ri = 0; ri < rowEdges.length - 1; ri++) {
      // Odd strips are roads, not blocks.
      if (ci % 2 === 1 || ri % 2 === 1) continue;
      const x0 = colEdges[ci];
      const x1 = colEdges[ci + 1];
      const y0 = rowEdges[ri];
      const y1 = rowEdges[ri + 1];
      const w = x1 - x0;
      const h = y1 - y0;
      if (x0 >= CFG.BEACH_X) continue; // the beach strip stays empty
      if (x0 >= CFG.HARBOR.x0 && x1 <= CFG.HARBOR.x1 && y0 >= CFG.HARBOR.y0) continue; // the harbor
      if (w < 90 || h < 90) continue;
      const count = randInt(rng, 1, 2);
      for (let k = 0; k < count; k++) {
        const bw = rand(rng, 110, Math.min(260, w - 40));
        const bh = rand(rng, 100, Math.min(220, h - 40));
        const bx = x0 + 20 + rand(rng, 0, Math.max(1, w - bw - 40));
        const by = y0 + 20 + rand(rng, 0, Math.max(1, h - bh - 40));
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          color: pick(rng, CFG.BUILDING_COLORS),
          roof: rng() < 0.5,
        });
      }
    }
  }
  return {
    buildings,
    roadsV: CFG.ROADS_V,
    roadsH: CFG.ROADS_H,
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

// Is this point on a road, allowing a small margin around the asphalt?
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

// Push a circle out of every building it overlaps and clamp it inside the
// world. The sea edge blocks movement. Returns true when a building was hit.
export function collideCircle(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx;
    const dy = p.y - cy;
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
  p.x = Math.max(16, Math.min(CFG.WATER_X - 16, p.x));
  p.y = Math.max(16, Math.min(CFG.WORLD_H - 16, p.y));
  return hit;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// A random point on a road, used to spawn police and pickups.
export function randomRoadPoint(rng, city) {
  if (rng() < 0.5) {
    const rx = pick(rng, city.roadsV);
    return { x: rx + rand(rng, -40, 40), y: rand(rng, 120, CFG.WORLD_H - 120) };
  }
  const ry = pick(rng, city.roadsH);
  return { x: rand(rng, 120, CFG.BEACH_X - 120), y: ry + rand(rng, -40, 40) };
}
