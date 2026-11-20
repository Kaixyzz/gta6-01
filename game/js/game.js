// SOLARA BAY — game orchestration: loop, input, missions, police, combat,
// save/load, screenshot staging, and the debug state the playthrough
// driver reads. The world layout comes from city.js, the drawing from
// render.js, the mission text from missions.js.
import { buildCity, AVENUES, STREETS, WORLD_W, WORLD_H } from './city.js';
import {
  makePlayer, makeCar, makePed, makeEnemy, makeFootCop, makePatrol,
  stepCar, stepWalk, collideBuildings, clampToWorld, normAngle, dist,
} from './entities.js';
import { MISSIONS, missionReward } from './missions.js';
import { render } from './render.js';
import { createAudio } from './audio.js';

const SAVE_KEY = 'solara-bay-save-v13';
const VIEW_W = 1280;
const VIEW_H = 720;

function nearestIntersection(x, y) {
  let best = null;
  let bd = Infinity;
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const d = Math.hypot(ax - x, sy - y);
      if (d < bd) {
        bd = d;
        best = { x: ax, y: sy };
      }
    }
  }
  return best;
}

export function createGame() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const audio = createAudio();
  const city = buildCity();

  const g = {
    city,
    time: 0,
    started: false,
    paused: false,
    state: 'title',
    storyComplete: false,
    money: 50,
    missionIndex: 0,
    stage: 0,
    wanted: 0,
    kills: 0,
    stashGot: 0,
    player: makePlayer(city.locations.playerStart.x, city.locations.playerStart.y),
    cars: [],
    peds: [],
    enemies: [],
    cops: [],
    pickups: [],
    particles: [],
    skids: [],
    cam: { x: 640, y: 480 },
    shake: 0,
    muzzleT: 0,
    fireT: 0,
    graceUntil: 0,
    lastCrimeT: -100,
    decayT: 0,
    saveT: 0,
    enemiesSpawned: false,
    mouse: { x: 0, y: 0, down: false },
    keys: {},
    respawnT: 0,
    marker: { x: city.locations.dropoff.x, y: city.locations.dropoff.y },
  };

  // ---------- world population ----------
  function resetWorld() {
    g.cars = [];
    g.peds = [];
    g.enemies = [];
    g.cops = [];
    g.pickups = [];
    g.particles = [];
    g.skids = [];
    g.enemiesSpawned = false;
    for (const pc of city.parkedCars) {
      const car = makeCar(pc.x, pc.y, pc.kind, pc.color, 0);
      car.parked = true;
      g.cars.push(car);
    }
    for (const ts of city.trafficSpawns) {
      const car = makeCar(
        ts.axis === 'v' ? ts.road : ts.pos,
        ts.axis === 'v' ? ts.pos : ts.road,
        'car', ts.color, ts.axis === 'v' ? (ts.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ts.dir > 0 ? 0 : Math.PI),
      );
      car.parked = false;
      car.traffic = true;
      car.trafficAxis = ts.axis;
      car.trafficDir = ts.dir;
      car.trafficSpeed = ts.speed;
      g.cars.push(car);
    }
    for (const ps of city.pedSpawns) g.peds.push(makePed(ps.x, ps.y, ps.axis, ps.dir, ps.color));
    for (const pk of city.pickupSpawns) g.pickups.push({ x: pk.x, y: pk.y, kind: pk.kind, home: true, respawnT: 0 });
    for (const s of city.stashes) s.got = false;
  }

  function currentMarker() {
    const L = city.locations;
    switch (g.missionIndex) {
      case 0: return { x: L.dropoff.x, y: L.dropoff.y };
      case 1: return g.stage === 0 ? { x: L.pickup.x, y: L.pickup.y } : { x: L.delivery.x, y: L.delivery.y };
      case 2: return { x: L.turf.x, y: L.turf.y };
      case 3: return g.stage === 0 ? { x: L.goods.x, y: L.goods.y } : { x: L.safehouse.x, y: L.safehouse.y };
      case 4:
        if (g.stage === 0) return { x: L.bank.x, y: L.bank.y };
        if (g.stage === 1) return { x: L.cash.x, y: L.cash.y };
        return { x: L.garage.x, y: L.garage.y };
      case 5: return g.stage === 0 ? { x: L.sportsCar.x, y: L.sportsCar.y } : { x: L.safehouse.x, y: L.safehouse.y };
      default: return { x: L.safehouse.x, y: L.safehouse.y };
    }
  }

  function completeMission() {
    const reward = missionReward(g.missionIndex);
    g.money += reward;
    audio.pickup();
    addBlip(g.player.x, g.player.y);
    g.missionIndex += 1;
    g.stage = 0;
    g.kills = 0;
    g.enemies = [];
    g.enemiesSpawned = false;
    g.wanted = 0;
    clearPolice();
    g.graceUntil = g.time + 5;
    if (g.missionIndex >= MISSIONS.length) {
      g.storyComplete = true;
      g.state = 'complete';
      showOverlay('overlay-end');
      document.getElementById('end-stats').textContent =
        `Money $${g.money.toLocaleString('en-US')} · Stashes ${g.stashGot}/3 · Missions 6/6`;
    }
    g.marker = currentMarker();
    save();
  }

  function clearPolice() {
    g.cops = [];
    g.cars = g.cars.filter((c) => c.kind !== 'patrol');
  }

  function spawnChase(patrolCount) {
    const p = g.player;
    const used = new Set();
    for (let i = 0; i < patrolCount; i++) {
      let best = null;
      let bd = -1;
      for (const ax of AVENUES) {
        for (const sy of STREETS) {
          const key = ax + ',' + sy;
          if (used.has(key)) continue;
          const d = Math.hypot(ax - p.x, sy - p.y);
          if (d > 180 && d < 700 && d > bd) {
            bd = d;
            best = { x: ax, y: sy };
          }
        }
      }
      if (!best) best = nearestIntersection(p.x + 200, p.y);
      used.add(best.x + ',' + best.y);
      const car = makePatrol(best.x, best.y, Math.atan2(p.y - best.y, p.x - best.x));
      g.cars.push(car);
    }
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      g.cops.push(makeFootCop(p.x + Math.cos(a) * 220, p.y + Math.sin(a) * 220));
    }
    audio.setSiren(true);
  }

  function raiseWanted(n) {
    if (g.time - g.lastCrimeT < 3) return;
    g.lastCrimeT = g.time;
    g.wanted = Math.min(3, g.wanted + n);
  }

  function addBlip(x, y) {
    for (let i = 0; i < 10; i++) {
      g.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120,
        life: 0.5, maxLife: 0.5, color: '#ffd60a', r: 3,
      });
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      g.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220,
        life: 0.4, maxLife: 0.4, color, r: 2.5,
      });
    }
  }

  // ---------- save / load ----------
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        missionIndex: g.missionIndex,
        stage: g.stage,
        money: g.money,
        px: g.player.x,
        py: g.player.y,
        storyComplete: g.storyComplete,
        stashGot: g.stashGot,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applySave(data) {
    g.missionIndex = data.missionIndex;
    g.stage = data.stage;
    g.money = data.money;
    g.storyComplete = !!data.storyComplete;
    g.stashGot = data.stashGot || 0;
    g.player.x = data.px;
    g.player.y = data.py;
    g.player.inCar = null;
    g.player.hp = 100;
    g.player.ammo = Math.max(24, g.player.ammo);
    for (const s of city.stashes) s.got = false;
    g.marker = currentMarker();
  }

  // ---------- overlays ----------
  const overlayIds = ['overlay-title', 'overlay-pause', 'overlay-end', 'overlay-busted', 'overlay-wasted'];
  function showOverlay(id) {
    for (const oid of overlayIds) {
      const el = document.getElementById(oid);
      if (el) el.classList.toggle('hidden', oid !== id);
    }
  }
  function hideOverlays() {
    for (const oid of overlayIds) {
      const el = document.getElementById(oid);
      if (el) el.classList.add('hidden');
    }
  }

  function startNew() {
    resetWorld();
    g.money = 50;
    g.missionIndex = 0;
    g.stage = 0;
    g.wanted = 0;
    g.kills = 0;
    g.stashGot = 0;
    g.storyComplete = false;
    g.player = makePlayer(city.locations.playerStart.x, city.locations.playerStart.y);
    g.cam.x = g.player.x - VIEW_W / 2;
    g.cam.y = g.player.y - VIEW_H / 2;
    g.marker = currentMarker();
    g.started = true;
    g.paused = false;
    g.state = 'playing';
    g.graceUntil = g.time + 5;
    audio.unlock();
    audio.setSiren(false);
    hideOverlays();
    save();
  }

  function startFromSave() {
    const data = loadSaveData();
    resetWorld();
    g.started = true;
    g.paused = false;
    g.wanted = 0;
    g.kills = 0;
    g.enemies = [];
    g.enemiesSpawned = false;
    if (data) applySave(data);
    else startNewFresh();
    g.cam.x = g.player.x - VIEW_W / 2;
    g.cam.y = g.player.y - VIEW_H / 2;
    audio.unlock();
    audio.setSiren(false);
    if (g.storyComplete) {
      g.state = 'complete';
      showOverlay('overlay-end');
      document.getElementById('end-stats').textContent =
        `Money $${g.money.toLocaleString('en-US')} · Stashes ${g.stashGot}/3 · Missions 6/6`;
    } else {
      g.state = 'playing';
      hideOverlays();
    }
    save();
  }

  function startNewFresh() {
    g.money = 50;
    g.missionIndex = 0;
    g.stage = 0;
    g.storyComplete = false;
    g.stashGot = 0;
    g.player = makePlayer(city.locations.playerStart.x, city.locations.playerStart.y);
    g.marker = currentMarker();
  }

  function respawn() {
    const keepMission = g.missionIndex;
    g.player = makePlayer(city.locations.playerStart.x, city.locations.playerStart.y);
    g.player.hp = 100;
    g.player.ammo = Math.max(24, g.player.ammo);
    g.money = Math.max(50, g.money - 100);
    g.missionIndex = keepMission;
    g.stage = 0;
    g.kills = 0;
    g.enemies = [];
    g.enemiesSpawned = false;
    g.wanted = 0;
    clearPolice();
    g.marker = currentMarker();
    g.state = 'playing';
    g.graceUntil = g.time + 5;
    audio.setSiren(false);
    hideOverlays();
    save();
  }

  function togglePause() {
    if (!g.started || g.state === 'complete' || g.state === 'busted' || g.state === 'wasted') return;
    g.paused = !g.paused;
    g.state = g.paused ? 'paused' : 'playing';
    if (g.paused) {
      showOverlay('overlay-pause');
      save();
    } else {
      hideOverlays();
    }
  }

  // ---------- combat ----------
  function tryShoot() {
    const pl = g.player;
    if (!g.started || g.paused || g.state !== 'playing' || pl.inCar) return;
    if (g.fireT > 0 || pl.ammo <= 0) return;
    g.fireT = 0.22;
    pl.ammo -= 1;
    pl.angle = Math.atan2(g.mouse.y - pl.y, g.mouse.x - pl.x);
    g.muzzleT = 0.06;
    audio.shot();
    const range = 430;
    const ax = Math.cos(pl.angle);
    const ay = Math.sin(pl.angle);
    let best = null;
    let bestD = range;
    const targets = [];
    for (const e of g.enemies) targets.push({ kind: 'enemy', e, x: e.x, y: e.y, r: 16 });
    for (const cp of g.cops) targets.push({ kind: 'cop', e: cp, x: cp.x, y: cp.y, r: 16 });
    for (const t of targets) {
      const dx = t.x - pl.x;
      const dy = t.y - pl.y;
      const along = dx * ax + dy * ay;
      if (along < 0 || along > range) continue;
      const perp = Math.abs(dx * ay - dy * ax);
      if (perp < t.r && along < bestD) {
        bestD = along;
        best = t;
      }
    }
    const hx = pl.x + ax * (best ? bestD : range);
    const hy = pl.y + ay * (best ? bestD : range);
    burst(hx, hy, '#ffd60a', 4);
    if (best) {
      if (best.kind === 'enemy') {
        best.e.hp -= 1;
        burst(best.x, best.y, '#ff5d5d', 8);
        if (best.e.hp <= 0) {
          g.enemies = g.enemies.filter((e) => e !== best.e);
          g.kills += 1;
          burst(best.x, best.y, '#ff5d5d', 14);
          if (Math.random() < 0.6) g.pickups.push({ x: best.x, y: best.y, kind: 'ammo', home: false, respawnT: 0 });
          else if (Math.random() < 0.25) g.pickups.push({ x: best.x, y: best.y, kind: 'health', home: false, respawnT: 0 });
        }
      } else {
        // Suppression: a shot cop is stunned and shoved back, and its
        // bust timer resets, so a firefight never ends in a cheap bust.
        best.e.stunT = 1;
        best.e.bustT = 0;
        const d = Math.max(1, Math.hypot(best.x - pl.x, best.y - pl.y));
        best.e.x += ((best.x - pl.x) / d) * 40;
        best.e.y += ((best.y - pl.y) / d) * 40;
        burst(best.x, best.y, '#7fb0ff', 6);
      }
    }
    // Nearby pedestrians flee from gunfire.
    for (const p of g.peds) {
      if (dist(p.x, p.y, pl.x, pl.y) < 260) {
        p.fleeT = 1.5;
        p.fleeX = pl.x;
        p.fleeY = pl.y;
      }
    }
  }

  function enterCar() {
    const pl = g.player;
    if (pl.inCar) {
      // Exit: step out to the side of the car, the car stays parked here.
      const car = pl.inCar;
      pl.inCar = null;
      car.parked = true;
      car.driver = null;
      car.speed = 0;
      pl.x = car.x - Math.sin(car.angle) * 30;
      pl.y = car.y + Math.cos(car.angle) * 30;
      pl.angle = car.angle;
      return;
    }
    const L = city.locations;
    let best = null;
    let bestD = 75;
    // During the finale the sports car is the prize: it wins the E key
    // whenever it is close, even if another car is nearer.
    if (g.missionIndex === 5 && g.stage === 0) {
      for (const car of g.cars) {
        if (car.kind === 'sports' && car.parked) {
          const d = dist(pl.x, pl.y, car.x, car.y);
          if (d < 100) {
            best = car;
            bestD = d;
          }
        }
      }
    }
    if (!best) {
      for (const car of g.cars) {
        if (car.kind === 'patrol') continue;
        const d = dist(pl.x, pl.y, car.x, car.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
    }
    if (!best) return;
    best.parked = false;
    best.driver = 'player';
    best.traffic = false;
    pl.inCar = best;
    pl.x = best.x;
    pl.y = best.y;
    pl.angle = best.angle;
    raiseWanted(1);
    // Stealing the boss car starts the final chase.
    if (g.missionIndex === 5 && g.stage === 0 && dist(pl.x, pl.y, L.sportsCar.x, L.sportsCar.y) < 260) {
      g.stage = 1;
      g.wanted = 3;
      g.marker = currentMarker();
      spawnChase(4);
      g.graceUntil = g.time + 5;
      save();
    }
  }

  // ---------- enemies / police AI ----------
  function spawnEnemies(kind, cx, cy, count) {
    const offsets = [[70, 0], [-70, 0], [0, 70], [0, -70]];
    for (let i = 0; i < count; i++) {
      const o = offsets[i % offsets.length];
      g.enemies.push(makeEnemy(cx + o[0], cy + o[1], kind));
    }
    g.enemiesSpawned = true;
  }

  function updateEnemies(dt) {
    const pl = g.player;
    for (const e of g.enemies) {
      const d = dist(e.x, e.y, pl.x, pl.y);
      e.angle = Math.atan2(pl.y - e.y, pl.x - e.x);
      if (d > 210) {
        e.x += Math.cos(e.angle) * 85 * dt;
        e.y += Math.sin(e.angle) * 85 * dt;
      } else if (d < 140) {
        e.x -= Math.cos(e.angle) * 40 * dt;
        e.y -= Math.sin(e.angle) * 40 * dt;
      } else {
        e.moveT -= dt;
        if (e.moveT <= 0) {
          e.moveT = 0.8 + Math.random() * 0.8;
          e.targetAngle = e.angle + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
        }
        e.x += Math.cos(e.targetAngle) * 45 * dt;
        e.y += Math.sin(e.targetAngle) * 45 * dt;
      }
      collideBuildings(g.city.buildings, e, e.radius);
      clampToWorld(e, WORLD_W, WORLD_H, e.radius);
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 380 && !pl.inCar) {
        e.shootT = 1.1 + Math.random() * 0.5;
        audio.enemyShot();
        if (Math.random() < 0.5) {
          pl.hp -= 7;
          burst(pl.x, pl.y, '#ff5d5d', 5);
          if (pl.hp <= 0) {
            pl.hp = 0;
            g.state = 'wasted';
            g.respawnT = 3.5;
            audio.busted();
            showOverlay('overlay-wasted');
          }
        }
      }
    }
    // Keep enemies from stacking on each other.
    for (let i = 0; i < g.enemies.length; i++) {
      for (let j = i + 1; j < g.enemies.length; j++) {
        const a = g.enemies[i];
        const b = g.enemies[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d > 0.01 && d < 26) {
          const push = (26 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function updateCops(dt) {
    const pl = g.player;
    const shooting = g.time - (g.lastShotT || -100) < 1.5;
    for (const cp of g.cops) {
      if (cp.stunT > 0) {
        cp.stunT -= dt;
        continue;
      }
      const d = dist(cp.x, cp.y, pl.x, pl.y);
      // Cops never close in on a player in a car, and they hold off
      // while a shootout is going on.
      const holdDist = pl.inCar ? 70 : shooting ? 150 : 0;
      if (d > holdDist + 4) {
        const a = Math.atan2(pl.y - cp.y, pl.x - cp.x);
        cp.x += Math.cos(a) * cp.speed * dt;
        cp.y += Math.sin(a) * cp.speed * dt;
        cp.angle = a;
      }
      collideBuildings(g.city.buildings, cp, cp.radius);
      clampToWorld(cp, WORLD_W, WORLD_H, cp.radius);
      if (!pl.inCar && d < 45 && g.time > g.graceUntil) {
        cp.bustT += dt;
        if (cp.bustT > 1.6) {
          g.state = 'busted';
          g.respawnT = 3.5;
          audio.busted();
          showOverlay('overlay-busted');
          return;
        }
      } else {
        cp.bustT = 0;
      }
    }
  }

  function updatePatrols(dt) {
    const pl = g.player;
    for (const car of g.cars) {
      if (car.kind !== 'patrol') continue;
      const d = dist(car.x, car.y, pl.x, pl.y);
      const desired = Math.atan2(pl.y - car.y, pl.x - car.x);
      const diff = normAngle(desired - car.angle);
      const input = { up: true, down: false, left: diff < -0.25, right: diff > 0.25 };
      if (Math.abs(diff) > 2.4) {
        input.up = false;
        input.down = true;
      }
      const before = { x: car.x, y: car.y };
      const hit = stepCar(car, g.city.buildings, WORLD_W, WORLD_H, dt, input);
      if (hit) car.speed *= 0.6;
      // Ram the player's car: a single brief shove with a cooldown, never
      // damage. A continuous shove pins the player forever — a patrol
      // sitting on the car blocks every escape, including driving back
      // through it to the road — so each patrol shoves once, loses half
      // its speed on impact, and has to come around again.
      car.ramT = Math.max(0, (car.ramT || 0) - dt);
      if (pl.inCar && car.ramT <= 0 && dist(car.x, car.y, pl.x, pl.y) < 34) {
        const a = Math.atan2(pl.y - car.y, pl.x - car.x);
        pl.x += Math.cos(a) * 26;
        pl.y += Math.sin(a) * 26;
        pl.inCar.x = pl.x;
        pl.inCar.y = pl.y;
        car.ramT = 1.2;
        car.speed *= 0.5;
        g.shake = Math.max(g.shake, 5);
      }
      void before;
      void d;
    }
  }

  function updateTraffic(dt) {
    for (const car of g.cars) {
      if (!car.traffic) continue;
      // Stop for whatever is directly ahead.
      let blocked = false;
      const ax = car.trafficAxis === 'v' ? 0 : 1;
      const ahead = 70;
      const fx = car.x + (ax === 1 ? car.trafficDir * ahead : 0);
      const fy = car.y + (ax === 0 ? car.trafficDir * ahead : 0);
      for (const o of g.cars) {
        if (o === car || o.parked) continue;
        if (Math.hypot(o.x - fx, o.y - fy) < 26) {
          blocked = true;
          break;
        }
      }
      if (!blocked && g.player.inCar === car) blocked = false;
      if (!blocked) {
        const sp = car.trafficSpeed;
        if (car.trafficAxis === 'v') {
          car.y += car.trafficDir * sp * dt;
          if (car.y > 1740) car.trafficDir = -1;
          if (car.y < 200) car.trafficDir = 1;
          car.angle = car.trafficDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.x += car.trafficDir * sp * dt;
          if (car.x > 2400) car.trafficDir = -1;
          if (car.x < 200) car.trafficDir = 1;
          car.angle = car.trafficDir > 0 ? 0 : Math.PI;
        }
      }
    }
  }

  function updatePeds(dt) {
    for (const p of g.peds) {
      if (p.fleeT > 0) {
        p.fleeT -= dt;
        const a = Math.atan2(p.y - p.fleeY, p.x - p.fleeX);
        p.x += Math.cos(a) * 120 * dt;
        p.y += Math.sin(a) * 120 * dt;
      } else {
        if (p.axis === 'v') {
          p.y += p.dir * p.speed * dt;
          if (p.y > 1740) p.dir = -1;
          if (p.y < 200) p.dir = 1;
        } else {
          p.x += p.dir * p.speed * dt;
          if (p.x > 2400) p.dir = -1;
          if (p.x < 200) p.dir = 1;
        }
      }
      clampToWorld(p, WORLD_W, WORLD_H, p.radius);
    }
  }

  function updatePickups(dt) {
    const pl = g.player;
    for (const pk of g.pickups) {
      if (pk.respawnT > 0) {
        pk.respawnT -= dt;
        continue;
      }
      if (dist(pl.x, pl.y, pk.x, pk.y) < 32) {
        if (pk.kind === 'ammo') {
          pl.ammo += 12;
          audio.pickup();
          addBlip(pk.x, pk.y);
        } else if (pk.kind === 'health') {
          pl.hp = Math.min(100, pl.hp + 40);
          audio.pickup();
          addBlip(pk.x, pk.y);
        }
        if (pk.home) pk.respawnT = 45;
        else pk.taken = true;
      }
    }
    g.pickups = g.pickups.filter((pk) => !pk.taken);
    // Stashes.
    for (const s of city.stashes) {
      if (!s.got && dist(pl.x, pl.y, s.x, s.y) < 34) {
        s.got = true;
        g.stashGot += 1;
        g.money += 100;
        audio.pickup();
        addBlip(s.x, s.y);
      }
    }
  }

  function updateWanted(dt) {
    const chasing = (g.missionIndex === 3 && g.stage === 1) || (g.missionIndex === 5 && g.stage === 1) || (g.missionIndex === 4 && g.stage === 2);
    if (chasing) return; // the chase sets the level; it does not decay
    if (g.wanted > 0 && g.time - g.lastCrimeT > 18) {
      g.decayT += dt;
      if (g.decayT > 8) {
        g.decayT = 0;
        g.wanted -= 1;
        if (g.wanted === 0) {
          clearPolice();
          audio.setSiren(false);
        }
      }
    } else {
      g.decayT = 0;
    }
    // Foot cops answer wanted 1+; patrol cars answer wanted 2+.
    const wantCops = g.wanted >= 1 ? 2 : 0;
    const wantPatrols = g.wanted >= 2 ? Math.min(g.wanted, 2) : 0;
    const patrolCount = g.cars.filter((c) => c.kind === 'patrol').length;
    if (g.cops.length < wantCops && g.time > g.graceUntil) {
      const a = Math.random() * Math.PI * 2;
      g.cops.push(makeFootCop(g.player.x + Math.cos(a) * 300, g.player.y + Math.sin(a) * 300));
    }
    if (patrolCount < wantPatrols && g.time > g.graceUntil) {
      const n = nearestIntersection(g.player.x + 260, g.player.y);
      const car = makePatrol(n.x, n.y, Math.atan2(g.player.y - n.y, g.player.x - n.x));
      g.cars.push(car);
    }
    audio.setSiren(g.wanted >= 2 && patrolCount > 0);
  }

  // ---------- missions ----------
  function updateMissions() {
    const pl = g.player;
    const L = city.locations;
    const d = (p) => dist(pl.x, pl.y, p.x, p.y);
    if (g.missionIndex === 0) {
      if (pl.inCar && d(L.dropoff) < 90) completeMission();
    } else if (g.missionIndex === 1) {
      if (g.stage === 0 && d(L.pickup) < 80) {
        g.stage = 1;
        g.marker = currentMarker();
        audio.blip();
        save();
      } else if (g.stage === 1 && d(L.delivery) < 80) {
        completeMission();
      }
    } else if (g.missionIndex === 2) {
      if (!g.enemiesSpawned && !pl.inCar && d(L.turf) < 300) {
        spawnEnemies('gang', L.turf.x, L.turf.y, 4);
      }
      if (g.enemiesSpawned && g.kills >= 4) completeMission();
    } else if (g.missionIndex === 3) {
      if (g.stage === 0 && pl.inCar && d(L.goods) < 85) {
        g.stage = 1;
        g.wanted = 3;
        g.marker = currentMarker();
        spawnChase(3);
        g.graceUntil = g.time + 5;
        save();
      } else if (g.stage === 1 && d(L.safehouse) < 90) {
        completeMission();
      }
    } else if (g.missionIndex === 4) {
      if (g.stage === 0) {
        if (!g.enemiesSpawned && !pl.inCar && d(L.bank) < 300) {
          spawnEnemies('guard', L.bank.x, L.bank.y, 3);
        }
        if (g.enemiesSpawned && g.kills >= 3) {
          g.stage = 1;
          g.marker = currentMarker();
          audio.blip();
          save();
        }
      } else if (g.stage === 1 && !pl.inCar && d(L.cash) < 65) {
        g.stage = 2;
        g.wanted = 2;
        g.marker = currentMarker();
        spawnChase(2);
        g.graceUntil = g.time + 5;
        save();
      } else if (g.stage === 2 && pl.inCar && d(L.garage) < 90) {
        completeMission();
      }
    } else if (g.missionIndex === 5) {
      if (g.stage === 1 && d(L.safehouse) < 90) completeMission();
    }
  }

  // ---------- player movement ----------
  function updatePlayer(dt) {
    const pl = g.player;
    const k = g.keys;
    if (pl.inCar) {
      const car = pl.inCar;
      const input = {
        up: !!(k.KeyW || k.ArrowUp),
        down: !!(k.KeyS || k.ArrowDown),
        left: !!(k.KeyA || k.ArrowLeft),
        right: !!(k.KeyD || k.ArrowRight),
      };
      const speedBefore = Math.abs(car.speed);
      const hit = stepCar(car, g.city.buildings, WORLD_W, WORLD_H, dt, input);
      if (hit && speedBefore > 120) {
        g.shake = Math.max(g.shake, 7);
        audio.crash();
        burst(car.x, car.y, '#888', 6);
      }
      pl.x = car.x;
      pl.y = car.y;
      pl.angle = car.angle;
      // Drifting leaves skid marks.
      const turning = (input.left || input.right) && Math.abs(car.speed) > 150;
      if (turning) {
        const bx = car.x - Math.cos(car.angle) * 12;
        const by = car.y - Math.sin(car.angle) * 12;
        g.skids.push({ x1: bx, y1: by, x2: bx + (Math.random() - 0.5) * 4, y2: by + (Math.random() - 0.5) * 4, life: 1 });
        if (g.skids.length > 220) g.skids.shift();
      }
      // Running a pedestrian over is a crime.
      for (const p of g.peds) {
        if (dist(car.x, car.y, p.x, p.y) < 24 && Math.abs(car.speed) > 100) {
          raiseWanted(1);
          p.fleeT = 2;
          p.fleeX = car.x;
          p.fleeY = car.y;
          g.shake = Math.max(g.shake, 6);
          audio.crash();
        }
      }
      audio.setEngine(Math.abs(car.speed) / 300);
    } else {
      const vx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const vy = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
      stepWalk(pl, g.city.buildings, WORLD_W, WORLD_H, dt, vx, vy);
      if (vx !== 0 || vy !== 0) pl.angle = Math.atan2(g.mouse.y - pl.y, g.mouse.x - pl.x);
      else pl.angle = Math.atan2(g.mouse.y - pl.y, g.mouse.x - pl.x);
      audio.setEngine(0);
    }
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.time += dt;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 22);
    if (g.muzzleT > 0) g.muzzleT -= dt;
    if (g.fireT > 0) g.fireT -= dt;
    for (const pt of g.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    g.particles = g.particles.filter((pt) => pt.life > 0);
    for (const s of g.skids) s.life -= dt * 0.25;
    g.skids = g.skids.filter((s) => s.life > 0);

    if (!g.started) {
      // Attract mode: slow pan over the city behind the title screen.
      g.cam.x = 640 + Math.sin(g.time * 0.05) * 420;
      g.cam.y = 480 + Math.cos(g.time * 0.04) * 220;
    } else if (g.state === 'playing' && !g.paused) {
      updatePlayer(dt);
      updateTraffic(dt);
      updatePeds(dt);
      updateEnemies(dt);
      updateCops(dt);
      updatePatrols(dt);
      updatePickups(dt);
      updateWanted(dt);
      updateMissions();
      audio.tickSiren(dt);
      // Camera follows the player.
      const tx = g.player.x - VIEW_W / 2;
      const ty = g.player.y - VIEW_H / 2;
      g.cam.x += (tx - g.cam.x) * Math.min(1, dt * 5);
      g.cam.y += (ty - g.cam.y) * Math.min(1, dt * 5);
      g.cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, g.cam.x));
      g.cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, g.cam.y));
      g.saveT += dt;
      if (g.saveT > 3) {
        g.saveT = 0;
        save();
      }
    } else if ((g.state === 'busted' || g.state === 'wasted') && g.respawnT > 0) {
      g.respawnT -= dt;
      if (g.respawnT <= 0) respawn();
    }
    render(ctx, g);
    requestAnimationFrame(frame);
  }

  // ---------- driver / debug state ----------
  function snapshot() {
    const pl = g.player;
    const car = pl.inCar;
    const carsNear = [];
    for (const c of g.cars) {
      const d = dist(pl.x, pl.y, c.x, c.y);
      if (d < 220) carsNear.push({ x: c.x, y: c.y, d, parked: c.parked });
    }
    return {
      started: g.started,
      money: g.money,
      missionIndex: g.missionIndex,
      stage: g.stage,
      wanted: g.wanted,
      patrol: g.cars.filter((c) => c.kind === 'patrol').length,
      cops: g.cops.length,
      hp: Math.round(pl.hp),
      ammo: pl.ammo,
      kills: g.kills,
      enemies: g.enemies.map((e) => ({ x: e.x, y: e.y })),
      footCops: g.cops.map((c) => ({ x: c.x, y: c.y })),
      pickups: g.pickups.filter((p) => p.respawnT <= 0).map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
      carsNear,
      marker: { x: g.marker.x, y: g.marker.y },
      px: pl.x,
      py: pl.y,
      carAngle: car ? car.angle : 0,
      carSpeed: car ? Math.round(car.speed) : 0,
      inCar: !!car,
      cam: { x: g.cam.x, y: g.cam.y },
      state: g.state,
      storyComplete: g.storyComplete,
      paused: g.paused,
    };
  }

  // ---------- screenshot staging ----------
  function setupShot(shot) {
    resetWorld();
    const L = city.locations;
    g.started = true;
    g.paused = false;
    g.state = 'playing';
    g.storyComplete = false;
    hideOverlays();
    audio.unlock();
    const placeTraffic = (spots) => {
      const movers = g.cars.filter((c) => c.traffic);
      spots.forEach((s, i) => {
        if (movers[i]) {
          movers[i].x = s[0];
          movers[i].y = s[1];
          movers[i].traffic = false;
          movers[i].parked = false;
        }
      });
    };
    const placePeds = (spots) => {
      spots.forEach((s, i) => {
        if (g.peds[i]) {
          g.peds[i].x = s[0];
          g.peds[i].y = s[1];
        }
      });
    };
    const putInCar = (x, y, angle) => {
      const car = g.cars.find((c) => c.kind === 'car' && c.parked);
      car.parked = false;
      car.driver = 'player';
      car.x = x;
      car.y = y;
      car.angle = angle;
      g.player.inCar = car;
      g.player.x = x;
      g.player.y = y;
      g.player.angle = angle;
    };
    if (shot === 'walk') {
      g.money = 50;
      g.missionIndex = 0;
      g.stage = 0;
      g.player = makePlayer(1280, 960);
      g.player.angle = 0;
      placeTraffic([[1280, 800], [1120, 960], [1440, 960], [1280, 1120]]);
      placePeds([[1210, 920], [1330, 900], [1240, 1030], [1360, 1010], [1180, 1000], [1300, 890], [1420, 930], [1260, 1060]]);
    } else if (shot === 'drive') {
      g.money = 350;
      g.missionIndex = 1;
      g.stage = 0;
      putInCar(960, 960, 0);
      placeTraffic([[800, 960], [1280, 960], [960, 1280]]);
      placePeds([[900, 900], [1020, 1020], [880, 1020]]);
    } else if (shot === 'chase') {
      g.money = 1650;
      g.missionIndex = 3;
      g.stage = 1;
      g.wanted = 3;
      putInCar(1280, 960, 0);
      spawnChase(3);
      // Pull the patrols in close for the shot.
      const patrols = g.cars.filter((c) => c.kind === 'patrol');
      const spots = [[1150, 960], [1420, 960], [1280, 820]];
      patrols.forEach((pc, i) => {
        if (spots[i]) {
          pc.x = spots[i][0];
          pc.y = spots[i][1];
        }
      });
      const cops = g.cops;
      if (cops[0]) { cops[0].x = 1230; cops[0].y = 1000; }
      if (cops[1]) { cops[1].x = 1330; cops[1].y = 920; }
      audio.setSiren(true);
    } else if (shot === 'mission') {
      g.money = 350;
      g.missionIndex = 1;
      g.stage = 0;
      putInCar(800, 960, Math.PI);
      placeTraffic([[960, 960], [640, 1280]]);
      placePeds([[700, 900], [760, 1020]]);
    }
    g.marker = currentMarker();
    g.cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, g.player.x - VIEW_W / 2));
    g.cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, g.player.y - VIEW_H / 2));
  }

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    g.keys[e.code] = true;
    if (e.code === 'KeyE' && g.started && g.state === 'playing' && !g.paused) enterCar();
    if ((e.code === 'KeyP' || e.code === 'Escape') && g.started) togglePause();
    if (e.code === 'Enter') {
      if (!g.started) startNew();
      else if (g.state === 'busted' || g.state === 'wasted') respawn();
      else if (g.state === 'complete') startNew();
    }
  });
  window.addEventListener('keyup', (e) => {
    g.keys[e.code] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    g.mouse.x = (e.clientX - rect.left) * sx + g.cam.x;
    g.mouse.y = (e.clientY - rect.top) * sy + g.cam.y;
    if (!g.player.inCar && g.started && g.state === 'playing') {
      g.player.angle = Math.atan2(g.mouse.y - g.player.y, g.mouse.x - g.player.x);
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    g.mouse.x = (e.clientX - rect.left) * sx + g.cam.x;
    g.mouse.y = (e.clientY - rect.top) * sy + g.cam.y;
    g.lastShotT = g.time;
    tryShoot();
  });

  // ---------- buttons ----------
  document.getElementById('btn-start').addEventListener('click', () => startNew());
  document.getElementById('btn-continue').addEventListener('click', () => startFromSave());
  document.getElementById('btn-resume').addEventListener('click', () => togglePause());
  document.getElementById('btn-restart').addEventListener('click', () => {
    const keepMission = g.missionIndex;
    const keepMoney = g.money;
    const keepStash = g.stashGot;
    respawn();
    g.missionIndex = keepMission;
    g.money = keepMoney;
    g.stashGot = keepStash;
    g.marker = currentMarker();
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    save();
    g.started = false;
    g.paused = false;
    g.state = 'title';
    audio.setSiren(false);
    audio.setEngine(0);
    showOverlay('overlay-title');
    refreshTitleButtons();
  });
  document.getElementById('btn-again').addEventListener('click', () => startNew());
  document.getElementById('btn-busted-ok').addEventListener('click', () => respawn());
  document.getElementById('btn-wasted-ok').addEventListener('click', () => respawn());

  function refreshTitleButtons() {
    const hasSave = !!loadSaveData();
    document.getElementById('btn-continue').classList.toggle('hidden', !hasSave);
  }

  // ---------- boot ----------
  window.__game = { state: snapshot, game: g };
  resetWorld();
  refreshTitleButtons();
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    setupShot(shot);
  } else {
    showOverlay('overlay-title');
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createGame);
} else {
  createGame();
}
