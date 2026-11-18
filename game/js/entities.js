// City life: traffic cars, patrol cars, pedestrians, foot police, gang
// members, bullets and particles. Plain objects + update functions; the game
// module owns the world state and calls these each tick.

import { AVENUES, STREETS, WORLD_W, WORLD_H, circleHitsBuilding, pointInBuilding, onRoad } from './city.js';
import { range, intRange, pick, clamp, normAngle, dist } from './rng.js';

export const TRAFFIC_COLORS = ['#d94f3d', '#3d7dd9', '#e8b23a', '#7a4fd9', '#3aa655', '#d9d9d9', '#2b2b2b', '#e07a9a'];
export const PATROL_COLOR = '#1f5fd6';

function nearestRoadAxis(x, y) {
  // Returns the road (avenue x or street y) the point sits closest to.
  let bestA = null;
  let bdA = 1e18;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bdA) { bdA = d; bestA = ax; }
  }
  let bestS = null;
  let bdS = 1e18;
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bdS) { bdS = d; bestS = sy; }
  }
  return bdA <= bdS ? { kind: 'ave', at: bestA } : { kind: 'street', at: bestS };
}

function atIntersection(x, y) {
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      if (Math.abs(x - ax) < 14 && Math.abs(y - sy) < 14) return { x: ax, y: sy };
    }
  }
  return null;
}

export function makeTrafficCar(rng) {
  const axis = pick(rng, AVENUES);
  const street = pick(rng, STREETS);
  const vertical = chance01(rng);
  const car = {
    kind: 'traffic',
    x: vertical ? axis : range(rng, 200, WORLD_W - 200),
    y: vertical ? range(rng, 200, WORLD_H - 200) : street,
    angle: vertical ? (chance01(rng) ? Math.PI / 2 : -Math.PI / 2) : (chance01(rng) ? 0 : Math.PI),
    speed: range(rng, 130, 190),
    cruise: 0,
    color: pick(rng, TRAFFIC_COLORS),
    w: 34, h: 18,
    parked: false,
    stopTimer: 0,
  };
  car.cruise = car.speed;
  return car;
}

function chance01(rng) {
  return rng() < 0.5;
}

export function makeParkedCar(x, y, angle, color) {
  return {
    kind: 'parked', x, y, angle, speed: 0, cruise: 0,
    color, w: 34, h: 18, parked: true, stopTimer: 0,
  };
}

export function makePatrolCar(x, y) {
  return {
    kind: 'patrol', x, y, angle: 0, speed: 0, cruise: 380,
    color: PATROL_COLOR, w: 36, h: 19, parked: false, stopTimer: 0, ramCooldown: 0,
  };
}

export function makePed(rng) {
  const axis = nearestRoadAxis(range(rng, 150, WORLD_W - 150), range(rng, 150, WORLD_H - 150));
  let x;
  let y;
  let angle;
  if (axis.kind === 'ave') {
    x = axis.at + (chance01(rng) ? 62 : -62);
    y = range(rng, 150, WORLD_H - 150);
    angle = chance01(rng) ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = range(rng, 150, WORLD_W - 150);
    y = axis.at + (chance01(rng) ? 62 : -62);
    angle = chance01(rng) ? 0 : Math.PI;
  }
  return {
    x, y, angle, speed: range(rng, 34, 58),
    color: pick(rng, ['#e8e8e8', '#ffd166', '#7fb069', '#ef8354', '#9b7fd4', '#5fb8a6']),
    flee: 0, fx: 0, fy: 0,
  };
}

export function makeFootCop(x, y) {
  return { x, y, angle: 0, speed: 120, bustTimer: 0, hp: 99 };
}

export function makeEnemy(x, y) {
  return {
    x, y, angle: 0, hp: 3, speed: 62,
    shootTimer: range(Math.random, 0.8, 1.6),
    strafeDir: 1, strafeTimer: 0,
  };
}

export function updateTraffic(car, dt, world) {
  const inter = atIntersection(car.x, car.y);
  if (inter) {
    // At an intersection: snap to the crossing and pick a new direction.
    car.x = inter.x;
    car.y = inter.y;
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter(a => Math.abs(normAngle(a - car.angle)) > 2.4);
    car.angle = pick(Math.random, options);
  }
  // Slow down for a car ahead on the same road.
  let target = car.cruise;
  for (const other of world.cars) {
    if (other === car || other.parked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 78 && side < 26) { target = Math.min(target, 40); break; }
  }
  car.speed += clamp(target - car.speed, -260 * dt, 200 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (nx > 120 && nx < WORLD_W - 120 && ny > 120 && ny < WORLD_H - 120 && !circleHitsBuilding(world.buildings, nx, ny, 16)) {
    car.x = nx;
    car.y = ny;
  } else {
    car.angle = normAngle(car.angle + Math.PI);
  }
}

export function updatePatrol(car, dt, px, py, world, onRam) {
  const d = dist(car.x, car.y, px, py);
  const desired = Math.atan2(py - car.y, px - car.x);
  const diff = normAngle(desired - car.angle);
  car.angle = normAngle(car.angle + clamp(diff, -2.6 * dt, 2.6 * dt));
  const target = d > 60 ? car.cruise : car.cruise * 0.55;
  car.speed += clamp(target - car.speed, -320 * dt, 300 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (!circleHitsBuilding(world.buildings, nx, ny, 16) && nx > 60 && nx < WORLD_W - 60 && ny > 60 && ny < WORLD_H - 60) {
    car.x = nx;
    car.y = ny;
  } else {
    car.speed *= 0.4;
    car.angle = normAngle(car.angle + 0.9 * dt);
  }
  car.ramCooldown = Math.max(0, car.ramCooldown - dt);
  if (d < 46 && car.ramCooldown <= 0) {
    car.ramCooldown = 0.9;
    if (onRam) onRam(car);
  }
}

export function updatePed(ped, dt, world, threats) {
  if (ped.flee > 0) {
    ped.flee -= dt;
    ped.x += Math.cos(ped.angle) * 230 * dt;
    ped.y += Math.sin(ped.angle) * 230 * dt;
    ped.x = clamp(ped.x, 80, WORLD_W - 80);
    ped.y = clamp(ped.y, 80, WORLD_H - 80);
    return;
  }
  for (const t of threats) {
    if (dist(ped.x, ped.y, t.x, t.y) < 190) {
      ped.angle = Math.atan2(ped.y - t.y, ped.x - t.x);
      ped.flee = 1.4;
      return;
    }
  }
  const inter = atIntersection(ped.x, ped.y);
  if (inter) {
    ped.x = inter.x + (ped.x > inter.x ? 62 : -62);
    ped.y = inter.y;
    const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    ped.angle = pick(Math.random, options);
  }
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  if (onRoad(nx, ny, 70) && !pointInBuilding(world.buildings, nx, ny, 4)) {
    ped.x = nx;
    ped.y = ny;
  } else {
    ped.angle = normAngle(ped.angle + Math.PI / 2);
  }
}

export function updateCop(cop, dt, px, py, onFoot, world) {
  const d = dist(cop.x, cop.y, px, py);
  const desired = Math.atan2(py - cop.y, px - cop.x);
  cop.angle = desired;
  if (d > 34) {
    const nx = cop.x + Math.cos(desired) * cop.speed * dt;
    const ny = cop.y + Math.sin(desired) * cop.speed * dt;
    if (!pointInBuilding(world.buildings, nx, ny, 10)) { cop.x = nx; cop.y = ny; }
    else if (!pointInBuilding(world.buildings, cop.x + Math.cos(desired) * cop.speed * dt, cop.y, 10)) cop.x += Math.cos(desired) * cop.speed * dt;
    else if (!pointInBuilding(world.buildings, cop.x, cop.y + Math.sin(desired) * cop.speed * dt, 10)) cop.y += Math.sin(desired) * cop.speed * dt;
  }
  // Bust needs the cop to stay right on top of a player who is on foot.
  if (onFoot && d < 28) cop.bustTimer += dt;
  else cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
  return cop.bustTimer >= 3.0;
}

export function updateEnemy(e, dt, px, py, playerInCar, world, fire) {
  const d = dist(e.x, e.y, px, py);
  const desired = Math.atan2(py - e.y, px - e.x);
  e.angle = desired;
  e.strafeTimer -= dt;
  if (e.strafeTimer <= 0) {
    e.strafeDir *= -1;
    e.strafeTimer = 0.9 + Math.random() * 0.9;
  }
  let mx = 0;
  let my = 0;
  if (d > 190) {
    mx = Math.cos(desired);
    my = Math.sin(desired);
  } else if (d < 110) {
    mx = -Math.cos(desired);
    my = -Math.sin(desired);
  } else {
    mx = Math.cos(desired + Math.PI / 2) * e.strafeDir;
    my = Math.sin(desired + Math.PI / 2) * e.strafeDir;
  }
  const nx = e.x + mx * e.speed * dt;
  const ny = e.y + my * e.speed * dt;
  if (!pointInBuilding(world.buildings, nx, ny, 12) && onRoad(nx, ny, 120)) {
    e.x = nx;
    e.y = ny;
  }
  e.shootTimer -= dt;
  if (e.shootTimer <= 0 && d < 560 && !playerInCar) {
    e.shootTimer = 1.3 + Math.random() * 0.5;
    if (fire) fire(e);
  }
}

export function makeBullet(x, y, angle, speed, from, dmg) {
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.4, from, dmg };
}

export function updateBullets(bullets, dt, world, hit) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(world.buildings, b.x, b.y, 0)) dead = true;
    if (!dead && (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H)) dead = true;
    if (!dead && hit) dead = hit(b);
    if (dead) bullets.splice(i, 1);
  }
}

export function spawnParticles(list, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random() * 0.7) * (speed || 160);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, max: 0.6, color, size: 2 + Math.random() * 3 });
  }
}

export function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}
