// SOLARA BAY entities: cars, pedestrians, traffic, police, enemies,
// pickups and bullets. The car physics here carries the steering rule
// proven in rebuild #16: 'd' ALWAYS turns clockwise and 'a' ALWAYS turns
// counter-clockwise, whatever the sign of speed — never flip the turn
// when reversing, or the driver oscillates forever around a target behind.
(function () {
  'use strict';

  var City = window.SBCity;

  var CAR_TYPES = {
    sedan: { maxSpeed: 285, accel: 210, turnRate: 3.2, color: '#c94f43', w: 34, l: 52 },
    sports: { maxSpeed: 350, accel: 300, turnRate: 3.4, color: '#f2c230', w: 32, l: 54 },
    bike: { maxSpeed: 310, accel: 260, turnRate: 3.6, color: '#3fa7d6', w: 16, l: 44 },
    truck: { maxSpeed: 200, accel: 140, turnRate: 2.6, color: '#7a8ba0', w: 38, l: 62 },
    patrol: { maxSpeed: 280, accel: 260, turnRate: 3.2, color: '#22282e', w: 34, l: 52 }
  };

  var nextId = 1;

  function createCar(type, x, y, angle, opts) {
    opts = opts || {};
    var t = CAR_TYPES[type] || CAR_TYPES.sedan;
    return {
      id: opts.id || ('car-' + (nextId++)),
      type: type, x: x, y: y, angle: angle || 0, speed: 0,
      maxSpeed: t.maxSpeed, accel: t.accel, turnRate: t.turnRate,
      color: opts.color || t.color, w: t.w, l: t.l,
      parked: !!opts.parked, traffic: !!opts.traffic,
      patrol: !!opts.patrol, driver: opts.driver || null,
      crashed: false, skid: false, shoveCd: 0, stuckT: 0
    };
  }

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Player-driven car physics. STEERING RULE: the turn direction comes from
  // the key alone ('d' = clockwise, 'a' = counter-clockwise). It is NEVER
  // multiplied by the sign of speed: reversing with 'd' still turns the car
  // clockwise, so the driver pressing the same key for the same target
  // heading always gets the same turn.
  function stepCarPhysics(car, input, dt) {
    var turn = (input.d ? 1 : 0) - (input.a ? 1 : 0);
    var grip = Math.min(1, Math.abs(car.speed) / 60);
    car.angle += turn * car.turnRate * grip * dt;
    if (input.w) car.speed += car.accel * dt;
    else if (input.s) {
      if (car.speed > 0) car.speed -= car.accel * 1.6 * dt;
      else car.speed -= car.accel * 0.6 * dt;
    } else {
      car.speed -= car.speed * 0.5 * dt;
    }
    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
    if (car.speed < -120) car.speed = -120;
    car.speed -= car.speed * 0.12 * dt;
    var dx = Math.cos(car.angle) * car.speed * dt;
    var dy = Math.sin(car.angle) * car.speed * dt;
    car.crashed = false;
    var hit = City.moveCircle(car, dx, dy, 16);
    if (hit.hitX || hit.hitY) {
      car.speed *= 0.5;
      car.crashed = true;
    }
    car.skid = Math.abs(turn) > 0 && Math.abs(car.speed) > 150;
  }

  // Push two overlapping cars apart through collision-checked movement.
  // Building-aware, and with NO per-frame speed damping: the old damping
  // (0.97/0.85 while overlapping) ground both cars to a dead stop.
  function separateCars(cars) {
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        if (d >= 34 || d < 0.01) continue;
        var push = (34 - d) / 2;
        var nx = dx / d, ny = dy / d;
        City.moveCircle(a, -nx * push, -ny * push, 16);
        City.moveCircle(b, nx * push, ny * push, 16);
      }
    }
    for (var k = 0; k < cars.length; k++) {
      var c = cars[k];
      if (City.isBlocked(c.x, c.y, 16)) {
        var spot = City.findOpenSpot(c.x, c.y, 16);
        c.x = spot.x; c.y = spot.y;
      }
    }
  }

  // Collision-checked shove: never teleports a car into a building.
  function shoveCar(car, dx, dy) {
    City.moveCircle(car, dx, dy, 16);
    if (City.isBlocked(car.x, car.y, 16)) {
      var spot = City.findOpenSpot(car.x, car.y, 16);
      car.x = spot.x; car.y = spot.y;
    }
  }

  function createPedestrian(x, y) {
    return {
      x: x, y: y, angle: 0, speed: 0,
      tx: x, ty: y, wait: 0, fleeT: 0,
      color: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'][Math.floor(Math.random() * 6)],
      shirt: Math.random()
    };
  }

  function pedTarget(p, rng) {
    // Sidewalk point: near a road, offset from its centre line.
    var av = rng.pick(City.AVENUES), st = rng.pick(City.STREETS);
    if (rng.chance(0.5)) return { x: av + rng.pick([-62, 62]), y: rng.range(40, 1880) };
    return { x: rng.range(40, 2520), y: st + rng.pick([-62, 62]) };
  }

  function stepPedestrian(p, dt, rng) {
    if (p.fleeT > 0) p.fleeT -= dt;
    var dx = p.tx - p.x, dy = p.ty - p.y;
    var d = Math.hypot(dx, dy);
    if (d < 12) {
      p.wait -= dt;
      if (p.wait <= 0) {
        var t = pedTarget(p, rng);
        p.tx = t.x; p.ty = t.y;
        p.wait = rng.range(0, 2.5);
      }
      return;
    }
    var sp = p.fleeT > 0 ? 115 : 52;
    p.angle = Math.atan2(dy, dx);
    City.moveCircle(p, Math.cos(p.angle) * sp * dt, Math.sin(p.angle) * sp * dt, 10);
  }

  function fleeFrom(p, x, y) {
    var dx = p.x - x, dy = p.y - y;
    var d = Math.hypot(dx, dy) || 1;
    p.tx = p.x + (dx / d) * 260;
    p.ty = p.y + (dy / d) * 260;
    p.fleeT = 2;
  }

  function createTrafficCar(rng) {
    var av = rng.pick(City.AVENUES), st = rng.pick(City.STREETS);
    var horiz = rng.chance(0.5);
    var x, y, angle;
    if (horiz) { x = rng.range(80, 2400); y = st; angle = rng.chance(0.5) ? 0 : Math.PI; }
    else { x = av; y = rng.range(80, 1760); angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2; }
    var type = rng.pick(['sedan', 'sedan', 'sedan', 'truck', 'bike']);
    var car = createCar(type, x, y, angle, { traffic: true });
    car.route = { x: rng.pick(City.AVENUES), y: rng.pick(City.STREETS) };
    return car;
  }

  function stepTraffic(car, dt, cars, rng) {
    var dx = car.route.x - car.x, dy = car.route.y - car.y;
    var d = Math.hypot(dx, dy);
    if (d < 60) {
      car.route = { x: rng.pick(City.AVENUES), y: rng.pick(City.STREETS) };
      return;
    }
    var desired = Math.atan2(dy, dx);
    var diff = normAngle(desired - car.angle);
    car.angle += Math.max(-car.turnRate * dt, Math.min(car.turnRate * dt, diff));
    // Stop for a car ahead.
    var ahead = false;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car) continue;
      var ox = o.x - car.x, oy = o.y - car.y;
      var od = Math.hypot(ox, oy);
      if (od < 58 && od > 1) {
        var dot = (ox * Math.cos(car.angle) + oy * Math.sin(car.angle)) / od;
        if (dot > 0.7) { ahead = true; break; }
      }
    }
    var target = ahead ? 0 : 125;
    car.speed += (target - car.speed) * Math.min(1, 2 * dt);
    var mx = Math.cos(car.angle) * car.speed * dt;
    var my = Math.sin(car.angle) * car.speed * dt;
    var hit = City.moveCircle(car, mx, my, 16);
    if (hit.hitX || hit.hitY) {
      car.route = { x: rng.pick(City.AVENUES), y: rng.pick(City.STREETS) };
      car.speed *= 0.4;
    }
  }

  function createPatrol(x, y) {
    var car = createCar('patrol', x, y, 0, { patrol: true });
    car.shoveCd = 0;
    return car;
  }

  function stepPatrol(car, target, dt, playerCar) {
    car.shoveCd = Math.max(0, car.shoveCd - dt);
    var px = target.x + (target.vx || 0) * 0.35;
    var py = target.y + (target.vy || 0) * 0.35;
    var dx = px - car.x, dy = py - car.y;
    var d = Math.hypot(dx, dy);
    var desired = Math.atan2(dy, dx);
    var diff = normAngle(desired - car.angle);
    car.angle += Math.max(-car.turnRate * dt, Math.min(car.turnRate * dt, diff));
    var want = d > 46 ? car.maxSpeed : 0;
    car.speed += (want - car.speed) * Math.min(1, 2.2 * dt);
    var mx = Math.cos(car.angle) * car.speed * dt;
    var my = Math.sin(car.angle) * car.speed * dt;
    var hit = City.moveCircle(car, mx, my, 16);
    if (hit.hitX || hit.hitY) {
      car.stuckT += dt;
      if (car.stuckT > 1.6) {
        // Reverse out of the jam, then carry on.
        City.moveCircle(car, -Math.cos(car.angle) * 60 * dt, -Math.sin(car.angle) * 60 * dt, 16);
        if (car.stuckT > 2.4) car.stuckT = 0;
      }
    } else {
      car.stuckT = 0;
    }
    // Ram: a single collision-checked shove, then a cooldown.
    if (playerCar && car.shoveCd <= 0) {
      var pdx = playerCar.x - car.x, pdy = playerCar.y - car.y;
      var pd = Math.hypot(pdx, pdy);
      if (pd < 46 && pd > 0.01) {
        shoveCar(playerCar, (pdx / pd) * 26, (pdy / pd) * 26);
        playerCar.speed *= 0.6;
        car.shoveCd = 1.2;
        return true;
      }
    }
    return false;
  }

  function createFootCop(x, y) {
    return { x: x, y: y, hp: 2, speed: 115, contactT: 0, angle: 0 };
  }

  function stepFootCop(cop, target, dt) {
    var dx = target.x - cop.x, dy = target.y - cop.y;
    var d = Math.hypot(dx, dy);
    if (d > 1) {
      cop.angle = Math.atan2(dy, dx);
      City.moveCircle(cop, Math.cos(cop.angle) * cop.speed * dt, Math.sin(cop.angle) * cop.speed * dt, 12);
    }
    if (d < 26) cop.contactT += dt; else cop.contactT = 0;
    // A bust needs 0.8 s of sustained contact, not a passing brush.
    return cop.contactT >= 0.8;
  }

  function createEnemy(x, y) {
    return { x: x, y: y, hp: 3, angle: 0, shootT: 0.8 + Math.random() * 0.8, speed: 55 };
  }

  function stepEnemy(e, target, dt, bullets) {
    var dx = target.x - e.x, dy = target.y - e.y;
    var d = Math.hypot(dx, dy);
    e.angle = Math.atan2(dy, dx);
    if (d < 420 && !City.segmentBlocked(e.x, e.y, target.x, target.y)) {
      if (d > 190) {
        City.moveCircle(e, Math.cos(e.angle) * e.speed * dt, Math.sin(e.angle) * e.speed * dt, 12);
      }
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = 1.9;
        var spread = (Math.random() - 0.5) * 0.22;
        fireBullet(bullets, e.x, e.y, e.angle + spread, false, 430, 3);
      }
    }
  }

  function createPickup(kind, x, y) {
    return { kind: kind, x: x, y: y, taken: false, respawn: 0 };
  }

  function stepPickups(pickups, dt) {
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) p.taken = false;
      }
    }
  }

  function fireBullet(list, x, y, angle, friendly, speed, damage) {
    list.push({
      x: x, y: y, px: x, py: y, angle: angle,
      speed: speed || 720, friendly: !!friendly,
      damage: damage || 1, life: 0.9
    });
  }

  function segHitsCircle(x1, y1, x2, y2, cx, cy, r) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = 0;
    if (len2 > 0) {
      t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    var nx = x1 + dx * t, ny = y1 + dy * t;
    var ddx = cx - nx, ddy = cy - ny;
    return ddx * ddx + ddy * ddy < r * r;
  }

  // Segment-based hits: a bullet is tested along the whole segment it
  // travels in one frame, so it cannot tunnel past a target at low
  // headless frame rates.
  function stepBullets(list, player, enemies, cops, dt, onPlayerHit, onEnemyHit, onCopHit) {
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      b.px = b.x; b.py = b.y;
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      var dead = b.life <= 0;
      if (!dead && City.segmentBlocked(b.px, b.py, b.x, b.y)) dead = true;
      if (!dead && b.friendly) {
        for (var e = 0; e < enemies.length; e++) {
          var en = enemies[e];
          if (segHitsCircle(b.px, b.py, b.x, b.y, en.x, en.y, 18)) {
            en.hp -= b.damage;
            onEnemyHit(en);
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (var c = 0; c < cops.length; c++) {
            var cop = cops[c];
            if (segHitsCircle(b.px, b.py, b.x, b.y, cop.x, cop.y, 18)) {
              cop.hp -= b.damage;
              onCopHit(cop);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && !b.friendly && player) {
        if (segHitsCircle(b.px, b.py, b.x, b.y, player.x, player.y, 16)) {
          onPlayerHit(b.damage);
          dead = true;
        }
      }
      if (dead) list.splice(i, 1);
    }
  }

  window.SBEntities = {
    CAR_TYPES: CAR_TYPES,
    createCar: createCar,
    stepCarPhysics: stepCarPhysics,
    separateCars: separateCars,
    shoveCar: shoveCar,
    createPedestrian: createPedestrian,
    pedTarget: pedTarget,
    stepPedestrian: stepPedestrian,
    fleeFrom: fleeFrom,
    createTrafficCar: createTrafficCar,
    stepTraffic: stepTraffic,
    createPatrol: createPatrol,
    stepPatrol: stepPatrol,
    createFootCop: createFootCop,
    stepFootCop: stepFootCop,
    createEnemy: createEnemy,
    stepEnemy: stepEnemy,
    createPickup: createPickup,
    stepPickups: stepPickups,
    fireBullet: fireBullet,
    stepBullets: stepBullets,
    normAngle: normAngle
  };
})();
