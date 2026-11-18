// SOLARA BAY — Streets of the Bay. Game loop, states, staging presets.
import { CFG } from './config.js';
import { makeRng } from './rng.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { buildCity } from './city.js';
import { makePlayer, updatePlayer, damagePlayer } from './player.js';
import { makeCar, driveCar, spawnParked } from './vehicles.js';
import { makeTraffic, updateTraffic } from './traffic.js';
import { makePeds, updatePeds } from './pedestrians.js';
import { makePolice } from './police.js';
import { updateCombat, spawnPickup } from './combat.js';
import { makeMissions } from './missions.js';
import { makeHud } from './hud.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { drawWorld } from './render.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const G = {
  rng: makeRng(20261118),
  input: makeInput(canvas),
  audio: makeAudio(),
  city: null,
  player: null,
  parked: [],
  traffic: [],
  peds: [],
  cops: [],
  patrols: [],
  bullets: [],
  ebullets: [],
  enemies: [],
  pickups: [],
  particles: [],
  goldCar: null,
  wanted: 0,
  quietT: 0,
  lastCrimeT: 0,
  lastShot: null,
  storyComplete: false,
  state: 'menu', // menu | playing | ended
  paused: false,
  muted: false,
  time: 0,
  camera: { x: 0, y: 0 },
  ctx,
  police: null,
  missions: null,
  hud: null,
};

function initWorld() {
  G.city = buildCity(G.rng);
  G.player = makePlayer(G.city.spawn);
  G.parked = []; G.traffic = []; G.peds = [];
  G.cops = []; G.patrols = [];
  G.bullets = []; G.ebullets = []; G.enemies = [];
  G.pickups = []; G.particles = [];
  G.wanted = 0; G.quietT = 0; G.lastCrimeT = 0; G.lastShot = null;
  G.storyComplete = false;
  G.police = makePolice(G);
  G.missions = makeMissions(G);
  spawnParked(G);
  makeTraffic(G, 10);
  makePeds(G, 16);
  spawnPickup(G, G.city.hospital.x + 130, G.city.hospital.y + 40, 'health');
  spawnPickup(G, G.city.garage.x - 130, G.city.garage.y - 40, 'ammo');
  spawnPickup(G, 2500, 1800, 'health');
  spawnPickup(G, 1100, 400, 'ammo');
}

G.endRun = function (kind) {
  if (G.state !== 'playing') return;
  const p = G.player;
  p.money = Math.floor(p.money * (1 - CFG.BUSTED_PENALTY));
  G.audio.busted();
  G.audio.engineStop();
  G.audio.musicStop();
  G.state = 'ended';
  G.hud.showEnd(kind);
  saveGame(G);
};

G.retry = function () {
  const p = G.player;
  p.hp = CFG.PLAYER_HP;
  if (p.inCar && p.car) {
    // Leave the car behind as a parked car, so it stays in the world.
    p.car.driver = null;
    p.car.speed = 0;
    p.car.parked = true;
    G.parked.push(p.car);
    p.inCar = false;
    p.car = null;
  }
  p.x = G.city.hospital.x; p.y = G.city.hospital.y;
  p.ammo = Math.max(p.ammo, 6);
  G.wanted = 0;
  G.cops = []; G.patrols = [];
  G.bullets = []; G.ebullets = [];
  G.hud.hideEnd();
  G.state = 'playing';
  G.audio.musicStart();
};

function startGame(useSave) {
  const saved = useSave ? loadGame() : null;
  initWorld();
  G.hud.hideMenu();
  G.hud.hideEnd();
  G.hud.hideWin();
  if (saved) {
    G.player.money = saved.money;
    G.player.hp = saved.hp;
    G.player.ammo = saved.ammo;
    G.player.x = saved.x; G.player.y = saved.y;
    G.storyComplete = !!saved.storyComplete;
    if (G.storyComplete) G.missions.start(4);
    else if (saved.missionIndex < 4) G.missions.start(saved.missionIndex);
  } else {
    clearSave();
    G.missions.start(0);
  }
  G.state = 'playing';
  G.paused = false;
  G.audio.ensure();
  G.audio.musicStart();
  applyShot(new URLSearchParams(location.search).get('shot'));
}

// Staging presets for screenshots: put the game in a photogenic state.
// The chase preset must show the wanted level AND police on screen: wanted
// is set directly, two patrol cars are placed in clear view (one ahead, one
// behind the player's car) and two foot officers stand nearby.
function applyShot(shot) {
  if (!shot) return;
  const p = G.player;
  if (shot === 'walk') {
    p.x = 1100; p.y = 1100;
  } else if (shot === 'drive') {
    const car = makeCar('sport', 1800, 1800, 0, { rng: G.rng });
    G.parked.push(car);
    p.x = car.x; p.y = car.y;
    p.inCar = true; p.car = car; car.driver = 'player'; car.parked = false;
    car.speed = 320;
  } else if (shot === 'chase') {
    const car = makeCar('sedan', 1800, 1100, 0, { rng: G.rng });
    G.parked.push(car);
    p.x = car.x; p.y = car.y;
    p.inCar = true; p.car = car; car.driver = 'player'; car.parked = false;
    car.speed = 380;
    G.wanted = 3;
    G.quietT = 0;
    const ahead = makeCar('police', 1800 + 300, 1100 - 30, Math.PI, { isPatrol: true, rng: G.rng });
    ahead.speed = 300;
    const behind = makeCar('police', 1800 - 300, 1100 + 30, 0, { isPatrol: true, rng: G.rng });
    behind.speed = 320;
    G.patrols.push(ahead, behind);
    G.cops.push({ x: 1800 + 180, y: 1100 + 150, angle: 0 });
    G.cops.push({ x: 1800 - 200, y: 1100 - 140, angle: 0 });
  } else if (shot === 'mission') {
    G.missions.start(1);
    p.x = G.city.goldSpot.x - 120; p.y = G.city.goldSpot.y + 30;
  }
}

function update(dt) {
  const p = G.player;
  const input = G.input;
  // Pause toggle: edge-triggered, one press = one toggle.
  if (input.wasPressed('KeyP') && G.state === 'playing') {
    G.paused = !G.paused;
    G.hud.showPause(G.paused);
    if (G.paused) G.audio.musicStop(); else G.audio.musicStart();
  }
  if (input.wasPressed('KeyM')) {
    G.muted = !G.muted;
    G.audio.setMuted(G.muted);
    G.hud.setMute(G.muted);
  }
  if (G.paused) return;
  updatePlayer(G, dt);
  if (p.inCar && p.car) {
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0)
      - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0)
      + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
    driveCar(G, p.car, throttle, steer, dt);
    G.audio.engineSet(Math.abs(p.car.speed) / p.car.maxSpeed);
  } else {
    G.audio.engineStop();
  }
  updateTraffic(G, dt);
  updatePeds(G, dt);
  G.police.update(dt);
  updateCombat(G, dt);
  G.missions.update(dt);
  G.hud.update(G);
}

let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (G.state === 'playing') {
    G.time += dt;
    update(dt);
  } else if (G.state === 'menu') {
    G.time += dt;
    // Slow ambient pan behind the menu.
    G.camera.x = 600 + Math.sin(G.time * 0.05) * 500;
    G.camera.y = 500 + Math.cos(G.time * 0.04) * 300;
  }
  drawWorld(G);
  G.input.endFrame();
}

G.hud = makeHud();
G.input.attach();
initWorld();
G.hud.showMenu(hasSave());
G.hud.el.btnStart.addEventListener('click', () => { G.audio.click(); startGame(false); });
G.hud.el.btnContinue.addEventListener('click', () => { G.audio.click(); startGame(true); });
G.hud.el.btnResume.addEventListener('click', () => {
  G.paused = false; G.hud.showPause(false); G.audio.musicStart();
});
G.hud.el.btnRetry.addEventListener('click', () => { G.audio.click(); G.retry(); });
G.hud.el.btnWinContinue.addEventListener('click', () => { G.audio.click(); G.hud.hideWin(); });
G.hud.el.btnMute.addEventListener('click', () => {
  G.muted = !G.muted; G.audio.setMuted(G.muted); G.hud.setMute(G.muted);
});

// Expose for automated testing / screenshots.
window.__game = G;
window.__start = startGame;
requestAnimationFrame(loop);
