// hud.js — the SOLARA BAY HUD: money, health, ammo, wanted stars, the
// mission line, the minimap, the mission card, and the flash message.
// Everything is drawn on the canvas in screen space.

import { WORLD, MISSIONS, TUNING } from './config.js';
import { currentObjective, currentTarget } from './missions.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStars(ctx, x, y, wanted) {
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < wanted ? '#ffd34d' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x + i * 30, y);
  }
}

export function drawHud(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const p = G.player;

  // Top-left panel: money, health, ammo, wanted.
  ctx.save();
  roundRect(ctx, 12, 12, 250, 108, 10);
  ctx.fillStyle = 'rgba(8, 18, 28, 0.72)';
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7ddc8a';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`$${p.money}`, 26, 34);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '13px sans-serif';
  ctx.fillText('MONEY', 26, 54);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(26, 66, 120, 10);
  ctx.fillStyle = p.hp > 40 ? '#4dd07a' : '#e04f3d';
  ctx.fillRect(26, 66, 120 * Math.max(0, p.hp / TUNING.playerHp), 10);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(`HP ${Math.ceil(p.hp)}`, 152, 71);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`AMMO ${p.ammo}`, 26, 96);
  drawStars(ctx, 130, 96, G.wanted);
  ctx.restore();

  // Top-center mission line.
  const m = G.mission;
  const missionTitle = m.done ? 'Story Complete' : `Mission ${m.index + 1}/4 — ${MISSIONS[m.index].title}`;
  ctx.save();
  ctx.font = 'bold 17px sans-serif';
  const titleW = ctx.measureText(missionTitle).width;
  ctx.font = '14px sans-serif';
  const objW = ctx.measureText(currentObjective(G)).width;
  const boxW = Math.max(titleW, objW) + 32;
  const boxX = (W - boxW) / 2;
  roundRect(ctx, boxX, 12, boxW, 56, 10);
  ctx.fillStyle = 'rgba(8, 18, 28, 0.72)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(missionTitle, W / 2, 30);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '14px sans-serif';
  ctx.fillText(currentObjective(G), W / 2, 52);
  ctx.restore();

  drawMinimap(ctx, G);

  // Flash message (pickups, busted, mission complete).
  if (G.flashMessage && G.time < G.flashUntil) {
    ctx.save();
    ctx.font = 'bold 20px sans-serif';
    const w = ctx.measureText(G.flashMessage).width + 28;
    roundRect(ctx, (W - w) / 2, H - 92, w, 36, 8);
    ctx.fillStyle = 'rgba(8, 18, 28, 0.75)';
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(G.flashMessage, W / 2, H - 73);
    ctx.restore();
  }

  // Controls hint.
  ctx.save();
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('WASD move/drive · E enter car · Click shoot · P pause · M mute', W - 14, H - 14);
  ctx.restore();

  // Mission card (center) while it is up.
  if (G.time < G.mission.cardUntil && G.phase === 'playing') {
    const cardW = 520;
    const cardH = 132;
    const cx = (W - cardW) / 2;
    const cy = (H - cardH) / 2 - 40;
    ctx.save();
    roundRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fillStyle = 'rgba(8, 18, 28, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(G.mission.cardTitle, W / 2, cy + 36);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '15px sans-serif';
    wrapText(ctx, G.mission.cardText, W / 2, cy + 66, cardW - 40, 20);
    ctx.restore();
  }
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

function drawMinimap(ctx, G) {
  const W = ctx.canvas.width;
  const mw = 200;
  const mh = 146;
  const mx = W - mw - 12;
  const my = 12;
  const scale = Math.min(mw / WORLD.w, mh / WORLD.h);
  const ox = mx + (mw - WORLD.w * scale) / 2;
  const oy = my + (mh - WORLD.h * scale) / 2;

  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.fillStyle = 'rgba(8, 18, 28, 0.78)';
  ctx.fill();
  ctx.beginPath();
  ctx.rect(ox, oy, WORLD.w * scale, WORLD.h * scale);
  ctx.clip();

  // Ground and water.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(ox, oy, WORLD.w * scale, WORLD.h * scale);
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(ox, oy + 1780 * scale, WORLD.w * scale, (WORLD.h - 1780) * scale);

  // Roads.
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = Math.max(1, 44 * scale);
  for (const rx of G.roadsV) {
    ctx.beginPath();
    ctx.moveTo(ox + rx * scale, oy);
    ctx.lineTo(ox + rx * scale, oy + 1670 * scale);
    ctx.stroke();
  }
  for (const ry of G.roadsH) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + ry * scale);
    ctx.lineTo(ox + WORLD.w * scale, oy + ry * scale);
    ctx.stroke();
  }

  // Mission marker (pulsing).
  const t = currentTarget(G);
  const pulse = 3 + Math.sin(G.time * 5) * 1.5;
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(ox + t.x * scale, oy + t.y * scale, pulse + 2, 0, Math.PI * 2);
  ctx.fill();

  // Cars, police, player.
  ctx.fillStyle = '#f2f2f2';
  for (const car of G.cars) {
    ctx.fillRect(ox + car.x * scale - 1.5, oy + car.y * scale - 1.5, 3, 3);
  }
  for (const cop of G.police) {
    ctx.fillStyle = cop.kind === 'car' ? '#2f6fff' : '#ff5a5a';
    ctx.beginPath();
    ctx.arc(ox + cop.x * scale, oy + cop.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2fbf71';
  ctx.beginPath();
  ctx.arc(ox + G.player.x * scale, oy + G.player.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('SOLARA BAY', mx + 8, my + mh - 8);
  ctx.restore();
}
