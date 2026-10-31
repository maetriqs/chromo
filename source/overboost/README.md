<!-- By The_headphones -->
# Overboost

Rocket-powered car football that runs entirely in the browser. Drive, jump, flip, boost up the walls and hit a physically simulated ball into the opponent's goal. There are bot opponents at three difficulty levels.

Part of [Chromo](../../README.md). Built with [three.js](https://threejs.org) for rendering and [Rapier](https://rapier.rs) for rigid-body physics. Every texture, model, sound and music track is generated in code, so there are no asset files to license.

## Play

| | Keyboard | Gamepad |
|---|---|---|
| Accelerate / reverse | `W` / `S` | RT / LT |
| Steer | `A` / `D` | Left stick |
| Jump (press again in the air to double jump, or flip with a direction) | `Space` | A |
| Boost | `Shift` | B |
| Powerslide / air roll | `Ctrl` | X |
| Air roll left / right | `Q` / `E` | LB / RB |
| Ball cam | `C` | Y |
| Reset car | `R` | Back |
| Pause | `Esc` | Start |
| Look around | Hold right mouse button | Right stick |

Every key can be rebound in **Settings → Controls**.

In the air, `W`/`S` pitch the nose and `A`/`D` yaw. Drive into any curved wall to ride up it, all the way onto the ceiling if you're quick. Big glowing orbs refill boost to 100 and the small pads give 12. Ramming an opponent at supersonic speed demolishes them for three seconds.

**Browser note:** in Chrome and Edge, `Ctrl`+`W` closes the tab, and holding `Ctrl` (powerslide) while pressing `W` triggers it. During a match the game asks before the page closes. In fullscreen (Settings → Video) the keyboard is locked so the shortcut goes to the game. You can also rebind powerslide.

### Modes
- **Play:** 1v1 or 2v2 against Rookie, Pro or All-Star bots, with a 3, 5 or 10 minute clock. When time runs out the match ends once the ball touches the ground. A tie goes to sudden-death overtime.
- **Free Play:** you, the ball and unlimited boost. `R` resets the car and the ball.
- **Training:** ten shooting drills with ten seconds each.

## Develop

This folder is the source. The playable build lives in `games/overboost/`, which is what GitHub Pages serves, because the Chromo site itself has no build step. Requires Node.js 20.19 or newer.

```bash
cd source/overboost
npm install
npm run dev        # local dev server with hot reload
npm test           # arena/physics consistency + headless physics & bot-match tests
npm run build      # rebuilds ../../games/overboost/
```

After changing the source, run `npm run build` and commit the updated `games/overboost/` along with it. The build uses only relative URLs (`base: './'` in `vite.config.js`), so it works at `https://USERNAME.github.io/REPOSITORY-NAME/games/overboost/` and from any static server. It won't run from `file://`, because browsers block ES modules there. From the repository root, `python3 -m http.server 8000` serves it at `http://localhost:8000/games/overboost/`.

`npm run test:e2e` drives the built game in Chromium. It needs Playwright, which isn't a project dependency.

## How it's put together

```
src/game/      simulation, no rendering (also runs in Node for tests)
  arenaShape.js   analytic arena: signed distance field + Rapier collider layout + render profile
  car.js          raycast-suspension car controller: drive, steer, powerslide, jumps, flips, air control, wall stick
  simulation.js   match flow, kickoffs, goals, boost pads, demolitions, stats, training, free play
  ai.js           bots: ball prediction, intercepts, shooting angles, rotation, jump shots, aerials
src/render/    three.js scene: arena, stadium & crowd, car models, ball shader, particles, camera rig, post-processing
src/audio/     procedural Web Audio engine sounds, effects, crowd and music
src/ui/        menus and HUD
```

Physics runs at a fixed 120 Hz with render interpolation. The arena exists twice from the same numbers: as Rapier cuboids for ball and car collisions, and as an analytic distance field. The suspension, camera and bot ball prediction use the distance field, which keeps wall and ceiling transitions smooth. `tests/arena.test.mjs` checks that the two versions agree.

## Credits

Code by **The_headphones**. three.js (MIT), Rapier (Apache-2.0), Barlow and Barlow Condensed fonts (SIL OFL 1.1), Vite (MIT). Overboost is an independent fan project inspired by the rocket-car football genre. It isn't affiliated with any game publisher.
