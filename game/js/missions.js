// The six story missions of SOLARA BAY. Each mission is one entry: a title,
// an objective line for the mission card, a reward, and the marker logic.
// The driver (and the player) reads the current marker from game state.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;

  const DEFS = [
    { title: 'First Wheels', objective: 'Steal a car and drive it to the drop-off', reward: 300 },
    { title: 'The Pickup', objective: 'Drive to the pickup, collect the package, deliver it', reward: 500 },
    { title: 'Turfwars', objective: 'On foot: defeat the 4 gang members at the turf', reward: 800 },
    { title: 'The Getaway', objective: 'Grab the goods, then escape the police chase to the safehouse', reward: 1500 },
    { title: 'The Score', objective: 'Rob the bank vault, grab the cash, drive to the garage', reward: 800 },
    { title: 'King of the Bay', objective: 'Steal the boss sports car and escape the biggest chase yet', reward: 1500 },
  ];

  function markerFor(G) {
    const P = SB.City.PLACES;
    const mi = G.missionIndex;
    const st = G.stage;
    if (mi === 0) return { x: P.dropoff.x, y: P.dropoff.y };
    if (mi === 1) return st === 0 ? { x: P.pickup.x, y: P.pickup.y } : { x: P.delivery.x, y: P.delivery.y };
    if (mi === 2) return { x: P.turf.x, y: P.turf.y };
    if (mi === 3) return st === 0 ? { x: P.goods.x, y: P.goods.y } : { x: P.safehouse.x, y: P.safehouse.y };
    if (mi === 4) {
      if (st === 0) return { x: P.bank.x, y: P.bank.y };
      if (st === 1) return { x: P.cash.x, y: P.cash.y };
      return { x: P.garage.x, y: P.garage.y };
    }
    // Mission 5 (M6): the sports car, then the safehouse.
    return st === 0 ? { x: P.marina.x, y: P.marina.y } : { x: P.safehouse.x, y: P.safehouse.y };
  }

  function near(G, x, y, r) {
    const dx = G.player.x - x, dy = G.player.y - y;
    return dx * dx + dy * dy <= r * r;
  }

  // One tick of the mission state machine. Called from the game loop with
  // the live game state; it may complete a mission, change stage, spawn the
  // gang or the guards, or raise the wanted level for a chase.
  function update(G, dt) {
    const P = SB.City.PLACES;
    const mi = G.missionIndex;
    if (G.storyComplete || mi >= DEFS.length) return;

    if (mi === 0) {
      if (near(G, P.dropoff.x, P.dropoff.y, 85)) complete(G);
      return;
    }
    if (mi === 1) {
      if (G.stage === 0 && near(G, P.pickup.x, P.pickup.y, 75)) {
        G.stage = 1;
        G.note('Package collected — deliver it');
      } else if (G.stage === 1 && near(G, P.delivery.x, P.delivery.y, 75)) {
        complete(G);
      }
      return;
    }
    if (mi === 2) {
      if (!G.gangSpawned && near(G, P.turf.x, P.turf.y, 320)) {
        G.gangSpawned = true;
        const offs = [[-90, -70], [80, -90], [-70, 90], [90, 70]];
        for (const o of offs) {
          G.enemies.push(SB.Entities.makeEnemy(P.turf.x + o[0], P.turf.y + o[1]));
        }
        G.note('Gang members at the turf — take them down');
      }
      if (G.gangSpawned && G.kills >= 4) complete(G);
      return;
    }
    if (mi === 3) {
      if (G.stage === 0 && near(G, P.goods.x, P.goods.y, 75)) {
        G.stage = 1;
        G.wanted = 3;
        G.spawnChase(3, 2);
        G.note('Police chase! Lose them and reach the safehouse');
      } else if (G.stage === 1 && near(G, P.safehouse.x, P.safehouse.y, 85)) {
        complete(G);
      }
      return;
    }
    if (mi === 4) {
      if (G.stage === 0) {
        if (!G.guardsSpawned && near(G, P.bank.x, P.bank.y, 320)) {
          G.guardsSpawned = true;
          const offs = [[-80, -60], [70, -80], [0, 90]];
          for (const o of offs) {
            G.enemies.push(SB.Entities.makeEnemy(P.bank.x + o[0], P.bank.y + o[1]));
          }
          G.note('Bank guards — take them down');
        }
        if (G.guardsSpawned && G.kills >= 3) {
          G.stage = 1;
          G.note('Vault clear — grab the cash');
        }
      } else if (G.stage === 1 && near(G, P.cash.x, P.cash.y, 60)) {
        G.stage = 2;
        G.wanted = 2;
        G.spawnChase(2, 1);
        G.note('Cash grabbed! Getaway — drive to the garage');
      } else if (G.stage === 2 && near(G, P.garage.x, P.garage.y, 85)) {
        complete(G);
      }
      return;
    }
    if (mi === 5) {
      if (G.stage === 1 && near(G, P.safehouse.x, P.safehouse.y, 85)) {
        complete(G);
      }
      return;
    }
  }

  // Entering the boss sports car starts the final chase. Any other car at
  // the marina does nothing special.
  function onEnterBossCar(G) {
    if (G.missionIndex !== 5 || G.stage !== 0) return;
    G.stage = 1;
    G.wanted = 3;
    G.spawnChase(4, 2);
    G.note('The boss car is yours — biggest chase yet!');
  }

  function complete(G) {
    const def = DEFS[G.missionIndex];
    G.money += def.reward;
    G.hp = Math.min(100, G.hp + 40);
    G.wanted = 0;
    G.clearPolice();
    G.enemies.length = 0;
    G.missionIndex += 1;
    G.stage = 0;
    G.kills = 0;
    G.gangSpawned = false;
    G.guardsSpawned = false;
    G.save();
    if (G.missionIndex >= DEFS.length) {
      G.storyComplete = true;
      G.state = 'complete';
      G.note('Story Complete');
      G.save();
    } else {
      G.note('Mission complete: ' + def.title + '  +$' + def.reward);
    }
  }

  SB.Missions = { DEFS: DEFS, markerFor: markerFor, update: update, onEnterBossCar: onEnterBossCar };
})();
