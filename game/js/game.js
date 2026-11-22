// SOLARA BAY — game core: state machine, missions, police, crew, taxi,
// street races, shells, standing, clock, save/load, HUD, shot staging.
import { RNG, hashSeed } from './rng.js';
import { AudioEngine } from './audio.js';
import { buildCity } from './city.js';
import {
  makeCar, makePedestrian, makeFootCop, makeEnemy, makePickup, makeHelicopter,
  stepCarPhysics, stepPedestrian, separateCars, normAngle, segmentHitsCircle, lineOfSight,
} from './entities.js';
import { MISSIONS, CREW, SBPD_UNITS, standingStatus } from './missions.js';
import { Renderer } from './render.js';

const SAVE_KEY = 'sb21-save';
const SLOT_KEY = (i) => `sb21-slot-${i}`;
const START_MONEY = 50;

function $(id) { return document.getElementById(id); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new Renderer(this.canvas, $('minimap'));
    this.audio = new AudioEngine();
    this.city = buildCity();
    this.rng = new RNG(hashSeed('solara-bay-play'));
    this.resetRun();
    this.keys = {};
    this.mouse = { x: 640, y: 360 };
    this.mouseDown = false;
    this.bindInput();
    this.bindButtons();
    this.refreshTitleSlots();
    const params = new URLSearchParams(location.search);
    this.shot = params.get('shot');
    if (this.shot) this.setupShot(this.shot);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resetRun() {
    const c = this.city;
    this.phase = 'title'; // title | playing | paused | complete | busted | wasted
    this.started = false;
    this.paused = false;
    this.storyComplete = false;
    this.gameTime = 0;
    this.money = START_MONEY;
    this.missionIndex = 0;
    this.stage = 0;
    this.kills = 0;
    this.missionStartMoney = START_MONEY;
    this.missionElapsed = 0;
    this.missionSnapshot = null;
    this.gold = [];
    this.player = {
      x: c.pois.spawn.x, y: c.pois.spawn.y, angle: 0, aim: 0,
      hp: 100, ammo: 48, inCar: false, car: null, walkSpeed: 210,
    };
    this.cars = [];
    this.traffic = [];
    this.patrolCars = [];
    this.footCops = [];
    this.peds = [];
    this.enemies = [];
    this.pickups = [];
    this.bullets = [];
    this.particles = [];
    this.skids = [];
    this.heli = null;
    this.wanted = 0;
    this.decayTimer = 0;
    this.clockMinutes = 16 * 60;
    this.night = false;
    this.cam = { x: 0, y: 0 };
    this.shake = 0;
    this.marker = null;
    this.dialogueLog = [];
    this.seenStages = [];
    this.race = { active: false, name: '', checkpoints: [], nextIndex: 0, timeLeft: 0, raceDef: null };
    this.racesWon = 0;
    this.racesWonSet = new Set();
    this.shells = c.shells.map((s) => ({ ...s, collected: false }));
    this.shellsCollected = 0;
    for (const d of c.districts) d.standing = d.start;
    this.taxi = { active: false, customer: null, hasPassenger: false, dest: null, fares: 0, nextSpawn: 8 };
    this.abilities = { swapReadyAt: 0, fixReadyAt: 0 };
    this.stats = { carsStolen: 0, distanceDriven: 0, copsEscaped: 0, takedowns: 0, longestJump: 0, topWanted: 0 };
    this.spawnWorld();
    this.setStage(0, true);
  }

  spawnWorld() {
    const c = this.city;
    const rng = this.rng;
    // parked cars near the spawn
    const sedan = makeCar(700, 540, 'sedan', 0);
    const bike = makeCar(760, 470, 'bike', Math.PI / 2);
    const truck = makeCar(1020, 700, 'truck', 0);
    const sports = makeCar(c.pois.sportsCar.x, c.pois.sportsCar.y, 'sports', Math.PI);
    sports.locked = true;
    this.cars.push(sedan, bike, truck, sports);
    this.sportsCar = sports;
    // traffic
    for (let i = 0; i < 6; i++) {
      const t = makeCar(
        rng.pick(c.avenues) + rng.pick([-20, 20]),
        rng.pick(c.streets),
        rng.pick(['sedan', 'sedan', 'sedan', 'truck']),
        rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      );
      t.parked = false;
      t.target = this.randomIntersection();
      t.stuckAt = 0;
      this.cars.push(t);
      this.traffic.push(t);
    }
    // pedestrians
    for (let i = 0; i < 14; i++) this.peds.push(makePedestrian(rng, c));
    // pickups
    for (const s of c.ammoSpots) this.pickups.push(makePickup(s.x, s.y, 'ammo'));
    for (const s of c.healthSpots) this.pickups.push(makePickup(s.x, s.y, 'health'));
  }

  randomIntersection() {
    const c = this.city;
    return {
      x: this.rng.pick(c.avenues) + this.rng.pick([-30, 30]),
      y: this.rng.pick(c.streets) + this.rng.pick([-30, 30]),
    };
  }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (e.repeat) return;
      if (k === 'p' || k === 'escape') this.togglePause();
      if (k === 'enter') this.onEnter();
      if (k === 'e' && this.phase === 'playing') this.tryEnterExitCar();
      if (k === 'q' && this.phase === 'playing') this.useSwapPlates();
      if (k === 'r' && this.phase === 'playing') this.useQuickFix();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (this.phase === 'playing' && !this.player.inCar) this.shoot();
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
  }
  bindButtons() {
    $('btn-start').addEventListener('click', () => { this.audio.ensure(); this.startNew(); });
    $('btn-continue').addEventListener('click', () => { this.audio.ensure(); this.continueGame(); });
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => this.retryMission());
    $('btn-stats').addEventListener('click', () => this.showStats(true));
    $('btn-quit').addEventListener('click', () => { this.toTitle(); });
    for (let i = 0; i < 3; i++) {
      $(`slot-${i}`).addEventListener('click', () => {
        const raw = localStorage.getItem(SLOT_KEY(i));
        if (raw) { this.audio.ensure(); this.loadSave(JSON.parse(raw)); }
      });
    }
  }
  onEnter() {
    if (this.phase === 'title') { this.audio.ensure(); this.startNew(); return; }
    if (this.phase === 'complete' || this.phase === 'busted' || this.phase === 'wasted') { this.toTitle(); return; }
    if (this.phase === 'playing' && !this.race.active) {
      // start a street race when standing in a car on a start line
      const r = this.raceNearStart();
      if (r) this.startRace(r);
    }
  }

  // ---------- flow ----------
  startNew() {
    this.resetRun();
    this.started = true;
    this.phase = 'playing';
    this.hideOverlays();
    this.say('Rosa Vega', 'Welcome to Solara Bay. First job: steal a car. Any car.');
    this.audio.ensure();
  }
  continueGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    this.loadSave(JSON.parse(raw));
  }
  toTitle() {
    this.phase = 'title';
    this.started = false;
    this.paused = false;
    this.hideOverlays();
    $('overlay-title').classList.remove('hidden');
    this.refreshTitleSlots();
  }
  togglePause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.paused = true;
      $('overlay-pause').classList.remove('hidden');
      this.showStats(false);
      this.saveGame(0);
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.paused = false;
      $('overlay-pause').classList.add('hidden');
      $('stats-panel').classList.add('hidden');
    }
  }
  hideOverlays() {
    $('overlay-title').classList.add('hidden');
    $('overlay-pause').classList.add('hidden');
    $('overlay-end').classList.add('hidden');
    $('stats-panel').classList.add('hidden');
  }
  retryMission() {
    const s = this.missionSnapshot;
    if (!s) { this.startNew(); return; }
    this.money = s.money;
    this.hp = 100;
    this.player.hp = 100;
    this.player.ammo = 48;
    this.player.x = s.px; this.player.y = s.py;
    this.player.inCar = false; this.player.car = null;
    this.missionIndex = s.missionIndex;
    this.kills = 0;
    this.clearWanted();
    this.enemies = [];
    this.setStage(s.stage, true);
    this.phase = 'playing';
    this.started = true;
    this.hideOverlays();
    this.saveGame(0);
  }

  // ---------- missions ----------
  mission() { return MISSIONS[this.missionIndex] || null; }
  missionDef(mi) { return MISSIONS[mi]; }
  setStage(n, silent) {
    this.stage = n;
    const m = this.mission();
    if (!m) return;
    const st = m.stages[n];
    if (st) {
      this.seenStages.push(`M${this.missionIndex + 1} STAGE ${n + 1}/${m.stages.length}: ${st.title}`);
      const dlg = m.dialogue[Math.min(n, m.dialogue.length - 1)];
      if (dlg && !silent) this.say(dlg.who, dlg.line);
    }
    // night palette follows the mission
    this.night = !!m.night;
    if (m.night) this.clockMinutes = 21 * 60;
    this.updateMarker();
  }
  updateMarker() {
    const p = this.city.pois;
    const mi = this.missionIndex;
    const s = this.stage;
    let m = null;
    if (mi === 0) m = s === 0 ? null : { ...p.dropoff, label: 'DROP-OFF' };
    else if (mi === 1) m = s === 0 ? { ...p.pickup, label: 'PICKUP' } : { ...p.delivery, label: 'DELIVER' };
    else if (mi === 2) m = s === 0 ? { ...p.turf, label: 'TURF' } : { x: 1240, y: 1560, label: 'HOLD' };
    else if (mi === 3) m = s === 0 ? { ...p.goods, label: 'GOODS' } : { ...p.safehouse, label: 'SAFEHOUSE' };
    else if (mi === 4) m = s === 0 ? { ...p.bank, label: 'BANK' } : s === 1 ? { ...p.bankCash, label: 'CASH' } : { ...p.garage, label: 'GARAGE' };
    else if (mi === 5) m = s === 0 ? { ...p.sportsCar, label: 'SPORTS CAR' } : { ...p.safehouse, label: 'SAFEHOUSE' };
    else if (mi === 6) m = s === 0 ? { ...p.casino, label: 'CASINO' } : s === 1 ? { ...p.casinoCash, label: 'CASH' } : { ...p.safehouse, label: 'SAFEHOUSE' };
    if (this.race.active && this.race.checkpoints.length) {
      const cp = this.race.checkpoints[this.race.nextIndex];
      if (cp) m = { ...cp, label: `CHECKPOINT ${this.race.nextIndex + 1}` };
    }
    this.marker = m;
  }
  currentDistrict() {
    return this.city.districtAt(this.player.x, this.player.y);
  }
  say(who, line) {
    this.dialogueLog.push({ who, line });
    const box = $('dialogue-box');
    box.innerHTML = `<b>${who}</b> — ${line}`;
    box.classList.remove('hidden');
    clearTimeout(this._dlgTimer);
    this._dlgTimer = setTimeout(() => box.classList.add('hidden'), 5000);
  }
  startMissionSnapshot() {
    this.missionSnapshot = {
      money: this.money, missionIndex: this.missionIndex, stage: this.stage,
      px: this.player.x, py: this.player.y,
    };
    this.missionStartMoney = this.money;
    this.missionElapsed = 0;
  }
  completeMission() {
    const m = this.mission();
    if (!m) return;
    this.money += m.reward;
    this.player.hp = Math.min(100, this.player.hp + 30);
    const d = this.currentDistrict();
    d.standing = Math.min(100, d.standing + 6);
    const par = [60, 90, 150, 120, 180, 150, 180][this.missionIndex];
    this.gold[this.missionIndex] = this.missionElapsed < par ? 'GOLD' : 'DONE';
    this.audio.missionDone();
    this.clearWanted();
    this.enemies = [];
    this.kills = 0;
    this.missionIndex += 1;
    this.saveGame(0);
    if (this.missionIndex >= MISSIONS.length) {
      this.storyComplete = true;
      this.phase = 'complete';
      $('end-title').textContent = 'STORY COMPLETE';
      $('end-text').textContent = `You own Solara Bay. $${this.money} banked, ${this.shellsCollected}/8 shells, ${this.racesWon}/2 races won.`;
      $('overlay-end').classList.remove('hidden');
      this.saveGame(0);
      return;
    }
    // M6 unlocks the boss sports car (and resets it to the marina)
    if (this.missionIndex === 5) {
      this.sportsCar.locked = false;
      this.sportsCar.x = this.city.pois.sportsCar.x;
      this.sportsCar.y = this.city.pois.sportsCar.y;
      this.sportsCar.angle = Math.PI;
      this.sportsCar.speed = 0;
    }
    this.startMissionSnapshot();
    this.setStage(0);
    const next = this.mission();
    this.say('Rosa Vega', `Mission done — $${m.reward}. Next: ${next.title}.`);
  }
  checkMission() {
    const p = this.player;
    const mi = this.missionIndex;
    const s = this.stage;
    const mk = this.marker;
    if (mi >= MISSIONS.length) return;
    const near = (x, y, r) => dist(p.x, p.y, x, y) <= r;
    if (mi === 0) {
      if (s === 0 && p.inCar) this.setStage(1);
      else if (s === 1 && p.inCar && near(mk.x, mk.y, 85)) this.completeMission();
    } else if (mi === 1) {
      if (s === 0 && near(mk.x, mk.y, 75)) this.setStage(1);
      else if (s === 1 && near(mk.x, mk.y, 75)) this.completeMission();
    } else if (mi === 2) {
      if (s === 0) {
        if (!p.inCar && near(mk.x, mk.y, 260) && this.enemies.length === 0 && this.kills < 4) {
          this.spawnGang(mk.x, mk.y, 4 - this.kills);
        }
        if (this.kills >= 4) { this.setStage(1); }
      } else if (s === 1 && near(mk.x, mk.y, 70)) this.completeMission();
    } else if (mi === 3) {
      if (s === 0 && near(mk.x, mk.y, 75)) {
        this.setStage(1);
        this.raiseWanted(3, 3, 2);
        this.say('Nia Solano', 'SBPD is on you — three stars! Lose them at the safehouse.');
      } else if (s === 1 && near(mk.x, mk.y, 85)) { this.stats.copsEscaped += 1; this.completeMission(); }
    } else if (mi === 4) {
      if (s === 0) {
        if (!p.inCar && near(mk.x, mk.y, 200) && this.enemies.length === 0 && this.kills < 3) {
          this.spawnGang(mk.x, mk.y, 3 - this.kills, 'guard');
        }
        if (this.kills >= 3) { this.setStage(1); }
      } else if (s === 1 && near(mk.x, mk.y, 65)) {
        this.setStage(2);
        this.raiseWanted(2, 2, 0);
        this.audio.cash();
      } else if (s === 2 && p.inCar && near(mk.x, mk.y, 85)) this.completeMission();
    } else if (mi === 5) {
      if (s === 0 && p.inCar && p.car === this.sportsCar) {
        this.setStage(1);
        this.raiseWanted(3, 4, 2);
        this.say('Nia Solano', 'Four patrol cars, two on foot. Drive!');
      } else if (s === 1 && near(mk.x, mk.y, 85)) { this.stats.copsEscaped += 1; this.completeMission(); }
    } else if (mi === 6) {
      if (s === 0) {
        if (!p.inCar && near(mk.x, mk.y, 200) && this.enemies.length === 0 && this.kills < 4) {
          this.spawnGang(mk.x, mk.y, 4 - this.kills, 'guard');
        }
        if (this.kills >= 4) { this.setStage(1); }
      } else if (s === 1 && near(mk.x, mk.y, 65)) {
        this.setStage(2);
        this.raiseWanted(3, 5, 2);
        this.audio.cash();
        this.say('Rosa Vega', 'Biggest chase in the bay. Five patrol cars — go!');
      } else if (s === 2 && near(mk.x, mk.y, 85)) { this.stats.copsEscaped += 1; this.completeMission(); }
    }
  }
  spawnGang(x, y, n, kind) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5;
      let ex = x + Math.cos(a) * 90;
      let ey = y + Math.sin(a) * 90;
      const spot = this.city.findOpenSpot(ex, ey);
      ex = spot.x; ey = spot.y;
      this.enemies.push(makeEnemy(ex, ey, kind || 'gang'));
    }
  }

  // ---------- wanted & police ----------
  raiseWanted(n, patrolN, footN) {
    this.wanted = n;
    this.stats.topWanted = Math.max(this.stats.topWanted, n);
    this.cancelTaxi();
    for (let i = this.patrolCars.length; i < patrolN; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(380, 520);
      let x = this.player.x + Math.cos(a) * r;
      let y = this.player.y + Math.sin(a) * r;
      const s = this.city.findOpenSpot(x, y);
      const car = makeCar(s.x, s.y, 'patrol', 0);
      car.parked = false;
      this.cars.push(car);
      this.patrolCars.push(car);
    }
    for (let i = this.footCops.length; i < footN; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(280, 380);
      let x = this.player.x + Math.cos(a) * r;
      let y = this.player.y + Math.sin(a) * r;
      const s = this.city.findOpenSpot(x, y);
      this.footCops.push(makeFootCop(s.x, s.y));
    }
    if (n >= 3 && !this.heli) this.heli = makeHelicopter(this.player.x - 100, this.player.y - 160);
    this.audio.setSiren(n > 0);
  }
  raiseWantedToOne() {
    // NO-OP by design: wanted comes only from missions. Stealing a car or
    // shooting during a mission must never spike wanted and summon a cop.
  }
  clearWanted() {
    this.wanted = 0;
    for (const c of this.patrolCars) {
      const i = this.cars.indexOf(c);
      if (i >= 0) this.cars.splice(i, 1);
    }
    this.patrolCars = [];
    this.footCops = [];
    this.heli = null;
    this.audio.setSiren(false);
  }
  isChaseStage() {
    return (this.missionIndex === 3 && this.stage === 1)
      || (this.missionIndex === 4 && this.stage === 2)
      || (this.missionIndex === 5 && this.stage === 1)
      || (this.missionIndex === 6 && this.stage === 2);
  }

  // ---------- crew abilities ----------
  useSwapPlates() {
    if (this.gameTime < this.abilities.swapReadyAt) return;
    if (this.wanted <= 0) return;
    this.abilities.swapReadyAt = this.gameTime + 45;
    this.wanted = Math.max(0, this.wanted - 1);
    if (this.patrolCars.length > 0) {
      let far = this.patrolCars[0];
      let fd = -1;
      for (const c of this.patrolCars) {
        const d = dist(c.x, c.y, this.player.x, this.player.y);
        if (d > fd) { fd = d; far = c; }
      }
      this.patrolCars.splice(this.patrolCars.indexOf(far), 1);
      const i = this.cars.indexOf(far);
      if (i >= 0) this.cars.splice(i, 1);
    }
    if (this.footCops.length > 0) this.footCops.pop();
    if (this.wanted < 3) this.heli = null;
    if (this.wanted === 0) this.audio.setSiren(false);
    this.say('Rosa Vega', 'Plates swapped — one star gone. They lost the scent.');
  }
  useQuickFix() {
    if (this.gameTime < this.abilities.fixReadyAt) return;
    const car = this.player.car;
    if (!car) return;
    this.abilities.fixReadyAt = this.gameTime + 60;
    car.condition = 100;
    this.say('Tomas Ibarra', 'Fixed. She purrs like new — do not scratch her again.');
    this.burst(this.player.x, this.player.y, '#7dff5e', 10);
  }

  // ---------- cars ----------
  tryEnterExitCar() {
    const p = this.player;
    if (p.inCar) {
      const car = p.car;
      car.parked = true;
      p.inCar = false;
      p.car = null;
      p.x = car.x - Math.sin(car.angle) * 34;
      p.y = car.y + Math.cos(car.angle) * 34;
      const s = this.city.findOpenSpot(p.x, p.y);
      p.x = s.x; p.y = s.y;
      p.angle = car.angle;
      return;
    }
    let best = null;
    let bd = 70;
    // During M6 stage 0 the boss sports car is the target: prefer it over
    // the car the player just stepped out of.
    if (this.missionIndex === 5 && this.stage === 0) {
      const sc = this.sportsCar;
      if (dist(p.x, p.y, sc.x, sc.y) <= 70) best = sc;
    }
    if (!best) {
      for (const c of this.cars) {
        const d = dist(p.x, p.y, c.x, c.y);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (!best) return;
    if (best.locked) {
      this.say('Rosa Vega', 'Locked — the boss sports car. Come back for King of the Bay.');
      return;
    }
    p.inCar = true;
    p.car = best;
    best.parked = false;
    this.stats.carsStolen += 1;
    const ti = this.traffic.indexOf(best);
    if (ti >= 0) this.traffic.splice(ti, 1);
    if (this.traffic.length < 6) this.spawnTrafficCar();
    this.audio.ensure();
  }
  spawnTrafficCar() {
    const c = this.city;
    const t = makeCar(
      this.rng.pick(c.avenues), this.rng.pick(c.streets),
      this.rng.pick(['sedan', 'sedan', 'truck']), this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    );
    t.parked = false;
    t.target = this.randomIntersection();
    t.stuckAt = 0;
    this.cars.push(t);
    this.traffic.push(t);
  }

  // ---------- combat ----------
  shoot() {
    const p = this.player;
    if (p.ammo <= 0) { this.audio.blip(120, 0.08, 'square', 0.06); return; }
    p.ammo -= 1;
    const wx = this.mouse.x + this.cam.x;
    const wy = this.mouse.y + this.cam.y;
    const a = Math.atan2(wy - p.y, wx - p.x);
    p.aim = a;
    const sp = 900;
    this.bullets.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, from: 'player', life: 0.9 });
    this.burst(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, '#ffe14d', 4);
    this.audio.shoot();
    this.shake = Math.max(this.shake, 3);
  }
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(40, 160);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, color });
    }
  }
  updateBullets(dt) {
    const p = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      let dead = false;
      if (!this.city.inBounds(nx, ny) || this.city.hitsBuilding(nx, ny, 2)) {
        this.burst(nx, ny, '#c9c2ae', 3);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const e of [...this.enemies, ...this.footCops]) {
          if (segmentHitsCircle(b.x, b.y, nx, ny, e.x, e.y, 14) >= 0) {
            e.hp -= 1;
            this.burst(e.x, e.y, '#ff6b6b', 5);
            if (e.hp <= 0) this.killTarget(e);
            dead = true;
            break;
          }
        }
      } else if (!dead && b.from === 'enemy') {
        const r = p.inCar ? 24 : 12;
        const tx = p.inCar && p.car ? p.car.x : p.x;
        const ty = p.inCar && p.car ? p.car.y : p.y;
        if (segmentHitsCircle(b.x, b.y, nx, ny, tx, ty, r) >= 0) {
          if (p.inCar && p.car) p.car.condition = Math.max(20, p.car.condition - 4);
          else {
            p.hp -= 3;
            this.shake = Math.max(this.shake, 4);
            if (p.hp <= 0) this.wasted();
          }
          dead = true;
        }
      }
      if (dead) this.bullets.splice(i, 1);
      else {
        b.x = nx; b.y = ny;
        b.life -= dt;
        if (b.life <= 0) this.bullets.splice(i, 1);
      }
    }
  }
  killTarget(e) {
    const ei = this.enemies.indexOf(e);
    if (ei >= 0) {
      this.enemies.splice(ei, 1);
      this.kills += 1;
      this.stats.takedowns += 1;
      this.player.ammo = Math.min(96, this.player.ammo + 12);
      // dead enemies ALWAYS drop ammo
      this.pickups.push(makePickup(e.x, e.y, 'ammo'));
      this.burst(e.x, e.y, '#ff6b6b', 10);
    } else {
      const ci = this.footCops.indexOf(e);
      if (ci >= 0) {
        this.footCops.splice(ci, 1);
        this.stats.takedowns += 1;
        this.player.ammo = Math.min(96, this.player.ammo + 12);
        this.burst(e.x, e.y, '#9db4ff', 8);
      }
    }
  }
  wasted() {
    this.phase = 'wasted';
    $('end-title').textContent = 'WASTED';
    $('end-text').textContent = 'Solara Bay is not done with you. Press ENTER to retry the mission.';
    $('overlay-end').classList.remove('hidden');
  }
  busted() {
    this.phase = 'busted';
    $('end-title').textContent = 'BUSTED';
    $('end-text').textContent = 'SBPD caught you. Press ENTER to retry the mission.';
    $('overlay-end').classList.remove('hidden');
  }

  // ---------- taxi ----------
  cancelTaxi() {
    if (this.taxi.active || this.taxi.hasPassenger) {
      if (this.taxi.customer) {
        const i = this.peds.indexOf(this.taxi.customer);
        if (i >= 0) this.peds.splice(i, 1);
      }
      this.taxi.active = false;
      this.taxi.hasPassenger = false;
      this.taxi.customer = null;
      this.taxi.dest = null;
      this.taxi.nextSpawn = this.gameTime + 6;
    }
  }
  updateTaxi(dt) {
    const t = this.taxi;
    if (this.missionIndex < 2 || this.wanted > 0 || this.phase !== 'playing') return;
    if (!t.active && !t.hasPassenger && this.gameTime >= t.nextSpawn && !this.player.inCar) {
      // spawn a fare at a curb near the player
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(200, 420);
      let x = this.player.x + Math.cos(a) * r;
      let y = this.player.y + Math.sin(a) * r;
      const s = this.city.findOpenSpot(x, y);
      const ped = makePedestrian(this.rng, this.city);
      ped.x = s.x; ped.y = s.y; ped.taxi = true; ped.wait = 999;
      this.peds.push(ped);
      const dest = this.randomIntersection();
      t.active = true;
      t.customer = ped;
      t.dest = dest;
    }
    if (t.active && !t.hasPassenger && this.player.inCar) {
      if (dist(this.player.x, this.player.y, t.customer.x, t.customer.y) <= 70) {
        t.hasPassenger = true;
        this.peds.splice(this.peds.indexOf(t.customer), 1);
        this.say('Nia Solano', 'Passenger aboard. Get them there fast — tip depends on it.');
      }
    }
    if (t.hasPassenger && this.player.inCar) {
      if (dist(this.player.x, this.player.y, t.dest.x, t.dest.y) <= 80) {
        this.money += 150;
        t.fares += 1;
        const d = this.city.districtAt(t.dest.x, t.dest.y);
        d.standing = Math.min(100, d.standing + 6);
        this.audio.cash();
        this.say('Rosa Vega', 'Fare paid, +$150. Another one will show up soon.');
        t.hasPassenger = false;
        t.active = false;
        t.customer = null;
        t.dest = null;
        t.nextSpawn = this.gameTime + 4;
      }
    }
  }

  // ---------- street races ----------
  raceNearStart() {
    if (!this.player.inCar) return null;
    for (const r of this.city.races) {
      if (this.racesWonSet.has(r.name)) continue;
      if (dist(this.player.x, this.player.y, r.start.x, r.start.y) <= 70) return r;
    }
    return null;
  }
  startRace(def) {
    this.race = {
      active: true, name: def.name, checkpoints: def.checkpoints,
      nextIndex: 0, timeLeft: def.timeLimit, raceDef: def,
    };
    this.updateMarker();
    this.say('Rosa Vega', `${def.name} — hit every checkpoint before the clock runs out!`);
  }
  updateRace(dt) {
    const r = this.race;
    if (!r.active) return;
    r.timeLeft -= dt;
    const cp = r.checkpoints[r.nextIndex];
    if (cp && dist(this.player.x, this.player.y, cp.x, cp.y) <= 70) {
      r.nextIndex += 1;
      this.audio.pickup();
      if (r.nextIndex >= r.checkpoints.length) {
        this.money += 250;
        this.racesWon += 1;
        this.racesWonSet.add(r.name);
        const d = this.currentDistrict();
        d.standing = Math.min(100, d.standing + 6);
        this.audio.missionDone();
        this.say('Rosa Vega', `${r.name} won — +$250! The bay knows your name now.`);
        this.race.active = false;
        this.updateMarker();
        return;
      }
      this.updateMarker();
    }
    if (r.timeLeft <= 0) {
      this.race.active = false;
      this.say('Nia Solano', 'Too slow — the race is over. Drive back to the start to try again.');
      this.updateMarker();
    }
  }

  // ---------- pickups & shells ----------
  updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) {
        if (pk.respawnAt && this.gameTime >= pk.respawnAt) {
          pk.taken = false;
          pk.respawnAt = 0;
        }
        continue;
      }
      if (dist(p.x, p.y, pk.x, pk.y) <= 36) {
        pk.taken = true;
        if (pk.kind === 'ammo') {
          p.ammo = Math.min(96, p.ammo + 24);
        } else {
          p.hp = Math.min(100, p.hp + 30);
        }
        this.audio.pickup();
        this.burst(pk.x, pk.y, '#7dff5e', 6);
        // static spots respawn after 15 s; enemy drops do not
        const isStatic = this.city.ammoSpots.some((s) => s.x === pk.x && s.y === pk.y)
          || this.city.healthSpots.some((s) => s.x === pk.x && s.y === pk.y);
        if (isStatic) pk.respawnAt = this.gameTime + 15;
      }
    }
    for (const s of this.shells) {
      if (s.collected) continue;
      if (dist(p.x, p.y, s.x, s.y) <= 36) {
        s.collected = true;
        this.shellsCollected += 1;
        this.money += 100;
        this.audio.cash();
        this.burst(s.x, s.y, '#ffd23e', 8);
        this.say('Nia Solano', `Sun Shell found — +$100. ${this.shellsCollected}/8.`);
      }
    }
  }

  // ---------- police AI ----------
  updatePolice(dt) {
    const p = this.player;
    const px = p.inCar && p.car ? p.car.x : p.x;
    const py = p.inCar && p.car ? p.car.y : p.y;
    for (const car of this.patrolCars) {
      const desired = Math.atan2(py - car.y, px - car.x);
      const diff = normAngle(desired - car.angle);
      const input = { up: true, down: false, left: false, right: false };
      if (Math.abs(diff) > 1.9) { input.up = false; input.down = true; }
      if (diff > 0.4) input.right = true;
      else if (diff < -0.4) input.left = true;
      stepCarPhysics(car, input, dt, this.city);
      // ram damage on contact with the player's car
      if (p.inCar && p.car && dist(car.x, car.y, p.car.x, p.car.y) < 46) {
        p.car.condition = Math.max(20, p.car.condition - 6 * dt);
        if (Math.random() < dt * 2) {
          this.shake = Math.max(this.shake, 4);
          this.audio.crash();
        }
      }
    }
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const c = this.footCops[i];
      if (c.grace > 0) c.grace -= dt;
      const d = dist(c.x, c.y, p.x, p.y);
      if (!p.inCar && d > 600) { this.footCops.splice(i, 1); continue; }
      if (p.inCar && d > 700) { this.footCops.splice(i, 1); continue; }
      const a = Math.atan2(p.y - c.y, p.x - c.x);
      c.angle = a;
      const nx = c.x + Math.cos(a) * c.speed * dt;
      const ny = c.y + Math.sin(a) * c.speed * dt;
      if (this.city.inBounds(nx, ny) && !this.city.hitsBuilding(nx, ny, 10) && !this.city.isWater(nx, ny)) {
        c.x = nx; c.y = ny;
      }
      if (!p.inCar && d <= 26 && c.grace <= 0) {
        c.bustTime += dt;
        if (c.bustTime >= 0.8) { this.busted(); return; }
      } else {
        c.bustTime = 0;
      }
    }
    if (this.heli) {
      this.heli.rotor += dt * 30;
      this.heli.x += (px - 120 - this.heli.x) * dt * 1.2;
      this.heli.y += (py - 170 - this.heli.y) * dt * 1.2;
    }
    // wanted decays only outside chase stages, when out of sight
    if (this.wanted > 0 && !this.isChaseStage()) {
      let near = false;
      for (const c of this.patrolCars) if (dist(c.x, c.y, px, py) < 350) near = true;
      for (const c of this.footCops) if (dist(c.x, c.y, px, py) < 350) near = true;
      if (!near) {
        this.decayTimer += dt;
        if (this.decayTimer >= 6) {
          this.decayTimer = 0;
          this.wanted -= 1;
          if (this.patrolCars.length > 0) {
            const gone = this.patrolCars.pop();
            const i = this.cars.indexOf(gone);
            if (i >= 0) this.cars.splice(i, 1);
          }
          if (this.wanted === 0) {
            this.footCops = [];
            this.heli = null;
            this.audio.setSiren(false);
            this.stats.copsEscaped += 1;
          }
        }
      } else {
        this.decayTimer = 0;
      }
    }
  }

  updateTraffic(dt) {
    for (const t of this.traffic) {
      const desired = Math.atan2(t.target.y - t.y, t.target.x - t.x);
      const diff = normAngle(desired - t.angle);
      const input = { up: true, down: false, left: false, right: false };
      if (Math.abs(diff) > 1.9) { input.up = false; input.down = true; }
      if (diff > 0.4) input.right = true;
      else if (diff < -0.4) input.left = true;
      // do not rear-end the car ahead
      for (const o of this.cars) {
        if (o === t) continue;
        const ahead = (o.x - t.x) * Math.cos(t.angle) + (o.y - t.y) * Math.sin(t.angle);
        const side = Math.abs((o.x - t.x) * -Math.sin(t.angle) + (o.y - t.y) * Math.cos(t.angle));
        if (ahead > 0 && ahead < 70 && side < 30) { input.up = false; input.down = true; }
      }
      const prev = { x: t.x, y: t.y };
      stepCarPhysics(t, input, dt, this.city);
      if (dist(t.x, t.y, t.target.x, t.target.y) < 60) t.target = this.randomIntersection();
      if (dist(t.x, t.y, prev.x, prev.y) < 2) {
        t.stuckAt += dt;
        if (t.stuckAt > 2) { t.target = this.randomIntersection(); t.stuckAt = 0; }
      } else t.stuckAt = 0;
    }
    separateCars(this.cars, this.city);
  }

  updateEnemies(dt) {
    const p = this.player;
    const px = p.inCar && p.car ? p.car.x : p.x;
    const py = p.inCar && p.car ? p.car.y : p.y;
    for (const e of this.enemies) {
      const d = dist(e.x, e.y, px, py);
      const sees = d < 420 && lineOfSight(this.city, e.x, e.y, px, py);
      if (sees) {
        e.angle = Math.atan2(py - e.y, px - e.x);
        e.fireAt -= dt;
        if (e.fireAt <= 0) {
          e.fireAt = 1.9;
          const spread = (Math.random() - 0.5) * 0.44;
          const a = e.angle + spread;
          const sp = 500;
          this.bullets.push({ x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, from: 'enemy', life: 1.2 });
          this.audio.enemyShoot();
          this.burst(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, '#ffe14d', 3);
        }
      } else {
        // no line of sight: advance toward the player
        const a = Math.atan2(py - e.y, px - e.x);
        e.angle = a;
        const nx = e.x + Math.cos(a) * e.speed * dt;
        const ny = e.y + Math.sin(a) * e.speed * dt;
        if (this.city.inBounds(nx, e.y) && !this.city.hitsBuilding(nx, e.y, 10)) e.x = nx;
        if (this.city.inBounds(e.x, ny) && !this.city.hitsBuilding(e.x, ny, 10)) e.y = ny;
      }
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    const k = this.keys;
    if (p.inCar && p.car) {
      const car = p.car;
      const input = {
        up: !!(k.w || k.arrowup), down: !!(k.s || k.arrowdown),
        left: !!(k.a || k.arrowleft), right: !!(k.d || k.arrowright),
      };
      const prevX = car.x;
      const prevY = car.y;
      const prevAngle = car.angle;
      const hit = stepCarPhysics(car, input, dt, this.city);
      if (hit && Math.abs(car.speed) > 60) {
        this.shake = Math.max(this.shake, 5);
        this.audio.crash();
      }
      if (car.skid > 0) {
        this.skids.push({ x0: prevX, y0: prevY, x1: car.x, y1: car.y });
        if (this.skids.length > 200) this.skids.shift();
      }
      const moved = dist(car.x, car.y, prevX, prevY);
      this.stats.distanceDriven += moved;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      const maxSpd = car.maxSpeed * (0.5 + car.condition / 200);
      if (Math.abs(car.speed) > maxSpd) car.speed = Math.sign(car.speed) * maxSpd;
      this.audio.setEngine(car.speed, car.maxSpeed);
      void prevAngle;
    } else {
      let mx = 0;
      let my = 0;
      if (k.w || k.arrowup) my -= 1;
      if (k.s || k.arrowdown) my += 1;
      if (k.a || k.arrowleft) mx -= 1;
      if (k.d || k.arrowright) mx += 1;
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        const nx = p.x + mx * p.walkSpeed * dt;
        const ny = p.y + my * p.walkSpeed * dt;
        if (this.city.inBounds(nx, p.y) && !this.city.hitsBuilding(nx, p.y, 10) && !this.city.isWater(nx, p.y)) p.x = nx;
        if (this.city.inBounds(p.x, ny) && !this.city.hitsBuilding(p.x, ny, 10) && !this.city.isWater(p.x, ny)) p.y = ny;
        p.angle = Math.atan2(my, mx);
      }
      p.aim = Math.atan2(this.mouse.y + this.cam.y - p.y, this.mouse.x + this.cam.x - p.x);
      this.audio.setEngine(0, 1);
    }
    // camera follows
    const tx = clamp(p.x - 640, 0, this.city.width - 1280);
    const ty = clamp(p.y - 360, 0, this.city.height - 720);
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 6);
    this.shake = Math.max(0, this.shake - dt * 14);
  }

  update(dt) {
    this.gameTime += dt;
    this.missionElapsed += dt;
    this.clockMinutes += dt * 0.7;
    if (this.clockMinutes >= 24 * 60) this.clockMinutes -= 24 * 60;
    this.updatePlayer(dt);
    this.updateTraffic(dt);
    for (const ped of this.peds) {
      const danger = this.bullets.length > 0 ? { x: this.player.x, y: this.player.y } : null;
      stepPedestrian(ped, dt, this.city, danger);
    }
    this.updatePolice(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateTaxi(dt);
    this.updateRace(dt);
    this.checkMission();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    this.updateHud();
  }

  // ---------- HUD ----------
  updateHud() {
    const p = this.player;
    $('hud-money').textContent = `$${this.money}`;
    $('hud-hp').textContent = `HP ${Math.max(0, Math.round(p.hp))}`;
    $('hud-hpbar').style.width = `${Math.max(0, p.hp)}%`;
    $('hud-ammo').textContent = `AMMO ${p.ammo}`;
    $('hud-shells').textContent = `Shells ${this.shellsCollected}/8`;
    $('hud-fares').textContent = this.taxi.fares > 0 ? `Fares ${this.taxi.fares}` : '';
    const hh = Math.floor(this.clockMinutes / 60) % 24;
    const mm = Math.floor(this.clockMinutes % 60);
    $('hud-clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${this.night ? ' NIGHT' : ''}`;
    const d = this.currentDistrict();
    $('hud-district').textContent = `${d.name} · ${d.standing} ${standingStatus(d.standing)}`;
    const stars = '★'.repeat(this.wanted) + '☆'.repeat(Math.max(0, 3 - this.wanted));
    $('hud-wanted').textContent = stars;
    $('hud-wanted').classList.toggle('hot', this.wanted >= 3);
    const m = this.mission();
    if (m) {
      const st = m.stages[this.stage];
      $('mission-title').textContent = `M${this.missionIndex + 1} — ${m.title} · $${m.reward}`;
      $('mission-stage').textContent = `STAGE ${this.stage + 1}/${m.stages.length} — ${st.title}`;
      $('mission-objective').textContent = st.objective;
      $('mission-next').textContent = st.next;
    } else {
      $('mission-title').textContent = 'STORY COMPLETE';
      $('mission-stage').textContent = '';
      $('mission-objective').textContent = 'You own Solara Bay.';
      $('mission-next').textContent = '';
    }
    // SBPD dispatch list during chases
    const dl = $('dispatch-list');
    if (this.wanted > 0) {
      const rows = [];
      this.patrolCars.slice(0, 3).forEach((c, i) => {
        const dd = Math.round(dist(c.x, c.y, p.x, p.y));
        rows.push(`${SBPD_UNITS[i % SBPD_UNITS.length]} · PURSUIT · ${dd}m`);
      });
      if (this.heli) rows.push('SBPD AIR · EYES UP · overhead');
      this.footCops.slice(0, 2).forEach((c, i) => {
        const dd = Math.round(dist(c.x, c.y, p.x, p.y));
        rows.push(`${SBPD_UNITS[(3 + i) % SBPD_UNITS.length]} · ON FOOT · ${dd}m`);
      });
      dl.innerHTML = `<div class="dispatch-head">SBPD DISPATCH</div>${rows.map((r) => `<div>${r}</div>`).join('')}`;
      dl.classList.remove('hidden');
    } else {
      dl.classList.add('hidden');
    }
    // race HUD
    const rh = $('hud-race');
    if (this.race.active) {
      rh.textContent = `${this.race.name} · ${this.race.nextIndex}/${this.race.checkpoints.length} · ${Math.ceil(this.race.timeLeft)}s`;
      rh.classList.remove('hidden');
    } else {
      rh.classList.add('hidden');
    }
    // context prompt
    const pr = $('hud-prompt');
    let prompt = '';
    if (!p.inCar) {
      let best = null;
      let bd = 70;
      for (const c of this.cars) {
        const dd = dist(p.x, p.y, c.x, c.y);
        if (dd < bd) { bd = dd; best = c; }
      }
      if (best) prompt = best.locked ? 'Locked sports car' : `Press E — steal ${best.type}`;
    }
    if (!prompt && this.raceNearStart()) prompt = 'Press ENTER — start race';
    if (!prompt && this.taxi.active && !this.taxi.hasPassenger) prompt = 'Taxi waiting — drive to the TAXI marker';
    pr.textContent = prompt;
    pr.classList.toggle('hidden', !prompt);
    // ability cooldowns
    const swapCd = Math.max(0, Math.ceil(this.abilities.swapReadyAt - this.gameTime));
    const fixCd = Math.max(0, Math.ceil(this.abilities.fixReadyAt - this.gameTime));
    $('hud-abilities').textContent =
      `Q SWAP PLATES ${swapCd > 0 ? `(${swapCd}s)` : 'READY'} · R QUICK FIX ${fixCd > 0 ? `(${fixCd}s)` : 'READY'} · Crew 3/3`;
  }

  // ---------- stats / save ----------
  completionPct() {
    const m = (this.missionIndex / MISSIONS.length) * 60;
    const sh = (this.shellsCollected / 8) * 15;
    const rc = (this.racesWon / 2) * 15;
    const fr = Math.min(this.taxi.fares, 5) / 5 * 10;
    return Math.min(100, Math.round(m + sh + rc + fr));
  }
  showStats(show) {
    const panel = $('stats-panel');
    if (!show) { panel.classList.add('hidden'); return; }
    const friendly = this.city.districts.filter((d) => d.standing >= 70).length;
    const rows = this.city.districts.map((d) =>
      `<div class="stat-row"><span>${d.name}</span><span>${d.standing} · ${standingStatus(d.standing)}</span></div>`).join('');
    const crewRows = CREW.map((c) =>
      `<div class="stat-row"><span>${c.name} — ${c.role}</span><span>${c.ability}${c.key ? ` [${c.key}]` : ' (passive)'}</span></div>`).join('');
    $('stats-content').innerHTML = `
      <div class="stats-grid">
        <div class="stats-donut"><div class="donut-num">${this.completionPct()}%</div><div>COMPLETION</div></div>
        <div class="stats-col">
          <div class="stat-row"><span>Story missions</span><span>${Math.min(this.missionIndex, 7)}/7 ${this.gold.map((g) => g || '').join(' ')}</span></div>
          <div class="stat-row"><span>Street races won</span><span>${this.racesWon}/2</span></div>
          <div class="stat-row"><span>Sun Shells</span><span>${this.shellsCollected}/8</span></div>
          <div class="stat-row"><span>Taxi fares</span><span>${this.taxi.fares}</span></div>
          <div class="stat-row"><span>Districts FRIENDLY</span><span>${friendly}/7</span></div>
          <div class="stat-row"><span>Money</span><span>$${this.money}</span></div>
        </div>
        <div class="stats-col">
          <div class="stat-row"><span>Cars stolen</span><span>${this.stats.carsStolen}</span></div>
          <div class="stat-row"><span>Distance driven</span><span>${(this.stats.distanceDriven / 1000).toFixed(1)} km</span></div>
          <div class="stat-row"><span>Cops escaped</span><span>${this.stats.copsEscaped}</span></div>
          <div class="stat-row"><span>Takedowns</span><span>${this.stats.takedowns}</span></div>
          <div class="stat-row"><span>Longest jump</span><span>${this.stats.longestJump.toFixed(1)} m</span></div>
          <div class="stat-row"><span>Top wanted</span><span>${'★'.repeat(this.stats.topWanted) || '—'}</span></div>
        </div>
      </div>
      <h3>DISTRICT STANDING</h3>${rows}
      <h3>CREW — 3/3</h3>${crewRows}`;
    panel.classList.remove('hidden');
  }
  saveGame(slot) {
    const data = {
      missionIndex: this.missionIndex, stage: this.stage, money: this.money,
      hp: this.player.hp, ammo: this.player.ammo,
      px: this.player.x, py: this.player.y,
      inCar: this.player.inCar,
      carType: this.player.car ? this.player.car.type : null,
      carAngle: this.player.car ? this.player.car.angle : 0,
      carX: this.player.car ? this.player.car.x : 0,
      carY: this.player.car ? this.player.car.y : 0,
      standing: this.city.districts.map((d) => d.standing),
      shells: this.shells.map((s) => s.collected),
      shellsCollected: this.shellsCollected,
      racesWon: this.racesWon,
      racesWonSet: [...this.racesWonSet],
      fares: this.taxi.fares,
      storyComplete: this.storyComplete,
      clockMinutes: this.clockMinutes,
      stats: this.stats,
      gold: this.gold,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      localStorage.setItem(SLOT_KEY(slot), JSON.stringify(data));
    } catch (e) {}
  }
  loadSave(data) {
    this.resetRun();
    this.missionIndex = data.missionIndex;
    this.stage = 0;
    this.money = data.money;
    this.player.hp = data.hp;
    this.player.ammo = data.ammo;
    this.player.x = data.px;
    this.player.y = data.py;
    data.standing.forEach((v, i) => { this.city.districts[i].standing = v; });
    data.shells.forEach((v, i) => { this.shells[i].collected = v; });
    this.shellsCollected = data.shellsCollected;
    this.racesWon = data.racesWon;
    this.racesWonSet = new Set(data.racesWonSet || []);
    this.taxi.fares = data.fares || 0;
    this.storyComplete = !!data.storyComplete;
    this.clockMinutes = data.clockMinutes || 16 * 60;
    Object.assign(this.stats, data.stats || {});
    this.gold = data.gold || [];
    if (data.inCar && data.carType) {
      const car = makeCar(data.carX, data.carY, data.carType, data.carAngle);
      car.parked = false;
      this.cars.push(car);
      this.player.car = car;
      this.player.inCar = true;
    }
    if (this.missionIndex >= MISSIONS.length || this.storyComplete) {
      this.missionIndex = MISSIONS.length;
      this.storyComplete = true;
    }
    this.startMissionSnapshot();
    this.started = true;
    this.phase = this.storyComplete ? 'complete' : 'playing';
    this.hideOverlays();
    if (this.storyComplete) {
      $('end-title').textContent = 'STORY COMPLETE';
      $('end-text').textContent = `You own Solara Bay. $${this.money} banked, ${this.shellsCollected}/8 shells, ${this.racesWon}/2 races won.`;
      $('overlay-end').classList.remove('hidden');
    } else {
      this.setStage(data.stage || 0);
      if (this.missionIndex === 5) {
        this.sportsCar.locked = false;
        this.sportsCar.x = this.city.pois.sportsCar.x;
        this.sportsCar.y = this.city.pois.sportsCar.y;
      }
    }
  }
  refreshTitleSlots() {
    for (let i = 0; i < 3; i++) {
      const el = $(`slot-${i}`);
      const raw = localStorage.getItem(SLOT_KEY(i));
      if (!raw) {
        el.innerHTML = `<b>SLOT ${i + 1}</b><span>EMPTY</span>`;
        el.classList.add('empty');
        continue;
      }
      const d = JSON.parse(raw);
      const pct = Math.min(100, Math.round((Math.min(d.missionIndex, 7) / 7) * 60 + (d.shellsCollected / 8) * 15 + (d.racesWon / 2) * 15 + Math.min(d.fares || 0, 5) / 5 * 10));
      const hh = Math.floor((d.clockMinutes || 960) / 60) % 24;
      const mm = Math.floor((d.clockMinutes || 960) % 60);
      el.innerHTML = `<b>SLOT ${i + 1}</b><span>Mission ${Math.min(d.missionIndex + 1, 7)}/7 · ${pct}% · $${d.money} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>`;
      el.classList.remove('empty');
    }
    $('btn-continue').style.display = localStorage.getItem(SAVE_KEY) ? '' : 'none';
  }

  // ---------- shot staging ----------
  setupShot(shot) {
    this.started = true;
    this.hideOverlays();
    if (shot === 'title') {
      this.phase = 'title';
      $('overlay-title').classList.remove('hidden');
      this.refreshTitleSlots();
      return;
    }
    this.phase = 'playing';
    if (shot === 'chase') {
      // daytime coastal chase on the palm boulevard by the sea
      this.missionIndex = 3;
      this.startMissionSnapshot();
      this.setStage(1);
      this.money = 1650;
      this.player.hp = 100;
      this.player.ammo = 48;
      const car = makeCar(2240, 900, 'sedan', Math.PI / 2);
      car.parked = false;
      car.speed = 200;
      this.cars.push(car);
      this.player.car = car;
      this.player.inCar = true;
      this.player.x = car.x; this.player.y = car.y;
      this.raiseWanted(3, 3, 0);
      this.patrolCars[0].x = 2240; this.patrolCars[0].y = 700; this.patrolCars[0].angle = Math.PI / 2;
      this.patrolCars[1].x = 2200; this.patrolCars[1].y = 780; this.patrolCars[1].angle = Math.PI / 2;
      this.patrolCars[2].x = 2280; this.patrolCars[2].y = 760; this.patrolCars[2].angle = Math.PI / 2;
      this.clockMinutes = 16 * 60 + 30;
      this.night = false;
      this.say('Nia Solano', 'SBPD is on you — three stars! Lose them at the safehouse.');
    } else if (shot === 'night') {
      // night shootout downtown
      this.missionIndex = 4;
      this.startMissionSnapshot();
      this.setStage(0);
      this.money = 3150;
      this.night = true;
      this.clockMinutes = 22 * 60;
      this.player.x = 1300; this.player.y = 1000;
      this.player.hp = 100;
      this.player.ammo = 48;
      this.wanted = 2;
      this.spawnGang(1320, 1060, 3, 'guard');
      this.burst(1300, 1000, '#ffe14d', 12);
      this.say('Tomas Ibarra', 'Vault guards ahead. Three shots each.');
    } else if (shot === 'stats') {
      // mid-progress game with the dense stats menu open
      this.missionIndex = 4;
      this.money = 3200;
      this.shellsCollected = 5;
      this.shells.forEach((s, i) => { s.collected = i < 5; });
      this.racesWon = 1;
      this.racesWonSet.add('Promenade Sprint');
      this.taxi.fares = 3;
      this.stats.carsStolen = 9;
      this.stats.distanceDriven = 12400;
      this.stats.copsEscaped = 2;
      this.stats.takedowns = 11;
      this.stats.topWanted = 3;
      this.gold = ['GOLD', 'GOLD', 'DONE', 'GOLD'];
      this.city.districts[0].standing = 58;
      this.city.districts[2].standing = 71;
      this.city.districts[3].standing = 52;
      this.phase = 'paused';
      this.paused = true;
      $('overlay-pause').classList.remove('hidden');
      this.showStats(true);
    }
  }

  // ---------- driver-facing state ----------
  state() {
    const p = this.player;
    const m = this.mission();
    const st = m ? m.stages[this.stage] : null;
    const carsNear = this.cars
      .filter((c) => dist(p.x, p.y, c.x, c.y) < 450)
      .map((c) => ({ x: c.x, y: c.y, parked: c.parked, d: Math.round(dist(p.x, p.y, c.x, c.y)), type: c.type }));
    return {
      state: this.phase,
      started: this.started,
      paused: this.paused,
      storyComplete: this.storyComplete,
      missionIndex: this.missionIndex,
      stage: this.stage,
      stageTitle: st ? st.title : '',
      stageTotal: m ? m.stages.length : 0,
      nextLine: st ? st.next : '',
      dialogue: this.dialogueLog[this.dialogueLog.length - 1] || null,
      dialogueLog: this.dialogueLog,
      seenStages: this.seenStages,
      money: this.money,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      kills: this.kills,
      wanted: this.wanted,
      patrol: this.patrolCars.length,
      cops: this.footCops.length,
      inCar: p.inCar,
      carType: p.car ? p.car.type : null,
      carAngle: p.car ? p.car.angle : p.angle,
      carSpeed: p.car ? Math.round(p.car.speed) : 0,
      carCondition: p.car ? Math.round(p.car.condition) : 100,
      px: Math.round(p.x),
      py: Math.round(p.y),
      cam: { x: Math.round(this.cam.x), y: Math.round(this.cam.y) },
      marker: this.marker ? { x: this.marker.x, y: this.marker.y, label: this.marker.label } : null,
      enemies: this.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })),
      footCops: this.footCops.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      pickups: this.pickups.filter((pk) => !pk.taken).map((pk) => ({ x: pk.x, y: pk.y, kind: pk.kind })),
      carsNear,
      taxi: {
        active: this.taxi.active,
        customer: this.taxi.customer ? { x: this.taxi.customer.x, y: this.taxi.customer.y } : null,
        hasPassenger: this.taxi.hasPassenger,
        dest: this.taxi.dest,
        fares: this.taxi.fares,
      },
      race: {
        active: this.race.active,
        name: this.race.name,
        timeLeft: Math.round(this.race.timeLeft),
        checkpoints: this.race.checkpoints,
        nextIndex: this.race.nextIndex,
      },
      races: { won: this.racesWon, total: 2, list: this.city.races.map((r) => ({ name: r.name, won: this.racesWonSet.has(r.name), start: r.start })) },
      shells: { collected: this.shellsCollected, total: 8, list: this.shells.map((s) => ({ x: s.x, y: s.y, collected: s.collected })) },
      stash: this.shellsCollected,
      districts: this.city.districts.map((d) => ({ name: d.name, standing: d.standing, status: standingStatus(d.standing), x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 })),
      district: (() => { const d = this.currentDistrict(); return { name: d.name, standing: d.standing, status: standingStatus(d.standing) }; })(),
      clock: (() => { const hh = Math.floor(this.clockMinutes / 60) % 24; const mm = Math.floor(this.clockMinutes % 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; })(),
      night: this.night,
      crew: {
        recruited: 3,
        swapReady: this.gameTime >= this.abilities.swapReadyAt,
        swapCooldown: Math.max(0, Math.ceil(this.abilities.swapReadyAt - this.gameTime)),
        fixReady: this.gameTime >= this.abilities.fixReadyAt,
        fixCooldown: Math.max(0, Math.ceil(this.abilities.fixReadyAt - this.gameTime)),
      },
      stats: {
        completionPct: this.completionPct(),
        carsStolen: this.stats.carsStolen,
        distanceDriven: Math.round(this.stats.distanceDriven),
        copsEscaped: this.stats.copsEscaped,
        takedowns: this.stats.takedowns,
        longestJump: this.stats.longestJump,
        topWanted: this.stats.topWanted,
        gold: this.gold,
      },
    };
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // HUD (money, mission banner, wanted, minimap) belongs to gameplay
    // only — hide it behind the title screen so the title stays clean.
    $('hud').style.display = (this.phase === 'playing') ? '' : 'none';
    if (this.phase === 'playing') this.update(dt);
    else if (this.phase === 'title') {
      // slow cinematic pan behind the title screen
      this.cam.x = clamp(700 + Math.sin(now / 9000) * 200, 0, this.city.width - 1280);
      this.cam.y = clamp(500 + Math.cos(now / 11000) * 120, 0, this.city.height - 720);
      this.renderer.time += 0.016;
    }
    this.renderer.draw(this);
    requestAnimationFrame((t) => this.loop(t));
  }
}

// boot
const game = new Game();
window.__game = game;
