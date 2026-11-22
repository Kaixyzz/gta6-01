// Story missions, crew and radio dialogue for SOLARA BAY.
// All names, characters and lines are original inventions for this game.
export const CREW = [
  {
    id: 'driver', name: 'Rosa Vega', role: 'Driver',
    ability: 'SWAP PLATES', key: 'Q', cooldown: 45,
    desc: 'Drops 1 wanted star — fresh plates, clean slate.',
  },
  {
    id: 'mechanic', name: 'Tomas Ibarra', role: 'Mechanic',
    ability: 'QUICK FIX', key: 'R', cooldown: 60,
    desc: 'Repairs your car to full condition on the spot.',
  },
  {
    id: 'lookout', name: 'Nia Solano', role: 'Lookout',
    ability: 'EYES OUT', key: '', cooldown: 0,
    desc: 'Passive: every cop nearby is marked on the minimap.',
  },
];

export const SBPD_UNITS = ['GULL-1', 'TIDE-3', 'PELICAN-2', 'REEF-5', 'SURF-7', 'GULL-4', 'TIDE-9', 'REEF-2'];

// Each mission: stages with a title, a one-line objective and a NEXT line.
// The driver asserts PAYMENTS (reward increments), not absolute totals.
export const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 300,
    night: false,
    stages: [
      { title: 'TAKE THE CAR', objective: 'Steal any car — press E near one', next: 'NEXT: Drive it to the drop-off' },
      { title: 'DROP IT OFF', objective: 'Deliver the car to the marked drop-off', next: 'NEXT: The Pickup' },
    ],
    dialogue: [
      { who: 'Rosa Vega', line: 'Any car on the street works. Grab one and go — SBPD is lazy before noon.' },
      { who: 'Nia Solano', line: 'Drop-off is on the east side. Keep it smooth, no dents.' },
    ],
  },
  {
    title: 'The Pickup',
    reward: 500,
    night: false,
    stages: [
      { title: 'GET THE PACKAGE', objective: 'Drive to the pickup point and collect the package', next: 'NEXT: Deliver it across town' },
      { title: 'DELIVER', objective: 'Deliver the package to the marked address', next: 'NEXT: Turfwars' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Package is light, car is heavy. You will be fine.' },
      { who: 'Rosa Vega', line: 'Harbor side first, then all the way east. Watch the lights.' },
    ],
  },
  {
    title: 'Turfwars',
    reward: 800,
    night: false,
    stages: [
      { title: 'CLEAR THE TURF', objective: 'On foot — defeat the 4 gang members at the park', next: 'NEXT: Hold the block' },
      { title: 'HOLD THE BLOCK', objective: 'Reach the marked corner to claim the turf', next: 'NEXT: The Getaway' },
    ],
    dialogue: [
      { who: 'Nia Solano', line: 'Four of them on the park block. They see you — move!' },
      { who: 'Rosa Vega', line: 'Block is yours when you stand on the corner. Do not rush it.' },
    ],
  },
  {
    title: 'The Getaway',
    reward: 1500,
    night: true,
    stages: [
      { title: 'GRAB THE GOODS', objective: 'Drive to the stash and grab the goods', next: 'NEXT: Lose the heat' },
      { title: 'LOSE THE HEAT', objective: 'Escape the SBPD chase — reach the safehouse', next: 'NEXT: The Score' },
    ],
    dialogue: [
      { who: 'Nia Solano', line: 'SBPD dispatch is awake tonight. GULL-1 is already rolling.' },
      { who: 'Rosa Vega', line: 'Three stars means they will not give up. Lose them in the alleys.' },
    ],
  },
  {
    title: 'The Score',
    reward: 800,
    night: false,
    stages: [
      { title: 'BREACH THE VAULT', objective: 'On foot — defeat the 3 bank guards', next: 'NEXT: Grab the cash' },
      { title: 'GRAB THE CASH', objective: 'Walk to the cash in the middle of the plaza', next: 'NEXT: Getaway to the garage' },
      { title: 'GETAWAY', objective: 'Drive to the garage — patrol cars only, stay moving', next: 'NEXT: King of the Bay' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Vault guards are armored in attitude only. Three shots each.' },
      { who: 'Nia Solano', line: 'Cash is in the middle of the plaza. Grab it and run — cars only behind you.' },
    ],
  },
  {
    title: 'King of the Bay',
    reward: 1500,
    night: true,
    stages: [
      { title: 'TAKE THE SPORTS CAR', objective: 'Steal the boss sports car from the marina', next: 'NEXT: Outrun SBPD' },
      { title: 'OUTRUN SBPD', objective: 'Escape the big chase — reach the safehouse', next: 'NEXT: The Big One' },
    ],
    dialogue: [
      { who: 'Rosa Vega', line: 'That sports car is the boss’s pride. Take it and the whole bay wakes up.' },
      { who: 'Nia Solano', line: 'Four patrol cars, two on foot. The marina road is your only way out.' },
    ],
  },
  {
    title: 'The Big One',
    reward: 2000,
    night: false,
    stages: [
      { title: 'BREACH THE CASINO', objective: 'On foot — defeat the 4 casino guards', next: 'NEXT: Grab the cash' },
      { title: 'GRAB THE CASH', objective: 'Walk to the cash inside the casino plaza', next: 'NEXT: The big getaway' },
      { title: 'THE BIG GETAWAY', objective: 'Escape the biggest chase yet — 5 patrol cars — to the safehouse', next: 'NEXT: Story Complete' },
    ],
    dialogue: [
      { who: 'Tomas Ibarra', line: 'Casino vault, four guards. This is the one we talked about for months.' },
      { who: 'Nia Solano', line: 'Five patrol cars out there. Drive like the whole bay is watching — it is.' },
      { who: 'Rosa Vega', line: 'One more turn and we are legends of Solara Bay.' },
    ],
  },
];

export function standingStatus(v) {
  if (v >= 70) return 'FRIENDLY';
  if (v >= 40) return 'NEUTRAL';
  return 'WARY';
}
