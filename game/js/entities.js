// Moving things: the player, cars, pedestrians, enemies, police.
// Everything here is plain data plus small step functions; the game loop
// in game.js owns the rules (missions, wanted, spawning).
import { pointInBuilding } from './city.js';

export const TAU = Math.PI * 2;

export function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Push a circle out of every building rectangle it overlaps. Returns
// true when a collision happened (used for crash shake and sound).
export function collideBuildings(buildings, e, r) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - cx;
    const dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * r;
        e.y = cy + (dy / d) * r;
      } else {
        // Dead centre: push out along the smallest penetration axis.
        const pl = e.x - b.x;
        const pr = b.x + b.w - e.x;
        const pt = e.y - b.y;
        const pb = b.y + b.h - e.y;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) e.x = b.x - r;
        else if (m === pr) e.x = b.x + b.w + r;
        else if (m === pt) e.y = b.y - r;
        else e.y = b.y + b.h + r;
      }
    }
  }
  return hit;
}

export function clampToWorld(e, w, h, r) {
  e.x = Math.max(r, Math.min(w - r, e.x));
  e.y = Math.max(r, Math.min(h - r, e.y));
}

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, hp: 100, ammo: 24,
    inCar: null, speed: 0, radius: 14,
  };
}

export function makeCar(x, y, kind, color, angle) {
  const dims = { car: [34, 18], bike: [26, 12], truck: [46, 20], patrol: [34, 18], sports: [36, 18] }[kind] || [34, 18];
  return {
    x, y, angle: angle || 0, speed: 0, kind, color,
    w: dims[0], h: dims[1], parked: true, traffic: false,
    driver: null, radius: 16, steer: 0, stuckT: 0,
  };
}

export function makePed(x, y, axis, dir, color) {
  return {
    x, y, axis, dir, color, speed: 42, radius: 10,
    fleeT: 0, fleeX: 0, fleeY: 0, angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
  };
}

export function makeEnemy(x, y, kind) {
  return {
    x, y, kind, hp: 3, radius: 13, angle: 0,
    shootT: 1 + Math.random() * 0.8, moveT: 0, targetAngle: 0,
  };
}

export function makeFootCop(x, y) {
  return { x, y, radius: 12, speed: 95, bustT: 0, stunT: 0, angle: 0 };
}

export function makePatrol(x, y, angle) {
  const c = makeCar(x, y, 'patrol', '#f8f9fa', angle);
  c.parked = false;
  c.driver = 'police';
  c.radius = 16;
  return c;
}

// Drive a car one step: acceleration, steering, drift. Returns true when
// the car scraped a building. Braking is deliberately strong: a car that
// has just reversed must stop quickly when the driver changes direction,
// or its leftover reverse momentum steers the nose the wrong way while it
// bleeds off and the car wobbles forever instead of turning around.
export function stepCar(car, buildings, worldW, worldH, dt, input) {
  const top = car.kind === 'bike' ? 320 : car.kind === 'truck' ? 200 : car.kind === 'sports' ? 300 : 260;
  const accel = car.kind === 'bike' ? 420 : car.kind === 'truck' ? 260 : 340;
  if (input.up) {
    // Forward while still rolling backward brakes hard first.
    car.speed += car.speed < 0 ? 700 * dt : accel * dt;
  }
  if (input.down) {
    // Backing off while rolling forward brakes hard first.
    car.speed -= car.speed > 0 ? 700 * dt : 200 * dt;
  }
  if (!input.up && !input.down) {
    // Coasting stops the car fast, so a direction change never fights
    // a long tail of reverse momentum.
    const dec = 320;
    if (Math.abs(car.speed) <= dec * dt) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * dec * dt;
  }
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;
  car.speed = Math.max(-80, Math.min(top, car.speed));
  let steerRate = 2.4 * (1 - Math.min(0.30, Math.abs(car.speed) / top * 0.30));
  // Steering stays strong at speed: a weak high-speed steer lets a small
  // drift carry the car off the road into a building face, where it then
  // scrapes instead of driving. A car that cannot correct a 15-degree
  // drift at speed is not fun to drive.
  // Reversing steers more gently: a hard reverse swing is what starts
  // the wobble, and a slow car turns tighter anyway.
  if (car.speed < 0) steerRate = Math.min(steerRate, 1.4);
  const dirSign = car.speed >= 0 ? 1 : -1;
  if (input.left) car.angle -= steerRate * dt * dirSign;
  if (input.right) car.angle += steerRate * dt * dirSign;
  car.angle = normAngle(car.angle);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  const hit = collideBuildings(buildings, car, 15);
  if (hit && Math.abs(car.speed) > 60) car.speed *= 0.45;
  clampToWorld(car, worldW, worldH, 18);
  return hit;
}

// Walk one step on foot.
export function stepWalk(p, buildings, worldW, worldH, dt, vx, vy) {
  const len = Math.hypot(vx, vy);
  if (len > 0) {
    const sp = 170;
    p.x += (vx / len) * sp * dt;
    p.y += (vy / len) * sp * dt;
    p.angle = Math.atan2(vy, vx);
  }
  collideBuildings(buildings, p, p.radius);
  clampToWorld(p, worldW, worldH, p.radius);
}

export function pointInBuildingAt(buildings, x, y) {
  return pointInBuilding(buildings, x, y);
}
