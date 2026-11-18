// Combat: the player's pistol, gang enemies, bullets and pickups.
import { CFG } from './config.js';
import { dist } from './city.js';
import { rand, pick } from './rng.js';
import { damagePlayer } from './player.js';

function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function spawnPickup(G, x, y, kind) {
  G.pickups.push({ x, y, kind: kind || pick(G.rng, ['health', 'ammo']), bob: rand(G.rng, 0, Math.PI * 2) });
}

export function spawnEnemies(G, cx, cy, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    G.enemies.push({
      x: cx + Math.cos(a) * 130,
      y: cy + Math.sin(a) * 130,
      hp: 3, angle: 0, shootCd: rand(G.rng, 0.4, 1.2), speed: 150,
    });
  }
}

export function updateCombat(G, dt) {
  const p = G.player;
  const input = G.input;
  // Aim at the mouse (screen → world through the camera).
  const wx = G.camera.x + input.mouse.x;
  const wy = G.camera.y + input.mouse.y;
  if (!p.inCar) p.angle = Math.atan2(wy - p.y, wx - p.x);
  // Fire: mouse held or Space, limited by rate and ammo.
  const wantFire = (input.mouse.down || input.down('Space')) && !p.inCar;
  if (wantFire && p.shootCd <= 0 && p.ammo > 0) {
    p.shootCd = CFG.PISTOL_RATE;
    p.ammo -= 1;
    const a = p.angle + rand(G.rng, -0.03, 0.03);
    G.bullets.push({
      x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24,
      vx: Math.cos(a) * CFG.BULLET_SPEED, vy: Math.sin(a) * CFG.BULLET_SPEED,
      life: CFG.PISTOL_RANGE / CFG.BULLET_SPEED, enemy: false,
    });
    G.audio.shoot();
    G.lastShot = { x: p.x, y: p.y, t: G.time };
    G.police.addWanted(G, 0); // no-op guard: shooting only counts near police
    let copNear = false;
    for (const c of G.cops) if (dist(p.x, p.y, c.x, c.y) < 700) copNear = true;
    for (const c of G.patrols) if (dist(p.x, p.y, c.x, c.y) < 700) copNear = true;
    if (copNear) G.police.addWanted(G, 1);
    G.particles.push({ x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 26, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, t: 0.12, color: '#ffd94d' });
  }
  // Player bullets.
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || pointInBuilding(G.city, b.x, b.y)
      || b.x < 0 || b.x > CFG.WATER_X || b.y < 0 || b.y > CFG.WORLD_H;
    if (!dead) {
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (dist(b.x, b.y, e.x, e.y) < 22) {
          e.hp -= 1;
          dead = true;
          G.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, t: 0.2, color: '#ff5a4d' });
          if (e.hp <= 0) {
            G.enemies.splice(j, 1);
            if (G.rng() < 0.6) spawnPickup(G, e.x, e.y, G.rng() < 0.5 ? 'health' : 'ammo');
          }
          break;
        }
      }
    }
    if (!dead) {
      for (const c of G.cops) {
        if (dist(b.x, b.y, c.x, c.y) < 20) { dead = true; break; }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
  // Gang enemies: close in and shoot.
  for (const e of G.enemies) {
    const d = dist(e.x, e.y, p.inCar && p.car ? p.car.x : p.x, p.inCar && p.car ? p.car.y : p.y);
    const tx = p.inCar && p.car ? p.car.x : p.x;
    const ty = p.inCar && p.car ? p.car.y : p.y;
    e.angle = Math.atan2(ty - e.y, tx - e.x);
    if (d > 240) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    }
    e.shootCd -= dt;
    if (e.shootCd <= 0 && d < 430 && d > 40) {
      e.shootCd = 1.3;
      G.ebullets.push({
        x: e.x + Math.cos(e.angle) * 22, y: e.y + Math.sin(e.angle) * 22,
        vx: Math.cos(e.angle) * 380, vy: Math.sin(e.angle) * 380, life: 1.6, enemy: true,
      });
      G.audio.enemyShoot();
    }
  }
  // Enemy bullets.
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const b = G.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || pointInBuilding(G.city, b.x, b.y);
    if (!dead && !p.inCar && dist(b.x, b.y, p.x, p.y) < 18) {
      damagePlayer(G, 8);
      dead = true;
    }
    if (!dead && p.inCar && p.car && dist(b.x, b.y, p.car.x, p.car.y) < 26) {
      damagePlayer(G, 5);
      dead = true;
    }
    if (dead) G.ebullets.splice(i, 1);
  }
  // Pickups bob and get collected.
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.bob += dt * 4;
    const px = p.inCar && p.car ? p.car.x : p.x;
    const py = p.inCar && p.car ? p.car.y : p.y;
    if (dist(k.x, k.y, px, py) < 40) {
      if (k.kind === 'health') p.hp = Math.min(CFG.PLAYER_HP, p.hp + 30);
      else p.ammo = Math.min(CFG.PISTOL_MAX_AMMO, p.ammo + 12);
      G.audio.pickup();
      G.pickups.splice(i, 1);
    }
  }
  // Particles fade.
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.t -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    if (pt.t <= 0) G.particles.splice(i, 1);
  }
}
