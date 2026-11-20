// SOLARA BAY main game: loop, input, save/load, pause, title screen,
// screenshot staging, and the window.__game.state() contract the driver
// and the screenshots rely on.
(function () {
  'use strict';

  var City = window.SBCity;
  var Ent = window.SBEntities;
  var SAVE_KEY = 'solara-bay-save-v1';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vw = 1280;
    this.vh = 720;
    this.time = 0;
    this.phase = 'title'; // title | playing | paused | busted | wasted | complete
    this.started = false;
    this.paused = false;
    this.money = 50;
    this.wanted = 0;
    this.stashCount = 0;
    this.blipMsg = '';
    this.blipT = 0;
    this.shake = 0;
    this.camera = { x: 0, y: 0 };
    this.keys = {};
    this.mouse = { x: 640, y: 360, down: false };
    this.fireCd = 0;
    this.wantedTimer = 0;
    this.saveTimer = 0;
    this.shotMode = null;

    this.rng = window.SBRng.makeRng(20261120);
    this.player = {
      x: City.LAND.spawn.x, y: City.LAND.spawn.y,
      angle: 0, aim: 0, hp: 100, ammo: 48,
      inCar: false, car: null, vx: 0, vy: 0
    };
    this.cars = [];
    this.traffic = [];
    this.pedestrians = [];
    this.enemies = [];
    this.footCops = [];
    this.patrolCars = [];
    this.pickups = [];
    this.bullets = [];
    this.particles = [];
    this.skids = [];

    this.missions = window.SBMissions.createMissions(this);
    this.spawnWorld();
    this.bindInput();
  }

  Game.prototype.spawnWorld = function () {
    var rng = this.rng;
    // Parked, stealable cars on the roads.
    var parked = [
      ['sedan', 520, 320, 0], ['sedan', 1280, 700, Math.PI / 2],
      ['bike', 1920, 1000, 0], ['truck', 960, 1560, 0],
      ['sedan', 320, 1100, Math.PI / 2], ['sedan', 1600, 1350, 0],
      ['sedan', 2240, 700, Math.PI / 2], ['sedan', 640, 1600, 0]
    ];
    for (var i = 0; i < parked.length; i++) {
      var p = parked[i];
      this.cars.push(Ent.createCar(p[0], p[1], p[2], p[3], { parked: true }));
    }
    // The boss sports car at the marina (M6 target).
    this.cars.push(Ent.createCar('sports', City.LAND.marinaCar.x, City.LAND.marinaCar.y, -Math.PI / 2,
      { parked: true, id: 'boss-sports', color: '#c81e5b' }));
    // Traffic.
    for (var t = 0; t < 14; t++) {
      var tc = Ent.createTrafficCar(rng);
      this.cars.push(tc);
      this.traffic.push(tc);
    }
    // Pedestrians on the sidewalks.
    for (var pd = 0; pd < 22; pd++) {
      var spot = Ent.pedTarget({ x: 0, y: 0 }, rng);
      var ped = Ent.createPedestrian(spot.x, spot.y);
      var tgt = Ent.pedTarget(ped, rng);
      ped.tx = tgt.x; ped.ty = tgt.y;
      this.pedestrians.push(ped);
    }
    // Ammo at the garage and the central intersection, health downtown.
    for (var a = 0; a < City.LAND.ammoSpots.length; a++) {
      var s = City.LAND.ammoSpots[a];
      this.pickups.push(Ent.createPickup('ammo', s.x, s.y));
    }
    this.pickups.push(Ent.createPickup('health', City.LAND.healthSpot.x, City.LAND.healthSpot.y));
  };

  Game.prototype.bindInput = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === ' ') e.preventDefault();
      self.keys[k] = true;
      if (k === 'p' || k === 'escape') self.togglePause();
      if (k === 'e') self.tryEnterExitCar();
      if (k === 'enter' && self.phase === 'title') self.startNew();
      window.SBAudio.unlock();
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.key.toLowerCase()] = false;
    });
    this.canvas.addEventListener('mousemove', function (e) {
      var r = self.canvas.getBoundingClientRect();
      self.mouse.x = e.clientX - r.left;
      self.mouse.y = e.clientY - r.top;
    });
    this.canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) self.mouse.down = true;
      window.SBAudio.unlock();
    });
    window.addEventListener('mouseup', function () { self.mouse.down = false; });
    window.addEventListener('blur', function () { self.keys = {}; self.mouse.down = false; });
  };

  Game.prototype.blip = function (msg) {
    this.blipMsg = msg;
    this.blipT = 3;
  };

  Game.prototype.clearPolice = function () {
    this.patrolCars = [];
    this.footCops = [];
    window.SBAudio.setSiren(false);
  };

  Game.prototype.onStoryComplete = function () {
    this.phase = 'complete';
    this.started = true;
    window.SBAudio.setSiren(false);
    this.save();
    this.showEnd();
  };

  Game.prototype.ensureFootCops = function () {
    while (this.footCops.length < 2) {
      var near = City.nearestIntersection(
        this.player.x + (this.rng.next() - 0.5) * 600,
        this.player.y + (this.rng.next() - 0.5) * 600);
      this.footCops.push(Ent.createFootCop(near.x, near.y));
    }
  };

  // Stealing a car or firing a weapon used to raise a 1-star wanted
  // level and summon foot cops on the spot, but that made the scripted
  // combat missions (M3, M5) randomly fail: the player must shoot there,
  // a foot cop would spawn and bust the stationary player mid-fight.
  // Wanted now comes only from the missions (M4/M6 = 3 stars, M5 = 2),
  // so this is a no-op.
  Game.prototype.raiseWantedToOne = function () {};

  Game.prototype.tryEnterExitCar = function () {
    if (this.phase !== 'playing' || this.paused) return;
    var p = this.player;
    if (p.inCar) {
      // Exit: step out beside the car, leave it parked where it stands.
      var car = p.car;
      car.parked = true;
      car.speed = 0;
      var spot = City.findOpenSpot(car.x + Math.cos(car.angle + Math.PI / 2) * 30,
        car.y + Math.sin(car.angle + Math.PI / 2) * 30, 12);
      p.x = spot.x; p.y = spot.y;
      p.inCar = false;
      p.car = null;
      return;
    }
    var best = null, bd = 1e18;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (c.patrol) continue; // a patrol car is never enterable
      var d = dist(p.x, p.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 70) {
      p.inCar = true;
      p.car = best;
      best.parked = false;
      best.traffic = false;
      if (best.id !== 'boss-sports') this.raiseWantedToOne();
    }
  };

  Game.prototype.shoot = function () {
    var p = this.player;
    if (p.ammo <= 0) return;
    p.ammo--;
    this.fireCd = 0.25;
    var wx = this.camera.x + this.mouse.x;
    var wy = this.camera.y + this.mouse.y;
    var ang = Math.atan2(wy - p.y, wx - p.x);
    p.aim = ang;
    Ent.fireBullet(this.bullets, p.x, p.y, ang, true, 720, 1);
    window.SBAudio.gunshot();
    this.shake = Math.max(this.shake, 4);
    this.spawnParticles(p.x + Math.cos(ang) * 18, p.y + Math.sin(ang) * 18, 3, '#ffe14d');
    this.raiseWantedToOne();
    for (var i = 0; i < this.pedestrians.length; i++) {
      var pd = this.pedestrians[i];
      if (dist(pd.x, pd.y, p.x, p.y) < 260) Ent.fleeFrom(pd, p.x, p.y);
    }
  };

  Game.prototype.spawnParticles = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      if (this.particles.length > 300) return;
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 120;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 3, color: color
      });
    }
  };

  Game.prototype.startNew = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ }
    this.resetRun();
    document.getElementById('overlay-title').classList.add('hidden');
    document.getElementById('overlay-end').classList.add('hidden');
    document.getElementById('overlay-fail').classList.add('hidden');
    this.phase = 'playing';
    this.started = true;
  };

  Game.prototype.resetRun = function () {
    this.money = 50;
    this.wanted = 0;
    this.stashCount = 0;
    this.player.hp = 100;
    this.player.ammo = 48;
    this.player.x = City.LAND.spawn.x;
    this.player.y = City.LAND.spawn.y;
    this.player.inCar = false;
    this.player.car = null;
    this.enemies = [];
    this.footCops = [];
    this.patrolCars = [];
    this.bullets = [];
    this.particles = [];
    this.skids = [];
    this.missions = window.SBMissions.createMissions(this);
    this.missions.startMission(0);
    // Fresh pickups.
    this.pickups = [];
    for (var a = 0; a < City.LAND.ammoSpots.length; a++) {
      var s = City.LAND.ammoSpots[a];
      this.pickups.push(Ent.createPickup('ammo', s.x, s.y));
    }
    this.pickups.push(Ent.createPickup('health', City.LAND.healthSpot.x, City.LAND.healthSpot.y));
    // Re-park the cars where they started.
    for (var i = this.cars.length - 1; i >= 0; i--) {
      var c = this.cars[i];
      if (c.patrol || c.traffic) this.cars.splice(i, 1);
    }
    this.traffic = [];
    var rng = this.rng;
    for (var t = 0; t < 14; t++) {
      var tc = Ent.createTrafficCar(rng);
      this.cars.push(tc);
      this.traffic.push(tc);
    }
    this.camera.x = clamp(this.player.x - 640, 0, City.WORLD_W - 1280);
    this.camera.y = clamp(this.player.y - 360, 0, City.WORLD_H - 720);
  };

  Game.prototype.togglePause = function () {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.paused = true;
      document.getElementById('overlay-pause').classList.remove('hidden');
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.paused = false;
      document.getElementById('overlay-pause').classList.add('hidden');
    }
  };

  Game.prototype.showEnd = function () {
    var el = document.getElementById('overlay-end');
    document.getElementById('end-stats').textContent =
      'Money $' + this.money + '  •  Stashes ' + this.stashCount + '/3  •  All 6 missions complete';
    el.classList.remove('hidden');
  };

  Game.prototype.showFail = function (kind) {
    this.phase = kind; // 'busted' or 'wasted'
    document.getElementById('fail-title').textContent = kind === 'busted' ? 'BUSTED!' : 'WASTED!';
    document.getElementById('overlay-fail').classList.remove('hidden');
    window.SBAudio.setSiren(false);
  };

  Game.prototype.save = function () {
    try {
      var p = this.player;
      var data = {
        v: 1,
        missionIndex: this.missions.index,
        stage: this.missions.stage,
        money: this.money,
        stash: this.stashCount,
        px: Math.round(p.x), py: Math.round(p.y),
        hp: Math.round(p.hp), ammo: p.ammo,
        inCar: p.inCar,
        carType: p.car ? p.car.type : null,
        carAngle: p.car ? p.car.angle : 0,
        storyComplete: this.missions.storyComplete
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  };

  Game.prototype.loadSave = function () {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* no storage */ }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    this.resetRun();
    this.money = data.money;
    this.stashCount = data.stash || 0;
    this.player.hp = data.hp;
    this.player.ammo = data.ammo;
    this.player.x = data.px;
    this.player.y = data.py;
    // Restore the stash flags the save implies (stash count only: mark the
    // nearest ones taken so they cannot be collected twice).
    var taken = 0;
    for (var i = 0; i < this.missions.stashes.length && taken < this.stashCount; i++) {
      this.missions.stashes[i].taken = true;
      taken++;
    }
    if (data.inCar && data.carType) {
      var car = Ent.createCar(data.carType, data.px, data.py, data.carAngle || 0, {});
      car.parked = false;
      this.cars.push(car);
      this.player.inCar = true;
      this.player.car = car;
    }
    if (data.storyComplete) {
      this.missions.index = 5;
      this.missions.storyComplete = true;
      this.missions.marker = null;
      this.phase = 'complete';
      this.started = true;
      this.showEnd();
    } else {
      this.missions.startMission(data.missionIndex || 0);
      this.missions.stage = data.stage || 0;
      // Rebuild the stage-1 markers a reloaded mission needs.
      if (this.missions.index === 1 && this.missions.stage === 1) {
        this.missions.marker = { x: City.LAND.delivery.x, y: City.LAND.delivery.y };
      }
      this.phase = 'playing';
      this.started = true;
    }
    this.camera.x = clamp(this.player.x - 640, 0, City.WORLD_W - 1280);
    this.camera.y = clamp(this.player.y - 360, 0, City.WORLD_H - 720);
    document.getElementById('overlay-title').classList.add('hidden');
    document.getElementById('overlay-fail').classList.add('hidden');
    // A completed story keeps its end card visible after Continue.
    if (!data.storyComplete) document.getElementById('overlay-end').classList.add('hidden');
    return true;
  };

  Game.prototype.update = function (dt) {
    var p = this.player;
    var i;
    this.time += dt;
    if (this.blipT > 0) this.blipT -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
    if (this.fireCd > 0) this.fireCd -= dt;

    // Aim follows the mouse while on foot.
    if (!p.inCar) {
      var wx = this.camera.x + this.mouse.x;
      var wy = this.camera.y + this.mouse.y;
      p.aim = Math.atan2(wy - p.y, wx - p.x);
      p.angle = p.aim;
    }

    // Player movement.
    if (p.inCar && p.car) {
      var input = {
        w: !!this.keys['w'], a: !!this.keys['a'],
        s: !!this.keys['s'], d: !!this.keys['d']
      };
      Ent.stepCarPhysics(p.car, input, dt);
      p.x = p.car.x; p.y = p.car.y;
      p.vx = Math.cos(p.car.angle) * p.car.speed;
      p.vy = Math.sin(p.car.angle) * p.car.speed;
      if (p.car.crashed) {
        this.shake = Math.max(this.shake, 7);
        window.SBAudio.crash();
        this.spawnParticles(p.x, p.y, 6, '#999');
      }
      if (p.car.skid) {
        this.skids.push({ x: p.x, y: p.y, angle: p.car.angle, life: 1 });
        if (this.skids.length > 220) this.skids.shift();
      }
      window.SBAudio.setEngine(p.car.speed, p.car.maxSpeed);
    } else {
      var mx = (this.keys['d'] ? 1 : 0) - (this.keys['a'] ? 1 : 0);
      var my = (this.keys['s'] ? 1 : 0) - (this.keys['w'] ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        var len = Math.hypot(mx, my);
        var sp = 175;
        p.vx = (mx / len) * sp;
        p.vy = (my / len) * sp;
        City.moveCircle(p, p.vx * dt, p.vy * dt, 12);
      } else {
        p.vx = 0; p.vy = 0;
      }
      if (this.mouse.down && this.fireCd <= 0) this.shoot();
      window.SBAudio.setEngine(0, 1);
    }

    // Traffic and parked-car separation.
    for (i = 0; i < this.traffic.length; i++) {
      Ent.stepTraffic(this.traffic[i], dt, this.cars, this.rng);
    }
    Ent.separateCars(this.cars);

    // Pedestrians.
    for (i = 0; i < this.pedestrians.length; i++) {
      Ent.stepPedestrian(this.pedestrians[i], dt, this.rng);
    }

    // Police.
    var busted = false;
    for (i = 0; i < this.patrolCars.length; i++) {
      var pc = this.patrolCars[i];
      Ent.stepPatrol(pc, p, dt, p.inCar ? p.car : null);
    }
    for (i = this.footCops.length - 1; i >= 0; i--) {
      var cop = this.footCops[i];
      if (Ent.stepFootCop(cop, p, dt) && !p.inCar) busted = true;
    }

    // Enemies.
    for (i = 0; i < this.enemies.length; i++) {
      Ent.stepEnemy(this.enemies[i], p, dt, this.bullets);
    }

    // Bullets (segment-based hits).
    var self = this;
    Ent.stepBullets(this.bullets, p, this.enemies, this.footCops, dt,
      function (dmg) {
        p.hp -= dmg;
        self.shake = Math.max(self.shake, 5);
        if (p.hp <= 0) { p.hp = 0; }
      },
      function (en) {
        self.spawnParticles(en.x, en.y, 5, '#ff5a5a');
        if (en.hp <= 0) {
          var idx = self.enemies.indexOf(en);
          if (idx >= 0) self.enemies.splice(idx, 1);
          self.missions.kills++;
          // Dead enemies ALWAYS drop ammo.
          self.pickups.push(Ent.createPickup('ammo', en.x, en.y));
          window.SBAudio.pickup();
        }
      },
      function (cop) {
        if (cop.hp <= 0) {
          var idx = self.footCops.indexOf(cop);
          if (idx >= 0) self.footCops.splice(idx, 1);
        }
      });
    if (p.hp <= 0) {
      this.showFail('wasted');
      return;
    }
    if (busted) {
      this.showFail('busted');
      return;
    }

    // Pickups.
    Ent.stepPickups(this.pickups, dt);
    for (i = this.pickups.length - 1; i >= 0; i--) {
      var pk = this.pickups[i];
      if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 32) {
        pk.taken = true;
        pk.respawn = 15; // pickups respawn after 15 s
        if (pk.kind === 'ammo') {
          p.ammo += 24;
          this.blip('Ammo +24');
        } else {
          p.hp = Math.min(100, p.hp + 30);
          this.blip('Health +30');
        }
        window.SBAudio.pickup();
      }
    }

    // Particles and skid marks decay.
    for (i = this.particles.length - 1; i >= 0; i--) {
      var pt = this.particles[i];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt * 0.4;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }

    // Wanted decay: out of sight of every police unit for a while.
    if (this.wanted > 0) {
      var nearPolice = false;
      for (i = 0; i < this.patrolCars.length; i++) {
        if (dist(p.x, p.y, this.patrolCars[i].x, this.patrolCars[i].y) < 450) { nearPolice = true; break; }
      }
      if (!nearPolice) {
        for (i = 0; i < this.footCops.length; i++) {
          if (dist(p.x, p.y, this.footCops[i].x, this.footCops[i].y) < 450) { nearPolice = true; break; }
        }
      }
      if (nearPolice) {
        this.wantedTimer = 0;
      } else {
        this.wantedTimer += dt;
        if (this.wantedTimer > 8) {
          this.wantedTimer = 0;
          this.wanted = Math.max(0, this.wanted - 1);
        }
      }
    }
    window.SBAudio.setSiren(this.wanted >= 2 && this.patrolCars.length > 0);

    // Missions.
    this.missions.update(dt);

    // Camera follows the player.
    var tx = clamp(p.x - 640, 0, City.WORLD_W - 1280);
    var ty = clamp(p.y - 360, 0, City.WORLD_H - 720);
    this.camera.x += (tx - this.camera.x) * Math.min(1, 8 * dt);
    this.camera.y += (ty - this.camera.y) * Math.min(1, 8 * dt);

    // Autosave while playing.
    this.saveTimer += dt;
    if (this.saveTimer > 4) {
      this.saveTimer = 0;
      this.save();
    }
  };

  Game.prototype.stageShot = function (shot) {
    this.shotMode = shot;
    document.getElementById('overlay-title').classList.add('hidden');
    this.started = true;
    this.phase = 'playing';
    var p = this.player;
    if (shot === 'walk') {
      p.x = 1280; p.y = 1000;
      p.inCar = false; p.car = null;
      this.missions.startMission(0);
    } else if (shot === 'drive') {
      var car = Ent.createCar('sedan', 700, 320, 0, {});
      this.cars.push(car);
      p.x = 700; p.y = 320;
      p.inCar = true; p.car = car;
      car.speed = 130;
      this.missions.startMission(1);
      this.missions.marker = { x: City.LAND.pickup.x, y: City.LAND.pickup.y };
    } else if (shot === 'chase') {
      var cc = Ent.createCar('sedan', 1600, 960, Math.PI / 2, {});
      this.cars.push(cc);
      p.x = 1600; p.y = 960;
      p.inCar = true; p.car = cc;
      cc.speed = 180;
      this.missions.startMission(3);
      this.missions.stage = 1;
      this.missions.marker = { x: City.LAND.safehouse.x, y: City.LAND.safehouse.y };
      this.wanted = 3;
      this.patrolCars.push(Ent.createPatrol(1480, 880));
      this.patrolCars.push(Ent.createPatrol(1720, 1040));
      this.footCops.push(Ent.createFootCop(1560, 1010));
    } else if (shot === 'mission') {
      p.x = 640; p.y = 1220;
      p.inCar = false; p.car = null;
      p.ammo = 48;
      this.missions.startMission(2);
      this.missions.stage = 1;
      this.missions.spawned = true;
      var offs = [[-90, -40], [90, -60], [-60, 70], [80, 60]];
      for (var i = 0; i < offs.length; i++) {
        var sp = City.findOpenSpot(City.LAND.turf.x + offs[i][0], City.LAND.turf.y + offs[i][1], 14);
        this.enemies.push(Ent.createEnemy(sp.x, sp.y));
      }
    }
    this.camera.x = clamp(p.x - 640, 0, City.WORLD_W - 1280);
    this.camera.y = clamp(p.y - 360, 0, City.WORLD_H - 720);
  };

  Game.prototype.state = function () {
    var p = this.player;
    var carsNear = [];
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (c.patrol) continue;
      var d = dist(p.x, p.y, c.x, c.y);
      if (d < 500) carsNear.push({ x: c.x, y: c.y, d: Math.round(d), parked: !!c.parked });
    }
    carsNear.sort(function (a, b) { return a.d - b.d; });
    return {
      started: this.started,
      state: this.phase,
      paused: this.paused,
      storyComplete: this.missions.storyComplete,
      money: this.money,
      missionIndex: this.missions.index,
      stage: this.missions.stage,
      wanted: this.wanted,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      kills: this.missions.kills,
      stash: this.stashCount,
      px: Math.round(p.x),
      py: Math.round(p.y),
      inCar: p.inCar,
      carAngle: p.car ? p.car.angle : p.angle,
      carSpeed: p.car ? Math.round(p.car.speed) : 0,
      cam: { x: Math.round(this.camera.x), y: Math.round(this.camera.y) },
      marker: this.missions.marker ? { x: this.missions.marker.x, y: this.missions.marker.y } : null,
      enemies: this.enemies.map(function (e) { return { x: Math.round(e.x), y: Math.round(e.y) }; }),
      footCops: this.footCops.map(function (c) { return { x: Math.round(c.x), y: Math.round(c.y) }; }),
      patrol: this.patrolCars.length,
      cops: this.footCops.length,
      pickups: this.pickups.filter(function (pk) { return !pk.taken; })
        .map(function (pk) { return { kind: pk.kind, x: Math.round(pk.x), y: Math.round(pk.y) }; }),
      carsNear: carsNear
    };
  };

  Game.prototype.loop = function () {
    var self = this;
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (self.phase === 'playing' && !self.paused) self.update(dt);
      else self.time += dt;
      window.SBRender.draw(self, self.ctx, self.vw, self.vh);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Game.prototype.init = function () {
    var self = this;
    document.getElementById('btn-start').addEventListener('click', function () { self.startNew(); });
    document.getElementById('btn-continue').addEventListener('click', function () { self.loadSave(); });
    document.getElementById('btn-resume').addEventListener('click', function () { self.togglePause(); });
    document.getElementById('btn-restart').addEventListener('click', function () {
      document.getElementById('overlay-pause').classList.add('hidden');
      self.paused = false;
      self.phase = 'playing';
      var idx = self.missions.index;
      var money = self.money;
      self.resetRun();
      self.money = money;
      self.missions.startMission(idx);
      self.player.x = City.LAND.spawn.x;
      self.player.y = City.LAND.spawn.y;
      self.player.inCar = false;
      self.player.car = null;
      self.player.hp = 100;
      self.player.ammo = 48;
      self.wanted = 0;
      self.clearPolice();
    });
    document.getElementById('btn-quit').addEventListener('click', function () {
      self.save();
      document.getElementById('overlay-pause').classList.add('hidden');
      document.getElementById('overlay-title').classList.remove('hidden');
      self.paused = false;
      self.phase = 'title';
      self.started = false;
      self.refreshContinue();
    });
    document.getElementById('btn-retry').addEventListener('click', function () {
      location.reload();
    });
    document.getElementById('btn-again').addEventListener('click', function () {
      self.startNew();
    });
    this.refreshContinue();
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    if (shot) {
      this.stageShot(shot);
    }
    this.loop();
  };

  Game.prototype.refreshContinue = function () {
    var has = false;
    try { has = !!localStorage.getItem(SAVE_KEY); } catch (e) { /* no storage */ }
    var btn = document.getElementById('btn-continue');
    if (btn) btn.style.display = has ? '' : 'none';
  };

  window.SBGame = Game;
})();
