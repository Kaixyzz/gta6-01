// SOLARA BAY — the game itself: state, input, the loop, wanted, save/load,
// the HUD, and the screenshot staging. Actors and missions live in their own
// files; this one orchestrates them.
import { buildWorld, POINTS, WORLD_W, WORLD_H, WORLD_SEED, pointBlocked, slideMove, nearestIntersection } from './world.js';
import { makeRng, clamp, dist } from './rng.js';
import { createAudio } from './audio.js';
import { createPlayer, createCar, makeTraffic, makePeds, makePickups, driveCar, updateTraffic, updatePeds, updatePolice, updateGang, updatePickups, spawnGang } from './actors.js';
import { updateMissions, missionTitle, missionObjective, missionReward, missionMarker } from './missions.js';
import { drawGame, drawMinimap } from './render.js';

const SAVE_KEY = 'solara-bay-save-v1';
const VIEW_W = 1280;
const VIEW_H = 720;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.audio = createAudio();
    this.keys = new Set();
    this.mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
    this.shootCd = 0;
    this.lastRaiseAt = -99;
    this.initState();
    this.bindInput();
    this.bindButtons();
    this.last = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  initState() {
    const world = buildWorld(WORLD_SEED);
    const rng = makeRng(WORLD_SEED + 7);
    this.S = {
      world, rng, time: 0, state: 'menu',
      audio: this.audio,
      player: createPlayer(POINTS.start.x, POINTS.start.y),
      traffic: [], peds: [], cops: [], patrol: [], enemies: [], pickups: [],
      missionIndex: 0, stage: 0, kills: 0, money: 50,
      wanted: 0, wantedTimer: 0, lastCrimeAt: -99, wantedLock: false,
      storyComplete: false, cam: { x: 0, y: 0 }, shake: 0,
      tracers: [], marker: null, lastShotAt: -99,
      api: {
        showCard: (t, b) => this.showCard(t, b),
        saveGame: () => this.saveGame(),
      },
    };
    const S = this.S;
    S.traffic = makeTraffic(S);
    S.peds = makePeds(S);
    S.pickups = makePickups();
    S.addWanted = (n) => this.addWanted(n);
    S.damagePlayer = (n) => this.damagePlayer(n);
    S.busted = () => this.busted();
    this.updateHud();
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyE') this.tryEnterExitCar();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.down = true;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    on('btn-start', () => this.startFresh());
    on('btn-continue', () => this.continueSave());
    on('btn-resume', () => this.togglePause());
    on('btn-save', () => { this.saveGame(); this.showCard('Saved', 'Progress saved.'); });
    on('btn-again', () => { this.clearSave(); this.initState(); this.startPlaying(); });
    on('btn-busted-ok', () => this.respawnAfterTrouble());
    on('btn-wasted-ok', () => this.respawnAfterTrouble());
  }

  showOverlay(id) {
    for (const o of ['overlay-start', 'overlay-pause', 'overlay-end', 'overlay-busted', 'overlay-wasted']) {
      const el = document.getElementById(o);
      if (el) el.classList.toggle('hidden', o !== id);
    }
    if (!id) {
      for (const o of ['overlay-start', 'overlay-pause', 'overlay-end', 'overlay-busted', 'overlay-wasted']) {
        const el = document.getElementById(o);
        if (el) el.classList.add('hidden');
      }
    }
  }

  showCard(title, body) {
    const card = document.getElementById('overlay-card');
    document.getElementById('card-title').textContent = title;
    document.getElementById('card-body').textContent = body;
    card.classList.remove('hidden');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => card.classList.add('hidden'), 2800);
  }

  startFresh() {
    this.audio.ensure();
    this.startPlaying();
  }

  startPlaying() {
    this.S.state = 'playing';
    this.showOverlay(null);
    document.getElementById('overlay-card').classList.add('hidden');
  }

  continueSave() {
    this.audio.ensure();
    if (!this.loadGame()) {
      this.startPlaying();
      return;
    }
    this.showOverlay(null);
    if (this.S.storyComplete) {
      this.S.state = 'complete';
      document.getElementById('end-title').textContent = 'Story Complete';
      document.getElementById('end-body').textContent = 'You ran Solara Bay. All four missions done — $3,150 banked.';
      this.showOverlay('overlay-end');
    } else {
      this.S.state = 'playing';
    }
  }

  togglePause() {
    if (this.S.state === 'playing') {
      this.S.state = 'paused';
      this.saveGame();
      this.showOverlay('overlay-pause');
    } else if (this.S.state === 'paused') {
      this.S.state = 'playing';
      this.showOverlay(null);
    }
  }

  addWanted(n) {
    // No heat during the turf war: it is the gang's fight, not the police's.
    if (this.S.missionIndex === 2) return;
    if (this.S.time - this.lastRaiseAt < 3) return;
    this.lastRaiseAt = this.S.time;
    this.S.wanted = Math.min(3, this.S.wanted + n);
    this.S.lastCrimeAt = this.S.time;
    this.S.wantedTimer = 0;
  }

  damagePlayer(n) {
    const S = this.S;
    if (S.state !== 'playing') return;
    S.player.hp -= n;
    if (S.player.hp <= 0) this.wasted();
  }

  busted() {
    const S = this.S;
    if (S.state !== 'playing') return;
    S.state = 'busted';
    S.money = Math.max(0, S.money - 100);
    S.wanted = 0;
    S.wantedLock = false;
    if (S.missionIndex === 3 && S.stage === 1) S.stage = 0;
    this.audio.crash();
    this.showOverlay('overlay-busted');
  }

  wasted() {
    const S = this.S;
    if (S.state !== 'playing') return;
    S.state = 'wasted';
    S.money = Math.max(0, S.money - 100);
    S.wanted = 0;
    S.wantedLock = false;
    if (S.missionIndex === 3 && S.stage === 1) S.stage = 0;
    this.audio.crash();
    this.showOverlay('overlay-wasted');
  }

  respawnAfterTrouble() {
    const S = this.S;
    if (S.player.inCar) {
      S.player.inCar.driver = null;
      S.player.inCar.speed = 0;
      S.player.inCar = null;
    }
    S.player.x = POINTS.garage.x;
    S.player.y = POINTS.garage.y - 60;
    S.player.hp = 100;
    S.cops = [];
    S.patrol = [];
    S.state = 'playing';
    this.showOverlay(null);
    this.saveGame();
  }

  saveGame() {
    const S = this.S;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, missionIndex: S.missionIndex, money: S.money,
        hp: Math.round(S.player.hp), ammo: S.player.ammo,
        px: Math.round(S.player.x), py: Math.round(S.player.y),
        inCar: !!S.player.inCar, storyComplete: S.storyComplete,
      }));
    } catch (e) {}
  }

  loadGame() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) return false;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || d.v !== 1) return false;
    const S = this.S;
    S.missionIndex = clamp(d.missionIndex | 0, 0, 3);
    S.stage = 0;
    S.kills = 0;
    S.money = d.money | 0;
    S.player.hp = clamp(d.hp | 0, 1, 100);
    S.player.ammo = d.ammo | 0;
    S.player.x = clamp(d.px | 0, 0, WORLD_W);
    S.player.y = clamp(d.py | 0, 0, WORLD_H);
    S.storyComplete = !!d.storyComplete;
    S.wanted = 0;
    S.wantedLock = false;
    S.cops = [];
    S.patrol = [];
    S.enemies = [];
    if (d.inCar) {
      const car = createCar(S.player.x, S.player.y, 0, '#e74c3c', false);
      car.driver = 'player';
      S.traffic.push(car);
      S.player.inCar = car;
    }
    return true;
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  tryEnterExitCar() {
    const S = this.S;
    if (S.state !== 'playing') return;
    const p = S.player;
    if (p.inCar) {
      const car = p.inCar;
      car.driver = null;
      car.speed = 0;
      const offs = [[0, 34], [0, -34], [34, 0], [-34, 0]];
      for (const o of offs) {
        if (!pointBlocked(S.world, car.x + o[0], car.y + o[1], 11)) {
          p.x = car.x + o[0];
          p.y = car.y + o[1];
          break;
        }
      }
      p.inCar = null;
      this.audio.blip();
      return;
    }
    let best = null;
    let bestD = 74;
    for (const c of S.traffic) {
      if (c.driver === 'player') continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      best.driver = 'player';
      best.parked = false;
      p.inCar = best;
      p.x = best.x;
      p.y = best.y;
      this.addWanted(1);
      this.audio.blip();
    }
  }

  shoot() {
    const S = this.S;
    const p = S.player;
    if (p.ammo <= 0) return;
    p.ammo -= 1;
    this.shootCd = 0.35;
    S.lastShotAt = S.time;
    S.audio.shot();
    for (const ped of S.peds) {
      if (dist(ped.x, ped.y, p.x, p.y) < 320) {
        ped.flee = 2.5;
        const a = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.tx = clamp(ped.x + Math.cos(a) * 320, 120, 2440);
        ped.ty = clamp(ped.y + Math.sin(a) * 320, 120, 1800);
      }
    }
    if (S.missionIndex !== 2) this.addWanted(1);
    const range = 520;
    const step = 16;
    let hitEnemy = null;
    for (let r = step; r <= range; r += step) {
      const x = p.x + Math.cos(p.aimAngle) * r;
      const y = p.y + Math.sin(p.aimAngle) * r;
      if (pointBlocked(S.world, x, y, 2)) break;
      for (const e of S.enemies) {
        if (!e.alive) continue;
        if (dist(e.x, e.y, x, y) < 16) {
          hitEnemy = e;
          break;
        }
      }
      if (hitEnemy) break;
    }
    if (hitEnemy) {
      hitEnemy.hp -= 1;
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false;
        S.kills += 1;
        if (S.rng.chance(0.6)) {
          S.pickups.push({ x: hitEnemy.x, y: hitEnemy.y, kind: 'ammo', active: true, respawn: 0, temp: true });
        }
      }
    }
  }

  updatePlayer(dt) {
    const S = this.S;
    const p = S.player;
    const k = this.keys;
    if (p.inCar) {
      const car = p.inCar;
      let throttle = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) throttle = 1;
      if (k.has('KeyS') || k.has('ArrowDown')) throttle = -1;
      let steer = 0;
      if (k.has('KeyA') || k.has('ArrowLeft')) steer = -1;
      if (k.has('KeyD') || k.has('ArrowRight')) steer = 1;
      driveCar(S.world, car, dt, throttle, steer, 430);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      // Bump into other cars: push apart, lose speed, make noise.
      for (const o of S.traffic) {
        if (o === car || o.driver === 'player') continue;
        const d = dist(o.x, o.y, car.x, car.y);
        if (d < 34 && d > 0.1) {
          const push = (34 - d) / 2;
          const nx = (car.x - o.x) / d;
          const ny = (car.y - o.y) / d;
          car.x += nx * push;
          car.y += ny * push;
          o.x -= nx * push;
          o.y -= ny * push;
          if (Math.abs(car.speed) > 200) {
            car.speed *= 0.6;
            S.audio.crash();
            S.addWanted(1);
          } else {
            car.speed *= 0.92;
          }
        }
      }
      return;
    }
    let mx = 0;
    let my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? p.runSpeed : p.walkSpeed;
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      const len = Math.hypot(mx, my);
      const res = slideMove(S.world, p.x, p.y, (mx / len) * speed * dt, (my / len) * speed * dt, 11);
      p.x = res.x;
      p.y = res.y;
    }
    const sx = p.x - S.cam.x;
    const sy = p.y - S.cam.y;
    p.aimAngle = Math.atan2(this.mouse.y - sy, this.mouse.x - sx);
    if (this.mouse.down) {
      this.shootCd -= dt;
      if (this.shootCd <= 0) this.shoot();
    } else {
      this.shootCd = 0;
    }
  }

  updatePickups(dt) {
    const S = this.S;
    const p = S.player;
    updatePickups(S, dt);
    for (let i = S.pickups.length - 1; i >= 0; i--) {
      const pk = S.pickups[i];
      if (!pk.active) continue;
      if (dist(pk.x, pk.y, p.x, p.y) < 30) {
        if (pk.kind === 'ammo') {
          p.ammo += 10;
          S.audio.pickup();
        } else {
          p.hp = Math.min(100, p.hp + 40);
          S.audio.pickup();
        }
        if (pk.temp) S.pickups.splice(i, 1);
        else {
          pk.active = false;
          pk.respawn = 25;
        }
      }
    }
  }

  updateWanted(dt) {
    const S = this.S;
    if (S.wanted <= 0 || S.wantedLock) return;
    if (S.time - S.lastCrimeAt <= 12) return;
    let nearest = Infinity;
    for (const c of S.cops) nearest = Math.min(nearest, dist(c.x, c.y, S.player.x, S.player.y));
    for (const c of S.patrol) nearest = Math.min(nearest, dist(c.x, c.y, S.player.x, S.player.y));
    if (nearest > 450) {
      S.wantedTimer += dt;
      if (S.wantedTimer >= 18) {
        S.wanted -= 1;
        S.wantedTimer = 0;
        S.lastCrimeAt = S.time;
      }
    } else {
      S.wantedTimer = 0;
    }
  }

  update(dt) {
    const S = this.S;
    S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 1.4);
    for (const t of S.tracers) t.t -= dt;
    S.tracers = S.tracers.filter((t) => t.t > 0);
    this.updatePlayer(dt);
    updateTraffic(S, dt);
    updatePeds(S, dt);
    updatePolice(S, dt);
    updateGang(S, dt);
    this.updatePickups(dt);
    updateMissions(S, dt);
    this.updateWanted(dt);
    S.marker = missionMarker(S);
    const px = S.player.inCar ? S.player.inCar.x : S.player.x;
    const py = S.player.inCar ? S.player.inCar.y : S.player.y;
    S.cam.x = clamp(px - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    S.cam.y = clamp(py - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    this.audio.setEngine(!!S.player.inCar, S.player.inCar ? Math.abs(S.player.inCar.speed) / 430 : 0);
    this.audio.setSiren(S.wanted >= 2);
  }

  updateHud() {
    const S = this.S;
    document.getElementById('hud-money').textContent = '$' + S.money;
    document.getElementById('hud-hp-fill').style.width = Math.max(0, S.player.hp) + '%';
    document.getElementById('hud-ammo').textContent = 'Ammo ' + S.player.ammo;
    const stars = document.getElementById('hud-stars');
    stars.textContent = '★'.repeat(S.wanted) + '☆'.repeat(3 - S.wanted);
    stars.style.color = S.wanted > 0 ? '#ffd54a' : 'rgba(255,255,255,0.55)';
    document.getElementById('mission-title').textContent = missionTitle(S);
    document.getElementById('mission-obj').textContent = missionObjective(S);
    document.getElementById('mission-reward').textContent = S.storyComplete ? '' : 'Reward $' + missionReward(S);
    const cont = document.getElementById('btn-continue');
    if (cont) cont.classList.toggle('hidden', !this.hasSave());
  }

  render() {
    drawGame(this.ctx, this.S);
    drawMinimap(this.mctx, this.S);
  }

  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    if (this.S.state === 'playing') {
      // A single bad frame must never freeze the game: report it once and keep going.
      try {
        this.update(dt);
      } catch (err) {
        if (!this.loopErrorLogged) {
          this.loopErrorLogged = true;
          console.error(err);
        }
      }
    }
    this.render();
    this.updateHud();
    requestAnimationFrame((nt) => this.loop(nt));
  }

  // Screenshot staging: put the game into a fixed, readable scene.
  applyShot(mode) {
    const S = this.S;
    this.audio.ensure();
    this.showOverlay(null);
    document.getElementById('overlay-card').classList.add('hidden');
    S.state = 'playing';
    if (mode === 'walk') {
      S.player.x = 640;
      S.player.y = 880;
      S.missionIndex = 0;
      S.stage = 0;
    } else if (mode === 'drive') {
      const car = createCar(960, 640, 0, '#e74c3c', false);
      car.driver = 'player';
      S.traffic.push(car);
      S.player.inCar = car;
      S.player.x = car.x;
      S.player.y = car.y;
      S.missionIndex = 0;
      S.stage = 1;
    } else if (mode === 'chase') {
      const car = createCar(1280, 960, 0, '#e74c3c', false);
      car.driver = 'player';
      S.traffic.push(car);
      S.player.inCar = car;
      S.player.x = car.x;
      S.player.y = car.y;
      S.missionIndex = 3;
      S.stage = 1;
      S.wanted = 3;
      S.wantedLock = true;
      const p1 = createCar(1150, 960, 0, '#222831', false);
      p1.driver = 'police';
      const p2 = createCar(1120, 1010, 0.2, '#222831', false);
      p2.driver = 'police';
      S.patrol.push(p1, p2);
      S.cops.push({ x: 1200, y: 900, bust: 0, returning: false });
      S.cops.push({ x: 1230, y: 1030, bust: 0, returning: false });
    } else if (mode === 'mission') {
      S.player.x = 1280;
      S.player.y = 880;
      S.player.ammo = 24;
      S.missionIndex = 2;
      S.stage = 1;
      spawnGang(S);
    }
    S.marker = missionMarker(S);
    const px = S.player.inCar ? S.player.inCar.x : S.player.x;
    const py = S.player.inCar ? S.player.inCar.y : S.player.y;
    S.cam.x = clamp(px - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    S.cam.y = clamp(py - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    this.updateHud();
  }

  // A plain snapshot for the automated playthrough driver.
  state() {
    const S = this.S;
    const p = S.player;
    return {
      state: S.state,
      started: S.state !== 'menu',
      paused: S.state === 'paused',
      storyComplete: S.storyComplete,
      missionIndex: S.missionIndex,
      stage: S.stage,
      kills: S.kills,
      money: S.money,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      wanted: S.wanted,
      px: Math.round(p.x),
      py: Math.round(p.y),
      inCar: !!p.inCar,
      carAngle: p.inCar ? p.inCar.angle : p.angle,
      carSpeed: p.inCar ? Math.round(p.inCar.speed) : 0,
      marker: S.marker ? { x: Math.round(S.marker.x), y: Math.round(S.marker.y) } : null,
      enemies: S.enemies.filter((e) => e.alive).map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })),
      pickups: S.pickups.filter((pk) => pk.active).map((pk) => ({ x: pk.x, y: pk.y, kind: pk.kind })),
      cops: S.cops.length,
      patrol: S.patrol.length,
      cam: { x: Math.round(S.cam.x), y: Math.round(S.cam.y) },
      carsNear: S.traffic.filter((c) => c.driver !== 'player')
        .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), d: Math.round(dist(c.x, c.y, p.x, p.y)), parked: c.parked }))
        .sort((a, b) => a.d - b.d).slice(0, 5),
      title: missionTitle(S),
      objective: missionObjective(S),
    };
  }
}
