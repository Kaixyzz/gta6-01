# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## SOLARA BAY — Streets of the Bay

A top-down 2D open-world crime game in a sun-soaked coastal city. You are a small-time driver working your way up: steal cars, outrun the police, and complete four story missions — First Wheels, The Pickup, Turfwars, and The Getaway — across a city with traffic, pedestrians, a wanted system, foot police and patrol cars, combat, a HUD with a minimap, and save/load.

Everything is drawn with code and all sound is synthesized with WebAudio: no image or audio files, no network requests. The world is generated from a fixed seed, so the city is the same on every load.

### How to run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome.

### Controls

- WASD / arrows — move on foot, drive a car
- E — enter / exit a car
- Mouse — aim, click — shoot
- Shift — run
- P — pause (progress saves when you pause)

### Missions

1. **First Wheels** — steal a car and drive it to the drop-off (+$300)
2. **The Pickup** — collect the package and deliver it to the docks (+$500)
3. **Turfwars** — defeat four gang members holding the plaza (+$800)
4. **The Getaway** — grab the goods and escape a three-star police chase to the safehouse (+$1,500)

### Files

- `game/index.html` — the page, HUD and overlays
- `game/src/boot.js` — entry point, screenshot staging (`?shot=walk|drive|chase|mission`)
- `game/src/game.js` — state, input, the loop, wanted, save/load
- `game/src/world.js` — the seeded city: roads, buildings, beach, named places
- `game/src/actors.js` — player, traffic, pedestrians, police, gang, pickups
- `game/src/missions.js` — the four-mission story
- `game/src/render.js` — canvas drawing and the minimap
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/rng.js` — the seeded random generator
- `main.ts` — hands the entry in: copies `game/` and `screenshots/` and writes `dossier.json`

<sub>Entered on [make.fun](https://make.fun/?ref=vtc8r25b&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
