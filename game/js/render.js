// Every pixel the game draws: city, vehicles, people, effects, HUD and
// minimap. Pure drawing: it reads the game state and never mutates it.
import { AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H } from './city.js';
import { missionTitle, missionObjective, missionReward } from './missions.js';

const VIEW_W = 1280;
const VIEW_H = 720;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = car.w;
  const h = car.h;
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  const wy = h / 2 - 1;
  ctx.fillRect(-w * 0.28, -wy - 3, 12, 5);
  ctx.fillRect(w * 0.14, -wy - 3, 12, 5);
  ctx.fillRect(-w * 0.28, wy - 2, 12, 5);
  ctx.fillRect(w * 0.14, wy - 2, 12, 5);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  // Windshield + roof.
  ctx.fillStyle = 'rgba(20, 40, 60, 0.55)';
  ctx.fillRect(-w * 0.08, -h / 2 + 3, w * 0.22, h - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(w * 0.18, -h / 2 + 4, w * 0.14, h - 8);
  if (car.kind === 'truck') {
    ctx.fillStyle = '#e8e0cc';
    ctx.fillRect(w * 0.28, -h / 2 + 2, w * 0.16, h - 4);
  }
  if (car.kind === 'bike') {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-w * 0.3, 0, 5, 0, Math.PI * 2);
    ctx.arc(w * 0.3, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.kind === 'sports') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-w / 2 - 3, -h / 2 + 2, 4, h - 4);
  }
  if (car.kind === 'patrol') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-w * 0.05, -h / 2 + 2, w * 0.2, h - 4);
    // Flashing light bar.
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-6, -h / 2 - 2, 12, 5);
    ctx.fillStyle = on ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-6, h / 2 - 3, 12, 5);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 4);
    ctx.fillRect(w / 2 - 2, h / 2 - 7, 3, 4);
  }
  ctx.restore();
}

function drawWorld(ctx, g) {
  const c = g.city;
  const t = g.time;
  // Ground: sun-baked grass.
  ctx.fillStyle = '#8ab661';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Sand strips along the south beach and the east shore.
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(0, 1680, WORLD_W, 160);
  ctx.fillRect(2288, 0, 152, WORLD_H);
  // Water with a slow shimmer.
  ctx.fillStyle = '#3a9bc2';
  ctx.fillRect(0, 1840, WORLD_W, 80);
  ctx.fillRect(2440, 0, 120, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const yy = 1862 + i * 8;
    const off = Math.sin(t * 1.4 + i * 1.7) * 14;
    ctx.beginPath();
    ctx.moveTo(200 + off, yy);
    ctx.lineTo(420 + off, yy);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const xx = 2470 + i * 16;
    const off = Math.sin(t * 1.2 + i * 2.1) * 10;
    ctx.beginPath();
    ctx.moveTo(xx, 300 + off);
    ctx.lineTo(xx, 460 + off);
    ctx.stroke();
  }
  // Park block and turf plaza.
  ctx.fillStyle = '#6aa84f';
  ctx.fillRect(1008, 1328, 224, 224);
  ctx.fillStyle = '#d8d2c0';
  ctx.fillRect(688, 1328, 224, 224);
  // Sidewalks, then roads.
  ctx.fillStyle = '#c9c2b0';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF - 14, 0, (ROAD_HALF + 14) * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF - 14, WORLD_W, (ROAD_HALF + 14) * 2);
  ctx.fillStyle = '#3d3d47';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  // Centre dashes.
  ctx.strokeStyle = '#e8d44d';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, WORLD_H);
    ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(WORLD_W, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(ax - 40 + k * 16, sy - ROAD_HALF - 8, 8, 12);
        ctx.fillRect(ax - 40 + k * 16, sy + ROAD_HALF - 4, 8, 12);
      }
    }
  }
  // Buildings with rooftop detail; taller ones cast a longer shadow.
  for (const b of c.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6 + b.height * 3, b.y + 8 + b.height * 3, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.45, 18, 14);
    ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.3, 12, 10);
    if (b.kind === 'garage') {
      ctx.fillStyle = '#5a5a60';
      ctx.fillRect(b.x + 20, b.y + b.h - 46, b.w - 40, 40);
      ctx.strokeStyle = '#333';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(b.x + 20, b.y + b.h - 36 + k * 10);
        ctx.lineTo(b.x + b.w - 20, b.y + b.h - 36 + k * 10);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('GARAGE', b.x + 24, b.y + 26);
    }
    if (b.kind === 'bank') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('BANK', b.x + 70, b.y + 34);
      ctx.fillStyle = '#c9b896';
      for (let k = 0; k < 4; k++) ctx.fillRect(b.x + 24 + k * 46, b.y + b.h - 52, 14, 48);
    }
    if (b.kind === 'house') {
      ctx.fillStyle = '#a34d2d';
      ctx.beginPath();
      ctx.moveTo(b.x - 6, b.y + 10);
      ctx.lineTo(b.x + b.w / 2, b.y - 22);
      ctx.lineTo(b.x + b.w + 6, b.y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('HOME', b.x + 56, b.y + 30);
    }
  }
  // Park trees.
  for (const tr of c.trees) {
    ctx.fillStyle = '#4e7d3a';
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6aa84f';
    ctx.beginPath();
    ctx.arc(tr.x - 3, tr.y - 3, tr.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Palms.
  for (const p of c.palms) {
    ctx.strokeStyle = '#8a6d4b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 4, p.y - 22);
    ctx.stroke();
    ctx.fillStyle = '#3f7d2c';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x + 4 + Math.cos(a) * 11, p.y - 24 + Math.sin(a) * 7, 12, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Beach umbrellas.
  for (const u of c.umbrellas) {
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x, u.y - 16);
    ctx.stroke();
    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y - 16, 14, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
  // Marina docks and boats.
  ctx.fillStyle = '#9a7b4f';
  for (const d of c.docks) ctx.fillRect(d.x, d.y, d.w, d.h);
  for (const b of c.boats) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a4a2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, -22);
    ctx.stroke();
    ctx.restore();
  }
  // Hidden stashes (uncollected only).
  for (const s of c.stashes) {
    if (s.got) continue;
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.25 + 0.3 * pulse})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 22 + 4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(s.x - 9, s.y - 7, 18, 14);
    ctx.fillStyle = '#8a6d00';
    ctx.fillRect(s.x - 9, s.y - 1, 18, 3);
  }
  // Pickups.
  for (const p of g.pickups) {
    if (p.kind === 'ammo') {
      ctx.fillStyle = '#4a7c2e';
      ctx.fillRect(p.x - 10, p.y - 8, 20, 16);
      ctx.fillStyle = '#d8e6a0';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('AMMO', p.x - 9, p.y + 4);
    } else {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
      ctx.fillStyle = '#d90429';
      ctx.fillRect(p.x - 2, p.y - 7, 4, 14);
      ctx.fillRect(p.x - 7, p.y - 2, 14, 4);
    }
  }
  // Mission marker: pulsing beam + diamond.
  const m = g.marker;
  if (m) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255, 200, 0, ${0.12 + 0.1 * pulse})`;
    ctx.fillRect(m.x - 16, m.y - 90, 32, 90);
    ctx.fillStyle = '#ffc800';
    ctx.save();
    ctx.translate(m.x, m.y - 30 - 6 * pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    ctx.strokeStyle = '#ffc800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26 + 4 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Skid marks.
  for (const s of g.skids) {
    ctx.strokeStyle = `rgba(20,20,20,${0.35 * s.life})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  // Cars (parked, traffic, patrols, player's).
  for (const car of g.cars) drawCarShape(ctx, car, t);
  // Pedestrians.
  for (const p of g.peds) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Enemies with HP bars.
  for (const e of g.enemies) {
    ctx.fillStyle = '#c1121f';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7f0d18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - 14, e.y - 24, 28, 5);
    ctx.fillStyle = '#e5383b';
    ctx.fillRect(e.x - 14, e.y - 24, 28 * (e.hp / 3), 5);
  }
  // Foot police.
  for (const cp of g.cops) {
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f2a6b';
    ctx.beginPath();
    ctx.arc(cp.x, cp.y - 2, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player.
  const pl = g.player;
  if (!pl.inCar) {
    ctx.fillStyle = '#0ea5a5';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#065f5f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, pl.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pl.x, pl.y);
    ctx.lineTo(pl.x + Math.cos(pl.angle) * 20, pl.y + Math.sin(pl.angle) * 20);
    ctx.stroke();
  }
  // Particles.
  for (const pt of g.particles) {
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Muzzle flash.
  if (g.muzzleT > 0 && !pl.inCar) {
    const fx = pl.x + Math.cos(pl.angle) * 24;
    const fy = pl.y + Math.sin(pl.angle) * 24;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(fx, fy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(fx, fy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(ctx, g) {
  const pl = g.player;
  ctx.save();
  // Money, health, ammo.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 12, 12, 250, 92, 10);
  ctx.fill();
  ctx.fillStyle = '#7CFC66';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('$' + g.money.toLocaleString('en-US'), 24, 44);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('HP', 24, 66);
  ctx.fillStyle = '#333';
  ctx.fillRect(58, 54, 120, 12);
  ctx.fillStyle = pl.hp > 40 ? '#4ade80' : '#ef4444';
  ctx.fillRect(58, 54, 120 * Math.max(0, pl.hp / 100), 12);
  ctx.fillStyle = '#fff';
  ctx.fillText('Ammo ' + pl.ammo, 24, 92);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Stash ' + g.stashGot + '/3', 150, 92);
  // Wanted stars, pulsing at 3 stars.
  const pulse = g.wanted >= 3 ? 1 + 0.12 * Math.sin(g.time * 6) : 1;
  ctx.font = `bold ${Math.round(30 * pulse)}px system-ui, sans-serif`;
  let stars = '';
  for (let i = 0; i < 3; i++) stars += i < g.wanted ? '★' : '☆';
  ctx.fillStyle = g.wanted > 0 ? '#ffd60a' : 'rgba(255,255,255,0.6)';
  const sw = ctx.measureText(stars).width;
  ctx.fillText(stars, VIEW_W - sw - 20, 48);
  // Mission card.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, VIEW_W / 2 - 260, 12, 520, 64, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd60a';
  ctx.font = 'bold 17px system-ui, sans-serif';
  const title = g.storyComplete ? 'Story Complete' : `M${g.missionIndex + 1} — ${missionTitle(g.missionIndex)}`;
  ctx.textAlign = 'center';
  ctx.fillText(title, VIEW_W / 2, 36);
  ctx.fillStyle = '#fff';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(g.storyComplete ? 'You rule Solara Bay.' : missionObjective(g.missionIndex), VIEW_W / 2, 60);
  ctx.fillStyle = '#7CFC66';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(g.storyComplete ? '' : `Reward $${missionReward(g.missionIndex)}`, VIEW_W / 2, 76);
  ctx.textAlign = 'left';
  drawMinimap(ctx, g);
  ctx.restore();
}

function drawMinimap(ctx, g) {
  const mw = 230;
  const mh = 172;
  const mx = VIEW_W - mw - 14;
  const my = VIEW_H - mh - 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.clip();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(mx + ax * sx, my);
    ctx.lineTo(mx + ax * sx, my + mh);
    ctx.stroke();
  }
  for (const sy2 of STREETS) {
    ctx.beginPath();
    ctx.moveTo(mx, my + sy2 * sy);
    ctx.lineTo(mx + mw, my + sy2 * sy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const b of g.city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  ctx.fillStyle = '#3a9bc2';
  ctx.fillRect(mx + 2440 * sx, my, 120 * sx, mh);
  ctx.fillRect(mx, my + 1840 * sy, mw, 80 * sy);
  // Stashes only when the player is near them.
  const pl = g.player;
  for (const s of g.city.stashes) {
    if (s.got) continue;
    if (Math.hypot(s.x - pl.x, s.y - pl.y) < 450) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(mx + s.x * sx, my + s.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (g.marker) {
    const pulse = 3 + Math.sin(g.time * 4) * 1.5;
    ctx.fillStyle = '#ffc800';
    ctx.beginPath();
    ctx.arc(mx + g.marker.x * sx, my + g.marker.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const car of g.cars) {
    if (car.kind === 'patrol') {
      ctx.fillStyle = '#ff4040';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const cp of g.cops) {
    ctx.fillStyle = '#4d7cff';
    ctx.beginPath();
    ctx.arc(mx + cp.x * sx, my + cp.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx + pl.x * sx, my + pl.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(mx + pl.x * sx, my + pl.y * sy, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function render(ctx, g) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const shx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
  const shy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
  ctx.save();
  ctx.translate(-g.cam.x + shx, -g.cam.y + shy);
  drawWorld(ctx, g);
  ctx.restore();
  if (g.started) drawHud(ctx, g);
  // Sun glare, top-right.
  const grad = ctx.createRadialGradient(VIEW_W - 80, 40, 10, VIEW_W - 80, 40, 260);
  grad.addColorStop(0, 'rgba(255, 240, 180, 0.20)');
  grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
