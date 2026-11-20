// SOLARA BAY missions: six story jobs, the hidden stashes, and the chase
// triggers. Each mission unlocks the next; completing one clears the
// wanted level and every police unit, and pays its reward.
(function () {
  'use strict';

  var City = window.SBCity;
  var LAND = City.LAND;

  var DEFS = [
    { title: 'M1 — First Wheels', objective: 'Steal a car and drive it to the drop-off', reward: 300 },
    { title: 'M2 — The Pickup', objective: 'Collect the package, then deliver it', reward: 500 },
    { title: 'M3 — Turfwars', objective: 'Defeat the 4 gang members at the turf', reward: 800 },
    { title: 'M4 — The Getaway', objective: 'Grab the goods and escape the chase to the safehouse', reward: 1500 },
    { title: 'M5 — The Score', objective: 'Rob the bank vault, then drive the cash to the garage', reward: 800 },
    { title: 'M6 — King of the Bay', objective: 'Steal the boss sports car and escape to the safehouse', reward: 1500 }
  ];

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function createMissions(game) {
    var m = {
      index: 0,
      stage: 0,
      kills: 0,
      storyComplete: false,
      marker: { x: LAND.dropoff.x, y: LAND.dropoff.y },
      spawned: false,
      stashes: LAND.stashes.map(function (s) {
        return { x: s.x, y: s.y, name: s.name, taken: false };
      })
    };

    function title() { return DEFS[m.index].title; }
    function objective() { return DEFS[m.index].objective; }
    function reward() { return DEFS[m.index].reward; }

    function startMission(i) {
      m.index = i;
      m.stage = 0;
      m.kills = 0;
      m.spawned = false;
      if (i === 0) m.marker = { x: LAND.dropoff.x, y: LAND.dropoff.y };
      else if (i === 1) m.marker = { x: LAND.pickup.x, y: LAND.pickup.y };
      else if (i === 2) m.marker = { x: LAND.turf.x, y: LAND.turf.y };
      else if (i === 3) m.marker = { x: LAND.goods.x, y: LAND.goods.y };
      else if (i === 4) m.marker = { x: LAND.bank.x, y: LAND.bank.y };
      else if (i === 5) m.marker = { x: LAND.marinaCar.x, y: LAND.marinaCar.y };
    }

    function complete() {
      game.money += DEFS[m.index].reward;
      game.player.hp = Math.min(100, game.player.hp + 30); // breather after a job
      game.clearPolice();
      game.wanted = 0;
      m.kills = 0;
      m.spawned = false;
      if (m.index >= 5) {
        m.storyComplete = true;
        m.marker = null;
        game.onStoryComplete();
        return;
      }
      startMission(m.index + 1);
      game.save();
    }

    function spawnGang() {
      var offs = [[-90, -40], [90, -60], [-60, 70], [80, 60]];
      for (var i = 0; i < offs.length; i++) {
        var p = City.findOpenSpot(LAND.turf.x + offs[i][0], LAND.turf.y + offs[i][1], 14);
        game.enemies.push(window.SBEntities.createEnemy(p.x, p.y));
      }
      m.spawned = true;
      m.stage = 1;
    }

    function spawnGuards() {
      var offs = [[-80, -40], [-30, 60], [-90, 50]];
      for (var i = 0; i < offs.length; i++) {
        var p = City.findOpenSpot(LAND.bank.x + offs[i][0], LAND.bank.y + offs[i][1], 14);
        game.enemies.push(window.SBEntities.createEnemy(p.x, p.y));
      }
      m.spawned = true;
    }

    function spawnChase(nPatrol, nCops) {
      var near = [];
      for (var i = 0; i < City.AVENUES.length; i++) {
        for (var j = 0; j < City.STREETS.length; j++) {
          var ix = City.AVENUES[i], iy = City.STREETS[j];
          var d = dist(ix, iy, game.player.x, game.player.y);
          if (d > 180 && d < 700) near.push({ x: ix, y: iy, d: d });
        }
      }
      near.sort(function (a, b) { return a.d - b.d; });
      for (var p = 0; p < nPatrol && p < near.length; p++) {
        game.patrolCars.push(window.SBEntities.createPatrol(near[p].x, near[p].y));
      }
      for (var c = 0; c < nCops && c + nPatrol < near.length; c++) {
        var s = near[c + nPatrol];
        game.footCops.push(window.SBEntities.createFootCop(s.x, s.y));
      }
    }

    function checkStash() {
      for (var i = 0; i < m.stashes.length; i++) {
        var s = m.stashes[i];
        if (!s.taken && dist(game.player.x, game.player.y, s.x, s.y) < 42) {
          s.taken = true;
          game.money += 100;
          game.stashCount++;
          game.blip('Stash found! +$100');
          game.save();
          return s;
        }
      }
      return null;
    }

    function update(dt) {
      if (m.storyComplete) return;
      var p = game.player;
      checkStash();
      if (m.index === 0) {
        if (p.inCar && dist(p.x, p.y, LAND.dropoff.x, LAND.dropoff.y) < 85) complete();
      } else if (m.index === 1) {
        if (m.stage === 0) {
          if (dist(p.x, p.y, LAND.pickup.x, LAND.pickup.y) < 75) {
            m.stage = 1;
            m.marker = { x: LAND.delivery.x, y: LAND.delivery.y };
            game.blip('Package collected — deliver it');
          }
        } else if (dist(p.x, p.y, LAND.delivery.x, LAND.delivery.y) < 75) {
          complete();
        }
      } else if (m.index === 2) {
        if (!m.spawned && dist(p.x, p.y, LAND.turf.x, LAND.turf.y) < 300) spawnGang();
        else if (m.spawned && m.kills >= 4) complete();
      } else if (m.index === 3) {
        if (m.stage === 0) {
          if (dist(p.x, p.y, LAND.goods.x, LAND.goods.y) < 75) {
            m.stage = 1;
            game.wanted = 3;
            spawnChase(4, 2);
            m.marker = { x: LAND.safehouse.x, y: LAND.safehouse.y };
            game.blip('Police chase! Lose them at the safehouse');
          }
        } else if (dist(p.x, p.y, LAND.safehouse.x, LAND.safehouse.y) < 85) {
          complete();
        }
      } else if (m.index === 4) {
        if (m.stage === 0) {
          if (!m.spawned && dist(p.x, p.y, LAND.bank.x, LAND.bank.y) < 300) spawnGuards();
          else if (m.spawned && m.kills >= 3) {
            m.stage = 1;
            m.marker = { x: LAND.bankVault.x, y: LAND.bankVault.y };
            game.blip('Vault clear — grab the cash');
          }
        } else if (m.stage === 1) {
          if (dist(p.x, p.y, LAND.bankVault.x, LAND.bankVault.y) < 60) {
            m.stage = 2;
            game.wanted = 2;
            spawnChase(2, 0); // getaway spawns patrol cars only, no foot cop
            m.marker = { x: LAND.garage.x, y: LAND.garage.y };
            game.blip('Cash grabbed! Drive it to the garage');
          }
        } else if (dist(p.x, p.y, LAND.garage.x, LAND.garage.y) < 85) {
          complete();
        }
      } else if (m.index === 5) {
        if (m.stage === 0) {
          // Entering the boss sports car starts the final chase.
          if (p.inCar && p.car && p.car.id === 'boss-sports') {
            m.stage = 1;
            game.wanted = 3;
            spawnChase(4, 2);
            m.marker = { x: LAND.safehouse.x, y: LAND.safehouse.y };
            game.blip('The boss is after you! Escape to the safehouse');
          }
        } else if (dist(p.x, p.y, LAND.safehouse.x, LAND.safehouse.y) < 85) {
          complete();
        }
      }
    }

    m.title = title;
    m.objective = objective;
    m.reward = reward;
    m.startMission = startMission;
    m.complete = complete;
    m.update = update;
    m.checkStash = checkStash;
    return m;
  }

  window.SBMissions = { createMissions: createMissions, DEFS: DEFS };
})();
