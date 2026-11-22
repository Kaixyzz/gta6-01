// Entities and physics for SOLARA BAY.
// Steering rule (proven in rebuild #16): 'd' ALWAYS turns clockwise and
// 'a' ALWAYS turns counter-clockwise, whatever the sign of speed. Never
// flip the turn by Math.sign(speed) — that made the car oscillate around
// a target behind it and never arrive.
import { RNG } from './rng.js';

export function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const CAR_TYPES = {
  sedan: { maxSpeed: 285, accel: 210, turn: 2.6, w: 46, h: 24, color: '#e8b23a', tough: 1 },
  bike: { maxSpeed: 330, accel: 260, turn: 3.4, w: 34, h: 14, color: '#e84a4a', tough: 0.6 },
  truck: { maxSpeed: 210, accel: 150, turn: 2.0, w: 58, h: 28, color: '#4a7de8', tough: 1.8 },
  sports: { maxSpeed: 340, accel: 280, turn: 3.0, w: 46, h: 24, color: '#d21f5e', tough: 1 },
  patrol: { maxSpeed: 280, accel: 230, turn: 2.7, w: 46, h: 24, color: '#20242e', tough: 1.2 },
};

export function makeCar(x, y, type, angle) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    x, y, angle: angle || 0, speed: 0, type,
    maxSpeed: t.maxSpeed, accel: t.accel, turnRate: t.turn,
    w: t.w, h: t.h, color: t.color, tough: t.tough,
    condition: 100, parked: true, locked: false, skid: 0,
  };
}

// Move a car one step with collision-checked sliding. Returns true if it hit something.
export function stepCarPhysics(car, input, dt, city) {
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  // Steering never flips with speed: d is always clockwise.
  car.angle = normAngle(car.angle + turn * car.turnRate * dt * Math.min(1, 0.35 + Math.abs(car.speed) / 120));
  if (input.up) car.speed += car.accel * dt;
  if (input.down) car.speed -= car.accel * 0.9 * dt;
  if (!input.up && !input.down) car.speed *= Math.max(0, 1 - 1.4 * dt);
  const maxF = car.maxSpeed;
  const maxR = -car.maxSpeed * 0.45;
  if (car.speed > maxF) car.speed = maxF;
  if (car.speed < maxR) car.speed = maxR;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const r = Math.max(car.w, car.h) / 2 - 4;
  let hit = false;
  const nx = car.x + dx;
  if (city.inBounds(nx, car.y) && !city.hitsBuilding(nx, car.y, r) && !city.isWater(nx, car.y)) {
    car.x = nx;
  } else {
    car.speed *= 0.55;
    hit = true;
  }
  const ny = car.y + dy;
  if (city.inBounds(car.x, ny) && !city.hitsBuilding(car.x, ny, r) && !city.isWater(car.x, ny)) {
    car.y = ny;
  } else {
    car.speed *= 0.55;
    hit = true;
  }
  if (Math.abs(turn) > 0 && Math.abs(car.speed) > 120) car.skid = 0.25;
  else car.skid = Math.max(0, car.skid - dt);
  return hit;
}

// Push overlapping cars apart through collision-checked movement.
// No per-frame speed damping here: damping grounded cars to a dead stop.
export function separateCars(cars, city) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minD = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2 - 6;
      if (dist >= minD) continue;
      if (dist < 0.01) {
        // two cars on the exact same point: push along a fixed axis
        dx = 1; dy = 0; dist = 1;
      }
      const ux = dx / dist;
      const uy = dy / dist;
      const push = (minD - dist) / 2 + 1;
      const ax = a.x - ux * push;
      const ay = a.y - uy * push;
      const bx = b.x + ux * push;
      const by = b.y + uy * push;
      const r = 20;
      if (city.inBounds(ax, ay) && !city.hitsBuilding(ax, ay, r) && !city.isWater(ax, ay)) {
        a.x = ax; a.y = ay;
      }
      if (city.inBounds(bx, by) && !city.hitsBuilding(bx, by, r) && !city.isWater(bx, by)) {
        b.x = bx; b.y = by;
      }
    }
  }
}

export function makePedestrian(rng, city) {
  // pedestrians walk on sidewalks beside roads
  const onAvenue = rng.chance(0.5);
  let x, y;
  if (onAvenue) {
    x = rng.pick(city.avenues) + rng.pick([-58, 58]);
    y = rng.range(80, city.height - 80);
  } else {
    x = rng.range(80, city.width - 80);
    y = rng.pick(city.streets) + rng.pick([-58, 58]);
  }
  if (city.hitsBuilding(x, y, 12) || city.isWater(x, y)) {
    const s = city.findOpenSpot(x, y);
    x = s.x; y = s.y;
  }
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(28, 52),
    color: rng.pick(['#e8e8e8', '#ffd23e', '#3ec6ff', '#ff9f1c', '#c77dff', '#7dff5e']),
    fleeX: 0, fleeY: 0, fleeing: false, taxi: false, wait: rng.range(0, 4),
  };
}

export function stepPedestrian(p, dt, city, danger) {
  // danger: {x, y} or null. A fleeing ped keeps its current flee direction
  // when danger is gone (never read a null danger).
  if (danger) {
    const d = Math.hypot(p.x - danger.x, p.y - danger.y);
    if (d < 180) {
      p.fleeing = true;
      const a = Math.atan2(p.y - danger.y, p.x - danger.x);
      p.fleeX = Math.cos(a);
      p.fleeY = Math.sin(a);
    }
  }
  if (p.fleeing) {
    const nx = p.x + p.fleeX * 95 * dt;
    const ny = p.y + p.fleeY * 95 * dt;
    if (city.inBounds(nx, ny) && !city.hitsBuilding(nx, ny, 10) && !city.isWater(nx, ny)) {
      p.x = nx; p.y = ny;
    } else {
      p.fleeX = -p.fleeX; p.fleeY = -p.fleeY;
    }
    if (!danger) p.fleeing = false;
    return;
  }
  p.wait -= dt;
  if (p.wait > 0) return;
  const nx = p.x + Math.cos(p.angle) * p.speed * dt;
  const ny = p.y + Math.sin(p.angle) * p.speed * dt;
  if (city.inBounds(nx, ny) && !city.hitsBuilding(nx, ny, 10) && !city.isWater(nx, ny) && city.onRoad(nx, ny) === false) {
    p.x = nx; p.y = ny;
  } else {
    p.angle = Math.atan2(-Math.sin(p.angle), -Math.cos(p.angle)) + (Math.random() - 0.5);
    p.wait = 0.5 + Math.random() * 1.5;
  }
  if (Math.random() < dt * 0.1) p.angle += (Math.random() - 0.5) * 1.2;
}

export function makeFootCop(x, y) {
  return { x, y, hp: 3, speed: 185, grace: 3, bustTime: 0, angle: 0 };
}

export function makeEnemy(x, y, kind) {
  return { x, y, hp: 3, kind: kind || 'gang', fireAt: 1 + Math.random(), angle: 0, speed: 42 };
}

export function makePickup(x, y, kind) {
  return { x, y, kind, respawnAt: 0, taken: false };
}

export function makeHelicopter(x, y) {
  return { x, y, angle: 0, rotor: 0 };
}

// Segment-based bullet hit test: a fast bullet must not tunnel past a
// target between frames. Returns the hit fraction along the segment, or -1.
export function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2));
  const px = x0 + dx * t;
  const py = y0 + dy * t;
  const d = Math.hypot(cx - px, cy - py);
  return d <= r ? t : -1;
}

export function lineOfSight(city, x0, y0, x1, y1) {
  // sample the segment; blocked if any sample point is inside a building
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (city.hitsBuilding(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2)) return false;
  }
  return true;
}
