// game.js — SOLARA BAY v3 (visual-first rebuild).
// Top-down 2D open-world crime game: 7 staged story missions, a 3-person
// crew with real abilities, district standing, taxi fares, street races,
// Sun Shell collectibles, day/night clock, save slots, stats screen.
// All art is drawn in code (render.js); all sound is WebAudio (audio.js).
import { makeRng, clamp, normAngle, dist } from './rng.js';
import {
  createWorld, WORLD_W, WORLD_H, AVENUES, STREETS, ROAD_HALF,
  districtAt, collideCircle, pointInBuilding, findOpenSpot, onRoad, isWater,
} from './city.js';
import {
  CAR_TYPES, makeCar, stepCarPhysics, separateCars, makeTrafficCar,
  stepTraffic, makePedestrian, stepPedestrian, makePatrolCar, stepPatrol,
  makeFootCop, stepFootCop, makeHelicopter, stepHelicopter,
} from './entities.js';
import { CREW, MISSIONS, MISSION_SPOTS, standingStatus, makeTaxi, makeRaces } from './missions.js';
import { drawScene, drawSunset, drawMinimap } from './render.js';
import { AudioEngine } from './audio.js';

export const ZOOM = 2.3;
const SAVE_KEY = 'solara-bay-save-v3';
const SEED = 1337;
const MARKER_TRIGGER = 90;
const CASH_TRIGGER = 65;

function $(id) { return document.getElementById(id); }

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = ZOOM;
    this.audio = new AudioEngine();
    this.rng = makeRng(SEED);
    this.keys = new Set();
    this.mouse = { x: 640, y: 360, down: false };
    this.phase = 'title';
    this.started = false;
    this.storyComplete = false;
    this.time = 0;
    this.lastTs = 0;
    this.muzzle = 0;
    this.aimAngle = 0;
    this.playerAngle = 0;
    this.fireCooldown = 0;
    this.shotMode = new URLSearchParams(window.location.search).get('shot') || null;
    this.staging = !!this.shotMode;
    this.autoFire = false;
    this.initWorld();
    this.bindInput();
    this.updateTitleSlots();
  }

  initWorld() {
    this.world = createWorld(SEED);
    this.money = 50;
    this.missionIndex = 0;
    this.stage = 0;
    this.kills = 0;
    this.hp = 100;
    this.ammo = 48;
    this.wanted = 0;
    this.night = false;
    this.clockMin = 16 * 60;
    this.px = 640;
    this.py = 320;
    this.playerAngle = -Math.PI / 2;
    this.inCar = false;
    this.playerCar = null;
    this.enemies = [];
    this.cops = [];
    this.patrolCars = [];
    this.heli = null;
    this.bullets = [];
    this.particles = [];
    this.taxi = makeTaxi();
    this.races = makeRaces(this.world);
    this.race = { active: false, name: '', timeLeft: 0, checkpoints: [], nextIndex: 0 };
    this.shellsCollected = 0;
    this.seenStages = [];
    this.dialogueLog = [];
    this.dialogue = null;
    this.dialogueT = 0;
    this.qCooldown = 0;
    this.rCooldown = 0;
    this.wantedTimer = 0;
    this.stats = { carsStolen: 0, distance: 0, copsEscaped: 0, takedowns: 0, longestJump: 0, topWanted: 0 };
    this.marker = null;
    this.cam = { x: 640 - 1280 / this.zoom / 2, y: 320 - 720 / this.zoom / 2 };
    this.spawnCars();
    this.spawnPeds();
    this.bossCar = null;
    this.bossReset = false;
    this.spawnBossCar();
  }

  spawnCars() {
    this.allCars = [];
    // parked cars along the streets (stealable) — never near the marina
    const parkedSpots = [
      { x: 720, y: 320 }, { x: 960, y: 400 }, { x: 1280, y: 380 }, { x: 1600, y: 400 },
      { x: 320, y: 700 }, { x: 960, y: 700 }, { x: 1920, y: 700 }, { x: 640, y: 1020 },
      { x: 1280, y: 1020 }, { x: 1920, y: 1020 }, { x: 320, y: 1340 }, { x: 960, y: 1340 },
      { x: 1600, y: 1340 }, { x: 640, y: 1660 }, { x: 1280, y: 1660 }, { x: 1920, y: 1660 },
    ];
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#ecf0f1', '#1abc9c', '#e67e22'];
    parkedSpots.forEach((s, i) => {
      const type = i === 3 ? 'taxi' : 'car';
      const c = makeCar(s.x, s.y, i % 2 === 0 ? 0 : Math.PI / 2, type, type === 'taxi' ? '#f7c948' : colors[i % colors.length], { parked: true });
      this.allCars.push(c);
    });
    // one fast motorbike + one heavy truck, stealable
    this.allCars.push(makeCar(960, 700, 0, 'bike', '#222831', { parked: true }));
    this.allCars.push(makeCar(1600, 1340, Math.PI / 2, 'truck', '#7f8c8d', { parked: true }));
    // traffic
    for (let i = 0; i < 14; i++) {
      const t = makeTrafficCar(this.world, this.rng);
      this.allCars.push(t);
    }
  }

  spawnBossCar() {
    // the rival boss's red sports car, parked at the marina — locked until M6
    const boss = makeCar(MISSION_SPOTS.m6SportsCar.x, MISSION_SPOTS.m6SportsCar.y, Math.PI / 2, 'sports', '#e02020', { parked: true, isBoss: true, locked: true });
    this.allCars.push(boss);
    this.bossCar = boss;
  }

  spawnPeds() {
    this.peds = [];
    for (let i = 0; i < 42; i++) {
      this.peds.push(makePedestrian(this.world, this.rng));
    }
    // extra crowd on the promenade + downtown so the streets feel busy
    for (let i = 0; i < 14; i++) {
      const p = makePedestrian(this.world, this.rng);
      p.x = 2100 + this.rng.range(-120, 120);
      p.y = this.rng.range(700, 1700);
      this.peds.push(p);
    }
  }

  // ---- input ---------------------------------------------------------------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (this.phase === 'playing' || this.phase === 'paused') this.togglePause();
        return;
      }
      if (this.phase !== 'playing') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
      if (k === 'e') this.tryEnterExitCar();
      if (k === 'q') this.useAbilityQ();
      if (k === 'r') this.useAbilityR();
      if (e.key === 'Enter') this.tryStartRace();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 1280;
      this.mouse.y = ((e.clientY - r.top) / r.height) * 720;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.audio.ensure();
      }
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    $('btn-start').addEventListener('click', () => { this.audio.ensure(); this.newGame(); });
    $('btn-continue').addEventListener('click', () => { this.audio.ensure(); this.continueGame(); });
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => { this.restartMission(); this.togglePause(); });
    $('btn-stats').addEventListener('click', () => this.toggleStats());
    $('btn-quit').addEventListener('click', () => { this.toTitle(); });
  }

  // ---- mission flow ----------------------------------------------------------
  currentMission() {
    return MISSIONS[this.missionIndex] || null;
  }

  currentMarker() {
    const i = this.missionIndex;
    const s = this.stage;
    if (i === 0) return MISSION_SPOTS.m1Dropoff;
    if (i === 1) return s === 0 ? MISSION_SPOTS.m2Pickup : MISSION_SPOTS.m2Delivery;
    if (i === 2) return MISSION_SPOTS.turf;
    if (i === 3) return s === 0 ? MISSION_SPOTS.m4Goods : MISSION_SPOTS.safehouse;
    if (i === 4) return s === 0 ? MISSION_SPOTS.m5Bank : s === 1 ? MISSION_SPOTS.m5Bank : MISSION_SPOTS.garage;
    if (i === 5) return s === 0 ? MISSION_SPOTS.m6SportsCar : MISSION_SPOTS.safehouse;
    if (i === 6) return s === 0 ? MISSION_SPOTS.m7Casino : s === 1 ? MISSION_SPOTS.m7Casino : MISSION_SPOTS.safehouse;
    return null;
  }

  startMission(i) {
    this.missionIndex = i;
    this.stage = 0;
    this.kills = 0;
    this.combatSpawned = false;
    this.enemies = [];
    const m = MISSIONS[i];
    if (!m) return;
    this.night = !!m.night;
    this.showStage(m, 0);
    this.marker = this.currentMarker();
    if (i === 5) {
      // boss sports car resets at the start of M6
      this.bossCar.x = MISSION_SPOTS.m6SportsCar.x;
      this.bossCar.y = MISSION_SPOTS.m6SportsCar.y;
      this.bossCar.angle = Math.PI / 2;
      this.bossCar.condition = 100;
      this.bossCar.locked = false;
      this.bossCar.parked = true;
      this.bossCar.speed = 0;
    }
    this.save();
  }

  showStage(m, stageIdx) {
    const st = m.stages[stageIdx];
    const label = `M${m.id} STAGE ${stageIdx + 1}/${m.stages.length}: ${st.title}`;
    if (!this.seenStages.includes(label)) this.seenStages.push(label);
    const dlg = m.dialogue[stageIdx] || m.dialogue[0];
    if (dlg) this.say(dlg.who, dlg.line);
  }

  say(who, line) {
    this.dialogue = { who, line };
    this.dialogueT = 6;
    this.dialogueLog.push(`${who}: ${line}`);
  }

  advanceStage() {
    const m = this.currentMission();
    if (!m) return;
    if (this.stage < m.stages.length - 1) {
      this.stage++;
      this.showStage(m, this.stage);
      this.marker = this.currentMarker();
      this.save();
    } else {
      this.completeMission();
    }
  }

  completeMission() {
    const m = this.currentMission();
    if (!m) return;
    this.money += m.reward;
    const d = districtAt(this.world, this.px, this.py);
    d.standing = Math.min(100, d.standing + 6);
    d.status = standingStatus(d.standing);
    this.clearWanted();
    this.audio.mission();
    this.spawnParticles(this.px, this.py, '#ffd94d', 24);
    this.missionIndex++;
    this.stage = 0;
    this.kills = 0;
    this.enemies = [];
    if (this.missionIndex >= MISSIONS.length) {
      this.storyComplete = true;
      this.phase = 'complete';
      $('overlay-end').classList.remove('hidden');
      this.save();
      return;
    }
    this.startMission(this.missionIndex);
  }

  clearWanted() {
    this.wanted = 0;
    this.patrolCars = [];
    this.cops = [];
    this.heli = null;
    this.stats.copsEscaped++;
  }

  restartMission() {
    this.clearWanted();
    this.enemies = [];
    this.hp = 100;
    this.ammo = Math.max(this.ammo, 24);
    this.px = 640;
    this.py = 320;
    this.playerAngle = -Math.PI / 2;
    if (this.playerCar) {
      this.playerCar.parked = true;
      this.playerCar.speed = 0;
      this.playerCar = null;
    }
    this.inCar = false;
    this.startMission(this.missionIndex);
    this.phase = 'playing';
  }

  // ---- cars ------------------------------------------------------------------
  nearbyCars(maxD = 350) {
    return this.allCars
      .filter((c) => dist(c.x, c.y, this.px, this.py) < maxD)
      .map((c) => ({ car: c, x: c.x, y: c.y, d: dist(c.x, c.y, this.px, this.py), parked: c.parked }))
      .sort((a, b) => a.d - b.d);
  }

  tryEnterExitCar() {
    if (this.phase !== 'playing') return;
    if (this.inCar) {
      // exit: step out to the side, the car stays parked where it is
      const c = this.playerCar;
      c.parked = true;
      c.speed = 0;
      this.px = c.x - Math.sin(c.angle) * 30;
      this.py = c.y + Math.cos(c.angle) * 30;
      const fixed = collideCircle(this.world, this.px, this.py, 12);
      this.px = fixed.x;
      this.py = fixed.y;
      this.playerCar = null;
      this.inCar = false;
      return;
    }
    const near = this.nearbyCars(70);
    if (!near.length) return;
    // parked cars first (the boss car counts as parked)
    const parked = near.filter((n) => n.parked);
    const pick = (parked.length ? parked : near)[0];
    const car = pick.car;
    if (car.locked) {
      this.say('Rosa Vega', 'That one is locked. Not ours yet.');
      return;
    }
    car.parked = false;
    this.playerCar = car;
    this.inCar = true;
    this.px = car.x;
    this.py = car.y;
    this.stats.carsStolen++;
    // M1 stage 0 completes when the player steals a car
    if (this.missionIndex === 0 && this.stage === 0) this.advanceStage();
    // M6 stage 0 completes when the player takes the boss sports car
    if (this.missionIndex === 5 && this.stage === 0 && car.isBoss) {
      this.startChase(4);
      this.advanceStage();
    }
  }

  useAbilityQ() {
    if (this.qCooldown > 0 || this.wanted <= 0) return;
    this.wanted = Math.max(0, this.wanted - 1);
    this.qCooldown = CREW[0].cooldown;
    this.say('Rosa Vega', 'Plates swapped. One less star on us.');
    if (this.wanted === 0) this.clearWanted();
  }

  useAbilityR() {
    if (this.rCooldown > 0 || !this.playerCar) return;
    this.playerCar.condition = 100;
    // 3 s fresh-repair shield: the fix must actually hold in a chase,
    // not be undone by the next ram before the player can see it.
    this.playerCar.repairShield = 3;
    this.rCooldown = CREW[1].cooldown;
    this.say('Tomas Ibarra', 'Fixed up. Good as new.');
    this.spawnParticles(this.px, this.py, '#4dff88', 12);
  }

  startChase(patrolCount) {
    this.wanted = 3;
    this.stats.topWanted = Math.max(this.stats.topWanted, 3);
    this.patrolCars = [];
    for (let i = 0; i < patrolCount; i++) {
      const p = makePatrolCar(this.world, this.rng, this.px, this.py);
      this.patrolCars.push(p);
      this.allCars.push(p);
    }
    this.cops = [];
    for (let i = 0; i < 2; i++) this.cops.push(makeFootCop(this.world, this.rng, this.px, this.py));
    if (!this.heli) this.heli = makeHelicopter(this.px, this.py);
    this.audio.blip(520, 0.3, 0.08);
  }

  startGetaway(patrolCount) {
    // M5 getaway: patrol cars only, no foot cops
    this.wanted = 2;
    this.stats.topWanted = Math.max(this.stats.topWanted, 2);
    this.patrolCars = [];
    for (let i = 0; i < patrolCount; i++) {
      const p = makePatrolCar(this.world, this.rng, this.px, this.py);
      this.patrolCars.push(p);
      this.allCars.push(p);
    }
    this.cops = [];
    if (!this.heli) this.heli = makeHelicopter(this.px, this.py);
  }

  raiseWanted() {
    // NO-OP by design: wanted comes only from missions. Stealing a car or
    // shooting during a mission must never spike wanted and summon a foot
    // cop mid-combat. A fare is cancelled if wanted ever rises.
    if (this.taxi.hasPassenger || this.taxi.active) this.cancelTaxi();
  }

  cancelTaxi() {
    if (this.taxi.customer) this.taxi.customer.isTaxi = false;
    this.taxi.active = false;
    this.taxi.customer = null;
    this.taxi.hasPassenger = false;
    this.taxi.dest = null;
  }

  // ---- combat ------------------------------------------------------------------
  shoot() {
    if (this.fireCooldown > 0 || this.ammo <= 0) return;
    this.fireCooldown = 0.22;
    this.ammo--;
    this.muzzle = 0.3;
    const gx = this.px + Math.cos(this.aimAngle) * 18;
    const gy = this.py + Math.sin(this.aimAngle) * 18;
    this.bullets.push({
      x: gx, y: gy, px: gx, py: gy,
      vx: Math.cos(this.aimAngle) * 700, vy: Math.sin(this.aimAngle) * 700,
      life: 0.9, fromPlayer: true,
    });
    this.audio.gunshot();
    this.raiseWanted();
  }

  enemyShoot(e) {
    const a = Math.atan2(this.py - e.y, this.px - e.x) + (this.rng.next() - 0.5) * 0.44;
    const gx = e.x + Math.cos(a) * 16;
    const gy = e.y + Math.sin(a) * 16;
    this.bullets.push({
      x: gx, y: gy, px: gx, py: gy,
      vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
      life: 1.0, fromPlayer: false,
    });
    e.shootT = 1.7 + this.rng.next() * 0.6;
    this.audio.gunshot();
  }

  hasLOS(x1, y1, x2, y2) {
    const steps = 12;
    for (let i = 1; i < steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      if (pointInBuilding(this.world, x, y)) return false;
    }
    return true;
  }

  spawnEnemies(kind, count, cx, cy) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng.next();
      const r = 90 + this.rng.next() * 70;
      let x = cx + Math.cos(a) * r;
      let y = cy + Math.sin(a) * r;
      if (pointInBuilding(this.world, x, y) || isWater(x, y)) {
        const s = findOpenSpot(this.world, this.rng, cx, cy, 200);
        x = s.x; y = s.y;
      }
      this.enemies.push({ x, y, angle: 0, hp: 3, kind, shootT: 0.6 + this.rng.next(), speed: 92, flash: 0 });
    }
  }

  // ---- taxi + races --------------------------------------------------------------
  maybeSpawnTaxi(dt) {
    this.taxi.cooldown -= dt;
    if (this.taxi.active || this.taxi.cooldown > 0) return;
    if (!this.inCar && this.wanted === 0 && this.missionIndex >= 1 && this.phase === 'playing') {
      // pick the nearest pedestrian and flag them as the customer
      let best = null;
      let bd = 1e9;
      for (const p of this.peds) {
        if (p.isTaxi) continue;
        const d = dist(p.x, p.y, this.px, this.py);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < 700) {
        best.isTaxi = true;
        this.taxi.active = true;
        this.taxi.customer = best;
        this.taxi.hasPassenger = false;
      }
    }
  }

  tryStartRace() {
    if (this.phase !== 'playing' || this.race.active || this.wanted > 0) return;
    for (const r of this.races.list) {
      if (this.races.wonNames.includes(r.name)) continue;
      if (dist(this.px, this.py, r.start.x, r.start.y) < 70) {
        this.race = { active: true, name: r.name, timeLeft: r.timeLimit, checkpoints: r.checkpoints, nextIndex: 0 };
        this.say('Rosa Vega', `${r.name} — hit every checkpoint before the clock runs out!`);
        return;
      }
    }
  }

  // ---- save / load ---------------------------------------------------------------
  save() {
    if (!this.started) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        missionIndex: this.missionIndex,
        stage: this.stage,
        money: this.money,
        px: this.px, py: this.py,
        inCar: this.inCar,
        carType: this.playerCar ? this.playerCar.type : null,
        carAngle: this.playerCar ? this.playerCar.angle : this.playerAngle,
        carColor: this.playerCar ? this.playerCar.color : null,
        districts: this.world.districts.map((d) => d.standing),
        shells: this.world.shells.map((s) => s.collected),
        racesWon: this.races.won,
        racesWonNames: this.races.wonNames,
        fares: this.taxi.fares,
        storyComplete: this.storyComplete,
        clockMin: this.clockMin,
        stats: this.stats,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  applySave(s) {
    this.missionIndex = s.missionIndex;
    this.stage = s.stage;
    this.money = s.money;
    this.px = s.px;
    this.py = s.py;
    this.clockMin = s.clockMin || 16 * 60;
    this.storyComplete = !!s.storyComplete;
    this.races.won = s.racesWon || 0;
    this.races.wonNames = s.racesWonNames || [];
    this.taxi.fares = s.fares || 0;
    this.stats = s.stats || this.stats;
    s.districts.forEach((v, i) => {
      if (this.world.districts[i]) {
        this.world.districts[i].standing = v;
        this.world.districts[i].status = standingStatus(v);
      }
    });
    s.shells.forEach((c, i) => {
      if (this.world.shells[i]) this.world.shells[i].collected = c;
    });
    this.shellsCollected = this.world.shells.filter((x) => x.collected).length;
    const m = this.currentMission();
    this.night = !!(m && m.night);
    if (s.inCar && s.carType) {
      const car = makeCar(this.px, this.py, s.carAngle || 0, s.carType, s.carColor || '#ffd94d');
      car.parked = false;
      this.allCars.push(car);
      this.playerCar = car;
      this.inCar = true;
    }
    this.marker = this.currentMarker();
    const cur = this.currentMission();
    if (cur) this.showStage(cur, this.stage);
  }

  newGame() {
    this.initWorld();
    this.started = true;
    this.phase = 'playing';
    this.showTitle(false);
    this.startMission(0);
    this.save();
  }

  continueGame() {
    const s = this.loadSave();
    if (!s) return;
    this.initWorld();
    this.started = true;
    this.applySave(s);
    this.showTitle(false);
    if (this.storyComplete) {
      this.phase = 'complete';
      $('overlay-end').classList.remove('hidden');
    } else {
      this.phase = 'playing';
    }
  }

  toTitle() {
    this.phase = 'title';
    this.showTitle(true);
    this.updateTitleSlots();
  }

  togglePause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      $('pause-screen').classList.remove('hidden');
      this.renderStats();
      this.save();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      $('pause-screen').classList.add('hidden');
      $('stats-panel').classList.add('hidden');
    }
  }

  toggleStats() {
    const p = $('stats-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) this.renderStats();
  }

  showTitle(show) {
    $('title-screen').classList.toggle('hidden', !show);
    $('hud').classList.toggle('hidden', show);
    if (!show) $('pause-screen').classList.add('hidden');
  }

  updateTitleSlots() {
    const s = this.loadSave();
    const slots = document.querySelectorAll('#title-slots .slot');
    slots.forEach((el, i) => {
      if (i === 0 && s) {
        el.innerHTML = `<b>SLOT ${i + 1}</b><span>Mission ${Math.min(s.missionIndex + 1, 7)}/7 · $${s.money}</span><span>${s.storyComplete ? 'Story Complete' : 'In progress'}</span>`;
      } else {
        el.innerHTML = `<b>SLOT ${i + 1}</b><span>EMPTY</span>`;
      }
    });
    $('btn-continue').style.display = s ? '' : 'none';
  }

  // ---- stats screen ------------------------------------------------------------
  renderStats() {
    const done = Math.min(this.missionIndex, 7);
    const gold = done;
    const total = 7 + 2 + 8 + 3 + 7;
    const got = done + this.races.won + this.shellsCollected + Math.min(this.taxi.fares, 3) + this.world.districts.filter((d) => d.status === 'FRIENDLY').length;
    const pct = Math.round((got / total) * 100);
    const rows = this.world.districts.map((d) => `<div class="srow"><span>${d.name}</span><b>${d.standing} · ${d.status}</b></div>`).join('');
    $('stats-content').innerHTML = `
      <div class="stats-top">
        <div class="donut"><b>${pct}%</b><span>COMPLETION</span></div>
        <div class="career">
          <div class="srow"><span>Story missions</span><b>${done}/7 ${gold === 7 ? 'GOLD' : ''}</b></div>
          <div class="srow"><span>Street races won</span><b>${this.races.won}/2</b></div>
          <div class="srow"><span>Sun Shells</span><b>${this.shellsCollected}/8</b></div>
          <div class="srow"><span>Taxi fares</span><b>${this.taxi.fares}</b></div>
          <div class="srow"><span>Districts FRIENDLY</span><b>${this.world.districts.filter((d) => d.status === 'FRIENDLY').length}/7</b></div>
          <div class="srow"><span>Money</span><b>$${this.money}</b></div>
        </div>
        <div class="career">
          <div class="srow"><span>Cars stolen</span><b>${this.stats.carsStolen}</b></div>
          <div class="srow"><span>Distance driven</span><b>${(this.stats.distance / 1000).toFixed(1)} km</b></div>
          <div class="srow"><span>Cops escaped</span><b>${this.stats.copsEscaped}</b></div>
          <div class="srow"><span>Takedowns</span><b>${this.stats.takedowns}</b></div>
          <div class="srow"><span>Longest jump</span><b>${this.stats.longestJump.toFixed(1)} m</b></div>
          <div class="srow"><span>Top wanted</span><b>${'★'.repeat(this.stats.topWanted) || '—'}</b></div>
        </div>
      </div>
      <h3>DISTRICT STANDING</h3>
      ${rows}
      <h3>CREW — 3/3</h3>
      ${CREW.map((c) => `<div class="srow"><span>${c.name} — ${c.role}</span><b>${c.ability}${c.key ? ' [' + c.key + ']' : ' (passive)'}</b></div>`).join('')}`;
  }

  // ---- particles -----------------------------------------------------------------
  spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const sp = 40 + this.rng.next() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + this.rng.next() * 0.4, r: 2 + this.rng.next() * 3, color });
    }
  }

  // ---- update ----------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.clockMin += dt * (60 / 90); // 1 game hour per 90 s
    if (this.qCooldown > 0) this.qCooldown -= dt;
    if (this.rCooldown > 0) this.rCooldown -= dt;
    if (this.ramFxT > 0) this.ramFxT -= dt;
    if (this.playerCar && this.playerCar.repairShield > 0) this.playerCar.repairShield -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.dialogueT > 0) {
      this.dialogueT -= dt;
      if (this.dialogueT <= 0) this.dialogue = null;
    }
    this.marker = this.currentMarker();
    const m = this.currentMission();

    // --- player ---------------------------------------------------------------
    if (this.inCar && this.playerCar) {
      const car = this.playerCar;
      stepCarPhysics(car, this.keys, dt, this.world);
      this.px = car.x;
      this.py = car.y;
      this.playerAngle = car.angle;
      this.stats.distance += Math.abs(car.speed) * dt;
      if (car.flash > 0) car.flash -= dt;
    } else {
      // on foot: WASD walk, aim with mouse
      let mx = 0;
      let my = 0;
      if (this.keys.has('w')) my -= 1;
      if (this.keys.has('s')) my += 1;
      if (this.keys.has('a')) mx -= 1;
      if (this.keys.has('d')) mx += 1;
      const len = Math.hypot(mx, my);
      if (len > 0) {
        const sp = 210;
        const fixed = collideCircle(this.world, this.px + (mx / len) * sp * dt, this.py + (my / len) * sp * dt, 12);
        this.px = fixed.x;
        this.py = fixed.y;
        this.playerAngle = Math.atan2(my, mx);
      }
      const mwx = this.cam.x + this.mouse.x / this.zoom;
      const mwy = this.cam.y + this.mouse.y / this.zoom;
      this.aimAngle = Math.atan2(mwy - this.py, mwx - this.px);
      // staged night shootout: auto-aim at the nearest guard so the muzzle
      // flash + tracers are always on a target in the frame
      if (this.autoFire && this.enemies.length) {
        let best = null;
        let bd = 1e9;
        for (const e of this.enemies) {
          const d = dist(e.x, e.y, this.px, this.py);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) this.aimAngle = Math.atan2(best.y - this.py, best.x - this.px);
      }
      if ((this.mouse.down || this.autoFire) && this.phase === 'playing') this.shoot();
    }

    // --- traffic + pedestrians --------------------------------------------------
    for (const c of this.allCars) {
      if (c === this.playerCar || c.type === 'police') continue;
      if (c.parked) continue;
      stepTraffic(c, dt, this.world, this.rng, this.allCars);
    }
    const danger = this.bullets.length ? { x: this.px, y: this.py } : null;
    for (const p of this.peds) stepPedestrian(p, dt, this.world, this.rng, danger);

    // --- police ---------------------------------------------------------------------
    for (const p of this.patrolCars) {
      stepPatrol(p, dt, this.world, this.px, this.py, this.rng);
      const d = dist(p.x, p.y, this.px, this.py);
      if (this.inCar && d < (p.len + this.playerCar.len) * 0.42) {
        // rammed: shove + damage (not while the fresh-repair shield holds)
        if (!this.playerCar.repairShield || this.playerCar.repairShield <= 0) {
          this.playerCar.condition = Math.max(20, this.playerCar.condition - 2);
        }
        this.playerCar.flash = 0.2;
        // throttled: unthrottled, every overlapping patrol car spawned 6
        // particles PER FRAME and the chase shot drowned in an orange blob
        if (!this.ramFxT || this.ramFxT <= 0) {
          this.spawnParticles(this.px, this.py, '#ffb347', 6);
          this.ramFxT = 0.25;
        }
      }
    }
    for (const c of this.cops) {
      const busted = stepFootCop(c, dt, this.world, this.px, this.py, !this.inCar);
      if (busted) {
        this.phase = 'busted';
        this.say('SBPD', 'You are busted. The crew pulls you out — the job restarts.');
        setTimeout(() => { if (this.phase === 'busted') this.restartMission(); }, 1200);
      }
    }
    separateCars(this.allCars, this.world, this.rng);
    // patrol cars that wandered off get removed from allCars bookkeeping
    this.allCars = this.allCars.filter((c) => c.type !== 'police' || this.patrolCars.includes(c));

    if (this.heli) stepHelicopter(this.heli, dt, this.px, this.py);
    if (this.wanted >= 2 && !this.heli) this.heli = makeHelicopter(this.px, this.py);
    if (this.wanted === 0) this.heli = null;

    // wanted decay: no police close for 6 s -> drop a star
    if (this.wanted > 0) {
      const near = this.patrolCars.some((p) => dist(p.x, p.y, this.px, this.py) < 500) ||
        this.cops.some((c) => dist(c.x, c.y, this.px, this.py) < 300);
      if (!near) {
        this.wantedTimer += dt;
        if (this.wantedTimer > 6) {
          this.wanted--;
          this.wantedTimer = 0;
          if (this.wanted === 0) this.clearWanted();
        }
      } else {
        this.wantedTimer = 0;
      }
    }

    // --- enemies ----------------------------------------------------------------------
    for (const e of this.enemies) {
      e.flash = Math.max(0, (e.flash || 0) - dt);
      const d = dist(e.x, e.y, this.px, this.py);
      const los = this.hasLOS(e.x, e.y, this.px, this.py);
      // close the distance first: enemies that stand 200+ away end up
      // off-screen at the closer camera zoom and can never be aimed at.
      // Advance when far away or when line-of-sight breaks. 130 keeps them
      // inside the viewport (half-height is ~156 world units at zoom 2.3).
      if (d > 130 || !los) {
        const a = Math.atan2(this.py - e.y, this.px - e.x);
        e.angle = a;
        const fixed = collideCircle(this.world, e.x + Math.cos(a) * e.speed * dt, e.y + Math.sin(a) * e.speed * dt, 12);
        e.x = fixed.x;
        e.y = fixed.y;
      } else {
        e.angle = Math.atan2(this.py - e.y, this.px - e.x);
      }
      e.shootT -= dt;
      if (los && d < 360 && e.shootT <= 0 && !this.inCar) this.enemyShoot(e);
    }

    // --- bullets (segment-based hits, no tunneling) -------------------------------------
    for (const b of this.bullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.fromPlayer) {
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (segHits(b.px, b.py, b.x, b.y, e.x, e.y, 14)) {
            e.hp -= 1;
            e.flash = 0.15;
            b.life = 0;
            this.spawnParticles(e.x, e.y, '#ff5f5f', 5);
            if (e.hp <= 0) this.killEnemy(e);
            break;
          }
        }
        if (b.life > 0) {
          for (const c of this.cops) {
            if (c.hp <= 0) continue;
            if (segHits(b.px, b.py, b.x, b.y, c.x, c.y, 14)) {
              c.hp -= 1;
              b.life = 0;
              this.spawnParticles(c.x, c.y, '#3b82f6', 5);
              if (c.hp <= 0) {
                this.cops = this.cops.filter((x) => x !== c);
                this.ammo += 12;
              }
              break;
            }
          }
        }
      } else if (b.life > 0) {
        const d0 = dist(b.px, b.py, this.px, this.py);
        const d1 = dist(b.x, b.y, this.px, this.py);
        if ((d0 < 14 || d1 < 14 || segHits(b.px, b.py, b.x, b.y, this.px, this.py, 12)) && !this.inCar) {
          this.hp -= 3;
          b.life = 0;
          this.spawnParticles(this.px, this.py, '#ff5f5f', 6);
          if (this.hp <= 0) {
            this.hp = 0;
            this.phase = 'wasted';
            this.say('Nia Solano', 'You are down. The crew drags you out — the job restarts.');
            setTimeout(() => { if (this.phase === 'wasted') { this.hp = 100; this.restartMission(); } }, 1200);
          }
        }
      }
      if (pointInBuilding(this.world, b.x, b.y) || b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) b.life = 0;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // --- pickups + shells ---------------------------------------------------------------
    for (const p of this.world.pickups) {
      if (p.taken) {
        p.timer -= dt;
        if (p.timer <= 0) p.taken = false;
        continue;
      }
      if (dist(this.px, this.py, p.x, p.y) < 36) {
        p.taken = true;
        p.timer = 15;
        if (p.kind === 'ammo') {
          this.ammo += 24;
          this.audio.pickup();
        } else {
          this.hp = Math.min(100, this.hp + 30);
          this.audio.pickup();
        }
        this.spawnParticles(p.x, p.y, '#4dff88', 8);
      }
    }
    for (const s of this.world.shells) {
      if (!s.collected && dist(this.px, this.py, s.x, s.y) < 36) {
        s.collected = true;
        this.shellsCollected++;
        this.money += 100;
        this.audio.pickup();
        this.spawnParticles(s.x, s.y, '#ffd94d', 12);
      }
    }

    // --- mission triggers ------------------------------------------------------------------
    if (m) this.missionTriggers(m, dt);

    // --- taxi --------------------------------------------------------------------------------
    this.maybeSpawnTaxi(dt);
    if (this.taxi.active && this.taxi.customer && !this.taxi.hasPassenger && this.inCar) {
      if (dist(this.px, this.py, this.taxi.customer.x, this.taxi.customer.y) < 55) {
        this.taxi.hasPassenger = true;
        const dest = this.randomIntersection();
        this.taxi.dest = dest;
        this.marker = dest;
        this.say(this.taxi.customer.name || 'Passenger', 'Take me there, quick.');
      }
    }
    if (this.taxi.hasPassenger && this.taxi.dest) {
      if (dist(this.px, this.py, this.taxi.dest.x, this.taxi.dest.y) < 80) {
        this.money += 150;
        this.taxi.fares++;
        const d = districtAt(this.world, this.px, this.py);
        d.standing = Math.min(100, d.standing + 6);
        d.status = standingStatus(d.standing);
        this.audio.mission();
        this.cancelTaxi();
        this.taxi.cooldown = 4;
        this.marker = this.currentMarker();
      }
    }

    // --- race ------------------------------------------------------------------------------------
    if (this.race.active) {
      this.race.timeLeft -= dt;
      const cp = this.race.checkpoints[this.race.nextIndex];
      if (cp && dist(this.px, this.py, cp.x, cp.y) < 80) {
        this.race.nextIndex++;
        this.audio.pickup();
        if (this.race.nextIndex >= this.race.checkpoints.length) {
          this.race.active = false;
          this.races.won++;
          this.races.wonNames.push(this.race.name);
          this.money += 250;
          const d = districtAt(this.world, this.px, this.py);
          d.standing = Math.min(100, d.standing + 6);
          d.status = standingStatus(d.standing);
          this.say('Rosa Vega', `${this.race.name} — won! +$250.`);
          this.audio.mission();
          this.marker = this.currentMarker();
        }
      }
      if (this.race.timeLeft <= 0 && this.race.active) {
        this.race.active = false;
        this.say('Rosa Vega', 'Out of time. The race is lost — try again at the start line.');
        this.marker = this.currentMarker();
      }
    }

    // --- particles -------------------------------------------------------------------------------
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.4;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // --- camera --------------------------------------------------------------------------------------
    if (!this.camLock) {
      const tx = clamp(this.px - 1280 / this.zoom / 2, 0, WORLD_W - 1280 / this.zoom);
      const ty = clamp(this.py - 720 / this.zoom / 2, 0, WORLD_H - 720 / this.zoom);
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    }

    this.audio.engine(this.playerCar ? this.playerCar.speed : 0, this.inCar);
    this.audio.siren(dt, this.wanted);
    this.updateHUD();
    drawMinimap($('minimap'), this);
  }

  missionTriggers(m, dt) {
    const i = this.missionIndex;
    // M3: gang spawns when the player walks onto the turf (once per mission)
    if (i === 2 && this.stage === 0 && !this.inCar && this.enemies.length === 0 && !this.combatSpawned) {
      if (dist(this.px, this.py, MISSION_SPOTS.turf.x, MISSION_SPOTS.turf.y) < 320) {
        this.combatSpawned = true;
        this.spawnEnemies('gang', 4, MISSION_SPOTS.turf.x, MISSION_SPOTS.turf.y);
      }
    }
    // M3: turf clear -> hold the block
    if (i === 2 && this.stage === 0 && this.kills >= 4) this.advanceStage();
    if (i === 2 && this.stage === 1 && dist(this.px, this.py, MISSION_SPOTS.turf.x, MISSION_SPOTS.turf.y) < 70) this.advanceStage();
    // M1/M2/M4 marker arrivals
    if (this.marker) {
      const md = dist(this.px, this.py, this.marker.x, this.marker.y);
      if (i === 0 && this.stage === 1 && md < MARKER_TRIGGER) this.advanceStage();
      if (i === 1 && this.stage === 0 && md < MARKER_TRIGGER) this.advanceStage();
      else if (i === 1 && this.stage === 1 && md < MARKER_TRIGGER) this.advanceStage();
      if (i === 3 && this.stage === 0 && md < MARKER_TRIGGER) {
        this.startChase(3);
        this.advanceStage();
      } else if (i === 3 && this.stage === 1 && md < MARKER_TRIGGER) this.advanceStage();
      if (i === 4 && this.stage === 1 && md < CASH_TRIGGER) {
        this.startGetaway(2);
        this.advanceStage();
      } else if (i === 4 && this.stage === 2 && md < MARKER_TRIGGER) this.advanceStage();
      if (i === 5 && this.stage === 1 && md < MARKER_TRIGGER) this.advanceStage();
      if (i === 6 && this.stage === 1 && md < CASH_TRIGGER) {
        this.startChase(5);
        this.advanceStage();
      } else if (i === 6 && this.stage === 2 && md < MARKER_TRIGGER) this.advanceStage();
    }
    // M5/M7: guards spawn when the player walks up to the vault (once each)
    if (i === 4 && this.stage === 0 && !this.inCar && this.enemies.length === 0 && !this.combatSpawned) {
      if (dist(this.px, this.py, MISSION_SPOTS.m5Bank.x, MISSION_SPOTS.m5Bank.y) < 320) {
        this.combatSpawned = true;
        this.spawnEnemies('guard', 3, MISSION_SPOTS.m5Bank.x, MISSION_SPOTS.m5Bank.y);
      }
    }
    if (i === 6 && this.stage === 0 && !this.inCar && this.enemies.length === 0 && !this.combatSpawned) {
      if (dist(this.px, this.py, MISSION_SPOTS.m7Casino.x, MISSION_SPOTS.m7Casino.y) < 320) {
        this.combatSpawned = true;
        this.spawnEnemies('guard', 4, MISSION_SPOTS.m7Casino.x, MISSION_SPOTS.m7Casino.y);
      }
    }
    if (i === 4 && this.stage === 0 && this.kills >= 3) this.advanceStage();
    if (i === 6 && this.stage === 0 && this.kills >= 4) this.advanceStage();
  }

  killEnemy(e) {
    this.kills++;
    this.stats.takedowns++;
    this.ammo += 12; // dead enemies ALWAYS drop ammo
    this.spawnParticles(e.x, e.y, '#ff5f5f', 14);
    this.audio.blip(220, 0.15, 0.1);
  }

  randomIntersection() {
    const ax = AVENUES[Math.floor(this.rng.next() * AVENUES.length)];
    const sy = STREETS[Math.floor(this.rng.next() * STREETS.length)];
    return { x: ax, y: sy };
  }

  // ---- HUD -------------------------------------------------------------------------------------
  updateHUD() {
    const m = this.currentMission();
    $('hud-money').textContent = `$${this.money}`;
    $('hud-hp-fill').style.width = `${this.hp}%`;
    $('hud-hp-text').textContent = `HP ${Math.round(this.hp)}`;
    $('hud-ammo').textContent = `AMMO ${this.ammo}`;
    $('hud-shells').textContent = `Shells ${this.shellsCollected}/8`;
    $('hud-abilities').textContent =
      `Q SWAP PLATES ${this.qCooldown > 0 ? Math.ceil(this.qCooldown) + 's' : 'READY'} · R QUICK FIX ${this.rCooldown > 0 ? Math.ceil(this.rCooldown) + 's' : 'READY'} · Crew 3/3`;
    if (m) {
      const st = m.stages[this.stage];
      $('mc-title').textContent = `M${m.id} — ${m.title} · $${m.reward}`;
      $('mc-stage').textContent = `STAGE ${this.stage + 1}/${m.stages.length} — ${st.title}`;
      $('mc-objective').textContent = st.objective;
      $('mc-next').textContent = `NEXT: ${st.next}`;
    } else {
      $('mc-title').textContent = 'STORY COMPLETE';
      $('mc-stage').textContent = '';
      $('mc-objective').textContent = 'You took the crown of the bay.';
      $('mc-next').textContent = '';
    }
    const stars = '★'.repeat(this.wanted) + '☆'.repeat(Math.max(0, 3 - this.wanted));
    $('hud-stars').textContent = stars;
    $('hud-stars').classList.toggle('hot', this.wanted >= 3);
    const hh = Math.floor(this.clockMin / 60) % 24;
    const mm = Math.floor(this.clockMin % 60);
    $('hud-clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${this.night ? ' NIGHT' : ''}`;
    const d = districtAt(this.world, this.px, this.py);
    $('hud-district').textContent = `${d.name} · ${d.standing} ${d.status}`;
    const disp = $('hud-dispatch');
    if (this.wanted > 0 && (this.patrolCars.length || this.heli)) {
      const units = this.patrolCars.map((p) => `${p.unit} · PURSUE · ${Math.round(dist(p.x, p.y, this.px, this.py))}m`).join('\n');
      disp.textContent = `SBPD DISPATCH\n${units}${this.heli ? '\nSBPD AIR · EYES UP · overhead' : ''}`;
      disp.classList.remove('hidden');
    } else {
      disp.classList.add('hidden');
    }
    const dlg = $('dialogue');
    if (this.dialogue) {
      dlg.classList.remove('hidden');
      $('dlg-who').textContent = this.dialogue.who;
      $('dlg-line').textContent = this.dialogue.line;
    } else {
      dlg.classList.add('hidden');
    }
    if (this.race.active) {
      $('hud-race').classList.remove('hidden');
      $('hud-race').textContent = `${this.race.name} · ${Math.ceil(this.race.timeLeft)}s · checkpoint ${this.race.nextIndex + 1}/${this.race.checkpoints.length}`;
    } else {
      $('hud-race').classList.add('hidden');
    }
    if (this.taxi.hasPassenger) {
      $('hud-taxi').classList.remove('hidden');
      $('hud-taxi').textContent = `TAXI · Fares: ${this.taxi.fares} · drop off the passenger`;
    } else if (this.taxi.active) {
      $('hud-taxi').classList.remove('hidden');
      $('hud-taxi').textContent = `TAXI · Fares: ${this.taxi.fares} · pick up the passenger`;
    } else {
      $('hud-taxi').classList.add('hidden');
    }
  }

  // ---- shot staging ------------------------------------------------------------------------------
  stageShot() {
    const shot = this.shotMode;
    if (shot === 'chase') {
      // M4 stage 2, daytime coastal chase: player car BIG and centred, 4
      // patrol cars close behind, helicopter overhead, boulevard + sea
      this.initWorld();
      this.started = true;
      this.phase = 'playing';
      this.showTitle(false);
      this.missionIndex = 3;
      this.stage = 1;
      this.money = 1650;
      this.night = false;
      this.clockMin = 16 * 60 + 31;
      const car = makeCar(2240, 1000, Math.PI / 2, 'car', '#ffd94d');
      car.parked = false;
      car.speed = 220;
      this.allCars.push(car);
      this.playerCar = car;
      this.inCar = true;
      this.px = car.x;
      this.py = car.y;
      this.wanted = 3;
      this.stats.topWanted = 3;
      this.patrolCars = [];
      // patrol cars in a HORIZONTAL ROW on street 960, 80 behind the player
      // (role 'FORMATION' drives straight south, keeping the row). A column
      // fails: only ~100 world units above the player are usable (the
      // mission card covers the rest), and the cars need 58 units of
      // separation — so at most 2 fit in a column. A row shares one y band
      // and all four stay visible below the card.
      const behind = [[2100, 920], [2170, 920], [2310, 920], [2380, 920]];
      behind.forEach(([x, y], i) => {
        const p = makeCar(x, y, Math.PI / 2, 'police', '#ffffff');
        p.unit = ['GULL-1', 'TIDE-3', 'PELICAN-2', 'CORAL-48'][i];
        p.role = 'FORMATION';
        p.speed = 300;
        this.patrolCars.push(p);
        this.allCars.push(p);
      });
      this.heli = makeHelicopter(this.px, this.py);
      this.heli.x = this.px + 120;
      this.heli.y = this.py - 60;
      // busy streets: extra traffic + pedestrians around the player. The
      // traffic goes on the CROSS streets (960 / 1280), not on avenue 2240
      // — cars staged on the avenue sat in the patrol formation's lanes
      // and blocked two of the four patrol cars.
      for (let i = 0; i < 3; i++) {
        const t = makeCar(2050 + i * 170, 960, 0, i === 1 ? 'taxi' : 'car', ['#e74c3c', '#f7c948', '#3498db'][i]);
        t.speed = 120;
        this.allCars.push(t);
        const t2 = makeCar(2050 + i * 170, 1280, Math.PI, i === 2 ? 'taxi' : 'car', ['#2ecc71', '#9b59b6', '#ecf0f1'][i]);
        t2.speed = 120;
        this.allCars.push(t2);
      }
      for (let i = 0; i < 8; i++) {
        const p = makePedestrian(this.world, this.rng);
        p.x = 2240 + (i % 2 ? 60 : -60);
        p.y = 850 + i * 45;
        this.peds.push(p);
      }
      this.marker = MISSION_SPOTS.safehouse;
      this.showStage(MISSIONS[3], 1);
      this.say('Nia Solano', 'SBPD is on you — three stars! Lose them at the safehouse.');
      this.cam.x = clamp(this.px - 1280 / this.zoom / 2, 0, WORLD_W - 1280 / this.zoom);
      this.cam.y = clamp(this.py - 720 / this.zoom / 2, 0, WORLD_H - 720 / this.zoom);
    } else if (shot === 'night') {
      // M5 stage 1, night market shootout: player on foot, 3 guards visible,
      // auto-fire on so muzzle flash + tracers are in the frame
      this.initWorld();
      this.started = true;
      this.phase = 'playing';
      this.showTitle(false);
      this.missionIndex = 4;
      this.stage = 0;
      this.money = 3150;
      this.night = true;
      this.clockMin = 22 * 60 + 1;
      this.px = 1320;
      this.py = 1160;
      this.playerAngle = -Math.PI / 2;
      this.wanted = 2;
      this.stats.topWanted = 2;
      this.spawnEnemies('guard', 3, MISSION_SPOTS.m5Bank.x, MISSION_SPOTS.m5Bank.y);
      // pull the guards into the frame, close to the player, on open plaza
      this.enemies.forEach((e, i) => {
        e.x = [1280, 1360, 1440][i];
        e.y = [1070, 1090, 1070][i];
      });
      this.autoFire = true;
      this.marker = MISSION_SPOTS.m5Bank;
      this.showStage(MISSIONS[4], 0);
      this.say('Tomas Ibarra', 'Vault guards ahead. Three shots each.');
      // keep the NEON/CLUB signs clear: a traffic car parked on top of a
      // sign hides the glow the night shot is about
      for (const c of this.allCars) {
        if (c === this.playerCar) continue;
        for (const s of this.world.signs) {
          if (Math.hypot(c.x - s.x, c.y - s.y) < 150) { c.x = s.x - 260; c.y = s.y + 120; }
        }
      }
      // lock the camera a touch high so the bank + its NEON sign stay in frame
      this.camLock = true;
      this.cam.x = clamp(this.px - 1280 / this.zoom / 2, 0, WORLD_W - 1280 / this.zoom);
      this.cam.y = clamp(this.py - 720 / this.zoom / 2 - 70, 0, WORLD_H - 720 / this.zoom);
    } else if (shot === 'stats') {
      // staged mid-progress career: pause + stats panel open
      this.initWorld();
      this.started = true;
      this.money = 3200;
      this.missionIndex = 4;
      this.stage = 0;
      this.shellsCollected = 5;
      this.world.shells.forEach((s, i) => { s.collected = i < 5; });
      this.races.won = 1;
      this.races.wonNames = ['Harbor Loop'];
      this.taxi.fares = 3;
      this.stats = { carsStolen: 9, distance: 12400, copsEscaped: 2, takedowns: 11, longestJump: 0, topWanted: 3 };
      this.world.districts[1].standing = 72;
      this.world.districts[2].standing = 71;
      this.world.districts.forEach((d) => { d.status = standingStatus(d.standing); });
      this.px = 1280;
      this.py = 960;
      this.phase = 'paused';
      this.showTitle(false);
      $('pause-screen').classList.remove('hidden');
      this.renderStats();
      $('stats-panel').classList.remove('hidden');
      this.cam.x = clamp(this.px - 1280 / this.zoom / 2, 0, WORLD_W - 1280 / this.zoom);
      this.cam.y = clamp(this.py - 720 / this.zoom / 2, 0, WORLD_H - 720 / this.zoom);
    } else if (shot === 'title') {
      this.phase = 'title';
      this.showTitle(true);
      this.updateTitleSlots();
    }
  }

  // ---- state API (the playthrough driver reads this) -----------------------------------------------
  state() {
    const m = this.currentMission();
    const st = m ? m.stages[this.stage] : null;
    const d = districtAt(this.world, this.px, this.py);
    return {
      started: this.started,
      state: this.phase,
      storyComplete: this.storyComplete,
      paused: this.phase === 'paused',
      money: this.money,
      missionIndex: this.missionIndex,
      stage: this.stage,
      stageTitle: st ? st.title : '',
      nextLine: st ? st.next : '',
      district: { name: d.name, standing: d.standing, status: d.status },
      districts: this.world.districts.map((x) => ({ name: x.name, standing: x.standing, status: x.status })),
      marker: this.marker,
      night: this.night,
      wanted: this.wanted,
      patrol: this.patrolCars.length,
      cops: this.cops.length,
      carCondition: this.playerCar ? Math.round(this.playerCar.condition) : 100,
      inCar: this.inCar,
      carAngle: this.playerCar ? this.playerCar.angle : this.playerAngle,
      carSpeed: this.playerCar ? Math.round(this.playerCar.speed) : 0,
      px: Math.round(this.px),
      py: Math.round(this.py),
      hp: Math.round(this.hp),
      ammo: this.ammo,
      kills: this.kills,
      enemies: this.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y) })),
      footCops: this.cops.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      pickups: this.world.pickups.filter((p) => !p.taken).map((p) => ({ kind: p.kind, x: p.x, y: p.y })),
      carsNear: this.nearbyCars(350).map((n) => ({ x: Math.round(n.x), y: Math.round(n.y), d: Math.round(n.d), parked: n.parked })),
      cam: { x: Math.round(this.cam.x), y: Math.round(this.cam.y) },
      zoom: this.zoom,
      stash: this.shellsCollected,
      shells: { collected: this.shellsCollected, list: this.world.shells.map((s) => ({ x: s.x, y: s.y, collected: s.collected })) },
      taxi: {
        active: this.taxi.active,
        customer: this.taxi.customer ? { x: Math.round(this.taxi.customer.x), y: Math.round(this.taxi.customer.y) } : null,
        hasPassenger: this.taxi.hasPassenger,
        dest: this.taxi.dest,
        fares: this.taxi.fares,
      },
      races: { list: this.races.list.map((r) => ({ name: r.name, start: r.start })), won: this.races.won },
      race: {
        active: this.race.active,
        name: this.race.name,
        timeLeft: Math.round(this.race.timeLeft),
        checkpoints: this.race.checkpoints,
        nextIndex: this.race.nextIndex,
      },
      seenStages: [...this.seenStages],
      dialogueLog: [...this.dialogueLog],
    };
  }

  // ---- main loop ---------------------------------------------------------------------------------------
  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0.016);
    this.lastTs = ts;
    if (this.phase === 'playing') {
      this.update(dt);
      drawScene(this.ctx, this, this.time);
    } else if (this.phase === 'paused') {
      // frozen frame behind the pause menu (draw once, keep it)
      drawScene(this.ctx, this, this.time);
    } else if (this.phase === 'title') {
      drawSunset(this.ctx, 1280, 720, this.time);
      this.time += dt;
    } else if (this.phase === 'complete' || this.phase === 'busted' || this.phase === 'wasted') {
      // frozen frame behind the end/busted overlay — no updates while down
      drawScene(this.ctx, this, this.time);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    if (this.staging) {
      this.stageShot();
    }
    requestAnimationFrame((t) => {
      this.lastTs = t;
      this.loop(t);
    });
  }
}

function segHits(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return Math.hypot(cx - px, cy - py) < r;
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = $('game-canvas');
  const game = new Game(canvas);
  window.__game = game;
  game.start();
});
