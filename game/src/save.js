// save.js — save and load SOLARA BAY through localStorage.
// A save holds money, mission progress, health, ammo and the player's
// position. Loading a finished story shows the Story Complete card, never
// "Mission 1/4".

import { TUNING, PLACES } from './config.js';
import { startMission } from './missions.js';

export function saveGame(G) {
  try {
    const data = {
      v: 1,
      money: G.player.money,
      hp: Math.round(G.player.hp),
      ammo: G.player.ammo,
      mission: G.mission.index,
      storyComplete: !!G.storyComplete,
      px: Math.round(G.player.x),
      py: Math.round(G.player.y),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(TUNING.saveKey, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(TUNING.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(TUNING.saveKey);
  } catch (e) {
    // Storage may be unavailable; a missing save is the same outcome.
  }
}

// Apply a loaded save to a fresh game object. Returns false when there is
// no save to apply.
export function applySave(G, data) {
  if (!data) return false;
  G.player.money = data.money ?? TUNING.startMoney;
  G.player.hp = data.hp ?? TUNING.playerHp;
  G.player.ammo = data.ammo ?? TUNING.startAmmo;
  G.player.x = data.px ?? PLACES.garage.x;
  G.player.y = data.py ?? PLACES.garage.y;
  G.player.inCar = false;
  G.player.car = null;
  G.storyComplete = !!data.storyComplete;
  if (G.storyComplete) {
    G.mission.index = 4;
    G.mission.done = true;
    G.phase = 'story';
    G.mission.cardTitle = 'Story Complete';
    G.mission.cardText = 'You own Solara Bay now. $3,150 and a legend.';
    G.mission.cardUntil = G.time + 999;
  } else {
    startMission(G, Math.max(0, Math.min(3, data.mission ?? 0)));
    G.phase = 'playing';
  }
  return true;
}
