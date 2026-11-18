// entities.js — everything that lives in the city: cars (parked, traffic,
// patrol), pedestrians, foot police, gang members, bullets, pickups and
// particles. All update functions take the game state G and a dt in seconds.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  var CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c',
                    '#e67e22', '#ecf0f1', '#2ecc71', '#fd79a8', '#00cec9'];
  var PED_COLORS = ['#ff7675', '#74b9ff', '#55efc4', '#fdcb6e', '#a29bfe',
                    '#fd79a8', '#00b894', '#e17055'];
  var nextCarId = 1;

  function makeCar(x, y, angle, color, opts) {
    opts = opts || {};
    return {
      id: nextCarId++, x: x, y: y, angle: angle, speed: 0,
      color: color, parked: !!opts.parked, traffic: !!opts.traffic,
      patrol: !!opts.patrol, owner: opts.owner || null,
      axis: opts.axis || 'v', fixed: opts.fixed || x, dir: opts.dir || 1,
      cruise: 130 + Math.random() * 40, lane: opts.lane || 0,
      waitT: 0, stuckT: 0, reverseT: 0, flashT: 0
    };
  }

  function roadPointNear(G, x, y) {
    // Snap a point onto the nearest road centreline.
    var best = null, bd = 1e18;
    for (var i = 0; i < SB.AVENUES.length; i++) {
      var d = Math.abs(x - SB.AVENUES[i]);
      if (d < bd) { bd = d; best = { x: SB.AVENUES[i], y: y, axis: 'v' }; }
    }
    for (var j = 0; j < SB.STREETS.length; j++) {
      var d2 = Math.abs(y - SB.STREETS[j]);
      if (d2 < bd) { bd = d2; best = { x: x, y: SB.STREETS[j], axis: 'h' }; }
    }
    return best;
  }

  // ---------------------------------------------------------- spawning

  SB.spawnWorld = function (G) {
    G.city = SB.buildCity(SB.SEED);
    G.cars = [];
    G.peds = [];
    G.cops = [];
    G.patrols = [];
    G.enemies = [];
    G.bullets = [];
    G.ebullets = [];
    G.parts = [];
    G.pickups = [];

    // Parked cars in the clear spots of the city (off the roads, so traffic
    // never has to queue behind one).
    var parkedSpots = [
      { x: 420, y: 545, a: 0 },
      { x: 760, y: 420, a: Math.PI / 2 },
      { x: 1040, y: 1100, a: 0 },
      { x: 1700, y: 760, a: Math.PI / 2 },
      { x: 1400, y: 1420, a: 0 },
      { x: 460, y: 1360, a: Math.PI / 2 }
    ];
    for (var i = 0; i < parkedSpots.length; i++) {
      var s = parkedSpots[i];
      G.cars.push(makeCar(s.x, s.y, s.a, CAR_COLORS[i % CAR_COLORS.length], { parked: true }));
    }

    // Traffic: cars cruising the avenues and streets.
    for (var t = 0; t < 9; t++) {
      var vertical = G.rng() < 0.5;
      var road, fixed, pos;
      if (vertical) {
        road = SB.AVENUES[Math.floor(G.rng() * SB.AVENUES.length)];
        fixed = road;
        pos = 80 + G.rng() * (SB.WORLD_H - 160);
        G.cars.push(makeCar(fixed, pos, G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2,
          CAR_COLORS[(t + 3) % CAR_COLORS.length],
          { traffic: true, axis: 'v', fixed: fixed, dir: G.rng() < 0.5 ? 1 : -1, lane: G.rng() < 0.5 ? -14 : 14 }));
      } else {
        road = SB.STREETS[Math.floor(G.rng() * SB.STREETS.length)];
        fixed = road;
        pos = 80 + G.rng() * (SB.WORLD_W - 260);
        G.cars.push(makeCar(pos, fixed, G.rng() < 0.5 ? 0 : Math.PI,
          CAR_COLORS[(t + 5) % CAR_COLORS.length],
          { traffic: true, axis: 'h', fixed: fixed, dir: G.rng() < 0.5 ? 1 : -1, lane: G.rng() < 0.5 ? -14 : 14 }));
      }
    }

    // Pedestrians on the sidewalks.
    for (var p = 0; p < 16; p++) {
      var pv = G.rng() < 0.5;
      var pr, pf, pp, side = G.rng() < 0.5 ? -56 : 56;
      if (pv) {
        pr = SB.AVENUES[Math.floor(G.rng() * SB.AVENUES.length)];
        pf = pr + side;
        pp = 80 + G.rng() * (SB.WORLD_H - 160);
        G.peds.push({ x: pf, y: pp, axis: 'v', fixed: pr, side: side, dir: G.rng() < 0.5 ? 1 : -1, speed: 42 + G.rng() * 28, color: PED_COLORS[p % PED_COLORS.length], fleeT: 0, down: false, downT: 0, walkPhase: G.rng() * 6 });
      } else {
        pr = SB.STREETS[Math.floor(G.rng() * SB.STREETS.length)];
        pf = pr + side;
        pp = 80 + G.rng() * (SB.WORLD_W - 260);
        G.peds.push({ x: pp, y: pf, axis: 'h', fixed: pr, side: side, dir: G.rng() < 0.5 ? 1 : -1, speed: 42 + G.rng() * 28, color: PED_COLORS[p % PED_COLORS.length], fleeT: 0, down: false, downT: 0, walkPhase: G.rng() * 6 });
      }
    }

    // Fixed pickups: ammo at the garage and at the central intersection,
    // health at the garage. They respawn 25 s after being taken.
    G.pickups.push({ x: 520, y: 560, kind: 'ammo', spot: 0, gone: false, respawnAt: 0 });
    G.pickups.push({ x: 1280, y: 960, kind: 'ammo', spot: 1, gone: false, respawnAt: 0 });
    G.pickups.push({ x: 565, y: 545, kind: 'health', spot: 2, gone: false, respawnAt: 0 });
  };

  SB.spawnGang = function (G) {
    var turf = SB.MISSIONS[2].marker;
    var offs = [[-40, 0], [40, 0], [0, -40], [0, 40]];
    for (var i = 0; i < 4; i++) {
      G.enemies.push({
        x: turf.x + offs[i][0], y: turf.y + offs[i][1],
        hp: 3, angle: 0, shootT: 0.8 + i * 0.4, strafeDir: i % 2 === 0 ? 1 : -1
      });
    }
    G.gangSpawned = true;
  };

  SB.spawnChase = function (G) {
    // Three patrol cars and two foot cops close in on the player.
    for (var i = 0; i < 3; i++) {
      var a = 0.6 + i * 2.1;
      var rp = roadPointNear(G, G.player.x + Math.cos(a) * 330, G.player.y + Math.sin(a) * 330);
      var car = makeCar(rp.x, rp.y, Math.atan2(G.player.y - rp.y, G.player.x - rp.x),
        '#222831', { patrol: true, axis: rp.axis, fixed: rp.axis === 'v' ? rp.x : rp.y });
      car.speed = 200;
      G.patrols.push(car);
      G.cars.push(car);
    }
    for (var j = 0; j < 2; j++) {
      var b = 2.4 + j * 2.2;
      var cp = roadPointNear(G, G.player.x + Math.cos(b) * 150, G.player.y + Math.sin(b) * 150);
      G.cops.push({ x: cp.x, y: cp.y, bustT: 0 });
    }
  };

  // ---------------------------------------------------------- wanted

  SB.addWanted = function (G, n) {
    if (G.chaseLock) return;
    G.wanted = Math.min(3, G.wanted + n);
    G.lastCrime = G.time;
  };

  // ---------------------------------------------------------- player

  SB.enterCar = function (G) {
    var best = null, bd = 62;
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (c.patrol) continue;
      var d = SB.dist(G.player.x, G.player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    G.player.inCar = true;
    G.player.car = best;
    best.parked = false;
    best.traffic = false;
    if (best.owner !== 'player') {
      SB.addWanted(G, 1);
      SB.toast(G, 'Car stolen — the police are watching');
    }
    best.owner = 'player';
    G.player.x = best.x;
    G.player.y = best.y;
    return true;
  };

  SB.exitCar = function (G) {
    var car = G.player.car;
    if (!car) return;
    car.parked = true;
    car.speed = 0;
    G.player.inCar = false;
    G.player.car = null;
    // Step out to the side of the car.
    var px = Math.cos(car.angle + Math.PI / 2) * 34;
    var py = Math.sin(car.angle + Math.PI / 2) * 34;
    G.player.x = car.x + px;
    G.player.y = car.y + py;
    SB.resolveCircle(G.city, G.player, 14);
  };

  SB.updatePlayerOnFoot = function (G, dt) {
    var k = G.keys;
    var dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
    var dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    var len = Math.sqrt(dx * dx + dy * dy);
    var sp = 185;
    G.player.x += dx / len * sp * dt;
    G.player.y += dy / len * sp * dt;
    G.player.angle = Math.atan2(dy, dx);
    SB.resolveCircle(G.city, G.player, 14);
  };

  SB.updatePlayerCar = function (G, dt) {
    var car = G.player.car;
    if (!car) return;
    var k = G.keys;
    var accel = 0;
    if (k.w) accel = 430;
    else if (k.s) accel = car.speed > 5 ? -650 : -320;
    car.speed += accel * dt;
    // Drag and rolling resistance.
    car.speed -= car.speed * 0.28 * dt;
    if (!k.w && !k.s) car.speed -= car.speed * 0.9 * dt;
    car.speed = SB.clamp(car.speed, -200, 520);
    if (Math.abs(car.speed) < 4 && !k.w && !k.s) car.speed = 0;
    // Steering answers to the key, scaled by how fast the car is moving.
    // The wheel turns the car the same way forwards and backwards, so a
    // reverse three-point turn steers toward the target like the driver does.
    var steer = (k.d ? 1 : 0) - (k.a ? 1 : 0);
    var grip = SB.clamp(Math.abs(car.speed) / 170, 0, 1);
    car.angle += steer * 2.9 * grip * dt;
    var nx = car.x + Math.cos(car.angle) * car.speed * dt;
    var ny = car.y + Math.sin(car.angle) * car.speed * dt;
    var before = { x: car.x, y: car.y };
    car.x = nx;
    car.y = ny;
    var hit = SB.resolveCircle(G.city, car, 20);
    if (hit) {
      var moved = SB.dist(before.x, before.y, car.x, car.y);
      var want = Math.abs(car.speed) * dt;
      if (want > 1 && moved < want * 0.5) {
        if (Math.abs(car.speed) > 120) {
          SB.audio.crash();
          SB.burst(G, car.x, car.y, '#ffd23e', 8);
        }
        car.speed *= 0.55;
      }
    }
    // Bump into other cars: push apart, bleed speed.
    for (var i = 0; i < G.cars.length; i++) {
      var o = G.cars[i];
      if (o === car || o.patrol) continue;
      var d = SB.dist(car.x, car.y, o.x, o.y);
      if (d < 40 && d > 0.01) {
        var push = (40 - d) / 2;
        var ux = (car.x - o.x) / d, uy = (car.y - o.y) / d;
        car.x += ux * push;
        car.y += uy * push;
        o.x -= ux * push;
        o.y -= uy * push;
        car.speed *= 0.92;
      }
    }
    // Running over a pedestrian is a crime.
    for (var j = 0; j < G.peds.length; j++) {
      var p = G.peds[j];
      if (p.down) continue;
      if (SB.dist(car.x, car.y, p.x, p.y) < 26) {
        p.down = true;
        p.downT = 4;
        car.speed *= 0.85;
        SB.burst(G, p.x, p.y, '#ff7675', 10);
        if (G.time - (G.lastPedHit || -99) > 5) {
          SB.addWanted(G, 1);
          G.lastPedHit = G.time;
        }
        SB.fleePeds(G, car.x, car.y);
      }
    }
    G.player.x = car.x;
    G.player.y = car.y;
    G.player.angle = car.angle;
  };

  // ---------------------------------------------------------- traffic

  SB.updateTraffic = function (G, dt) {
    for (var i = 0; i < G.cars.length; i++) {
      var c = G.cars[i];
      if (!c.traffic) continue;
      // Is anything stopped right ahead?
      var blocked = false;
      var fx = Math.cos(c.angle), fy = Math.sin(c.angle);
      for (var j = 0; j < G.cars.length; j++) {
        if (j === i) continue;
        var o = G.cars[j];
        var dx = o.x - c.x, dy = o.y - c.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 64 && d > 0.01 && (dx * fx + dy * fy) / d > 0.6) { blocked = true; break; }
      }
      var target = blocked ? 0 : c.cruise;
      c.speed += SB.clamp(target - c.speed, -500 * dt, 260 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      // Keep on the road: lateral offset from the centreline.
      if (c.axis === 'v') {
        c.x = c.fixed + c.lane;
        var top = 30, bottom = SB.WORLD_H - 30;
        if ((c.dir > 0 && c.y > bottom) || (c.dir < 0 && c.y < top)) c.dir *= -1;
        if (c.dir > 0 && c.angle !== Math.PI / 2) c.angle = Math.PI / 2;
        if (c.dir < 0 && c.angle !== -Math.PI / 2) c.angle = -Math.PI / 2;
      } else {
        c.y = c.fixed + c.lane;
        var left = 30, right = SB.WORLD_W - 170;
        if ((c.dir > 0 && c.x > right) || (c.dir < 0 && c.x < left)) c.dir *= -1;
        if (c.dir > 0 && c.angle !== 0) c.angle = 0;
        if (c.dir < 0 && c.angle !== Math.PI) c.angle = Math.PI;
      }
      // At an intersection, sometimes turn onto the crossing road.
      var crossRoad = null;
      if (c.axis === 'v') {
        for (var s = 0; s < SB.STREETS.length; s++) {
          if (Math.abs(c.y - SB.STREETS[s]) < 6) { crossRoad = SB.STREETS[s]; break; }
        }
      } else {
        for (var a = 0; a < SB.AVENUES.length; a++) {
          if (Math.abs(c.x - SB.AVENUES[a]) < 6) { crossRoad = SB.AVENUES[a]; break; }
        }
      }
      if (crossRoad !== null && G.rng() < dt * 0.22) {
        if (c.axis === 'v') {
          c.axis = 'h';
          c.fixed = crossRoad;
          c.y = crossRoad;
          c.dir = G.rng() < 0.5 ? 1 : -1;
          c.lane = G.rng() < 0.5 ? -14 : 14;
          c.angle = c.dir > 0 ? 0 : Math.PI;
        } else {
          c.axis = 'v';
          c.fixed = crossRoad;
          c.x = crossRoad;
          c.dir = G.rng() < 0.5 ? 1 : -1;
          c.lane = G.rng() < 0.5 ? -14 : 14;
          c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
    }
  };

  // ---------------------------------------------------------- pedestrians

  SB.fleePeds = function (G, x, y) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      if (p.down) continue;
      if (SB.dist(p.x, p.y, x, y) < 240) {
        p.fleeT = 1.4;
        // Run away from the scare along the sidewalk.
        var along = p.axis === 'v' ? (p.y - y) : (p.x - x);
        p.dir = along >= 0 ? 1 : -1;
      }
    }
  };

  SB.updatePeds = function (G, dt) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      p.walkPhase += dt * 6;
      if (p.down) {
        p.downT -= dt;
        if (p.downT <= 0) {
          // Get up far away and walk off: respawn on a random sidewalk.
          p.down = false;
          var v = G.rng() < 0.5;
          if (v) {
            var av = SB.AVENUES[Math.floor(G.rng() * SB.AVENUES.length)];
            p.axis = 'v';
            p.fixed = av;
            p.side = G.rng() < 0.5 ? -56 : 56;
            p.x = av + p.side;
            p.y = 80 + G.rng() * (SB.WORLD_H - 160);
          } else {
            var st = SB.STREETS[Math.floor(G.rng() * SB.STREETS.length)];
            p.axis = 'h';
            p.fixed = st;
            p.side = G.rng() < 0.5 ? -56 : 56;
            p.y = st + p.side;
            p.x = 80 + G.rng() * (SB.WORLD_W - 260);
          }
          p.dir = G.rng() < 0.5 ? 1 : -1;
        }
        continue;
      }
      var sp = p.fleeT > 0 ? 150 : p.speed;
      if (p.fleeT > 0) p.fleeT -= dt;
      if (p.axis === 'v') {
        p.y += p.dir * sp * dt;
        p.x = p.fixed + p.side;
        if (p.y < 40) { p.y = 40; p.dir = 1; }
        if (p.y > SB.WORLD_H - 40) { p.y = SB.WORLD_H - 40; p.dir = -1; }
        if (G.rng() < dt * 0.05) p.dir *= -1;
      } else {
        p.x += p.dir * sp * dt;
        p.y = p.fixed + p.side;
        if (p.x < 40) { p.x = 40; p.dir = 1; }
        if (p.x > SB.WORLD_W - 200) { p.x = SB.WORLD_W - 200; p.dir = -1; }
        if (G.rng() < dt * 0.05) p.dir *= -1;
      }
    }
  };

  // ---------------------------------------------------------- police

  SB.updatePolice = function (G, dt) {
    // Foot cops: wanted 1 brings them out.
    var wantCops = G.wanted >= 1 ? Math.min(2, G.wanted) : 0;
    while (G.cops.length < wantCops) {
      var a = G.rng() * Math.PI * 2;
      var rp = roadPointNear(G, G.player.x + Math.cos(a) * 380, G.player.y + Math.sin(a) * 380);
      G.cops.push({ x: rp.x, y: rp.y, bustT: 0 });
    }
    while (G.cops.length > wantCops) G.cops.pop();
    // Patrol cars: wanted 2 and 3.
    var wantPatrols = G.wanted >= 2 ? G.wanted : 0;
    if (G.chaseLock) wantPatrols = Math.max(wantPatrols, 3);
    while (G.patrols.length < wantPatrols) {
      var b = G.rng() * Math.PI * 2;
      var pp = roadPointNear(G, G.player.x + Math.cos(b) * 420, G.player.y + Math.sin(b) * 420);
      var car = makeCar(pp.x, pp.y, Math.atan2(G.player.y - pp.y, G.player.x - pp.x),
        '#222831', { patrol: true, axis: pp.axis, fixed: pp.axis === 'v' ? pp.x : pp.y });
      car.speed = 220;
      G.patrols.push(car);
      G.cars.push(car);
    }
    while (G.patrols.length > wantPatrols) {
      var gone = G.patrols.pop();
      var idx = G.cars.indexOf(gone);
      if (idx >= 0) G.cars.splice(idx, 1);
    }

    // Foot cops run at the player. Touching one on foot for 3 s is a bust:
    // they are slower than a sprinting player, so keep moving to stay free.
    for (var i = 0; i < G.cops.length; i++) {
      var cop = G.cops[i];
      var d = SB.dist(cop.x, cop.y, G.player.x, G.player.y);
      if (d > 4) {
        var ang = Math.atan2(G.player.y - cop.y, G.player.x - cop.x);
        cop.x += Math.cos(ang) * 125 * dt;
        cop.y += Math.sin(ang) * 125 * dt;
        SB.resolveCircle(G.city, cop, 14);
      }
      if (!G.player.inCar && d < 26) {
        cop.bustT += dt;
        if (cop.bustT > 3.0 && G.state === 'playing') {
          G.state = 'busted';
          SB.onBusted(G);
        }
      } else {
        cop.bustT = Math.max(0, cop.bustT - dt * 2);
      }
      if (d > 1100) {
        var na = G.rng() * Math.PI * 2;
        var np = roadPointNear(G, G.player.x + Math.cos(na) * 380, G.player.y + Math.sin(na) * 380);
        cop.x = np.x;
        cop.y = np.y;
        cop.bustT = 0;
      }
    }

    // Patrol cars chase and ram.
    for (var j = 0; j < G.patrols.length; j++) {
      var pc = G.patrols[j];
      pc.flashT += dt;
      var pd = SB.dist(pc.x, pc.y, G.player.x, G.player.y);
      var desired = Math.atan2(G.player.y - pc.y, G.player.x - pc.x);
      var diff = SB.normAngle(desired - pc.angle);
      if (pc.reverseT > 0) {
        pc.reverseT -= dt;
        pc.speed = SB.clamp(pc.speed - 300 * dt, -160, 470);
        pc.angle += SB.clamp(diff, -1, 1) * 1.6 * dt;
      } else {
        pc.speed = SB.clamp(pc.speed + 380 * dt, -160, 470);
        pc.angle += SB.clamp(diff * 2.2, -1, 1) * 2.5 * dt;
      }
      var px = pc.x, py = pc.y;
      pc.x += Math.cos(pc.angle) * pc.speed * dt;
      pc.y += Math.sin(pc.angle) * pc.speed * dt;
      var hitB = SB.resolveCircle(G.city, pc, 20);
      if (hitB) pc.speed *= 0.5;
      var moved = SB.dist(px, py, pc.x, pc.y);
      if (Math.abs(pc.speed) > 60 && moved < Math.abs(pc.speed) * dt * 0.25) {
        pc.stuckT += dt;
        if (pc.stuckT > 1.6) { pc.reverseT = 1.0; pc.stuckT = 0; }
      } else {
        pc.stuckT = 0;
      }
      // Ram the player's car.
      if (G.player.inCar && pd < 44) {
        var ux = (G.player.x - pc.x) / (pd || 1);
        var uy = (G.player.y - pc.y) / (pd || 1);
        G.player.x += ux * 26;
        G.player.y += uy * 26;
        if (G.player.car) {
          G.player.car.x = G.player.x;
          G.player.car.y = G.player.y;
          G.player.car.speed *= 0.82;
        }
        pc.speed *= -0.35;
        SB.burst(G, pc.x, pc.y, '#ffd23e', 6);
        SB.audio.crash();
      }
      // A patrol far behind gives up and repositions near the player.
      if (pd > 1100) {
        var ra = G.rng() * Math.PI * 2;
        var rp2 = roadPointNear(G, G.player.x + Math.cos(ra) * 400, G.player.y + Math.sin(ra) * 400);
        pc.x = rp2.x;
        pc.y = rp2.y;
        pc.speed = 220;
      }
    }
  };

  // ---------------------------------------------------------- gang combat

  SB.updateEnemies = function (G, dt) {
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      var d = SB.dist(e.x, e.y, G.player.x, G.player.y);
      e.angle = Math.atan2(G.player.y - e.y, G.player.x - e.x);
      if (!G.player.inCar && d < 430) {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = 1.2 + G.rng() * 0.7;
          var spread = (G.rng() - 0.5) * 0.24;
          var ba = e.angle + spread;
          G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(ba) * 480, vy: Math.sin(ba) * 480, life: 1.4 });
          SB.audio.shot();
        }
      }
      // Close in slowly, keep a little distance, strafe a touch.
      if (d > 260) {
        e.x += Math.cos(e.angle) * 55 * dt;
        e.y += Math.sin(e.angle) * 55 * dt;
      } else if (d < 150) {
        e.x -= Math.cos(e.angle) * 40 * dt;
        e.y -= Math.sin(e.angle) * 40 * dt;
      } else {
        e.x += Math.cos(e.angle + Math.PI / 2) * e.strafeDir * 26 * dt;
        e.y += Math.sin(e.angle + Math.PI / 2) * e.strafeDir * 26 * dt;
      }
      SB.resolveCircle(G.city, e, 14);
    }
  };

  SB.firePlayerBullet = function (G, wx, wy) {
    if (G.player.inCar || G.ammo <= 0) return;
    G.ammo--;
    var a = Math.atan2(wy - G.player.y, wx - G.player.x);
    var mx = G.player.x + Math.cos(a) * 22;
    var my = G.player.y + Math.sin(a) * 22;
    G.bullets.push({ x: mx, y: my, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 0.9 });
    SB.audio.shot();
    SB.burst(G, mx, my, '#ffe08a', 3);
    // Firing is a crime, paced so one firefight does not spike the stars.
    if (G.time - (G.lastShotCrime || -99) > 10) {
      SB.addWanted(G, 1);
      G.lastShotCrime = G.time;
    }
    SB.fleePeds(G, G.player.x, G.player.y);
  };

  SB.updateBullets = function (G, dt) {
    // Player bullets: hit gang members or buildings.
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      var dead = b.life <= 0;
      if (!dead && SB.hitsBuilding(G.city, b.x, b.y, 3)) {
        SB.burst(G, b.x, b.y, '#cfd8dc', 4);
        dead = true;
      }
      if (!dead) {
        for (var j = G.enemies.length - 1; j >= 0; j--) {
          var e = G.enemies[j];
          if (SB.dist(b.x, b.y, e.x, e.y) < 19) {
            e.hp--;
            SB.burst(G, e.x, e.y, '#ff5252', 8);
            dead = true;
            if (e.hp <= 0) {
              G.enemies.splice(j, 1);
              G.kills++;
              SB.burst(G, e.x, e.y, '#ff5252', 16);
              if (G.rng() < 0.6) {
                G.pickups.push({ x: e.x, y: e.y, kind: 'ammo', spot: -1, gone: false, respawnAt: 0 });
              }
              SB.audio.missionDone();
            }
            break;
          }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
    // Enemy bullets: hit the player on foot or a building.
    for (var k = G.ebullets.length - 1; k >= 0; k--) {
      var eb = G.ebullets[k];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      eb.life -= dt;
      var gone = eb.life <= 0;
      if (!gone && SB.hitsBuilding(G.city, eb.x, eb.y, 3)) gone = true;
      if (!gone && !G.player.inCar && SB.dist(eb.x, eb.y, G.player.x, G.player.y) < 15) {
        G.hp -= 5;
        SB.burst(G, G.player.x, G.player.y, '#ff5252', 6);
        gone = true;
        if (G.hp <= 0) {
          G.hp = 0;
          G.state = 'wasted';
          SB.onWasted(G);
        }
      }
      if (gone) G.ebullets.splice(k, 1);
    }
  };

  // ---------------------------------------------------------- pickups

  SB.updatePickups = function (G, dt) {
    for (var i = 0; i < G.pickups.length; i++) {
      var p = G.pickups[i];
      if (p.gone) {
        if (p.spot >= 0 && G.time >= p.respawnAt) p.gone = false;
        continue;
      }
      if (SB.dist(p.x, p.y, G.player.x, G.player.y) < 30) {
        if (p.kind === 'ammo') {
          G.ammo = Math.min(99, G.ammo + 12);
          SB.toast(G, '+12 ammo');
        } else {
          G.hp = Math.min(100, G.hp + 40);
          SB.toast(G, '+40 health');
        }
        SB.audio.pickup();
        SB.burst(G, p.x, p.y, '#7dff9a', 10);
        if (p.spot >= 0) {
          p.gone = true;
          p.respawnAt = G.time + 25;
        } else {
          G.pickups.splice(i, 1);
          i--;
        }
      }
    }
  };

  // ---------------------------------------------------------- particles

  SB.burst = function (G, x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 140;
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.35, maxLife: 0.75, color: color, size: 2 + Math.random() * 3
      });
    }
  };

  SB.updateParticles = function (G, dt) {
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
  };
})();
