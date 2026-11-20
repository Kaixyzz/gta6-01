// Entities for SOLARA BAY: cars, traffic, pedestrians, police, enemies, bullets.
// Steering rule (proven fix): 'd' ALWAYS turns clockwise and 'a' ALWAYS turns
// counter-clockwise, whatever the sign of speed — never flip by Math.sign(speed).
import { clamp, dist, normAngle, angleTo } from './rng.js';
import { moveCircle, findOpenSpot, lineOfSight, isOnRoad, AVENUES, STREETS } from './city.js';

export const CAR_TYPES = {
  sedan:   { maxSpeed: 285, accel: 320, turnRate: 3.2, w: 46, h: 22, color: '#e74c3c' },
  sports:  { maxSpeed: 340, accel: 420, turnRate: 3.4, w: 46, h: 22, color: '#f1c40f' },
  truck:   { maxSpeed: 240, accel: 260, turnRate: 2.6, w: 54, h: 26, color: '#3498db' },
  bike:    { maxSpeed: 320, accel: 380, turnRate: 3.6, w: 34, h: 16, color: '#9b59b6' },
  patrol:  { maxSpeed: 280, accel: 360, turnRate: 3.2, w: 46, h: 22, color: '#2c3e50' },
};

export function makeCar(type, x, y, angle = 0, opts = {}) {
  const t = CAR_TYPES[type];
  return {
    kind: 'car', type, x, y, angle, speed: 0,
    maxSpeed: t.maxSpeed, accel: t.accel, turnRate: t.turnRate,
    w: t.w, h: t.h, color: opts.color || t.color,
    parked: !!opts.parked, boss: !!opts.boss, id: opts.id || 0,
  };
}

// input: {up, down, left, right} — left = 'a', right = 'd'.
// 'd' always clockwise, 'a' always counter-clockwise; speed sign never flips it.
export function stepCarPhysics(car, input, dt, city) {
  if (input.up) car.speed += car.accel * dt;
  if (input.down) car.speed -= car.accel * 0.85 * dt;
  // Mild rolling drag only when no throttle.
  if (!input.up && !input.down) car.speed *= Math.max(0, 1 - 0.9 * dt);
  car.speed = clamp(car.speed, -130, car.maxSpeed);
  const grip = Math.min(1, Math.abs(car.speed) / 60);
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.angle += turn * car.turnRate * grip * dt;
  car.angle = normAngle(car.angle);
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const p = moveCircle(city, car.x, car.y, dx, dy, 16);
  const moved = Math.hypot(p.x - car.x, p.y - car.y);
  const wanted = Math.hypot(dx, dy);
  if (wanted > 1 && moved < wanted * 0.25) car.speed *= 0.5; // hit a wall: scrub speed
  car.x = p.x;
  car.y = p.y;
}

// Push overlapping cars apart through collision-checked movement.
// Building-aware: neither car is ever shoved into a building. No per-frame
// speed damping here (the old damping grounded both cars to a dead stop).
export function separateCars(cars, city) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 34;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const pa = moveCircle(city, a.x, a.y, -nx * push, -ny * push, 16);
        const pb = moveCircle(city, b.x, b.y, nx * push, ny * push, 16);
        a.x = pa.x; a.y = pa.y;
        b.x = pb.x; b.y = pb.y;
        // Safety net: if still overlapping (wedged against a wall), snap to open ground.
        if (dist(a.x, a.y, b.x, b.y) < min - 4) {
          const s = findOpenSpot(city, b.x + nx * 40, b.y + ny * 40);
          b.x = s.x; b.y = s.y;
        }
      }
    }
  }
}

// ---- Traffic: civilian cars cruising the road grid. ----
export function makeTrafficCar(id, x, y, angle, rng) {
  const car = makeCar(rng.pick(['sedan', 'sedan', 'truck', 'bike']), x, y, angle, { id });
  car.cruise = rng.range(110, 160);
  car.dir = angle;
  return car;
}

export function stepTraffic(car, dt, city, cars, rng) {
  // Pick a new heading at intersections.
  const nearX = AVENUES.some((ax) => Math.abs(car.x - ax) < 26);
  const nearY = STREETS.some((sy) => Math.abs(car.y - sy) < 26);
  if (nearX && nearY && rng.chance(dt * 0.9)) {
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    car.dir = options[Math.floor(rng.next() * options.length)];
  }
  // Do not drive into the car ahead.
  let blocked = false;
  for (const o of cars) {
    if (o === car) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 64) {
      const a = angleTo(car.x, car.y, o.x, o.y);
      if (Math.abs(normAngle(a - car.dir)) < 0.9) { blocked = true; break; }
    }
  }
  const target = blocked ? 0 : car.cruise;
  car.speed += (target - car.speed) * Math.min(1, 2.5 * dt);
  const diff = normAngle(car.dir - car.angle);
  car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
  const p = moveCircle(city, car.x, car.y, Math.cos(car.angle) * car.speed * dt, Math.sin(car.angle) * car.speed * dt, 16);
  car.x = p.x;
  car.y = p.y;
  // Recycle cars that drift far off the grid edges back onto a road.
  if (car.x < 60 || car.x > 2500 || car.y < 60 || car.y > 1700) {
    car.dir += Math.PI;
    car.angle = car.dir;
  }
}

// ---- Pedestrians: walk the sidewalks, flee gunfire. ----
export function makePedestrian(x, y, rng) {
  return {
    kind: 'ped', x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 46),
    state: 'walk',
    fleeT: 0,
    hue: rng.pick(['#ff8fa3', '#8fd3ff', '#ffe08a', '#b5ff8a', '#e0aaff']),
    taxi: false,
  };
}

export function stepPedestrian(p, dt, city, danger, rng) {
  if (danger) {
    const d = dist(p.x, p.y, danger.x, danger.y);
    if (d < 320) { p.state = 'flee'; p.fleeT = 2.5; }
  }
  if (p.state === 'flee') {
    p.fleeT -= dt;
    if (p.fleeT <= 0) p.state = 'walk';
    // The danger point lives for one frame only; keep running the same way
    // once it is gone instead of reading a null point.
    const a = danger ? angleTo(danger.x, danger.y, p.x, p.y) : p.angle;
    p.angle = a;
    const s = 95;
    const q = moveCircle(city, p.x, p.y, Math.cos(a) * s * dt, Math.sin(a) * s * dt, 10);
    p.x = q.x; p.y = q.y;
    return;
  }
  if (p.state === 'wait') return; // taxi customer stands at the curb
  // Stroll along the nearest road, on the sidewalk lane.
  if (rng.chance(dt * 0.12)) p.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(rng.next() * 4)];
  const q = moveCircle(city, p.x, p.y, Math.cos(p.angle) * p.speed * dt, Math.sin(p.angle) * p.speed * dt, 10);
  p.x = q.x; p.y = q.y;
}

// ---- Foot police: chase on foot, bust after 0.8 s sustained contact. ----
export function makeFootCop(x, y) {
  return { kind: 'cop', x, y, hp: 3, speed: 185, grace: 3, contact: 0, angle: 0 };
}

export function stepFootCop(cop, dt, city, px, py, playerInCar) {
  if (cop.grace > 0) {
    cop.grace -= dt;
    return 'grace';
  }
  const d = dist(cop.x, cop.y, px, py);
  const a = angleTo(cop.x, cop.y, px, py);
  cop.angle = a;
  if (d > 26) {
    const q = moveCircle(city, cop.x, cop.y, Math.cos(a) * cop.speed * dt, Math.sin(a) * cop.speed * dt, 12);
    cop.x = q.x; cop.y = q.y;
  }
  if (!playerInCar && d < 24) {
    cop.contact += dt;
    if (cop.contact >= 0.8) return 'busted';
  } else {
    cop.contact = Math.max(0, cop.contact - dt * 2);
  }
  return 'chasing';
}

// ---- Patrol cars: chase the player's car and ram it. ----
export function makePatrolCar(x, y, angle = 0) {
  const car = makeCar('patrol', x, y, angle, { color: '#1f2d3d' });
  return car;
}

export function stepPatrol(car, dt, city, px, py, playerInCar) {
  const d = dist(car.x, car.y, px, py);
  const want = angleTo(car.x, car.y, px, py);
  const diff = normAngle(want - car.angle);
  const input = { up: false, down: false, left: false, right: false };
  if (playerInCar) {
    input.up = true;
    if (diff > 0.4) input.right = true;
    else if (diff < -0.4) input.left = true;
  } else {
    // Player on foot: close in but hold off at ~130 px, do not run them over.
    if (d > 150) input.up = true;
    if (diff > 0.4) input.right = true;
    else if (diff < -0.4) input.left = true;
  }
  stepCarPhysics(car, input, dt, city);
}

// ---- Enemies (gang / guards): shoot with line of sight, advance when blind. ----
export function makeEnemy(x, y, kind) {
  return {
    kind, x, y, hp: 3, angle: 0, speed: 120,
    fireTimer: 1.2, lastSeen: { x, y }, spread: 0.22,
  };
}

export function stepEnemy(e, dt, city, px, py) {
  const d = dist(e.x, e.y, px, py);
  const seen = d < 480 && lineOfSight(city, e.x, e.y, px, py);
  if (seen) {
    e.lastSeen = { x: px, y: py };
    e.angle = angleTo(e.x, e.y, px, py);
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && d < 430) {
      e.fireTimer = 1.9;
      return 'shoot';
    }
    return 'hold';
  }
  // No line of sight: advance toward the player's last known position
  // instead of standing behind cover forever (the player could otherwise
  // shoot a guard behind the bank for the whole mission).
  const a = angleTo(e.x, e.y, e.lastSeen.x, e.lastSeen.y);
  e.angle = a;
  const ld = dist(e.x, e.y, e.lastSeen.x, e.lastSeen.y);
  if (ld > 30) {
    const q = moveCircle(city, e.x, e.y, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt, 12);
    e.x = q.x; e.y = q.y;
  }
  e.fireTimer = Math.max(0.4, e.fireTimer - dt);
  return 'advance';
}

// ---- Bullets: segment-based hits, no tunneling at low headless fps. ----
export function makeBullet(x, y, angle, speed, from, damage) {
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, from, damage, life: 1.6 };
}

export function stepBullets(bullets, dt, city, player, enemies, cops) {
  const events = [];
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    let dead = b.life <= 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 10));
    for (let s = 0; s < steps && !dead; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (b.x < 0 || b.x > 2560 || b.y < 0 || b.y > 1920 || cityPointBlocked(city, b.x, b.y)) {
        events.push({ type: 'impact', x: b.x, y: b.y });
        dead = true;
        break;
      }
      if (b.from === 'player') {
        for (const e of enemies) {
          if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < 16) {
            e.hp -= b.damage;
            events.push({ type: 'hit-enemy', enemy: e, x: b.x, y: b.y });
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const c of cops) {
            if (c.hp > 0 && dist(b.x, b.y, c.x, c.y) < 16) {
              c.hp -= b.damage;
              events.push({ type: 'hit-cop', cop: c, x: b.x, y: b.y });
              dead = true;
              break;
            }
          }
        }
      } else if (b.from === 'enemy') {
        if (!player.inCar && dist(b.x, b.y, player.x, player.y) < 15) {
          player.hp -= b.damage;
          events.push({ type: 'hit-player', x: b.x, y: b.y, damage: b.damage });
          dead = true;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
  return events;
}

function cityPointBlocked(city, x, y) {
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
