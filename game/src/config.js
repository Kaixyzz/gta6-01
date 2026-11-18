// config.js — shared constants for SOLARA BAY: world layout, places,
// missions, tuning. Pure data; every other module reads from here.

export const WORLD = { w: 2600, h: 1900 };

// Road center lines. Vertical roads run north-south, horizontal east-west.
export const ROADS_V = [130, 390, 650, 910, 1170, 1430, 1690, 1950, 2210, 2470];
export const ROADS_H = [130, 350, 570, 790, 1010, 1230, 1450, 1670];
export const ROAD_HALF = 22;

// The south edge is a beach, then water. Nothing drives or walks in water.
export const BEACH_Y = 1692;
export const WATER_Y = 1780;

// Fixed seed: the city layout is identical on every run.
export const SEED = 20261119;

// Key places (all on roads or open ground, never inside a building).
export const PLACES = {
  garage: { x: 260, y: 305 }, // player home base, just south of the garage
  garageAmmo: { x: 300, y: 330 }, // ammo pickup by the garage door
  safehouse: { x: 2470, y: 350 }, // M4 destination: the crossing by the safehouse
  safehouseHealth: { x: 2350, y: 350 }, // health pickup on the road by the safehouse
  downtownHealth: { x: 1300, y: 790 }, // health pickup downtown
  turf: { x: 2080, y: 1340 }, // M3 fight ground, an open lot
  turfLot: { x: 1990, y: 1260, w: 180, h: 150 },
  crossing: { x: 1170, y: 1010 }, // central intersection, ammo pickup
  dropM1: { x: 1690, y: 570 }, // M1 drop-off, a road crossing
  pickupM2: { x: 650, y: 1450 }, // M2 package pickup, a road crossing
  deliverM2: { x: 2210, y: 350 }, // M2 delivery, a road crossing
  goodsM4: { x: 910, y: 570 }, // M4 goods, a road crossing
};

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    reward: 300,
    intro: 'You need wheels. Steal any car, then drive it to the drop-off.',
    objective: 'Steal a car and drive it to the drop-off',
  },
  {
    id: 2,
    title: 'The Pickup',
    reward: 500,
    intro: 'A package is waiting across town. Pick it up and deliver it.',
    objective: 'Collect the package, then deliver it across town',
  },
  {
    id: 3,
    title: 'Turfwars',
    reward: 800,
    intro: 'Four gang members hold the turf. On foot. Make it yours.',
    objective: 'Defeat the 4 gang members at the turf — on foot',
  },
  {
    id: 4,
    title: 'The Getaway',
    reward: 1500,
    intro: 'Grab the goods and run. Every cop in Solara Bay is coming.',
    objective: 'Grab the goods, then outrun the police to the safehouse',
  },
];

export const TUNING = {
  walkSpeed: 175,
  runSpeed: 255,
  playerRadius: 12,
  playerHp: 100,
  startMoney: 50,
  startAmmo: 12,
  carAccel: 380,
  carBrake: 620,
  carMaxSpeed: 430,
  carMaxReverse: 170,
  carTurn: 2.7,
  carRadius: 17,
  trafficSpeed: 135,
  trafficCount: 6,
  pedCount: 14,
  pedSpeed: 55,
  pedFleeSpeed: 225,
  gunCooldown: 0.18,
  bulletSpeed: 760,
  bulletRange: 430,
  enemyHp: 3,
  enemyCount: 4,
  enemyShootInterval: 1.35,
  enemyBulletSpeed: 380,
  enemyDamage: 8,
  enemyRange: 380,
  enemyDropChance: 0.6,
  ammoPickupAmount: 12,
  healthPickupAmount: 35,
  copFootSpeed: 208,
  copCarSpeed: 405,
  copBustDamage: 10,
  copRamDamage: 6,
  wantedDecayQuietSeconds: 10,
  wantedDecayInterval: 4,
  saveKey: 'solara-bay-save-v1',
};

export const PALETTE = {
  ground: '#7fae62',
  block: '#8fb573',
  road: '#3a3f46',
  roadLine: '#e8d44d',
  sidewalk: '#b9b3a4',
  sand: '#e8d8a0',
  water: '#2f7fc4',
  waterDeep: '#2568a8',
  building: ['#d98a5f', '#c96f5a', '#7fa8c9', '#c9b458', '#9a7fc9', '#6fb08a', '#d97f9e'],
  tower: ['#5a6b7d', '#4d5f73', '#6b5a7d'],
  park: '#5e9e4d',
  garage: '#e07b39',
  safehouse: '#3f8f6f',
  carColors: ['#d94f3d', '#3d7dd9', '#e8c33d', '#7dd93d', '#d9d9d9', '#8a5fd9', '#e07ba8'],
  player: '#2fbf71',
  playerCar: '#2fbf71',
  pedColors: ['#f2e6c9', '#e8b4b8', '#a8c8e8', '#c9e8a8', '#e8d8a8'],
  gang: '#c22f2f',
  policeCar: '#20242c',
  policeLightA: '#ff2f2f',
  policeLightB: '#2f6fff',
};
