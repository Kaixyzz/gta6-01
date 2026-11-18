// police.js — the wanted system and the police who answer it.
// One star brings foot police; two and three stars bring patrol cars that
// chase and ram. The heat cools off when the player lays low — unless a
// mission chase is running, in which case it does not.

import { WORLD, ROADS_V, ROADS_H, TUNING } from './config.js';
import { resolveCircle } from './city.js';

export function makeFootCop(x, y) {
  return {
    kind: 'foot', x, y, angle: 0, speed: TUNING.copFootSpeed,
    hitCooldown: 0, flash: Math.random(),
  };
}

export function makePatrolCar(x, y, angle) {
  return {
    kind: 'car', x, y, angle, speed: 0,
    hitCooldown: 0, flash: Math.random(),
  };
}

// How many of each police type a wanted level fields.
export function wantedForce(wanted) {
  if (wanted <= 0) return { foot: 0, cars: 0 };
  if (wanted === 1) return { foot: 2, cars: 0 };
  if (wanted === 2) return { foot: 2, cars: 1 };
  return { foot: 3, cars: 2 };
}

// Spawn one police unit on a road near the player (never on top of them).
export function spawnPoliceUnit(rng, kind, px, py) {
  for (let tries = 0; tries < 12; tries++) {
    const rx = rng.pick(ROADS_V);
    const ry = rng.pick(ROADS_H);
    const onV = rng.chance(0.5);
    const x = onV ? rx : rng.range(160, WORLD.w - 160);
    const y = onV ? rng.range(160, 1620) : ry;
    const d = Math.hypot(x - px, y - py);
    if (d > 180 && d < 520) {
      if (kind === 'foot') return makeFootCop(x, y);
      return makePatrolCar(x, y, Math.atan2(py - y, px - x));
    }
  }
  if (kind === 'foot') return makeFootCop(px + 240, py);
  return makePatrolCar(px + 240, py, Math.PI);
}

// Keep the police force matched to the wanted level.
export function balancePolice(G) {
  const want = wantedForce(G.wanted);
  const foot = G.police.filter((p) => p.kind === 'foot');
  const cars = G.police.filter((p) => p.kind === 'car');
  while (foot.length < want.foot) {
    const unit = spawnPoliceUnit(G.rng, 'foot', G.player.x, G.player.y);
    G.police.push(unit);
    foot.push(unit);
  }
  while (cars.length < want.cars) {
    const unit = spawnPoliceUnit(G.rng, 'car', G.player.x, G.player.y);
    G.police.push(unit);
    cars.push(unit);
  }
  // Too many: drop the farthest ones.
  if (foot.length > want.foot || cars.length > want.cars) {
    G.police.sort((a, b) => {
      const da = Math.hypot(a.x - G.player.x, a.y - G.player.y);
      const db = Math.hypot(b.x - G.player.x, b.y - G.player.y);
      return db - da;
    });
    let removeFoot = foot.length - want.foot;
    let removeCars = cars.length - want.cars;
    G.police = G.police.filter((p) => {
      if (p.kind === 'foot' && removeFoot > 0) { removeFoot--; return false; }
      if (p.kind === 'car' && removeCars > 0) { removeCars--; return false; }
      return true;
    });
  }
  // Despawn stragglers that fell far behind.
  G.police = G.police.filter((p) => Math.hypot(p.x - G.player.x, p.y - G.player.y) < 1100);
}

// Wanted decay: stay clean for a while and the heat cools off, even with
// police still in the area — they give up gradually. A mission chase never
// cools off on its own.
export function updateWanted(G, dt) {
  if (G.chaseMode) return;
  const now = G.time;
  if (G.wanted > 0 && now - G.lastCrimeAt > TUNING.wantedDecayQuietSeconds) {
    G.wantedTimer += dt;
    if (G.wantedTimer >= TUNING.wantedDecayInterval) {
      G.wantedTimer = 0;
      G.wanted = Math.max(0, G.wanted - 1);
    }
  } else {
    G.wantedTimer = 0;
  }
}

export function addWanted(G, amount) {
  G.wanted = Math.max(0, Math.min(3, G.wanted + amount));
  G.lastCrimeAt = G.time;
}

// A foot cop runs the player down and tackles on contact — but only on
// foot. A cop cannot hurt the player through a car; they just crowd it.
export function updateFootCop(cop, G, dt) {
  const dx = G.player.x - cop.x;
  const dy = G.player.y - cop.y;
  const d = Math.hypot(dx, dy) || 1;
  cop.angle = Math.atan2(dy, dx);
  cop.x += (dx / d) * cop.speed * dt;
  cop.y += (dy / d) * cop.speed * dt;
  resolveCircle(G.city, cop, 12);
  cop.hitCooldown -= dt;
  if (d < 26 && cop.hitCooldown <= 0 && !G.player.inCar) {
    cop.hitCooldown = 0.9;
    hurtPlayer(G, TUNING.copBustDamage);
    G.sound.bust();
  }
}

// A patrol car steers toward the player and rams. After a ram it backs off
// briefly to recover, so it cannot pin the player against a wall. Returns
// true on a ram.
export function updatePatrolCar(cop, G, dt) {
  const dx = G.player.x - cop.x;
  const dy = G.player.y - cop.y;
  const d = Math.hypot(dx, dy) || 1;
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - cop.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cop.angle += Math.max(-3.1 * dt, Math.min(3.1 * dt, diff));
  const recovering = G.time < (cop.recoverUntil || 0);
  const targetSpeed = recovering ? 150 : TUNING.copCarSpeed;
  cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * (recovering ? 2.5 : 0.9));
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  resolveCircle(G.city, cop, TUNING.carRadius);
  cop.hitCooldown -= dt;
  if (d < 34 && cop.hitCooldown <= 0 && !recovering) {
    cop.hitCooldown = 1.1;
    cop.recoverUntil = G.time + 1.2;
    hurtPlayer(G, TUNING.copRamDamage);
    G.sound.crash();
    // Shove the player's car so the ram is felt.
    if (G.player.car) {
      G.player.car.speed *= 0.55;
      G.player.car.x += (dx / d) * 14;
      G.player.car.y += (dy / d) * 14;
    } else {
      G.player.x += (dx / d) * 18;
      G.player.y += (dy / d) * 18;
    }
    return true;
  }
  return false;
}

// Damage the player; at 0 HP the player is busted and wakes at the garage.
export function hurtPlayer(G, amount) {
  if (G.phase !== 'playing' || G.player.hp <= 0) return;
  G.player.hp = Math.max(0, G.player.hp - amount);
  if (G.player.hp <= 0) bustPlayer(G);
}

// Busted: fine, full health, back to the garage. A car the player was
// driving is left parked where it was — it must not vanish.
export function bustPlayer(G) {
  const p = G.player;
  p.money = Math.max(0, p.money - 100);
  p.hp = TUNING.playerHp;
  p.ammo = Math.max(p.ammo, 6);
  if (p.car) {
    p.car.speed = 0;
    p.car.mass = 1;
    G.cars.push(p.car);
    p.car = null;
  }
  p.inCar = false;
  p.x = G.places.garage.x;
  p.y = G.places.garage.y;
  G.wanted = 0;
  G.chaseMode = false;
  G.flashMessage = 'BUSTED! You woke up at the garage — $100 fine.';
  G.flashUntil = G.time + 3.5;
  G.sound.bust();
}
