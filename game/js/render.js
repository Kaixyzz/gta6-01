// SOLARA BAY renderer: the whole city, every entity, the HUD and the
// minimap, drawn on one canvas. Sun-soaked coastal palette, bright daytime.
(function () {
  'use strict';

  var City = window.SBCity;

  function drawCarShape(ctx, car, t) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    var l = car.l / 2, w = car.w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-l + 3, -w + 4, car.l, car.w);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-l, -w, car.l, car.w, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,30,40,0.85)';
    ctx.beginPath();
    ctx.roundRect(-l * 0.35, -w * 0.72, l * 0.7, w * 1.44, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(l - 4, -w + 3, 3, 5);
    ctx.fillRect(l - 4, w - 8, 3, 5);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(-l, -w + 3, 3, 5);
    ctx.fillRect(-l, w - 8, 3, 5);
    if (car.patrol) {
      var on = Math.floor(t * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff2d2d' : '#2d7dff';
      ctx.beginPath();
      ctx.arc(-4, -w * 0.4, 4, 0, Math.PI * 2);
      ctx.arc(-4, w * 0.4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-l * 0.5, -w, l, w * 2);
    }
    if (car.type === 'bike') {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-l + 6, 0, 5, 0, Math.PI * 2);
      ctx.arc(l - 6, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(ctx, g, vw, vh) {
    var cam = g.camera;
    var t = g.time;
    // Ground: grass, sand strips, sea.
    ctx.fillStyle = '#7fae62';
    ctx.fillRect(cam.x - 20, cam.y - 20, vw + 40, vh + 40);
    ctx.fillStyle = '#e8d49a';
    for (var s = 0; s < City.sand.length; s++) {
      var sd = City.sand[s];
      ctx.fillRect(sd.x, sd.y, sd.w, sd.h);
    }
    ctx.fillStyle = '#3f8fbf';
    for (var w = 0; w < City.water.length; w++) {
      var wt = City.water[w];
      ctx.fillRect(wt.x, wt.y, wt.w, wt.h);
    }
    // Water shimmer.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (var sh = 0; sh < 8; sh++) {
      var sy = 60 + sh * 220 + Math.sin(t * 0.7 + sh) * 8;
      var sx = 2460 + Math.sin(t * 0.5 + sh * 2) * 10;
      if (sx > cam.x - 60 && sx < cam.x + vw + 60 && sy > cam.y - 20 && sy < cam.y + vh + 20) {
        ctx.beginPath();
        ctx.moveTo(sx - 22, sy);
        ctx.lineTo(sx + 22, sy);
        ctx.stroke();
      }
    }
    // Park lawn.
    ctx.fillStyle = '#5d9e4a';
    ctx.fillRect(1008, 688, 224, 224);
    // Roads.
    ctx.fillStyle = '#3a3f46';
    for (var i = 0; i < City.AVENUES.length; i++) {
      ctx.fillRect(City.AVENUES[i] - 48, 0, 96, City.WORLD_H);
    }
    for (var j = 0; j < City.STREETS.length; j++) {
      ctx.fillRect(0, City.STREETS[j] - 48, City.WORLD_W, 96);
    }
    // Lane dashes.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (var a = 0; a < City.AVENUES.length; a++) {
      ctx.beginPath();
      ctx.moveTo(City.AVENUES[a], 0);
      ctx.lineTo(City.AVENUES[a], City.WORLD_H);
      ctx.stroke();
    }
    for (var b = 0; b < City.STREETS.length; b++) {
      ctx.beginPath();
      ctx.moveTo(0, City.STREETS[b]);
      ctx.lineTo(City.WORLD_W, City.STREETS[b]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Sidewalk edges.
    ctx.strokeStyle = 'rgba(230,230,220,0.5)';
    ctx.lineWidth = 4;
    for (var c = 0; c < City.AVENUES.length; c++) {
      ctx.strokeRect(City.AVENUES[c] - 56, -10, 112, City.WORLD_H + 20);
    }
    for (var d = 0; d < City.STREETS.length; d++) {
      ctx.strokeRect(-10, City.STREETS[d] - 56, City.WORLD_W + 20, 112);
    }
    // Marina dock + boats.
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(2288, 1330, 26, 220);
    ctx.fillStyle = '#f5f5f5';
    for (var bo = 0; bo < 3; bo++) {
      var bx = 2360 + bo * 8, by = 1380 + bo * 70;
      ctx.beginPath();
      ctx.ellipse(bx, by, 26, 10, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d96f4e';
      ctx.fillRect(bx - 4, by - 22, 8, 20);
      ctx.fillStyle = '#f5f5f5';
    }
    // Park trees.
    for (var tr = 0; tr < City.trees.length; tr++) {
      var tree = City.trees[tr];
      ctx.fillStyle = '#2f7d32';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.arc(tree.x - 4, tree.y - 4, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Palms and umbrellas.
    for (var pm = 0; pm < City.palms.length; pm++) {
      var palm = City.palms[pm];
      if (palm.umbrella) {
        ctx.fillStyle = '#e2574c';
        ctx.beginPath();
        ctx.arc(palm.x, palm.y, 16, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#8a6f4d';
        ctx.fillRect(palm.x - 1, palm.y, 2, 14);
      } else {
        ctx.strokeStyle = '#7a5a34';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y + 10);
        ctx.lineTo(palm.x + 3, palm.y - 8);
        ctx.stroke();
        ctx.fillStyle = '#2e9e4f';
        ctx.beginPath();
        ctx.arc(palm.x + 3, palm.y - 12, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Buildings: base, height shading, rooftop details, windows.
    for (var bi = 0; bi < City.buildings.length; bi++) {
      var bd = City.buildings[bi];
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(bd.x + 5, bd.y + 6 + bd.height * 2, bd.w, bd.h);
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.fillStyle = bd.roof;
      ctx.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      var cols = Math.max(2, Math.floor(bd.w / 34));
      var rows = Math.max(2, Math.floor(bd.h / 30));
      for (var wx = 0; wx < cols; wx++) {
        for (var wy = 0; wy < rows; wy++) {
          ctx.fillRect(bd.x + 12 + wx * 30, bd.y + 12 + wy * 26, 14, 12);
        }
      }
      if (bd.kind === 'garage') {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('GARAGE', bd.x + 22, bd.y + bd.h - 14);
      } else if (bd.kind === 'bank') {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('BANK', bd.x + 46, bd.y + bd.h - 14);
      } else if (bd.kind === 'safehouse') {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('SAFEHOUSE', bd.x + 10, bd.y + bd.h - 12);
      }
    }
  }

  function drawEntities(ctx, g) {
    var i;
    // Stashes (visible as small glowing parcels).
    for (i = 0; i < g.missions.stashes.length; i++) {
      var st = g.missions.stashes[i];
      if (st.taken) continue;
      var pulse = 0.6 + 0.4 * Math.sin(g.time * 4);
      ctx.fillStyle = 'rgba(242,194,48,' + pulse.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(st.x, st.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a10';
      ctx.fillRect(st.x - 5, st.y - 4, 10, 8);
    }
    // Pickups.
    for (i = 0; i < g.pickups.length; i++) {
      var pk = g.pickups[i];
      if (pk.taken) continue;
      if (pk.kind === 'ammo') {
        ctx.fillStyle = '#2e9e4f';
        ctx.fillRect(pk.x - 10, pk.y - 8, 20, 16);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('AMMO', pk.x - 10, pk.y + 4);
      } else {
        ctx.fillStyle = '#e2574c';
        ctx.fillRect(pk.x - 10, pk.y - 10, 20, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(pk.x - 2, pk.y - 7, 4, 14);
        ctx.fillRect(pk.x - 7, pk.y - 2, 14, 4);
      }
    }
    // Skid marks.
    for (i = 0; i < g.skids.length; i++) {
      var sk = g.skids[i];
      ctx.strokeStyle = 'rgba(20,20,20,' + (sk.life * 0.5).toFixed(2) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sk.x - Math.cos(sk.angle) * 10, sk.y - Math.sin(sk.angle) * 10);
      ctx.lineTo(sk.x + Math.cos(sk.angle) * 10, sk.y + Math.sin(sk.angle) * 10);
      ctx.stroke();
    }
    // Traffic + parked cars + patrol cars.
    for (i = 0; i < g.cars.length; i++) {
      var car = g.cars[i];
      if (car === g.player.car) continue;
      drawCarShape(ctx, car, g.time);
    }
    if (g.player.car) drawCarShape(ctx, g.player.car, g.time);
    // Pedestrians.
    for (i = 0; i < g.pedestrians.length; i++) {
      var pd = g.pedestrians[i];
      ctx.fillStyle = pd.color;
      ctx.beginPath();
      ctx.arc(pd.x, pd.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(pd.x, pd.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies (gang / guards).
    for (i = 0; i < g.enemies.length; i++) {
      var en = g.enemies[i];
      ctx.fillStyle = '#a02020';
      ctx.beginPath();
      ctx.arc(en.x, en.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(en.x, en.y - 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(en.x - 12, en.y - 22, 24, 4);
      ctx.fillStyle = '#c81e1e';
      ctx.fillRect(en.x - 12, en.y - 22, 24 * (en.hp / 3), 4);
    }
    // Foot cops.
    for (i = 0; i < g.footCops.length; i++) {
      var cop = g.footCops[i];
      ctx.fillStyle = '#1d2f45';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d7dff';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player on foot.
    if (!g.player.inCar) {
      var pl = g.player;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5a10';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pl.x, pl.y);
      ctx.lineTo(pl.x + Math.cos(pl.aim) * 18, pl.y + Math.sin(pl.aim) * 18);
      ctx.stroke();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(pl.x, pl.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bullets.
    ctx.fillStyle = '#ffe14d';
    for (i = 0; i < g.bullets.length; i++) {
      var b = g.bullets[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (i = 0; i < g.particles.length; i++) {
      var pt = g.particles[i];
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Mission marker: pulsing diamond + ground ring.
    if (g.missions.marker && !g.missions.storyComplete) {
      var mk = g.missions.marker;
      var pr = 16 + 6 * Math.sin(g.time * 5);
      ctx.strokeStyle = '#f2c230';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mk.x, mk.y, pr + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2c230';
      ctx.save();
      ctx.translate(mk.x, mk.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
    }
  }

  function drawHUD(ctx, g, vw, vh) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Money + health + ammo panel.
    ctx.fillStyle = 'rgba(10,14,18,0.72)';
    ctx.beginPath();
    ctx.roundRect(14, 12, 250, 96, 10);
    ctx.fill();
    ctx.fillStyle = '#7CFC98';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('$' + g.money, 28, 44);
    ctx.fillStyle = '#e2574c';
    ctx.fillRect(28, 54, 120, 12);
    ctx.fillStyle = '#57d977';
    ctx.fillRect(28, 54, 120 * Math.max(0, g.player.hp / 100), 12);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText('HP ' + Math.max(0, Math.round(g.player.hp)), 154, 66);
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Ammo ' + g.player.ammo, 28, 94);
    var stTxt = 'Stash ' + g.stashCount + '/3';
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.fillText(stTxt, 150, 94);
    // Wanted stars.
    var sx = 280;
    for (var i = 0; i < 3; i++) {
      var lit = i < g.wanted;
      var pulse = g.wanted === 3 ? 1 + 0.25 * Math.sin(g.time * 8) : 1;
      ctx.font = 'bold ' + Math.round(30 * pulse) + 'px sans-serif';
      ctx.fillStyle = lit ? '#ffd23e' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', sx + i * 34, 44);
    }
    // Mission card.
    if (!g.missions.storyComplete) {
      ctx.fillStyle = 'rgba(10,14,18,0.72)';
      ctx.beginPath();
      ctx.roundRect(vw / 2 - 260, 12, 520, 64, 10);
      ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g.missions.title(), vw / 2, 36);
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      ctx.fillText(g.missions.objective() + '  •  $' + g.missions.reward(), vw / 2, 60);
      ctx.textAlign = 'left';
    }
    // Blip message.
    if (g.blipT > 0) {
      ctx.globalAlpha = Math.min(1, g.blipT);
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g.blipMsg, vw / 2, 100);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    drawMinimap(ctx, g, vw, vh);
    // Controls hint.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px sans-serif';
    ctx.fillText('WASD drive / walk • E enter car • Mouse aim, click shoot • P pause', 14, vh - 14);
  }

  function drawMinimap(ctx, g, vw, vh) {
    var mw = 190, mh = 142;
    var mx = vw - mw - 14, my = 12;
    var sc = mw / City.WORLD_W;
    ctx.fillStyle = 'rgba(10,14,18,0.78)';
    ctx.beginPath();
    ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#3f6d4a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#3f8fbf';
    ctx.fillRect(mx + 2440 * sc, my, mw - 2440 * sc, mh);
    ctx.fillRect(mx, my + 1800 * sc, mw, mh - 1800 * sc);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    for (var i = 0; i < City.AVENUES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(mx + City.AVENUES[i] * sc, my);
      ctx.lineTo(mx + City.AVENUES[i] * sc, my + mh);
      ctx.stroke();
    }
    for (var j = 0; j < City.STREETS.length; j++) {
      ctx.beginPath();
      ctx.moveTo(mx, my + City.STREETS[j] * sc);
      ctx.lineTo(mx + mw, my + City.STREETS[j] * sc);
      ctx.stroke();
    }
    function dot(x, y, color, r) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * sc, my + y * sc, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (var s = 0; s < g.missions.stashes.length; s++) {
      var st = g.missions.stashes[s];
      var d = Math.hypot(st.x - g.player.x, st.y - g.player.y);
      if (!st.taken && d < 400) dot(st.x, st.y, '#fff', 3);
    }
    for (var c = 0; c < g.cars.length; c++) dot(g.cars[c].x, g.cars[c].y, '#bbb', 2);
    for (var e = 0; e < g.enemies.length; e++) dot(g.enemies[e].x, g.enemies[e].y, '#ff5a5a', 3);
    for (var p = 0; p < g.patrolCars.length; p++) dot(g.patrolCars[p].x, g.patrolCars[p].y, '#2d7dff', 3);
    for (var f = 0; f < g.footCops.length; f++) dot(g.footCops[f].x, g.footCops[f].y, '#7db3ff', 2);
    if (g.missions.marker) {
      var pulse = 3 + Math.sin(g.time * 5);
      dot(g.missions.marker.x, g.missions.marker.y, '#f2c230', pulse);
    }
    dot(g.player.x, g.player.y, '#7CFC98', 4);
    ctx.restore();
  }

  function draw(g, ctx, vw, vh) {
    var shx = 0, shy = 0;
    if (g.shake > 0) {
      shx = (Math.random() - 0.5) * g.shake;
      shy = (Math.random() - 0.5) * g.shake;
    }
    ctx.save();
    ctx.clearRect(0, 0, vw, vh);
    ctx.translate(-g.camera.x + shx, -g.camera.y + shy);
    drawWorld(ctx, g, vw, vh);
    drawEntities(ctx, g);
    ctx.restore();
    // Sun glare gradient at the top.
    var grad = ctx.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, 'rgba(255,240,180,0.20)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, 120);
    drawHUD(ctx, g, vw, vh);
  }

  window.SBRender = { draw: draw, drawCarShape: drawCarShape };
})();
