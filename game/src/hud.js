// DOM HUD: health bar, money, ammo, wanted stars, objective card, toasts
// and the menu / pause / end overlays.
export function makeHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: {
      hp: $('hp-fill'), money: $('money'), ammo: $('ammo'), stars: $('stars'),
      objective: $('objective-text'), mission: $('mission-name'), toast: $('toast'),
      menu: $('menu'), pause: $('pause'), end: $('end'), win: $('win'),
      endTitle: $('end-title'), endText: $('end-text'),
      btnStart: $('btn-start'), btnContinue: $('btn-continue'),
      btnResume: $('btn-resume'), btnRetry: $('btn-retry'),
      btnWinContinue: $('btn-win-continue'), btnMute: $('btn-mute'),
    },
    update(G) {
      const p = G.player;
      hud.el.hp.style.width = `${Math.max(0, p.hp)}%`;
      hud.el.hp.style.background = p.hp > 50 ? '#3ec95a' : p.hp > 25 ? '#f2c230' : '#e74c3c';
      hud.el.money.textContent = `$${p.money}`;
      hud.el.ammo.textContent = `Ammo ${p.ammo}`;
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
      hud.el.stars.textContent = stars;
      hud.el.stars.style.color = G.wanted > 0 ? '#ffd94d' : '#cfd6dd';
      hud.el.objective.textContent = G.missions.objectiveText();
      hud.el.mission.textContent = G.missions.missionName();
      if (G.missions.toastT > 0) {
        hud.el.toast.textContent = G.missions.toast;
        hud.el.toast.style.opacity = '1';
      } else {
        hud.el.toast.style.opacity = '0';
      }
    },
    showMenu(hasSave) {
      hud.el.menu.style.display = 'flex';
      hud.el.pause.style.display = 'none';
      hud.el.end.style.display = 'none';
      hud.el.win.style.display = 'none';
      hud.el.btnContinue.style.display = hasSave ? 'inline-block' : 'none';
    },
    hideMenu() { hud.el.menu.style.display = 'none'; },
    showPause(show) { hud.el.pause.style.display = show ? 'flex' : 'none'; },
    showEnd(kind) {
      hud.el.end.style.display = 'flex';
      if (kind === 'busted') {
        hud.el.endTitle.textContent = 'BUSTED';
        hud.el.endText.textContent = 'The Solara Bay PD caught you. You lose 20% of your cash — but the streets are still yours.';
      } else {
        hud.el.endTitle.textContent = 'WASTED';
        hud.el.endText.textContent = 'You went down in Solara Bay. You lose 20% of your cash — patched up at the hospital.';
      }
    },
    hideEnd() { hud.el.end.style.display = 'none'; },
    showWin() { hud.el.win.style.display = 'flex'; },
    hideWin() { hud.el.win.style.display = 'none'; },
    setMute(muted) { hud.el.btnMute.textContent = muted ? '🔇 Muted' : '🔊 Sound'; },
  };
  return hud;
}
