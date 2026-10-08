# Chromo

A static browser-games site: plain HTML, CSS and vanilla JS, no build step.
The home page is a set of shelves of game boxes, each with a small self-playing preview.

## Games

**Battle royale**
- **Squall** (`games/squall/`): an original third-person battle royale on Kestrel Isle. See [Squall](#squall) below.

**Sandbox**
- **Quarry** (`games/quarry/`): an original first-person block sandbox on a generated island. Mine, build, craft,
  and play through day and night with a mouse or a touchscreen. See [Quarry](#quarry) below.

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
Fonts (Big Shoulders Display and Atkinson Hyperlegible on the site, plus Pixelify Sans and VT323 in Quarry)
load from Google Fonts, with system fallbacks when offline.

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
games/squall/, games/quarry/  The two big games, split into css/ and js/ folders
.nojekyll                   Tells GitHub Pages to serve the files as they are
```

## Squall

A complete battle royale match against 5–27 bots (19 by default). All of its models, the island, the UI and
every sound are original and generated in code. The only dependency is the vendored Three.js.

**Match loop.** Skydive from 150 m and steer, open the glider, then land and loot. Fight, build, and stay inside
the safe zone through six storm phases until one player is left. The result screen shows your placement,
eliminations, damage, survival time and pieces built, with Play again.

**Systems**
- **Island:** a heightfield island with six points of interest: Millbrook (town), Rustworks (industrial),
  Pinewood (forest), Highridge (hills, with a lookout tower), Barley Flats (fields, barn and silo) and
  Hollowstead (abandoned ruins). Roads, about 430 harvestable trees, rocks, hay bales, cars, containers and
  explosive barrels. House roofs and ramps are walkable.
- **Weapons:** Corsair AR, Breaker 12 (shotgun), Wasp SMG, Marlin P9 (pistol) and Longreach (scoped sniper).
  Each has its own damage, fire rate, magazine, reload, range and falloff, spread and bloom, and recoil.
  Rarity (Common to Legendary) scales damage, reload speed and accuracy. Hitscan includes headshots.
  Shots damage structures and can detonate barrels.
- **Loot:** 25 chests and about 60 floor-loot spots, re-rolled every match, with rarity-coloured light beams.
  Ammo (light, medium, shells, heavy) and timber are picked up just by walking over them. Healing items are
  the Patch Kit and Field Kit; shield items are the Shield Cell and Shield Flask. Eliminated players drop
  everything they carried.
- **Building:** walls, floors, ramps and roofs on a 4 m grid, with a vertical lattice so ramps chain upward.
  Ghost preview, placement validation, a 10-timber cost, a build cooldown, and pieces that grow their HP over
  about a second. Pieces block bullets, take damage and break. The hatchet harvests timber from trees, rocks,
  hay, crates and cars.
- **Storm:** six phases, each with a wait timer and a shrink. Every safe zone sits inside the previous one.
  Damage per second rises from 1 to 10 and bypasses shields. The storm wall, the next-zone ring on the ground,
  the screen tint, fog and audio all react.
- **Bots:** four skill tiers (Rookie, Regular, Veteran, Ace) differ in reaction time, aim error, fire rate,
  detection range, strafing, jumping and wall-building. Each bot also has its own caution and favourite area.
  Bots loot and judge upgrades, heal, rotate ahead of the storm, hear gunfire, chase, and fight each other as
  well as you.
- **Camera:** an over-the-shoulder third-person camera with smoothing, collision pull-in, ADS zoom, a
  first-person scope on the sniper, recoil with recovery, and shake.
- **UI:** a minimap with the storm and gunfire pings, a full map in the inventory, health and shield bars,
  timber, a hotbar, ammo, the storm timer, player count, eliminations, a kill feed, hit markers, damage numbers,
  damage-direction indicators and interaction prompts. Screens: loading, main menu, settings (sensitivity,
  invert, FOV, quality, volume, bot skill and count, full key rebinding), controls, credits, pause, inventory,
  victory and defeat.

**Default controls:** WASD move · Shift sprint · Space jump / open glider · C crouch · Mouse look and aim ·
Left click fire / build / use · Right click aim · R reload · 1–5 slots · Q build mode · Z wall · X floor ·
C ramp (in build mode) · V roof · E interact · Tab inventory · Esc pause.

**Code** (`games/squall/js/`, plain scripts sharing one `SQ` namespace, loaded in order by `index.html`):
`config` tuning tables · `util` math, noise, geometry merging · `settings` · `input` keyboard, mouse, pointer
lock · `audio` synthesized sound · `terrain` · `physics` colliders, movement, raycasts · `world` island
content · `effects` particles, tracers, flashes, damage numbers · `inventory` items · `character` models and
animation · `weapons` · `loot` · `building` · `storm` · `camera` · `player` · `bots` · `hud` · `menus` ·
`game` match lifecycle and main loop · `main` boot.

## Quarry

A first-person block sandbox inspired by classic voxel building games. Everything in it is original: the 16-pixel
block textures, the icons, the sky and every sound are generated in the browser when the page loads, so the game
ships no image or audio files. The only dependency is the vendored Three.js.

**World.** Each world is a 320 × 320 × 72 block island, generated from a seed in well under a second
behind a progress bar. There are rolling hills, flat plains, snowy peaks, a sand desert over sandstone, lakes, beaches, coal and
iron ore in the stone, oak and pine trees, tall grass and flowers. The spawn point is a stone-brick platform
with four lamp posts. Beyond the coast the sea ends at the edge of the world. Swim over the edge and you fall
into the void and respawn.

**Rendering.** The world is stored as one typed array and drawn in 16 × 16 chunk meshes. Only chunks inside the
render distance are built, nearest first, with a few milliseconds of meshing per frame so the page never stalls.
Faces between solid blocks are skipped. Corners get ambient occlusion and smooth lighting. Lamps spread block
light with a flood fill, and the sky shades overhangs, tree cover and tunnels you dig. A day lasts 20 minutes and
brings sunsets, stars, a moon, drifting clouds and fog matched to the sky. There is animated water, and the
underwater view is tinted.

**Blocks.** 28 block types: grass, dirt, stone, cobblestone, oak log, planks, leaves, sand, glass, bricks, gravel,
snowy grass, bedrock, water, coal and iron ore, lamp, stone bricks, bookshelf, tall grass, two flowers, five wool
colours and sandstone. You break blocks by holding the button, with crack stages and debris. Placing a block
checks that it won't overlap you. Grass and flowers need soil underneath.

**Modes.**
- **Survival:** mined blocks drop as items that fly to you. You have a 36-slot inventory with stacks of 64 and
  a crafting list (planks from logs, glass from sand, lamps from coal and glass, and so on). Ten hearts, fall
  damage, drowning and slow healing. Death keeps your items.
- **Creative:** every block is available, blocks break instantly, and double-tapping jump toggles flight.

**Controls.** WASD move · Mouse look · Space jump / swim up / fly up · Shift or double-tap W sprint (Shift sinks
while flying) · Hold left click break · Right click place · Middle click pick block · 1–9 or wheel select ·
E inventory · Q drop · F3 debug info · Esc pause. On phones and tablets, on-screen controls appear instead:
- a stick on the left to move, and dragging on the right to look;
- tap to place and hold to mine;
- buttons for jump, break, place and the inventory;
- auto-jump onto single blocks is on by default.

**Menus and saving.** The title screen has Continue, New world (seed and mode), Settings and Back to Website.
Settings cover render distance, field of view, look speed, resolution, volume, music, clouds, view bobbing,
auto-jump and invert look. The world saves to this browser's local storage when you pause, every 45 seconds,
and when you leave the page. Only the changes you made are stored, and the island is regenerated from its seed.

**Performance.** A 4-chunk view on desktop and 3 on touch, no antialiasing, a resolution setting, and pixel
ratio capped at 1.5 keep it playable on low-end machines. In a software-rendered test browser, meshing averages
under a millisecond per chunk. Moving the player costs about 0.03 ms a frame.

**Limits.** There are no caves, mobs, tools, flowing water or falling sand. Lighting is a simplified version of
the classic model. There is one save slot per browser.

**Code** (`games/quarry/js/`, plain scripts sharing one `QY` namespace, loaded in order by `index.html`):
- `config`: constants and the block table.
- `noise`: seeded noise.
- `textures`: the generated atlas, cracks and icons.
- `world`: block storage, terrain generation, block light and raycasts.
- `mesher`: chunk geometry.
- `chunks`: materials, shaders and chunk streaming.
- `sky`: day/night, sun and moon, stars and clouds.
- `effects`: the selection box, cracks and particles.
- `audio`: synthesized sound and music.
- `input`: keyboard, mouse, pointer lock and touch.
- `items`: the inventory, crafting and dropped items.
- `hand`: the first-person arm and held block.
- `player`: movement, collision, health and mining.
- `ui`: the HUD, screens and settings.
- `main`: states, saving and the main loop.

## Adding a game

1. Copy a `games/<game>/` folder and rename it.
2. Set the box colour on the page's `<body>`, e.g. `style="--box: var(--sea)"`, or add a colour token in `styles.css`.
3. Add an `<a class="box box-md box-yourgame">` to a shelf in `index.html` with the spec line, name and blurb,
   and give `.box-yourgame` its `--box` colour in `styles.css`. Use `box-sm`, `box-md` or `box-lg` for the box size.
4. For a live preview, add a demo function to `assets/js/shelf.js`, register it in `DEMOS`,
   and point a `<canvas data-demo="...">` at it. Otherwise drop the canvas.
5. Call `Sound.play("pop")` and the other effects in `sound.js` from your game for audio.
