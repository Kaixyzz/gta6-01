// City layout for SOLARA BAY: a coastal grid city generated from one fixed
// seed. Avenues run north-south, streets east-west; blocks between the roads
// hold buildings, one block is a park, the south edge is a beach with water
// beyond it and the south-east corner is the marina.
window.SB = window.SB || {};
(function () {
  const SB = window.SB;
  const WORLD_W = 2560;
  const WORLD_H = 1920;
  const AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
  const STREETS = [320, 640, 960, 1280, 1600];
  const ROAD_HALF = 48;
  const SEED = 20261120;

  // Named places the missions use. Every marker sits on a road or at an
  // intersection so it can always be reached by driving or walking.
  const PLACES = {
    start: { x: 320, y: 420 },
    garage: { x: 320, y: 480 },
    dropoff: { x: 1280, y: 960 },
    pickup: { x: 1920, y: 640 },
    delivery: { x: 640, y: 1280 },
    turf: { x: 1600, y: 960 },
    goods: { x: 1920, y: 1280 },
    safehouse: { x: 960, y: 1600 },
    bank: { x: 1280, y: 640 },
    cash: { x: 1280, y: 700 },
    marina: { x: 2200, y: 1560 },
  };

  const PALETTE = ['#e8b48f', '#d9a06b', '#c98f5f', '#e0c090', '#b87a4e', '#d8b48a', '#e6c9a0'];

  function build() {
    const rng = SB.makeRng(SEED);
    const buildings = [];
    const xBands = [[48, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1872], [1968, 2192]];
    const yBands = [[48, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552]];
    // Special blocks, keyed "bx,by": park, garage, bank, safehouse.
    const special = { '3,3': 'park', '0,0': 'garage', '4,1': 'bank', '3,4': 'safehouse' };
    for (let bx = 0; bx < xBands.length; bx++) {
      for (let by = 0; by < yBands.length; by++) {
        const key = bx + ',' + by;
        if (special[key]) continue;
        const x0 = xBands[bx][0], x1 = xBands[bx][1];
        const y0 = yBands[by][0], y1 = yBands[by][1];
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const w = rng.range(70, 150);
          const h = rng.range(60, 140);
          const x = rng.range(x0 + 8, Math.max(x0 + 9, x1 - w - 8));
          const y = rng.range(y0 + 8, Math.max(y0 + 9, y1 - h - 8));
          buildings.push({
            x: x, y: y, w: w, h: h,
            tier: rng.int(1, 3),
            color: rng.pick(PALETTE),
            roof: rng.int(0, 2),
          });
        }
      }
    }
    // Named buildings.
    buildings.push({ x: 120, y: 120, w: 140, h: 100, tier: 1, color: '#d9a06b', roof: 1, kind: 'garage' });
    buildings.push({ x: 1360, y: 400, w: 160, h: 140, tier: 3, color: '#c98f5f', roof: 2, kind: 'bank' });
    buildings.push({ x: 1040, y: 1360, w: 140, h: 120, tier: 2, color: '#e0c090', roof: 0, kind: 'safehouse' });

    // Palms: beach promenade, marina strip and the park.
    const palms = [];
    for (let x = 120; x < 2300; x += 130) {
      if (rng.chance(0.75)) palms.push({ x: x + rng.range(-20, 20), y: 1705 + rng.range(-8, 8) });
    }
    for (let y = 420; y < 1600; y += 150) {
      if (rng.chance(0.6)) palms.push({ x: 2330 + rng.range(-8, 8), y: y });
    }
    for (let i = 0; i < 9; i++) {
      palms.push({ x: rng.range(1030, 1210), y: rng.range(1030, 1210) });
    }
    // Beach umbrellas on the sand.
    const umbrellas = [];
    for (let i = 0; i < 10; i++) {
      umbrellas.push({ x: rng.range(140, 2250), y: rng.range(1690, 1750), color: rng.pick(['#e25563', '#4a90d9', '#f2c14e', '#7bc47f']) });
    }
    // Boats on the water by the marina.
    const boats = [
      { x: 2460, y: 1820, a: 0.4 }, { x: 2510, y: 1870, a: -0.3 },
      { x: 2430, y: 1890, a: 1.2 }, { x: 2490, y: 1790, a: 2.4 },
    ];
    // Park trees.
    const trees = [];
    for (let i = 0; i < 14; i++) {
      trees.push({ x: rng.range(1020, 1220), y: rng.range(1020, 1220), r: rng.range(9, 15) });
    }

    // Parked cars along the roads, plus the special vehicles.
    const parked = [];
    const carColors = ['#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#16a085', '#e67e22', '#95a5a6', '#34495e'];
    for (let i = 0; i < 26; i++) {
      let x, y;
      if (rng.chance(0.5)) {
        const ax = rng.pick(AVENUES);
        x = ax + rng.pick([-30, 30]);
        y = rng.range(360, 1560);
      } else {
        const sy = rng.pick(STREETS);
        y = sy + rng.pick([-30, 30]);
        x = rng.range(360, 2200);
      }
      parked.push({ x: x, y: y, angle: rng.chance(0.5) ? 0 : Math.PI / 2, type: 'sedan', color: rng.pick(carColors), parked: true });
    }
    // Motorbike (fast, light) and truck (slow, tough), both stealable.
    parked.push({ x: 660, y: 348, angle: 0, type: 'bike', color: '#e74c3c', parked: true });
    parked.push({ x: 1900, y: 1310, angle: Math.PI / 2, type: 'truck', color: '#5d6d7e', parked: true });
    // The rival boss's gold sports car at the marina.
    parked.push({ x: 2200, y: 1560, angle: Math.PI, type: 'sports', color: '#f7c948', parked: true, boss: true });
    // A few ordinary parked sports cars elsewhere.
    parked.push({ x: 960, y: 610, angle: 0, type: 'sports', color: '#8e44ad', parked: true });

    // Moving traffic on the roads.
    const traffic = [];
    for (let i = 0; i < 14; i++) {
      if (rng.chance(0.5)) {
        const ax = rng.pick(AVENUES);
        traffic.push({
          road: 'ave', line: ax, pos: rng.range(340, 1580),
          dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(120, 180),
          type: 'sedan', color: rng.pick(carColors), parked: false,
        });
      } else {
        const sy = rng.pick(STREETS);
        traffic.push({
          road: 'st', line: sy, pos: rng.range(340, 2220),
          dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(120, 180),
          type: 'sedan', color: rng.pick(carColors), parked: false,
        });
      }
    }

    // Pedestrians strolling the sidewalks.
    const peds = [];
    for (let i = 0; i < 42; i++) {
      let x, y;
      if (rng.chance(0.5)) {
        const ax = rng.pick(AVENUES);
        x = ax + rng.pick([-64, 64]);
        y = rng.range(340, 1580);
      } else {
        const sy = rng.pick(STREETS);
        y = sy + rng.pick([-64, 64]);
        x = rng.range(340, 2220);
      }
      peds.push({ x: x, y: y, angle: rng.range(0, Math.PI * 2), speed: rng.range(28, 52), shirt: rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1']) });
    }

    // Hidden stashes: beach, park, marina.
    const stashes = [
      { id: 0, x: 420, y: 1720, found: false },
      { id: 1, x: 1120, y: 1120, found: false },
      { id: 2, x: 2340, y: 1660, found: false },
    ];

    // Static pickups on the roads: ammo by the garage and downtown, health
    // by the turf and the bank.
    const pickups = [
      { x: 320, y: 560, kind: 'ammo' },
      { x: 1280, y: 960, kind: 'ammo' },
      { x: 1560, y: 920, kind: 'health' },
      { x: 1240, y: 680, kind: 'health' },
    ];

    return {
      buildings: buildings, palms: palms, umbrellas: umbrellas, boats: boats,
      trees: trees, parked: parked, traffic: traffic, peds: peds,
      stashes: stashes, pickups: pickups, places: PLACES,
    };
  }

  function onRoad(x, y) {
    for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
    return false;
  }

  function inWater(x, y) {
    return y >= 1760 || x >= 2400;
  }

  // Push a circle out of every building rect and out of the water; returns
  // true when something blocked it. The circle's x/y are edited in place.
  function collideCircle(buildings, c, r) {
    let hit = false;
    for (const b of buildings) {
      const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
      const dx = c.x - nx, dy = c.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          c.x = nx + (dx / d) * r;
          c.y = ny + (dy / d) * r;
        } else {
          c.y = b.y - r;
        }
      }
    }
    if (c.y + r > 1760) { c.y = 1760 - r; hit = true; }
    if (c.x + r > 2400) { c.x = 2400 - r; hit = true; }
    if (c.x - r < 0) { c.x = r; hit = true; }
    if (c.y - r < 0) { c.y = r; hit = true; }
    return hit;
  }

  SB.City = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    AVENUES: AVENUES, STREETS: STREETS, ROAD_HALF: ROAD_HALF,
    PLACES: PLACES, build: build, onRoad: onRoad, inWater: inWater,
    collideCircle: collideCircle,
  };
})();
