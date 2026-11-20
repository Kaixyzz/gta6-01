// Solara Bay: deterministic city layout. Every coordinate comes from one
// fixed seed, so the world is identical on every load. The road grid is
// the one the playthrough driver navigates on: avenues and streets 320
// apart, road half-width 48, buildings tucked inside the blocks between
// them, never on a road.
import { makeRng } from './rng.js';

export const WORLD_W = 2560;
export const WORLD_H = 1920;
export const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
export const STREETS = [320, 640, 960, 1280, 1600];
export const ROAD_HALF = 48;

const PALETTE = ['#e8b04b', '#d97b4f', '#c96f5e', '#7fb069', '#5b8c8a', '#e0a458', '#b56576', '#e6cc8f'];

export function buildCity() {
  const rng = makeRng(1337);
  const buildings = [];

  const xBlocks = [[368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1872], [1972, 2192]];
  const yBlocks = [[368, 592], [688, 912], [1008, 1232], [1328, 1552]];

  // Named places get hand-placed buildings; the park and the turf plaza
  // stay open ground.
  const special = {
    garage: { x0: 368, y0: 368 },
    bank: { x0: 1328, y0: 1008 },
    house: { x0: 368, y0: 1328 },
    park: { x0: 1008, y0: 1328 },
    plaza: { x0: 688, y0: 1328 },
  };
  const isSpecial = (x0, y0) => Object.values(special).some((s) => s.x0 === x0 && s.y0 === y0);

  for (const [x0, x1] of xBlocks) {
    for (const [y0, y1] of yBlocks) {
      if (isSpecial(x0, y0)) continue;
      const two = rng.chance(0.35);
      if (two) {
        const w = Math.floor((x1 - x0 - 56) / 2);
        buildings.push({
          x: x0 + 16, y: y0 + 20, w, h: y1 - y0 - 40,
          height: rng.int(1, 3), color: rng.pick(PALETTE), kind: 'building',
        });
        buildings.push({
          x: x0 + 32 + w, y: y0 + 20, w, h: y1 - y0 - 40,
          height: rng.int(1, 3), color: rng.pick(PALETTE), kind: 'building',
        });
      } else {
        buildings.push({
          x: x0 + 20, y: y0 + 24, w: x1 - x0 - 40, h: y1 - y0 - 48,
          height: rng.int(1, 3), color: rng.pick(PALETTE), kind: 'building',
        });
      }
    }
  }

  // Hand-placed landmarks.
  buildings.push({ x: 396, y: 300, w: 180, h: 120, height: 1, color: '#8a6d4b', kind: 'garage' });
  buildings.push({ x: 1352, y: 1024, w: 200, h: 140, height: 2, color: '#e8e0cc', kind: 'bank' });
  buildings.push({ x: 400, y: 1380, w: 160, h: 110, height: 1, color: '#7fb069', kind: 'house' });

  // Palms: south promenade, east beach, and a few in the park.
  const palms = [];
  for (let x = 360; x <= 2200; x += 160) palms.push({ x: x + rng.int(-20, 20), y: 1724 });
  for (let y = 420; y <= 1560; y += 180) palms.push({ x: 2320, y: y + rng.int(-20, 20) });
  for (let i = 0; i < 7; i++) palms.push({ x: rng.range(1030, 1210), y: rng.range(1350, 1530) });
  for (let i = 0; i < 5; i++) palms.push({ x: rng.range(420, 560), y: rng.range(420, 560) });

  // Beach umbrellas on the sand strips.
  const umbrellas = [];
  for (let i = 0; i < 8; i++) umbrellas.push({ x: rng.range(420, 2180), y: rng.range(1700, 1810), color: rng.pick(['#e4572e', '#f3a712', '#17bebb', '#ef476f']) });
  for (let i = 0; i < 4; i++) umbrellas.push({ x: rng.range(2300, 2420), y: rng.range(500, 1500), color: rng.pick(['#e4572e', '#f3a712', '#17bebb', '#ef476f']) });

  // Marina docks on the east water edge, with moored boats.
  const docks = [
    { x: 2290, y: 300, w: 150, h: 14 },
    { x: 2290, y: 360, w: 150, h: 14 },
  ];
  const boats = [
    { x: 2470, y: 290, angle: 0.2, color: '#f5f0e1' },
    { x: 2480, y: 350, angle: -0.15, color: '#dbe7f0' },
    { x: 2470, y: 420, angle: 0.1, color: '#f5f0e1' },
    { x: 1200, y: 1880, angle: 1.4, color: '#dbe7f0' },
  ];

  // Park trees.
  const trees = [];
  for (let i = 0; i < 14; i++) trees.push({ x: rng.range(1030, 1210), y: rng.range(1350, 1530), r: rng.range(10, 16) });

  const locations = {
    garage: { x: 320, y: 320 },
    safehouse: { x: 320, y: 1600 },
    bank: { x: 1280, y: 960 },
    turf: { x: 960, y: 1280 },
    marina: { x: 2240, y: 320 },
    dropoff: { x: 1600, y: 640 },
    pickup: { x: 640, y: 960 },
    delivery: { x: 1920, y: 1280 },
    goods: { x: 960, y: 640 },
    cash: { x: 1310, y: 990 },
    sportsCar: { x: 2240, y: 320 },
    playerStart: { x: 320, y: 420 },
  };

  // Hidden stashes: beach, park, marina.
  const stashes = [
    { x: 2400, y: 1700, got: false },
    { x: 1120, y: 1440, got: false },
    { x: 2330, y: 420, got: false },
  ];

  // Parked, stealable vehicles. The sports car stands alone at the marina:
  // no other parked car is within 150 px of it, so the E key finds it first.
  const parkedCars = [
    { x: 352, y: 420, kind: 'car', color: '#c0392b' },
    { x: 672, y: 640, kind: 'car', color: '#2e86ab' },
    { x: 992, y: 352, kind: 'car', color: '#e0a458' },
    { x: 1312, y: 992, kind: 'car', color: '#6c757d' },
    { x: 1632, y: 672, kind: 'car', color: '#8e44ad' },
    { x: 1952, y: 1280, kind: 'car', color: '#16a085' },
    { x: 352, y: 1312, kind: 'car', color: '#d35400' },
    { x: 1632, y: 1632, kind: 'car', color: '#34495e' },
    { x: 672, y: 1312, kind: 'bike', color: '#e74c3c' },
    { x: 1952, y: 352, kind: 'truck', color: '#f39c12' },
    { x: 2240, y: 320, kind: 'sports', color: '#d90429' },
  ];

  // Moving traffic: five run the avenues, five the streets.
  const trafficSpawns = [];
  for (let i = 0; i < 5; i++) {
    trafficSpawns.push({
      axis: 'v', road: rng.pick(AVENUES), pos: rng.range(220, 1700),
      dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(55, 85),
      color: rng.pick(PALETTE), kind: 'car',
    });
  }
  for (let i = 0; i < 5; i++) {
    trafficSpawns.push({
      axis: 'h', road: rng.pick(STREETS), pos: rng.range(220, 2350),
      dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(55, 85),
      color: rng.pick(PALETTE), kind: 'car',
    });
  }

  // Pedestrians on the sidewalks.
  const pedSpawns = [];
  const pedColors = ['#f4d35e', '#ee964b', '#5b8c8a', '#b56576', '#7fb069', '#e0a458'];
  for (let i = 0; i < 24; i++) {
    const onAvenue = rng.chance(0.5);
    if (onAvenue) {
      const ax = rng.pick(AVENUES);
      pedSpawns.push({
        x: ax + rng.pick([-62, 62]), y: rng.range(220, 1700),
        axis: 'v', dir: rng.chance(0.5) ? 1 : -1, color: rng.pick(pedColors),
      });
    } else {
      const sy = rng.pick(STREETS);
      pedSpawns.push({
        x: rng.range(220, 2350), y: sy + rng.pick([-62, 62]),
        axis: 'h', dir: rng.chance(0.5) ? 1 : -1, color: rng.pick(pedColors),
      });
    }
  }

  // Pickups. Ammo and health spots respawn after a while so a long fight
  // never runs dry.
  const pickupSpawns = [
    { x: 380, y: 360, kind: 'ammo' },
    { x: 1240, y: 920, kind: 'ammo' },
    { x: 1632, y: 672, kind: 'ammo' },
    { x: 1952, y: 1312, kind: 'ammo' },
    { x: 360, y: 1560, kind: 'health' },
    { x: 660, y: 340, kind: 'health' },
  ];

  return {
    buildings,
    palms,
    umbrellas,
    docks,
    boats,
    trees,
    locations,
    stashes,
    parkedCars,
    trafficSpawns,
    pedSpawns,
    pickupSpawns,
  };
}

// True when (x, y) is inside a building rectangle.
export function pointInBuilding(buildings, x, y) {
  for (const b of buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}
