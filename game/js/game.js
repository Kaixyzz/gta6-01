// SOLARA BAY — Streets of the Bay (v2): main game.
// Top-down open world: 6 story missions, side stashes, wanted/police, combat,
// vehicles (car / sports / bike / truck), title + pause + save/load, minimap.
import { buildCity, onRoad, nearestIntersection, pointInBuilding, WORLD_W, WORLD_H, SPOTS, AVENUES, STREETS } from './city.js';
import { SoundBank } from './audio.js';
import {
  Player, Vehicle, Enemy, Patrol, Bullet, Pickup,
  spawnTraffic, spawnPeds, moveOnFoot, driveVehicle, driveTraffic, updatePed,
} from './entities.js';
import { MISSIONS, STASH_SPOTS, missionMarker, missionTitle, missionObjective } from './missions.js';
import {
  drawWorld, drawSkids, drawVehicle, drawPatrol, drawPerson, drawPickup,
  drawMarker, drawParticles, drawMinimap, drawHud,
} from './render.js';

const VW = 1280;
const VH = 720;
const SAVE_KEY = 'solara-bay-save-v2';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const g = {
  city: null,
  player: null,
  traffic: [],
  parked: [],
  peds: [],
  enemies: [],
  footCops: [],
  patrols: [],
  bullets: [],
  particles: [],
  skids: [],
  pickups: [],
  stashes: [],
  missionIndex: 0,
  stage: 0,
  kills: 0,
  killsNeeded: 0,
  wanted: 0,
  wantedTimer: 0,
  moneyAtMissionStart: 50,
  stashGot: 0,
  stashTotal: STASH_SPOTS.length,
  storyComplete: false,
  started: false,
  paused: false,
  state: 'title', // title | playing | busted | wasted | complete
  cam: { x: 0, y: 0 },
  shake: 0,
  time: 0,
  keys: new Set(),
  mouse: { x: VW / 2, y: VH / 2, down: false },
  saveTimer: 0,
  crimeCd: 0,
  prevX: 0, prevY: 0, // previous frame's player pos (drives the bust rule)
  lastHurt: -99, // time of the last HP loss (drives the regen delay)
  prevHp: 100,
  spawnFlags: { gang: false, guards: false },
  shotMode: null,
  shotMarker: null,
  marker: null,
  sound: new SoundBank(),
  toastTimer: 0,
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  g.toastTimer = 2.6;
}

function showOverlay(id) {
  for (const o of ['overlay-title', 'overlay-pause', 'overlay-end']) {
    document.getElementById(o).classList.toggle('hidden', o !== id);
  }
}
function hideOverlays() {
  for (const o of ['overlay-title', 'overlay-pause', 'overlay-end']) {
    document.getElementById(o).classList.add('hidden');
  }
}

function freshWorld() {
  g.city = buildCity();
  g.traffic = spawnTraffic(g.city, 10);
  g.peds = spawnPeds(g.city, 26);
  g.parked = [];
  for (const s of g.city.parkedSpots) {
    let { x, y } = s;
    // Never park inside a building: nudge onto the nearest road.
    if (pointInBuilding(g.city.buildings, x, y, 6)) {
      const inter = nearestIntersection(x, y);
      x = inter.x + 30; y = inter.y;
    }
    const v = new Vehicle(x, y, s.angle, s.kind, true);
    g.parked.push(v);
  }
  g.enemies = [];
  g.footCops = [];
  g.patrols = [];
  g.bullets = [];
  g.particles = [];
  g.skids = [];
  g.pickups = [
    new Pickup(430, 1500, 'ammo'),
    new Pickup(1280, 960, 'ammo'),
    new Pickup(1120, 1180, 'health'),
  ];
  g.stashes = STASH_SPOTS.map((s) => ({ x: s.x, y: s.y, taken: false }));
  g.spawnFlags = { gang: false, guards: false };
}

function resetGame() {
  freshWorld();
  g.player = new Player(SPOTS.garage.x, SPOTS.garage.y);
  g.player.ammo = 24;
  g.missionIndex = 0;
  g.stage = 0;
  g.kills = 0;
  g.killsNeeded = 0;
  g.wanted = 0;
  g.wantedTimer = 0;
  g.moneyAtMissionStart = 50;
  g.stashGot = 0;
  g.storyComplete = false;
  g.paused = false;
  g.state = 'playing';
  g.cam.x = Math.max(0, Math.min(WORLD_W - VW, g.player.x - VW / 2));
  g.cam.y = Math.max(0, Math.min(WORLD_H - VH, g.player.y - VH / 2));
  updateMarker();
}

function saveGame() {
  if (!g.player || !g.started) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: g.missionIndex,
      stage: g.stage,
      money: g.player.money,
      x: g.player.x,
      y: g.player.y,
      hp: g.player.hp,
      ammo: g.player.ammo,
      stashGot: g.stashGot,
      storyComplete: g.storyComplete,
      stashes: g.stashes.map((s) => s.taken),
    }));
  } catch (e) { /* storage unavailable */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function updateMarker() {
  g.marker = g.shotMarker || missionMarker(g.missionIndex, g.stage);
}

function startNew() {
  g.shotMode = null;
  g.shotMarker = null;
  resetGame();
  g.started = true;
  g.sound.ensure();
  hideOverlays();
  saveGame();
}

function continueGame() {
  const s = loadSave();
  if (!s) { startNew(); return; }
  g.shotMode = null;
  g.shotMarker = null;
  freshWorld();
  g.player = new Player(s.x, s.y);
  g.player.money = s.money;
  g.player.hp = s.hp;
  g.player.ammo = s.ammo;
  g.missionIndex = s.missionIndex;
  g.stage = 0;
  g.kills = 0;
  g.killsNeeded = 0;
  g.wanted = 0;
  g.stashGot = s.stashGot || 0;
  g.stashes.forEach((st, i) => { st.taken = !!(s.stashes && s.stashes[i]); });
  g.storyComplete = !!s.storyComplete;
  g.moneyAtMissionStart = s.money;
  g.started = true;
  g.paused = false;
  g.sound.ensure();
  updateMarker();
  g.cam.x = Math.max(0, Math.min(WORLD_W - VW, g.player.x - VW / 2));
  g.cam.y = Math.max(0, Math.min(WORLD_H - VH, g.player.y - VH / 2));
  if (g.storyComplete) {
    g.state = 'complete';
    showEndCard();
  } else {
    g.state = 'playing';
    hideOverlays();
  }
}

function showEndCard() {
  const p = g.player;
  document.getElementById('end-stats').textContent =
    `Final money $${p.money}  •  Stashes ${g.stashGot}/${g.stashTotal}  •  6/6 missions`;
  showOverlay('overlay-end');
}

function restartMission() {
  const mi = g.missionIndex;
  const money = g.moneyAtMissionStart;
  const stashGot = g.stashGot;
  const stashes = g.stashes.map((s) => s.taken);
  freshWorld();
  g.player = new Player(SPOTS.garage.x, SPOTS.garage.y);
  g.player.money = money;
  g.player.ammo = 24;
  g.missionIndex = mi;
  g.stage = 0;
  g.kills = 0;
  g.killsNeeded = 0;
  g.wanted = 0;
  g.stashGot = stashGot;
  g.stashes.forEach((st, i) => { st.taken = stashes[i]; });
  g.paused = false;
  g.state = 'playing';
  hideOverlays();
  updateMarker();
  saveGame();
}

function raiseWanted(level) {
  if (level > g.wanted) { g.wanted = level; g.wantedTimer = 0; }
}

function chaseActive() {
  return (g.missionIndex === 3 && g.stage === 1) ||
    (g.missionIndex === 4 && g.stage === 2) ||
    (g.missionIndex === 5 && g.stage === 1);
}

function completeMission() {
  const m = MISSIONS[g.missionIndex];
  g.player.money += m.reward;
  g.moneyAtMissionStart = g.player.money;
  toast(`${m.title} complete  +$${m.reward}`);
  g.sound.cash();
  burst(g.player.x, g.player.y, '#ffd166', 14);
  g.missionIndex += 1;
  g.stage = 0;
  g.kills = 0;
  g.killsNeeded = 0;
  g.wanted = 0;
  g.footCops = [];
  g.patrols = [];
  if (g.missionIndex >= MISSIONS.length) {
    g.storyComplete = true;
    g.state = 'complete';
    saveGame();
    showEndCard();
  } else {
    g.state = 'playing';
    saveGame();
  }
  updateMarker();
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283;
    const sp = 40 + Math.random() * 160;
    g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, r: 2 + Math.random() * 3, color });
  }
  if (g.particles.length > 240) g.particles.splice(0, g.particles.length - 240);
}

function nearestCar(maxD) {
  let best = null; let bd = maxD;
  const all = [...g.parked, ...g.traffic];
  for (const v of all) {
    const d = Math.hypot(v.x - g.player.x, v.y - g.player.y);
    if (d < bd) { bd = d; best = v; }
  }
  // M6: prefer the boss sports car.
  if (g.missionIndex === 5 && g.stage === 0) {
    for (const v of g.parked) {
      if (v.kind === 'sports' && Math.hypot(v.x - g.player.x, v.y - g.player.y) < 90) return v;
    }
  }
  return best;
}

function enterCar() {
  if (!g.player.onFoot) return;
  const v = nearestCar(62);
  if (!v) return;
  g.player.car = v;
  g.player.onFoot = false;
  v.parked = false;
  const ti = g.traffic.indexOf(v);
  if (ti >= 0) g.traffic.splice(ti, 1);
  g.player.angle = v.angle;
  raiseWanted(1);
  g.sound.blip(300, 0.1, 0.08, 'square');
}

function exitCar() {
  if (g.player.onFoot || !g.player.car) return;
  const v = g.player.car;
  v.speed = 0;
  v.parked = true;
  g.parked.push(v);
  g.player.car = null;
  g.player.onFoot = true;
  g.player.x = v.x + Math.cos(v.angle + Math.PI / 2) * 26;
  g.player.y = v.y + Math.sin(v.angle + Math.PI / 2) * 26;
}

function fireBullet() {
  const p = g.player;
  if (p.ammo <= 0) { g.sound.blip(140, 0.08, 0.08, 'square'); return; }
  p.ammo -= 1;
  p.fireCd = 0.16;
  p.muzzle = 0.09;
  const wx = g.cam.x + g.mouse.x;
  const wy = g.cam.y + g.mouse.y;
  const a = Math.atan2(wy - p.y, wx - p.x);
  p.angle = a;
  g.bullets.push(new Bullet(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, true));
  g.shake = Math.min(7, g.shake + 2.5);
  g.sound.shot();
  raiseWanted(1);
}

function spawnPolice() {
  const footTarget = chaseActive() ? 2 : (g.wanted >= 1 ? Math.min(2, g.wanted) : 0);
  let patrolTarget = 0;
  if (g.missionIndex === 3 && g.stage === 1) patrolTarget = 3;
  else if (g.missionIndex === 5 && g.stage === 1) patrolTarget = 4;
  else if (g.missionIndex === 4 && g.stage === 2) patrolTarget = 2;
  else if (g.wanted >= 2) patrolTarget = g.wanted;
  const spawnAt = () => {
    const a = Math.random() * 6.283;
    const x = g.player.x + Math.cos(a) * 520;
    const y = g.player.y + Math.sin(a) * 520;
    const inter = nearestIntersection(Math.max(120, Math.min(WORLD_W - 120, x)), Math.max(120, Math.min(WORLD_H - 120, y)));
    return { x: inter.x, y: inter.y };
  };
  while (g.footCops.length < footTarget) {
    const s = spawnAt();
    g.footCops.push(new Enemy(s.x, s.y, 'cop'));
  }
  while (g.patrols.length < patrolTarget) {
    const s = spawnAt();
    const pt = new Patrol(s.x, s.y);
    pt.angle = Math.atan2(g.player.y - s.y, g.player.x - s.x);
    g.patrols.push(pt);
  }
  if (g.wanted === 0 && !chaseActive()) {
    g.footCops = [];
    g.patrols = [];
  }
}

function checkMissionTriggers() {
  const p = g.player;
  // M3 gang spawn: on foot within 350px, or very close in a car — the gang
  // should not open fire on a driver still approaching in a vehicle.
  if (g.missionIndex === 2 && !g.spawnFlags.gang) {
    const gd = Math.hypot(p.x - SPOTS.turf.x, p.y - SPOTS.turf.y);
    if ((p.onFoot && gd < 350) || gd < 150) {
      g.spawnFlags.gang = true;
      g.killsNeeded = 4;
      const offs = [[-40, -30], [40, -40], [-50, 40], [50, 30]];
      for (const [ox, oy] of offs) g.enemies.push(new Enemy(SPOTS.turf.x + ox, SPOTS.turf.y + oy, 'gang'));
      toast('Gang members ahead — take them down!');
    }
  }
  // M5 guard spawn: same rule as the gang — no opening fire on a driver
  // still approaching in a vehicle.
  if (g.missionIndex === 4 && g.stage === 0 && !g.spawnFlags.guards) {
    const bd = Math.hypot(p.x - SPOTS.bankVault.x, p.y - SPOTS.bankVault.y);
    if ((p.onFoot && bd < 350) || bd < 150) {
      g.spawnFlags.guards = true;
      g.killsNeeded = 3;
      const offs = [[-50, -20], [50, -30], [0, 50]];
      for (const [ox, oy] of offs) g.enemies.push(new Enemy(SPOTS.bankVault.x + ox, SPOTS.bankVault.y + oy, 'guard'));
      toast('Bank guards! Clear the vault.');
    }
  }
  // Marker arrivals.
  const m = g.marker;
  if (!m) return;
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  const inCar = !p.onFoot;
  if (g.missionIndex === 0 && inCar && d < 90) completeMission();
  else if (g.missionIndex === 1 && g.stage === 0 && inCar && d < 80) {
    g.stage = 1; updateMarker(); toast('Package collected — deliver it!');
  } else if (g.missionIndex === 1 && g.stage === 1 && inCar && d < 80) completeMission();
  else if (g.missionIndex === 2 && g.kills >= 4 && g.killsNeeded === 4) completeMission();
  else if (g.missionIndex === 3 && g.stage === 0 && inCar && d < 80) {
    g.stage = 1; g.wanted = 3; g.wantedTimer = 0; updateMarker();
    toast('POLICE CHASE — escape to the safehouse!');
  } else if (g.missionIndex === 3 && g.stage === 1 && inCar && d < 90) completeMission();
  else if (g.missionIndex === 4 && g.stage === 0 && g.kills >= 3 && g.killsNeeded === 3) {
    g.stage = 1; updateMarker(); toast('Vault clear — grab the cash!');
  } else if (g.missionIndex === 4 && g.stage === 1 && d < 65) {
    g.stage = 2; g.wanted = 2; g.wantedTimer = 0; updateMarker();
    toast('Cash grabbed — getaway car, now! Wanted 2★');
  } else if (g.missionIndex === 4 && g.stage === 2 && inCar && d < 90) completeMission();
  else if (g.missionIndex === 5 && g.stage === 0 && !p.onFoot && p.car && p.car.kind === 'sports') {
    g.stage = 1; g.wanted = 3; g.wantedTimer = 0; updateMarker();
    toast('THE BIGGEST CHASE — escape to the safehouse!');
  } else if (g.missionIndex === 5 && g.stage === 1 && inCar && d < 90) completeMission();
}

function update(dt) {
  g.time += dt;
  if (g.toastTimer > 0) {
    g.toastTimer -= dt;
    if (g.toastTimer <= 0) document.getElementById('toast').classList.add('hidden');
  }
  if (!g.started || g.paused || g.state !== 'playing') {
    g.sound.engine(0, false);
    return;
  }
  const p = g.player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  g.crimeCd = Math.max(0, g.crimeCd - dt);
  // Slow HP regen after 4s without taking damage: a rough chase should not
  // leave the player at 1 HP for the next shootout.
  if (p.hp < g.prevHp) g.lastHurt = g.time;
  g.prevHp = p.hp;
  if (p.hp > 0 && p.hp < p.maxHp && g.time - g.lastHurt > 4) {
    p.hp = Math.min(p.maxHp, p.hp + 4 * dt);
  }

  // Movement.
  if (p.onFoot) {
    moveOnFoot(p, g.keys, dt, g.city);
  } else if (p.car) {
    const v = p.car;
    const prevX = v.x, prevY = v.y;
    const hit = driveVehicle(v, g.keys, dt, g.city, [...g.traffic, ...g.parked]);
    // Parked-car collision: shove the parked car aside (ramming works),
    // slow down a little instead of getting wedged.
    for (const o of g.parked) {
      if (o === v) continue;
      const dx = v.x - o.x, dy = v.y - o.y;
      const dd = Math.hypot(dx, dy);
      if (dd > 0.01 && dd < 36) {
        o.x -= (dx / dd) * (36 - dd);
        o.y -= (dy / dd) * (36 - dd);
        if (Math.abs(v.speed) > 200) { v.speed *= 0.85; g.shake = Math.min(8, g.shake + 2); g.sound.crash(); }
      }
    }
    if (hit === 'wall' && Math.abs(v.speed) > 140) { g.shake = Math.min(8, g.shake + 3); g.sound.crash(); p.hp = Math.max(1, p.hp - 2); }
    if (hit === 'bump') { g.shake = Math.min(6, g.shake + 2); }
    // Skid marks when turning hard at speed.
    if (Math.abs(v.speed) > 200 && (g.keys.has('a') || g.keys.has('d'))) {
      g.skids.push({ x1: prevX, y1: prevY, x2: v.x, y2: v.y });
      if (g.skids.length > 220) g.skids.splice(0, g.skids.length - 220);
    }
    // Running over pedestrians is a crime.
    for (const ped of g.peds) {
      if (Math.hypot(ped.x - v.x, ped.y - v.y) < 18 && Math.abs(v.speed) > 40 && g.crimeCd <= 0) {
        raiseWanted(Math.min(3, g.wanted + 1));
        g.crimeCd = 2;
        ped.flee = 1.5;
        g.shake = Math.min(8, g.shake + 4);
        g.sound.crash();
      }
    }
    p.x = v.x; p.y = v.y;
    p.angle = v.angle;
    g.sound.engine(Math.abs(v.speed) / v.stats.top, true);
  } else {
    g.sound.engine(0, false);
  }

  // Shooting.
  if (g.mouse.down && p.onFoot && p.fireCd <= 0) fireBullet();

  // Traffic + pedestrians.
  for (const t of g.traffic) driveTraffic(t, dt, g.city, p.car);
  const danger = g.mouse.down ? { x: p.x, y: p.y } : null;
  for (const ped of g.peds) updatePed(ped, dt, g.city, danger);

  // Wanted decay (not during a chase).
  if (!chaseActive() && g.wanted > 0) {
    g.wantedTimer += dt;
    if (g.wantedTimer > 25) { g.wanted -= 1; g.wantedTimer = 0; }
  }
  g.sound.siren(g.wanted > 0, dt);
  spawnPolice();

  // Foot cops pursue; busted on sustained contact — but only while the
  // player is effectively standing still, and never in the middle of an
  // active gunfight (cops will not rush an armed shootout). A cop cannot
  // grab someone who is running away, so the bust timer does not build
  // while the player moves.
  const pSpeed = dt > 0 ? Math.hypot(p.x - g.prevX, p.y - g.prevY) / dt : 0;
  g.prevX = p.x; g.prevY = p.y;
  let copTouch = false;
  for (const c of g.footCops) {
    const dx = p.x - c.x, dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const sp = c.speed * dt;
      let nx = c.x + (dx / d) * sp;
      let ny = c.y + (dy / d) * sp;
      if (!pointInBuilding(g.city.buildings, nx, c.y, 8)) c.x = nx;
      if (!pointInBuilding(g.city.buildings, c.x, ny, 8)) c.y = ny;
    }
    if (p.onFoot && d < 25 && pSpeed < 30 && g.enemies.length === 0) copTouch = true;
  }
  if (copTouch && p.onFoot) {
    p.bustTimer += dt;
    if (p.bustTimer >= 3) {
      g.state = 'busted';
      document.getElementById('pause-sub').textContent = 'BUSTED — the cops got you. Restart the mission to try again.';
      showOverlay('overlay-pause');
      return;
    }
  } else {
    p.bustTimer = Math.max(0, p.bustTimer - dt * 2);
  }

  // Patrol cars chase and ram.
  for (const pt of g.patrols) {
    const dx = p.x - pt.x, dy = p.y - pt.y;
    const d = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    let diff = desired - pt.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    pt.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
    const target = d > 90 ? 300 : 170;
    pt.speed += (target - pt.speed) * Math.min(1, dt * 1.6);
    const nx = pt.x + Math.cos(pt.angle) * pt.speed * dt;
    const ny = pt.y + Math.sin(pt.angle) * pt.speed * dt;
    if (!pointInBuilding(g.city.buildings, nx, ny, 12)) { pt.x = nx; pt.y = ny; }
    pt.flash = Math.max(0, pt.flash - dt);
    if (d < 34) {
      // Ram: shove the player car (never into a building — a shove into a
      // wall would wedge the car with no way out). HP chip only applies
      // on foot: a patrol ramming your car slows and shoves it, it does
      // not kill the driver.
      if (p.car) {
        const shx = (dx / Math.max(1, d)) * 26 * dt * 10;
        const shy = (dy / Math.max(1, d)) * 26 * dt * 10;
        const nx = p.car.x + shx, ny = p.car.y + shy;
        if (!pointInBuilding(g.city.buildings, nx, ny, 12)) { p.car.x = nx; p.car.y = ny; }
        p.x = p.car.x; p.y = p.car.y;
      }
      if (p.onFoot && g.crimeCd <= 0) { p.hp -= 3; g.crimeCd = 0.6; g.shake = Math.min(8, g.shake + 3); }
    }
  }

  // Enemies: chase + shoot.
  for (const e of g.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 420 && d > 60) {
      let nx = e.x + (dx / d) * e.speed * dt;
      let ny = e.y + (dy / d) * e.speed * dt;
      if (!pointInBuilding(g.city.buildings, nx, e.y, 8)) e.x = nx;
      if (!pointInBuilding(g.city.buildings, e.x, ny, 8)) e.y = ny;
    }
    e.shootCd -= dt;
    if (e.shootCd <= 0 && d < 380) {
      e.shootCd = 1.7 + Math.random() * 0.5;
      const spread = (Math.random() - 0.5) * 0.35;
      const a = Math.atan2(dy, dx) + spread;
      g.bullets.push(new Bullet(e.x, e.y, a, false));
      e.flash = 0.12;
    }
  }

  // Bullets.
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(g.city.buildings, b.x, b.y, 0)) {
      burst(b.x, b.y, '#cccccc', 4); dead = true;
    }
    if (!dead && b.fromPlayer) {
      for (let j = g.enemies.length - 1; j >= 0; j--) {
        const e = g.enemies[j];
        if (Math.hypot(e.x - b.x, e.y - b.y) < 15) {
          e.hp -= 1; e.flash = 0.15;
          burst(b.x, b.y, '#ffdd33', 5);
          if (e.hp <= 0) {
            g.enemies.splice(j, 1);
            g.kills += 1;
            burst(e.x, e.y, '#e74c3c', 12);
            if (Math.random() < 0.6) g.pickups.push(new Pickup(e.x, e.y, 'ammo'));
          }
          dead = true; break;
        }
      }
      if (!dead) for (let j = g.footCops.length - 1; j >= 0; j--) {
        const c = g.footCops[j];
        if (Math.hypot(c.x - b.x, c.y - b.y) < 13) {
          c.hp -= 1;
          if (c.hp <= 0) { g.footCops.splice(j, 1); raiseWanted(2); }
          dead = true; break;
        }
      }
      if (!dead) for (const pt of g.patrols) {
        if (Math.hypot(pt.x - b.x, pt.y - b.y) < 20) { pt.hp -= 1; pt.flash = 0.15; dead = true; break; }
      }
    }
    if (!dead && !b.fromPlayer) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < 11) {
        p.hp -= 4;
        burst(b.x, b.y, '#e74c3c', 5);
        g.shake = Math.min(6, g.shake + 2);
        dead = true;
      }
    }
    if (dead) g.bullets.splice(i, 1);
  }

  // Pickups + stashes.
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 28) {
      if (pk.kind === 'ammo') { p.ammo += 12; toast('Ammo +12'); }
      else { p.hp = Math.min(p.maxHp, p.hp + 40); toast('Health +40'); }
      g.sound.pickup();
      g.pickups.splice(i, 1);
    }
  }
  for (const s of g.stashes) {
    if (!s.taken && Math.hypot(p.x - s.x, p.y - s.y) < 30) {
      s.taken = true;
      g.stashGot += 1;
      p.money += 100;
      toast(`Hidden stash found! +$100  (${g.stashGot}/${g.stashTotal})`);
      g.sound.pickup();
      burst(s.x, s.y, '#ffd166', 10);
    }
  }

  // Particles.
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const pt = g.particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) g.particles.splice(i, 1);
  }

  // Player wasted.
  if (p.hp <= 0) {
    p.hp = 0;
    g.state = 'wasted';
    document.getElementById('pause-sub').textContent = 'WASTED — you went down. Restart the mission to try again.';
    showOverlay('overlay-pause');
    return;
  }

  checkMissionTriggers();

  // Camera: smooth follow.
  const tx = Math.max(0, Math.min(WORLD_W - VW, p.x - VW / 2));
  const ty = Math.max(0, Math.min(WORLD_H - VH, p.y - VH / 2));
  const k = 1 - Math.exp(-8 * dt);
  g.cam.x += (tx - g.cam.x) * k;
  g.cam.y += (ty - g.cam.y) * k;
  g.shake = Math.max(0, g.shake - dt * 14);

  // Autosave.
  g.saveTimer += dt;
  if (g.saveTimer > 4) { g.saveTimer = 0; saveGame(); }
}

function render() {
  const shx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
  const shy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
  const cam = { x: g.cam.x + shx, y: g.cam.y + shy };
  ctx.save();
  ctx.clearRect(0, 0, VW, VH);
  // World space: shift the canvas so the camera's top-left is at (0,0).
  // (Without this the world was drawn at raw world coords and the camera
  // never actually followed the player.)
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, cam, g.city, g.time);
  drawSkids(ctx, g.skids);
  drawMarker(ctx, g.marker, g.time);
  for (const pk of g.pickups) drawPickup(ctx, pk, g.time);
  for (const s of g.stashes) {
    if (!s.taken) drawPickup(ctx, { x: s.x, y: s.y, kind: 'stash', bob: 0 }, g.time);
  }
  for (const v of g.parked) drawVehicle(ctx, v, false);
  for (const t of g.traffic) drawVehicle(ctx, t, false);
  for (const pt of g.patrols) drawPatrol(ctx, pt);
  for (const ped of g.peds) drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.color, {});
  for (const e of g.enemies) {
    drawPerson(ctx, e.x, e.y, Math.atan2(g.player.y - e.y, g.player.x - e.x),
      e.kind === 'guard' ? '#1a3a8c' : '#c0392b', '#f5c6a5', { armed: true, flash: e.flash });
    // HP pips above enemy.
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - 12, e.y - 20, 24, 4);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(e.x - 12, e.y - 20, 24 * (e.hp / 3), 4);
  }
  for (const c of g.footCops) {
    drawPerson(ctx, c.x, c.y, Math.atan2(g.player.y - c.y, g.player.x - c.x), '#1a3a8c', '#f5c6a5', { armed: true });
  }
  if (g.player.car) drawVehicle(ctx, g.player.car, true);
  else drawPerson(ctx, g.player.x, g.player.y, g.player.angle, '#ffd166', '#f5c6a5', { armed: true, muzzle: g.player.muzzle });
  drawParticles(ctx, g.particles);
  ctx.restore();
  // Screen-space HUD + minimap (drawn after restore so shake does not move them).
  if (g.started && g.state !== 'title') {
    drawHud(ctx, g, g.time);
    drawMinimap(ctx, g.city, g, cam);
  }
}

function setupShot(shot) {
  g.shotMode = shot;
  resetGame();
  g.started = true;
  g.state = 'playing';
  hideOverlays();
  const p = g.player;
  if (shot === 'walk') {
    // Most cinematic: player on foot on the beachfront promenade — city
    // blocks left, palms + umbrellas + sand + water right, traffic + peds
    // + marker in frame.
    p.x = 2200; p.y = 900;
    g.shotMarker = { x: 2380, y: 1080 };
    updateMarker();
    // Extra crowd + cars around the player for the shot.
    for (let i = 0; i < 6; i++) {
      g.peds.push({ x: 2140 + i * 26, y: 860 + (i % 2) * 60, angle: 0, speed: 30, color: '#f5c6a5', shirt: ['#e74c3c', '#3498db', '#2ecc71'][i % 3], flee: 0, retarget: 9 });
    }
    g.traffic.push(new Vehicle(2240, 760, Math.PI / 2, 'car', false));
    g.traffic.push(new Vehicle(2240, 1080, -Math.PI / 2, 'car', false));
    g.traffic[0].speed = 0; g.traffic[1].speed = 0;
    g.cam.x = Math.max(0, Math.min(WORLD_W - VW, p.x - VW / 2));
    g.cam.y = Math.max(0, Math.min(WORLD_H - VH, p.y - VH / 2));
  } else if (shot === 'drive') {
    const v = new Vehicle(1280, 700, Math.PI / 2, 'car', false);
    g.player.car = v; g.player.onFoot = false;
    p.x = v.x; p.y = v.y; p.angle = v.angle;
    v.speed = 200;
    g.cam.x = p.x - VW / 2; g.cam.y = p.y - VH / 2;
  } else if (shot === 'chase') {
    const v = new Vehicle(1280, 960, 0, 'car', false);
    g.player.car = v; g.player.onFoot = false;
    p.x = v.x; p.y = v.y;
    g.missionIndex = 3; g.stage = 1; g.wanted = 3;
    updateMarker();
    const pt1 = new Patrol(1180, 900); pt1.angle = 0;
    const pt2 = new Patrol(1400, 1020); pt2.angle = Math.PI;
    const pt3 = new Patrol(1280, 830); pt3.angle = Math.PI / 2;
    g.patrols = [pt1, pt2, pt3];
    g.footCops = [new Enemy(1220, 1000, 'cop'), new Enemy(1360, 900, 'cop')];
    g.cam.x = p.x - VW / 2; g.cam.y = p.y - VH / 2;
  } else if (shot === 'mission') {
    p.x = 1150; p.y = 1150;
    g.missionIndex = 2; g.stage = 0; g.kills = 0; g.killsNeeded = 4;
    p.ammo = 24;
    const offs = [[-40, -30], [40, -40], [-50, 40], [50, 30]];
    for (const [ox, oy] of offs) g.enemies.push(new Enemy(SPOTS.turf.x + ox, SPOTS.turf.y + oy, 'gang'));
    g.spawnFlags.gang = true;
    updateMarker();
    g.cam.x = p.x - VW / 2; g.cam.y = p.y - VH / 2;
  }
}

// --- input ---

const KEYMAP = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
window.addEventListener('keydown', (e) => {
  const k = (KEYMAP[e.key] || e.key).toLowerCase();
  if (['w', 'a', 's', 'd'].includes(k)) { g.keys.add(k); e.preventDefault(); }
  if (k === 'e' && g.started && !g.paused && g.state === 'playing') {
    if (g.player.onFoot) enterCar(); else exitCar();
  }
  if ((k === 'p' || k === 'escape') && g.started && (g.state === 'playing' || g.paused)) {
    g.paused = !g.paused;
    if (g.paused) {
      document.getElementById('pause-sub').textContent = 'Take a breath. The Bay waits.';
      showOverlay('overlay-pause');
    } else hideOverlays();
  }
  if (k === 'enter' && g.state === 'title') startNew();
});
window.addEventListener('keyup', (e) => {
  const k = (KEYMAP[e.key] || e.key).toLowerCase();
  g.keys.delete(k);
});
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  g.mouse.x = e.clientX - r.left;
  g.mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) { g.mouse.down = true; g.sound.ensure(); }
});
window.addEventListener('mouseup', () => { g.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('btn-start').addEventListener('click', startNew);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', () => { g.paused = false; hideOverlays(); });
document.getElementById('btn-restart').addEventListener('click', restartMission);
document.getElementById('btn-quit').addEventListener('click', () => {
  saveGame();
  g.started = false; g.state = 'title'; g.paused = false;
  refreshTitleButtons();
  showOverlay('overlay-title');
});
document.getElementById('btn-again').addEventListener('click', startNew);
document.getElementById('btn-title2').addEventListener('click', () => {
  g.started = false; g.state = 'title'; g.paused = false;
  refreshTitleButtons();
  showOverlay('overlay-title');
});

function refreshTitleButtons() {
  document.getElementById('btn-continue').classList.toggle('hidden', !loadSave());
}

// --- driver / test hook ---
window.__game = {
  state() {
    const p = g.player || { x: 0, y: 0, money: 50, hp: 100, ammo: 0, angle: 0 };
    const cars = [...g.parked, ...g.traffic];
    return {
      started: g.started,
      paused: g.paused,
      state: g.state,
      storyComplete: g.storyComplete,
      missionIndex: g.missionIndex,
      stage: g.stage,
      money: p.money,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      wanted: g.wanted,
      px: Math.round(p.x),
      py: Math.round(p.y),
      inCar: !p.onFoot,
      carAngle: p.car ? p.car.angle : p.angle,
      carSpeed: p.car ? Math.round(p.car.speed) : 0,
      marker: g.marker ? { x: g.marker.x, y: g.marker.y } : null,
      enemies: g.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y) })),
      footCops: g.footCops.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      kills: g.kills,
      pickups: g.pickups.map((pk) => ({ x: pk.x, y: pk.y, kind: pk.kind })),
      carsNear: cars
        .map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), d: Math.round(Math.hypot(v.x - p.x, v.y - p.y)), parked: v.parked }))
        .filter((c) => c.d < 700)
        .sort((a, b) => a.d - b.d),
      patrol: g.patrols.length,
      cops: g.footCops.length,
      cam: { x: Math.round(g.cam.x), y: Math.round(g.cam.y) },
      stash: g.stashGot,
      stashTotal: g.stashTotal,
      missionTitle: missionTitle(g.missionIndex),
    };
  },
};

// --- boot ---
(function boot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  g.city = buildCity();
  g.player = new Player(SPOTS.garage.x, SPOTS.garage.y);
  g.player.ammo = 24;
  if (shot) {
    setupShot(shot);
  } else {
    freshWorld();
    g.player = new Player(SPOTS.garage.x, SPOTS.garage.y);
    g.player.ammo = 24;
    g.state = 'title';
    refreshTitleButtons();
    showOverlay('overlay-title');
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    requestAnimationFrame(frame); // schedule first: one bad frame never kills the loop
    update(dt);
    if (g.started) render();
  }
  requestAnimationFrame(frame);
})();
