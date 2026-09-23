# Chromo

A static browser-games site: plain HTML, CSS and vanilla JS, no build step.
The home page is a set of shelves of game boxes, each with a small self-playing preview.

## Games

**3D** (rendered with Three.js)
- **Stack** (`games/stack/`): drop sliding blocks to build a tower; overhangs are sliced off, and perfect drops chain and regrow the block.
- **Dash** (`games/dash/`): three-lane runner with jumps, fast-drops, coins and rising speed.
- **Tilt** (`games/tilt/`): tip a maze board to roll a ball to the goal; mazes grow each level and holes appear from level 3.

**Arcade**
- **Snake** (`games/snake/`): keyboard or swipe controls, timed bonus stars, saved best score.
- **Bricks** (`games/bricks/`): paddle-and-ball brick breaker with combos, a wide-paddle power-up and endless levels.
- **Glide** (`games/glide/`): one-button paper plane that speeds up as you score.

**Table and cards**
- **Four in a Row** (`games/four-in-a-row/`): vs a friend, or a computer (easy, or hard with a six-move alpha-beta search).
- **Memory** (`games/memory-match/`): eight pairs of playing cards, streaks, move count, timer and saved best.
- **Tic-Tac-Toe** (`games/tic-tac-toe/`): vs a friend, or a computer (easy, or hard with perfect minimax play).

**Puzzles**
- **2048** (`games/2048/`): animated sliding tiles, swipe support and one-step undo.
- **Lights** (`games/lights/`): lights-out puzzles that get longer as you progress, scored against par.
- **Mines** (`games/mines/`): three field sizes, a safe first dig, flag mode for touchscreens and chording.

Every game page has a sound toggle. Effects are synthesized with the Web Audio API, so there are no audio files.

## Running locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly also works.
Fonts (Big Shoulders Display, Atkinson Hyperlegible) load from Google Fonts,
with system fallbacks when offline.

The 3D games need WebGL. Three.js r128 (MIT) is vendored at `assets/vendor/three.min.js`
so the site has no runtime CDN dependency. If WebGL is unavailable, the game shows a
message on its stage instead of failing silently.

## Structure

```
index.html                  Home page (the shelves)
assets/css/styles.css       Shared tokens, type, layout and controls
assets/js/shelf.js          Self-playing previews on the home page boxes
assets/js/sound.js          Shared sound effects and the Sound on/off toggle
assets/js/three-kit.js      Shared Three.js stage, lights, resize and storage helpers
assets/vendor/three.min.js  Three.js r128
assets/img/favicon.svg      Site icon
games/<game>/index.html     Game page
games/<game>/game.js        Game logic
```

## Adding a game

1. Copy a `games/<game>/` folder and rename it.
2. Set the box colour on the page's `<body>`, e.g. `style="--box: var(--sea)"`, or add a colour token in `styles.css`.
3. Add an `<a class="box box-md box-yourgame">` to a shelf in `index.html` with the spec line, name and blurb,
   and give `.box-yourgame` its `--box` colour in `styles.css`. Use `box-sm`, `box-md` or `box-lg` for the box size.
4. For a live preview, add a demo function to `assets/js/shelf.js`, register it in `DEMOS`,
   and point a `<canvas data-demo="...">` at it. Otherwise drop the canvas.
5. Call `Sound.play("pop")` and the other effects in `sound.js` from your game for audio.
