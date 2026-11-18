// Cars: types, arcade driving physics, parked-car spawning.
import { CFG } from './config.js';
import { collideCircle } from './city.js';
import { rand, pick } from './rng.js';

export const CAR_TYPES = {
  sedan: { w: 48, h: 24, accel: 430, max: 520, reverse: 200, turn: 2.7, colors: ['#d94f3d', '#4a7fb5', '#8a8f96', '#3d9970'] },
  taxi: { w: 48, h: 24, accel: 460, max: 550, reverse: 210, turn: 2.8, colors: ['#f2c230'] },
  truck: { w: 66, h: 28, accel: 300, max: 400, reverse: 160, turn: 2.0, colors: ['#7a6a55', '#5d7a55'] },
  sport: { w: 48, h: 24, accel: 640, max: 730, reverse: 230, turn: 3.1, colors: ['#e8b10e', '#c0392b', '#2471a3'] },
  police: { w: 50, h: 24, accel: 560, max: 600, reverse: 220, turn: 3.0, colors: ['#1c2733'] },
};

export function makeCar(type, x, y, angle, opts) {
  const t = CAR_TYPES[type];
  const o = opts || {};
  return {
    type,
    x, y, angle,
    speed: 0,
    w: t.w, h: t.h,
    color: o.color || pick(o.rng, t.colors),
    maxSpeed: t.max, accel: t.accel, reverse: t.reverse, turnRate: t.turn,
    parked: !!o.parked,
    owned: !!o.owned,
    gold: !!o.gold,
    isTraffic: !!o.isTraffic,
    isPatrol: !!o.isPatrol,
    driver: o.driver || null,
    axis: o.axis || 'v',
    dir: o.dir || 1,
    lane: o.lane || 0,
    cruise: o.cruise || 220,
    lastTurnKey: '',
  };
}

// Arcade driving: throttle accelerates, steering grows with speed but eases
// off at the top end so the car is not twitchy at full throttle. Movement
// is axis-separated — X first, then Y — so the car slides along walls and
// never wedges itself into a map corner.
export function driveCar(G, car, throttle, steer, dt) {
  const t = CAR_TYPES[car.type];
  if (throttle > 0) {
    car.speed += t.accel * throttle * dt;
  } else if (throttle < 0) {
    car.speed += (car.speed > 0 ? t.accel * 1.4 : t.reverse) * throttle * dt;
  } else {
    const drag = 260 * dt;
    car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
  }
  car.speed = Math.max(-t.reverse, Math.min(t.max, car.speed));
  const spd = Math.abs(car.speed);
  if (spd > 2) {
    const dirSign = car.speed >= 0 ? 1 : -1;
    const grip = Math.min(1, spd / 240) / (1 + spd / 900);
    car.angle += steer * t.turn * dirSign * grip * dt;
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x, beforeY = car.y;
  car.x = nx;
  if (collideCircle(G.city, car, 20)) {
    car.x = beforeX;
    car.speed *= 0.4;
  }
  car.y = ny;
  if (collideCircle(G.city, car, 20)) {
    car.y = beforeY;
    car.speed *= 0.4;
  }
  car.x = Math.max(20, Math.min(CFG.WATER_X - 20, car.x));
  car.y = Math.max(20, Math.min(CFG.WORLD_H - 20, car.y));
}

// Parked cars near intersections, plus the gold sport car for mission 2.
export function spawnParked(G) {
  const rng = G.rng;
  const spots = [];
  for (const rx of G.city.roadsV) {
    for (const ry of G.city.roadsH) {
      spots.push({ x: rx + 62, y: ry + 130, angle: 0 });
      spots.push({ x: rx - 62, y: ry - 130, angle: Math.PI });
    }
  }
  // Shuffle the spots with the seeded RNG.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport'];
  for (let i = 0; i < 14 && i < spots.length; i++) {
    const s = spots[i];
    const car = makeCar(pick(rng, types), s.x, s.y, s.angle, { parked: true, owned: true, rng });
    G.parked.push(car);
  }
  // The gold sport car — parked on open road, clearly marked.
  const gold = makeCar('sport', G.city.goldSpot.x + 62, G.city.goldSpot.y, 0, {
    parked: true, owned: true, gold: true, color: '#ffd700', rng,
  });
  G.parked.push(gold);
  G.goldCar = gold;
}
