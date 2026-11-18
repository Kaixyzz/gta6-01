// missions.js — the four-mission story of SOLARA BAY.
// Each mission is a small state machine with phases; completing one pays its
// reward, shows a mission card, saves the game, and unlocks the next.

import { MISSIONS, PLACES, TUNING } from './config.js';
import { spawnGang } from './combat.js';
import { addWanted } from './police.js';
import { saveGame } from './save.js';

export function makeMissions() {
  return {
    index: 0, // 0..3, the current mission; 4 means the story is done
    phase: 'steal',
    marker: { x: PLACES.dropM1.x, y: PLACES.dropM1.y },
    cardUntil: 0,
    cardTitle: '',
    cardText: '',
    done: false,
  };
}

function showCard(G, title, text, seconds) {
  G.mission.cardTitle = title;
  G.mission.cardText = text;
  G.mission.cardUntil = G.time + (seconds || 4);
}

// Start (or restart) mission `index` from its first phase.
export function startMission(G, index) {
  const m = G.mission;
  m.index = index;
  m.done = index >= MISSIONS.length;
  if (m.done) return;
  const def = MISSIONS[index];
  if (index === 0) {
    m.phase = 'steal';
    m.marker = { x: PLACES.dropM1.x, y: PLACES.dropM1.y };
    showCard(G, `Mission 1 — ${def.title}`, def.intro, 4.5);
  } else if (index === 1) {
    m.phase = 'pickup';
    m.marker = { x: PLACES.pickupM2.x, y: PLACES.pickupM2.y };
    showCard(G, `Mission 2 — ${def.title}`, def.intro, 4.5);
  } else if (index === 2) {
    m.phase = 'fight';
    m.marker = { x: PLACES.turf.x, y: PLACES.turf.y };
    spawnGang(G);
    showCard(G, `Mission 3 — ${def.title}`, def.intro, 4.5);
  } else {
    m.phase = 'grab';
    m.marker = { x: PLACES.goodsM4.x, y: PLACES.goodsM4.y };
    showCard(G, `Mission 4 — ${def.title}`, def.intro, 4.5);
  }
}

function completeMission(G) {
  const m = G.mission;
  const def = MISSIONS[m.index];
  G.player.money += def.reward;
  G.stats.missionsDone += 1;
  G.sound.missionDone();
  G.flashMessage = `Mission complete! +$${def.reward}`;
  G.flashUntil = G.time + 3;
  const next = m.index + 1;
  if (next >= MISSIONS.length) {
    m.index = next;
    m.done = true;
    G.storyComplete = true;
    G.phase = 'story';
    saveGame(G);
    showCard(G, 'Story Complete', 'You own Solara Bay now. $3,150 and a legend.', 999);
  } else {
    // Start the next mission first, then save: the save must resume at the
    // mission still to play, not the one just finished.
    startMission(G, next);
    saveGame(G);
  }
}

// The objective text the HUD shows for the current mission phase.
export function currentObjective(G) {
  const m = G.mission;
  if (m.done) return 'Story complete — free roam Solara Bay.';
  if (m.index === 0) {
    return m.phase === 'steal'
      ? 'Steal a car (walk up to one and press E)'
      : 'Drive to the yellow drop-off marker';
  }
  if (m.index === 1) {
    return m.phase === 'pickup'
      ? 'Drive to the package pickup point'
      : 'Deliver the package to the destination';
  }
  if (m.index === 2) {
    const left = G.combat.enemies.filter((e) => e.alive).length;
    return `Defeat the gang at the turf — ${left} left (on foot)`;
  }
  return m.phase === 'grab'
    ? 'Grab the goods at the marked crossing'
    : 'Escape the police chase — reach the safehouse!';
}

// The world position the HUD and minimap point at right now.
export function currentTarget(G) {
  const m = G.mission;
  if (m.done) return { x: PLACES.garage.x, y: PLACES.garage.y, label: 'Garage' };
  if (m.index === 0 && m.phase === 'steal') {
    // Point at the nearest car until the player has one.
    let best = null;
    let bestD = Infinity;
    for (const car of G.cars) {
      const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) return { x: best.x, y: best.y, label: 'Steal this car' };
    return { x: PLACES.garage.x, y: PLACES.garage.y, label: 'Find a car' };
  }
  return { x: m.marker.x, y: m.marker.y, label: 'Objective' };
}

function near(x, y, tx, ty, r) {
  return Math.hypot(x - tx, y - ty) < r;
}

export function updateMissions(G, dt) {
  void dt;
  const m = G.mission;
  if (m.done || G.phase !== 'playing') return;
  const p = G.player;

  if (m.index === 0) {
    if (m.phase === 'steal' && p.inCar) {
      m.phase = 'deliver';
      showCard(G, 'Wheels acquired', 'Now drive to the yellow drop-off marker.', 3);
    } else if (m.phase === 'deliver' && p.inCar && near(p.x, p.y, PLACES.dropM1.x, PLACES.dropM1.y, 48)) {
      completeMission(G);
    }
  } else if (m.index === 1) {
    if (m.phase === 'pickup' && near(p.x, p.y, PLACES.pickupM2.x, PLACES.pickupM2.y, 48)) {
      m.phase = 'deliver';
      m.marker = { x: PLACES.deliverM2.x, y: PLACES.deliverM2.y };
      G.flashMessage = 'Package collected — deliver it!';
      G.flashUntil = G.time + 2.5;
      G.sound.pickup();
    } else if (m.phase === 'deliver' && near(p.x, p.y, PLACES.deliverM2.x, PLACES.deliverM2.y, 48)) {
      completeMission(G);
    }
  } else if (m.index === 2) {
    const left = G.combat.enemies.filter((e) => e.alive).length;
    if (left === 0) completeMission(G);
  } else if (m.index === 3) {
    if (m.phase === 'grab' && near(p.x, p.y, PLACES.goodsM4.x, PLACES.goodsM4.y, 48)) {
      m.phase = 'escape';
      m.marker = { x: PLACES.safehouse.x, y: PLACES.safehouse.y };
      G.chaseMode = true;
      addWanted(G, 3);
      showCard(G, 'They are coming!', 'Wanted level 3 — lose the cops and reach the safehouse.', 4);
      G.sound.missionDone();
    } else if (m.phase === 'escape' && near(p.x, p.y, PLACES.safehouse.x, PLACES.safehouse.y, 56)) {
      G.chaseMode = false;
      G.wanted = 0;
      completeMission(G);
    }
  }
}
