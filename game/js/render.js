// Rendering for SOLARA BAY: the city, every entity, the HUD and the
// minimap. The camera follows the player with a smooth lerp (the game
// controller owns the camera position); the world is drawn translated by
// the camera so the player always stays on screen.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;

  function draw(ctx, G, VW, VH) {
    const city = G.city;
    const cam = G.cam;
    const shx = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shy = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(-Math.round(cam.x + shx), -Math.round(cam.y + shy));
    drawGround(ctx, G);
    drawRoads(ctx, G);
    drawPark(ctx, G);
    drawBuildings(ctx, G);
    drawBeach(ctx, G);
    drawStashes(ctx, G);
    drawPickups(ctx, G);
    drawSkids(ctx, G);
    drawCars(ctx, G);
    drawPeds(ctx, G);
    drawEnemies(ctx, G);
    drawPolice(ctx, G);
    drawPlayer(ctx, G);
    drawBullets(ctx, G);
    drawParticles(ctx, G);
    drawMarker(ctx, G);
    ctx.restore();
    drawSunGlare(ctx, VW, VH);
    drawHud(ctx, G, VW, VH);
    drawMinimap(ctx, G, VW, VH);
    if (G.toast && G.toastT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const w = ctx.measureText(G.toast).width + 28;
      ctx.fillRect((VW - w) / 2, VH - 64, w, 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(G.toast, VW / 2, VH - 42);
      ctx.textAlign = 'left';
    }
  }

  function drawGround(ctx, G) {
    const C = SB.City;
    // Grass base for the whole city.
    ctx.fillStyle = '#8fc97e';
    ctx.fillRect(0, 0, C.WORLD_W, C.WORLD_H);
    // Water along the south and east edges, with a shimmer.
    ctx.fillStyle = '#3aa7d9';
    ctx.fillRect(0, 1760, C.WORLD_W, 160);
    ctx.fillRect(2400, 0, 160, C.WORLD_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = 1780 + i * 10;
      const off = Math.sin(G.time * 1.4 + i * 1.7) * 14;
      ctx.beginPath();
      ctx.moveTo(60 + off, y);
      ctx.lineTo(420 + off, y);
      ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const x = 2430 + i * 12;
      const off = Math.sin(G.time * 1.2 + i * 2.1) * 10;
      ctx.beginPath();
      ctx.moveTo(x, 80 + off);
      ctx.lineTo(x, 300 + off);
      ctx.stroke();
    }
    // Sand strip between the city and the water.
    ctx.fillStyle = '#f2ddab';
    ctx.fillRect(0, 1680, C.WORLD_W, 80);
    ctx.fillRect(2320, 0, 80, C.WORLD_H);
    // Boats on the water.
    for (const b of G.city.boats) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e25563';
      ctx.fillRect(-4, -16, 8, 16);
      ctx.restore();
    }
  }

  function drawRoads(ctx, G) {
    const C = SB.City;
    ctx.fillStyle = '#3d3d4a';
    for (const ax of C.AVENUES) ctx.fillRect(ax - C.ROAD_HALF, 0, C.ROAD_HALF * 2, C.WORLD_H);
    for (const sy of C.STREETS) ctx.fillRect(0, sy - C.ROAD_HALF, C.WORLD_W, C.ROAD_HALF * 2);
    // Sidewalk edges.
    ctx.fillStyle = '#c9c9c9';
    for (const ax of C.AVENUES) {
      ctx.fillRect(ax - C.ROAD_HALF - 8, 0, 8, C.WORLD_H);
      ctx.fillRect(ax + C.ROAD_HALF, 0, 8, C.WORLD_H);
    }
    for (const sy of C.STREETS) {
      ctx.fillRect(0, sy - C.ROAD_HALF - 8, C.WORLD_W, 8);
      ctx.fillRect(0, sy + C.ROAD_HALF, C.WORLD_W, 8);
    }
    // Lane dashes down the middle of every road.
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (const ax of C.AVENUES) {
      ctx.beginPath();
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, C.WORLD_H);
      ctx.stroke();
    }
    for (const sy of C.STREETS) {
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(C.WORLD_W, sy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawPark(ctx, G) {
    // The park block: lawn, a pond and benches.
    ctx.fillStyle = '#6fbf5e';
    ctx.fillRect(1008, 1008, 224, 224);
    ctx.fillStyle = '#5aa7d9';
    ctx.beginPath();
    ctx.ellipse(1120, 1120, 46, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(1040, 1040, 26, 8);
    ctx.fillRect(1170, 1180, 26, 8);
    for (const t of G.city.trees) {
      ctx.fillStyle = '#3e8e3a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(t.x - 2, t.y + t.r - 3, 4, 7);
    }
  }

  function drawBuildings(ctx, G) {
    for (const b of G.city.buildings) {
      // Shadow offset grows with the height tier.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.tier * 4, b.y + b.tier * 4, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Rooftop details: AC units and skylights.
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      if (b.roof === 0) {
        ctx.fillRect(b.x + 10, b.y + 10, 18, 12);
        ctx.fillRect(b.x + b.w - 30, b.y + b.h - 24, 20, 14);
      } else if (b.roof === 1) {
        ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 10, 28, 20);
      } else {
        ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, 8);
        ctx.fillRect(b.x + 12, b.y + b.h - 20, b.w - 24, 8);
      }
      if (b.kind === 'bank') {
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BANK', b.x + b.w / 2, b.y + b.h / 2 + 7);
        ctx.textAlign = 'left';
      } else if (b.kind === 'garage') {
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GARAGE', b.x + b.w / 2, b.y + b.h / 2 + 5);
        ctx.textAlign = 'left';
      } else if (b.kind === 'safehouse') {
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SAFEHOUSE', b.x + b.w / 2, b.y + b.h / 2 + 5);
        ctx.textAlign = 'left';
      }
    }
  }

  function drawBeach(ctx, G) {
    for (const u of G.city.umbrellas) {
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x, u.y - 16);
      ctx.stroke();
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.arc(u.x, u.y - 16, 14, Math.PI, 0);
      ctx.fill();
    }
    for (const p of G.city.palms) {
      ctx.strokeStyle = '#7a4a21';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3, p.y - 22);
      ctx.stroke();
      ctx.fillStyle = '#2e8b3a';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        ctx.beginPath();
        ctx.ellipse(p.x + 3 + Math.cos(a) * 12, p.y - 22 + Math.sin(a) * 8, 12, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStashes(ctx, G) {
    for (const s of G.stashes) {
      if (s.found) continue;
      const d = Math.hypot(s.x - G.player.x, s.y - G.player.y);
      if (d > 500) continue;
      const bob = Math.sin(G.time * 3 + s.id) * 3;
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(s.x, s.y + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', s.x, s.y + bob + 4);
      ctx.textAlign = 'left';
    }
  }

  function drawPickups(ctx, G) {
    for (const p of G.pickups) {
      const bob = Math.sin(G.time * 4 + p.x) * 2;
      if (p.kind === 'ammo') {
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(p.x - 8, p.y - 6 + bob, 16, 12);
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', p.x, p.y + 3 + bob);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - 8, p.y - 8 + bob, 16, 16);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(p.x - 2, p.y - 6 + bob, 4, 12);
        ctx.fillRect(p.x - 6, p.y - 2 + bob, 12, 4);
      }
      ctx.textAlign = 'left';
    }
  }

  function drawSkids(ctx, G) {
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 4;
    for (const s of G.skids) {
      ctx.globalAlpha = Math.min(1, s.t / 2);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.a) * 16, s.y - Math.sin(s.a) * 16);
      ctx.lineTo(s.x + Math.cos(s.a) * 16, s.y + Math.sin(s.a) * 16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCarShape(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 3, car.len, car.wid);
    ctx.fillStyle = car.color;
    ctx.fillRect(-car.len / 2, -car.wid / 2, car.len, car.wid);
    ctx.fillStyle = '#222';
    ctx.fillRect(-car.len / 2 + 8, -car.wid / 2 + 3, 12, 5);
    ctx.fillRect(-car.len / 2 + 8, car.wid / 2 - 8, 12, 5);
    ctx.fillRect(car.len / 2 - 20, -car.wid / 2 + 3, 12, 5);
    ctx.fillRect(car.len / 2 - 20, car.wid / 2 - 8, 12, 5);
    ctx.fillStyle = '#bcd8e8';
    ctx.fillRect(-4, -car.wid / 2 + 4, 14, car.wid - 8);
    if (car.boss) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-car.len / 2 - 2, -car.wid / 2 - 2, car.len + 4, car.wid + 4);
    }
    ctx.restore();
  }

  function drawCars(ctx, G) {
    for (const c of G.cars) {
      if (c === G.car) continue;
      if (c.type === 'bike') {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);
        ctx.fillStyle = c.color;
        ctx.fillRect(-19, -4, 38, 8);
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(-14, 0, 5, 0, Math.PI * 2);
        ctx.arc(14, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        drawCarShape(ctx, c);
      }
    }
    if (G.car) {
      drawCarShape(ctx, G.car);
      // Headlight cone ahead of the player's car.
      ctx.save();
      ctx.translate(G.car.x, G.car.y);
      ctx.rotate(G.car.angle);
      const grad = ctx.createLinearGradient(0, 0, 190, 0);
      grad.addColorStop(0, 'rgba(255,240,180,0.25)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(20, -8);
      ctx.lineTo(190, -46);
      ctx.lineTo(190, 46);
      ctx.lineTo(20, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPeds(ctx, G) {
    for (const p of G.peds) {
      if (p.down) {
        ctx.fillStyle = p.shirt;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 11, 6, p.angle, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.shirt;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemies(ctx, G) {
    for (const e of G.enemies) {
      ctx.fillStyle = '#7b1e1e';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 9, 0, Math.PI * 2);
      ctx.fill();
      // Health pips.
      ctx.fillStyle = '#e74c3c';
      for (let i = 0; i < e.hp; i++) ctx.fillRect(e.x - 12 + i * 9, e.y - 22, 7, 4);
    }
  }

  function drawPolice(ctx, G) {
    for (const c of G.footCops) {
      ctx.fillStyle = '#1a2a6c';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('P', c.x, c.y + 3);
      ctx.textAlign = 'left';
    }
    for (const pc of G.patrols) {
      drawCarShape(ctx, pc);
      const flash = Math.floor(G.time * 4) % 2 === 0 ? '#ff3b30' : '#3b82ff';
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(ctx, G) {
    if (G.car) return;
    const p = G.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#f4d03f';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(8, -3, 14, 6);
    ctx.restore();
    // White ring so the player reads at a glance.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBullets(ctx, G) {
    ctx.fillStyle = '#ffd94d';
    for (const b of G.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(ctx, G) {
    for (const p of G.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMarker(ctx, G) {
    if (G.storyComplete) return;
    const m = G.marker;
    const pulse = 1 + Math.sin(G.time * 4) * 0.12;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(-10, -26);
    ctx.lineTo(10, -26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // A thin guide line from the player toward the marker.
    ctx.strokeStyle = 'rgba(242,193,78,0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(G.player.x, G.player.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSunGlare(ctx, VW, VH) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 560);
    g.addColorStop(0, 'rgba(255,244,200,0.14)');
    g.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  function drawHud(ctx, G, VW, VH) {
    ctx.textAlign = 'left';
    // Top-left panel: money, health, ammo.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 250, 86);
    ctx.fillStyle = '#f2c14e';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('$' + G.money, 24, 42);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText('HP', 24, 66);
    ctx.fillStyle = '#333';
    ctx.fillRect(52, 54, 120, 12);
    ctx.fillStyle = G.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(52, 54, 120 * Math.max(0, G.hp / 100), 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('Ammo ' + G.ammo, 24, 88);
    ctx.fillText('Stash ' + G.stashesFound + '/3', 150, 88);
    // Wanted stars, top center, pulsing at 3 stars.
    const pulse = G.wanted === 3 ? 1 + Math.sin(G.time * 6) * 0.15 : 1;
    ctx.save();
    ctx.translate(VW / 2, 34);
    ctx.scale(pulse, pulse);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    let stars = '';
    for (let i = 0; i < 3; i++) stars += i < G.wanted ? '★' : '☆';
    ctx.fillStyle = G.wanted > 0 ? '#ffd94d' : 'rgba(255,255,255,0.6)';
    ctx.fillText(stars, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    // Mission card, bottom left.
    if (!G.storyComplete && G.missionIndex < SB.Missions.DEFS.length) {
      const def = SB.Missions.DEFS[G.missionIndex];
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(12, VH - 92, 420, 80);
      ctx.fillStyle = '#f2c14e';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('M' + (G.missionIndex + 1) + ' — ' + def.title + '   +$' + def.reward, 24, VH - 66);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.fillText(def.objective, 24, VH - 42);
      ctx.fillStyle = '#9fd6ff';
      ctx.fillText('Mission ' + (G.missionIndex + 1) + '/6', 24, VH - 22);
    }
  }

  function drawMinimap(ctx, G, VW, VH) {
    const MW = 200, MH = 150;
    const ox = VW - MW - 12, oy = 12;
    const sx = MW / SB.City.WORLD_W, sy = MH / SB.City.WORLD_H;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox - 4, oy - 4, MW + 8, MH + 8);
    ctx.fillStyle = '#3aa7d9';
    ctx.fillRect(ox, oy + 1760 * sy, MW, MH - 1760 * sy);
    ctx.fillRect(ox + 2400 * sx, oy, MW - 2400 * sx, MH);
    ctx.fillStyle = '#8fc97e';
    ctx.fillRect(ox, oy, MW, MH);
    ctx.strokeStyle = '#3d3d4a';
    ctx.lineWidth = 2;
    for (const ax of SB.City.AVENUES) {
      ctx.beginPath();
      ctx.moveTo(ox + ax * sx, oy);
      ctx.lineTo(ox + ax * sx, oy + MH);
      ctx.stroke();
    }
    for (const sy2 of SB.City.STREETS) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + sy2 * sy);
      ctx.lineTo(ox + MW, oy + sy2 * sy);
      ctx.stroke();
    }
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.arc(ox + G.marker.x * sx, oy + G.marker.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    for (const s of G.stashes) {
      if (s.found) continue;
      if (Math.hypot(s.x - G.player.x, s.y - G.player.y) > 500) continue;
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(ox + s.x * sx - 2, oy + s.y * sy - 2, 4, 4);
    }
    for (const pc of G.patrols) {
      ctx.fillStyle = '#3b82ff';
      ctx.beginPath();
      ctx.arc(ox + pc.x * sx, oy + pc.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ox + G.player.x * sx, oy + G.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  SB.Render = { draw: draw };
})();
