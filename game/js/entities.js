// entities.js — cars, traffic, pedestrians, police and the helicopter.
// Physics rules proven across rebuilds #16–#21:
//  - 'd' ALWAYS turns clockwise and 'a' ALWAYS turns counter-clockwise,
//    whatever the sign of speed (no Math.sign(speed) flip — that flip made
//    the driver oscillate ~40 px around targets for 60 s).
//  - No per-frame speed damping inside separateCars (it ground cars to a
//    dead stop they could not escape from).
import { clamp, normAngle, dist } from './rng.js';
import { AVENUES, STREETS, ROAD_HALF, collideCircle, pointInBuilding, findOpenSpot, onRoad, isWater, WORLD_W, WORLD_H } from './city.js';

export const CAR_TYPES = {
  car: { len: 46, wid: 22, accel: 520, max: 330, revMax: 140, turn: 2.8 },
  taxi: { len: 46, wid: 22, accel: 520, max: 330, revMax: 140, turn: 2.8 },
  sports: { len: 48, wid: 22, accel: 640, max: 400, revMax: 150, turn: 3.0 },
  truck: { len: 58, wid: 26, accel: 380, max: 250, revMax: 110, turn: 2.2 },
  bike: { len: 38, wid: 14, accel: 620, max: 380, revMax: 130, turn: 3.4 },
  police: { len: 46, wid: 22, accel: 560, max: 315, revMax: 140, turn: 2.9 },
};

export function makeCar(x, y, angle, type, color, opts = {}) {
  const t = CAR_TYPES[type] || CAR_TYPES.car;
  return {
    x, y, angle, speed: 0, type, color,
    len: t.len, wid: t.wid,
    condition: 100,
    parked: !!opts.parked,
    isPlayer: !!opts.isPlayer,
    isBoss: !!opts.isBoss,
    locked: !!opts.locked,
    route: opts.route || null,
    routeIdx: 0,
    target: null,
    grace: 0,
    hp: opts.hp || 0,
    flash: 0,
    skid: [],
  };
}

// Steering: 'd' always clockwise, 'a' always counter-clockwise.
// Turn authority scales with |speed| but never drops below 30% so the car
// can still pivot slowly from a standstill (the driver steers with 'd'
// alone when the heading error is moderate).
export function stepCarPhysics(car, keys, dt, world) {
  const t = CAR_TYPES[car.type] || CAR_TYPES.car;
  if (keys.has('w')) car.speed += t.accel * dt;
  if (keys.has('s')) car.speed -= t.accel * 0.9 * dt;
  if (!keys.has('w') && !keys.has('s')) car.speed *= Math.pow(0.4, dt);
  car.speed = clamp(car.speed, -t.revMax, t.max);
  if (Math.abs(car.speed) < 4 && !keys.has('w') && !keys.has('s')) car.speed = 0;
  const authority = clamp(Math.abs(car.speed) / 150, 0.3, 1);
  let turn = 0;
  if (keys.has('d')) turn += 1;
  if (keys.has('a')) turn -= 1;
  car.angle = normAngle(car.angle + turn * t.turn * authority * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = collideCircle(world, nx, ny, car.len * 0.42);
  if (Math.hypot(fixed.x - nx, fixed.y - ny) > 0.5) {
    // hit a wall: lose some speed, keep sliding along it. Scrape damage is
    // time-based (8/s), not per-frame — a per-frame -1 drained a full car
    // in ~1.5s of wall sliding and made QUICK FIX look broken.
    car.speed *= 0.6;
    if (car.isPlayer && Math.abs(car.speed) > 60 && !(car.repairShield > 0)) car.condition = Math.max(20, car.condition - 8 * dt);
  }
  car.x = fixed.x;
  car.y = fixed.y;
  if (Math.abs(car.speed) > 200 && turn !== 0) {
    car.skid.push({ x: car.x, y: car.y, a: car.angle, life: 1 });
    if (car.skid.length > 40) car.skid.shift();
  }
  for (const s of car.skid) s.life -= dt * 0.4;
  car.skid = car.skid.filter((s) => s.life > 0);
}

// Building-aware separation: push overlapping cars apart along the line
// between them, then snap any car that ended up inside a building to the
// nearest open spot. No speed damping here.
export function separateCars(cars, world, rng) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.parked && b.parked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.len + b.len) * 0.38;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        if (!a.parked) { a.x -= ux * push; a.y -= uy * push; }
        if (!b.parked) { b.x += ux * push; b.y += uy * push; }
        // a shove must never teleport a car into a building: move it back
        // through collision-checked steps instead
        if (!a.parked && pointInBuilding(world, a.x, a.y)) {
          const s = findOpenSpot(world, rng, a.x, a.y, 90);
          a.x = s.x; a.y = s.y;
        }
        if (!b.parked && pointInBuilding(world, b.x, b.y)) {
          const s = findOpenSpot(world, rng, b.x, b.y, 90);
          b.x = s.x; b.y = s.y;
        }
      }
    }
  }
}

// --- traffic ----------------------------------------------------------------
export function makeTrafficCar(world, rng) {
  // spawn on a random avenue/street, away from the marina strip
  const vertical = rng.chance(0.5);
  let x, y, angle;
  if (vertical) {
    x = rng.pick(AVENUES.filter((a) => a < 2240));
    y = rng.range(120, WORLD_H - 120);
    angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = rng.range(120, WORLD_W - 400);
    y = rng.pick(STREETS);
    angle = rng.chance(0.5) ? 0 : Math.PI;
  }
  const type = rng.pick(['car', 'car', 'car', 'taxi', 'truck', 'bike']);
  const color = rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#ecf0f1', '#1abc9c']);
  const car = makeCar(x, y, angle, type, type === 'taxi' ? '#f7c948' : color);
  car.route = randomRoute(world, rng, x, y);
  car.routeIdx = 0;
  return car;
}

function randomRoute(world, rng, x, y) {
  const pts = [];
  let cx = x;
  let cy = y;
  for (let i = 0; i < 6; i++) {
    if (rng.chance(0.5)) {
      cx = rng.pick(AVENUES.filter((a) => a < 2240));
    } else {
      cy = rng.pick(STREETS);
    }
    pts.push({ x: cx, y: cy });
  }
  return pts;
}

export function stepTraffic(car, dt, world, rng, others) {
  if (!car.route || car.routeIdx >= car.route.length) {
    car.route = randomRoute(world, rng, car.x, car.y);
    car.routeIdx = 0;
  }
  const wp = car.route[car.routeIdx];
  const d = dist(car.x, car.y, wp.x, wp.y);
  if (d < 40) {
    car.routeIdx++;
    return;
  }
  // stop if another car is right ahead
  for (const o of others) {
    if (o === car || o.parked) continue;
    const ahead = (o.x - car.x) * Math.cos(car.angle) + (o.y - car.y) * Math.sin(car.angle);
    const side = Math.abs((o.x - car.x) * -Math.sin(car.angle) + (o.y - car.y) * Math.cos(car.angle));
    if (ahead > 0 && ahead < 70 && side < 30) {
      car.speed *= Math.pow(0.05, dt);
      return;
    }
  }
  const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = normAngle(desired - car.angle);
  const keys = new Set(['w']);
  if (diff > 0.25) keys.add('d');
  else if (diff < -0.25) keys.add('a');
  stepCarPhysics(car, keys, dt, world);
  // traffic stays slow and never enters the marina strip
  if (car.speed > 150) car.speed = 150;
  if (car.x > 2260) car.x = 2260;
}

// --- pedestrians ------------------------------------------------------------
export function makePedestrian(world, rng) {
  let x, y;
  for (let i = 0; i < 20; i++) {
    const vertical = rng.chance(0.5);
    if (vertical) {
      x = rng.pick(AVENUES) + rng.pick([-1, 1]) * (ROAD_HALF + 12);
      y = rng.range(100, WORLD_H - 100);
    } else {
      x = rng.range(100, WORLD_W - 300);
      y = rng.pick(STREETS) + rng.pick([-1, 1]) * (ROAD_HALF + 12);
    }
    if (!pointInBuilding(world, x, y) && !isWater(x, y)) break;
  }
  return {
    x, y, angle: rng.next() * Math.PI * 2, speed: rng.range(38, 68),
    color: rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c', '#ff8fb2']),
    flee: null, fleeT: 0, isTaxi: false, target: null,
  };
}

export function stepPedestrian(p, dt, world, rng, danger) {
  // danger: {x, y} gunfire/crash to flee from, or null
  if (danger && dist(p.x, p.y, danger.x, danger.y) < 260) {
    const a = Math.atan2(p.y - danger.y, p.x - danger.x);
    p.flee = a;
    p.fleeT = 1.2;
  }
  let angle = p.angle;
  let speed = p.speed;
  if (p.fleeT > 0 && p.flee !== null) {
    angle = p.flee;
    speed = 130;
    p.fleeT -= dt;
  } else if (rng.chance(dt * 0.25)) {
    // amble to a nearby sidewalk point
    angle = rng.next() * Math.PI * 2;
  }
  p.angle = angle;
  const nx = p.x + Math.cos(angle) * speed * dt;
  const ny = p.y + Math.sin(angle) * speed * dt;
  if (!pointInBuilding(world, nx, ny) && !isWater(nx, ny) && nx > 30 && nx < WORLD_W - 30 && ny > 30 && ny < WORLD_H - 30) {
    p.x = nx;
    p.y = ny;
  } else {
    p.angle = angle + Math.PI / 2;
  }
  if (!onRoad(p.x, p.y)) {
    // drift back toward the nearest road so peds stay visible on sidewalks
    const ax = AVENUES.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
    const sy = STREETS.reduce((a, b) => (Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a));
    if (Math.abs(ax - p.x) < Math.abs(sy - p.y)) p.angle = Math.atan2(0, ax - p.x);
    else p.angle = Math.atan2(sy - p.y, 0);
  }
}

// --- police -----------------------------------------------------------------
export function makePatrolCar(world, rng, px, py) {
  const a = rng.next() * Math.PI * 2;
  const r = rng.range(280, 380);
  const x = clamp(px + Math.cos(a) * r, 80, WORLD_W - 350);
  const y = clamp(py + Math.sin(a) * r, 80, WORLD_H - 80);
  const car = makeCar(x, y, Math.atan2(py - y, px - x), 'police', '#ffffff');
  car.unit = rng.pick(['GULL-1', 'TIDE-3', 'PELICAN-2', 'CORAL-48', 'REEF-7', 'SURF-9']);
  car.role = 'PURSUE';
  car.ramT = 0;
  return car;
}

export function stepPatrol(car, dt, world, px, py, rng) {
  if (car.role === 'FORMATION') {
    // staged screenshot formation: drive straight ahead, keep the spread —
    // normal pursuit steering would converge all four onto the player's
    // lane, where the mission card hides them.
    stepCarPhysics(car, new Set(['w']), dt, world);
    if (car.speed > 330) car.speed = 330;
    return;
  }
  const desired = Math.atan2(py - car.y, px - car.x);
  const diff = normAngle(desired - car.angle);
  const keys = new Set(['w']);
  if (diff > 0.2) keys.add('d');
  else if (diff < -0.2) keys.add('a');
  // ram: when close and roughly aligned, surge
  const d = dist(car.x, car.y, px, py);
  if (d < 120 && Math.abs(diff) < 0.5) car.speed = Math.min(car.speed + 260 * dt, 330);
  stepCarPhysics(car, keys, dt, world);
  if (car.speed > 330) car.speed = 330;
}

export function makeFootCop(world, rng, px, py) {
  const a = rng.next() * Math.PI * 2;
  // spawn farther out and slower than the player can reach a car: the
  // chase must give the player a fair window to get into a getaway car
  // after grabbing the cash, not a near-certain bust in 2 seconds.
  const r = rng.range(380, 480);
  const x = clamp(px + Math.cos(a) * r, 80, WORLD_W - 350);
  const y = clamp(py + Math.sin(a) * r, 80, WORLD_H - 80);
  return { x, y, angle: 0, speed: 175, hp: 3, grace: 6, contact: 0, unit: 'FOOT', flash: 0 };
}

export function stepFootCop(cop, dt, world, px, py, onFoot) {
  if (cop.grace > 0) cop.grace -= dt;
  const desired = Math.atan2(py - cop.y, px - cop.x);
  cop.angle = desired;
  const fixed = collideCircle(world, cop.x + Math.cos(desired) * cop.speed * dt, cop.y + Math.sin(desired) * cop.speed * dt, 12);
  cop.x = fixed.x;
  cop.y = fixed.y;
  const d = dist(cop.x, cop.y, px, py);
  if (onFoot && cop.grace <= 0 && d < 26) {
    cop.contact += dt;
  } else {
    cop.contact = 0;
  }
  return cop.contact >= 1.2;
}

// --- helicopter ---------------------------------------------------------------
export function makeHelicopter(px, py) {
  return { x: px - 160, y: py - 200, angle: 0, rotor: 0, shadowX: px, shadowY: py };
}

export function stepHelicopter(h, dt, px, py) {
  // hover to the RIGHT of the player, slightly up: the old up-left hover
  // sat directly behind the mission card and was invisible in screenshots.
  // +120 keeps it clear of the right HUD panel too (screen x ~916).
  const tx = px + 120;
  const ty = py - 60;
  h.x += (tx - h.x) * Math.min(1, dt * 2.5);
  h.y += (ty - h.y) * Math.min(1, dt * 2.5);
  h.rotor += dt * 30;
  h.shadowX = h.x + 40;
  h.shadowY = h.y + 90;
}
