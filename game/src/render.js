// Drawing for SOLARA BAY: the city, the people and cars on it, the mission
// marker, and the minimap. All art is drawn with code; no image is loaded.
import { WORLD_W, WORLD_H, AVENUES, STREETS, ROAD_W, POINTS, PLACES } from './world.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, x, y, angle, color, police) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -17, -9, 36, 22, 6);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -19, -11, 36, 22, 6);
  ctx.fill();
  ctx.fillStyle = police ? '#f5f5f5' : '#222831';
  roundRect(ctx, -4, -9, 12, 18, 3);
  ctx.fill();
  ctx.fillStyle = '#9fd8ff';
  roundRect(ctx, 6, -8, 6, 16, 2);
  ctx.fill();
  if (police) {
    const t = Date.now() / 280;
    ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#ff3b30' : '#0a84ff';
    roundRect(ctx, -8, -11, 7, 5, 2);
    ctx.fill();
    ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#0a84ff' : '#ff3b30';
    roundRect(ctx, -8, 6, 7, 5, 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGame(ctx, S) {
  const cam = S.cam;
  const W = 1280;
  const H = 720;
  ctx.fillStyle = '#7fb069';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-cam.x + (S.shake > 0 ? (Math.random() - 0.5) * S.shake * 22 : 0), -cam.y + (S.shake > 0 ? (Math.random() - 0.5) * S.shake * 22 : 0));

  // Parks.
  for (const pk of S.world.parks) {
    ctx.fillStyle = '#6aa84f';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
  }
  // Beach sand and water along the east edge.
  ctx.fillStyle = '#e8d28a';
  ctx.fillRect(2288, 0, 192, WORLD_H);
  ctx.fillStyle = '#3d8fd1';
  ctx.fillRect(2480, 0, WORLD_W - 2480, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let y = 60; y < WORLD_H; y += 130) {
    ctx.beginPath();
    ctx.moveTo(2486, y);
    ctx.quadraticCurveTo(2510, y + 14, 2486, y + 28);
    ctx.stroke();
  }
  // Roads.
  ctx.fillStyle = '#3d4450';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.strokeStyle = '#e8e8e8';
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
  // Buildings.
  for (const b of S.world.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(b.x, b.y, b.w, Math.min(14, b.h * 0.18));
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // Garage and safehouse get their own roofs and signs, drawn beside the road.
  ctx.fillStyle = '#2f6fb2';
  ctx.fillRect(PLACES.garage.x - 70, PLACES.garage.y - 46, 140, 92);
  ctx.fillStyle = '#f5f5f5';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GARAGE', PLACES.garage.x, PLACES.garage.y - 56);
  ctx.fillStyle = '#3f7d4e';
  ctx.fillRect(PLACES.safehouse.x - 70, PLACES.safehouse.y - 46, 140, 92);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillText('SAFEHOUSE', PLACES.safehouse.x, PLACES.safehouse.y - 56);
  ctx.fillStyle = '#5b4a8a';
  ctx.fillRect(PLACES.police.x - 70, PLACES.police.y - 46, 140, 92);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillText('POLICE', PLACES.police.x, PLACES.police.y - 56);
  // Trees.
  for (const t of S.world.trees) {
    ctx.fillStyle = '#2f7d32';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pickups.
  for (const pk of S.pickups) {
    if (!pk.active) continue;
    const bob = Math.sin(S.time * 3 + pk.x) * 2;
    ctx.fillStyle = pk.kind === 'ammo' ? '#ffd54a' : '#ffffff';
    ctx.strokeStyle = '#222831';
    ctx.lineWidth = 2;
    roundRect(ctx, pk.x - 11, pk.y - 11 + bob, 22, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pk.kind === 'ammo' ? '#222831' : '#e53935';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'ammo' ? 'A' : '+', pk.x, pk.y + 5 + bob);
  }
  // Mission marker: a pulsing ring and diamond.
  const marker = S.marker;
  if (marker) {
    const pulse = 1 + Math.sin(S.time * 4) * 0.12;
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd54a';
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
  }
  // Traffic cars.
  for (const c of S.traffic) {
    if (c.driver === 'player') continue;
    drawCarShape(ctx, c.x, c.y, c.angle, c.color, false);
  }
  // Patrol cars.
  for (const car of S.patrol) drawCarShape(ctx, car.x, car.y, car.angle, '#222831', true);
  // Pedestrians.
  for (const p of S.peds) {
    if (p.down > 0) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 10, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d7b0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Foot cops.
  for (const cop of S.cops) {
    ctx.fillStyle = '#1d3557';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Gang members.
  for (const e of S.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(e.x - 12, e.y - 20, 24, 4);
    ctx.fillStyle = '#7ee787';
    ctx.fillRect(e.x - 12, e.y - 20, 24 * (e.hp / 3), 4);
  }
  // Gunfire tracers.
  for (const t of S.tracers) {
    ctx.strokeStyle = `rgba(255,220,80,${Math.max(0, t.t / 0.14)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  // Player car, then the player on foot.
  const pl = S.player;
  if (pl.inCar) {
    drawCarShape(ctx, pl.inCar.x, pl.inCar.y, pl.inCar.angle, pl.inCar.color, false);
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(pl.inCar.x, pl.inCar.y, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d7b0';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pl.x, pl.y);
    ctx.lineTo(pl.x + Math.cos(pl.aimAngle) * 20, pl.y + Math.sin(pl.aimAngle) * 20);
    ctx.stroke();
  }
  ctx.restore();
  // Vignette label of the district, for the screenshots.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLARA BAY', 14, 706);
}

export function drawMinimap(mctx, S) {
  const MW = 200;
  const MH = 150;
  const sx = MW / WORLD_W;
  const sy = MH / WORLD_H;
  mctx.clearRect(0, 0, MW, MH);
  mctx.fillStyle = '#20242c';
  mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = '#7fb069';
  mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = '#3d8fd1';
  mctx.fillRect(2480 * sx, 0, (WORLD_W - 2480) * sx, MH);
  mctx.fillStyle = '#e8d28a';
  mctx.fillRect(2288 * sx, 0, (2480 - 2288) * sx, MH);
  mctx.fillStyle = '#3d4450';
  for (const ax of AVENUES) mctx.fillRect(ax * sx - 2, 0, 4, MH);
  for (const sy2 of STREETS) mctx.fillRect(0, sy2 * sy - 2, MW, 4);
  mctx.fillStyle = '#c96f4a';
  for (const b of S.world.buildings) mctx.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  mctx.fillStyle = '#3f7d4e';
  mctx.fillRect(POINTS.safehouse.x * sx - 3, POINTS.safehouse.y * sy - 3, 6, 6);
  mctx.fillStyle = '#2f6fb2';
  mctx.fillRect(POINTS.garage.x * sx - 3, POINTS.garage.y * sy - 3, 6, 6);
  if (S.marker) {
    mctx.fillStyle = '#ffd54a';
    mctx.beginPath();
    mctx.arc(S.marker.x * sx, S.marker.y * sy, 5, 0, Math.PI * 2);
    mctx.fill();
  }
  for (const car of S.patrol) {
    mctx.fillStyle = '#ff3b30';
    mctx.beginPath();
    mctx.arc(car.x * sx, car.y * sy, 3, 0, Math.PI * 2);
    mctx.fill();
  }
  for (const cop of S.cops) {
    mctx.fillStyle = '#0a84ff';
    mctx.beginPath();
    mctx.arc(cop.x * sx, cop.y * sy, 3, 0, Math.PI * 2);
    mctx.fill();
  }
  const pl = S.player;
  mctx.fillStyle = '#2ecc71';
  mctx.beginPath();
  mctx.arc(pl.x * sx, pl.y * sy, 4, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = '#ffffff';
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.arc(pl.x * sx, pl.y * sy, 5.5, 0, Math.PI * 2);
  mctx.stroke();
}
