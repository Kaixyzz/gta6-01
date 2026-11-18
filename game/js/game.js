// game.js — boot, input, the main loop, mission progression, wanted decay,
// save / load, the screenshot staging modes, and the automation hook
// window.__game.state() that the playthrough driver reads.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  var SAVE_KEY = 'solara-bay-save-v1';
  var START_X = 320, START_Y = 380;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  // ---------------------------------------------------------- state

  function newGame() {
    var G = {
      time: 0,
      started: false,
      paused: false,
      state: 'playing',       // playing | busted | wasted | complete
      storyComplete: false,
      money: 50,
      hp: 100,
      ammo: 24,
      missionIndex: 0,
      stage: 0,
      kills: 0,
      gangSpawned: false,
      wanted: 0,
      lastCrime: -999,
      wantedTimer: 0,
      chaseLock: false,
      lastPedHit: -99,
      lastShotCrime: -99,
      lastSpeedCrime: -99,
      saveT: 0,
      toastUntil: 0,
      shotMode: null,
      shotDrive: false,
      player: { x: START_X, y: START_Y, angle: 0, inCar: false, car: null },
      keys: {},
      mouse: { x: 640, y: 360 },
      cam: { x: 0, y: 0 },
      rng: SB.mulberry32(SB.SEED + 101),
      city: null,
      cars: [], peds: [], cops: [], patrols: [],
      enemies: [], bullets: [], ebullets: [], pickups: [], parts: []
    };
    SB.spawnWorld(G);
    return G;
  }

  var G = newGame();

  // ---------------------------------------------------------- toasts

  SB.toast = function (G, msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    show(el);
    G.toastUntil = G.time + 2.5;
  };

  SB.onBusted = function (G) {
    $('dead-title').textContent = 'Busted';
    show($('overlay-dead'));
  };

  SB.onWasted = function (G) {
    $('dead-title').textContent = 'Wasted';
    show($('overlay-dead'));
  };

  // ---------------------------------------------------------- save/load

  function saveGame() {
    if (G.shotMode) return;
    try {
      var data = {
        v: 1,
        missionIndex: G.missionIndex,
        stage: G.stage,
        money: G.money,
        hp: G.hp,
        ammo: G.ammo,
        kills: G.kills,
        px: G.player.x,
        py: G.player.y,
        carId: G.player.car ? G.player.car.id : null,
        storyComplete: G.storyComplete,
        wanted: G.wanted
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* saving is best-effort */ }
  }

  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function applySave(d) {
    G.missionIndex = d.missionIndex || 0;
    G.stage = d.stage || 0;
    G.money = d.money != null ? d.money : 50;
    G.hp = d.hp != null ? d.hp : 100;
    G.ammo = d.ammo != null ? d.ammo : 24;
    G.kills = d.kills || 0;
    G.wanted = d.wanted || 0;
    G.storyComplete = !!d.storyComplete;
    if (G.missionIndex === 2 && G.kills < 4) G.gangSpawned = false;
    if (d.carId) {
      for (var i = 0; i < G.cars.length; i++) {
        if (G.cars[i].id === d.carId) {
          var car = G.cars[i];
          car.parked = true;
          car.speed = 0;
          car.x = d.px;
          car.y = d.py;
          break;
        }
      }
      G.player.x = d.px + 36;
      G.player.y = d.py;
    } else {
      G.player.x = d.px;
      G.player.y = d.py;
    }
    G.player.inCar = false;
    G.player.car = null;
    SB.resolveCircle(G.city, G.player, 14);
    if (G.storyComplete) {
      G.state = 'complete';
      $('end-stats').textContent = 'Money $' + G.money + ' · all four jobs finished.';
      show($('overlay-end'));
    }
  }

  // ---------------------------------------------------------- missions

  function completeMission() {
    var m = SB.MISSIONS[G.missionIndex];
    G.money += m.reward;
    SB.toast(G, m.title + ' complete! +$' + m.reward);
    SB.audio.missionDone();
    if (G.missionIndex === 3) {
      G.storyComplete = true;
      G.state = 'complete';
      G.chaseLock = false;
      $('end-stats').textContent = 'Money $' + G.money + ' · all four jobs finished.';
      show($('overlay-end'));
      saveGame();
      return;
    }
    G.missionIndex++;
    G.stage = 0;
    if (G.missionIndex === 2) {
      G.kills = 0;
      G.gangSpawned = false;
      G.enemies = [];
    }
    saveGame();
  }

  function checkMissions() {
    var marker = SB.missionMarker(G);
    if (!marker || G.storyComplete) return;
    var d = SB.dist(G.player.x, G.player.y, marker.x, marker.y);
    if (G.missionIndex === 0) {
      if (G.player.inCar && d < 85) completeMission();
    } else if (G.missionIndex === 1) {
      if (G.stage === 0 && d < 75) {
        G.stage = 1;
        SB.toast(G, 'Package collected — deliver it');
        SB.audio.pickup();
        saveGame();
      } else if (G.stage === 1 && d < 75) {
        completeMission();
      }
    } else if (G.missionIndex === 2) {
      if (!G.gangSpawned && d < 300) SB.spawnGang(G);
      if (G.kills >= 4) completeMission();
    } else if (G.missionIndex === 3) {
      if (G.stage === 0 && d < 75) {
        G.stage = 1;
        G.wanted = 3;
        G.chaseLock = true;
        G.lastCrime = G.time;
        SB.spawnChase(G);
        SB.toast(G, 'The police are onto you — run!');
        saveGame();
      } else if (G.stage === 1 && d < 85) {
        completeMission();
      }
    }
  }

  // ---------------------------------------------------------- flow

  function begin() {
    hide($('overlay-start'));
    hide($('overlay-pause'));
    show($('hud'));
    show($('mission-card'));
    show($('hint'));
    G.started = true;
    SB.audio.unlock();
  }

  function respawn() {
    hide($('overlay-dead'));
    G.state = 'playing';
    G.hp = 100;
    G.ammo = Math.max(G.ammo, 12);
    G.wanted = 0;
    G.chaseLock = false;
    G.stage = 0;
    G.kills = 0;
    G.gangSpawned = false;
    G.enemies = [];
    G.ebullets = [];
    G.cops = [];
    for (var i = G.patrols.length - 1; i >= 0; i--) {
      var idx = G.cars.indexOf(G.patrols[i]);
      if (idx >= 0) G.cars.splice(idx, 1);
    }
    G.patrols = [];
    if (G.player.inCar) SB.exitCar(G);
    G.player.x = START_X;
    G.player.y = START_Y;
    G.player.angle = 0;
    saveGame();
  }

  // ---------------------------------------------------------- input

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();
    SB.audio.unlock();
    if (e.repeat) return;
    G.keys[k] = true;
    if (!G.started) return;
    if (k === 'e' && !G.paused && G.state === 'playing') {
      if (G.player.inCar) SB.exitCar(G);
      else SB.enterCar(G);
    }
    if ((k === 'p' || k === 'escape') && G.state === 'playing') {
      G.paused = !G.paused;
      if (G.paused) {
        show($('overlay-pause'));
        saveGame();
      } else {
        hide($('overlay-pause'));
      }
    }
    if (k === 'm') SB.audio.setMuted(!SB.audio.isMuted());
  });

  window.addEventListener('keyup', function (e) {
    G.keys[e.key.toLowerCase()] = false;
  });

  window.addEventListener('blur', function () {
    G.keys = {};
  });

  canvas.addEventListener('mousemove', function (e) {
    var r = canvas.getBoundingClientRect();
    G.mouse.x = e.clientX - r.left;
    G.mouse.y = e.clientY - r.top;
  });

  canvas.addEventListener('mousedown', function (e) {
    SB.audio.unlock();
    if (!G.started || G.paused || G.state !== 'playing') return;
    if (e.button !== 0) return;
    var r = canvas.getBoundingClientRect();
    var sx = e.clientX - r.left;
    var sy = e.clientY - r.top;
    G.mouse.x = sx;
    G.mouse.y = sy;
    SB.firePlayerBullet(G, sx + G.cam.x, sy + G.cam.y);
  });

  $('btn-start').addEventListener('click', function () { begin(); });
  $('btn-continue').addEventListener('click', function () {
    var d = loadSave();
    if (d) applySave(d);
    begin();
  });
  $('btn-resume').addEventListener('click', function () {
    G.paused = false;
    hide($('overlay-pause'));
  });
  $('btn-again').addEventListener('click', function () {
    try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    window.location.reload();
  });
  $('btn-retry').addEventListener('click', respawn);

  // ---------------------------------------------------------- shots

  function takeShotCar(x, y, angle, speed) {
    var car = null;
    for (var i = 0; i < G.cars.length; i++) {
      if (G.cars[i].parked) { car = G.cars[i]; break; }
    }
    if (!car) return null;
    car.x = x;
    car.y = y;
    car.angle = angle;
    car.speed = speed;
    car.parked = false;
    car.traffic = false;
    car.owner = 'player';
    G.player.inCar = true;
    G.player.car = car;
    G.player.x = x;
    G.player.y = y;
    G.player.angle = angle;
    return car;
  }

  function setupShot(mode) {
    G.shotMode = mode;
    begin();
    if (mode === 'walk') {
      G.player.x = 1280;
      G.player.y = 880;
      G.player.angle = -Math.PI / 2;
    } else if (mode === 'drive') {
      takeShotCar(960, 700, Math.PI / 2, 260);
      G.shotDrive = true;
    } else if (mode === 'chase') {
      G.missionIndex = 3;
      G.stage = 1;
      G.money = 1650;
      G.wanted = 3;
      G.chaseLock = true;
      G.lastCrime = G.time;
      takeShotCar(1280, 960, 0, 300);
      G.shotDrive = true;
      SB.spawnChase(G);
      // Pull the chase in close so the screenshot reads at a glance:
      // one patrol ahead on the same street, one right behind, one
      // closing from the south, foot cops ahead on the sidewalks.
      if (G.patrols[0]) { G.patrols[0].x = 1420; G.patrols[0].y = 960; G.patrols[0].angle = 0; G.patrols[0].speed = 470; }
      if (G.patrols[1]) { G.patrols[1].x = 1140; G.patrols[1].y = 960; G.patrols[1].angle = 0; G.patrols[1].speed = 470; }
      if (G.patrols[2]) { G.patrols[2].x = 1280; G.patrols[2].y = 1100; G.patrols[2].angle = -Math.PI / 2; G.patrols[2].speed = 470; }
      if (G.cops[0]) { G.cops[0].x = 1700; G.cops[0].y = 920; }
      if (G.cops[1]) { G.cops[1].x = 1700; G.cops[1].y = 1000; }
    } else if (mode === 'mission') {
      G.missionIndex = 1;
      G.stage = 0;
      G.money = 850;
      takeShotCar(960, 900, -Math.PI / 2, 120);
    }
  }

  // ---------------------------------------------------------- loop

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function update(dt) {
    G.time += dt;
    if (G.shotDrive) {
      G.keys.w = true;
      G.keys.s = false;
      G.keys.a = false;
      G.keys.d = false;
    }
    if (G.player.inCar) SB.updatePlayerCar(G, dt);
    else SB.updatePlayerOnFoot(G, dt);
    SB.updateTraffic(G, dt);
    SB.updatePeds(G, dt);
    SB.updatePolice(G, dt);
    SB.updateEnemies(G, dt);
    SB.updateBullets(G, dt);
    SB.updatePickups(G, dt);
    SB.updateParticles(G, dt);
    checkMissions();

    // Wanted decays once the heat is off and no crime is fresh.
    if (!G.chaseLock && G.wanted > 0 && G.time - G.lastCrime > 10) {
      G.wantedTimer += dt;
      if (G.wantedTimer > 8) {
        G.wanted--;
        G.wantedTimer = 0;
      }
    } else {
      G.wantedTimer = 0;
    }

    // Speeding through downtown draws police attention.
    if (G.player.inCar && G.player.car && Math.abs(G.player.car.speed) > 400 &&
        SB.dist(G.player.x, G.player.y, 1280, 960) < 340 &&
        G.time - G.lastSpeedCrime > 15) {
      G.lastSpeedCrime = G.time;
      SB.addWanted(G, 1);
      SB.toast(G, 'Speeding downtown — the police noticed');
    }

    // Audio follows the car and the wanted level.
    var carSpeed = G.player.car ? Math.abs(G.player.car.speed) / 520 : 0;
    SB.audio.engine(G.player.inCar, carSpeed);
    SB.audio.siren(G.wanted > 0, dt);

    // Autosave while playing.
    G.saveT += dt;
    if (G.saveT > 5) {
      G.saveT = 0;
      saveGame();
    }
    if (G.toastUntil && G.time > G.toastUntil) {
      hide($('toast'));
      G.toastUntil = 0;
    }
  }

  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.started && !G.paused && G.state === 'playing') update(dt);
    // Camera follows the player.
    G.cam.x = SB.clamp(G.player.x - canvas.width / 2, 0, Math.max(0, SB.WORLD_W - canvas.width));
    G.cam.y = SB.clamp(G.player.y - canvas.height / 2, 0, Math.max(0, SB.WORLD_H - canvas.height));
    SB.drawGame(ctx, G, canvas.width, canvas.height);
    SB.updateHud(G);
  }

  // ---------------------------------------------------------- automation hook

  window.__game = {
    state: function () {
      var marker = SB.missionMarker(G) || { x: 0, y: 0 };
      var carsNear = [];
      for (var i = 0; i < G.cars.length; i++) {
        var c = G.cars[i];
        var d = SB.dist(G.player.x, G.player.y, c.x, c.y);
        if (d < 700) carsNear.push({ x: c.x, y: c.y, d: Math.round(d), parked: c.parked });
      }
      carsNear.sort(function (a, b) { return a.d - b.d; });
      var enemies = [];
      for (var j = 0; j < G.enemies.length; j++) {
        enemies.push({ x: G.enemies[j].x, y: G.enemies[j].y, hp: G.enemies[j].hp });
      }
      var pickups = [];
      for (var k = 0; k < G.pickups.length; k++) {
        if (!G.pickups[k].gone) pickups.push({ x: G.pickups[k].x, y: G.pickups[k].y, kind: G.pickups[k].kind });
      }
      return {
        started: G.started,
        paused: G.paused,
        storyComplete: G.storyComplete,
        state: G.state,
        money: G.money,
        missionIndex: G.missionIndex,
        stage: G.stage,
        kills: G.kills,
        hp: Math.round(G.hp),
        ammo: G.ammo,
        wanted: G.wanted,
        px: Math.round(G.player.x),
        py: Math.round(G.player.y),
        carAngle: G.player.car ? G.player.car.angle : G.player.angle,
        carSpeed: G.player.car ? Math.round(G.player.car.speed) : 0,
        inCar: G.player.inCar,
        marker: { x: marker.x, y: marker.y },
        carsNear: carsNear,
        enemies: enemies,
        pickups: pickups,
        patrol: G.patrols.length,
        cops: G.cops.length,
        cam: { x: Math.round(G.cam.x), y: Math.round(G.cam.y) }
      };
    }
  };

  // ---------------------------------------------------------- boot

  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  if (shot === 'walk' || shot === 'drive' || shot === 'chase' || shot === 'mission') {
    setupShot(shot);
  } else if (loadSave()) {
    show($('btn-continue'));
  }
  requestAnimationFrame(loop);
})();
