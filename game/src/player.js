// Milo "Vex" Raines on foot: walking, getting in and out of cars, and
// taking damage. Entering and exiting both run through the E key, and
// the exit branch is the only place E is read while driving — so one
// press can never exit and re-enter in the same frame.
import { CFG } from './config.js';
import { collideCircle, dist } from './city.js';

export function makePlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    hp: CFG.PLAYER_HP,
    money: CFG.START_MONEY,
    ammo: CFG.PISTOL_AMMO_START,
    inCar: false,
    car: null,
    shootCd: 0,
    moving: false,
  };
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  if (p.shootCd > 0) p.shootCd -= dt;
  // Driving: E gets out. This branch alone handles E while in a car.
  if (p.inCar) {
    if (input.wasPressed('KeyE')) exitCar(G);
    return;
  }
  const a = input.axis();
  const len = Math.hypot(a.x, a.y);
  p.moving = len > 0;
  if (len > 0) {
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const sp = sprint ? CFG.PLAYER_SPRINT : CFG.PLAYER_SPEED;
    p.x += (a.x / len) * sp * dt;
    p.y += (a.y / len) * sp * dt;
    p.angle = Math.atan2(a.y, a.x);
    collideCircle(G.city, p, 16);
  }
  // E gets into the nearest car.
  if (input.wasPressed('KeyE')) {
    const car = nearestCar(G, p.x, p.y, 78);
    if (car && !car.isTraffic) enterCar(G, car);
  }
}

export function nearestCar(G, x, y, maxD) {
  let best = null;
  let bd = maxD;
  for (const c of G.parked) {
    const d = dist(x, y, c.x, c.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  for (const c of G.traffic) {
    const d = dist(x, y, c.x, c.y);
    if (d < bd && Math.abs(c.speed) < 40) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = true;
  p.car = car;
  car.parked = false;
  car.isTraffic = false;
  car.driver = 'player';
  const idx = G.parked.indexOf(car);
  if (idx >= 0) G.parked.splice(idx, 1);
  const ti = G.traffic.indexOf(car);
  if (ti >= 0) G.traffic.splice(ti, 1);
  G.audio.engineStart();
  if (car.gold) G.missions.onEnterGold(G);
  // Stealing a car in front of the law is a crime.
  if (car.owned && policeNearby(G, 650)) G.police.addWanted(1);
}

export function exitCar(G) {
  const p = G.player;
  if (!p.inCar || !p.car) return;
  const car = p.car;
  car.driver = null;
  car.speed = 0;
  // The car stays where it stopped and becomes parked again, so it can
  // be found and climbed back into instead of vanishing from the world.
  car.parked = true;
  G.parked.push(car);
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
  p.inCar = false;
  p.car = null;
  G.audio.engineStop();
  collideCircle(G.city, p, 16);
}

function policeNearby(G, range) {
  for (const c of G.cops) {
    if (dist(G.player.x, G.player.y, c.x, c.y) < range) return true;
  }
  for (const c of G.patrols) {
    if (dist(G.player.x, G.player.y, c.x, c.y) < range) return true;
  }
  return false;
}

export function damagePlayer(G, amount) {
  const p = G.player;
  p.hp -= amount;
  if (p.hp <= 0) {
    p.hp = 0;
    G.endRun('wasted');
  }
}
