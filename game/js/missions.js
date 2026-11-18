// Story missions for SOLARA BAY v2: six jobs, side stashes, rewards, objectives.
import { SPOTS } from './city.js';

export const MISSIONS = [
  {
    id: 0, title: 'M1 — First Wheels', reward: 300,
    objective: 'Steal a car and drive it to the drop-off',
    marker: () => ({ x: SPOTS.dropoff.x, y: SPOTS.dropoff.y }),
  },
  {
    id: 1, title: 'M2 — The Pickup', reward: 500,
    objective: 'Collect the package, then deliver it',
    marker: (stage) => stage === 0
      ? { x: SPOTS.pickup.x, y: SPOTS.pickup.y }
      : { x: SPOTS.delivery.x, y: SPOTS.delivery.y },
  },
  {
    id: 2, title: 'M3 — Turfwars', reward: 800,
    objective: 'Defeat 4 gang members at the turf (on foot)',
    marker: () => ({ x: SPOTS.turf.x, y: SPOTS.turf.y }),
  },
  {
    id: 3, title: 'M4 — The Getaway', reward: 1500,
    objective: 'Grab the goods, then escape the chase to the safehouse',
    marker: (stage) => stage === 0
      ? { x: SPOTS.goods.x, y: SPOTS.goods.y }
      : { x: SPOTS.safehouse.x, y: SPOTS.safehouse.y },
  },
  {
    id: 4, title: 'M5 — The Score', reward: 800,
    objective: 'Rob the bank vault, grab the cash, drive to the garage',
    marker: (stage) => stage === 0
      ? { x: SPOTS.bankVault.x, y: SPOTS.bankVault.y }
      : stage === 1
        ? { x: SPOTS.bankVault.x + 70, y: SPOTS.bankVault.y + 40 }
        : { x: SPOTS.garage.x, y: SPOTS.garage.y },
  },
  {
    id: 5, title: 'M6 — King of the Bay', reward: 1500,
    objective: 'Steal the boss sports car, escape the biggest chase',
    marker: (stage) => stage === 0
      ? { x: SPOTS.marinaCar.x, y: SPOTS.marinaCar.y }
      : { x: SPOTS.safehouse.x, y: SPOTS.safehouse.y },
  },
];

export const STASH_SPOTS = [
  { x: SPOTS.beach.x, y: SPOTS.beach.y, label: 'Beach stash' },
  { x: SPOTS.park.x, y: SPOTS.park.y, label: 'Park stash' },
  { x: SPOTS.marina.x, y: SPOTS.marina.y, label: 'Marina stash' },
];

export function missionMarker(missionIndex, stage) {
  const m = MISSIONS[missionIndex];
  return m ? m.marker(stage) : null;
}

export function missionTitle(missionIndex) {
  const m = MISSIONS[missionIndex];
  return m ? m.title : 'Story Complete';
}

export function missionObjective(missionIndex, stage, kills, killsNeeded) {
  const m = MISSIONS[missionIndex];
  if (!m) return 'You are the King of the Bay.';
  if (missionIndex === 2) return `Defeat the gang: ${kills}/${killsNeeded} down`;
  if (missionIndex === 4 && stage === 0) return `Defeat the guards: ${kills}/${killsNeeded} down`;
  if (missionIndex === 4 && stage === 1) return 'Grab the cash from the vault';
  if (missionIndex === 4 && stage === 2) return 'Drive the getaway car to the garage (wanted 2★)';
  if (missionIndex === 3 && stage === 1) return 'Escape the police — reach the safehouse!';
  if (missionIndex === 5 && stage === 1) return 'Escape the biggest chase — reach the safehouse!';
  if (missionIndex === 0) return 'Steal a car (E) and drive to the drop-off';
  if (missionIndex === 1 && stage === 0) return 'Drive to the pickup point';
  if (missionIndex === 1 && stage === 1) return 'Deliver the package';
  if (missionIndex === 3 && stage === 0) return 'Drive to the goods pickup';
  if (missionIndex === 5 && stage === 0) return 'Steal the boss sports car at the marina';
  return m.objective;
}
