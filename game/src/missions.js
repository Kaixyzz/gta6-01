// SOLARA BAY — mission state machine (fresh rewrite for rebuild #3).
// Owns the four story missions: targets, stages, payouts, toasts, and the
// mission-complete transition. The completion order matters: the mission
// index is advanced BEFORE the autosave, so a continued game resumes on the
// next mission instead of replaying the one just finished.
import { saveGame } from './save.js';
import { spawnEnemies } from './combat.js';

const ARRIVE = 90;

const DEFS = [
  {
    name: 'First Pickup',
    payout: 300,
    target: { x: 1800, y: 2500, label: 'Garage' },
    objective: 'Drive to the garage on 5th Ave',
    intro: 'Vex is back in Solara Bay. Pick up the package at the garage on 5th Ave.',
    done: 'Package secured. The crew is impressed — bigger jobs are coming.',
  },
  {
    name: 'Hot Wheels',
    payout: 500,
    target: { x: 1100, y: 1800, label: 'Gold sport car' },
    deliver: { x: 3200, y: 400, label: 'Drop-off' },
    objective: 'Steal the gold sport car',
    objectiveDeliver: 'Deliver the gold car to the drop-off',
    intro: 'A gold sport car is parked near the harbor. Take it — quietly.',
    done: 'Clean getaway. That car will fetch a fine price.',
  },
  {
    name: 'Rival Heat',
    payout: 800,
    target: { x: 2500, y: 1100, label: 'Rival turf' },
    objective: 'Clear out the rival gang at the turf',
    intro: 'The rival gang holds the north turf. Go and settle it.',
    done: 'The turf is yours. Solara Bay is starting to notice Vex.',
  },
  {
    name: 'The Getaway',
    payout: 1500,
    target: { x: 400, y: 2500, label: 'Safehouse' },
    objective: 'Escape to the safehouse',
    intro: 'The whole city is after you now. Lose the police and reach the safehouse.',
    done: 'You made it. Solara Bay is yours, Vex.',
  },
];

export function makeMissions(G) {
  let spawned = false;

  const m = {
    index: 0,
    stage: 'go',
    target: null,
    toast: '',
    toastT: 0,

    showToast(text) {
      m.toast = text;
      m.toastT = 4;
    },

    missionName() {
      if (m.index >= DEFS.length) return 'Story Complete';
      return `Mission ${m.index + 1}/4 — ${DEFS[m.index].name}`;
    },

    objectiveText() {
      if (m.index >= DEFS.length) return 'Story complete — free roam Solara Bay.';
      const d = DEFS[m.index];
      if (m.index === 1 && m.stage === 'deliver') return d.objectiveDeliver;
      return d.objective;
    },

    start(i) {
      const idx = typeof i === 'number' ? i : m.index;
      spawned = false;
      if (idx >= DEFS.length) {
        m.index = DEFS.length;
        m.stage = 'done';
        m.target = null;
        G.storyComplete = true;
        m.showToast('Story complete — Solara Bay is yours.');
        return;
      }
      m.index = idx;
      m.stage = 'go';
      const d = DEFS[idx];
      m.target = { x: d.target.x, y: d.target.y, label: d.target.label };
      m.showToast(d.intro);
      if (idx === 2) {
        // Rival turf: four gang members hold the block.
        if (G.enemies.length === 0) {
          spawnEnemies(G, d.target.x, d.target.y, 4);
        }
        spawned = true;
      }
      if (idx === 3) {
        // The getaway: make sure the police are already on the hunt.
        G.wanted = Math.max(G.wanted || 0, 3);
      }
    },

    onEnterGold() {
      if (m.index !== 1 || m.stage !== 'go') return;
      m.stage = 'deliver';
      const d = DEFS[1].deliver;
      m.target = { x: d.x, y: d.y, label: d.label };
      m.showToast('Gold car secured — deliver it to the drop-off.');
    },

    complete() {
      const d = DEFS[m.index];
      if (!d) return;
      G.player.money += d.payout;
      // Advance FIRST, then save: the autosave must record the next
      // mission, or a continued game would replay the one just finished.
      m.index += 1;
      if (m.index >= DEFS.length) {
        G.storyComplete = true;
        m.stage = 'done';
        m.target = null;
        m.showToast('Story complete — Solara Bay is yours, Vex.');
        saveGame(G);
        return;
      }
      m.showToast(d.done);
      saveGame(G);
      m.start(m.index);
    },

    update(dt) {
      if (typeof dt === 'number' && m.toastT > 0) {
        m.toastT -= dt;
        if (m.toastT <= 0) {
          m.toast = '';
          m.toastT = 0;
        }
      }
      if (!G || G.state !== 'playing') return;
      if (!m.target) return;
      const p = G.player;
      const ax = p.inCar && p.car ? p.car.x : p.x;
      const ay = p.inCar && p.car ? p.car.y : p.y;
      if (m.index === 1 && m.stage === 'go') {
        // Hot Wheels ends its first leg by getting into the gold car,
        // not by merely arriving at its parking spot.
        if (p.inCar && p.car && p.car.gold) m.onEnterGold();
        return;
      }
      if (m.index === 2) {
        // Rival Heat ends when the gang is cleared, not on arrival.
        if (spawned && G.enemies.length === 0) m.complete();
        return;
      }
      const dist = Math.hypot(m.target.x - ax, m.target.y - ay);
      if (dist < ARRIVE) m.complete();
    },
  };
  return m;
}
