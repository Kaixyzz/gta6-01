// combat.js — shooting, the M3 gang fight, and pickups.
// Bullets fly straight and die on buildings; gang members hold the turf lot
// and shoot back; defeated enemies usually drop ammo.

import { TUNING, PLACES } from './config.js';
import { pointInBuilding } from './city.js';
import { scarePedestrians } from './pedestrians.js';
import { bustPlayer } from './police.js';

export function makeCombat() {
  return {
    bullets: [],
    enemies: [],
    pickups: [],
    gunCooldown: 0,
    enemyShootTimer: 0,
  };
}

export function seedPickups(combat) {
  combat.pickups = [
    { x: PLACES.garageAmmo.x, y: PLACES.garageAmmo.y, kind: 'ammo', taken: false },
    { x: PLACES.crossing.x, y: PLACES.crossing.y, kind: 'ammo', taken: false },
    { x: PLACES.safehouseHealth.x, y: PLACES.safehouseHealth.y, kind: 'health', taken: false },
    { x: PLACES.downtownHealth.x, y: PLACES.downtownHealth.y, kind: 'health', taken: false },
  ];
}

// The gang holds the turf lot: 4 members, 3 HP each, spawned on open ground.
export function spawnGang(G) {
  const lot = PLACES.turfLot;
  const spots = [
    { x: lot.x + 30, y: lot.y + 30 },
    { x: lot.x + lot.w - 30, y: lot.y + 35 },
    { x: lot.x + 35, y: lot.y + lot.h - 30 },
    { x: lot.x + lot.w - 35, y: lot.y + lot.h - 35 },
  ];
  G.combat.enemies = spots.map((s, i) => ({
    x: s.x, y: s.y, hp: TUNING.enemyHp, alive: true,
    angle: 0, shootT: 0.6 + i * 0.4, wanderT: 0, wx: s.x, wy: s.y,
  }));
}

export function firePlayerBullet(G) {
  const p = G.player;
  if (p.ammo <= 0 || G.combat.gunCooldown > 0 || p.inCar) return false;
  G.combat.gunCooldown = TUNING.gunCooldown;
  p.ammo -= 1;
  const mx = G.input.mouseX + G.camera.x;
  const my = G.input.mouseY + G.camera.y;
  const dx = mx - p.x;
  const dy = my - p.y;
  const d = Math.hypot(dx, dy) || 1;
  G.combat.bullets.push({
    x: p.x + (dx / d) * 18, y: p.y + (dy / d) * 18,
    vx: (dx / d) * TUNING.bulletSpeed, vy: (dy / d) * TUNING.bulletSpeed,
    life: TUNING.bulletRange / TUNING.bulletSpeed, from: 'player', dmg: 1,
  });
  G.sound.gunshot();
  scarePedestrians(G.peds, p.x, p.y, 260, G.time);
  G.stats.shotsFired += 1;
  return true;
}

function fireEnemyBullet(G, e) {
  const p = G.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  // Enemies are bad shots: a wide random spread keeps the fight fair.
  const spread = (G.rng.float() - 0.5) * 0.55;
  const ang = Math.atan2(dy, dx) + spread;
  G.combat.bullets.push({
    x: e.x + Math.cos(ang) * 18, y: e.y + Math.sin(ang) * 18,
    vx: Math.cos(ang) * TUNING.enemyBulletSpeed,
    vy: Math.sin(ang) * TUNING.enemyBulletSpeed,
    life: TUNING.enemyRange / TUNING.enemyBulletSpeed, from: 'enemy', dmg: TUNING.enemyDamage,
  });
  G.sound.enemyShot();
}

export function updateCombat(G, dt) {
  const c = G.combat;
  c.gunCooldown -= dt;

  // Bullets: move, die on buildings and at range, hit what they touch.
  for (const b of c.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (pointInBuilding(G.city, b.x, b.y) || b.y > 1780 || b.x < 0 || b.y < 0) {
      b.dead = true;
      G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.18, color: '#ffd34d', size: 3 });
      continue;
    }
    if (b.from === 'player') {
      for (const e of c.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 17) {
          e.hp -= b.dmg;
          b.dead = true;
          G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.22, color: '#ff5a4d', size: 4 });
          if (e.hp <= 0) {
            e.alive = false;
            G.stats.gangDown += 1;
            if (G.rng.chance(TUNING.enemyDropChance)) {
              c.pickups.push({ x: e.x, y: e.y, kind: 'ammo', taken: false });
            }
            G.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.5, color: '#c22f2f', size: 8 });
          }
          break;
        }
      }
    } else {
      const p = G.player;
      if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
        b.dead = true;
        p.hp = Math.max(0, p.hp - b.dmg);
        if (p.hp <= 0) bustPlayer(G);
      }
    }
  }
  c.bullets = c.bullets.filter((b) => !b.dead);

  // Enemies: hold the turf, wander the lot, shoot when the player is near.
  for (const e of c.enemies) {
    if (!e.alive) continue;
    const p = G.player;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d < TUNING.enemyRange && d > 60) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = TUNING.enemyShootInterval * (0.85 + G.rng.float() * 0.4);
        fireEnemyBullet(G, e);
      }
    }
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = G.rng.range(1.5, 3.5);
      const lot = PLACES.turfLot;
      e.wx = lot.x + G.rng.range(25, lot.w - 25);
      e.wy = lot.y + G.rng.range(25, lot.h - 25);
    }
    const wx = e.wx - e.x;
    const wy = e.wy - e.y;
    const wd = Math.hypot(wx, wy);
    if (wd > 8) {
      e.x += (wx / wd) * 42 * dt;
      e.y += (wy / wd) * 42 * dt;
    }
  }

  // Pickups: walk over one to collect it. Taken pickups come back after a
  // while, so the turf fight never runs dry.
  const p = G.player;
  for (const pk of c.pickups) {
    if (pk.taken) {
      if (G.time >= (pk.respawnAt || 0)) pk.taken = false;
      continue;
    }
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 26) {
      pk.taken = true;
      pk.respawnAt = G.time + 25;
      if (pk.kind === 'ammo') p.ammo += TUNING.ammoPickupAmount;
      else p.hp = Math.min(TUNING.playerHp, p.hp + TUNING.healthPickupAmount);
      G.sound.pickup();
      G.flashMessage = pk.kind === 'ammo' ? `+${TUNING.ammoPickupAmount} ammo` : `+${TUNING.healthPickupAmount} health`;
      G.flashUntil = G.time + 1.6;
    }
  }
}
