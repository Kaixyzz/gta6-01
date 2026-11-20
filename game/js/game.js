// SOLARA BAY — core game: player, cars, police, taxi jobs, save/load and the
// driver-facing state() snapshot. Missions live in missions.js, drawing in
// render.js, physics/AI in entities.js, the city in city.js.
import { buildCity, WORLD_W, WORLD_H, moveCircle, findOpenSpot, isOnRoad, nearestIntersection, AVENUES, STREETS } from './city.js';
import { makeRng, clamp, dist, angleTo } from './rng.js';
import { makeCar, stepCarPhysics, separateCars, makeTrafficCar, stepTraffic, makePedestrian, stepPedestrian, makeFootCop, stepFootCop, makePatrolCar, stepPatrol, makeEnemy, stepEnemy, makeBullet, stepBullets } from './entities.js';
import { createMissions, MISSIONS } from './missions.js';
import { drawGame } from './render.js';
import { SoundBank } from './audio.js';

const SAVE_KEY = 'solara-bay-save-v1';
const SEED = 1337;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = makeRng(SEED);
    this.city = buildCity(SEED);
    this.sound = new SoundBank();
    this.missions = createMissions(this);

    this.phase = 'title';
    this.started = false;
    this.paused = false;
    this.storyComplete = false;
    this.money = 50;
    this.wanted = 0;

    this.player = {
      x: this.city.spots.spawn.x, y: this.city.spots.spawn.y,
      angle: 0, hp: 100, ammo: 48, inCar: false, car: null,
      speed: 0, walkSpeed: 230,
    };
    this.cars = [];
    this.traffic = [];
    this.peds = [];
    this.enemies = [];
    this.cops = [];
    this.patrols = [];
    this.bullets = [];
    this.pickups = [];
    this.stashTaken = [false, false, false];
    this.stash = 0;
    this.particles = [];
    this.skids = [];
    this.cam = { x: 0, y: 0 };
    this.shake = 0;
    this.fireTimer = 0;
    this.danger = null;
    this.time = 0;

    this.taxi = { active: false, customer: null, hasPassenger: false, dest: null, fares: 0, cooldown: 0 };
    this.keys = new Set();
    this.mouse = { x: 640, y: 360, down: false };
    this.bossCar = null;

    this.spawnWorld();
    this.missions.reset();
    this.bindInput();
    this.applyShotStaging();
  }

  // ---------- world setup ----------
  spawnWorld() {
    const rng = this.rng;
    // Parked cars near the spawn, plus the bike and the truck.
    const parked = [
      ['sedan', 320, 560, Math.PI / 2],
      ['sedan', 420, 320, 0],
      ['bike', 320, 700, Math.PI / 2],
      ['truck', 700, 320, 0],
      ['sedan', 960, 420, Math.PI],
      ['sedan', 1280, 700, Math.PI / 2],
    ];
    parked.forEach(([type, x, y, a], i) => {
      this.cars.push(makeCar(type, x, y, a, { parked: true, id: 100 + i }));
    });
    // The boss sports car waits at the marina until M6.
    this.bossCar = makeCar('sports', this.city.spots.sportsCar.x, this.city.spots.sportsCar.y, Math.PI, { parked: true, boss: true, id: 200 });
    this.cars.push(this.bossCar);
    // Traffic.
    for (let i = 0; i < 14; i++) {
      const ax = AVENUES[Math.floor(rng.next() * AVENUES.length)];
      const sy = STREETS[Math.floor(rng.next() * STREETS.length)];
      const horizontal = rng.chance(0.5);
      const x = horizontal ? rng.range(120, WORLD_W - 120) : ax + rng.pick([-20, 20]);
      const y = horizontal ? sy + rng.pick([-20, 20]) : rng.range(120, 1640);
      const angle = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      const car = makeTrafficCar(i, x, y, angle, rng);
      this.traffic.push(car);
      this.cars.push(car);
    }
    // Pedestrians: more of them downtown and on the promenade.
    for (let i = 0; i < 30; i++) {
      const downtown = rng.chance(0.45);
      const prom = !downtown && rng.chance(0.4);
      let x; let y;
      if (downtown) {
        x = rng.range(1000, 1900);
        y = rng.range(700, 1500);
      } else if (prom) {
        x = rng.range(150, 2400);
        y = rng.range(1690, 1750);
      } else {
        x = rng.range(150, 2400);
        y = rng.range(150, 1600);
      }
      const spot = findOpenSpot(this.city, x, y);
      this.peds.push(makePedestrian(spot.x, spot.y, rng));
    }
    // Static pickups: ammo at the garage + central intersection, health nearby.
    this.pickups.push(
      { kind: 'ammo', x: 620, y: 780, active: true, respawn: 0, oneShot: false },
      { kind: 'ammo', x: 1280, y: 960, active: true, respawn: 0, oneShot: false },
      { kind: 'health', x: 1600, y: 640, active: true, respawn: 0, oneShot: false },
      { kind: 'health', x: 960, y: 1280, active: true, respawn: 0, oneShot: false },
    );
  }

  resetBossCar() {
    const s = this.city.spots.sportsCar;
    this.bossCar.x = s.x;
    this.bossCar.y = s.y;
    this.bossCar.angle = Math.PI;
    this.bossCar.speed = 0;
    this.bossCar.parked = true;
  }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'e', 'p', 'r', 'q', ' '].includes(k)) e.preventDefault();
      if (k === 'enter' && this.phase === 'title') { this.startNew(); return; }
      if ((k === 'p' || k === 'escape') && this.phase === 'playing') { this.togglePause(); return; }
      if (k === 'r' && (this.phase === 'busted' || this.phase === 'wasted' || this.paused)) { this.restartMission(); return; }
      if (k === 'q' && this.paused) { this.quitToTitle(); return; }
      if (k === 'e' && this.phase === 'playing' && !this.paused) { this.tryEnterExitCar(); return; }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.sound.resume(); }
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- flow ----------
  startNew() {
    this.sound.resume();
    this.resetRun();
    this.started = true;
    this.phase = 'playing';
    document.getElementById('overlay-title').classList.add('hidden');
    document.getElementById('overlay-end').classList.add('hidden');
  }

  resetRun() {
    this.money = 50;
    this.wanted = 0;
    this.storyComplete = false;
    this.paused = false;
    this.player.x = this.city.spots.spawn.x;
    this.player.y = this.city.spots.spawn.y;
    this.player.hp = 100;
    this.player.ammo = 48;
    this.player.inCar = false;
    this.player.car = null;
    this.player.angle = 0;
    this.enemies = [];
    this.cops = [];
    this.patrols = [];
    this.bullets = [];
    this.stashTaken = [false, false, false];
    this.stash = 0;
    this.taxi = { active: false, customer: null, hasPassenger: false, dest: null, fares: 0, cooldown: 0 };
    this.resetBossCar();
    this.missions.reset();
    this.clearPolice();
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) this.saveGame();
  }

  quitToTitle() {
    this.phase = 'title';
    this.paused = false;
    this.started = false;
    document.getElementById('overlay-title').classList.remove('hidden');
    this.refreshTitleButtons();
  }

  restartMission() {
    const idx = this.missions.index;
    this.player.hp = 100;
    this.player.ammo = 48;
    this.player.x = this.city.spots.spawn.x;
    this.player.y = this.city.spots.spawn.y;
    this.player.inCar = false;
    this.player.car = null;
    this.enemies = [];
    this.cops = [];
    this.patrols = [];
    this.bullets = [];
    this.wanted = 0;
    this.missions.stage = 0;
    this.missions.kills = 0;
    this.missions.setMarkerForStage();
    this.phase = 'playing';
    this.paused = false;
    document.getElementById('overlay-end').classList.add('hidden');
    document.getElementById('overlay-over').classList.add('hidden');
    if (idx === 5) this.resetBossCar();
  }

  showEnd() {
    const el = document.getElementById('overlay-end');
    el.classList.remove('hidden');
  }

  showOver(kind) {
    const el = document.getElementById('overlay-over');
    el.querySelector('.over-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    el.classList.remove('hidden');
  }

  refreshTitleButtons() {
    const cont = document.getElementById('btn-continue');
    cont.style.display = localStorage.getItem(SAVE_KEY) ? 'block' : 'none';
  }

  // ---------- missions / police ----------
  // Stealing a car or shooting during a mission must NOT spike wanted and
  // summon a foot cop mid-combat: wanted comes only from missions.
  raiseWantedToOne() {
    // Intentional no-op (proven fix from rebuild #19).
  }

  raiseWanted(n) {
    this.wanted = n;
    // Cancel any active taxi fare: a fare's +$150 leaked into M4's ladder.
    this.taxi.active = false;
    this.taxi.hasPassenger = false;
    this.taxi.customer = null;
    this.taxi.dest = null;
    this.sound.siren(true);
  }

  clearPolice() {
    this.cops = [];
    this.patrols = [];
    this.wanted = 0;
    this.sound.siren(false);
  }

  spawnPatrol(n) {
    for (let i = 0; i < n; i++) {
      const spot = this.pickRoadSpot(520, 720);
      this.patrols.push(makePatrolCar(spot.x, spot.y, 0));
    }
  }

  spawnFootCops(n) {
    for (let i = 0; i < n; i++) {
      // Spawn in a 280-380 px ring around the player, with a 3 s grace
      // before the cop may move or bust (proven fix from rebuild #20-2).
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(280, 380);
      const spot = findOpenSpot(this.city, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
      this.cops.push(makeFootCop(spot.x, spot.y));
    }
  }

  spawnEnemies(spots, kind) {
    for (const s of spots) {
      const spot = findOpenSpot(this.city, s.x, s.y);
      this.enemies.push(makeEnemy(spot.x, spot.y, kind));
    }
  }

  pickRoadSpot(minD, maxD) {
    for (let tries = 0; tries < 20; tries++) {
      const ax = AVENUES[Math.floor(this.rng.next() * AVENUES.length)];
      const sy = STREETS[Math.floor(this.rng.next() * STREETS.length)];
      const useX = this.rng.chance(0.5);
      const x = useX ? ax : this.rng.range(150, WORLD_W - 150);
      const y = useX ? this.rng.range(150, 1640) : sy;
      const d = dist(x, y, this.player.x, this.player.y);
      if (d >= minD && d <= maxD) return { x, y };
    }
    const near = nearestIntersection(this.player.x + 600, this.player.y);
    return near;
  }

  nearestParkedCar() {
    let best = null;
    let bd = Infinity;
    for (const c of this.cars) {
      if (!c.parked) continue;
      const d = dist(c.x, c.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  completeMission() {
    const reward = this.missions.reward();
    this.money += reward;
    this.player.hp = Math.min(100, this.player.hp + 30);
    this.clearPolice();
    this.missions.index += 1;
    this.missions.stage = 0;
    this.missions.kills = 0;
    if (this.missions.index >= MISSIONS.length) {
      // Story Complete must be set BEFORE the save (proven fix).
      this.storyComplete = true;
      this.phase = 'complete';
      this.saveGame();
      this.showEnd();
      this.sound.blip(1040, 0.3);
      return;
    }
    this.missions.setMarkerForStage();
    if (this.missions.index === 5) this.resetBossCar();
    this.saveGame();
    this.sound.blip(880, 0.15);
  }

  // ---------- cars ----------
  tryEnterExitCar() {
    const p = this.player;
    if (p.inCar) {
      const car = p.car;
      car.parked = true;
      car.speed = 0;
      p.inCar = false;
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      const spot = findOpenSpot(this.city, p.x, p.y);
      p.x = spot.x; p.y = spot.y;
      return;
    }
    // Prefer a parked car over a moving one at the same distance.
    let best = null;
    let bestScore = Infinity;
    for (const c of this.cars) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (d > 70) continue;
      const score = d + (c.parked ? 0 : 1000);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best) return;
    // The boss sports car stays locked until M6 starts.
    if (best.boss && this.missions.index < 5) return;
    p.inCar = true;
    p.car = best;
    best.parked = false;
    p.angle = best.angle;
    this.sound.blip(440, 0.08);
    this.missions.onEnterCar(best);
  }

  // ---------- save / load ----------
  saveGame() {
    try {
      const p = this.player;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        missionIndex: this.missions.index,
        money: this.money,
        stash: this.stash,
        fares: this.taxi.fares,
        px: p.x, py: p.y,
        inCar: p.inCar,
        carType: p.car ? p.car.type : null,
        carAngle: p.car ? p.car.angle : p.angle,
        storyComplete: this.storyComplete,
        hp: p.hp, ammo: p.ammo,
      }));
    } catch (e) {}
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.money = s.money;
      this.stash = s.stash || 0;
      this.stashTaken = this.city.stashes.map((_, i) => i < this.stash);
      this.taxi.fares = s.fares || 0;
      this.player.hp = s.hp ?? 100;
      this.player.ammo = s.ammo ?? 48;
      this.missions.index = Math.min(s.missionIndex, MISSIONS.length);
      this.missions.stage = 0;
      this.missions.kills = 0;
      this.missions.setMarkerForStage();
      const spot = findOpenSpot(this.city, s.px, s.py);
      this.player.x = spot.x;
      this.player.y = spot.y;
      this.enemies = [];
      this.cops = [];
      this.patrols = [];
      this.wanted = 0;
      this.storyComplete = !!s.storyComplete;
      if (s.inCar && s.carType) {
        const car = makeCar(s.carType, spot.x, spot.y, s.carAngle || 0, { parked: false });
        this.cars.push(car);
        this.player.car = car;
        this.player.inCar = true;
      } else {
        this.player.inCar = false;
        this.player.car = null;
      }
      this.started = true;
      this.phase = this.storyComplete ? 'complete' : 'playing';
      document.getElementById('overlay-title').classList.add('hidden');
      // Show the end card AFTER everything else when the story is done.
      if (this.storyComplete) this.showEnd();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- taxi ----------
  updateTaxi(dt) {
    const t = this.taxi;
    const p = this.player;
    if (t.cooldown > 0) t.cooldown -= dt;
    if (this.storyComplete || this.phase !== 'playing') return;
    if (t.active || t.hasPassenger) {
      if (t.hasPassenger && t.dest) {
        if (dist(p.x, p.y, t.dest.x, t.dest.y) < 80) {
          this.money += 150;
          t.fares += 1;
          t.hasPassenger = false;
          t.active = false;
          t.dest = null;
          t.cooldown = 5;
          this.sound.blip(990, 0.15);
          this.saveGame();
        }
      }
      return;
    }
    // A new fare only spawns between missions, on foot, with no heat.
    if (this.missions.index < 3 || this.wanted > 0 || p.inCar || t.cooldown > 0) return;
    // Customer waits at a curb near the player.
    const near = nearestIntersection(p.x, p.y);
    const cx = near.x + (this.rng.chance(0.5) ? 62 : -62);
    const cy = near.y + this.rng.range(-40, 40);
    const cspot = findOpenSpot(this.city, cx, cy);
    let dest = nearestIntersection(p.x + this.rng.range(-900, 900), p.y + this.rng.range(-700, 700));
    if (dist(dest.x, dest.y, p.x, p.y) < 600) dest = nearestIntersection(p.x + 900, p.y - 600);
    const cust = makePedestrian(cspot.x, cspot.y, this.rng);
    cust.state = 'wait';
    cust.taxi = true;
    this.peds.push(cust);
    t.customer = cust;
    t.dest = dest;
    t.active = true;
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    const p = this.player;
    if (this.phase !== 'playing' || this.paused) return;

    // Shooting (on foot only).
    this.fireTimer -= dt;
    if (!p.inCar && this.mouse.down && this.fireTimer <= 0 && p.ammo > 0) {
      this.fireTimer = 0.15;
      p.ammo -= 1;
      const wx = this.cam.x + this.mouse.x;
      const wy = this.cam.y + this.mouse.y;
      const a = angleTo(p.x, p.y, wx, wy);
      this.bullets.push(makeBullet(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, 900, 'player', 1));
      this.sound.gunshot();
      this.shake = Math.max(this.shake, 2);
      this.danger = { x: p.x, y: p.y };
    }

    // Movement.
    if (p.inCar && p.car) {
      const input = {
        up: this.keys.has('w'),
        down: this.keys.has('s'),
        left: this.keys.has('a'),
        right: this.keys.has('d'),
      };
      const before = { x: p.car.x, y: p.car.y };
      stepCarPhysics(p.car, input, dt, this.city);
      p.x = p.car.x;
      p.y = p.car.y;
      p.angle = p.car.angle;
      const turning = (input.left || input.right) && Math.abs(p.car.speed) > 200;
      if (turning && this.rng.chance(dt * 20)) {
        this.skids.push({ x: p.car.x, y: p.car.y, angle: p.car.angle, life: 1.2 });
        if (this.skids.length > 220) this.skids.shift();
      }
      if (Math.hypot(p.car.x - before.x, p.car.y - before.y) < 0.5 && (input.up || input.down)) {
        this.shake = Math.max(this.shake, 1.5);
      }
      this.sound.engine(true, p.car.speed);
    } else {
      let mx = 0;
      let my = 0;
      if (this.keys.has('w')) my -= 1;
      if (this.keys.has('s')) my += 1;
      if (this.keys.has('a')) mx -= 1;
      if (this.keys.has('d')) mx += 1;
      if (mx || my) {
        const len = Math.hypot(mx, my);
        const q = moveCircle(this.city, p.x, p.y, (mx / len) * p.walkSpeed * dt, (my / len) * p.walkSpeed * dt, 13);
        p.x = q.x; p.y = q.y;
        p.angle = Math.atan2(my, mx);
      }
      this.sound.engine(false);
    }

    // Taxi pickup: drive up to the waiting customer.
    const t = this.taxi;
    if (t.active && t.customer && !t.hasPassenger && p.inCar) {
      if (dist(p.x, p.y, t.customer.x, t.customer.y) < 70) {
        t.hasPassenger = true;
        this.peds = this.peds.filter((ped) => ped !== t.customer);
        t.customer = null;
        this.sound.blip(760, 0.12);
      }
    }

    // Pickups.
    for (const pk of this.pickups) {
      if (!pk.active) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) pk.active = true;
        continue;
      }
      if (dist(p.x, p.y, pk.x, pk.y) < 36) {
        if (pk.kind === 'ammo') p.ammo = Math.min(99, p.ammo + 24);
        else p.hp = Math.min(100, p.hp + 30);
        this.sound.blip(880, 0.1);
        this.burst(pk.x, pk.y, '#ffd93d');
        if (pk.oneShot) {
          this.pickups.splice(this.pickups.indexOf(pk), 1);
        } else {
          pk.active = false;
          pk.respawn = 15;
        }
      }
    }

    // Hidden stashes (on foot only, so a fare run never collects one).
    this.city.stashes.forEach((s, i) => {
      if (!this.stashTaken[i] && !p.inCar && dist(p.x, p.y, s.x, s.y) < 32) {
        this.stashTaken[i] = true;
        this.stash += 1;
        this.money += 100;
        this.sound.blip(1200, 0.12);
        this.burst(s.x, s.y, '#7cff00');
      }
    });

    // Traffic.
    const allCars = this.cars;
    for (const car of this.traffic) {
      stepTraffic(car, dt, this.city, allCars, this.rng);
      // Recycle traffic that drifts far from the player back near the action.
      if (dist(car.x, car.y, p.x, p.y) > 1500) {
        const spot = this.pickRoadSpot(400, 800);
        car.x = spot.x; car.y = spot.y;
        car.speed = 0;
      }
    }
    // Keep traffic away from the boss sports car while M6 waits.
    if (this.missions.index === 5 && this.missions.stage === 0) {
      for (const car of this.traffic) {
        if (dist(car.x, car.y, this.bossCar.x, this.bossCar.y) < 250) {
          const spot = this.pickRoadSpot(700, 1100);
          car.x = spot.x; car.y = spot.y;
          car.speed = 0;
        }
      }
    }

    // Pedestrians.
    for (const ped of this.peds) {
      if (ped.taxi) continue;
      stepPedestrian(ped, dt, this.city, this.danger, this.rng);
    }
    if (this.danger) this.danger = null;

    // Enemies.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const act = stepEnemy(e, dt, this.city, p.x, p.y);
      if (act === 'shoot') {
        const a = angleTo(e.x, e.y, p.x, p.y) + (this.rng.next() - 0.5) * 2 * e.spread;
        this.bullets.push(makeBullet(e.x, e.y, a, 700, 'enemy', 3));
        this.sound.gunshot();
      }
    }

    // Foot cops.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const res = stepFootCop(this.cops[i], dt, this.city, p.x, p.y, p.inCar);
      if (res === 'busted') {
        this.phase = 'busted';
        this.showOver('busted');
        return;
      }
    }

    // Patrol cars.
    for (const car of this.patrols) stepPatrol(car, dt, this.city, p.x, p.y, p.inCar);

    // Car-vs-car separation (building-aware, no damping).
    separateCars(this.cars.concat(this.patrols), this.city);

    // Bullets.
    const events = stepBullets(this.bullets, dt, this.city, p, this.enemies, this.cops);
    for (const ev of events) {
      if (ev.type === 'hit-enemy' && ev.enemy.hp <= 0) {
        const idx = this.enemies.indexOf(ev.enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
        this.missions.onEnemyKilled();
        p.ammo = Math.min(99, p.ammo + 12);
        this.pickups.push({ kind: 'ammo', x: ev.x, y: ev.y, active: true, respawn: 0, oneShot: true });
        this.burst(ev.x, ev.y, '#ff6b6b');
        this.sound.blip(520, 0.1);
      } else if (ev.type === 'hit-cop' && ev.cop.hp <= 0) {
        const idx = this.cops.indexOf(ev.cop);
        if (idx >= 0) this.cops.splice(idx, 1);
        this.burst(ev.x, ev.y, '#8fd3ff');
      } else if (ev.type === 'hit-player') {
        this.shake = Math.max(this.shake, 3);
        if (p.hp <= 0) {
          this.phase = 'wasted';
          this.showOver('wasted');
          return;
        }
      } else if (ev.type === 'impact') {
        this.burst(ev.x, ev.y, '#ffd93d');
      }
    }

    // Particles + skid fade.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }

    this.missions.update(dt);
    this.updateTaxi(dt);

    // Camera follows the player.
    const tx = clamp(p.x - 640, 0, WORLD_W - 1280);
    const ty = clamp(p.y - 360, 0, WORLD_H - 720);
    this.cam.x += (tx - this.cam.x) * Math.min(1, 6 * dt);
    this.cam.y += (ty - this.cam.y) * Math.min(1, 6 * dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 14);
    }
  }

  burst(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(40, 160);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color, size: 3 });
    }
  }

  // ---------- screenshot staging ----------
  applyShotStaging() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return;
    this.started = true;
    this.phase = 'playing';
    document.getElementById('overlay-title').classList.add('hidden');
    const p = this.player;
    if (shot === 'walk') {
      p.x = 1280; p.y = 960;
      p.inCar = false;
      this.missions.index = 0;
      this.missions.stage = 1;
      this.missions.setMarkerForStage();
    } else if (shot === 'drive') {
      const car = makeCar('sedan', 1280, 1200, Math.PI / 2, { parked: false });
      this.cars.push(car);
      p.car = car;
      p.inCar = true;
      p.x = car.x; p.y = car.y;
      car.speed = 200;
      this.missions.index = 0;
      this.missions.stage = 1;
      this.missions.setMarkerForStage();
    } else if (shot === 'chase') {
      const car = makeCar('sedan', 1280, 960, Math.PI / 2, { parked: false });
      this.cars.push(car);
      p.car = car;
      p.inCar = true;
      p.x = car.x; p.y = car.y;
      this.wanted = 3;
      this.sound.siren(true);
      this.patrols.push(makePatrolCar(1230, 900, Math.PI / 2));
      this.patrols.push(makePatrolCar(1360, 1020, -Math.PI / 2));
      this.cops.push(makeFootCop(1240, 1000));
      this.cops[this.cops.length - 1].grace = 0;
      this.missions.index = 3;
      this.missions.stage = 1;
      this.missions.setMarkerForStage();
    } else if (shot === 'mission') {
      // M5 in progress: exactly 3 guards at the bank (never 6).
      p.x = 1400; p.y = 1240;
      p.inCar = false;
      p.ammo = 48;
      this.missions.index = 4;
      this.missions.stage = 1;
      this.missions.kills = 0;
      this.missions.setMarkerForStage();
      this.spawnEnemies(this.city.bankGuardSpawns, 'guard');
    }
    this.cam.x = clamp(p.x - 640, 0, WORLD_W - 1280);
    this.cam.y = clamp(p.y - 360, 0, WORLD_H - 720);
  }

  // ---------- driver snapshot ----------
  state() {
    const p = this.player;
    const carsNear = [];
    for (const c of this.cars) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 500) carsNear.push({ x: c.x, y: c.y, d, parked: c.parked });
    }
    return {
      started: this.started,
      state: this.phase,
      storyComplete: this.storyComplete,
      paused: this.paused,
      px: Math.round(p.x), py: Math.round(p.y),
      carAngle: p.inCar && p.car ? p.car.angle : p.angle,
      carSpeed: p.inCar && p.car ? Math.round(p.car.speed) : 0,
      inCar: p.inCar,
      money: this.money,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      kills: this.missions.kills,
      stash: this.stash,
      missionIndex: this.missions.index,
      stage: this.missions.stage,
      wanted: this.wanted,
      patrol: this.patrols.length,
      cops: this.cops.length,
      marker: { x: Math.round(this.missions.marker.x), y: Math.round(this.missions.marker.y) },
      enemies: this.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })),
      footCops: this.cops.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      pickups: this.pickups.filter((pk) => pk.active).map((pk) => ({ kind: pk.kind, x: pk.x, y: pk.y })),
      carsNear,
      cam: { x: Math.round(this.cam.x), y: Math.round(this.cam.y) },
      taxi: {
        active: this.taxi.active,
        customer: this.taxi.customer ? { x: Math.round(this.taxi.customer.x), y: Math.round(this.taxi.customer.y) } : null,
        hasPassenger: this.taxi.hasPassenger,
        dest: this.taxi.dest ? { x: Math.round(this.taxi.dest.x), y: Math.round(this.taxi.dest.y) } : null,
        fares: this.taxi.fares,
      },
    };
  }

  // ---------- main loop ----------
  frame(t) {
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000 || 0.016);
    this.lastT = t;
    if (this.phase === 'playing' || this.phase === 'complete' || this.phase === 'busted' || this.phase === 'wasted') {
      this.update(dt);
    }
    drawGame(this.ctx, this, dt);
    requestAnimationFrame((nt) => this.frame(nt));
  }

  start() {
    this.refreshTitleButtons();
    requestAnimationFrame((t) => this.frame(t));
  }
}
