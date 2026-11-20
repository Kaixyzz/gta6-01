// Entities for SOLARA BAY: cars, pedestrians, police, enemies, bullets,
// pickups, particles and skid marks. Each factory returns a plain object;
// the update functions live here too so game.js stays readable.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;

  const CAR_STATS = {
    sedan: { top: 330, accel: 260, turn: 2.6, grip: 0.94, len: 46, wid: 22 },
    sports: { top: 385, accel: 320, turn: 3.0, grip: 0.96, len: 46, wid: 22 },
    bike: { top: 405, accel: 340, turn: 3.4, grip: 0.88, len: 38, wid: 14 },
    truck: { top: 235, accel: 170, turn: 2.0, grip: 0.97, len: 62, wid: 26 },
  };

  function makeCar(def) {
    const st = CAR_STATS[def.type] || CAR_STATS.sedan;
    return {
      x: def.x, y: def.y, angle: def.angle || 0,
      speed: 0, type: def.type, color: def.color,
      parked: !!def.parked, boss: !!def.boss,
      top: st.top, accel: st.accel, turn: st.turn, grip: st.grip,
      len: st.len, wid: st.wid, skidT: 0,
    };
  }

  function makePed(def) {
    return {
      x: def.x, y: def.y, angle: def.angle, speed: def.speed,
      shirt: def.shirt, down: false, downT: 0, fleeT: 0, wanderT: 0,
    };
  }

  function makeCop(x, y, patrol) {
    if (patrol) {
      const c = makeCar({ x: x, y: y, angle: 0, type: 'sedan', color: '#1a1a2e', parked: false });
      c.patrol = true;
      c.speed = 0;
      return c;
    }
    return { x: x, y: y, angle: 0, speed: 95, touchT: 0, foot: true };
  }

  function makeEnemy(x, y) {
    return { x: x, y: y, angle: 0, hp: 3, speed: 105, shootT: 1 + Math.random() * 0.8, strafe: Math.random() < 0.5 ? 1 : -1 };
  }

  function makePickup(x, y, kind) {
    return { x: x, y: y, kind: kind };
  }

  function makeBullet(x, y, angle, speed, from) {
    return { x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, from: from, life: 0.9, dmg: from === 'enemy' ? 3 : 1 };
  }

  function makeParticle(x, y, vx, vy, life, color, size) {
    return { x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, color: color, size: size };
  }

  // Arcade car physics: accelerate / brake / reverse, steering that bites
  // harder at speed, and a little lateral slip so hard turns leave marks.
  // Returns true when the car scraped something (for shake + sound).
  function driveCar(car, input, dt, city) {
    const st = car;
    const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    let lat = 0;
    if (input.up) st.speed += st.accel * dt;
    if (input.down) st.speed -= (st.speed > 5 ? 320 : 190) * dt;
    if (!input.up && !input.down) st.speed -= Math.sign(st.speed) * 140 * dt;
    if (Math.abs(st.speed) < 4 && !input.up && !input.down) st.speed = 0;
    st.speed = Math.max(-st.top * 0.45, Math.min(st.top, st.speed));
    const spd = Math.abs(st.speed);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (steer !== 0 && spd > 1) {
      const dir = st.speed >= 0 ? 1 : -1;
      car.angle += steer * st.turn * dt * dir * Math.min(1, spd / 120);
    }
    // Velocity follows the heading, with a slip factor for drift feel.
    const vx = forward.x * st.speed;
    const vy = forward.y * st.speed;
    const px = car.x, py = car.y;
    car.x += vx * dt;
    car.y += vy * dt;
    lat = Math.abs((car.x - px) * -Math.sin(car.angle) + (car.y - py) * Math.cos(car.angle));
    const blocked = city.collideCircle(city.data.buildings, car, car.len * 0.42);
    if (blocked) {
      const hitSpeed = Math.abs(st.speed);
      st.speed *= 0.35;
      if (hitSpeed > 120) return { scraped: true, hard: hitSpeed > 260, lat: lat };
      return { scraped: true, hard: false, lat: lat };
    }
    return { scraped: false, hard: false, lat: lat };
  }

  // A pedestrian strolls along a sidewalk; when frightened it runs away.
  function updatePed(p, dt, player, city, rng) {
    if (p.down) {
      p.downT -= dt;
      return;
    }
    p.wanderT -= dt;
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      const dx = p.x - player.x, dy = p.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      p.angle = Math.atan2(dy / d, dx / d);
      const sp = 210;
      p.x += Math.cos(p.angle) * sp * dt;
      p.y += Math.sin(p.angle) * sp * dt;
    } else {
      if (p.wanderT <= 0) {
        p.wanderT = 2 + rng.next() * 3;
        // Turn at random to another sidewalk direction.
        p.angle += rng.pick([-Math.PI / 2, 0, Math.PI / 2, Math.PI]);
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
    }
    city.collideCircle(city.data.buildings, p, 10);
    if (p.x < 20) p.x = 20;
    if (p.y < 20) p.y = 20;
    if (p.x > 2380) p.x = 2380;
    if (p.y > 1740) p.y = 1740;
  }

  // A foot cop runs at the player; returns true while it keeps touching.
  function updateFootCop(cop, dt, player, city) {
    const dx = player.x - cop.x, dy = player.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    cop.x += (dx / d) * cop.speed * dt;
    cop.y += (dy / d) * cop.speed * dt;
    city.collideCircle(city.data.buildings, cop, 10);
    return d < 30;
  }

  // A patrol car steers at the player's car and tries to ram it.
  function updatePatrol(car, dt, target, city) {
    const dx = target.x - car.x, dy = target.y - car.y;
    const desired = Math.atan2(dy, dx);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 2.2));
    car.speed = Math.min(295, car.speed + 240 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    city.collideCircle(city.data.buildings, car, car.len * 0.42);
    const td = Math.hypot(target.x - car.x, target.y - car.y);
    return td < 46;
  }

  // A gang member or guard walks up to shooting range, strafes, and fires.
  function updateEnemy(e, dt, player, city, rng) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);
    if (d > 210) {
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    } else {
      // Strafe sideways so the fight moves around.
      const sx = Math.cos(e.angle + Math.PI / 2) * e.strafe;
      const sy = Math.sin(e.angle + Math.PI / 2) * e.strafe;
      e.x += sx * e.speed * 0.4 * dt;
      e.y += sy * e.speed * 0.4 * dt;
      if (rng.chance(dt * 0.4)) e.strafe *= -1;
    }
    city.collideCircle(city.data.buildings, e, 11);
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 520) {
      e.shootT = 1.4 + rng.next() * 0.5;
      const spread = (rng.next() - 0.5) * 0.24;
      return makeBullet(e.x + Math.cos(e.angle) * 16, e.y + Math.sin(e.angle) * 16, e.angle + spread, 430, 'enemy');
    }
    return null;
  }

  SB.Entities = {
    CAR_STATS: CAR_STATS, makeCar: makeCar, makePed: makePed,
    makeCop: makeCop, makeEnemy: makeEnemy, makePickup: makePickup,
    makeBullet: makeBullet, makeParticle: makeParticle,
    driveCar: driveCar, updatePed: updatePed, updateFootCop: updateFootCop,
    updatePatrol: updatePatrol, updateEnemy: updateEnemy,
  };
})();
