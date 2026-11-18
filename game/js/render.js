// render.js — draws the whole game on one canvas: ground, roads, beach and
// water, buildings, trees, cars, people, the marker, particles, and the
// minimap. The DOM (index.html + style.css) owns the HUD bars and overlays;
// this file updates their text.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(ctx, c, isPlayer) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -21, -9, 46, 22, 6);
    ctx.fill();
    ctx.fillStyle = c.color;
    roundRect(ctx, -23, -11, 46, 22, 6);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // Windows and roof.
    ctx.fillStyle = 'rgba(20,30,44,0.85)';
    roundRect(ctx, -8, -8, 14, 16, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,30,44,0.6)';
    roundRect(ctx, 8, -8, 7, 16, 3);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#fff8c9';
    ctx.fillRect(20, -8, 3, 4);
    ctx.fillRect(20, 4, 3, 4);
    // Tail lights.
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-23, -8, 3, 4);
    ctx.fillRect(-23, 4, 3, 4);
    if (c.patrol) {
      // Flashing light bar.
      var red = Math.floor(c.flashT * 4) % 2 === 0;
      ctx.fillStyle = red ? '#ff2d2d' : '#2d7dff';
      ctx.fillRect(-4, -9, 8, 5);
      ctx.fillStyle = red ? '#2d7dff' : '#ff2d2d';
      ctx.fillRect(-4, 4, 8, 5);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-23, -11, 8, 22);
    }
    ctx.restore();
  }

  function drawPerson(ctx, x, y, color, angle, bob) {
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * 1.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 2, Math.sin(angle) * 2 - 1, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  SB.drawGame = function (ctx, G, vw, vh) {
    var city = G.city;
    var cam = G.cam;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Ground: grass, then the beach strip and the water.
    ctx.fillStyle = '#79b264';
    ctx.fillRect(cam.x - 20, cam.y - 20, vw + 40, vh + 40);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(SB.BEACH_X, cam.y - 20, SB.WATER_X - SB.BEACH_X, vh + 40);
    ctx.fillStyle = '#2f7fc4';
    ctx.fillRect(SB.WATER_X, cam.y - 20, SB.WORLD_W - SB.WATER_X + 40, vh + 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    for (var w = 0; w < 6; w++) {
      var wy = ((w * 340 + G.time * 26) % (SB.WORLD_H + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(SB.WATER_X + 6, wy);
      ctx.quadraticCurveTo(SB.WATER_X + 34, wy + 12, SB.WATER_X + 62, wy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 26px Trebuchet MS, sans-serif';
    ctx.fillText('BEACH', SB.BEACH_X + 8, cam.y + 60);
    ctx.fillStyle = 'rgba(20,40,60,0.5)';
    ctx.fillText('DOWNTOWN', 1180, 700);

    // Sidewalk blocks.
    ctx.fillStyle = '#b9bfc4';
    var xs = [0].concat(SB.AVENUES, [SB.WORLD_W]);
    var ys = [0].concat(SB.STREETS, [SB.WORLD_H]);
    for (var bi = 0; bi < xs.length - 1; bi++) {
      for (var bj = 0; bj < ys.length - 1; bj++) {
        var x0 = xs[bi], x1 = xs[bi + 1], y0 = ys[bj], y1 = ys[bj + 1];
        if (x0 >= SB.BEACH_X - 320) continue;
        ctx.fillRect(x0 + SB.ROAD_HALF, y0 + SB.ROAD_HALF,
          x1 - x0 - SB.ROAD_HALF * 2, y1 - y0 - SB.ROAD_HALF * 2);
      }
    }

    // Roads.
    ctx.fillStyle = '#3d4450';
    for (var i = 0; i < SB.AVENUES.length; i++) {
      ctx.fillRect(SB.AVENUES[i] - SB.ROAD_HALF, cam.y - 20, SB.ROAD_HALF * 2, vh + 40);
    }
    for (var j = 0; j < SB.STREETS.length; j++) {
      ctx.fillRect(cam.x - 20, SB.STREETS[j] - SB.ROAD_HALF, vw + 40, SB.ROAD_HALF * 2);
    }
    // Lane dashes.
    ctx.strokeStyle = 'rgba(255,220,90,0.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 22]);
    for (var a = 0; a < SB.AVENUES.length; a++) {
      ctx.beginPath();
      ctx.moveTo(SB.AVENUES[a], cam.y - 20);
      ctx.lineTo(SB.AVENUES[a], cam.y + vh + 20);
      ctx.stroke();
    }
    for (var s = 0; s < SB.STREETS.length; s++) {
      ctx.beginPath();
      ctx.moveTo(cam.x - 20, SB.STREETS[s]);
      ctx.lineTo(cam.x + vw + 20, SB.STREETS[s]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Trees.
    for (var t = 0; t < city.trees.length; t++) {
      var tr = city.trees[t];
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(tr.x + 4, tr.y + 5, tr.r, tr.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tr.palm ? '#3f9e4d' : '#2e8b57';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Buildings.
    for (var b = 0; b < city.buildings.length; b++) {
      var bd = city.buildings[b];
      if (bd.tall) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(bd.x + 10, bd.y + 12, bd.w, bd.h);
      }
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bd.x, bd.y, bd.w, bd.h);
      // Roof inset.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12);
      // Windows.
      ctx.fillStyle = 'rgba(30,45,60,0.55)';
      for (var wx = bd.x + 12; wx < bd.x + bd.w - 10; wx += 22) {
        for (var wy = bd.y + 12; wy < bd.y + bd.h - 10; wy += 20) {
          ctx.fillRect(wx, wy, 10, 8);
        }
      }
      if (bd.label) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 13px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bd.label, bd.x + bd.w / 2, bd.y + bd.h / 2 + 4);
        ctx.textAlign = 'left';
      }
    }

    // Mission marker: a pulsing ring, a bouncing diamond and a label.
    var marker = SB.missionMarker(G);
    if (marker && !G.storyComplete) {
      var pulse = 1 + Math.sin(G.time * 4) * 0.12;
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 30 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      var bounce = Math.sin(G.time * 4) * 5;
      ctx.save();
      ctx.translate(marker.x, marker.y - 42 + bounce);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
      ctx.font = 'bold 13px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(SB.missionMarkerLabel(G), marker.x, marker.y + 52);
      ctx.fillText(SB.missionMarkerLabel(G), marker.x, marker.y + 52);
      ctx.textAlign = 'left';
    }

    // Pickups.
    for (var p = 0; p < G.pickups.length; p++) {
      var pk = G.pickups[p];
      if (pk.gone) continue;
      var bob = Math.sin(G.time * 3 + p) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'ammo') {
        ctx.fillStyle = '#ff9f1c';
        roundRect(ctx, -11, -11, 22, 22, 4);
        ctx.fill();
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -7, 4, 12);
        ctx.fillRect(-5, -2, 10, 4);
      } else {
        ctx.fillStyle = '#f5f5f5';
        roundRect(ctx, -11, -11, 22, 22, 4);
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      }
      ctx.restore();
    }

    // Cars (parked, traffic, patrol, and the player's).
    for (var c = 0; c < G.cars.length; c++) {
      drawCar(ctx, G.cars[c], G.player.car === G.cars[c]);
    }

    // Pedestrians.
    for (var pd = 0; pd < G.peds.length; pd++) {
      var ped = G.peds[pd];
      if (ped.down) {
        ctx.save();
        ctx.translate(ped.x, ped.y);
        ctx.rotate(1.2);
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        drawPerson(ctx, ped.x, ped.y, ped.color,
          ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI),
          ped.walkPhase);
      }
    }

    // Foot police.
    for (var cp = 0; cp < G.cops.length; cp++) {
      var cop = G.cops[cp];
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = '#1e3a5f';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0e2238';
      ctx.beginPath();
      ctx.arc(0, -2, 6, Math.PI, 0);
      ctx.fill();
      ctx.restore();
    }

    // Gang members, with health pips.
    for (var e = 0; e < G.enemies.length; e++) {
      var en = G.enemies[e];
      drawPerson(ctx, en.x, en.y, '#c0392b', en.angle, G.time * 5);
      ctx.strokeStyle = '#7b1f16';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(en.x + Math.cos(en.angle) * 10, en.y + Math.sin(en.angle) * 10);
      ctx.lineTo(en.x + Math.cos(en.angle) * 22, en.y + Math.sin(en.angle) * 22);
      ctx.stroke();
      for (var hp = 0; hp < 3; hp++) {
        ctx.fillStyle = hp < en.hp ? '#ff5252' : 'rgba(0,0,0,0.4)';
        ctx.fillRect(en.x - 12 + hp * 9, en.y - 26, 7, 5);
      }
    }

    // The player on foot.
    if (!G.player.inCar) {
      var aim = Math.atan2(G.mouse.y + cam.y - G.player.y, G.mouse.x + cam.x - G.player.x);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(G.player.x, G.player.y);
      ctx.lineTo(G.player.x + Math.cos(aim) * 26, G.player.y + Math.sin(aim) * 26);
      ctx.stroke();
      drawPerson(ctx, G.player.x, G.player.y, '#00b4d8', G.player.angle, G.time * 6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(G.player.x, G.player.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bullets.
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 3;
    for (var bl = 0; bl < G.bullets.length; bl++) {
      var b = G.bullets[bl];
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff5252';
    for (var eb = 0; eb < G.ebullets.length; eb++) {
      var e2 = G.ebullets[eb];
      ctx.beginPath();
      ctx.arc(e2.x, e2.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles.
    for (var pt = 0; pt < G.parts.length; pt++) {
      var part = G.parts[pt];
      ctx.globalAlpha = SB.clamp(part.life / part.maxLife, 0, 1);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Off-screen marker arrow: point at the edge toward the target.
    if (marker && !G.storyComplete) {
      var mx = marker.x - cam.x, my = marker.y - cam.y;
      if (mx < 0 || mx > vw || my < 0 || my > vh) {
        var ax = SB.clamp(mx, 50, vw - 50);
        var ay = SB.clamp(my, 60, vh - 50);
        var aa = Math.atan2(my - ay, mx - ax);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(aa);
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(SB.missionMarkerLabel(G), ax, ay - 18);
        ctx.textAlign = 'left';
      }
    }

    SB.drawMinimap(ctx, G, vw, vh);
  };

  SB.drawMinimap = function (ctx, G, vw, vh) {
    var mw = 168, mh = 126;
    var mx = vw - mw - 12, my = 52;
    var sx = mw / SB.WORLD_W, sy = mh / SB.WORLD_H;
    ctx.fillStyle = 'rgba(6,20,32,0.82)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.fillStyle = '#2f7fc4';
    ctx.fillRect(mx + SB.WATER_X * sx, my, (SB.WORLD_W - SB.WATER_X) * sx, mh);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(mx + SB.BEACH_X * sx, my, (SB.WATER_X - SB.BEACH_X) * sx, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (var i = 0; i < SB.AVENUES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(mx + SB.AVENUES[i] * sx, my);
      ctx.lineTo(mx + SB.AVENUES[i] * sx, my + mh);
      ctx.stroke();
    }
    for (var j = 0; j < SB.STREETS.length; j++) {
      ctx.beginPath();
      ctx.moveTo(mx, my + SB.STREETS[j] * sy);
      ctx.lineTo(mx + mw, my + SB.STREETS[j] * sy);
      ctx.stroke();
    }
    var marker = SB.missionMarker(G);
    if (marker && !G.storyComplete) {
      ctx.fillStyle = '#ffd23e';
      var pr = 4 + Math.sin(G.time * 4) * 1.5;
      ctx.beginPath();
      ctx.arc(mx + marker.x * sx, my + marker.y * sy, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5252';
    for (var e = 0; e < G.enemies.length; e++) {
      ctx.fillRect(mx + G.enemies[e].x * sx - 2, my + G.enemies[e].y * sy - 2, 4, 4);
    }
    ctx.fillStyle = '#2d7dff';
    for (var c = 0; c < G.cops.length; c++) {
      ctx.fillRect(mx + G.cops[c].x * sx - 2, my + G.cops[c].y * sy - 2, 4, 4);
    }
    for (var p = 0; p < G.patrols.length; p++) {
      ctx.fillRect(mx + G.patrols[p].x * sx - 2, my + G.patrols[p].y * sy - 2, 4, 4);
    }
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath();
    ctx.arc(mx + G.player.x * sx, my + G.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeRect(mx + G.cam.x * sx, my + G.cam.y * sy, vw * sx, vh * sy);
  };

  // HUD text: called every frame; cheap enough at this size.
  SB.updateHud = function (G) {
    var money = document.getElementById('hud-money');
    if (money) money.textContent = '$' + G.money;
    var fill = document.getElementById('hud-hp-fill');
    if (fill) fill.style.width = SB.clamp(G.hp, 0, 100) + '%';
    var hpText = document.getElementById('hud-hp-text');
    if (hpText) hpText.textContent = Math.max(0, Math.ceil(G.hp));
    var ammo = document.getElementById('hud-ammo');
    if (ammo) ammo.textContent = G.player.inCar ? 'DRIVING' : 'AMMO ' + G.ammo;
    var stars = document.getElementById('hud-stars');
    if (stars) {
      var s = '';
      for (var i = 0; i < 3; i++) s += i < G.wanted ? '★' : '☆';
      stars.textContent = s;
    }
    var title = document.getElementById('mc-title');
    if (title) title.textContent = SB.missionTitle(G);
    var obj = document.getElementById('mc-objective');
    if (obj) obj.textContent = G.storyComplete ? 'All four jobs done. You own the bay now.' : SB.missionObjective(G);
    var rew = document.getElementById('mc-reward');
    if (rew) {
      rew.textContent = G.storyComplete ? 'Total earned $3,100' : ('Reward $' + (SB.MISSIONS[G.missionIndex] ? SB.MISSIONS[G.missionIndex].reward : 0));
    }
  };
})();
