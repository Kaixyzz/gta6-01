// SOLARA BAY city: grid layout, buildings, beach, marina, park, landmarks,
// and the collision helpers every other module uses. Deterministic: the
// whole layout comes from one fixed seed, so every run builds the same city.
(function () {
  'use strict';

  var WORLD_W = 2560;
  var WORLD_H = 1920;
  var AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
  var STREETS = [320, 640, 960, 1280, 1600];
  var ROAD_HALF = 48;

  // Block bands between the road strips (roads are 96 wide, centred on the
  // avenue/street lines). A block is [x0, x1] x [y0, y1] of buildable land.
  var XBANDS = [[0, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1872], [1968, 2192], [2288, 2440]];
  var YBANDS = [[0, 272], [368, 592], [688, 912], [1008, 1232], [1328, 1552], [1648, 1800]];

  var rng = window.SBRng.makeRng(1337);

  var PALETTE = ['#e8b04b', '#4fa8a0', '#d96f4e', '#7a8ba0', '#e6d7b8', '#5b7fa6', '#c98a5a', '#8fae6b'];
  var ROOFS = ['#b98a3a', '#3e8a80', '#b25a3e', '#5f7086', '#c9b183', '#47688a'];

  var buildings = [];
  var trees = [];
  var palms = [];

  function addBuilding(x, y, w, h, kind) {
    var b = {
      x: x, y: y, w: w, h: h,
      height: 1 + Math.floor(rng.next() * 3),
      color: rng.pick(PALETTE),
      roof: rng.pick(ROOFS),
      kind: kind || 'block'
    };
    buildings.push(b);
    return b;
  }

  // Special plots (fixed, never random).
  addBuilding(380, 110, 150, 110, 'garage');      // player home base
  addBuilding(1400, 1030, 150, 110, 'bank');      // downtown bank (plaza west)
  addBuilding(2300, 1670, 120, 90, 'safehouse');  // south-east safehouse

  // Ordinary blocks: one seeded building each (some blocks stay empty lots).
  for (var xi = 0; xi < XBANDS.length; xi++) {
    for (var yi = 0; yi < YBANDS.length; yi++) {
      // Park block, marina plaza, garage/bank/safehouse blocks, beach strip.
      if (xi === 3 && yi === 2) continue; // park
      if (xi === 6 && yi === 4) continue; // marina plaza
      if (xi === 1 && yi === 0) continue; // garage block
      if (xi === 4 && yi === 3) continue; // bank block
      if (xi === 7 && yi === 5) continue; // safehouse block
      if (xi === 7) continue;             // promenade / sand strip
      var bx0 = XBANDS[xi][0], bx1 = XBANDS[xi][1];
      var by0 = YBANDS[yi][0], by1 = YBANDS[yi][1];
      if (yi === 5) by1 = Math.min(by1, 1700); // keep clear of the south sand
      if (!rng.chance(0.82)) continue; // empty lot
      var bw = rng.range(110, Math.max(120, bx1 - bx0 - 32));
      var bh = rng.range(90, Math.max(100, by1 - by0 - 32));
      var bx = rng.range(bx0 + 10, bx1 - bw - 10);
      var by = rng.range(by0 + 10, by1 - bh - 10);
      addBuilding(bx, by, bw, bh, 'block');
    }
  }

  // Park trees (open ground, decorative, no collision).
  for (var i = 0; i < 14; i++) {
    trees.push({ x: rng.range(1030, 1210), y: rng.range(710, 890), r: rng.range(14, 22) });
  }
  // Promenade palms and beach umbrellas.
  for (var py = 120; py < 1800; py += 150) {
    palms.push({ x: 2270, y: py + rng.range(-20, 20), r: 12 });
  }
  for (var uy = 400; uy < 1700; uy += 260) {
    palms.push({ x: 2380, y: uy, r: 12, umbrella: true });
  }

  var water = [
    { x: 2440, y: 0, w: 120, h: 1920 },   // east sea
    { x: 0, y: 1800, w: 2440, h: 120 }    // south sea
  ];
  var sand = [
    { x: 2320, y: 0, w: 120, h: 1920 },
    { x: 0, y: 1720, w: 2320, h: 80 }
  ];

  // Fixed landmarks and mission points (all on roads or open plazas).
  var LAND = {
    spawn: { x: 440, y: 320 },
    garage: { x: 440, y: 320 },
    safehouse: { x: 2240, y: 1600 },
    bank: { x: 1340, y: 1120 },
    bankVault: { x: 1320, y: 1140 },
    turf: { x: 640, y: 1280 },
    dropoff: { x: 1600, y: 960 },
    pickup: { x: 960, y: 320 },
    delivery: { x: 1920, y: 1280 },
    goods: { x: 1600, y: 640 },
    marinaCar: { x: 2080, y: 1520 },
    stashes: [
      { x: 2380, y: 1700, name: 'beach' },
      { x: 1120, y: 800, name: 'park' },
      { x: 2050, y: 1500, name: 'marina' }
    ],
    ammoSpots: [
      { x: 480, y: 360 },
      { x: 1280, y: 960 }
    ],
    healthSpot: { x: 960, y: 1280 }
  };

  function circleHitsRect(cx, cy, r, rc) {
    var nx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
    var ny = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function isBlocked(x, y, r) {
    if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
    for (var i = 0; i < buildings.length; i++) {
      if (circleHitsRect(x, y, r, buildings[i])) return true;
    }
    for (var j = 0; j < water.length; j++) {
      if (circleHitsRect(x, y, r, water[j])) return true;
    }
    return false;
  }

  // Axis-separated movement with collision: never tunnels through a wall.
  function moveCircle(e, dx, dy, r) {
    var hitX = false, hitY = false;
    var nx = e.x + dx;
    if (!isBlocked(nx, e.y, r)) e.x = nx; else hitX = true;
    var ny = e.y + dy;
    if (!isBlocked(e.x, ny, r)) e.y = ny; else hitY = true;
    return { hitX: hitX, hitY: hitY };
  }

  function pointInRect(x, y, rc, pad) {
    return x >= rc.x - pad && x <= rc.x + rc.w + pad && y >= rc.y - pad && y <= rc.y + rc.h + pad;
  }

  // Line of sight: sample along the segment; blocked if a sample lands in
  // a building (small margin). Used for enemy shots.
  function segmentBlocked(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var dist = Math.hypot(dx, dy);
    var steps = Math.max(1, Math.ceil(dist / 16));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var sx = x1 + dx * t, sy = y1 + dy * t;
      for (var b = 0; b < buildings.length; b++) {
        if (pointInRect(sx, sy, buildings[b], 2)) return true;
      }
    }
    return false;
  }

  // Nearest open point to (x, y) by spiral search (safety net for shoves).
  function findOpenSpot(x, y, r) {
    if (!isBlocked(x, y, r)) return { x: x, y: y };
    for (var rad = 16; rad <= 320; rad += 16) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2;
        var nx = x + Math.cos(ang) * rad, ny = y + Math.sin(ang) * rad;
        if (!isBlocked(nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return { x: x, y: y };
  }

  function onRoad(x, y) {
    for (var i = 0; i < AVENUES.length; i++) {
      if (Math.abs(x - AVENUES[i]) <= ROAD_HALF + 8) return true;
    }
    for (var j = 0; j < STREETS.length; j++) {
      if (Math.abs(y - STREETS[j]) <= ROAD_HALF + 8) return true;
    }
    return false;
  }

  function nearestIntersection(x, y) {
    var best = null, bd = 1e18;
    for (var i = 0; i < AVENUES.length; i++) {
      for (var j = 0; j < STREETS.length; j++) {
        var d = Math.hypot(AVENUES[i] - x, STREETS[j] - y);
        if (d < bd) { bd = d; best = { x: AVENUES[i], y: STREETS[j] }; }
      }
    }
    return best;
  }

  window.SBCity = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    AVENUES: AVENUES, STREETS: STREETS, ROAD_HALF: ROAD_HALF,
    buildings: buildings, trees: trees, palms: palms,
    water: water, sand: sand, LAND: LAND,
    isBlocked: isBlocked, moveCircle: moveCircle,
    segmentBlocked: segmentBlocked, findOpenSpot: findOpenSpot,
    onRoad: onRoad, nearestIntersection: nearestIntersection
  };
})();
