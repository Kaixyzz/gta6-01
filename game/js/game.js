// SOLARA BAY main controller: game state, input, the update loop, police
// and wanted, traffic, combat, save/load and the state API the playthrough
// driver reads. Rendering lives in render.js, missions in missions.js.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;
  const SAVE_KEY = 'solara-bay-save-v11';
  const VIEW_W = 1280;
  const VIEW_H = 720;

  const G = {
    started: false, paused: false, state: 'title', storyComplete: false,
    money: 50, hp: 100, ammo: 24, wanted: 0,
    missionIndex: 0, missionStartMoney: 50, stage: 0, kills: 0,
    gangSpawned: false, guardsSpawned: false,
    stashesFound: 0,
    player: { x: 320, y: 420, angle: -Math.PI / 2, speed: 0 },
    car: null, cars: [], peds: [], footCops: [], patrols: [],
    enemies: [], pickups: [], bullets: [], particles: [], skids: [],
    cam: { x: 0, y: 0 }, shake: 0, time: 0, toast: null, toastT: 0,
    marker: { x: 1280, y: 960 }, saveT: 0, firing: false, fireT: 0,
    mouse: { x: 640, y: 360, down: false },
    keys: {},
  };
  G.city = null;
  G.rng = SB.makeRng(20261120);

  function note(msg) {
    G.toast = msg;
    G.toastT = 3.5;
  }
  G.note = note;

  function resetWorld() {
    const city = SB.City.build();
    G.city = city;
    G.cars = [];
    for (const def of city.parked) G.cars.push(SB.Entities.makeCar(def));
    // A guaranteed car by the garage so the first steal always works, and
    // one by the turf and the bank for the later getaways. Nothing extra is
    // parked near the marina: the boss sports car must be the nearest car
    // there, or the final steal grabs the wrong car.
    const extra = [
      { x: 320, y: 500, angle: 0, type: 'sedan', color: '#c0392b', parked: true },
      { x: 640, y: 380, angle: Math.PI / 2, type: 'sedan', color: '#2e86c1', parked: true },
      { x: 1560, y: 1000, angle: 0, type: 'sedan', color: '#f1c40f', parked: true },
      { x: 1240, y: 600, angle: Math.PI / 2, type: 'sedan', color: '#16a085', parked: true },
    ];
    for (const def of extra) G.cars.push(SB.Entities.makeCar(def));
    // Traffic cars drive the roads; they join the same car list.
    for (const t of city.traffic) {
      const c = SB.Entities.makeCar({ x: t.road === 'ave' ? t.line : t.pos, y: t.road === 'ave' ? t.pos : t.line, angle: t.road === 'ave' ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI), type: t.type, color: t.color, parked: false });
      c.traffic = t;
      G.cars.push(c);
    }
    G.peds = [];
    for (const def of city.peds) G.peds.push(SB.Entities.makePed(def));
    G.footCops = [];
    G.patrols = [];
    G.enemies = [];
    G.pickups = [];
    for (const p of city.pickups) G.pickups.push(SB.Entities.makePickup(p.x, p.y, p.kind));
    G.stashes = city.stashes.map(function (s) { return { id: s.id, x: s.x, y: s.y, found: false }; });
    G.bullets = [];
    G.particles = [];
    G.skids = [];
  }

  function resetRun() {
    resetWorld();
    G.started = true;
    G.paused = false;
    G.state = 'playing';
    G.storyComplete = false;
    G.money = 50;
    G.hp = 100;
    G.ammo = 24;
    G.wanted = 0;
    G.missionIndex = 0;
    G.missionStartMoney = 50;
    G.stage = 0;
    G.kills = 0;
    G.gangSpawned = false;
    G.guardsSpawned = false;
    G.stashesFound = 0;
    G.player.x = SB.City.PLACES.start.x;
    G.player.y = SB.City.PLACES.start.y;
    G.player.angle = -Math.PI / 2;
    G.car = null;
    G.shake = 0;
    G.toast = null;
    updateMarker();
    centerCamera(true);
  }

  function updateMarker() {
    G.marker = SB.Missions.markerFor(G);
  }

  function centerCamera(snap) {
    const tx = Math.max(0, Math.min(SB.City.WORLD_W - VIEW_W, G.player.x - VIEW_W / 2));
    const ty = Math.max(0, Math.min(SB.City.WORLD_H - VIEW_H, G.player.y - VIEW_H / 2));
    if (snap) {
      G.cam.x = tx; G.cam.y = ty;
    } else {
      G.cam.x += (tx - G.cam.x) * 0.12;
      G.cam.y += (ty - G.cam.y) * 0.12;
    }
  }

  // --- police ------------------------------------------------------------
  function combatMission() {
    return G.missionIndex === 2 || G.missionIndex === 4;
  }

  function nearestInter(px, py) {
    let best = null, bd = 1e18;
    for (const ax of SB.City.AVENUES) {
      for (const sy of SB.City.STREETS) {
        const d = (ax - px) * (ax - px) + (sy - py) * (sy - py);
        if (d < bd) { bd = d; best = { x: ax, y: sy }; }
      }
    }
    return best;
  }

  function farInter(px, py, minD) {
    const cands = [];
    for (const ax of SB.City.AVENUES) {
      for (const sy of SB.City.STREETS) {
        const d = Math.hypot(ax - px, sy - py);
        if (d >= minD && d <= minD + 260) cands.push({ x: ax, y: sy });
      }
    }
    if (!cands.length) return nearestInter(px, py);
    return cands[Math.floor(G.rng.next() * cands.length)];
  }

  function spawnChase(patrolN, footN) {
    for (let i = 0; i < patrolN; i++) {
      const p = farInter(G.player.x, G.player.y, 380);
      const c = SB.Entities.makeCop(p.x, p.y, true);
      G.patrols.push(c);
    }
    for (let i = 0; i < footN; i++) {
      const p = farInter(G.player.x, G.player.y, 300);
      G.footCops.push(SB.Entities.makeCop(p.x, p.y, false));
    }
  }
  G.spawnChase = spawnChase;

  function clearPolice() {
    G.footCops.length = 0;
    G.patrols.length = 0;
  }
  G.clearPolice = clearPolice;

  function raiseWanted(n) {
    if (combatMission()) return;
    G.wanted = Math.min(3, G.wanted + n);
    managePolice();
  }

  function managePolice() {
    const wantFoot = G.wanted >= 1 && !combatMission() ? Math.min(2, G.wanted) : 0;
    const wantPatrol = G.wanted === 2 ? 1 : G.wanted === 3 ? 2 : 0;
    while (G.footCops.length < wantFoot) {
      const p = farInter(G.player.x, G.player.y, 320);
      G.footCops.push(SB.Entities.makeCop(p.x, p.y, false));
    }
    while (G.footCops.length > wantFoot) G.footCops.pop();
    while (G.patrols.length < wantPatrol) {
      const p = farInter(G.player.x, G.player.y, 420);
      G.patrols.push(SB.Entities.makeCop(p.x, p.y, true));
    }
    while (G.patrols.length > wantPatrol) G.patrols.pop();
  }

  // --- entering / exiting cars -------------------------------------------
  function nearestCar(maxD) {
    let best = null, bd = maxD;
    for (const c of G.cars) {
      const d = Math.hypot(c.x - G.player.x, c.y - G.player.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar() {
    if (G.car) return;
    const c = nearestCar(75);
    if (!c) return;
    c.parked = false;
    c.traffic = null;
    G.car = c;
    G.player.angle = c.angle;
    if (c.boss) SB.Missions.onEnterBossCar(G);
    else raiseWanted(1);
    SB.Audio.blip(520, 0.08);
  }

  function exitCar() {
    if (!G.car) return;
    const c = G.car;
    c.parked = true;
    c.speed = 0;
    G.player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 34;
    G.player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 34;
    SB.City.collideCircle(G.city.buildings, G.player, 12);
    G.car = null;
  }

  // --- shooting ------------------------------------------------------------
  function fireBullet() {
    if (G.ammo <= 0) {
      SB.Audio.blip(180, 0.05);
      return;
    }
    G.ammo -= 1;
    const wx = G.mouse.x + G.cam.x;
    const wy = G.mouse.y + G.cam.y;
    const a = Math.atan2(wy - G.player.y, wx - G.player.x);
    G.player.angle = a;
    const b = SB.Entities.makeBullet(G.player.x + Math.cos(a) * 20, G.player.y + Math.sin(a) * 20, a, 760, 'player');
    G.bullets.push(b);
    G.shake = Math.min(7, G.shake + 2.5);
    G.particles.push(SB.Entities.makeParticle(G.player.x + Math.cos(a) * 24, G.player.y + Math.sin(a) * 24, Math.cos(a) * 60, Math.sin(a) * 60, 0.09, '#ffd94d', 7));
    SB.Audio.shot();
    // Nearby pedestrians flee from the gunfire.
    for (const p of G.peds) {
      if (Math.hypot(p.x - G.player.x, p.y - G.player.y) < 420) p.fleeT = 2;
    }
  }

  // --- save / load ---------------------------------------------------------
  function save() {
    try {
      const data = {
        missionIndex: G.missionIndex, money: G.money, hp: G.hp, ammo: G.ammo,
        px: Math.round(G.player.x), py: Math.round(G.player.y),
        storyComplete: G.storyComplete,
        stashes: G.stashes.filter(function (s) { return s.found; }).map(function (s) { return s.id; }),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {}
  }
  G.save = save;

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function continueSave() {
    const s = loadSave();
    if (!s) return false;
    resetWorld();
    G.started = true;
    G.paused = false;
    G.money = s.money;
    G.hp = s.hp;
    G.ammo = s.ammo;
    G.missionIndex = s.missionIndex;
    G.missionStartMoney = s.money;
    G.stage = 0;
    G.kills = 0;
    G.gangSpawned = false;
    G.guardsSpawned = false;
    G.player.x = s.px;
    G.player.y = s.py;
    G.car = null;
    for (const id of s.stashes || []) {
      const st = G.stashes[id];
      if (st) { st.found = true; G.stashesFound++; }
    }
    if (s.storyComplete) {
      G.storyComplete = true;
      G.state = 'complete';
      G.missionIndex = SB.Missions.DEFS.length;
    } else {
      G.state = 'playing';
    }
    updateMarker();
    centerCamera(true);
    return true;
  }

  // --- the update loop -----------------------------------------------------
  function update(dt) {
    G.time += dt;
    if (G.toastT > 0) G.toastT -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateStashes(dt);
    updateParticles(dt);
    SB.Missions.update(G, dt);
    updateMarker();
    centerCamera(false);
    managePolice();
    SB.Audio.engine(G.car ? Math.abs(G.car.speed) / G.car.top : 0);
    SB.Audio.siren(G.wanted >= 2);
    G.saveT -= dt;
    if (G.saveT <= 0) {
      G.saveT = 5;
      if (G.state === 'playing') save();
    }
  }

  function updatePlayer(dt) {
    const k = G.keys;
    const input = {
      up: !!(k.w || k.arrowup), down: !!(k.s || k.arrowdown),
      left: !!(k.a || k.arrowleft), right: !!(k.d || k.arrowright),
    };
    if (G.car) {
      const car = G.car;
      const before = { x: car.x, y: car.y };
      const res = SB.Entities.driveCar(car, input, dt, { collideCircle: function (c, r) { return SB.City.collideCircle(G.city.buildings, c, r); }, data: G.city });
      if (res.scraped) {
        if (res.hard) {
          G.shake = Math.min(10, G.shake + 5);
          SB.Audio.crash();
          burst(car.x, car.y, 8, '#ffb347');
        } else {
          G.shake = Math.min(6, G.shake + 1.5);
        }
      }
      // Skid marks while drifting hard.
      if (res.lat > 1.6 && Math.abs(car.speed) > 180) {
        car.skidT += dt;
        if (car.skidT > 0.06) {
          car.skidT = 0;
          G.skids.push({ x: car.x, y: car.y, a: car.angle, t: 4 });
        }
      }
      // Car vs traffic: shove apart.
      for (const o of G.cars) {
        if (o === car || o === G.car) continue;
        const dx = car.x - o.x, dy = car.y - o.y;
        const d = Math.hypot(dx, dy);
        const min = 44;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          car.x += (dx / d) * push;
          car.y += (dy / d) * push;
          if (o.traffic) { o.x -= (dx / d) * push; o.y -= (dy / d) * push; }
        }
      }
      // Car vs pedestrians: a hard hit knocks them down and raises wanted.
      for (const p of G.peds) {
        if (p.down) continue;
        const d = Math.hypot(p.x - car.x, p.y - car.y);
        if (d < 26 && Math.abs(car.speed) > 120) {
          p.down = true;
          p.downT = 3;
          raiseWanted(1);
          G.shake = Math.min(9, G.shake + 4);
          SB.Audio.crash();
          for (const q of G.peds) {
            if (Math.hypot(q.x - car.x, q.y - car.y) < 300) q.fleeT = 2;
          }
        }
      }
      G.player.x = car.x;
      G.player.y = car.y;
      G.player.angle = car.angle;
      G.player.speed = car.speed;
    } else {
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        G.player.x += mx * 175 * dt;
        G.player.y += my * 175 * dt;
        G.player.angle = Math.atan2(my, mx);
        SB.City.collideCircle(G.city.buildings, G.player, 12);
      }
      G.player.speed = 0;
      // Aim follows the mouse while on foot.
      const wx = G.mouse.x + G.cam.x;
      const wy = G.mouse.y + G.cam.y;
      if (G.firing || G.mouse.down) {
        G.player.angle = Math.atan2(wy - G.player.y, wx - G.player.x);
      }
      if (G.firing) {
        G.fireT -= dt;
        if (G.fireT <= 0) {
          G.fireT = 0.18;
          fireBullet();
        }
      }
    }
  }

  function updateTraffic(dt) {
    for (const c of G.cars) {
      if (!c.traffic || c === G.car) continue;
      const t = c.traffic;
      const axis = t.road === 'ave' ? 'y' : 'x';
      // Slow down for a car ahead on the same lane.
      let blocked = false;
      for (const o of G.cars) {
        if (o === c) continue;
        if (t.road === 'ave') {
          if (Math.abs(o.x - c.x) < 40 && (o.y - c.y) * t.dir > 0 && (o.y - c.y) * t.dir < 70) blocked = true;
        } else {
          if (Math.abs(o.y - c.y) < 40 && (o.x - c.x) * t.dir > 0 && (o.x - c.x) * t.dir < 70) blocked = true;
        }
      }
      const sp = blocked ? 0 : t.speed;
      if (t.road === 'ave') {
        c.y += t.dir * sp * dt;
        c.x = t.line + 22;
        c.angle = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (c.y > 1620) { t.dir = -1; }
        if (c.y < 300) { t.dir = 1; }
      } else {
        c.x += t.dir * sp * dt;
        c.y = t.line + 22;
        c.angle = t.dir > 0 ? 0 : Math.PI;
        if (c.x > 2260) { t.dir = -1; }
        if (c.x < 300) { t.dir = 1; }
      }
    }
  }

  function updatePeds(dt) {
    for (const p of G.peds) {
      SB.Entities.updatePed(p, dt, G.player, { collideCircle: function (c, r) { return SB.City.collideCircle(G.city.buildings, c, r); }, data: G.city }, G.rng);
    }
  }

  function updatePolice(dt) {
    for (const cop of G.footCops) {
      if (G.car) {
        // On foot only in spirit: cops run at the player; in a car they
        // cannot keep up, so they jog after it and give up if far away.
        const d = Math.hypot(cop.x - G.player.x, cop.y - G.player.y);
        if (d > 700) { cop.touchT = 0; continue; }
      }
      const touching = SB.Entities.updateFootCop(cop, dt, G.player, { collideCircle: function (c, r) { return SB.City.collideCircle(G.city.buildings, c, r); }, data: G.city });
      if (touching && !G.car) {
        cop.touchT += dt;
        if (cop.touchT > 2) {
          busted();
          return;
        }
      } else {
        cop.touchT = 0;
      }
    }
    for (const pc of G.patrols) {
      const hit = SB.Entities.updatePatrol(pc, dt, G.player, { collideCircle: function (c, r) { return SB.City.collideCircle(G.city.buildings, c, r); }, data: G.city });
      if (hit && G.car) {
        // A ram shoves the player's car sideways.
        const dx = G.car.x - pc.x, dy = G.car.y - pc.y;
        const d = Math.hypot(dx, dy) || 1;
        G.car.x += (dx / d) * 26;
        G.car.y += (dy / d) * 26;
        G.shake = Math.min(9, G.shake + 4);
        SB.Audio.crash();
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      const b = SB.Entities.updateEnemy(e, dt, G.player, { collideCircle: function (c, r) { return SB.City.collideCircle(G.city.buildings, c, r); }, data: G.city }, G.rng);
      if (b) G.bullets.push(b);
    }
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        if (b.from === 'player') {
          for (let j = G.enemies.length - 1; j >= 0; j--) {
            const e = G.enemies[j];
            if (Math.hypot(e.x - b.x, e.y - b.y) < 15) {
              e.hp -= b.dmg;
              burst(b.x, b.y, 5, '#ffd94d');
              if (e.hp <= 0) {
                G.enemies.splice(j, 1);
                G.kills += 1;
                burst(e.x, e.y, 12, '#e74c3c');
                if (G.rng.chance(0.6)) G.pickups.push(SB.Entities.makePickup(e.x, e.y, 'ammo'));
              }
              dead = true;
              break;
            }
          }
          if (!dead) {
            for (let j = G.footCops.length - 1; j >= 0; j--) {
              const c = G.footCops[j];
              if (Math.hypot(c.x - b.x, c.y - b.y) < 15) {
                c.hp = (c.hp || 3) - b.dmg;
                burst(b.x, b.y, 5, '#ffd94d');
                if (c.hp <= 0) {
                  G.footCops.splice(j, 1);
                  burst(c.x, c.y, 10, '#2c3e50');
                }
                dead = true;
                break;
              }
            }
          }
          if (!dead) {
            for (const bd of G.city.buildings) {
              if (b.x > bd.x - 2 && b.x < bd.x + bd.w + 2 && b.y > bd.y - 2 && b.y < bd.y + bd.h + 2) {
                burst(b.x, b.y, 4, '#c9c9c9');
                dead = true;
                break;
              }
            }
          }
        } else {
          if (Math.hypot(G.player.x - b.x, G.player.y - b.y) < 15 && !G.car) {
            G.hp -= b.dmg;
            burst(b.x, b.y, 6, '#e74c3c');
            G.shake = Math.min(8, G.shake + 3);
            dead = true;
            if (G.hp <= 0) {
              G.hp = 0;
              wasted();
            }
          }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const p = G.pickups[i];
      if (Math.hypot(p.x - G.player.x, p.y - G.player.y) < 32) {
        if (p.kind === 'ammo') {
          G.ammo += 12;
          note('Ammo +12');
        } else {
          G.hp = Math.min(100, G.hp + 40);
          note('Health +40');
        }
        SB.Audio.blip(980, 0.1);
        G.pickups.splice(i, 1);
      }
    }
  }

  function updateStashes(dt) {
    for (const s of G.stashes) {
      if (!s.found && Math.hypot(s.x - G.player.x, s.y - G.player.y) < 36) {
        s.found = true;
        G.stashesFound += 1;
        G.money += 100;
        note('Hidden stash found  +$100  (' + G.stashesFound + '/3)');
        SB.Audio.blip(1180, 0.14);
        save();
      }
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
    for (let i = G.skids.length - 1; i >= 0; i--) {
      G.skids[i].t -= dt;
      if (G.skids[i].t <= 0) G.skids.splice(i, 1);
    }
  }

  function burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = G.rng.next() * Math.PI * 2;
      const sp = 60 + G.rng.next() * 160;
      G.particles.push(SB.Entities.makeParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + G.rng.next() * 0.3, color, 2 + G.rng.next() * 3));
    }
  }

  function busted() {
    if (G.state !== 'playing') return;
    G.state = 'busted';
    G.started = false;
    showOverlay('overlay-dead', 'BUSTED', 'The police caught you. Try the mission again.');
    save();
  }

  function wasted() {
    if (G.state !== 'playing') return;
    G.state = 'wasted';
    G.started = false;
    showOverlay('overlay-dead', 'WASTED', 'You ran out of health. Try the mission again.');
    save();
  }

  // --- the driver API ------------------------------------------------------
  function state() {
    const carsNear = [];
    for (const c of G.cars) {
      const d = Math.hypot(c.x - G.player.x, c.y - G.player.y);
      if (d < 700) carsNear.push({ x: c.x, y: c.y, d: d, parked: !!c.parked });
    }
    carsNear.sort(function (a, b) { return a.d - b.d; });
    return {
      started: G.started,
      money: G.money,
      missionIndex: G.missionIndex,
      stage: G.stage,
      wanted: G.wanted,
      patrol: G.patrols.length,
      cops: G.footCops.length,
      hp: G.hp,
      ammo: G.ammo,
      kills: G.kills,
      enemies: G.enemies.map(function (e) { return { x: e.x, y: e.y, hp: e.hp }; }),
      footCops: G.footCops.map(function (c) { return { x: c.x, y: c.y }; }),
      pickups: G.pickups.map(function (p) { return { x: p.x, y: p.y, kind: p.kind }; }),
      carsNear: carsNear.slice(0, 12),
      marker: { x: G.marker.x, y: G.marker.y },
      px: G.player.x,
      py: G.player.y,
      carAngle: G.car ? G.car.angle : G.player.angle,
      carSpeed: G.car ? Math.round(Math.abs(G.car.speed)) : 0,
      inCar: !!G.car,
      cam: { x: G.cam.x, y: G.cam.y },
      state: G.state,
      storyComplete: G.storyComplete,
      paused: G.paused,
    };
  }

  // --- screenshot staging --------------------------------------------------
  function setupShot(shot) {
    resetWorld();
    G.started = true;
    G.state = 'playing';
    G.storyComplete = false;
    if (shot === 'walk') {
      G.money = 50;
      G.missionIndex = 0;
      G.stage = 0;
      G.player.x = 1280;
      G.player.y = 900;
      G.player.angle = -Math.PI / 2;
      // A busy downtown: extra pedestrians and cars around the player.
      for (let i = 0; i < 10; i++) {
        G.peds.push(SB.Entities.makePed({ x: 1180 + G.rng.range(0, 220), y: 820 + G.rng.range(0, 220), angle: G.rng.range(0, 6.28), speed: 40, shirt: '#e74c3c' }));
      }
      const near = SB.Entities.makeCar({ x: 1230, y: 1010, angle: 0, type: 'sedan', color: '#2e86c1', parked: false });
      G.cars.push(near);
    } else if (shot === 'drive') {
      G.money = 350;
      G.missionIndex = 1;
      G.stage = 0;
      const c = SB.Entities.makeCar({ x: 640, y: 640, angle: 0, type: 'sedan', color: '#c0392b', parked: false });
      c.speed = 230;
      G.cars.push(c);
      G.car = c;
      G.player.x = c.x;
      G.player.y = c.y;
      G.player.angle = 0;
    } else if (shot === 'chase') {
      G.money = 1650;
      G.missionIndex = 3;
      G.stage = 1;
      G.wanted = 3;
      const c = SB.Entities.makeCar({ x: 1280, y: 1280, angle: Math.PI / 2, type: 'sports', color: '#f7c948', parked: false });
      c.speed = 260;
      G.cars.push(c);
      G.car = c;
      G.player.x = c.x;
      G.player.y = c.y;
      G.player.angle = Math.PI / 2;
      const p1 = SB.Entities.makeCop(1180, 1200, true);
      p1.speed = 240;
      p1.angle = Math.PI / 4;
      G.patrols.push(p1);
      const p2 = SB.Entities.makeCop(1400, 1380, true);
      p2.speed = 240;
      p2.angle = -Math.PI * 0.75;
      G.patrols.push(p2);
      G.footCops.push(SB.Entities.makeCop(1240, 1180, false));
      G.footCops.push(SB.Entities.makeCop(1360, 1330, false));
    } else if (shot === 'mission') {
      G.money = 850;
      G.missionIndex = 2;
      G.stage = 0;
      G.ammo = 24;
      G.player.x = 1600;
      G.player.y = 900;
      G.player.angle = Math.PI / 2;
      const P = SB.City.PLACES.turf;
      const offs = [[-90, -70], [80, -90], [-70, 90], [90, 70]];
      for (const o of offs) G.enemies.push(SB.Entities.makeEnemy(P.x + o[0], P.y + o[1]));
      G.gangSpawned = true;
    }
    updateMarker();
    centerCamera(true);
  }

  // --- overlays and buttons --------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function showOverlay(id, title, sub) {
    const overlays = ['overlay-title', 'overlay-pause', 'overlay-end', 'overlay-dead'];
    for (const o of overlays) el(o).classList.add('hidden');
    const box = el(id);
    if (title) {
      const t = box.querySelector('h1');
      if (t) t.textContent = title;
      const s = box.querySelector('p');
      if (s && sub) s.textContent = sub;
    }
    box.classList.remove('hidden');
  }
  function hideOverlays() {
    const overlays = ['overlay-title', 'overlay-pause', 'overlay-end', 'overlay-dead'];
    for (const o of overlays) el(o).classList.add('hidden');
  }

  function togglePause() {
    if (G.state !== 'playing' && !G.paused) return;
    G.paused = !G.paused;
    if (G.paused) {
      showOverlay('overlay-pause');
      save();
    } else {
      hideOverlays();
    }
  }

  function restartMission() {
    G.money = G.missionStartMoney;
    G.hp = 100;
    G.ammo = 24;
    G.wanted = 0;
    G.stage = 0;
    G.kills = 0;
    G.gangSpawned = false;
    G.guardsSpawned = false;
    G.enemies.length = 0;
    clearPolice();
    if (G.car) { G.car.parked = true; G.car.speed = 0; G.car = null; }
    G.player.x = SB.City.PLACES.start.x;
    G.player.y = SB.City.PLACES.start.y;
    G.state = 'playing';
    G.paused = false;
    hideOverlays();
    updateMarker();
    centerCamera(true);
  }

  function quitToTitle() {
    G.started = false;
    G.state = 'title';
    G.paused = false;
    save();
    refreshTitle();
    showOverlay('overlay-title');
  }

  function refreshTitle() {
    const cont = el('btn-continue');
    if (loadSave()) cont.classList.remove('hidden');
    else cont.classList.add('hidden');
  }

  function init() {
    const canvas = el('game');
    const ctx = canvas.getContext('2d');
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    resetWorld();
    G.state = 'title';
    G.started = false;
    // Input: keyboard.
    window.addEventListener('keydown', function (e) {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
      G.keys[k] = true;
      if (k === 'p' || k === 'escape') togglePause();
      if (k === 'e' && G.state === 'playing' && !G.paused) {
        if (G.car) exitCar();
        else enterCar();
        updateMarker();
      }
      if (k === 'enter' && G.state === 'title') {
        resetRun();
        hideOverlays();
      }
    });
    window.addEventListener('keyup', function (e) {
      G.keys[e.key.toLowerCase()] = false;
    });
    canvas.addEventListener('mousedown', function (e) {
      if (G.state !== 'playing' || G.paused) return;
      const r = canvas.getBoundingClientRect();
      G.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      G.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      G.mouse.down = true;
      if (!G.car) {
        G.firing = true;
        G.fireT = 0;
        SB.Audio.ensure();
      }
    });
    window.addEventListener('mouseup', function () {
      G.mouse.down = false;
      G.firing = false;
    });
    canvas.addEventListener('mousemove', function (e) {
      const r = canvas.getBoundingClientRect();
      G.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      G.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    el('btn-start').addEventListener('click', function () {
      SB.Audio.ensure();
      resetRun();
      hideOverlays();
    });
    el('btn-continue').addEventListener('click', function () {
      SB.Audio.ensure();
      if (continueSave()) {
        if (G.storyComplete) showOverlay('overlay-end');
        else hideOverlays();
      }
    });
    el('btn-resume').addEventListener('click', togglePause);
    el('btn-restart').addEventListener('click', restartMission);
    el('btn-quit').addEventListener('click', quitToTitle);
    el('btn-again').addEventListener('click', function () {
      resetRun();
      hideOverlays();
    });
    el('btn-retry').addEventListener('click', function () {
      restartMission();
    });
    window.__game = { state: state, G: G };
    if (shot) {
      setupShot(shot);
    } else {
      refreshTitle();
      showOverlay('overlay-title');
      centerCamera(true);
    }
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (G.state === 'playing' && !G.paused) update(dt);
      else G.time += dt;
      SB.Render.draw(ctx, G, VIEW_W, VIEW_H);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  SB.Game = { G: G, init: init, state: state };
  document.addEventListener('DOMContentLoaded', init);
})();
