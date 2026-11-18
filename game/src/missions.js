// The four story missions of SOLARA BAY, in order. Each mission has stages;
// finishing a stage moves the story on, pays the reward, and saves the game
// only after the mission index has already been advanced.
import { POINTS } from './world.js';
import { dist } from './rng.js';
import { spawnGang } from './actors.js';

export const MISSION_DEFS = [
  {
    title: 'First Wheels',
    reward: 300,
    stages: [
      { text: 'Steal a car — walk up to one and press E', marker: 'car' },
      { text: 'Drive to the drop-off', marker: 'dropoff' },
    ],
  },
  {
    title: 'The Pickup',
    reward: 500,
    stages: [
      { text: 'Drive to the pickup point', marker: 'pickup' },
      { text: 'Deliver the package to the docks', marker: 'delivery' },
    ],
  },
  {
    title: 'Turfwars',
    reward: 800,
    stages: [
      { text: 'Head to the turf at the plaza', marker: 'turf' },
      { text: 'Defeat the gang', marker: 'turf' },
    ],
  },
  {
    title: 'The Getaway',
    reward: 1500,
    stages: [
      { text: 'Grab the goods', marker: 'goods' },
      { text: 'Escape to the safehouse — lose the chase', marker: 'safehouse' },
    ],
  },
];

export function missionTitle(S) {
  if (S.storyComplete) return 'Story Complete';
  return MISSION_DEFS[S.missionIndex].title;
}

export function missionObjective(S) {
  if (S.storyComplete) return 'You ran Solara Bay. Story complete — thanks for playing.';
  const def = MISSION_DEFS[S.missionIndex];
  if (S.missionIndex === 2 && S.stage === 1) {
    return `Defeat the gang — ${4 - S.kills} left`;
  }
  return def.stages[S.stage].text;
}

export function missionReward(S) {
  if (S.storyComplete) return 0;
  return MISSION_DEFS[S.missionIndex].reward;
}

function nearestCar(S) {
  let best = null;
  let bestD = Infinity;
  for (const c of S.traffic) {
    if (c.driver === 'player') continue;
    const d = dist(c.x, c.y, S.player.x, S.player.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function missionMarker(S) {
  if (S.storyComplete) return null;
  const def = MISSION_DEFS[S.missionIndex];
  const kind = def.stages[S.stage].marker;
  if (kind === 'car') {
    const c = nearestCar(S);
    return c ? { x: c.x, y: c.y } : null;
  }
  const p = POINTS[kind];
  return p ? { x: p.x, y: p.y } : null;
}

function completeMission(S, def) {
  S.money += def.reward;
  S.api.showCard('Mission Complete', `${def.title}  +$${def.reward}`);
  S.audio.missionDone();
  // Advance FIRST, then save: the save must hold the new mission, not the old one.
  S.missionIndex += 1;
  S.stage = 0;
  S.kills = 0;
  if (S.missionIndex >= MISSION_DEFS.length) {
    S.storyComplete = true;
    S.wantedLock = false;
    S.wanted = 0;
    S.api.showCard('Story Complete', 'You ran Solara Bay. All four missions done — $3,150 banked.');
    S.state = 'complete';
  } else if (S.missionIndex === 2) {
    S.player.ammo = 24;
    // The turf war is the gang's fight, not the police's: clear the heat
    // so foot cops cannot interrupt it.
    S.wanted = 0;
    S.wantedLock = false;
    S.cops = [];
    S.patrol = [];
  }
  S.api.saveGame();
}

export function updateMissions(S, dt) {
  if (S.storyComplete || S.state !== 'playing') return;
  const p = S.player;
  const m = S.missionIndex;
  const st = S.stage;
  if (m === 0 && st === 0) {
    if (p.inCar) S.stage = 1;
    return;
  }
  if (m === 0 && st === 1) {
    if (p.inCar && dist(p.x, p.y, POINTS.dropoff.x, POINTS.dropoff.y) < 85) {
      completeMission(S, MISSION_DEFS[0]);
    }
    return;
  }
  if (m === 1 && st === 0) {
    if (dist(p.x, p.y, POINTS.pickup.x, POINTS.pickup.y) < 75) {
      S.stage = 1;
      S.api.showCard('Package collected', 'Now deliver it to the docks.');
      S.audio.blip();
    }
    return;
  }
  if (m === 1 && st === 1) {
    if (dist(p.x, p.y, POINTS.delivery.x, POINTS.delivery.y) < 75) {
      completeMission(S, MISSION_DEFS[1]);
    }
    return;
  }
  if (m === 2 && st === 0) {
    if (dist(p.x, p.y, POINTS.turf.x, POINTS.turf.y) < 230) {
      S.stage = 1;
      spawnGang(S);
      S.api.showCard('Turfwars', 'Four gang members hold the plaza. Take them down.');
    }
    return;
  }
  if (m === 2 && st === 1) {
    if (S.kills >= 4) completeMission(S, MISSION_DEFS[2]);
    return;
  }
  if (m === 3 && st === 0) {
    if (dist(p.x, p.y, POINTS.goods.x, POINTS.goods.y) < 75) {
      S.stage = 1;
      S.wanted = 3;
      S.wantedLock = true;
      S.lastCrimeAt = S.time;
      S.api.showCard('The Getaway', 'The goods are yours — now lose the police and reach the safehouse.');
      S.audio.blip();
    }
    return;
  }
  if (m === 3 && st === 1) {
    if (dist(p.x, p.y, POINTS.safehouse.x, POINTS.safehouse.y) < 85) {
      completeMission(S, MISSION_DEFS[3]);
    }
  }
}
