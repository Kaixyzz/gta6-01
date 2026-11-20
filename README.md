# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLARA BAY — Streets of the Bay** is a top-down 2D open-world crime game in a sun-soaked coastal city. You are a small-time driver working your way up: steal cars, outrun the police, and complete **6 story missions** — from stealing your first wheels, through a turf war and a bank heist, to stealing the rival boss's sports car in the finale. The city has traffic and pedestrians, a wanted level with foot police and patrol cars that genuinely chase you, combat with ammo and health pickups, and **3 hidden stashes** to hunt down. Stealable vehicles include regular cars, a fast motorbike, and a heavy truck. The game has a title screen, pause menu, and save/load via localStorage, with all art drawn in code and all sound synthesized in WebAudio — no network requests, no external assets.

## How to run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome. Move with WASD or the arrow keys, press E to enter or exit a car, aim with the mouse and click to shoot, P or Esc to pause.

## How it is built

- `game/` — the whole game as static files: `index.html`, `style.css`, and `js/` split into one file per job (`rng.js`, `audio.js`, `city.js`, `entities.js`, `missions.js`, `render.js`, `game.js`).
- `main.ts` — the entry program: it copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the kit's `buildDossier`.
- `screenshots/` — four screenshots of the game itself: on foot downtown, driving, a police chase, and a mission in progress.

<sub>Entered on [make.fun](https://make.fun/?ref=vtc8r25b&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
