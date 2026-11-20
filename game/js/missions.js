// Story missions for SOLARA BAY: seven jobs, each with stages, a marker,
// rewards and the chases they trigger. Money ladder:
// 50 -> 350 -> 850 -> 1650 -> 3150 -> 3950 -> 5450 -> 7450.
import { dist } from './rng.js';

export const MISSIONS = [
  { title: 'First Wheels', short: 'M1', objective: 'Steal a car and drive it to the drop-off', reward: 300 },
  { title: 'The Pickup', short: 'M2', objective: 'Drive to the pickup, collect the package, deliver it', reward: 500 },
  { title: 'Turfwars', short: 'M3', objective: 'On foot: defeat the 4 gang members at the turf', reward: 800 },
  { title: 'The Getaway', short: 'M4', objective: 'Grab the goods, then escape the police to the safehouse', reward: 1500 },
  { title: 'The Score', short: 'M5', objective: 'Rob the bank vault, then drive the getaway to the garage', reward: 800 },
  { title: 'King of the Bay', short: 'M6', objective: "Steal the boss's sports car, then escape the big chase", reward: 1500 },
  { title: 'The Big One', short: 'M7', objective: 'Rob the casino vault, then escape the biggest chase yet', reward: 2000 },
];

export function createMissions(game) {
  const spots = game.city.spots;
  const m = {
    index: 0,
    stage: 0,
    kills: 0,
    marker: { x: spots.spawn.x, y: spots.spawn.y },
    packageTaken: false,

    reset() {
      this.index = 0;
      this.stage = 0;
      this.kills = 0;
      this.packageTaken = false;
      this.setMarkerForStage();
    },

    title() {
      return this.index < MISSIONS.length ? MISSIONS[this.index].title : 'Story Complete';
    },

    objective() {
      return this.index < MISSIONS.length ? MISSIONS[this.index].objective : 'You own the Bay.';
    },

    reward() {
      return this.index < MISSIONS.length ? MISSIONS[this.index].reward : 0;
    },

    setMarkerForStage() {
      const i = this.index;
      const s = this.stage;
      if (i === 0) this.marker = s === 0 ? { ...spots.spawn } : { ...spots.dropoff };
      else if (i === 1) this.marker = s === 0 ? { ...spots.pickup } : { ...spots.delivery };
      else if (i === 2) this.marker = { ...spots.turf };
      else if (i === 3) this.marker = s === 0 ? { ...spots.goods } : { ...spots.safehouse };
      else if (i === 4) {
        if (s === 0) this.marker = { ...spots.bankPlaza };
        else if (s === 1) this.marker = { ...spots.bankCash };
        else this.marker = { ...spots.garage };
      } else if (i === 5) this.marker = s === 0 ? { ...spots.sportsCar } : { ...spots.safehouse };
      else if (i === 6) {
        if (s === 0) this.marker = { ...spots.casinoPlaza };
        else if (s === 1) this.marker = { ...spots.casinoCash };
        else this.marker = { ...spots.safehouse };
      } else this.marker = { ...spots.safehouse };
    },

    // Called when the player enters a car.
    onEnterCar(car) {
      if (this.index === 0 && this.stage === 0) {
        this.stage = 1;
        this.setMarkerForStage();
      } else if (this.index === 5 && this.stage === 0 && car.boss) {
        this.stage = 1;
        this.setMarkerForStage();
        game.raiseWanted(3);
        game.spawnPatrol(4);
        game.spawnFootCops(2);
      }
    },

    // Called when an enemy dies.
    onEnemyKilled() {
      this.kills += 1;
      if (this.index === 2 && this.kills >= 4) game.completeMission();
      else if (this.index === 4 && this.stage === 1 && this.kills >= 3) {
        this.marker = { ...spots.bankCash };
      } else if (this.index === 6 && this.stage === 1 && this.kills >= 4) {
        this.marker = { ...spots.casinoCash };
      }
    },

    update(dt) {
      const p = game.player;
      const i = this.index;
      if (i >= MISSIONS.length || game.storyComplete) return;
      const d = dist(p.x, p.y, this.marker.x, this.marker.y);

      if (i === 0) {
        if (this.stage === 0) {
          // Marker follows the nearest parked car until the player steals one.
          const car = game.nearestParkedCar();
          if (car) this.marker = { x: car.x, y: car.y };
        } else if (d < 85) {
          game.completeMission();
        }
      } else if (i === 1) {
        if (this.stage === 0 && d < 75) {
          this.stage = 1;
          this.packageTaken = true;
          game.sound.blip(990, 0.12);
          this.setMarkerForStage();
        } else if (this.stage === 1 && d < 75) {
          game.completeMission();
        }
      } else if (i === 2) {
        if (this.stage === 0 && !p.inCar && d < 320) {
          this.stage = 1;
          game.spawnEnemies(game.city.gangSpawns, 'gang');
        }
      } else if (i === 3) {
        if (this.stage === 0 && d < 75) {
          this.stage = 1;
          this.setMarkerForStage();
          game.sound.blip(660, 0.15);
          game.raiseWanted(3);
          game.spawnPatrol(3);
          game.spawnFootCops(2);
        } else if (this.stage === 1 && d < 85) {
          game.completeMission();
        }
      } else if (i === 4) {
        if (this.stage === 0 && !p.inCar && d < 300) {
          this.stage = 1;
          game.spawnEnemies(game.city.bankGuardSpawns, 'guard');
        } else if (this.stage === 1 && this.kills >= 3 && d < 65) {
          // Cash grabbed: the getaway begins (patrol cars only, no foot cop).
          // Radius 65 beats the driver's arrive-60 stop, so the grab fires
          // the moment the driver reaches the cash.
          this.stage = 2;
          this.setMarkerForStage();
          game.sound.blip(990, 0.12);
          game.raiseWanted(2);
          game.spawnPatrol(2);
        } else if (this.stage === 2 && d < 85) {
          game.completeMission();
        }
      } else if (i === 5) {
        if (this.stage === 1 && d < 85) game.completeMission();
      } else if (i === 6) {
        if (this.stage === 0 && !p.inCar && d < 300) {
          this.stage = 1;
          game.spawnEnemies(game.city.casinoGuardSpawns, 'guard');
        } else if (this.stage === 1 && this.kills >= 4 && d < 65) {
          // Casino cash grabbed: the biggest chase yet (same arrive-60 note
          // as the bank cash: radius 65 so the grab fires on arrival).
          this.stage = 2;
          this.setMarkerForStage();
          game.sound.blip(990, 0.12);
          game.raiseWanted(3);
          game.spawnPatrol(5);
          game.spawnFootCops(2);
        } else if (this.stage === 2 && d < 85) {
          game.completeMission();
        }
      }
    },
  };
  return m;
}
