// missions.js — story missions, crew, dialogue, taxi fares and street races.
// All names, characters and lines are original inventions for SOLARA BAY.
// Money ladder (unchanged since #20): 50 → 350 → 850 → 1650 → 3150 → 3950
// → 5450 → 7450. The driver asserts PAYMENTS, not absolute totals.

export const CREW = [
  { name: 'Rosa Vega', role: 'Driver', ability: 'SWAP PLATES', key: 'Q', desc: 'Drop 1 wanted star', cooldown: 45 },
  { name: 'Tomas Ibarra', role: 'Mechanic', ability: 'QUICK FIX', key: 'R', desc: 'Repair the car to full', cooldown: 60 },
  { name: 'Nia Solano', role: 'Lookout', ability: 'EYES OUT', key: '', desc: 'Police marked on the minimap', cooldown: 0 },
];

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', reward: 300,
    stages: [
      { title: 'TAKE THE CAR', objective: 'Steal any car — press E next to one', next: 'Drop it off' },
      { title: 'DROP IT OFF', objective: 'Drive the car to the marked drop-off', next: 'The Pickup' },
    ],
    dialogue: [
      { who: 'Rosa Vega', line: 'First job, easy money. Grab any car and bring it to the mark.' },
      { who: 'Nia Solano', line: 'SBPD is quiet tonight. Keep it that way.' },
    ],
  },
  {
    id: 2, title: 'The Pickup', reward: 500,
    stages: [
      { title: 'GET THE PACKAGE', objective: 'Drive to the pickup point and collect the package', next: 'Deliver it' },
      { title: 'DELIVER', objective: 'Deliver the package to the destination', next: 'Turfwars' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Package is light, car is fast. Don’t scratch the paint.' },
      { who: 'Rosa Vega', line: 'Cut through downtown — lights are green all the way.' },
    ],
  },
  {
    id: 3, title: 'Turfwars', reward: 800,
    stages: [
      { title: 'CLEAR THE TURF', objective: 'On foot — defeat the 4 gang members at the turf', next: 'Hold the block' },
      { title: 'HOLD THE BLOCK', objective: 'Reach the marked point and hold the block', next: 'The Getaway' },
    ],
    dialogue: [
      { who: 'Nia Solano', line: 'Four of them on the turf. Three shots each — make them count.' },
      { who: 'Tomas Ibarra', line: 'Ammo crates by the garage if you run dry.' },
    ],
  },
  {
    id: 4, title: 'The Getaway', reward: 1500, night: true,
    stages: [
      { title: 'GRAB THE GOODS', objective: 'Drive to the boulevard and grab the goods', next: 'Lose the heat' },
      { title: 'LOSE THE HEAT', objective: 'Escape the SBPD chase — reach the safehouse', next: 'The Score' },
    ],
    dialogue: [
      { who: 'Rosa Vega', line: 'Goods are on the boulevard. Grab them and run — SBPD will be all over you.' },
      { who: 'Nia Solano', line: 'SBPD is on you — three stars! Lose them at the safehouse.' },
      { who: 'Tomas Ibarra', line: 'Press Q and I’ll swap your plates. R fixes the car.' },
    ],
  },
  {
    id: 5, title: 'The Score', reward: 800,
    stages: [
      { title: 'BREACH THE VAULT', objective: 'On foot — defeat the 3 bank guards', next: 'Grab the cash' },
      { title: 'GRAB THE CASH', objective: 'Walk over the cash in the middle of the plaza', next: 'Getaway' },
      { title: 'GETAWAY', objective: 'Drive the getaway car to the garage — wanted 2', next: 'King of the Bay' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Vault guards ahead. Three shots each.' },
      { who: 'Nia Solano', line: 'Cash is in the middle of the plaza. Grab it and drive — patrol cars only.' },
    ],
  },
  {
    id: 6, title: 'King of the Bay', reward: 1500, night: true,
    stages: [
      { title: 'TAKE THE SPORTS CAR', objective: 'Steal the rival boss’s red sports car from the marina', next: 'Outrun SBPD' },
      { title: 'OUTRUN SBPD', objective: 'Escape the big chase — reach the safehouse', next: 'The Big One' },
    ],
    dialogue: [
      { who: 'Rosa Vega', line: 'The boss’s red sports car is parked at the marina. It’s ours tonight.' },
      { who: 'Nia Solano', line: 'Four patrol cars and foot cops — drive like the bay is on fire.' },
    ],
  },
  {
    id: 7, title: 'The Big One', reward: 2000,
    stages: [
      { title: 'BREACH THE CASINO', objective: 'On foot — defeat the 4 casino guards', next: 'Grab the cash' },
      { title: 'GRAB THE CASH', objective: 'Walk over the cash in the middle of the plaza', next: 'The big getaway' },
      { title: 'THE BIG GETAWAY', objective: 'Escape the biggest chase yet — 5 patrol cars — to the safehouse', next: 'Story Complete' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Casino vault. Four guards. Last job — make it clean.' },
      { who: 'Rosa Vega', line: 'Cash in hand. Five patrol cars out there — this is the big one.' },
      { who: 'Nia Solano', line: 'Safehouse, now. Don’t stop for anything.' },
    ],
  },
];

// Mission anchor points (world coordinates). Markers sit on roads/plazas so
// the driver can reach them by car or on foot.
export const MISSION_SPOTS = {
  m1Dropoff: { x: 1600, y: 640 },
  m2Pickup: { x: 960, y: 320 },
  m2Delivery: { x: 1920, y: 1280 },
  m4Goods: { x: 2240, y: 640 },
  m5Bank: { x: 1320, y: 1140 },
  m6SportsCar: { x: 2380, y: 320 },
  m7Casino: { x: 1760, y: 1140 },
  safehouse: { x: 1920, y: 1600 },
  garage: { x: 640, y: 320 },
  turf: { x: 800, y: 1120 },
};

export function standingStatus(v) {
  if (v >= 70) return 'FRIENDLY';
  if (v >= 40) return 'NEUTRAL';
  return 'WARY';
}

// --- taxi fares ---------------------------------------------------------------
export function makeTaxi() {
  return { active: false, customer: null, hasPassenger: false, dest: null, fares: 0, cooldown: 0 };
}

// --- races --------------------------------------------------------------------
export function makeRaces(world) {
  return {
    list: world.raceStarts.map((r) => ({ name: r.name, start: r.start, checkpoints: r.checkpoints, timeLimit: r.timeLimit })),
    won: 0,
    wonNames: [],
  };
}
