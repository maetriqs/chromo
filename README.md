# Chromo Arcade

A static browser-games template: plain HTML, CSS and vanilla JS, no build step,
no dependencies. Comes with a home page listing three playable games.

## Games

- **Tic-Tac-Toe** — `games/tic-tac-toe/` — local two-player hotseat with a score tracker.
- **Snake** — `games/snake/` — canvas-based, keyboard-controlled, with a `localStorage` high score.
- **Memory Match** — `games/memory-match/` — 4x4 card-flip matching game with a move counter and timer.

## Running locally

No build step is required. Serve the folder with any static file server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

(Opening `index.html` directly by double-clicking also works, since every page
uses relative paths and plain `<script>` tags.)

## Structure

```
index.html                   Home page / game grid
assets/css/styles.css        Shared design system (colors, layout, components)
assets/img/favicon.svg       Site icon
games/<game>/index.html      Game page (uses the shared header/footer + game-shell layout)
games/<game>/game.js         Game logic
```

## Adding a new game

1. Copy an existing `games/<game>/` folder as a starting point.
2. Set `--game-accent` on `<body>` to a color for that game.
3. Add a `<article class="card">` entry to the grid in `index.html` with a matching `--card-accent`.
