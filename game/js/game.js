// SOLARA BAY — main game module: loop, input, player physics, police,
// pickups, save/load, screenshot staging and the driver-facing state().

import { buildCity, WORLD_W, WORLD_H, SPAWN, AMMO_SPOTS, HEALTH_SPOTS, GARAGE, onRoad, circleHitsBuilding, pointInBuilding, nearestIntersection } from './city.js';
import { makeRng, clamp, dist, normAngle, angleTo, intRange, pick } from './rng.js';
import { makeTrafficCar, makeParkedCar, makePatrolCar, makePed, makeFootCop, makeEnemy, updateTraffic, updatePatrol, updatePed, updateCop, updateEnemy, makeBullet, updateBullets, spawnParticles, updateParticles, TRAFFIC_COLORS } from './entities.js';
import { makeMissionState, updateMissions, missionCard, MISSIONS } from './missions.js';
import { drawWorld, drawMinimap } from './render.js';
import * as audio from './audio.js';

const SAVE_KEY = 'solarabay.save.v1';
const VIEW_W = 1280;
const VIEW_H = 720;
const WALK_SPEED = 185;
const CAR_TOP = 430;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const miniCtx = mini.getContext('2d');

const $ = id => document.getElementById(id);

const g = {
  city: null,
  started: false,
  paused: false,
  state: 'title',
  time: 0,
  player: null,
  car: null,
  inCar: false,
  cars: [],
  peds: [],
  cops: [],
  enemies: [],
  bullets: [],
  particles: [],
  pickups: [],
  wanted: 0,
  money: 50,
  mission: null,
  cam: { x: 0, y: 0 },
  keys: new Set(),
  mouse: { x: 640, y: 360, down: false },
  fireCooldown: 0,
  muzzle: 0,
  crimeTimer: 0,
  decayTimer: 0,
  saveTimer: 0,
  lastHurt: -99,
  shotMode: null,
  toastTimer: null,
};

export function newWorld() {
  const city = buildCity();
  const rng = makeRng(20261119 + 7);
  const cars = [];
  for (let i = 0; i < 9; i++) cars.push(makeTrafficCar(rng));
  const parkedSpots = [
    { x: 400, y: 352, a: 0 },
    { x: 700, y: 928, a: Math.PI },
    { x: 1500, y: 352, a: 0 },
    { x: 2100, y: 928, a: Math.PI },
    { x: 960, y: 1568, a: Math.PI / 2 },
    { x: 1700, y: 1568, a: -Math.PI / 2 },
  ];
  for (const s of parkedSpots) {
    cars.push(makeParkedCar(s.x, s.y, s.a, TRAFFIC_COLORS[intRange(rng, 0, TRAFFIC_COLORS.length - 1)]));
  }
  const peds = [];
  for (let i = 0; i < 14; i++) peds.push(makePed(rng));
  const pickups = [];
  for (const s of AMMO_SPOTS) pickups.push({ kind: 'ammo', x: s.x, y: s.y, taken: false });
  for (const s of HEALTH_SPOTS) pickups.push({ kind: 'health', x: s.x, y: s.y, taken: false });
  return { city, cars, peds, pickups };
}

function resetGame() {
  const w = newWorld();
  g.city = w.city;
  g.cars = w.cars;
  g.peds = w.peds;
  g.pickups = w.pickups;
  g.cops = [];
  g.enemies = [];
  g.bullets = [];
  g.particles = [];
  g.player = { x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, hp: 100, ammo: 24, vx: 0, vy: 0 };
  g.car = null;
  g.inCar = false;
  g.wanted = 0;
  g.money = 50;
  g.mission = makeMissionState();
  g.state = 'playing';
  g.paused = false;
  g.fireCooldown = 0;
  g.muzzle = 0;
  g.crimeTimer = 0;
  g.decayTimer = 0;
  g.saveTimer = 0;
  g.lastHurt = -99;
  updateCamera();
}

function updateCamera() {
  g.cam.x = clamp(g.player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  g.cam.y = clamp(g.player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
}

function showToast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  if (g.toastTimer) clearTimeout(g.toastTimer);
  g.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function hideOverlays() {
  for (const id of ['overlay-start', 'overlay-pause', 'overlay-end', 'overlay-busted', 'overlay-wasted']) $(id).classList.add('hidden');
}

function showOverlay(id) {
  hideOverlays();
  $(id).classList.remove('hidden');
}

function saveGame() {
  if (g.shotMode) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: g.mission.missionIndex,
      stage: g.mission.stage,
      kills: g.mission.kills,
      gangSpawned: g.mission.gangSpawned,
      money: g.money,
      px: g.player.x, py: g.player.y,
      hp: g.player.hp, ammo: g.player.ammo,
      storyComplete: g.mission.storyComplete,
    }));
  } catch (e) { /* storage unavailable */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function applySave(s) {
  resetGame();
  g.mission.missionIndex = s.missionIndex;
  g.mission.stage = s.stage;
  g.mission.kills = s.kills || 0;
  g.mission.gangSpawned = !!s.gangSpawned;
  g.mission.marker = missionMarker();
  g.money = s.money;
  g.player.x = s.px;
  g.player.y = s.py;
  g.player.hp = s.hp;
  g.player.ammo = s.ammo;
  g.state = 'playing';
  g.started = true;
  if (s.storyComplete) {
    g.mission.storyComplete = true;
    g.state = 'complete';
    $('end-stats').textContent = `Final cash: $${g.money} — all four jobs done.`;
    showOverlay('overlay-end');
  }
  updateCamera();
  updateHud();
}

function missionMarker() {
  const m = g.mission;
  if (m.missionIndex === 0) return { x: 1920, y: 320 };
  if (m.missionIndex === 1) return m.stage === 0 ? { x: 640, y: 1280 } : { x: 2240, y: 640 };
  if (m.missionIndex === 2) return { x: 1280, y: 960 };
  return m.stage === 0 ? { x: 960, y: 1600 } : { x: 2240, y: 1600 };
}

function setWanted(n) {
  const before = g.wanted;
  g.wanted = clamp(n, 0, 3);
  if (g.wanted > before) g.crimeTimer = 0;
  if (g.wanted >= 2) audio.startSiren();
  else audio.stopSiren();
}

function raiseWanted(n, cap) {
  setWanted(Math.min(Math.max(g.wanted, n), cap === undefined ? 3 : cap));
}

function hurtPlayer(dmg) {
  if (g.state !== 'playing') return;
  g.player.hp -= dmg;
  g.lastHurt = g.time;
  if (g.player.hp <= 0) {
    g.player.hp = 0;
    g.state = 'wasted';
    audio.stopEngine();
    audio.stopSiren();
    showOverlay('overlay-wasted');
  }
}

function respawn() {
  g.player.x = SPAWN.x;
  g.player.y = SPAWN.y;
  g.player.hp = 100;
  g.player.angle = -Math.PI / 2;
  if (g.inCar) {
    g.cars.push({ ...g.car, parked: true, speed: 0 });
    g.car = null;
    g.inCar = false;
  }
  setWanted(0);
  g.cops = [];
  g.enemies = g.enemies.filter(() => false);
  g.bullets = [];
  g.state = 'playing';
  hideOverlays();
  $('hud').classList.remove('hidden');
  updateCamera();
  updateHud();
}

function enterCar() {
  if (g.inCar || g.state !== 'playing') return;
  let best = null;
  let bd = 1e18;
  for (const c of g.cars) {
    if (c.kind === 'patrol') continue;
    const d = dist(g.player.x, g.player.y, c.x, c.y);
    if (d < 62 && d < bd) {
      // Prefer parked cars over moving traffic.
      if (!best || (c.parked && !best.parked) || (c.parked === best.parked)) {
        if (!best || c.parked || !best.parked || d < bd - 30) { best = c; bd = d; }
      }
    }
  }
  if (!best) return;
  g.cars.splice(g.cars.indexOf(best), 1);
  g.car = { ...best, kind: 'player', speed: 0, vx: 0, vy: 0 };
  g.car.x = g.player.x;
  g.car.y = g.player.y;
  g.inCar = true;
  if (!best.parked) {
    raiseWanted(1, 1);
    showToast('You stole a car! The Bay PD noticed.');
  }
  audio.sfx.enter();
  audio.startEngine();
}

function exitCar() {
  if (!g.inCar) return;
  const side = { x: g.car.x - Math.sin(g.car.angle) * 30, y: g.car.y + Math.cos(g.car.angle) * 30 };
  g.player.x = side.x;
  g.player.y = side.y;
  g.player.angle = g.car.angle;
  g.cars.push({ ...g.car, kind: 'parked', parked: true, speed: 0, cruise: 0 });
  g.car = null;
  g.inCar = false;
  audio.stopEngine();
}

function fireBullet() {
  if (g.player.ammo <= 0) {
    if (g.player.ammo === 0) showToast('Out of ammo — find an ammo pickup.');
    return;
  }
  g.player.ammo -= 1;
  g.fireCooldown = 0.22;
  g.muzzle = 0.12;
  const wx = g.mouse.x + g.cam.x;
  const wy = g.mouse.y + g.cam.y;
  const a = angleTo(g.player.x, g.player.y, wx, wy);
  g.player.angle = a;
  g.bullets.push(makeBullet(g.player.x + Math.cos(a) * 16, g.player.y + Math.sin(a) * 16, a, 560, 'player', 1));
  audio.sfx.shot();
  spawnParticles(g.particles, g.player.x + Math.cos(a) * 18, g.player.y + Math.sin(a) * 18, '#ffe08a', 4, 120);
  raiseWanted(1, 1);
}

function spawnGang() {
  const spots = [
    { x: 1280, y: 820 },
    { x: 1280, y: 1100 },
    { x: 1140, y: 960 },
    { x: 1420, y: 960 },
  ];
  g.enemies = spots.map(s => makeEnemy(s.x, s.y));
  showToast('Turfwars — take them all down!');
}

function spawnPolice() {
  const wantCops = g.wanted >= 3 ? 2 : g.wanted >= 1 ? 1 : 0;
  const wantPatrols = g.wanted >= 2 && g.inCar ? (g.wanted >= 3 ? 3 : 1) : 0;
  const patrols = g.cars.filter(c => c.kind === 'patrol').length;
  while (g.cops.length < wantCops) {
    const edge = nearestIntersection(g.player.x + (Math.random() < 0.5 ? -700 : 700), g.player.y + (Math.random() < 0.5 ? -700 : 700));
    const sx = clamp(edge.x, 200, WORLD_W - 200);
    const sy = clamp(edge.y, 200, WORLD_H - 200);
    g.cops.push(makeFootCop(sx, sy));
  }
  while (patrols < wantPatrols) {
    const a = Math.random() * Math.PI * 2;
    const px = clamp(g.player.x + Math.cos(a) * 520, 200, WORLD_W - 200);
    const py = clamp(g.player.y + Math.sin(a) * 520, 200, WORLD_H - 200);
    const spot = nearestIntersection(px, py);
    g.cars.push(makePatrolCar(spot.x, spot.y));
    break;
  }
}

function updatePlayer(dt) {
  const p = g.player;
  const k = g.keys;
  if (g.inCar && g.car) {
    const c = g.car;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const steer = (k.has('a') || k.has('arrowleft') ? -1 : 0) + (k.has('d') || k.has('arrowright') ? 1 : 0);
    const speed = Math.hypot(c.vx, c.vy);
    const dir = speed > 20 ? Math.sign(c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle)) : 1;
    c.angle += steer * 2.6 * dt * clamp(speed / 140, 0.35, 1) * dir;
    const ax = Math.cos(c.angle) * 300 * fwd;
    const ay = Math.sin(c.angle) * 300 * fwd;
    c.vx += ax * dt;
    c.vy += ay * dt;
    // Lateral grip: bleed sideways velocity so the car drifts but stays drivable.
    const fvx = Math.cos(c.angle);
    const fvy = Math.sin(c.angle);
    const forwardSpeed = c.vx * fvx + c.vy * fvy;
    const latX = c.vx - forwardSpeed * fvx;
    const latY = c.vy - forwardSpeed * fvy;
    const grip = Math.exp(-6.5 * dt);
    c.vx = forwardSpeed * fvx + latX * grip;
    c.vy = forwardSpeed * fvy + latY * grip;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > CAR_TOP) {
      c.vx = (c.vx / sp) * CAR_TOP;
      c.vy = (c.vy / sp) * CAR_TOP;
    }
    if (fwd === 0) {
      c.vx *= Math.exp(-1.8 * dt);
      c.vy *= Math.exp(-1.8 * dt);
    }
    moveCar(c, dt);
    p.x = c.x;
    p.y = c.y;
    p.angle = c.angle;
    c.speed = Math.hypot(c.vx, c.vy);
    audio.setEngine(Math.min(1, c.speed / CAR_TOP));
    // Running over a pedestrian is a crime.
    for (const ped of g.peds) {
      if (dist(p.x, p.y, ped.x, ped.y) < 24 && c.speed > 60) {
        ped.flee = 2;
        ped.angle = angleTo(p.x, p.y, ped.x, ped.y);
        raiseWanted(Math.min(g.wanted + 1, 2), 2);
        showToast('You hit a pedestrian!');
        audio.sfx.crash();
        spawnParticles(g.particles, ped.x, ped.y, '#ff7a5c', 8, 200);
      }
    }
    // Bump traffic and parked cars.
    for (const other of g.cars) {
      if (other.kind === 'patrol') continue;
      const d = dist(c.x, c.y, other.x, other.y);
      if (d < 36 && d > 0.01) {
        const push = (36 - d) / 2;
        const nx = (other.x - c.x) / d;
        const ny = (other.y - c.y) / d;
        other.x += nx * push;
        other.y += ny * push;
        c.x -= nx * push;
        c.y -= ny * push;
        c.vx *= 0.6;
        c.vy *= 0.6;
        if (c.speed > 120) {
          audio.sfx.crash();
          spawnParticles(g.particles, c.x, c.y, '#ffb347', 6, 160);
        }
      }
    }
  } else {
    let mx = 0;
    let my = 0;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
    }
    const nx = p.x + mx * WALK_SPEED * dt;
    const ny = p.y + my * WALK_SPEED * dt;
    if (!pointInBuilding(g.city.buildings, nx, p.y, 10)) p.x = nx;
    if (!pointInBuilding(g.city.buildings, p.x, ny, 10)) p.y = ny;
    p.x = clamp(p.x, 20, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);
    // Pickups are collected on foot.
    for (const pk of g.pickups) {
      if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 26) {
        pk.taken = true;
        if (pk.kind === 'ammo') {
          p.ammo += 12;
          showToast('+12 ammo');
        } else {
          p.hp = Math.min(100, p.hp + 30);
          showToast('+30 health');
        }
        audio.sfx.pickup();
        spawnParticles(g.particles, pk.x, pk.y, '#ffd166', 8, 140);
      }
    }
    // Aim with the mouse; hold click to shoot.
    const wx = g.mouse.x + g.cam.x;
    const wy = g.mouse.y + g.cam.y;
    p.angle = angleTo(p.x, p.y, wx, wy);
    g.fireCooldown = Math.max(0, g.fireCooldown - dt);
    if (g.mouse.down && g.fireCooldown <= 0) fireBullet();
  }
  g.muzzle = Math.max(0, g.muzzle - dt);
}

function moveCar(c, dt) {
  const nx = c.x + c.vx * dt;
  const ny = c.y + c.vy * dt;
  if (!circleHitsBuilding(g.city.buildings, nx, c.y, 15)) c.x = nx;
  else { c.vx *= -0.25; }
  if (!circleHitsBuilding(g.city.buildings, c.x, ny, 15)) c.y = ny;
  else { c.vy *= -0.25; }
  c.x = clamp(c.x, 30, WORLD_W - 30);
  c.y = clamp(c.y, 30, WORLD_H - 30);
}

function updatePolice(dt) {
  spawnPolice();
  const px = g.player.x;
  const py = g.player.y;
  for (let i = g.cops.length - 1; i >= 0; i--) {
    const cop = g.cops[i];
    const busted = updateCop(cop, dt, px, py, !g.inCar, g.city);
    if (busted) {
      g.state = 'busted';
      g.money = Math.max(50, g.money - 100);
      audio.sfx.bust();
      audio.stopEngine();
      audio.stopSiren();
      showOverlay('overlay-busted');
      return;
    }
  }
  for (const car of g.cars) {
    if (car.kind !== 'patrol') continue;
    updatePatrol(car, dt, px, py, g.city, () => {
      if (g.inCar && g.car) {
        const a = angleTo(car.x, car.y, g.car.x, g.car.y);
        g.car.vx += Math.cos(a) * 160;
        g.car.vy += Math.sin(a) * 160;
        hurtPlayer(2);
        audio.sfx.crash();
        spawnParticles(g.particles, g.car.x, g.car.y, '#ffb347', 8, 180);
      }
    });
  }
  if (g.wanted === 0) {
    g.cops = [];
    g.cars = g.cars.filter(c => c.kind !== 'patrol');
  }
}

function update(dt) {
  g.time += dt;
  updatePlayer(dt);
  if (g.state !== 'playing') return;

  // Traffic, pedestrians, enemies.
  for (const car of g.cars) {
    if (car.kind === 'traffic') updateTraffic(car, dt, { buildings: g.city.buildings, cars: g.cars });
  }
  for (const ped of g.peds) {
    updatePed(ped, dt, g.city, [
      { x: g.player.x, y: g.player.y },
      ...g.bullets.filter(b => b.from === 'player').map(b => ({ x: b.x, y: b.y })),
    ]);
  }
  for (const e of [...g.enemies]) {
    updateEnemy(e, dt, g.player.x, g.player.y, g.inCar, g.city, (enemy) => {
      const a = angleTo(enemy.x, enemy.y, g.player.x, g.player.y) + (Math.random() - 0.5) * 0.3;
      g.bullets.push(makeBullet(enemy.x, enemy.y, a, 300, 'enemy', 4));
      audio.sfx.enemyShot();
    });
  }
  updateBullets(g.bullets, dt, g.city, (b) => {
    if (b.from === 'player') {
      for (let i = g.enemies.length - 1; i >= 0; i--) {
        const e = g.enemies[i];
        if (dist(b.x, b.y, e.x, e.y) < 17) {
          e.hp -= b.dmg;
          spawnParticles(g.particles, b.x, b.y, '#ff5c5c', 5, 130);
          if (e.hp <= 0) {
            g.enemies.splice(i, 1);
            g.mission.kills += 1;
            if (Math.random() < 0.6) {
              g.pickups.push({ kind: 'ammo', x: e.x, y: e.y, taken: false });
            }
            spawnParticles(g.particles, e.x, e.y, '#ff5c5c', 14, 220);
          }
          return true;
        }
      }
      for (const c of g.cars) {
        if (c.kind === 'patrol') continue;
        if (dist(b.x, b.y, c.x, c.y) < 20) return true;
      }
      return false;
    }
    // Enemy bullets: hurt the player (on foot or in the car).
    if (dist(b.x, b.y, g.player.x, g.player.y) < (g.inCar ? 20 : 14)) {
      hurtPlayer(b.dmg);
      return true;
    }
    return false;
  });
  updateParticles(g.particles, dt);

  // Missions.
  const ev = updateMissions(g.mission, {
    px: g.player.x, py: g.player.y, inCar: g.inCar,
  });
  if (ev === 'm1') {
    g.money += MISSIONS[0].reward;
    showToast('Mission complete: First Wheels +$300');
    audio.sfx.mission();
    saveGame();
  } else if (ev === 'm2-pickup') {
    showToast('Package collected — deliver it!');
    audio.sfx.coin();
  } else if (ev === 'm2') {
    g.money += MISSIONS[1].reward;
    showToast('Mission complete: The Pickup +$500');
    audio.sfx.mission();
    saveGame();
  } else if (ev === 'm3-spawn') {
    spawnGang();
    audio.sfx.mission();
  } else if (ev === 'm3') {
    g.money += MISSIONS[2].reward;
    showToast('Mission complete: Turfwars +$800');
    audio.sfx.mission();
    saveGame();
  } else if (ev === 'm4-goods') {
    setWanted(3, 3);
    showToast('The goods are yours — RUN! Wanted: 3 stars!');
    audio.sfx.mission();
  } else if (ev === 'm4') {
    g.money += MISSIONS[3].reward;
    g.state = 'complete';
    g.mission.storyComplete = true;
    $('end-stats').textContent = `Final cash: $${g.money} — all four jobs done.`;
    showOverlay('overlay-end');
    audio.sfx.mission();
    saveGame();
  }

  // Police, wanted decay, regen, autosave.
  updatePolice(dt);
  if (g.state !== 'playing') return;
  g.crimeTimer += dt;
  if (g.wanted > 0 && g.crimeTimer > 12 && !(g.mission.missionIndex === 3 && g.mission.stage === 1)) {
    g.decayTimer += dt;
    if (g.decayTimer > 5) {
      g.decayTimer = 0;
      setWanted(g.wanted - 1);
    }
  }
  if (g.time - g.lastHurt > 6 && g.player.hp < 100) {
    g.player.hp = Math.min(100, g.player.hp + 3 * dt);
  }
  g.saveTimer += dt;
  if (g.saveTimer > 4) {
    g.saveTimer = 0;
    saveGame();
  }
  if (g.wanted >= 2) audio.updateSiren(dt);
  updateCamera();
  updateHud();
}

function updateHud() {
  $('hud-money').textContent = '$' + g.money;
  $('hp-fill').style.width = clamp(g.player.hp, 0, 100) + '%';
  $('hud-ammo').textContent = g.inCar ? '—' : String(g.player.ammo);
  const stars = '★'.repeat(g.wanted) + '☆'.repeat(3 - g.wanted);
  $('hud-stars').textContent = stars;
  const card = missionCard(g.mission);
  $('mission-title').textContent = card.title;
  $('mission-objective').textContent = card.objective;
  $('mission-reward').textContent = 'Reward ' + card.reward;
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - (frame.last || t)) / 1000 || 0.016);
  frame.last = t;
  if (g.started && !g.paused && (g.state === 'playing' || g.state === 'complete')) {
    if (g.state === 'playing') update(dt);
  }
  if (g.started) {
    drawWorld(ctx, g, g.time);
    drawMinimap(miniCtx, g);
  }
}

function applyShotMode(shot) {
  resetGame();
  g.shotMode = shot;
  g.started = true;
  if (shot === 'walk') {
    g.player.x = 960;
    g.player.y = 640;
    g.player.angle = -Math.PI / 2;
  } else if (shot === 'drive') {
    const car = g.cars.find(c => c.parked);
    g.cars.splice(g.cars.indexOf(car), 1);
    g.car = { ...car, kind: 'player', speed: 200, vx: 200, vy: 0 };
    g.car.x = 960;
    g.car.y = 640;
    g.car.angle = 0;
    g.car.vx = 220;
    g.player.x = 960;
    g.player.y = 640;
    g.inCar = true;
  } else if (shot === 'chase') {
    g.mission.missionIndex = 3;
    g.mission.stage = 1;
    g.mission.marker = { x: 2240, y: 1600 };
    g.money = 1650;
    setWanted(3, 3);
    const car = g.cars.find(c => c.parked);
    g.cars.splice(g.cars.indexOf(car), 1);
    g.car = { ...car, kind: 'player', speed: 240, vx: 240, vy: 0 };
    g.car.x = 1280;
    g.car.y = 960;
    g.car.angle = 0;
    g.player.x = 1280;
    g.player.y = 960;
    g.inCar = true;
    const offsets = [[150, -80], [-180, 60], [60, 180]];
    for (const [dx, dy] of offsets) {
      const pc = makePatrolCar(g.player.x + dx, g.player.y + dy);
      pc.angle = angleTo(pc.x, pc.y, g.player.x, g.player.y);
      g.cars.push(pc);
    }
    g.cops.push(makeFootCop(g.player.x - 120, g.player.y - 140));
    g.cops.push(makeFootCop(g.player.x + 200, g.player.y + 120));
  } else if (shot === 'mission') {
    g.mission.missionIndex = 1;
    g.mission.stage = 0;
    g.mission.marker = { x: 640, y: 1280 };
    g.money = 850;
    const car = g.cars.find(c => c.parked);
    g.cars.splice(g.cars.indexOf(car), 1);
    g.car = { ...car, kind: 'player', speed: 200, vx: -140, vy: 140 };
    g.car.x = 960;
    g.car.y = 960;
    g.car.angle = Math.PI * 0.75;
    g.player.x = 960;
    g.player.y = 960;
    g.inCar = true;
  }
  updateCamera();
  updateHud();
  $('hud').classList.remove('hidden');
  hideOverlays();
  audio.ensureAudio();
}

function boot() {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  resetGame();
  g.started = false;
  if (shot && ['walk', 'drive', 'chase', 'mission'].includes(shot)) {
    applyShotMode(shot);
  } else {
    const save = loadSave();
    if (save && (save.missionIndex > 0 || save.money > 50 || save.storyComplete)) {
      $('btn-continue').classList.remove('hidden');
    }
  }
  requestAnimationFrame(frame);
}

window.__game = {
  state() {
    const p = g.player;
    const carsNear = g.cars
      .filter(c => c.kind !== 'patrol')
      .map(c => ({ x: c.x, y: c.y, d: dist(p.x, p.y, c.x, c.y), parked: !!c.parked }))
      .filter(c => c.d < 600)
      .sort((a, b) => a.d - b.d);
    return {
      started: g.started,
      money: g.money,
      missionIndex: g.mission.missionIndex,
      state: g.state,
      px: Math.round(p.x),
      py: Math.round(p.y),
      carAngle: g.inCar && g.car ? g.car.angle : 0,
      carSpeed: g.inCar && g.car ? Math.round(Math.hypot(g.car.vx, g.car.vy)) : 0,
      inCar: g.inCar,
      marker: { x: g.mission.marker.x, y: g.mission.marker.y },
      carsNear,
      stage: g.mission.stage,
      enemies: g.enemies.map(e => ({ x: Math.round(e.x), y: Math.round(e.y) })),
      kills: g.mission.kills,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      pickups: g.pickups.filter(pk => !pk.taken).map(pk => ({ kind: pk.kind, x: pk.x, y: pk.y })),
      wanted: g.wanted,
      patrol: g.cars.filter(c => c.kind === 'patrol').length,
      cops: g.cops.length,
      storyComplete: g.mission.storyComplete,
      paused: g.paused,
      cam: { x: Math.round(g.cam.x), y: Math.round(g.cam.y) },
    };
  },
};

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'p' || k === 'escape') {
    if (g.started && (g.state === 'playing' || g.paused)) {
      g.paused = !g.paused;
      if (g.paused) {
        saveGame();
        showOverlay('overlay-pause');
      } else {
        hideOverlays();
        $('hud').classList.remove('hidden');
      }
    }
    return;
  }
  if (k === 'm') {
    audio.ensureAudio();
    audio.setMuted(!audio.isMuted());
    showToast(audio.isMuted() ? 'Muted' : 'Sound on');
    return;
  }
  if (k === 'e') {
    if (g.inCar) exitCar();
    else enterCar();
    return;
  }
  g.keys.add(k);
});

window.addEventListener('keyup', (e) => {
  g.keys.delete(e.key.toLowerCase());
});

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  g.mouse.x = e.clientX - r.left;
  g.mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) g.mouse.down = true;
});
window.addEventListener('mouseup', () => { g.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

$('btn-start').addEventListener('click', () => {
  audio.ensureAudio();
  resetGame();
  g.started = true;
  hideOverlays();
  $('hud').classList.remove('hidden');
  updateHud();
  showToast('Mission 1 — steal a car and reach the drop-off.');
});

$('btn-continue').addEventListener('click', () => {
  audio.ensureAudio();
  const save = loadSave();
  if (!save) return;
  applySave(save);
  if (!g.mission.storyComplete) {
    hideOverlays();
    $('hud').classList.remove('hidden');
    showToast('Welcome back to the Bay.');
  }
});

$('btn-resume').addEventListener('click', () => {
  g.paused = false;
  hideOverlays();
  $('hud').classList.remove('hidden');
});

$('btn-again').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  resetGame();
  g.started = true;
  hideOverlays();
  $('hud').classList.remove('hidden');
  updateHud();
});

$('btn-busted').addEventListener('click', respawn);
$('btn-wasted').addEventListener('click', respawn);

boot();
