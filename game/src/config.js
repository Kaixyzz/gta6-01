// SOLARA BAY — all tuning in one place. Data only; the modules below
// read these values, they never change them at runtime.
//
// The city is a 3840 x 2880 coastal grid. Five north-south avenues and
// four east-west streets, 170 wide, with the beach and the sea on the
// eastern edge and the harbor docks tucked into the south-west corner.
export const CFG = {
  // --- map ---
  WORLD_W: 3840,
  WORLD_H: 2880,
  ROAD_W: 170,
  ROADS_V: [400, 1100, 1800, 2500, 3200],
  ROADS_H: [400, 1100, 1800, 2500],
  BEACH_X: 3440,
  WATER_X: 3720,
  HARBOR: { x0: 80, y0: 2620, x1: 980, y1: 2880 },

  // --- the player on foot ---
  PLAYER_SPEED: 230,
  PLAYER_SPRINT: 345,
  PLAYER_HP: 100,
  START_MONEY: 50,
  // Story payouts, in mission order. Cash after each one:
  // 350, then 850, then 1650, then 3150.
  PAYOUTS: [300, 500, 800, 1500],

  // --- the pistol ---
  PISTOL_AMMO_START: 12,
  PISTOL_MAX_AMMO: 48,
  PISTOL_RATE: 0.22,
  PISTOL_RANGE: 620,
  BULLET_SPEED: 900,

  // --- wanted level and the law ---
  WANTED_MAX: 5,
  WANTED_DECAY_QUIET_S: 12,
  BUSTED_PENALTY: 0.2,

  // --- view and persistence ---
  VIEW_W: 1280,
  VIEW_H: 720,
  SAVE_KEY: 'solara-bay-save-v1',

  // --- story locations. Every one sits on open road, never inside a block.
  SPAWN: { x: 400, y: 400 },
  GARAGE: { x: 1800, y: 2500 },
  GOLD_SPOT: { x: 1100, y: 1800 },
  DELIVER: { x: 3200, y: 400 },
  TURF: { x: 2500, y: 1100 },
  SAFEHOUSE: { x: 400, y: 2500 },
  HOSPITAL: { x: 400, y: 400 },

  // --- look ---
  PALETTE: {
    grass: '#5da24a',
    grass2: '#54944a',
    road: '#3a3f47',
    roadEdge: '#2c3038',
    dash: '#e8d44d',
    sidewalk: '#8a8f96',
    sand: '#e6cf9a',
    water: '#2f7fb8',
    water2: '#2a6ea3',
    dock: '#7a5a3a',
  },
  BUILDING_COLORS: ['#c96f4a', '#d8a24a', '#7fa8c9', '#9a7fc9', '#c95f7a', '#6fae7f', '#b8b0a0', '#e07840'],
};
