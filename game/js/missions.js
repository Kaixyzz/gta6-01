// Story missions for SOLARA BAY: four jobs in order, each with its reward.
// The game module owns money and the player; this module owns the mission
// state machine and the current objective marker.

import { TURF, DROPOFF, PICKUP_POINT, DELIVERY_POINT, GOODS_POINT, SAFEHOUSE_POINT } from './city.js';
import { dist } from './rng.js';

export const MISSIONS = [
  { title: 'First Wheels', objective: 'Steal a car and drive to the drop-off.', reward: 300 },
  { title: 'The Pickup', objective: 'Collect the package, then deliver it across town.', reward: 500 },
  { title: 'Turfwars', objective: 'On foot: take the turf — defeat all 4 gang members.', reward: 800 },
  { title: 'The Getaway', objective: 'Grab the goods, then escape the chase to the safehouse.', reward: 1500 },
];

export function makeMissionState() {
  return {
    missionIndex: 0,
    stage: 0,
    kills: 0,
    storyComplete: false,
    marker: { ...DROPOFF },
    gangSpawned: false,
  };
}

export function markerFor(m) {
  if (m.missionIndex === 0) return { ...DROPOFF };
  if (m.missionIndex === 1) return m.stage === 0 ? { ...PICKUP_POINT } : { ...DELIVERY_POINT };
  if (m.missionIndex === 2) return { ...TURF };
  return m.stage === 0 ? { ...GOODS_POINT } : { ...SAFEHOUSE_POINT };
}

// Called every tick with the live game facts. Returns an event string when a
// mission step completes ('m1', 'm2-pickup', 'm2', 'm3-spawn', 'm3',
// 'm4-goods', 'm4') or null.
export function updateMissions(m, g) {
  if (m.storyComplete) return null;
  const reach = (p, r) => dist(g.px, g.py, p.x, p.y) <= r;

  if (m.missionIndex === 0) {
    if (g.inCar && reach(DROPOFF, 85)) {
      m.missionIndex = 1;
      m.stage = 0;
      m.marker = { ...PICKUP_POINT };
      return 'm1';
    }
    return null;
  }
  if (m.missionIndex === 1) {
    if (m.stage === 0 && reach(PICKUP_POINT, 75)) {
      m.stage = 1;
      m.marker = { ...DELIVERY_POINT };
      return 'm2-pickup';
    }
    if (m.stage === 1 && reach(DELIVERY_POINT, 75)) {
      m.missionIndex = 2;
      m.stage = 0;
      m.marker = { ...TURF };
      return 'm2';
    }
    return null;
  }
  if (m.missionIndex === 2) {
    if (!m.gangSpawned && !g.inCar && dist(g.px, g.py, TURF.x, TURF.y) <= 320) {
      m.gangSpawned = true;
      m.stage = 1;
      return 'm3-spawn';
    }
    if (m.gangSpawned && m.kills >= 4) {
      m.missionIndex = 3;
      m.stage = 0;
      m.marker = { ...GOODS_POINT };
      return 'm3';
    }
    return null;
  }
  // Mission 4.
  if (m.stage === 0 && reach(GOODS_POINT, 75)) {
    m.stage = 1;
    m.marker = { ...SAFEHOUSE_POINT };
    return 'm4-goods';
  }
  if (m.stage === 1 && reach(SAFEHOUSE_POINT, 85)) {
    m.storyComplete = true;
    return 'm4';
  }
  return null;
}

export function missionCard(m) {
  const i = Math.min(m.missionIndex, 3);
  const def = MISSIONS[i];
  let objective = def.objective;
  if (m.missionIndex === 1 && m.stage === 1) objective = 'Package collected — deliver it to the east side.';
  if (m.missionIndex === 2 && m.gangSpawned) objective = `Take the turf — gang members left: ${Math.max(0, 4 - m.kills)}.`;
  if (m.missionIndex === 3 && m.stage === 1) objective = 'The whole Bay PD is on you — reach the safehouse!';
  return {
    title: `Mission ${i + 1}/4 — ${def.title}`,
    objective,
    reward: `$${def.reward}`,
  };
}
