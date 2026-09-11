# Super Plumber Bros — A Dark Descent

A small, self-contained HTML5 canvas platformer. There is no build step —
`index.html` (home screen) and `mario.html` (the game) are static files
deployed as-is (see `.github/workflows/deploy.yml`).

## Play it

Open `index.html` in a browser, or `mario.html` directly to skip the home
screen. No server or install required.

**Controls:** Arrow keys / WASD to move, Space / Up / W to jump (hold for a
higher jump). `P` or `Escape` pauses, `M` mutes, `R` toggles reduced motion.
On a touch device, on-screen controls appear automatically.

## Structure

- `index.html` — home screen with a hotspot over the painted title art.
- `mario.html` — the game itself: physics, rendering, audio, input and level
  data all live in one file, organized into clearly separated sections
  (Input, Audio, Levels, Particles, Update, Draw). Levels are data-driven
  (see the `LEVELS` array) — adding a new level or enemy type doesn't
  require touching the physics/update code.
- `assets/` — art assets.
- `tests/smoke.test.js` — a headless Playwright regression test that plays
  the actual game in a real browser and asserts on game state (see below).

## Testing

```
npm install
npm test
```

`tests/smoke.test.js` drives the game with Playwright and checks, among
other things: the intro screen and pause/mute/reduced-motion toggles work,
variable jump height, checkpoint-based respawns, that an enemy graze costs
a life without resetting the player to the level start, that level 2 loads
with its own enemies, that touch controls work, and that the hidden bonus
route is completable — all with zero browser console/page errors.

The game also exposes a small read-only/QA debug hook at
`window.__SPB_DEBUG__` (state, player, level and settings snapshots, plus a
couple of test-only conveniences like `teleport()` and `jumpToLevel()`) used
by the test suite. It has no effect on normal play.
