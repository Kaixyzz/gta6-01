// Canvas rendering for SOLARA BAY: the city, the cars and people in it,
// the mission marker, and the minimap. Pure drawing from the world state.

import { WORLD_W, WORLD_H, AVENUES, STREETS, GARAGE, SAFEHOUSE, STATION } from './city.js';
import { clamp } from './rng.js';

const VIEW_W = 1280;
const VIEW_H = 720;

export function drawWorld(ctx, g, time) {
  const cam = g.cam;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // Ground: grass, then beach and water along the east and south edges.
  ctx.fillStyle = '#3f9e63';
  ctx.fillRect(cam.x - 20, cam.y - 20, VIEW_W + 40, VIEW_H + 40);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(2340, cam.y - 20, 100, VIEW_H + 40);
  ctx.fillRect(cam.x - 20, 1740, VIEW_W + 40, 100);
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(2440, cam.y - 20, WORLD_W - 2440 + 40, VIEW_H + 40);
  ctx.fillRect(cam.x - 20, 1840, VIEW_W + 40, WORLD_H - 1840 + 40);
  // Water shimmer.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const wy = 1860 + i * 14 + Math.sin(time * 0.7 + i * 2) * 3;
    if (wy < cam.y - 10 || wy > cam.y + VIEW_H + 10) continue;
    ctx.beginPath();
    ctx.moveTo(2440, wy);
    ctx.lineTo(2560, wy);
    ctx.stroke();
  }

  // Roads: asphalt with edge lines and dashed center lines.
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax - 48, 0, 96, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - 48, WORLD_W, 96);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(ax - 48, 0); ctx.lineTo(ax - 48, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax + 48, 0); ctx.lineTo(ax + 48, WORLD_H); ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath(); ctx.moveTo(0, sy - 48); ctx.lineTo(WORLD_W, sy - 48); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, sy + 48); ctx.lineTo(WORLD_W, sy + 48); ctx.stroke();
  }
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, WORLD_H); ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(WORLD_W, sy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Sidewalks.
  ctx.fillStyle = '#b9b3a4';
  for (const ax of AVENUES) {
    ctx.fillRect(ax - 60, 0, 12, WORLD_H);
    ctx.fillRect(ax + 48, 0, 12, WORLD_H);
  }
  for (const sy of STREETS) {
    ctx.fillRect(0, sy - 60, WORLD_W, 12);
    ctx.fillRect(0, sy + 48, WORLD_W, 12);
  }

  // Trees.
  for (const t of g.city.trees) {
    if (t.x < cam.x - 30 || t.x > cam.x + VIEW_W + 30 || t.y < cam.y - 30 || t.y > cam.y + VIEW_H + 30) continue;
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 6);
    ctx.fillStyle = '#2f7d4f';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 6, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings with a soft shadow and a roof.
  for (const b of g.city.buildings) {
    if (b.x > cam.x + VIEW_W + 20 || b.x + b.w < cam.x - 20 || b.y > cam.y + VIEW_H + 20 || b.y + b.h < cam.y - 20) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let wy = b.y + 14; wy < b.y + b.h - 12; wy += 18) {
        for (let wx = b.x + 10; wx < b.x + b.w - 10; wx += 18) {
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(b.x + b.w / 2 - 5, b.y + b.h / 2 - 4, 10, 8);
    }
  }

  // Named places.
  drawLabel(ctx, GARAGE.x + GARAGE.w / 2, GARAGE.y + GARAGE.h + 16, 'GARAGE', '#ffd166');
  drawLabel(ctx, SAFEHOUSE.x + SAFEHOUSE.w / 2, SAFEHOUSE.y + SAFEHOUSE.h + 16, 'SAFEHOUSE', '#7fb069');
  drawLabel(ctx, STATION.x + STATION.w / 2, STATION.y + STATION.h + 16, 'BAY PD', '#9cc3ff');
  drawLabel(ctx, 1300, 620, 'DOWNTOWN', 'rgba(255,255,255,0.55)');

  // Pickups.
  for (const p of g.pickups) {
    const bob = Math.sin(time * 3 + p.x) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = p.kind === 'ammo' ? '#ffd166' : '#37d67a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10231f';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'ammo' ? 'A' : '+', 0, 1);
    ctx.restore();
  }

  // Mission marker: pulsing ring + flag.
  const mk = g.mission.marker;
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  ctx.save();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(mk.x, mk.y, 26 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(mk.x, mk.y - 34);
  ctx.lineTo(mk.x + 9, mk.y - 16);
  ctx.lineTo(mk.x - 9, mk.y - 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Cars, pedestrians, enemies, cops, player, bullets, particles.
  for (const c of g.cars) drawCar(ctx, c, time);
  for (const p of g.peds) drawPed(ctx, p);
  for (const e of g.enemies) drawEnemy(ctx, e, time);
  for (const c of g.cops) drawCop(ctx, c);
  drawPlayer(ctx, g, time);
  for (const b of g.bullets) {
    ctx.strokeStyle = b.from === 'player' ? '#ffe08a' : '#ff7a5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const p of g.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Off-screen marker arrow at the screen edge.
  const sx = mk.x - cam.x;
  const sy = mk.y - cam.y;
  if (sx < 30 || sx > VIEW_W - 30 || sy < 30 || sy > VIEW_H - 30) {
    const cx = clamp(sx, 46, VIEW_W - 46);
    const cy = clamp(sy, 46, VIEW_H - 46);
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawLabel(ctx, x, y, text, color) {
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = ctx.measureText(text).width + 12;
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawCar(ctx, c, time) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 4, c.w, c.h);
  ctx.fillStyle = c.color;
  roundRect(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.fillRect(c.w / 2 - 12, -c.h / 2 + 3, 7, c.h - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-c.w / 2 + 2, -c.h / 2 + 2, 5, c.h - 4);
  if (c.kind === 'patrol') {
    const blink = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#2f7bff';
    ctx.beginPath(); ctx.arc(-2, -c.h / 2 + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = blink ? '#2f7bff' : '#ff3b30';
    ctx.beginPath(); ctx.arc(-2, c.h / 2 - 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 2, 3);
  }
  ctx.restore();
}

function drawPed(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  const flash = e.hp < 3 && Math.floor(time * 10) % 2 === 0;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = flash ? '#ff8a7a' : '#c22e2e';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.arc(Math.cos(e.angle) * 4, Math.sin(e.angle) * 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-12, -22, 24, 5);
  ctx.fillStyle = '#37d67a';
  ctx.fillRect(-12, -22, 24 * (e.hp / 3), 5);
  ctx.restore();
}

function drawCop(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.fillStyle = '#1f5fd6';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, -3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, g, time) {
  const p = g.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (g.inCar) {
    drawCar(ctx, { ...p.car, x: 0, y: 0 }, time);
  } else {
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10231f';
    ctx.beginPath();
    ctx.arc(6, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10231f';
    ctx.fillRect(8, -2, 10, 4);
  }
  ctx.restore();
  // Muzzle flash.
  if (g.muzzle > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(g.muzzle * 4, 0, 1);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawMinimap(ctx, g) {
  const s = 190 / WORLD_W;
  const sy = 142 / WORLD_H;
  ctx.clearRect(0, 0, 190, 142);
  ctx.fillStyle = '#123326';
  ctx.fillRect(0, 0, 190, 142);
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(2440 * s, 0, 190 - 2440 * s, 142);
  ctx.fillRect(0, 1840 * sy, 190, 142 - 1840 * sy);
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax * s - 2, 0, 4, 142);
  for (const st of STREETS) ctx.fillRect(0, st * sy - 2, 190, 4);
  ctx.fillStyle = '#7fb069';
  ctx.fillRect(SAFEHOUSE.x * s - 2, SAFEHOUSE.y * sy - 2, 5, 5);
  const mk = g.mission.marker;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(mk.x * s, mk.y * sy, 5, 0, Math.PI * 2);
  ctx.fill();
  for (const c of g.cars) {
    if (c.kind !== 'patrol') continue;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(c.x * s, c.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of g.cops) {
    ctx.fillStyle = '#2f7bff';
    ctx.beginPath();
    ctx.arc(c.x * s, c.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(g.px * s, g.py * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.strokeRect(g.cam.x * s, g.cam.y * sy, 1280 * s, 720 * sy);
}
