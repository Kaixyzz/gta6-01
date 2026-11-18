// Entry point: build the game on the page canvas, expose it for the
// playthrough driver, and stage a fixed scene when ?shot= is given.
import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) game.applyShot(shot);
