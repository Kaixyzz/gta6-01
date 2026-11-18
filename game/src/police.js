// The wanted level and the Solara Bay PD: foot officers who arrest on
// contact and patrol cars that chase and ram. Stay out of sight for a
// while and the heat cools off, one star at a time.
import { CFG } from './config.js';
import { dist, randomRoadPoint } from './city.js';
import { makeCar, driveCar } from './vehicles.js';
import { rand } from './rng.js';

export function makePolice(G) {
  return {
    addWanted(n) {
      if (n <= 0) return;
      G.wanted = Math.min(CFG.WANTED_MAX, G.wanted + n);
      G.lastCrimeT = G.time;
      G.quietT = 0;
    },

    update(dt) {
      // Decay: nobody nearby for a while and the heat drops a star.
      let near = false;
      for (const c of G.cops) {
        if (dist(G.player.x, G.player.y, c.x, c.y) < 700) near = true;
      }
      for (const c of G.patrols) {
        if (dist(G.player.x, G.player.y, c.x, c.y) < 700) near = true;
      }
      if (!near && G.wanted > 0) {
        G.quietT += dt;
        if (G.quietT > CFG.WANTED_DECAY_QUIET_S) {
          G.quietT = 0;
          G.wanted -= 1;
          if (G.wanted === 0) G.lastCrimeT = G.time;
        }
      } else {
        G.quietT = 0;
      }
      // Match the force on the street to the wanted level.
      const wantCops = G.wanted >= 1 ? Math.min(4, G.wanted + 1) : 0;
      const wantPatrols = G.wanted >= 2 ? Math.min(3, G.wanted - 1) : 0;
      while (G.cops.length < wantCops) G.cops.push(spawnOfficer(G));
      while (G.patrols.length < wantPatrols) G.patrols.push(spawnPatrolCar(G));
      while (G.cops.length > wantCops) G.cops.pop();
      while (G.patrols.length > wantPatrols) G.patrols.pop();

      const p = G.player;
      const px = p.inCar && p.car ? p.car.x : p.x;
      const py = p.inCar && p.car ? p.car.y : p.y;
      // Foot officers run at the player; contact on foot means Busted.
      for (let i = G.cops.length - 1; i >= 0; i--) {
        const c = G.cops[i];
        const d = dist(c.x, c.y, px, py);
        if (d > 950) {
          G.cops.splice(i, 1);
          continue;
        }
        const a = Math.atan2(py - c.y, px - c.x);
        c.x += Math.cos(a) * 215 * dt;
        c.y += Math.sin(a) * 215 * dt;
        c.angle = a;
        if (!p.inCar && d < 46) G.endRun('busted');
      }
      // Patrol cars steer at the player and ram.
      for (let i = G.patrols.length - 1; i >= 0; i--) {
        const c = G.patrols[i];
        const d = dist(c.x, c.y, px, py);
        if (d > 1200) {
          G.patrols.splice(i, 1);
          continue;
        }
        const targetAngle = Math.atan2(py - c.y, px - c.x);
        let diff = targetAngle - c.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 2.2));
        driveCar(G, c, 1, steer, dt);
        if (!p.inCar && dist(c.x, c.y, p.x, p.y) < 56) G.endRun('busted');
        if (p.inCar && p.car && dist(c.x, c.y, p.car.x, p.car.y) < 58) {
          // A ram shoves the player's car and bleeds its speed.
          p.car.speed *= 0.55;
          p.car.x += (p.car.x - c.x) * 0.06;
          p.car.y += (p.car.y - c.y) * 0.06;
        }
      }
      if (G.wanted > 0) G.audio.sirenTick(dt);
    },
  };
}

function spawnOfficer(G) {
  const pt = randomRoadPoint(G.rng, G.city);
  // Spawn away from the player so officers arrive instead of appearing
  // right on top of them.
  let x = pt.x;
  let y = pt.y;
  if (dist(x, y, G.player.x, G.player.y) < 420) {
    x = Math.max(100, Math.min(CFG.BEACH_X - 100, x + 500));
    y = Math.max(100, Math.min(CFG.WORLD_H - 100, y + 300));
  }
  return { x, y, angle: 0 };
}

function spawnPatrolCar(G) {
  const pt = randomRoadPoint(G.rng, G.city);
  const car = makeCar('police', pt.x, pt.y, rand(G.rng, 0, Math.PI * 2), { isPatrol: true, rng: G.rng });
  car.speed = 200;
  return car;
}
