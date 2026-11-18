// render.js — draws the world of SOLARA BAY: ground, beach and water, the
// road grid, buildings, markers, pickups, cars, people, police, bullets and
// particles. All art is drawn in code; there are no image assets.

import { WORLD, ROADS_V, ROADS_H, ROAD_HALF, BEACH_Y, WATER_Y, PALETTE, TUNING } from './config.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, G) {
  const cam = G.camera;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const x0 = cam.x;
  const y0 = cam.y;
  const x1 = cam.x + vw;
  const y1 = cam.y + vh;

  // Ground.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, vw, vh);

  // Beach and water along the south edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(-x0, BEACH_Y - y0, WORLD.w, WATER_Y - BEACH_Y);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(-x0, WATER_Y - y0, WORLD.w, WORLD.h - WATER_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const wy = WATER_Y + 18 + i * 22 + Math.sin(G.time * 1.4 + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(-x0, wy - y0);
    ctx.lineTo(-x0 + WORLD.w, wy - y0);
    ctx.stroke();
  }

  // Blocks (sidewalk borders + inner ground).
  for (let vi = 0; vi < ROADS_V.length - 1; vi++) {
    for (let hi = 0; hi < ROADS_H.length - 1; hi++) {
      const bx0 = ROADS_V[vi] + ROAD_HALF;
      const bx1 = ROADS_V[vi + 1] - ROAD_HALF;
      const by0 = ROADS_H[hi] + ROAD_HALF;
      const by1 = ROADS_H[hi + 1] - ROAD_HALF;
      if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(bx0 - x0, by0 - y0, bx1 - bx0, by1 - by0);
      ctx.fillStyle = PALETTE.block;
      ctx.fillRect(bx0 + 6 - x0, by0 + 6 - y0, bx1 - bx0 - 12, by1 - by0 - 12);
    }
  }

  // Parks and the turf lot.
  for (const park of G.city.parks) {
    if (park.x + park.w < x0 || park.x > x1 || park.y + park.h < y0 || park.y > y1) continue;
    ctx.fillStyle = park.kind === 'lot' ? '#a8a08a' : PALETTE.park;
    ctx.fillRect(park.x - x0, park.y - y0, park.w, park.h);
    if (park.kind === 'park') {
      ctx.fillStyle = '#3f7d33';
      const n = Math.floor(park.w / 46);
      for (let i = 0; i < n; i++) {
        const tx = park.x + 22 + i * 46;
        const ty = park.y + park.h / 2 + ((i % 2) ? 18 : -18);
        ctx.beginPath();
        ctx.arc(tx - x0, ty - y0, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Turf lot: faded court lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(park.x + 10 - x0, park.y + 10 - y0, park.w - 20, park.h - 20);
      ctx.beginPath();
      ctx.moveTo(park.x + park.w / 2 - x0, park.y + 10 - y0);
      ctx.lineTo(park.x + park.w / 2 - x0, park.y + park.h - 10 - y0);
      ctx.stroke();
    }
  }

  // Roads.
  ctx.fillStyle = PALETTE.road;
  for (const rx of ROADS_V) {
    if (rx + ROAD_HALF < x0 || rx - ROAD_HALF > x1) continue;
    ctx.fillRect(rx - ROAD_HALF - x0, -y0, ROAD_HALF * 2, 1670);
  }
  for (const ry of ROADS_H) {
    if (ry + ROAD_HALF < y0 || ry - ROAD_HALF > y1) continue;
    ctx.fillRect(-x0, ry - ROAD_HALF - y0, WORLD.w, ROAD_HALF * 2);
  }
  // Center dashes.
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 18]);
  for (const rx of ROADS_V) {
    if (rx + ROAD_HALF < x0 || rx - ROAD_HALF > x1) continue;
    ctx.beginPath();
    ctx.moveTo(rx - x0, -y0);
    ctx.lineTo(rx - x0, 1670 - y0);
    ctx.stroke();
  }
  for (const ry of ROADS_H) {
    if (ry + ROAD_HALF < y0 || ry - ROAD_HALF > y1) continue;
    ctx.beginPath();
    ctx.moveTo(-x0, ry - y0);
    ctx.lineTo(WORLD.w - x0, ry - y0);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  drawMarker(ctx, G);

  // Buildings.
  for (const b of G.city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    const bx = b.x - x0;
    const by = b.y - y0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bx + 5, by + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, by, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(bx, by, b.w, 10);
    // Windows.
    ctx.fillStyle = 'rgba(20,30,44,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + (b.tall ? 1 : 0)) % 4 === 0) continue;
        ctx.fillRect(bx + 8 + i * 26, by + 16 + j * 26, 12, 12);
      }
    }
    if (b.label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, bx + b.w / 2, by + b.h / 2 + 5);
    }
  }

  drawPickups(ctx, G);
  for (const car of G.cars) drawCar(ctx, car, x0, y0, false);
  for (const ped of G.peds) drawPedestrian(ctx, ped, x0, y0);
  for (const e of G.combat.enemies) {
    if (e.alive) drawEnemy(ctx, e, x0, y0);
  }
  for (const cop of G.police) {
    if (cop.kind === 'car') drawPoliceCar(ctx, cop, x0, y0, G.time);
    else drawFootCop(ctx, cop, x0, y0, G.time);
  }
  drawPlayer(ctx, G);
  drawBullets(ctx, G);
  drawParticles(ctx, G);
}

function drawMarker(ctx, G) {
  if (G.mission.done) return;
  const t = { x: G.mission.marker.x, y: G.mission.marker.y };
  // During the steal phase the marker follows the nearest car.
  if (G.mission.index === 0 && G.mission.phase === 'steal' && !G.player.inCar) {
    let best = null;
    let bestD = Infinity;
    for (const car of G.cars) {
      const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) { t.x = best.x; t.y = best.y; }
  }
  const pulse = 26 + Math.sin(G.time * 4) * 6;
  const sx = t.x - G.camera.x;
  const sy = t.y - G.camera.y;
  ctx.save();
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 211, 77, 0.25)';
  ctx.beginPath();
  ctx.arc(sx, sy, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(sx, sy - pulse - 14);
  ctx.lineTo(sx - 8, sy - pulse - 2);
  ctx.lineTo(sx + 8, sy - pulse - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPickups(ctx, G) {
  for (const pk of G.combat.pickups) {
    if (pk.taken) continue;
    const sx = pk.x - G.camera.x;
    const sy = pk.y - G.camera.y;
    const bob = Math.sin(G.time * 3 + pk.x) * 3;
    ctx.save();
    ctx.fillStyle = pk.kind === 'ammo' ? '#ffd34d' : '#4dd07a';
    ctx.beginPath();
    ctx.arc(sx, sy + bob, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#10202e';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pk.kind === 'ammo' ? 'A' : '+', sx, sy + bob + 0.5);
    ctx.restore();
  }
}

function drawCarBody(ctx, x, y, angle, color, isPolice) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -19, -10, 40, 24, 6);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -21, -12, 42, 24, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.75)';
  ctx.fillRect(2, -9, 10, 18);
  ctx.fillStyle = 'rgba(20,30,44,0.5)';
  ctx.fillRect(-14, -9, 8, 18);
  // Wheels.
  ctx.fillStyle = '#14181d';
  ctx.fillRect(-15, -14, 9, 4);
  ctx.fillRect(-15, 10, 9, 4);
  ctx.fillRect(7, -14, 9, 4);
  ctx.fillRect(7, 10, 9, 4);
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(19, -9, 3, 5);
  ctx.fillRect(19, 4, 3, 5);
  if (isPolice) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -10, 14, 20);
  }
  ctx.restore();
}

function drawCar(ctx, car, x0, y0, _isPolice) {
  const color = car === undefined ? '#888888' : car.color;
  drawCarBody(ctx, car.x - x0, car.y - y0, car.angle, color, false);
}

function drawPoliceCar(ctx, cop, x0, y0, time) {
  drawCarBody(ctx, cop.x - x0, cop.y - y0, cop.angle, PALETTE.policeCar, true);
  const on = Math.floor(time * 6 + cop.flash * 10) % 2 === 0;
  ctx.save();
  ctx.translate(cop.x - x0, cop.y - y0);
  ctx.rotate(cop.angle);
  ctx.fillStyle = on ? PALETTE.policeLightA : PALETTE.policeLightB;
  ctx.beginPath();
  ctx.arc(-2, -6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = on ? PALETTE.policeLightB : PALETTE.policeLightA;
  ctx.beginPath();
  ctx.arc(-2, 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPedestrian(ctx, ped, x0, y0) {
  ctx.save();
  ctx.translate(ped.x - x0, ped.y - y0);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, e, x0, y0) {
  ctx.save();
  ctx.translate(e.x - x0, e.y - y0);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.gang;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7d1010';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Gun barrel toward the player.
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(e.angle) * 15, Math.sin(e.angle) * 15);
  ctx.stroke();
  // HP pips above.
  for (let i = 0; i < TUNING.enemyHp; i++) {
    ctx.fillStyle = i < e.hp ? '#ff5a4d' : 'rgba(255,255,255,0.3)';
    ctx.fillRect(-12 + i * 9, -22, 7, 5);
  }
  ctx.restore();
}

function drawFootCop(ctx, cop, x0, y0, time) {
  const bob = Math.sin(time * 10 + cop.flash * 20) * 1.5;
  ctx.save();
  ctx.translate(cop.x - x0, cop.y - y0 + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f6fff';
  ctx.beginPath();
  ctx.arc(0, -3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PD', 0, 3);
  ctx.restore();
}

function drawPlayer(ctx, G) {
  const p = G.player;
  const sx = p.x - G.camera.x;
  const sy = p.y - G.camera.y;
  if (p.inCar && p.car) {
    drawCarBody(ctx, p.car.x - G.camera.x, p.car.y - G.camera.y, p.car.angle, PALETTE.playerCar, false);
    return;
  }
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0d5c33';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Facing tick + gun line toward the mouse.
  const mx = G.input.mouseX;
  const my = G.input.mouseY;
  const ang = Math.atan2(my - sy, mx - sx);
  ctx.strokeStyle = '#10202e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Math.cos(ang) * 8, Math.sin(ang) * 8);
  ctx.lineTo(Math.cos(ang) * 18, Math.sin(ang) * 18);
  ctx.stroke();
  ctx.restore();
}

function drawBullets(ctx, G) {
  ctx.save();
  for (const b of G.combat.bullets) {
    const sx = b.x - G.camera.x;
    const sy = b.y - G.camera.y;
    ctx.strokeStyle = b.from === 'player' ? '#ffe066' : '#ff8a7a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - b.vx * 0.014, sy - b.vy * 0.014);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, G) {
  ctx.save();
  for (const pt of G.particles) {
    const a = Math.max(0, pt.life / 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x - G.camera.x, pt.y - G.camera.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
