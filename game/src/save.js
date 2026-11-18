// Persistence through localStorage. The game autosaves after every
// mission and on a busted/wasted run; the menu's Continue button loads
// the save back. Everything is plain JSON and every call is guarded, so
// a missing or blocked storage simply behaves like "no save".
import { CFG } from './config.js';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      money: p.money,
      missionIndex: G.missions.index,
      hp: p.hp,
      ammo: p.ammo,
      x: p.x,
      y: p.y,
      storyComplete: G.storyComplete,
      savedAt: Date.now(),
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(CFG.SAVE_KEY);
  } catch (e) {
    // storage unavailable — nothing to clear
  }
}
