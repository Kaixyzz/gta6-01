// The people and vehicles of Solara Bay: the player, traffic, pedestrians,
// the police (foot cops and patrol cars), the turf gang, and pickups.
// Every update takes the shared state S, so game.js stays the orchestrator.
import { POINTS, slideMove, nearestIntersection, intersectionNeighbors, isRoad, pointBlocked } from './world.js';
import { clamp, normAngle, dist } from './rng.js';

const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#95a5a6'];
const PED_COLORS = ['#e67e22', '#8e44ad', '#16a085', '#c0392b', '#2c3e50', '#d35400'];

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, hp: 100, ammo: 12,
    inCar: null, walkSpeed: 175, runSpeed: 245,
    moving: false, shooting: false, aimAngle: 0,
  };
}

export function createCar(x, y, angle, color, parked) {
  return {
    x, y, angle, speed: 0, color: color || '#e74c3c',
    parked: !!parked, driver: null, wp: null, prevWp: null, stuckTime: 0,
    lastX: x, lastY: y, backup: 0, ramCd: 0,
  };
}

export function makeTraffic(S) {
  const cars = [];
  const rng = S.rng;
  for (let i = 0; i < 11; i++) {
    const p = nearestIntersection(rng.range(320, 2240), rng.range(320, 1600));
    const car = createCar(p.x + rng.range(-30, 30), p.y + rng.range(-30, 30), rng.range(0, Math.PI * 2), rng.pick(CAR_COLORS), false);
    car.wp = rng.pick(intersectionNeighbors(p));
    car.prevWp = p;
    cars.push(car);
  }
  // Parked cars sit in the middle of a road, facing along it, so a stolen
  // car can always drive away cleanly without turning into a building.
  const parkedSpots = [
    { x: 448, y: 1600, a: 0 }, { x: 560, y: 1600, a: 0 }, { x: 640, y: 320, a: 0 },
    { x: 960, y: 1280, a: 0 }, { x: 1600, y: 320, a: 0 }, { x: 2240, y: 960, a: 0 },
  ];
  for (const s of parkedSpots) {
    cars.push(createCar(s.x, s.y, s.a, rng.pick(CAR_COLORS), true));
  }
  return cars;
}

export function makePeds(S) {
  const peds = [];
  for (let i = 0; i < 22; i++) {
    const x = S.rng.range(200, 2400);
    const y = S.rng.range(200, 1750);
    peds.push({ x, y, tx: x, ty: y, speed: S.rng.range(38, 62), color: S.rng.pick(PED_COLORS), down: 0, flee: 0 });
  }
  return peds;
}

export function makePickups() {
  return [
    { x: POINTS.ammoGarage.x, y: POINTS.ammoGarage.y, kind: 'ammo', active: true, respawn: 0 },
    { x: POINTS.ammoCross.x, y: POINTS.ammoCross.y, kind: 'ammo', active: true, respawn: 0 },
    { x: POINTS.healthPost.x, y: POINTS.healthPost.y, kind: 'health', active: true, respawn: 0 },
  ];
}

// Arcade car physics: throttle accelerates along the heading, steering turns
// harder the faster the car goes, and walls slide the car instead of stopping it.
export function driveCar(world, car, dt, throttle, steer, maxSpeed) {
  const accel = 320;
  car.speed += throttle * accel * dt;
  if (throttle === 0) car.speed *= Math.pow(0.35, dt);
  car.speed = clamp(car.speed, -150, maxSpeed);
  const grip = clamp(Math.abs(car.speed) / 130, 0, 1);
  // Steering tightens at low speed and calms down at high speed, so the car
  // stays controllable on the road instead of weaving off it.
  const highSpeed = clamp(Math.abs(car.speed) / 430, 0, 1);
  const turnRate = 2.5 * grip * (1 - 0.55 * highSpeed);
  car.angle += steer * turnRate * (car.speed >= 0 ? 1 : -1) * dt;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const res = slideMove(world, car.x, car.y, dx, dy, 15);
  if (res.hit && Math.abs(car.speed) > 60) car.speed *= -0.22;
  car.x = res.x;
  car.y = res.y;
}

function carAhead(S, car, range) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const o of S.traffic) {
    if (o === car || o.driver === 'player') continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < range && d > 1) {
      const dot = (dx * hx + dy * hy) / d;
      if (dot > 0.82) return true;
    }
  }
  const p = S.player;
  if (p.inCar && p.inCar !== car) {
    const dx = p.inCar.x - car.x;
    const dy = p.inCar.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < range && d > 1 && (dx * hx + dy * hy) / d > 0.82) return true;
  }
  return false;
}

export function updateTraffic(S, dt) {
  for (const c of S.traffic) {
    if (c.driver === 'player' || c.parked) continue;
    const t = c.wp;
    if (!t) {
      const p = nearestIntersection(c.x, c.y);
      c.wp = S.rng.pick(intersectionNeighbors(p));
      c.prevWp = p;
      continue;
    }
    const d = dist(c.x, c.y, t.x, t.y);
    if (d < 30) {
      const next = intersectionNeighbors(t).filter((n) => !(c.prevWp && n.x === c.prevWp.x && n.y === c.prevWp.y));
      c.prevWp = t;
      c.wp = next.length ? S.rng.pick(next) : S.rng.pick(intersectionNeighbors(t));
      continue;
    }
    const want = Math.atan2(t.y - c.y, t.x - c.x);
    const steer = clamp(normAngle(want - c.angle) * 1.8, -1, 1);
    const throttle = carAhead(S, c, 78) ? 0 : 0.55;
    driveCar(S.world, c, dt, throttle, steer, 150);
  }
}

export function updatePeds(S, dt) {
  for (const p of S.peds) {
    if (p.down > 0) {
      p.down -= dt;
      if (p.down <= 0) {
        p.x = S.rng.range(200, 2400);
        p.y = S.rng.range(200, 1750);
        p.tx = p.x;
        p.ty = p.y;
      }
      continue;
    }
    if (p.flee > 0) {
      p.flee -= dt;
      p.speed = 130;
    } else {
      p.speed = 52;
    }
    const d = dist(p.x, p.y, p.tx, p.ty);
    if (d < 12) {
      const nx = p.x + S.rng.range(-260, 260);
      const ny = p.y + S.rng.range(-260, 260);
      p.tx = clamp(nx, 120, 2440);
      p.ty = clamp(ny, 120, 1800);
      continue;
    }
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    const res = slideMove(S.world, p.x, p.y, Math.cos(a) * p.speed * dt, Math.sin(a) * p.speed * dt, 8);
    p.x = res.x;
    p.y = res.y;
    // A fast car hitting a pedestrian knocks them down and raises wanted.
    const pc = S.player.inCar;
    if (pc && Math.abs(pc.speed) > 150 && dist(p.x, p.y, pc.x, pc.y) < 26) {
      p.down = 2.5;
      p.flee = 0;
      S.addWanted(1);
      S.audio.crash();
    }
  }
}

function spawnCop(S) {
  const st = POINTS.policeStation;
  S.cops.push({ x: st.x + S.rng.range(-40, 40), y: st.y + S.rng.range(-40, 40), bust: 0, returning: false });
}

function spawnPatrol(S) {
  const st = POINTS.policeStation;
  const car = createCar(st.x + S.rng.range(-60, 60), st.y + S.rng.range(-60, 60), S.rng.range(0, Math.PI * 2), '#222831', false);
  car.driver = 'police';
  S.patrol.push(car);
}

export function updatePolice(S, dt) {
  const p = S.player;
  // No police heat during the turf war: it is the gang's fight.
  if (S.missionIndex !== 2) {
    if (S.wanted >= 1 && S.cops.length < Math.min(3, S.wanted + 1)) spawnCop(S);
    if (S.wanted >= 2 && S.patrol.length < Math.min(3, S.wanted)) spawnPatrol(S);
  }

  for (const cop of S.cops) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.inCar) {
      // A foot cop can never catch a car: they stop, and walk off once far away.
      cop.bust = 0;
      if (d > 700) cop.returning = true;
      if (cop.returning) {
        const a = Math.atan2(POINTS.policeStation.y - cop.y, POINTS.policeStation.x - cop.x);
        const res = slideMove(S.world, cop.x, cop.y, Math.cos(a) * 150 * dt, Math.sin(a) * 150 * dt, 8);
        cop.x = res.x;
        cop.y = res.y;
      }
      continue;
    }
    cop.returning = false;
    if (d < 400) {
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      const res = slideMove(S.world, cop.x, cop.y, Math.cos(a) * 185 * dt, Math.sin(a) * 185 * dt, 8);
      cop.x = res.x;
      cop.y = res.y;
    }
    if (d < 30) {
      cop.bust += dt;
      if (cop.bust >= 1.2) {
        S.busted();
        return;
      }
    } else {
      cop.bust = Math.max(0, cop.bust - dt * 2);
    }
  }

  for (const car of S.patrol) {
    const d = dist(car.x, car.y, p.x, p.y);
    if (car.ramCd > 0) car.ramCd -= dt;
    if (car.backup > 0) {
      car.backup -= dt;
      driveCar(S.world, car, dt, -1, 0.4, 380);
      continue;
    }
    // Unstick: a patrol car that has not moved in a while reverses out.
    const moved = dist(car.x, car.y, car.lastX, car.lastY);
    if (Math.abs(car.speed) < 12 && d > 60) {
      car.stuckTime += dt;
      if (car.stuckTime > 2.5) {
        car.backup = 1.0;
        car.stuckTime = 0;
      }
    } else {
      car.stuckTime = 0;
    }
    car.lastX = car.x;
    car.lastY = car.y;
    if (p.inCar) {
      const want = Math.atan2(p.y - car.y, p.x - car.x);
      const steer = clamp(normAngle(want - car.angle) * 2.0, -1, 1);
      driveCar(S.world, car, dt, 1, steer, 380);
      if (d < 46 && car.ramCd <= 0) {
        car.ramCd = 2.2;
        car.backup = 1.1;
        // A rear shunt: shove the player forward along their own heading,
        // never sideways off the road into a building.
        const pa = p.inCar.angle;
        const res = slideMove(S.world, p.x, p.y, Math.cos(pa) * 16, Math.sin(pa) * 16, 15);
        p.inCar.x = res.x;
        p.inCar.y = res.y;
        p.inCar.speed *= 0.55;
        S.shake = 0.35;
        S.audio.crash();
      }
    } else {
      // On foot the patrol car holds off at a distance; the foot cops do the catching.
      if (d > 110) {
        const want = Math.atan2(p.y - car.y, p.x - car.x);
        const steer = clamp(normAngle(want - car.angle) * 2.0, -1, 1);
        driveCar(S.world, car, dt, 0.8, steer, 380);
      } else if (Math.abs(car.speed) > 30) {
        driveCar(S.world, car, dt, -0.6, 0, 380);
      }
    }
  }

  if (S.wanted === 0) {
    S.cops = S.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 520);
    S.patrol = S.patrol.filter((c) => dist(c.x, c.y, p.x, p.y) < 520);
  }
}

export function spawnGang(S) {
  const t = POINTS.turf;
  const spots = [[-95, -60], [95, -70], [-75, 85], [85, 65]];
  S.enemies = spots.map((s) => ({
    x: t.x + s[0], y: t.y + s[1], hp: 3, alive: true, cd: 0.4 + S.rng.next() * 0.6,
  }));
}

export function updateGang(S, dt) {
  const p = S.player;
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    let mx = 0;
    let my = 0;
    if (d > 250) {
      mx = (p.x - e.x) / d;
      my = (p.y - e.y) / d;
    } else if (d < 130) {
      mx = (e.x - p.x) / d;
      my = (e.y - p.y) / d;
    } else {
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
      mx = Math.cos(a) * 0.4;
      my = Math.sin(a) * 0.4;
    }
    const res = slideMove(S.world, e.x, e.y, mx * 55 * dt, my * 55 * dt, 9);
    e.x = res.x;
    e.y = res.y;
    if (p.inCar || S.state !== 'playing') continue;
    if (d < 430) {
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 1.3 + S.rng.next() * 0.5;
        // A wall between the gang member and the player blocks the shot.
        let clear = true;
        const steps = Math.ceil(d / 24);
        for (let i = 1; i < steps; i++) {
          const x = e.x + ((p.x - e.x) * i) / steps;
          const y = e.y + ((p.y - e.y) * i) / steps;
          if (pointBlocked(S.world, x, y, 2)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        S.tracers.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, t: 0.14 });
        S.audio.enemyShot();
        if (S.rng.next() < 0.55) S.damagePlayer(8);
      }
    }
  }
}

export function updatePickups(S, dt) {
  for (const pk of S.pickups) {
    if (!pk.active) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) pk.active = true;
    }
  }
}
