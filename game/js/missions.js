// The six story missions. Each entry names the reward and the objective
// line the mission card shows; the flow (stages, markers, triggers) lives
// in game.js so this file stays pure data.
export const MISSIONS = [
  {
    id: 0,
    title: 'First Wheels',
    objective: 'Steal a car and drive it to the drop-off',
    reward: 300,
  },
  {
    id: 1,
    title: 'The Pickup',
    objective: 'Collect the package, then deliver it',
    reward: 500,
  },
  {
    id: 2,
    title: 'Turf Wars',
    objective: 'Defeat the 4 gang members at the turf',
    reward: 800,
  },
  {
    id: 3,
    title: 'The Getaway',
    objective: 'Grab the goods and escape the police to the safehouse',
    reward: 1500,
  },
  {
    id: 4,
    title: 'The Score',
    objective: 'Rob the bank vault, grab the cash, drive it to the garage',
    reward: 800,
  },
  {
    id: 5,
    title: 'King of the Bay',
    objective: 'Steal the boss sports car and escape to the safehouse',
    reward: 1500,
  },
];

export function missionTitle(i) {
  return MISSIONS[i] ? MISSIONS[i].title : 'Story Complete';
}

export function missionObjective(i) {
  return MISSIONS[i] ? MISSIONS[i].objective : 'You rule Solara Bay.';
}

export function missionReward(i) {
  return MISSIONS[i] ? MISSIONS[i].reward : 0;
}
