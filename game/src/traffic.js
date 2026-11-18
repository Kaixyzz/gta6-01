// Traffic: cars that follow the road grid, keep to their lane, turn at
// intersections and slow down behind the car ahead.
import { CFG } from './config.js';
import { rand, pick } from './rng.js';
import { makeCar } from './vehicles.js';

export function makeTraffic(G, n) {
  for (let i = 0; i < n; i++) G.traffic.push(spawnTrafficCar(G));
}

export function spawnTrafficCar(G) {
  const rng = G.rng;
  const vertical = rng() < 0.5;
  const type = pick(rng, ['sedan', 'sedan', 'taxi', 'truck', 'sport']);
  const cruise = rand(rng, 170, 260);
  if (vertical) {
    const rx = pick(rng, G.city.roadsV);
    const dir = rng() < 0.5 ? 1 : -1;
    return makeCar(type, rx + dir * 42, rand(rng, 150, CFG.WORLD_H - 150), dir > 0 ? Math.PI / 2 : -Math.PI / 2, {
      isTraffic: true, axis: 'v', dir, lane: dir * 42, cruise, rng,
    });
  }
  const ry = pick(rng, G.city.roadsH);
  const dir = rng() < 0.5 ? 1 : -1;
  return makeCar(type, rand(rng, 150, CFG.BEACH_X - 150), ry + dir * 42, dir > 0 ? 0 : Math.PI, {
    isTraffic: true, axis: 'h', dir, lane: dir * 42, cruise, rng,
  });
}

function nearestCrossing(roads, pos) {
  let best = roads[0], bd = Infinity;
  for (const r of roads) {
    const d = Math.abs(pos - r);
    if (d < bd) { bd = d; best = r; }
  }
  return { at: best, d: bd };
}

export function updateTraffic(G, dt) {
  const rng = G.rng;
  for (let i = G.traffic.length - 1; i >= 0; i--) {
    const c = G.traffic[i];
    // Car ahead in the same lane? Slow down or stop.
    let targetSpeed = c.cruise;
    for (const o of G.traffic) {
      if (o === c || o.axis !== c.axis || o.dir !== c.dir) continue;
      const along = c.axis === 'v' ? (o.y - c.y) * c.dir : (o.x - c.x) * c.dir;
      const side = c.axis === 'v' ? Math.abs(o.x - c.x) : Math.abs(o.y - c.y);
      if (along > 0 && along < 95 && side < 40) { targetSpeed = 0; break; }
    }
    const p = G.player;
    if (p.inCar && p.car) {
      const along = c.axis === 'v' ? (p.car.y - c.y) * c.dir : (p.car.x - c.x) * c.dir;
      const side = c.axis === 'v' ? Math.abs(p.car.x - c.x) : Math.abs(p.car.y - c.y);
      if (along > 0 && along < 95 && side < 40) targetSpeed = 0;
    }
    c.speed += Math.sign(targetSpeed - c.speed) * 300 * dt;
    if (Math.abs(c.speed - targetSpeed) < 4) c.speed = targetSpeed;
    if (c.axis === 'v') c.y += c.speed * c.dir * dt;
    else c.x += c.speed * c.dir * dt;
    // At an intersection, sometimes turn onto the crossing road.
    const cross = c.axis === 'v'
      ? nearestCrossing(G.city.roadsH, c.y)
      : nearestCrossing(G.city.roadsV, c.x);
    const key = `${c.axis}:${cross.at}`;
    if (cross.d < 46 && c.lastTurnKey !== key && rng() < 0.45) {
      c.lastTurnKey = key;
      const ndir = rng() < 0.5 ? 1 : -1;
      if (c.axis === 'v') {
        c.axis = 'h'; c.dir = ndir;
        c.y = cross.at + ndir * 42;
        c.angle = ndir > 0 ? 0 : Math.PI;
      } else {
        c.axis = 'v'; c.dir = ndir;
        c.x = cross.at + ndir * 42;
        c.angle = ndir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    } else if (cross.d >= 120) {
      c.lastTurnKey = '';
    }
    // Off the map: respawn on a random road.
    if (c.x < 60 || c.x > CFG.BEACH_X || c.y < 60 || c.y > CFG.WORLD_H - 60) {
      G.traffic[i] = spawnTrafficCar(G);
    }
  }
}
