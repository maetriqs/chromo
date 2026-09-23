# Chromo

A static browser-games site: plain HTML, CSS and vanilla JS, no build step.
The home page is a "shelf" of game boxes, each with a small self-playing preview.

## Games

- **Tic-Tac-Toe** (`games/tic-tac-toe/`): two players on one screen, score kept across rounds.
- **Snake** (`games/snake/`): keyboard or swipe controls, best score saved in `localStorage`.
- **Memory** (`games/memory-match/`): eight pairs of playing cards, with a move count, a timer and a saved best.

## Running locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly also works.
Fonts (Big Shoulders Display, Atkinson Hyperlegible) load from Google Fonts,
with system fallbacks when offline.

## Structure

```
index.html                  Home page (the shelf)
assets/css/styles.css       Shared tokens, type and layout
assets/js/shelf.js          Self-playing previews on the home page boxes
assets/img/favicon.svg      Site icon
games/<game>/index.html     Game page
games/<game>/game.js        Game logic
```

## Adding a game

1. Copy a `games/<game>/` folder and rename it.
2. Set the box colour on the page's `<body>`, e.g. `style="--box: var(--sea)"`, or add a new colour token in `styles.css`.
3. Add an `<a class="box">` to the shelf in `index.html` with the game's spec line, name and blurb.
4. For a live preview, add a demo function in `assets/js/shelf.js`, register it in `DEMOS`,
   and point a `<canvas data-demo="...">` at it. Otherwise drop the canvas.
