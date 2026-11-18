// Moving things: player, vehicles, pedestrians, police, enemies, bullets, pickups.
import { makeRng, pick, range, rangeInt } from './rng.js';
import { AVENUES, STREETS, onRoad, nearestIntersection, pointInBuilding, WORLD_W, WORLD_H } from './city.js';

export const VEHICLE_STATS = {
  car: { top: 340, accel: 260, turn: 2.6, drag: 1.8, hp: 100, w: 34, h: 18, color: '#e74c3c' },
  sports: { top: 430, accel: 330, turn: 2.9, drag: 1.5, hp: 100, w: 36, h: 18, color: '#f1c40f' },
  bike: { top: 400, accel: 320, turn: 3.4, drag: 1.2, hp: 70, w: 26, h: 12, color: '#9b59b6' },
  truck: { top: 250, accel: 170, turn: 2.0, drag: 2.2, hp: 220, w: 46, h: 22, color: '#5d6d7e' },
};
const TRAFFIC_COLORS = ['#3498db', '#e67e22', '#2ecc71', '#ecf0f1', '#95a5a6', '#e74c3c', '#1abc9c', '#f39c12'];

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2; // facing up
    this.hp = 100; this.maxHp = 100;
    this.ammo = 12;
    this.money = 50;
    this.car = null; // vehicle object when driving
    this.speed = 0;
    this.onFoot = true;
    this.bustTimer = 0;
    this.fireCd = 0;
    this.muzzle = 0;
  }
}

export class Vehicle {
  constructor(x, y, angle, kind, parked = true) {
    this.x = x; this.y = y; this.angle = angle;
    this.kind = kind;
    this.stats = VEHICLE_STATS[kind];
    this.speed = 0;
    this.parked = parked;
    this.color = kind === 'sports' ? '#f1c40f' : pick(makeRng((x * 31 + y * 7) | 0), TRAFFIC_COLORS);
    this.hp = this.stats.hp;
    this.skid = 0;
  }
}

export class Ped {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = rng() * Math.PI * 2;
    this.speed = range(rng, 22, 42);
    this.color = pick(rng, ['#f5c6a5', '#c68642', '#8d5524', '#ffdbac']);
    this.shirt = pick(rng, ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1']);
    this.flee = 0;
    this.retarget = 0;
  }
}

export class Enemy {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.hp = 3;
    this.kind = kind; // 'gang' | 'guard' | 'cop'
    this.speed = kind === 'cop' ? 125 : 105;
    this.shootCd = 1 + Math.random();
    this.flash = 0;
  }
}

export class Patrol {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = 0; this.speed = 0;
    this.hp = 120;
    this.flash = 0;
  }
}

export class Bullet {
  constructor(x, y, angle, fromPlayer) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 720; this.vy = Math.sin(angle) * 720;
    this.life = 0.8;
    this.fromPlayer = fromPlayer;
  }
}

export class Pickup {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind; // 'ammo' | 'health' | 'stash'
    this.bob = Math.random() * 6.28;
  }
}

export function spawnTraffic(city, count) {
  const rng = makeRng(4242);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horiz = rng() < 0.5;
    let x, y, angle;
    if (horiz) {
      y = pick(rng, STREETS);
      x = range(rng, 200, WORLD_W - 200);
      angle = rng() < 0.5 ? 0 : Math.PI;
    } else {
      x = pick(rng, AVENUES);
      y = range(rng, 200, WORLD_H - 200);
      angle = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    const v = new Vehicle(x, y, angle, 'car', false);
    v.speed = range(rng, 90, 150);
    cars.push(v);
  }
  return cars;
}

export function spawnPeds(city, count) {
  const rng = makeRng(777);
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < 400) {
    // On sidewalks next to roads, denser downtown + promenade.
    const downtown = rng() < 0.45;
    let x, y;
    if (rng() < 0.25) {
      // Promenade crowd.
      x = range(rng, 2340, 2440); y = range(rng, 200, 1800);
    } else if (downtown) {
      x = range(rng, 1300, 2100); y = range(rng, 700, 1500);
    } else {
      x = range(rng, 200, 2300); y = range(rng, 200, 1750);
    }
    if (pointInBuilding(city.buildings, x, y, 4)) continue;
    if (onRoad(x, y)) continue;
    peds.push(new Ped(x, y, rng));
  }
  return peds;
}

// --- movement helpers shared by game.js ---

export function moveOnFoot(p, keys, dt, city) {
  let dx = 0, dy = 0;
  if (keys.has('w')) dy -= 1;
  if (keys.has('s')) dy += 1;
  if (keys.has('a')) dx -= 1;
  if (keys.has('d')) dx += 1;
  if (dx === 0 && dy === 0) return;
  const len = Math.hypot(dx, dy);
  const sp = 175;
  const nx = p.x + (dx / len) * sp * dt;
  const ny = p.y + (dy / len) * sp * dt;
  if (!pointInBuilding(city.buildings, nx, p.y, 10)) p.x = nx;
  if (!pointInBuilding(city.buildings, p.x, ny, 10)) p.y = ny;
  p.x = Math.max(20, Math.min(WORLD_W - 20, p.x));
  p.y = Math.max(20, Math.min(WORLD_H - 20, p.y));
  p.angle = Math.atan2(dy, dx);
}

export function driveVehicle(v, keys, dt, city, allCars) {
  const st = v.stats;
  const turning = (keys.has('a') ? -1 : 0) + (keys.has('d') ? 1 : 0);
  if (keys.has('w')) v.speed += st.accel * dt;
  else if (keys.has('s')) v.speed -= st.accel * 0.8 * dt;
  else v.speed -= v.speed * st.drag * dt * 0.6;
  if (v.speed > st.top) v.speed = st.top;
  if (v.speed < -st.top * 0.45) v.speed = -st.top * 0.45;
  if (Math.abs(v.speed) > 20) {
    v.angle += turning * st.turn * dt * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 120);
  }
  const nx = v.x + Math.cos(v.angle) * v.speed * dt;
  const ny = v.y + Math.sin(v.angle) * v.speed * dt;
  if (nx < 24 || nx > WORLD_W - 24 || ny < 24 || ny > WORLD_H - 24) {
    v.speed *= 0.3; // hit the world edge: scrub speed instead of grinding along it
  }
  if (!pointInBuilding(city.buildings, nx, ny, 12)) {
    v.x = Math.max(24, Math.min(WORLD_W - 24, nx));
    v.y = Math.max(24, Math.min(WORLD_H - 24, ny));
  } else if (!pointInBuilding(city.buildings, nx, v.y, 12)) {
    v.x = Math.max(24, Math.min(WORLD_W - 24, nx)); // slide along the wall (x axis)
  } else if (!pointInBuilding(city.buildings, v.x, ny, 12)) {
    v.y = Math.max(24, Math.min(WORLD_H - 24, ny)); // slide along the wall (y axis)
  } else {
    v.speed *= -0.25; // cornered: bounce off the wall
    return 'wall';
  }
  // Soft car-car bump: shove the OTHER car aside (you can ram traffic),
  // slow down a little.
  for (const o of allCars) {
    if (o === v || o.parked) continue;
    const dx = v.x - o.x, dy = v.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01 && d < 34) {
      o.x -= (dx / d) * (34 - d) * 0.5;
      o.y -= (dy / d) * (34 - d) * 0.5;
      v.speed *= 0.9;
      if (Math.abs(v.speed) > 60) return 'bump';
    }
  }
  return null;
}

export function driveTraffic(v, dt, city, playerCar) {
  // Cruise along the road grid; turn at intersections; slow for cars ahead.
  const ahead = { x: v.x + Math.cos(v.angle) * 60, y: v.y + Math.sin(v.angle) * 60 };
  let blocked = false;
  if (playerCar && Math.hypot(playerCar.x - ahead.x, playerCar.y - ahead.y) < 46) blocked = true;
  const target = blocked ? 0 : 120;
  v.speed += (target - v.speed) * Math.min(1, dt * 1.5);
  const inter = nearestIntersection(v.x, v.y);
  const dInter = Math.hypot(inter.x - v.x, inter.y - v.y);
  if (dInter < 26 && Math.random() < dt * 1.2) {
    // Pick a new grid direction at the intersection.
    const opts = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    v.angle = pick(Math.random, opts);
  }
  const nx = v.x + Math.cos(v.angle) * v.speed * dt;
  const ny = v.y + Math.sin(v.angle) * v.speed * dt;
  // Stay inside the drivable city (never onto the beach/water or past the edges).
  if (nx < 60 || nx > 2340 || ny < 60 || ny > 1860) {
    v.angle += Math.PI;
    return;
  }
  if (!pointInBuilding(city.buildings, nx, ny, 14)) { v.x = nx; v.y = ny; }
  v.x = Math.max(24, Math.min(WORLD_W - 24, v.x));
  v.y = Math.max(24, Math.min(WORLD_H - 24, v.y));
}

export function updatePed(p, dt, city, danger) {
  if (danger && Math.hypot(danger.x - p.x, danger.y - p.y) < 260) p.flee = 1.2;
  p.retarget -= dt;
  if (p.flee > 0) {
    p.flee -= dt;
    // Flee away from the danger; if it is gone, keep running the same way.
    const a = danger ? Math.atan2(p.y - danger.y, p.x - danger.x) : p.angle;
    p.x += Math.cos(a) * 90 * dt;
    p.y += Math.sin(a) * 90 * dt;
  } else {
    if (p.retarget <= 0) {
      p.angle = Math.random() * Math.PI * 2;
      p.retarget = 1 + Math.random() * 2;
    }
    const nx = p.x + Math.cos(p.angle) * p.speed * dt;
    const ny = p.y + Math.sin(p.angle) * p.speed * dt;
    if (!pointInBuilding(city.buildings, nx, ny, 8) && !onRoad(nx, ny)) { p.x = nx; p.y = ny; }
    else p.angle += Math.PI / 2;
  }
  p.x = Math.max(16, Math.min(WORLD_W - 16, p.x));
  p.y = Math.max(16, Math.min(WORLD_H - 16, p.y));
}
