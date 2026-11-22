// render.js — every pixel of SOLARA BAY is drawn in code. No image assets.
// Visual rules for v3: warm saturated tropical palette, buildings with
// shadows/windows/rooftops, busy streets, BIG readable cars, a BIG
// helicopter, glowing neon at night, and a sunset-poster title scene.
import { WORLD_W, WORLD_H, AVENUES, STREETS, ROAD_HALF, BEACH_X0, WATER_X0, isWater } from './city.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(g, x, y, m = 120) {
  const vw = 1280 / g.zoom;
  const vh = 720 / g.zoom;
  return x > g.cam.x - m && x < g.cam.x + vw + m && y > g.cam.y - m && y < g.cam.y + vh + m;
}

export function drawScene(ctx, g, time) {
  const W = 1280;
  const H = 720;
  const vw = W / g.zoom;
  const vh = H / g.zoom;
  const night = g.night;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(g.zoom, g.zoom);
  ctx.translate(-g.cam.x, -g.cam.y);

  // ---- ground: grass, sand, water --------------------------------------
  ctx.fillStyle = night ? '#2c4a26' : '#69b844';
  ctx.fillRect(g.cam.x - 20, g.cam.y - 20, vw + 40, vh + 40);
  // subtle block tint variation so the grass is not one flat wash
  ctx.fillStyle = night ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 6; by++) {
      if ((bx + by) % 2 === 0) ctx.fillRect(bx * 320, by * 320, 320, 320);
    }
  }
  // sand strip
  ctx.fillStyle = night ? '#8a744a' : '#f2d8a0';
  ctx.fillRect(BEACH_X0, Math.max(0, g.cam.y - 20), WATER_X0 - BEACH_X0, vh + 40);
  // water with animated shimmer
  const wg = ctx.createLinearGradient(WATER_X0, 0, WORLD_W, 0);
  wg.addColorStop(0, night ? '#0d3a52' : '#2fb3c9');
  wg.addColorStop(1, night ? '#0a2c44' : '#1a7f9e');
  ctx.fillStyle = wg;
  ctx.fillRect(WATER_X0, Math.max(0, g.cam.y - 20), WORLD_W - WATER_X0, vh + 40);
  ctx.strokeStyle = night ? 'rgba(180,220,255,0.18)' : 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const yy = Math.floor((g.cam.y - 20) / 90) * 90 + i * 90 + Math.sin(time * 1.3 + i * 2.1) * 6;
    ctx.beginPath();
    ctx.moveTo(WATER_X0 + 12, yy);
    ctx.lineTo(WORLD_W - 10, yy + Math.sin(time + i) * 4);
    ctx.stroke();
  }

  drawRoads(ctx, g);
  drawPlazasParks(ctx, g);
  drawProps(ctx, g, time);
  drawBuildings(ctx, g, night);
  drawShellsPickups(ctx, g, time);
  drawMarkers(ctx, g, time);
  drawSkids(ctx, g);
  drawCars(ctx, g, time);
  drawPeople(ctx, g, time);
  drawEnemies(ctx, g, time);
  drawHelicopter(ctx, g, time);
  drawBullets(ctx, g, time);
  drawParticles(ctx, g);

  ctx.restore();

  // ---- night overlay + light -------------------------------------------
  if (night) {
    ctx.fillStyle = 'rgba(7,11,38,0.46)';
    ctx.fillRect(0, 0, W, H);
    drawNightLights(ctx, g, time);
  } else {
    // soft sun glare, top-right
    const gl = ctx.createRadialGradient(W - 120, 40, 10, W - 120, 40, 420);
    gl.addColorStop(0, 'rgba(255,244,180,0.28)');
    gl.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);
  }
  // subtle vignette so the frame feels finished
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawRoads(ctx, g) {
  // sidewalks (wider pale band) then asphalt with bright lane markings
  ctx.fillStyle = '#b8ab8d';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF - 14, 0, (ROAD_HALF + 14) * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF - 14, WORLD_W, (ROAD_HALF + 14) * 2);
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  // centre dashes (yellow) and edge lines (white)
  ctx.fillStyle = '#ffd94d';
  for (const ax of AVENUES) {
    for (let y = 0; y < WORLD_H; y += 64) ctx.fillRect(ax - 2, y, 4, 34);
  }
  for (const sy of STREETS) {
    for (let x = 0; x < WORLD_W; x += 64) ctx.fillRect(x, sy - 2, 34, 4);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const ax of AVENUES) {
    ctx.fillRect(ax - ROAD_HALF + 4, 0, 3, WORLD_H);
    ctx.fillRect(ax + ROAD_HALF - 7, 0, 3, WORLD_H);
  }
  for (const sy of STREETS) {
    ctx.fillRect(0, sy - ROAD_HALF + 4, WORLD_W, 3);
    ctx.fillRect(0, sy + ROAD_HALF - 7, WORLD_W, 3);
  }
}

function drawPlazasParks(ctx, g) {
  const w = g.world;
  for (const p of w.plazas) {
    if (!inView(g, p.x + p.w / 2, p.y + p.h / 2, 200)) continue;
    ctx.fillStyle = p.kind === 'parking' ? '#4a4f5a' : '#e8d9b0';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    if (p.kind === 'parking') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) ctx.strokeRect(p.x + 20 + i * 60, p.y + 20, 44, 80);
    }
    if (p.kind === 'bank' || p.kind === 'casino') {
      // fountain / planter in the middle of the plaza
      ctx.fillStyle = '#2fb3c9';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h - 50, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f7e8c9';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h - 50, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of w.parks) {
    if (!inView(g, p.x + p.w / 2, p.y + p.h / 2, 200)) continue;
    ctx.fillStyle = '#4e9b34';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#e8d9b0';
    ctx.fillRect(p.x + p.w / 2 - 8, p.y, 16, p.h);
    ctx.fillRect(p.x, p.y + p.h / 2 - 8, p.w, 16);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }
}

function drawProps(ctx, g, time) {
  const w = g.world;
  for (const p of w.props) {
    if (!inView(g, p.x, p.y, 80)) continue;
    switch (p.kind) {
      case 'palm': drawPalm(ctx, p.x, p.y, 1); break;
      case 'tree': {
        ctx.fillStyle = '#2f7d32';
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4caf50';
        ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, 10, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'lamp': {
        ctx.fillStyle = '#2c2c34';
        ctx.fillRect(p.x - 2, p.y - 16, 4, 32);
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath(); ctx.arc(p.x, p.y - 18, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bench': {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(p.x - 14, p.y - 4, 28, 8);
        ctx.fillStyle = '#5d3a17';
        ctx.fillRect(p.x - 12, p.y + 4, 3, 6);
        ctx.fillRect(p.x + 9, p.y + 4, 3, 6);
        break;
      }
      case 'hydrant': {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(p.x - 4, p.y - 8, 8, 16);
        ctx.beginPath(); ctx.arc(p.x, p.y - 9, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'stall': {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 24, p.y - 12, 48, 24);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x - 28, p.y - 12);
        ctx.lineTo(p.x + 28, p.y - 12);
        ctx.lineTo(p.x + 24, p.y - 26);
        ctx.lineTo(p.x - 24, p.y - 26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = -2; i <= 2; i++) ctx.fillRect(p.x + i * 11 - 2, p.y - 26, 4, 14);
        break;
      }
      case 'container': {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 34, p.y - 14, 68, 28);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) ctx.strokeRect(p.x - 30 + i * 13, p.y - 11, 9, 22);
        break;
      }
      case 'crane': {
        ctx.strokeStyle = '#3a3f4a';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + 60); ctx.lineTo(p.x, p.y - 90); ctx.lineTo(p.x + 110, p.y - 90); ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 90); ctx.lineTo(p.x + 40, p.y - 30); ctx.stroke();
        ctx.fillStyle = '#e0a458';
        ctx.fillRect(p.x + 96, p.y - 66, 12, 12);
        break;
      }
      case 'umbrella': {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(p.x - 1, p.y, 2, 16);
        break;
      }
      case 'towel': {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 12, p.y - 6, 24, 12);
        break;
      }
      case 'dock': {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(p.x - 13, p.y - 130, 26, 260);
        ctx.fillStyle = '#5d3a17';
        for (let i = 0; i < 6; i++) ctx.fillRect(p.x - 13, p.y - 120 + i * 44, 26, 3);
        break;
      }
      case 'parked': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle || 0);
        drawCarBody(ctx, p.color, 'car', time, false);
        ctx.restore();
        break;
      }
      case 'hedge': {
        ctx.fillStyle = '#2f7d32';
        rr(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 8);
        ctx.fill();
        break;
      }
      default: break;
    }
  }
  for (const b of w.boats) {
    if (!inView(g, b.x, b.y, 80)) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(-26, -10); ctx.lineTo(26, -10); ctx.lineTo(18, 10); ctx.lineTo(-18, 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b3a55';
    ctx.fillRect(-8, -18, 16, 10);
    ctx.restore();
  }
}

export function drawPalm(ctx, x, y, s) {
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 3 * s, y - 14 * s, x + 6 * s, y - 24 * s);
  ctx.stroke();
  ctx.strokeStyle = '#2f9e44';
  ctx.lineWidth = 3 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y - 24 * s);
    ctx.quadraticCurveTo(
      x + 6 * s + Math.cos(a) * 14 * s, y - 24 * s + Math.sin(a) * 14 * s,
      x + 6 * s + Math.cos(a) * 22 * s, y - 24 * s + Math.sin(a) * 22 * s + 6 * s,
    );
    ctx.stroke();
  }
  ctx.fillStyle = '#6b4423';
  ctx.beginPath(); ctx.arc(x + 6 * s, y - 22 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
}

function drawBuildings(ctx, g, night) {
  const w = g.world;
  for (const b of w.buildings) {
    if (!inView(g, b.x + b.w / 2, b.y + b.h / 2, 150)) continue;
    // drop shadow — gives every block depth
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, b.x + 9, b.y + 11, b.w, b.h, 6);
    ctx.fill();
    ctx.fillStyle = b.color;
    rr(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    // inner roof panel — gives each building a visible edge + depth
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, b.x + 5, b.y + 5, b.w - 10, b.h - 10, 4);
    ctx.fill();
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 4;
    rr(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.stroke();
    // windows: small glass panes by day, warm lit by night
    for (const win of (b.windows || [])) {
      const lit = night && ((win.x * 7 + win.y * 13) % 5 !== 0);
      ctx.fillStyle = lit ? '#ffd94d' : '#41679e';
      ctx.fillRect(b.x + win.x, b.y + win.y, 10, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(b.x + win.x, b.y + win.y, 10, 2);
    }
    // rooftop details
    for (const r of b.roof || []) {
      if (r.kind === 'ac') {
        ctx.fillStyle = '#8a8f98';
        ctx.fillRect(b.x + r.x, b.y + r.y, 18, 12);
      } else if (r.kind === 'tank') {
        ctx.fillStyle = '#5d6d7e';
        ctx.beginPath(); ctx.arc(b.x + r.x + 8, b.y + r.y + 8, 9, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(b.x + r.x, b.y + r.y, 20, 14);
      }
    }
    if (b.sign) {
      ctx.fillStyle = '#2c2c34';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  }
  // neon signs glow above their buildings (drawn last so they pop)
  for (const s of w.signs) {
    if (!inView(g, s.x, s.y, 80)) continue;
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = s.color;
    rr(ctx, s.x - s.w / 2, s.y - 12, s.w, 24, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.text, s.x, s.y + 4);
    ctx.restore();
  }
}

function drawShellsPickups(ctx, g, time) {
  const w = g.world;
  for (const s of w.shells) {
    if (s.collected || !inView(g, s.x, s.y, 60)) continue;
    const pulse = 1 + Math.sin(time * 3 + s.x) * 0.15;
    ctx.save();
    ctx.shadowColor = '#ffd94d';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(s.x, s.y, 9 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0.4, Math.PI * 1.4); ctx.stroke();
    ctx.restore();
  }
  for (const p of w.pickups) {
    if (p.taken || !inView(g, p.x, p.y, 60)) continue;
    ctx.save();
    ctx.shadowColor = p.kind === 'ammo' ? '#4dff88' : '#ff5f5f';
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.kind === 'ammo' ? '#1f7a3d' : '#ffffff';
    rr(ctx, p.x - 11, p.y - 11, 22, 22, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (p.kind === 'ammo') {
      ctx.fillStyle = '#4dff88';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', p.x, p.y + 3);
    } else {
      ctx.fillStyle = '#ff5f5f';
      ctx.fillRect(p.x - 3, p.y - 8, 6, 16);
      ctx.fillRect(p.x - 8, p.y - 3, 16, 6);
    }
    ctx.restore();
  }
}

function drawMarkers(ctx, g, time) {
  const m = g.marker;
  if (!m) return;
  const pulse = 1 + Math.sin(time * 4) * 0.2;
  ctx.save();
  ctx.shadowColor = '#ffd94d';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(m.x, m.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(m.x, m.y - 14); ctx.lineTo(m.x + 10, m.y); ctx.lineTo(m.x, m.y + 14); ctx.lineTo(m.x - 10, m.y);
  ctx.closePath(); ctx.fill();
  // vertical beam so the objective reads from far away
  ctx.fillStyle = 'rgba(255,217,77,0.10)';
  ctx.fillRect(m.x - 8, m.y - 400, 16, 400);
  ctx.restore();
  // race checkpoints
  if (g.race && g.race.active) {
    g.race.checkpoints.forEach((c, i) => {
      if (!inView(g, c.x, c.y, 80)) return;
      ctx.save();
      ctx.strokeStyle = i === g.race.nextIndex ? '#ff9d00' : 'rgba(255,157,0,0.35)';
      ctx.lineWidth = i === g.race.nextIndex ? 5 : 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff9d00';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), c.x, c.y + 7);
      ctx.restore();
    });
  }
}

function drawSkids(ctx, g) {
  for (const car of g.allCars) {
    for (const s of car.skid || []) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life) * 0.5;
      ctx.fillStyle = '#1c1c22';
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.fillRect(-14, -8, 28, 4);
      ctx.fillRect(-14, 4, 28, 4);
      ctx.restore();
    }
  }
}

function drawCarBody(ctx, color, type, time, isPolice) {
  const len = type === 'truck' ? 58 : type === 'bike' ? 38 : type === 'sports' ? 48 : 46;
  const wid = type === 'truck' ? 26 : type === 'bike' ? 14 : 22;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(3, 5, len / 2 + 2, wid / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  // wheels
  ctx.fillStyle = '#14141a';
  const wx = len / 2 - 9;
  const wy = wid / 2 - 1;
  ctx.fillRect(-wx - 4, -wy - 3, 10, 6);
  ctx.fillRect(wx - 6, -wy - 3, 10, 6);
  ctx.fillRect(-wx - 4, wy - 3, 10, 6);
  ctx.fillRect(wx - 6, wy - 3, 10, 6);
  // body
  ctx.fillStyle = color;
  rr(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  rr(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.stroke();
  if (type === 'bike') {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // cabin + windshield
  ctx.fillStyle = 'rgba(43,58,85,0.9)';
  rr(ctx, -len / 2 + 10, -wid / 2 + 4, len - 24, wid - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.75)';
  ctx.fillRect(len / 2 - 16, -wid / 2 + 5, 5, wid - 10);
  // headlights
  ctx.fillStyle = '#fff7c0';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5);
  if (type === 'sports') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-len / 2 - 2, -wid / 2 + 2, 5, wid - 4);
  }
  if (type === 'truck') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-len / 2 + 4, -wid / 2 + 3, 18, wid - 6);
  }
  if (type === 'taxi') {
    ctx.fillStyle = '#111';
    for (let i = 0; i < 6; i++) ctx.fillRect(-len / 2 + 6 + i * 6, -3, 4, 6);
  }
  if (isPolice) {
    ctx.fillStyle = '#1c4ed8';
    ctx.fillRect(-6, -wid / 2 + 2, 12, wid - 4);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SBPD', 0, -wid / 2 - 4);
    // flashing light bar
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-8, -wid / 2 - 2, 7, 5);
    ctx.fillStyle = on ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(1, -wid / 2 - 2, 7, 5);
  }
}

function drawCars(ctx, g, time) {
  for (const car of g.allCars) {
    if (!inView(g, car.x, car.y, 90)) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    drawCarBody(ctx, car.color, car.type, time, car.type === 'police');
    ctx.restore();
    if (car.flash > 0) {
      ctx.fillStyle = 'rgba(255,80,80,0.5)';
      ctx.beginPath(); ctx.arc(car.x, car.y, 30, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPerson(ctx, x, y, angle, color, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 8 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 7 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath(); ctx.arc(3 * scale, 0, 3.5 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPeople(ctx, g, time) {
  for (const p of g.peds) {
    if (!inView(g, p.x, p.y, 40)) continue;
    drawPerson(ctx, p.x, p.y, p.angle, p.color);
    if (p.isTaxi) {
      const bob = Math.sin(time * 5) * 3;
      ctx.save();
      ctx.shadowColor = '#ffd94d';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', p.x, p.y - 16 + bob);
      ctx.restore();
    }
  }
  // the player on foot
  if (!g.inCar && g.phase !== 'title') {
    drawPerson(ctx, g.px, g.py, g.playerAngle, '#ffd94d', 1.15);
    // aim line + muzzle flash
    if (g.muzzle > 0) {
      ctx.save();
      ctx.translate(g.px, g.py);
      ctx.rotate(g.aimAngle);
      ctx.fillStyle = '#fff7c0';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(30, -6); ctx.lineTo(26, 0); ctx.lineTo(30, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

function drawEnemies(ctx, g, time) {
  for (const e of g.enemies) {
    if (!inView(g, e.x, e.y, 60)) continue;
    // night visibility ring: dark uniforms vanish on dark ground at night,
    // so every enemy gets a faint gold ring after dark
    if (g.night) {
      ctx.strokeStyle = 'rgba(255,217,77,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 17, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawPerson(ctx, e.x, e.y, e.angle, e.kind === 'guard' ? '#3b3b6e' : '#c0392b', 1.1);
    // hp bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 14, e.y - 22, 28, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(e.x - 13, e.y - 21, 26 * (e.hp / 3), 3);
  }
  for (const c of g.cops) {
    if (!inView(g, c.x, c.y, 60)) continue;
    drawPerson(ctx, c.x, c.y, c.angle, '#1c4ed8', 1.1);
    ctx.fillStyle = '#0b2a6b';
    ctx.fillRect(c.x - 5, c.y - 8, 10, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x - 14, c.y - 22, 28, 5);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(c.x - 13, c.y - 21, 26 * (c.hp / 3), 3);
  }
}

function drawHelicopter(ctx, g, time) {
  const h = g.heli;
  if (!h) return;
  // ground shadow first (in world space, below the heli)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(h.shadowX, h.shadowY, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (!inView(g, h.x, h.y, 120)) return;
  ctx.save();
  ctx.translate(h.x, h.y);
  // rotor blur
  ctx.strokeStyle = 'rgba(200,200,210,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, -6, 52, 8, Math.sin(h.rotor) * 0.25, 0, Math.PI * 2);
  ctx.stroke();
  // body
  ctx.fillStyle = '#e8e8ec';
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1c4ed8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 13, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2b3a55';
  ctx.beginPath(); ctx.ellipse(20, -2, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  // tail + tail rotor
  ctx.fillStyle = '#d5d5da';
  ctx.fillRect(-58, -4, 28, 7);
  ctx.fillStyle = '#ff2d2d';
  ctx.fillRect(-62, -12, 5, 20);
  // searchlight cone at night
  if (g.night) {
    ctx.fillStyle = 'rgba(255,244,180,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(h.shadowX - h.x - 30, h.shadowY - h.y);
    ctx.lineTo(h.shadowX - h.x + 30, h.shadowY - h.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBullets(ctx, g, time) {
  for (const b of g.bullets) {
    ctx.save();
    ctx.strokeStyle = b.fromPlayer ? '#ffe066' : '#ff7a5c';
    ctx.lineWidth = 3;
    ctx.shadowColor = b.fromPlayer ? '#ffe066' : '#ff7a5c';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(b.px, b.py);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawNightLights(ctx, g, time) {
  // lamp pools + neon halos, drawn after the dark overlay so the night glows
  const vw = 1280 / g.zoom;
  const vh = 720 / g.zoom;
  const x0 = g.cam.x;
  const y0 = g.cam.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.world.props) {
    if (p.kind !== 'lamp') continue;
    const sx = (p.x - x0) * g.zoom;
    const sy = (p.y - y0) * g.zoom;
    if (sx < -80 || sx > 1360 || sy < -80 || sy > 800) continue;
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    grad.addColorStop(0, 'rgba(255,217,77,0.30)');
    grad.addColorStop(1, 'rgba(255,217,77,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, 90, 0, Math.PI * 2); ctx.fill();
  }
  // neon sign halos
  for (const s of g.world.signs) {
    const sx = (s.x - x0) * g.zoom;
    const sy = (s.y - y0) * g.zoom;
    if (sx < -120 || sx > 1400 || sy < -120 || sy > 840) continue;
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 110);
    grad.addColorStop(0, s.color + '55');
    grad.addColorStop(1, s.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, 110, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // muzzle flash light (screen space)
  if (g.muzzle > 0) {
    const sx = (g.px - x0) * g.zoom;
    const sy = (g.py - y0) * g.zoom;
    const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120);
    grad.addColorStop(0, 'rgba(255,240,170,0.5)');
    grad.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, 120, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- sunset poster (title screen) ------------------------------------------
const SKYLINE = [46, 78, 60, 96, 54, 84, 70, 110, 62, 88, 50, 76, 92, 58, 80, 66, 100, 56, 82, 72];
export function drawSunset(ctx, W, H, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b1a5e');
  sky.addColorStop(0.35, '#b23a8f');
  sky.addColorStop(0.62, '#ff7a3d');
  sky.addColorStop(0.8, '#ffb347');
  sky.addColorStop(1, '#ffd94d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // big low sun with glow
  const sx = W * 0.68;
  const sy = H * 0.62;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
  glow.addColorStop(0, 'rgba(255,220,120,0.9)');
  glow.addColorStop(0.4, 'rgba(255,160,60,0.45)');
  glow.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(sx, sy, 64, 0, Math.PI * 2); ctx.fill();
  // skyline silhouette with lit windows
  const baseY = H * 0.72;
  let x = 0;
  let i = 0;
  ctx.fillStyle = '#1d1236';
  while (x < W) {
    const bw = 52 + ((SKYLINE[i % SKYLINE.length] * 7) % 40);
    const bh = SKYLINE[i % SKYLINE.length] * 2.1;
    ctx.fillRect(x, baseY - bh, bw, bh + H - baseY);
    // lit windows
    ctx.fillStyle = 'rgba(255,217,77,0.85)';
    for (let wy = baseY - bh + 12; wy < baseY - 8; wy += 18) {
      for (let wx = x + 8; wx < x + bw - 8; wx += 16) {
        if (((wx * 7 + wy * 13 + i) % 5) < 2) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    ctx.fillStyle = '#1d1236';
    x += bw + 6;
    i++;
  }
  // sea glint at the bottom
  const sea = ctx.createLinearGradient(0, H * 0.86, 0, H);
  sea.addColorStop(0, '#7a2f7e');
  sea.addColorStop(1, '#2b1a5e');
  ctx.fillStyle = sea;
  ctx.fillRect(0, H * 0.86, W, H * 0.14);
  ctx.strokeStyle = 'rgba(255,220,120,0.5)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    const yy = H * 0.88 + k * 12;
    const off = Math.sin(time * 0.8 + k * 1.7) * 14;
    ctx.beginPath();
    ctx.moveTo(sx - 150 + off, yy);
    ctx.lineTo(sx + 150 + off, yy);
    ctx.stroke();
  }
  // palm silhouettes at the edges
  ctx.fillStyle = '#140b28';
  drawPalmSilhouette(ctx, 60, H * 0.98, 1.6);
  drawPalmSilhouette(ctx, W - 70, H * 0.98, 1.9);
}

function drawPalmSilhouette(ctx, x, y, s) {
  ctx.strokeStyle = '#140b28';
  ctx.lineWidth = 7 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 6 * s, y - 60 * s, x + 20 * s, y - 110 * s);
  ctx.stroke();
  ctx.lineWidth = 5 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 20 * s, y - 110 * s);
    ctx.quadraticCurveTo(
      x + 20 * s + Math.cos(a) * 50 * s, y - 110 * s + Math.sin(a) * 50 * s,
      x + 20 * s + Math.cos(a) * 85 * s, y - 110 * s + Math.sin(a) * 85 * s + 20 * s,
    );
    ctx.stroke();
  }
}

// ---- minimap -----------------------------------------------------------------
export function drawMinimap(canvas, g) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12241c';
  ctx.fillRect(0, 0, W, H);
  // water
  ctx.fillStyle = '#1a7f9e';
  ctx.fillRect(WATER_X0 * sx, 0, (WORLD_W - WATER_X0) * sx, H);
  ctx.fillStyle = '#f2d8a0';
  ctx.fillRect(BEACH_X0 * sx, 0, (WATER_X0 - BEACH_X0) * sx, H);
  // districts (faint)
  for (const d of g.world.districts) {
    ctx.fillStyle = d.accent + '22';
    ctx.fillRect(d.x0 * sx, d.y0 * sy, (d.x1 - d.x0) * sx, (d.y1 - d.y0) * sy);
  }
  // roads
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(ax * sx, 0); ctx.lineTo(ax * sx, H); ctx.stroke();
  }
  for (const sy2 of STREETS) {
    ctx.beginPath(); ctx.moveTo(0, sy2 * sy); ctx.lineTo(W, sy2 * sy); ctx.stroke();
  }
  // shells nearby
  for (const s of g.world.shells) {
    if (s.collected) continue;
    if (Math.hypot(s.x - g.px, s.y - g.py) > 500) continue;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(s.x * sx, s.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // race checkpoints
  if (g.race && g.race.active) {
    ctx.strokeStyle = '#ff9d00';
    for (const c of g.race.checkpoints) {
      ctx.beginPath(); ctx.arc(c.x * sx, c.y * sy, 4, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // police
  ctx.fillStyle = '#3b82f6';
  for (const c of g.patrolCars) {
    ctx.beginPath(); ctx.arc(c.x * sx, c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const c of g.cops) {
    ctx.beginPath(); ctx.arc(c.x * sx, c.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // mission marker
  if (g.marker) {
    ctx.fillStyle = '#ff3b30';
    ctx.save();
    ctx.translate(g.marker.x * sx, g.marker.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  // player
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath(); ctx.arc(g.px * sx, g.py * sy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(g.px * sx, g.py * sy, 4, 0, Math.PI * 2); ctx.stroke();
}
