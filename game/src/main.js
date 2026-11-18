// main.js — SOLARA BAY: the game loop, the player, and the state machine.
// Wires every system together: menu, playing, paused, story complete.
// Exposes window.__game for play-testing (state snapshot + screen mapping).

import { WORLD, ROADS_V, ROADS_H, PLACES, TUNING } from './config.js';
import { Rng } from './rng.js';
import { buildCity, resolveCircle, pointInBuilding } from './city.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { makeCar, driveCar, separateCars, spawnTrafficCar, updateTrafficCar } from './vehicles.js';
import { makePedestrian, updatePedestrian, scarePedestrians } from './pedestrians.js';
import { balancePolice, updateWanted, updateFootCop, updatePatrolCar, addWanted } from './police.js';
import { makeCombat, seedPickups, firePlayerBullet, updateCombat } from './combat.js';
import { makeMissions, startMission, updateMissions, currentObjective, currentTarget } from './missions.js';
import { drawWorld } from './render.js';
import { drawHud } from './hud.js';
import { saveGame, loadSave, hasSave, applySave, clearSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function makeGame() {
  const rng = new Rng(20261119);
  const city = buildCity();
  const G = {
    time: 0,
    phase: 'menu', // menu | playing | paused | story
    rng,
    city,
    places: PLACES,
    roadsV: ROADS_V,
    roadsH: ROADS_H,
    sound: new SoundBank(),
    input: new Input(canvas, () => G.sound.unlock()),
    camera: { x: 0, y: 0 },
    player: {
      x: PLACES.garage.x, y: PLACES.garage.y, angle: 0,
      hp: TUNING.playerHp, ammo: TUNING.startAmmo,
      money: TUNING.startMoney, inCar: false, car: null,
    },
    cars: [],
    peds: [],
    police: [],
    combat: makeCombat(),
    mission: makeMissions(),
    particles: [],
    wanted: 0,
    wantedTimer: 0,
    lastCrimeAt: -100,
    lastShotCrimeAt: -100,
    lastPedHitAt: -100,
    chaseMode: false,
    storyComplete: false,
    flashMessage: '',
    flashUntil: 0,
    trafficRespawnIn: 0,
    stats: { shotsFired: 0, gangDown: 0, missionsDone: 0 },
    menuT: 0,
  };
  return G;
}

const G = makeGame();

// --- world population -------------------------------------------------------

function populateWorld() {
  const rng = G.rng;
  // Parked cars the player can steal (abandoned: taking one is free).
  G.cars.push(makeCar(410, 350, 0, '#d94f3d', {}));
  G.cars.push(makeCar(650, 372, Math.PI / 2, '#3d7dd9', {}));
  G.cars.push(makeCar(910, 592, Math.PI / 2, '#e8c33d', {}));
  // One more parked car near the turf for the M3 approach.
  G.cars.push(makeCar(1950, 1230, 0, '#7dd93d', {}));
  // Traffic.
  for (let i = 0; i < TUNING.trafficCount; i++) {
    G.cars.push(spawnTrafficCar(rng, G.player.x, G.player.y));
  }
  // Pedestrians.
  for (let i = 0; i < TUNING.pedCount; i++) {
    G.peds.push(makePedestrian(rng));
  }
  seedPickups(G.combat);
}

function startNewGame() {
  const keepSound = G.sound;
  const keepInput = G.input;
  const fresh = makeGame();
  fresh.sound = keepSound;
  fresh.input = keepInput;
  Object.assign(G, fresh);
  populateWorld();
  startMission(G, 0);
  G.phase = 'playing';
}

function continueGame() {
  const data = loadSave();
  if (!data) return false;
  const keepSound = G.sound;
  const keepInput = G.input;
  const fresh = makeGame();
  fresh.sound = keepSound;
  fresh.input = keepInput;
  Object.assign(G, fresh);
  populateWorld();
  applySave(G, data);
  if (G.phase === 'story') {
    // A finished story loads onto the Story Complete card.
    G.phase = 'story';
  }
  return true;
}

// --- player ---------------------------------------------------------------

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  if (car.traffic) {
    addWanted(G, 1);
    G.flashMessage = 'Car stolen! The cops are coming.';
    G.flashUntil = G.time + 2.5;
  }
  G.cars.splice(G.cars.indexOf(car), 1);
  G.player.car = car;
  G.player.inCar = true;
  car.traffic = false;
  car.mass = 2.5; // the player's car shoves through roadblocks
  G.sound.pickup();
}

function exitCar() {
  const car = G.player.car;
  if (!car) return;
  car.speed = 0;
  car.mass = 1;
  // Park the car where it is and step out to its side (never inside a wall).
  const side = Math.PI / 2;
  const spots = [
    { x: car.x + Math.cos(car.angle + side) * 34, y: car.y + Math.sin(car.angle + side) * 34 },
    { x: car.x + Math.cos(car.angle - side) * 34, y: car.y + Math.sin(car.angle - side) * 34 },
    { x: car.x - Math.cos(car.angle) * 34, y: car.y - Math.sin(car.angle) * 34 },
  ];
  let spot = spots[0];
  for (const s of spots) {
    if (!pointInBuilding(G.city, s.x, s.y) && s.y < 1770 && s.x > 10 && s.x < WORLD.w - 10) {
      spot = s;
      break;
    }
  }
  G.player.x = spot.x;
  G.player.y = spot.y;
  G.player.inCar = false;
  G.player.car = null;
  G.cars.push(car);
}

function updatePlayer(dt) {
  const p = G.player;
  const input = G.input;
  const axes = input.axes();

  if (p.inCar && p.car) {
    const car = p.car;
    const steer = axes.x;
    const throttle = axes.y < 0 ? 1 : (axes.y > 0 ? -1 : 0);
    driveCar(car, { throttle, steer }, dt, G.city);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Ramming a pedestrian at speed is a crime (a slow nudge is not).
    for (const ped of G.peds) {
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 150) {
        if (G.time - G.lastPedHitAt > 3) {
          G.lastPedHitAt = G.time;
          addWanted(G, 1);
          G.sound.crash();
          G.flashMessage = 'You hit a pedestrian! Wanted up.';
          G.flashUntil = G.time + 2;
        }
        scarePedestrians(G.peds, car.x, car.y, 240, G.time);
        ped.x += (ped.x - car.x) * 0.4;
        ped.y += (ped.y - car.y) * 0.4;
      }
    }
    if (input.wasPressed('e')) exitCar();
    return;
  }

  // On foot.
  const run = input.held('Shift');
  const speed = run ? TUNING.runSpeed : TUNING.walkSpeed;
  let mx = axes.x;
  let my = axes.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    resolveCircle(G.city, p, TUNING.playerRadius);
  }
  if (input.wasPressed('e')) {
    const car = nearestCar(52);
    if (car) enterCar(car);
  }
  if (input.mouseDown) {
    if (firePlayerBullet(G) && G.time - G.lastShotCrimeAt > 3) {
      G.lastShotCrimeAt = G.time;
      addWanted(G, 1);
    }
  }
}

// --- camera -----------------------------------------------------------------

function updateCamera(dt) {
  const vw = canvas.width;
  const vh = canvas.height;
  const tx = G.player.x - vw / 2;
  const ty = G.player.y - vh / 2;
  const maxX = Math.max(0, WORLD.w - vw);
  const maxY = Math.max(0, WORLD.h - vh);
  const cx = Math.max(0, Math.min(maxX, tx));
  const cy = Math.max(0, Math.min(maxY, ty));
  const k = Math.min(1, dt * 5);
  G.camera.x += (cx - G.camera.x) * k;
  G.camera.y += (cy - G.camera.y) * k;
}

// --- shot staging -----------------------------------------------------------

function applyShot(shot) {
  startNewGame();
  const p = G.player;
  if (shot === 'walk') {
    p.x = 650;
    p.y = 330;
    G.mission.cardUntil = 0; // hide the intro card so the player is visible
    G.camera.x = Math.max(0, p.x - canvas.width / 2);
    G.camera.y = Math.max(0, p.y - canvas.height / 2);
  } else if (shot === 'drive') {
    const car = makeCar(1170, 790, 0, '#d94f3d', {});
    car.speed = 210;
    G.player.money = 350;
    G.mission.index = 1;
    startMission(G, 1);
    G.mission.cardUntil = 0; // hide the intro card so the car is visible
    enterCarSilent(car);
    G.camera.x = Math.max(0, p.x - canvas.width / 2);
    G.camera.y = Math.max(0, p.y - canvas.height / 2);
  } else if (shot === 'chase') {
    const car = makeCar(1430, 1010, Math.PI / 2, '#2fbf71', {});
    car.speed = 240;
    G.player.money = 1650;
    G.mission.index = 3;
    startMission(G, 3);
    G.mission.phase = 'escape';
    G.mission.marker = { x: PLACES.safehouse.x, y: PLACES.safehouse.y };
    G.chaseMode = true;
    G.wanted = 3;
    enterCarSilent(car);
    const cop1 = { kind: 'car', x: 1430, y: 860, angle: Math.PI / 2, speed: 300, hitCooldown: 0, flash: 0 };
    const cop2 = { kind: 'car', x: 1560, y: 1060, angle: Math.PI, speed: 280, hitCooldown: 0, flash: 0.5 };
    const foot1 = { kind: 'foot', x: 1330, y: 950, angle: 0, speed: TUNING.copFootSpeed, hitCooldown: 0, flash: 0 };
    const foot2 = { kind: 'foot', x: 1520, y: 920, angle: 0, speed: TUNING.copFootSpeed, hitCooldown: 0, flash: 0.3 };
    G.police.push(cop1, cop2, foot1, foot2);
    G.mission.cardUntil = 0; // hide the intro card so the chase is visible
    G.camera.x = Math.max(0, p.x - canvas.width / 2);
    G.camera.y = Math.max(0, p.y - canvas.height / 2);
  } else if (shot === 'mission') {
    const car = makeCar(650, 1300, Math.PI / 2, '#3d7dd9', {});
    car.speed = 120;
    G.player.money = 350;
    G.mission.index = 1;
    startMission(G, 1);
    G.mission.cardTitle = 'Mission 2 — The Pickup';
    G.mission.cardText = 'A package is waiting across town. Pick it up and deliver it.';
    G.mission.cardUntil = G.time + 30;
    enterCarSilent(car);
    G.camera.x = Math.max(0, p.x - canvas.width / 2);
    G.camera.y = Math.max(0, p.y - canvas.height / 2);
  }
}

function enterCarSilent(car) {
  G.player.car = car;
  G.player.inCar = true;
  car.mass = 2.5;
  G.player.x = car.x;
  G.player.y = car.y;
}

// --- update -----------------------------------------------------------------

function update(dt) {
  G.time += dt;

  if (G.phase === 'menu') {
    G.menuT += dt;
    // Slow attract pan over the city.
    G.camera.x = 700 + Math.sin(G.menuT * 0.08) * 500;
    G.camera.y = 500 + Math.cos(G.menuT * 0.06) * 300;
    if (G.input.wasPressed('Enter', 'n')) startNewGame();
    if (G.input.wasPressed('c') && hasSave()) continueGame();
    return;
  }
  if (G.phase === 'story') {
    if (G.input.wasPressed('r')) {
      clearSave();
      startNewGame();
    }
    if (G.input.wasPressed('Enter')) {
      G.phase = 'playing';
      G.mission.done = true;
    }
    return;
  }
  if (G.phase === 'paused') {
    if (G.input.wasPressed('p', 'Escape')) G.phase = 'playing';
    if (G.input.wasPressed('s')) {
      saveGame(G);
      G.flashMessage = 'Game saved.';
      G.flashUntil = G.time + 2;
    }
    return;
  }

  // Playing.
  if (G.input.wasPressed('p', 'Escape')) {
    G.phase = 'paused';
    saveGame(G);
    return;
  }
  if (G.input.wasPressed('m')) {
    G.sound.setMuted(!G.sound.muted);
  }

  updatePlayer(dt);

  // Traffic: drive, separate, and keep the count up. Traffic only stops for
  // other traffic — never for the player's car, so it cannot jam the player.
  for (const car of G.cars) {
    if (!car.traffic) continue;
    updateTrafficCar(car, G.cars, G.rng, dt);
  }
  const trafficCount = G.cars.filter((c) => c.traffic).length;
  if (trafficCount < TUNING.trafficCount) {
    G.trafficRespawnIn -= dt;
    if (G.trafficRespawnIn <= 0) {
      G.trafficRespawnIn = 3;
      G.cars.push(spawnTrafficCar(G.rng, G.player.x, G.player.y));
    }
  }

  // Car-car separation (traffic vs traffic, traffic vs player car).
  const allCars = G.player.car ? [...G.cars, G.player.car] : G.cars;
  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      separateCars(allCars[i], allCars[j]);
    }
  }

  // Pedestrians.
  for (const ped of G.peds) updatePedestrian(ped, G.rng, dt, G.time, G.city);

  // Wanted + police.
  updateWanted(G, dt);
  balancePolice(G);
  for (const cop of G.police) {
    if (cop.kind === 'foot') updateFootCop(cop, G, dt);
    else updatePatrolCar(cop, G, dt);
  }

  // Police cars also collide with traffic cars.
  for (const cop of G.police) {
    if (cop.kind !== 'car') continue;
    for (const car of G.cars) separateCars(cop, car);
    if (G.player.car) separateCars(cop, G.player.car);
  }

  updateCombat(G, dt);
  updateMissions(G, dt);

  // Particles.
  for (const pt of G.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);

  // Audio follows the game.
  const speedRatio = G.player.car ? Math.abs(G.player.car.speed) / TUNING.carMaxSpeed : 0;
  G.sound.engine(speedRatio, !!G.player.car);
  const policeNear = G.police.some((c) => Math.hypot(c.x - G.player.x, c.y - G.player.y) < 420);
  G.sound.siren(dt, G.wanted > 0 && policeNear);

  updateCamera(dt);
}

// --- draw -------------------------------------------------------------------

function draw() {
  const vw = canvas.width;
  const vh = canvas.height;
  ctx.fillStyle = '#0b1620';
  ctx.fillRect(0, 0, vw, vh);
  drawWorld(ctx, G);
  if (G.phase === 'playing' || G.phase === 'paused') drawHud(ctx, G);
  if (G.phase === 'menu') drawMenu(ctx);
  if (G.phase === 'paused') drawPaused(ctx);
  if (G.phase === 'story') drawStory(ctx);
}

function drawMenu(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 22, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLARA BAY', W / 2, H / 2 - 110);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '28px sans-serif';
  ctx.fillText('Streets of the Bay', W / 2, H / 2 - 66);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cfd8dc';
  ctx.fillText('Steal cars. Outrun the police. Finish the story.', W / 2, H / 2 - 28);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#7ddc8a';
  ctx.fillText('ENTER or N — New game', W / 2, H / 2 + 30);
  if (hasSave()) {
    ctx.fillText('C — Continue saved game', W / 2, H / 2 + 62);
  }
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('WASD move / drive · Shift run · E enter car · Mouse aim · Click shoot · P pause · M mute', W / 2, H / 2 + 110);
  ctx.restore();
}

function drawPaused(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 22, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 20);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '18px sans-serif';
  ctx.fillText('P — resume · S — save', W / 2, H / 2 + 22);
  ctx.restore();
}

function drawStory(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 22, 0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('STORY COMPLETE', W / 2, H / 2 - 60);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '22px sans-serif';
  ctx.fillText('You own Solara Bay now.', W / 2, H / 2 - 12);
  ctx.fillStyle = '#7ddc8a';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`Final money: $${G.player.money}`, W / 2, H / 2 + 32);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '16px sans-serif';
  ctx.fillText('ENTER — keep roaming · R — start a new story', W / 2, H / 2 + 78);
  ctx.restore();
}

// --- boot -------------------------------------------------------------------

populateWorld();

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  applyShot(shot);
} else if (params.get('autostart') === '1') {
  startNewGame();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  update(dt);
  draw();
  G.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test / automation API: a read-only snapshot plus screen mapping.
window.__game = {
  get state() {
    const t = currentTarget(G);
    return {
      phase: G.phase,
      time: G.time,
      money: G.player.money,
      hp: Math.round(G.player.hp),
      ammo: G.player.ammo,
      wanted: G.wanted,
      chaseMode: G.chaseMode,
      storyComplete: G.storyComplete,
      mission: G.mission.index,
      missionPhase: G.mission.phase,
      missionDone: G.mission.done,
      objective: currentObjective(G),
      target: { x: Math.round(t.x), y: Math.round(t.y), label: t.label },
      player: {
        x: Math.round(G.player.x), y: Math.round(G.player.y),
        angle: G.player.angle, inCar: G.player.inCar,
        speed: G.player.car ? Math.round(G.player.car.speed) : 0,
      },
      car: G.player.car ? {
        x: Math.round(G.player.car.x), y: Math.round(G.player.car.y),
        angle: G.player.car.angle, speed: Math.round(G.player.car.speed),
      } : null,
      cars: G.cars.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), traffic: c.traffic })),
      enemies: G.combat.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, alive: e.alive })),
      police: G.police.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), kind: c.kind })),
      pickups: G.combat.pickups.filter((p) => !p.taken).map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
      camera: { x: Math.round(G.camera.x), y: Math.round(G.camera.y) },
      vw: canvas.width,
      vh: canvas.height,
      stats: { ...G.stats },
    };
  },
  worldToScreen(x, y) {
    return { x: Math.round(x - G.camera.x), y: Math.round(y - G.camera.y) };
  },
};

export { G };
