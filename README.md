# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kaixyzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLARA BAY — Streets of the Bay

A top-down 2D open-world crime game in a sun-soaked coastal city. You are a
small-time driver working your way up: steal cars, outrun the police, and
complete four story missions — First Wheels, The Pickup, Turfwars, and The
Getaway. Explore the city on foot or by car, dodge traffic, deal with
pedestrians and patrol cars, fight gang members, and watch your wanted level.

## Features

- Open city on a street grid: downtown, beach and water, garage home base,
  safehouse, and a central intersection
- Drive and steal cars (E to enter / exit), with drift-style arcade handling
- On-foot combat: aim with the mouse, click to shoot, ammo and health pickups
- Wanted system (0–3 stars): foot police at 1 star, patrol cars that chase
  and ram at 2–3 stars, wanted decays when you lay low
- Four story missions with cash rewards, a mission card, and a minimap
- Pause (P / Esc), save / load through localStorage
- Deterministic seeded world, WebAudio engine hum, sirens, gunshots and
  pickup blips — no audio or image files, everything is drawn and
  synthesized in code, fully offline

## How to run

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / drive (accelerate, steer, brake, reverse) |
| E | Enter / exit a car |
| Mouse + click | Aim and shoot (on foot) |
| P / Esc | Pause |
| M | Mute |

## Screenshots

The four screenshots in `screenshots/` show the game on foot, driving, in a
police chase, and mid-mission.

<sub>Entered on [make.fun](https://make.fun/?ref=vtc8r25b&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
