// The canvas renderer: ground, roads, buildings, entities, the mission
// beacon, the off-screen target arrow, and finally the minimap.
import { CFG } from './config.js';
import { drawMinimap } from './minimap.js';
import { dist } from './city.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(G, x, y, m) {
  const c = G.camera;
  return x > c.x - m && x < c.x + CFG.VIEW_W + m && y > c.y - m && y < c.y + CFG.VIEW_H + m;
}

function drawCar(G, ctx, car) {
  if (!inView(G, car.x, car.y, 90)) return;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-car.w / 2 + 4, -car.h / 2 - 3, 12, 6);
  ctx.fillRect(-car.w / 2 + 4, car.h / 2 - 3, 12, 6);
  ctx.fillRect(car.w / 2 - 16, -car.h / 2 - 3, 12, 6);
  ctx.fillRect(car.w / 2 - 16, car.h / 2 - 3, 12, 6);
  // Body.
  ctx.fillStyle = car.color;
  rr(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7);
  ctx.fill();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(180, 220, 240, 0.85)';
  ctx.fillRect(car.w / 2 - 18, -car.h / 2 + 4, 8, car.h - 8);
  ctx.fillRect(-car.w / 2 + 6, -car.h / 2 + 4, 6, car.h - 8);
  // Police livery and the flashing light bar.
  if (car.isPatrol) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-6, -car.h / 2, 12, car.h);
    const flash = G.time % 0.6 < 0.3;
    ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-4, -car.h / 2 - 2, 8, 5);
    ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
    ctx.fillRect(-4, car.h / 2 - 3, 8, 5);
  }
  // Headlights.
  ctx.fillStyle = '#ffe98a';
  ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 4);
  ctx.fillRect(car.w / 2 - 2, car.h / 2 - 7, 3, 4);
  // The gold car's star.
  if (car.gold) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, 5);
  }
  ctx.restore();
}

export function drawWorld(G) {
  const ctx = G.ctx;
  const cam = G.camera;
  const p = G.player;
  const fx = p.inCar && p.car ? p.car.x : p.x;
  const fy = p.inCar && p.car ? p.car.y : p.y;
  cam.x = Math.max(0, Math.min(CFG.WORLD_W - CFG.VIEW_W, fx - CFG.VIEW_W / 2));
  cam.y = Math.max(0, Math.min(CFG.WORLD_H - CFG.VIEW_H, fy - CFG.VIEW_H / 2));
  const P = CFG.PALETTE;
  // Ground.
  ctx.fillStyle = P.grass;
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  // A subtle checker across the grass.
  ctx.fillStyle = P.grass2;
  const sq = 320;
  const x0 = Math.floor(cam.x / sq) * sq;
  const y0 = Math.floor(cam.y / sq) * sq;
  for (let x = x0; x < cam.x + CFG.VIEW_W + sq; x += sq) {
    for (let y = y0; y < cam.y + CFG.VIEW_H + sq; y += sq) {
      if (((x / sq) + (y / sq)) % 2 === 0) ctx.fillRect(x, y, sq, sq);
    }
  }
  // Beach and water.
  ctx.fillStyle = P.sand;
  ctx.fillRect(CFG.BEACH_X, 0, CFG.WATER_X - CFG.BEACH_X, CFG.WORLD_H);
  ctx.fillStyle = P.water;
  ctx.fillRect(CFG.WATER_X, 0, CFG.WORLD_W - CFG.WATER_X, CFG.WORLD_H);
  ctx.fillStyle = P.water2;
  for (let y = 60; y < CFG.WORLD_H; y += 180) {
    ctx.fillRect(CFG.WATER_X + 30, y, 60, 8);
    ctx.fillRect(CFG.WATER_X + 130, y + 90, 70, 8);
  }
  // Harbor docks.
  ctx.fillStyle = P.dock;
  const hb = G.city.harbor;
  ctx.fillRect(hb.x0, hb.y0, hb.x1 - hb.x0, 26);
  ctx.fillRect(hb.x0 + 60, hb.y0, 22, 200);
  ctx.fillRect(hb.x0 + 420, hb.y0, 22, 200);
  // Roads, with sidewalks and a dashed center line.
  for (const rx of G.city.roadsV) {
    ctx.fillStyle = P.sidewalk;
    ctx.fillRect(rx - CFG.ROAD_W / 2 - 6, 0, CFG.ROAD_W + 12, CFG.WORLD_H);
    ctx.fillStyle = P.road;
    ctx.fillRect(rx - CFG.ROAD_W / 2, 0, CFG.ROAD_W, CFG.WORLD_H);
    ctx.fillStyle = P.dash;
    for (let y = Math.floor(cam.y / 60) * 60; y < cam.y + CFG.VIEW_H; y += 60) {
      ctx.fillRect(rx - 2, y, 4, 28);
    }
  }
  for (const ry of G.city.roadsH) {
    ctx.fillStyle = P.sidewalk;
    ctx.fillRect(0, ry - CFG.ROAD_W / 2 - 6, CFG.BEACH_X, CFG.ROAD_W + 12);
    ctx.fillStyle = P.road;
    ctx.fillRect(0, ry - CFG.ROAD_W / 2, CFG.BEACH_X, CFG.ROAD_W);
    ctx.fillStyle = P.dash;
    for (let x = Math.floor(cam.x / 60) * 60; x < cam.x + CFG.VIEW_W; x += 60) {
      ctx.fillRect(x, ry - 2, 28, 4);
    }
  }
  // Buildings, with a shadow, an optional bright roof, and windows.
  for (const b of G.city.buildings) {
    if (!inView(G, b.x + b.w / 2, b.y + b.h / 2, 300)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    }
    ctx.fillStyle = 'rgba(20,30,50,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j + Math.floor(b.x / 50)) % 3 !== 0) continue;
        ctx.fillRect(b.x + 10 + i * 34, b.y + 10 + j * 34, 14, 12);
      }
    }
  }
  // The mission beacon: a gold column, a pulsing ring, and a label.
  const t = G.missions.target;
  if (t && !G.storyComplete) {
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
    ctx.fillRect(t.x - 26 * pulse, 0, 52 * pulse, CFG.WORLD_H);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label || 'TARGET', t.x, t.y - 46);
  }
  // Pickups, bobbing gently.
  for (const k of G.pickups) {
    if (!inView(G, k.x, k.y, 60)) continue;
    const bob = Math.sin(k.bob) * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(k.x, k.y + bob, 13, 0, Math.PI * 2);
    ctx.fill();
    if (k.kind === 'health') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(k.x - 7, k.y + bob - 2.5, 14, 5);
      ctx.fillRect(k.x - 2.5, k.y + bob - 7, 5, 14);
    } else {
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(k.x - 6, k.y + bob - 6, 12, 12);
      ctx.fillStyle = '#7a5a00';
      ctx.fillRect(k.x - 3, k.y + bob - 3, 2, 6);
      ctx.fillRect(k.x + 1, k.y + bob - 3, 2, 6);
    }
  }
  // Cars: parked, traffic, patrols.
  for (const c of G.parked) drawCar(G, ctx, c);
  for (const c of G.traffic) drawCar(G, ctx, c);
  for (const c of G.patrols) drawCar(G, ctx, c);
  // Pedestrians.
  for (const pd of G.peds) {
    if (!inView(G, pd.x, pd.y, 40)) continue;
    ctx.fillStyle = pd.shirt;
    ctx.beginPath();
    ctx.arc(pd.x, pd.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(pd.x, pd.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Foot officers.
  for (const c of G.cops) {
    if (!inView(G, c.x, c.y, 40)) continue;
    ctx.fillStyle = '#1c3f6e';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fc4ee';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(c.x - 1, c.y + 4, 2, 5);
  }
  // Gang enemies, with health pips and a gun barrel.
  for (const e of G.enemies) {
    if (!inView(G, e.x, e.y, 40)) continue;
    ctx.fillStyle = '#8e1f1f';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(e.x, e.y - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.angle) * 22, e.y + Math.sin(e.angle) * 22);
    ctx.stroke();
    ctx.fillStyle = '#ff5a4d';
    for (let i = 0; i < e.hp; i++) ctx.fillRect(e.x - 12 + i * 9, e.y - 20, 7, 3);
  }
  // The player's car, drawn above traffic.
  if (p.inCar && p.car) drawCar(G, ctx, p.car);
  // The player on foot, with a facing tick.
  if (!p.inCar) {
    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c48a';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
    ctx.stroke();
  }
  // Bullets.
  for (const b of G.bullets) {
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of G.ebullets) {
    ctx.fillStyle = '#ff6b5e';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.t / 0.2);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // An arrow at the screen edge when the target is off-screen.
  if (t && !G.storyComplete) {
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx < 0 || sx > CFG.VIEW_W || sy < 0 || sy > CFG.VIEW_H) {
      const cx = Math.max(50, Math.min(CFG.VIEW_W - 50, sx));
      const cy = Math.max(70, Math.min(CFG.VIEW_H - 50, sy));
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${t.label || 'TARGET'} ${Math.round(dist(fx, fy, t.x, t.y))}m`, cx, cy + 26);
    }
  }
  drawMinimap(G, ctx);
}
