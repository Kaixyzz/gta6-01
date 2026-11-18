// The live minimap: the whole city scaled down to a corner of the
// screen, with the player, cars, police, enemies and the mission marker.
import { CFG } from './config.js';

export function drawMinimap(G, ctx) {
  const W = 168;
  const H = 126;
  const X = CFG.VIEW_W - W - 14;
  const Y = 14;
  const sx = W / CFG.WORLD_W;
  const sy = H / CFG.WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 18, 12, 0.82)';
  ctx.fillRect(X - 4, Y - 4, W + 8, H + 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(X - 4, Y - 4, W + 8, H + 8);
  // Ground, beach, water.
  ctx.fillStyle = '#3d7a35';
  ctx.fillRect(X, Y, W, H);
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(X + CFG.BEACH_X * sx, Y, (CFG.WATER_X - CFG.BEACH_X) * sx, H);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(X + CFG.WATER_X * sx, Y, (CFG.WORLD_W - CFG.WATER_X) * sx, H);
  // Roads.
  ctx.fillStyle = '#565d68';
  for (const rx of G.city.roadsV) ctx.fillRect(X + (rx - CFG.ROAD_W / 2) * sx, Y, CFG.ROAD_W * sx, H);
  for (const ry of G.city.roadsH) ctx.fillRect(X, Y + (ry - CFG.ROAD_W / 2) * sy, W, CFG.ROAD_W * sy);
  // Buildings.
  ctx.fillStyle = '#2b2f36';
  for (const b of G.city.buildings) {
    ctx.fillRect(X + b.x * sx, Y + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  }
  // The mission marker, pulsing gold.
  const t = G.missions.target;
  if (t && !G.storyComplete) {
    const r = 4 + Math.sin(G.time * 5) * 1.6;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(X + t.x * sx, Y + t.y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dots for cars, enemies and police.
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X + x * sx, Y + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const c of G.parked) dot(c.x, c.y, '#f2c230', 1.6);
  for (const c of G.traffic) dot(c.x, c.y, '#e8e8e8', 1.6);
  for (const e of G.enemies) dot(e.x, e.y, '#ff4d4d', 2);
  for (const c of G.cops) dot(c.x, c.y, '#4d9fff', 2);
  for (const c of G.patrols) dot(c.x, c.y, G.time % 0.6 < 0.3 ? '#ff4d4d' : '#4d9fff', 2.2);
  // The player last: white with a dark ring.
  const p = G.player;
  const px = p.inCar && p.car ? p.car.x : p.x;
  const py = p.inCar && p.car ? p.car.y : p.y;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(X + px * sx, Y + py * sy, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(X + px * sx, Y + py * sy, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
