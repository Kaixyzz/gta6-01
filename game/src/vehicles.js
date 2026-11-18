// vehicles.js — cars in SOLARA BAY: the player's arcade car physics and the
// civilian traffic that drives the road grid. A car is a circle for collision;
// its heading and speed drive the arcade handling with a touch of drift.

import { WORLD, ROADS_V, ROADS_H, ROAD_HALF, TUNING, PALETTE } from './config.js';
import { resolveCircle } from './city.js';

let carSeq = 0;

export function makeCar(x, y, angle, color, opts = {}) {
  return {
    id: ++carSeq,
    x, y,
    angle,
    speed: 0,
    color: color || PALETTE.carColors[carSeq % PALETTE.carColors.length],
    traffic: !!opts.traffic,
    mass: opts.mass || 1,
    // Traffic state: which road it follows and which way.
    roadKind: opts.roadKind || null,
    roadIndex: opts.roadIndex || 0,
    roadDir: opts.roadDir || 1,
    lane: opts.lane || 0,
    stopped: false,
    respawnIn: 0,
  };
}

// Arcade car physics. `drive` is {throttle: -1..1, steer: -1..1}.
// Returns true when the car hit something solid this frame.
export function driveCar(car, drive, dt, city) {
  const prevX = car.x;
  const prevY = car.y;
  if (drive.throttle > 0) {
    car.speed += TUNING.carAccel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 5) car.speed -= TUNING.carBrake * dt;
    else car.speed += TUNING.carAccel * 0.55 * drive.throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = Math.max(-TUNING.carMaxReverse, Math.min(TUNING.carMaxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 170);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.angle += drive.steer * TUNING.carTurn * speedFactor * dirSign * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  resolveCircle(city, car, TUNING.carRadius);
  const hit = Math.abs(car.x - prevX) < 0.001 && Math.abs(car.y - prevY) < 0.001
    && (drive.throttle !== 0 || Math.abs(car.speed) > 30);
  if (hit) car.speed *= 0.45;
  return hit;
}

// Keep two cars apart and exchange a little speed on contact. Heavier cars
// push lighter ones aside (the player's car is the heaviest thing on the
// road, so it can shove through a police roadblock).
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = TUNING.carRadius * 2 + 2;
  if (d > 0.01 && d < min) {
    const push = min - d;
    const nx = dx / d;
    const ny = dy / d;
    const totalMass = (a.mass || 1) + (b.mass || 1);
    const aShare = (b.mass || 1) / totalMass;
    const bShare = (a.mass || 1) / totalMass;
    a.x -= nx * push * aShare;
    a.y -= ny * push * aShare;
    b.x += nx * push * bShare;
    b.y += ny * push * bShare;
    const tmp = a.speed;
    a.speed = b.speed * 0.6;
    b.speed = tmp * 0.6;
    return true;
  }
  return false;
}

// Spawn a traffic car on a random road, away from (avoidX, avoidY).
export function spawnTrafficCar(rng, avoidX, avoidY) {
  const vertical = rng.chance(0.5);
  let car;
  if (vertical) {
    const rx = rng.pick(ROADS_V);
    const y = rng.range(160, 1620);
    car = makeCar(rx + (rng.chance(0.5) ? 9 : -9), y, rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, null, {
      traffic: true, roadKind: 'v', roadIndex: ROADS_V.indexOf(rx), roadDir: rng.chance(0.5) ? 1 : -1,
    });
  } else {
    const ry = rng.pick(ROADS_H);
    const x = rng.range(160, WORLD.w - 160);
    car = makeCar(x, ry + (rng.chance(0.5) ? 9 : -9), rng.chance(0.5) ? 0 : Math.PI, null, {
      traffic: true, roadKind: 'h', roadIndex: ROADS_H.indexOf(ry), roadDir: rng.chance(0.5) ? 1 : -1,
    });
  }
  if (Math.hypot(car.x - avoidX, car.y - avoidY) < 260) {
    car.x = (car.x + 700) % (WORLD.w - 200) + 100;
    car.y = (car.y + 500) % 1500 + 100;
  }
  return car;
}

// Traffic AI: follow the road grid, turn at intersections sometimes, and
// stop for the car ahead. `cars` is every car (for the ahead check).
export function updateTrafficCar(car, cars, rng, dt) {
  const ahead = carAhead(car, cars, 62);
  if (ahead) {
    car.speed = Math.max(0, car.speed - 500 * dt);
    car.stopped = true;
  } else {
    car.stopped = false;
    car.speed += (TUNING.trafficSpeed - car.speed) * Math.min(1, dt * 1.2);
  }

  const targetAngle = car.roadKind === 'v'
    ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.roadDir > 0 ? 0 : Math.PI);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  if (rng.chance(0.02)) {
    const nearV = ROADS_V.find((rx) => Math.abs(car.x - rx) < 26);
    const nearH = ROADS_H.find((ry) => Math.abs(car.y - ry) < 26);
    if (car.roadKind === 'v' && nearH !== undefined && rng.chance(0.3)) {
      car.roadKind = 'h';
      car.roadIndex = ROADS_H.indexOf(nearH);
      car.roadDir = rng.chance(0.5) ? 1 : -1;
      car.y = nearH;
    } else if (car.roadKind === 'h' && nearV !== undefined && rng.chance(0.3)) {
      car.roadKind = 'v';
      car.roadIndex = ROADS_V.indexOf(nearV);
      car.roadDir = rng.chance(0.5) ? 1 : -1;
      car.x = nearV;
    }
  }

  // Wrap around the far edge so traffic never runs out.
  if (car.x < 60) { car.x = WORLD.w - 80; car.y = Math.max(160, Math.min(car.y, 1620)); }
  if (car.x > WORLD.w - 60) { car.x = 80; car.y = Math.max(160, Math.min(car.y, 1620)); }
  if (car.y < 60) { car.y = 1620; }
  if (car.y > 1660) { car.y = 120; }
}

function carAhead(car, cars, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < dist && side < 26) return other;
  }
  return null;
}

// A parked car the player can steal, placed on a road near a point.
export function spawnParkedCar(rng, x, y) {
  const onV = rng.chance(0.5);
  const rx = ROADS_V.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const ry = ROADS_H.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  if (onV) return makeCar(rx + 10, Math.max(160, Math.min(y, 1600)), Math.PI / 2, null, {});
  return makeCar(Math.max(160, Math.min(x, WORLD.w - 160)), ry + 10, 0, null, {});
}

export { ROAD_HALF };
