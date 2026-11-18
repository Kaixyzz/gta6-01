// city.js — the map of Solara Bay: street grid, blocks, buildings, beach
// and water, plus the collision helpers everything else uses.
//
// Layout: vertical avenues and horizontal streets every 320 px. The road
// grid is fixed (the playthrough driver navigates on it), the buildings
// inside the blocks are rolled from the seed.
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};

  SB.WORLD_W = 2560;
  SB.WORLD_H = 1920;
  SB.AVENUES = [320, 640, 960, 1280, 1600, 1920, 2240];
  SB.STREETS = [320, 640, 960, 1280, 1600];
  SB.ROAD_HALF = 48;
  SB.BEACH_X = 2336;   // sand starts here
  SB.WATER_X = 2432;   // open water starts here (impassable)
  SB.SEED = 20261119;

  // Spots that must stay clear of buildings: the garage driveway, parked
  // cars and the turf intersection's surroundings.
  SB.CLEAR_SPOTS = [
    { x: 420, y: 545, r: 90 },   // garage driveway / parked car
    { x: 760, y: 420, r: 80 },
    { x: 1040, y: 1100, r: 80 },
    { x: 1700, y: 760, r: 80 },
    { x: 1400, y: 1420, r: 80 },
    { x: 460, y: 1360, r: 80 },
    { x: 1115, y: 750, r: 95 },   // downtown tower
    { x: 1442, y: 1107, r: 95 }   // downtown tower
  ];

  SB.buildCity = function (seed) {
    var rnd = SB.mulberry32(seed);
    var palette = ['#e8b04b', '#d97b6c', '#7fb069', '#6a9fb5', '#c9a0dc',
                   '#e07a5f', '#81b29a', '#f2cc8f', '#b08968', '#90a8c3'];
    var buildings = [];
    var trees = [];
    var xs = [0].concat(SB.AVENUES, [SB.WORLD_W]);
    var ys = [0].concat(SB.STREETS, [SB.WORLD_H]);

    function clearOfSpots(x, y, w, h) {
      for (var i = 0; i < SB.CLEAR_SPOTS.length; i++) {
        var s = SB.CLEAR_SPOTS[i];
        var cx = SB.clamp(s.x, x, x + w);
        var cy = SB.clamp(s.y, y, y + h);
        if (SB.dist(s.x, s.y, cx, cy) < s.r) return false;
      }
      return true;
    }

    for (var bi = 0; bi < xs.length - 1; bi++) {
      for (var bj = 0; bj < ys.length - 1; bj++) {
        var x0 = xs[bi], x1 = xs[bi + 1];
        var y0 = ys[bj], y1 = ys[bj + 1];
        // The far-east column is beach and water: no buildings there.
        if (x0 >= SB.BEACH_X - 320) continue;
        var ix0 = x0 + 56, ix1 = Math.min(x1 - 56, SB.BEACH_X - 8);
        var iy0 = y0 + 56, iy1 = y1 - 56;
        if (ix1 - ix0 < 90 || iy1 - iy0 < 80) continue;
        // The garage block and the safehouse block get hand-placed buildings.
        var isGarageBlock = (x0 === 320 && y0 === 320);
        var isSafeBlock = (x0 === 1920 && y0 === 1280);
        if (isGarageBlock || isSafeBlock) continue;
        var roll = rnd();
        if (roll < 0.16) {
          // A little park: trees only, no buildings.
          for (var t = 0; t < 4; t++) {
            trees.push({
              x: ix0 + 20 + rnd() * (ix1 - ix0 - 40),
              y: iy0 + 20 + rnd() * (iy1 - iy0 - 40),
              r: 12 + rnd() * 8
            });
          }
          continue;
        }
        var count = roll < 0.62 ? 1 : 2;
        for (var b = 0; b < count; b++) {
          var w = 70 + rnd() * 70;
          var h = 55 + rnd() * 55;
          var bx, by;
          if (count === 1) {
            bx = ix0 + 10 + rnd() * Math.max(1, ix1 - ix0 - w - 20);
            by = iy0 + 10 + rnd() * Math.max(1, iy1 - iy0 - h - 20);
          } else {
            bx = b === 0 ? ix0 + 8 : ix1 - w - 8;
            by = iy0 + 8 + rnd() * Math.max(1, iy1 - iy0 - h - 16);
          }
          if (!clearOfSpots(bx, by, w, h)) continue;
          buildings.push({
            x: bx, y: by, w: w, h: h,
            color: palette[Math.floor(rnd() * palette.length)],
            tall: rnd() < 0.22
          });
        }
        // A street tree or two on most blocks.
        if (rnd() < 0.5) {
          trees.push({
            x: ix0 + 14 + rnd() * (ix1 - ix0 - 28),
            y: iy0 + 14 + rnd() * (iy1 - iy0 - 28),
            r: 10 + rnd() * 7
          });
        }
      }
    }

    // Hand-placed landmarks.
    buildings.push({ x: 400, y: 400, w: 140, h: 95, color: '#b5543f', label: 'GARAGE', tall: false });
    buildings.push({ x: 2040, y: 1430, w: 120, h: 85, color: '#4f7fa8', label: 'SAFEHOUSE', tall: false });
    // A pair of downtown towers near the centre.
    buildings.push({ x: 1060, y: 700, w: 110, h: 100, color: '#5d7ea6', tall: true });
    buildings.push({ x: 1390, y: 1060, w: 105, h: 95, color: '#7a6a9e', tall: true });

    // Palm trees along the beach.
    for (var p = 0; p < 9; p++) {
      trees.push({ x: 2362 + rnd() * 48, y: 120 + p * 190 + rnd() * 60, r: 13, palm: true });
    }
    return { buildings: buildings, trees: trees };
  };

  SB.onRoad = function (x, y) {
    for (var i = 0; i < SB.AVENUES.length; i++) {
      if (Math.abs(x - SB.AVENUES[i]) <= SB.ROAD_HALF) return true;
    }
    for (var j = 0; j < SB.STREETS.length; j++) {
      if (Math.abs(y - SB.STREETS[j]) <= SB.ROAD_HALF) return true;
    }
    return false;
  };

  SB.nearestIntersection = function (x, y) {
    var best = null, bd = 1e18;
    for (var i = 0; i < SB.AVENUES.length; i++) {
      for (var j = 0; j < SB.STREETS.length; j++) {
        var d = SB.dist(x, y, SB.AVENUES[i], SB.STREETS[j]);
        if (d < bd) { bd = d; best = { x: SB.AVENUES[i], y: SB.STREETS[j] }; }
      }
    }
    return best;
  };

  // Circle-vs-rectangle test against one building.
  function circleHitsRect(x, y, r, b) {
    var cx = SB.clamp(x, b.x, b.x + b.w);
    var cy = SB.clamp(y, b.y, b.y + b.h);
    var dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  SB.hitsBuilding = function (city, x, y, r) {
    for (var i = 0; i < city.buildings.length; i++) {
      if (circleHitsRect(x, y, r, city.buildings[i])) return city.buildings[i];
    }
    return null;
  };

  // Push a circle out of buildings, water and the world edge. Returns true
  // when anything pushed it (so callers can bleed speed off a crash).
  SB.resolveCircle = function (city, p, r) {
    var pushed = false;
    for (var i = 0; i < city.buildings.length; i++) {
      var b = city.buildings[i];
      var cx = SB.clamp(p.x, b.x, b.x + b.w);
      var cy = SB.clamp(p.y, b.y, b.y + b.h);
      var dx = p.x - cx, dy = p.y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      pushed = true;
      if (d2 < 0.0001) {
        // Centre inside the rect: shove out along the smallest penetration.
        var l = p.x - b.x, rr = b.x + b.w - p.x, t = p.y - b.y, bo = b.y + b.h - p.y;
        var m = Math.min(l, rr, t, bo);
        if (m === l) p.x = b.x - r;
        else if (m === rr) p.x = b.x + b.w + r;
        else if (m === t) p.y = b.y - r;
        else p.y = b.y + b.h + r;
      } else {
        var d = Math.sqrt(d2);
        p.x = cx + dx / d * r;
        p.y = cy + dy / d * r;
      }
    }
    if (p.x + r > SB.WATER_X) { p.x = SB.WATER_X - r; pushed = true; }
    if (p.x < r) { p.x = r; pushed = true; }
    if (p.y < r) { p.y = r; pushed = true; }
    if (p.y > SB.WORLD_H - r) { p.y = SB.WORLD_H - r; pushed = true; }
    return pushed;
  };
})();
