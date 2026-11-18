# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLARA BAY — Streets of the Bay is a top-down 2D open-world crime game set in a
sun-soaked coastal city. You are a small-time driver working your way up: steal
cars, outrun the police, and finish four story missions. The city is fully
explorable on foot and by car, with traffic, pedestrians, a wanted system with
real police chases, combat, a HUD with a minimap, and a save system.

## The story

1. **First Wheels** — Steal a car and drive it to the drop-off. (+$300)
2. **The Pickup** — Collect a package and deliver it across town. (+$500)
3. **Turfwars** — On foot, defeat four gang members at the turf. (+$800)
4. **The Getaway** — Grab the goods, then escape a three-star police chase to
   the safehouse. (+$1,500)

## How to play

- **WASD / arrows** — walk or drive. **Shift** — run.
- **E** — enter / exit a car. **Mouse** — aim. **Click** — shoot.
- **P / Esc** — pause (and save). **M** — mute. **S** — save from the pause menu.
- Crimes raise your wanted level: stealing cars, shooting, and hitting
  pedestrians all draw police attention. Foot police chase at one star;
  patrol cars join at two and three stars. Lay low and the heat cools off.
- Your progress is saved automatically when a mission is completed. From the
  title screen, press **C** to continue a saved game or **N** to start fresh.

## Run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in a desktop browser. The game loads no
network resources at all — everything is drawn and synthesized in code.

## Tech

Plain JavaScript (ES modules) on one HTML5 canvas, no libraries and no build
step. The world is generated from a fixed seed, so every run plays the same
city. Sound is synthesized with WebAudio: engine hum, sirens, gunshots and
pickup blips. `main.ts` copies `game/` and `screenshots/` into the output
directory and writes `dossier.json` with the kit's `buildDossier`.

<sub>Entered on [make.fun](https://make.fun/?ref=vtc8r25b&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
