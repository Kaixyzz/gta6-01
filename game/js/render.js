// Canvas rendering: city, vehicles, people, effects, HUD, minimap.
import { AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H } from './city.js';
import { missionTitle, missionObjective } from './missions.js';

const VW = 1280;
const VH = 720;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, cam, city, time) {
  const x0 = Math.max(0, cam.x - 40), y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(WORLD_W, cam.x + VW + 40), y1 = Math.min(WORLD_H, cam.y + VH + 40);
  // Ground base: grass.
  ctx.fillStyle = '#7ec850';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Water (east edge) with shimmer.
  const waterX = 2460;
  if (x1 > waterX) {
    const g = ctx.createLinearGradient(waterX, 0, WORLD_W, 0);
    g.addColorStop(0, '#2fa8c9'); g.addColorStop(1, '#0e7fa8');
    ctx.fillStyle = g;
    ctx.fillRect(Math.max(x0, waterX), y0, x1 - Math.max(x0, waterX), y1 - y0);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const wy = ((i * 173 + time * 30) % 1900) + 10;
      const wx = waterX + 18 + ((i * 53) % 70);
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 26, wy); ctx.stroke();
    }
  }
  // Beach sand.
  if (x1 > 2380) {
    ctx.fillStyle = '#f4d58d';
    ctx.fillRect(Math.max(x0, 2380), y0, Math.min(x1, waterX) - Math.max(x0, 2380), y1 - y0);
  }
  // Promenade strip.
  if (x1 > 2330) {
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(Math.max(x0, 2330), y0, Math.min(x1, 2380) - Math.max(x0, 2330), y1 - y0);
  }
  // Park block.
  ctx.fillStyle = '#5da244';
  ctx.fillRect(960, 960, 320, 320);
  ctx.fillStyle = '#8a6b52';
  ctx.fillRect(1104, 960, 32, 320); // park path
  ctx.fillRect(960, 1104, 320, 32);
  // Roads.
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
  for (const sy of STREETS) ctx.fillRect(x0, sy - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
  // Lane dashes.
  ctx.fillStyle = '#f7d774';
  for (const ax of AVENUES) {
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(ax - 2, y, 4, 22);
  }
  for (const sy of STREETS) {
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, sy - 2, 22, 4);
  }
  // Sidewalks.
  ctx.fillStyle = '#b9bec6';
  for (const ax of AVENUES) {
    ctx.fillRect(ax - ROAD_HALF - 10, y0, 10, y1 - y0);
    ctx.fillRect(ax + ROAD_HALF, y0, 10, y1 - y0);
  }
  for (const sy of STREETS) {
    ctx.fillRect(x0, sy - ROAD_HALF - 10, x1 - x0, 10);
    ctx.fillRect(x0, sy + ROAD_HALF, x1 - x0, 10);
  }
  // Buildings with height shadows + rooftop details.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 6 + b.height * 3, b.y + 6 + b.height * 3, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      ctx.fillRect(b.x + 10 + i * 24, b.y + 10 + j * 24, 10, 8);
    }
    if (b.height >= 3) { ctx.fillStyle = '#5b6b7a'; ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16); }
  }
  // Park trees.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(t.x + 3, t.y + 4, t.r, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#2f7d32';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#43a047';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, 6.29); ctx.fill();
  }
  // Palms along the promenade.
  for (const p of city.palms) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    ctx.strokeStyle = '#8a6b52'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4, p.y - 16); ctx.stroke();
    ctx.fillStyle = '#2e9e4f';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.283 + 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x + 4 + Math.cos(a) * 11, p.y - 16 + Math.sin(a) * 6, 12, 4, a, 0, 6.29);
      ctx.fill();
    }
  }
  // Beach umbrellas.
  for (const u of city.umbrellas) {
    if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
    ctx.fillStyle = u.color;
    ctx.beginPath(); ctx.arc(u.x, u.y, 13, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#6b4f2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x, u.y + 10); ctx.stroke();
  }
  // Marina boats.
  for (const b of city.boats) {
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.fillStyle = '#f5f5f5';
    rr(ctx, -b.len / 2, -7, b.len, 14, 7); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-4, -16, 8, 12);
    ctx.restore();
  }
  // Sun glare gradient (top of the view).
  const glare = ctx.createLinearGradient(0, cam.y, 0, cam.y + 260);
  glare.addColorStop(0, 'rgba(255,236,170,0.14)');
  glare.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(x0, y0, x1 - x0, Math.min(260, y1 - y0));
}

export function drawSkids(ctx, skids) {
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4;
  for (const s of skids) {
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
}

export function drawVehicle(ctx, v, isPlayerCar) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  const st = v.stats;
  const w = st.w, h = st.h;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -w / 2 + 3, -h / 2 + 3, w, h, 5); ctx.fill();
  ctx.fillStyle = v.color;
  rr(ctx, -w / 2, -h / 2, w, h, 5); ctx.fill();
  if (v.kind === 'bike') {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-6, 0, 5, 0, 6.29); ctx.arc(7, 0, 5, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#f5c6a5';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 6.29); ctx.fill();
  } else {
    ctx.fillStyle = '#bfe3f0';
    rr(ctx, -w * 0.18, -h / 2 + 2, w * 0.36, h - 4, 3); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-w / 2 + 3, -h / 2 - 2, 7, 3);
    ctx.fillRect(-w / 2 + 3, h / 2 - 1, 7, 3);
    ctx.fillRect(w / 2 - 10, -h / 2 - 2, 7, 3);
    ctx.fillRect(w / 2 - 10, h / 2 - 1, 7, 3);
    if (v.kind === 'truck') {
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, 12, h - 4);
    }
    if (v.kind === 'sports') {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(w / 2 - 6, -h / 2 + 3, 4, h - 6);
    }
  }
  if (isPlayerCar) {
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    rr(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 7); ctx.stroke();
  }
  ctx.restore();
}

export function drawPatrol(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -15, -6, 34, 18, 5); ctx.fill();
  ctx.fillStyle = p.flash > 0 ? '#ff4444' : '#1a3a8c';
  rr(ctx, -18, -9, 34, 18, 5); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4, -9, 10, 18);
  ctx.fillStyle = '#bfe3f0';
  rr(ctx, -6, -7, 12, 14, 3); ctx.fill();
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(-14, -11, 5, 4);
  ctx.fillStyle = '#0066ff';
  ctx.fillRect(-14, 7, 5, 4);
  ctx.restore();
}

export function drawPerson(ctx, x, y, angle, shirt, skin, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.flash > 0) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(opts.flash * 30); }
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 3, 9, 6, 0, 0, 6.29); ctx.fill();
  // Body.
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.29); ctx.fill();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 5, 0, 6.29); ctx.fill();
  // Gun direction tick when armed.
  if (opts.armed) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * 16, Math.sin(angle) * 16); ctx.stroke();
  }
  if (opts.muzzle > 0) {
    ctx.fillStyle = '#ffdd33';
    ctx.beginPath(); ctx.arc(Math.cos(angle) * 18, Math.sin(angle) * 18, 6, 0, 6.29); ctx.fill();
  }
  ctx.restore();
}

export function drawPickup(ctx, p, time) {
  const bob = Math.sin(time * 3 + p.bob) * 3;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  if (p.kind === 'stash') {
    ctx.fillStyle = 'rgba(255,209,102,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(time * 4) * 3, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#ffd166';
    rr(ctx, -8, -6, 16, 12, 3); ctx.fill();
    ctx.fillStyle = '#8a6b52';
    ctx.fillRect(-8, -2, 16, 3);
  } else if (p.kind === 'ammo') {
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A', 0, 1);
  } else {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
  }
  ctx.restore();
}

export function drawMarker(ctx, marker, time) {
  if (!marker) return;
  const pulse = 1 + Math.sin(time * 4) * 0.12;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 26 * pulse, 0, 6.29); ctx.stroke();
  ctx.fillStyle = 'rgba(255,209,102,0.25)';
  ctx.beginPath(); ctx.arc(0, 0, 26 * pulse, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(10, -16); ctx.lineTo(-10, -16); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Edge arrow pointing at the marker when it is off-screen.
  const sx = marker.x, sy = marker.y;
  const cx = sx, cy = sy;
  void cx; void cy;
}

export function drawParticles(ctx, particles) {
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 6.29); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawMinimap(ctx, city, g, cam) {
  const mw = 190, mh = 142;
  const mx = VW - mw - 14, my = 14;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(6,20,32,0.82)';
  rr(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.fill();
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5;
  rr(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.stroke();
  // Water + beach.
  ctx.fillStyle = '#0e7fa8';
  ctx.fillRect(mx + 2460 * sx, my, (WORLD_W - 2460) * sx, mh);
  ctx.fillStyle = '#f4d58d';
  ctx.fillRect(mx + 2380 * sx, my, 80 * sx, mh);
  // Roads.
  ctx.fillStyle = '#5a6270';
  for (const ax of AVENUES) ctx.fillRect(mx + (ax - 48) * sx, my, 96 * sx, mh);
  for (const sy2 of STREETS) ctx.fillRect(mx, my + (sy2 - 48) * sy, mw, 96 * sy);
  // Park.
  ctx.fillStyle = '#5da244';
  ctx.fillRect(mx + 960 * sx, my + 960 * sy, 320 * sx, 320 * sy);
  // Buildings.
  ctx.fillStyle = '#c9a37e';
  for (const b of city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
  // Stash dots (only when the player is near).
  for (const s of g.stashes) {
    if (s.taken) continue;
    const d = Math.hypot(s.x - g.player.x, s.y - g.player.y);
    if (d < 420) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(mx + s.x * sx, my + s.y * sy, 3.5, 0, 6.29); ctx.fill();
    }
  }
  // Police (blue/red dots).
  for (const c of g.footCops) {
    ctx.fillStyle = '#4a90ff';
    ctx.beginPath(); ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, 6.29); ctx.fill();
  }
  for (const p of g.patrols) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(mx + p.x * sx, my + p.y * sy, 3.5, 0, 6.29); ctx.fill();
  }
  // Mission marker (gold diamond).
  if (g.marker) {
    ctx.fillStyle = '#ffd166';
    const px = mx + g.marker.x * sx, py = my + g.marker.y * sy;
    ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px + 6, py); ctx.lineTo(px, py + 6); ctx.lineTo(px - 6, py); ctx.closePath(); ctx.fill();
  }
  // Player (white dot with gold ring).
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx + g.player.x * sx, my + g.player.y * sy, 4, 0, 6.29); ctx.fill();
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(mx + g.player.x * sx, my + g.player.y * sy, 6.5, 0, 6.29); ctx.stroke();
  ctx.restore();
}

export function drawHud(ctx, g, time) {
  const p = g.player;
  ctx.save();
  // Top-left: money + health + ammo.
  ctx.fillStyle = 'rgba(6,20,32,0.78)';
  rr(ctx, 12, 12, 250, 84, 10); ctx.fill();
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 26px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('$' + p.money, 26, 34);
  // Health bar.
  ctx.fillStyle = '#333';
  rr(ctx, 26, 52, 150, 12, 6); ctx.fill();
  ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
  rr(ctx, 26, 52, Math.max(0, 150 * p.hp / p.maxHp), 12, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HP ' + Math.ceil(p.hp), 182, 58);
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('AMMO ' + p.ammo, 26, 82);
  ctx.fillStyle = '#7fe3f0'; ctx.font = 'bold 14px sans-serif';
  ctx.fillText('STASH ' + g.stashGot + '/' + g.stashTotal, 140, 82);
  // Wanted stars (top center), pulsing at 3.
  const pulse = g.wanted === 3 ? 1 + Math.sin(time * 6) * 0.25 : 1;
  ctx.font = `${Math.round(30 * pulse)}px sans-serif`;
  ctx.textAlign = 'center';
  let stars = '';
  for (let i = 0; i < 3; i++) stars += i < g.wanted ? '★' : '☆';
  ctx.fillStyle = g.wanted > 0 ? '#ffcc00' : 'rgba(255,255,255,0.5)';
  ctx.fillText(stars, VW / 2, 40);
  // Mission card (bottom-left).
  ctx.fillStyle = 'rgba(6,20,32,0.82)';
  rr(ctx, 12, VH - 96, 420, 84, 10); ctx.fill();
  ctx.strokeStyle = '#f4a259'; ctx.lineWidth = 1.5;
  rr(ctx, 12, VH - 96, 420, 84, 10); ctx.stroke();
  ctx.fillStyle = '#ffd166'; ctx.font = 'bold 17px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(missionTitle(g.missionIndex), 26, VH - 76);
  ctx.fillStyle = '#d7e6ec'; ctx.font = '14px "Trebuchet MS", sans-serif';
  const obj = missionObjective(g.missionIndex, g.stage, g.kills, g.killsNeeded);
  ctx.fillText(obj.length > 52 ? obj.slice(0, 52) + '…' : obj, 26, VH - 50);
  ctx.fillStyle = '#7fe3f0'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Reward $' + (g.missionIndex < 6 ? [300, 500, 800, 1500, 800, 1500][g.missionIndex] : 0) + '   •   Mission ' + Math.min(g.missionIndex + 1, 6) + '/6', 26, VH - 28);
  // Controls hint (bottom-right, small).
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('WASD move/drive · E car · Click shoot · P pause', VW - 14, VH - 16);
  ctx.restore();
}
