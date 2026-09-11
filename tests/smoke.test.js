// Headless smoke/regression test for Super Plumber Bros.
//
// Plain Playwright (not the @playwright/test runner) so it has no extra
// dependency beyond `playwright` itself. Run with `npm test`.
//
// It drives the actual game through a real browser and asserts on the
// debug snapshot exposed at window.__SPB_DEBUG__ (see mario.html), so it
// catches real regressions in physics, state transitions and UI wiring,
// not just "does it parse".

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const GAME_URL = 'file://' + path.join(__dirname, '..', 'mario.html');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ok - ' + message);
  } else {
    failed++;
    console.error('  FAIL - ' + message);
  }
}

async function getState(page) { return page.evaluate(() => window.__SPB_DEBUG__.getState()); }
async function getPlayer(page) { return page.evaluate(() => window.__SPB_DEBUG__.getPlayer()); }
async function getLevel(page) { return page.evaluate(() => window.__SPB_DEBUG__.getLevel()); }
async function getSettings(page) { return page.evaluate(() => window.__SPB_DEBUG__.getSettings()); }

async function tapKey(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function run() {
  const launchOpts = {};
  if (fs.existsSync(SANDBOX_CHROMIUM)) launchOpts.executablePath = SANDBOX_CHROMIUM;
  const browser = await chromium.launch(launchOpts);
  const consoleErrors = [];
  const pageErrors = [];

  let openPage = null;
  async function freshPage() {
    // Close the previous page first - a stray page left running its
    // requestAnimationFrame loop competes for CPU and throws off the
    // timing-sensitive jump assertions below.
    if (openPage) await openPage.close();
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(GAME_URL);
    await page.waitForTimeout(200);
    openPage = page;
    return page;
  }

  console.log('Loading and dismissing the intro screen...');
  let page = await freshPage();
  let s = await getState(page);
  assert(s.mode === 'intro', 'game boots into the intro/instructions screen');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  s = await getState(page);
  assert(s.mode === 'playing', 'any key dismisses the intro and starts play');

  console.log('Checking variable jump height (tap vs. hold)...');
  await tapKey(page, ' ', 16);
  await page.waitForTimeout(500);
  const tapPlayer = await getPlayer(page);
  await page.waitForTimeout(700); // let it land
  await tapKey(page, ' ', 400);
  let peakY = 1000;
  for (let i = 0; i < 25; i++) {
    const p = await getPlayer(page);
    if (p.y < peakY) peakY = p.y;
    await page.waitForTimeout(20);
  }
  assert(peakY < tapPlayer.y - 5, 'holding Jump reaches a higher apex than tapping it (variable jump height works)');

  console.log('Checking a mid-air enemy graze costs a life but does not teleport the player back to the level start...');
  page = await freshPage();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  // Checkpoint 1 sits at x=1150; there is a patrol enemy right on top of it.
  await page.keyboard.down('ArrowRight');
  let reachedCheckpoint = false;
  let livesAtCheckpoint = null;
  for (let i = 0; i < 60 && !reachedCheckpoint; i++) {
    const lvl = await getLevel(page);
    const curState = await getState(page);
    if (lvl.checkpointX >= 1150) { reachedCheckpoint = true; livesAtCheckpoint = curState.lives; break; }
    if (curState.mode !== 'playing') break; // ran out of lives before the checkpoint - reported as a failure below
    await page.keyboard.down(' ');
    await page.waitForTimeout(380);
    await page.keyboard.up(' ');
    await page.waitForTimeout(140);
  }
  assert(reachedCheckpoint, 'checkpoint 1 (x=1150) is reachable by normal jumping');
  // Walk a little further without jumping; the patrol enemy there will graze the player.
  let lostLifeWithoutTeleport = false;
  for (let i = 0; i < 20; i++) {
    const before = await getState(page);
    await page.waitForTimeout(150);
    const after = await getState(page);
    const afterPlayer = await getPlayer(page);
    if (after.lives < before.lives) {
      lostLifeWithoutTeleport = afterPlayer.x > 1000; // old bug reset x to 60 on every graze
      break;
    }
  }
  await page.keyboard.up('ArrowRight');
  assert(lostLifeWithoutTeleport, 'a graze from an enemy costs a life via knockback, without resetting the player to the level start');

  console.log('Checking level 2 loads with its own theme/enemies and victory is reachable from the last level...');
  page = await freshPage();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__SPB_DEBUG__.jumpToLevel(1));
  await page.waitForTimeout(200);
  s = await getState(page);
  let lvl = await getLevel(page);
  assert(s.levelIndex === 1, 'debug hook can advance to level 2');
  assert(lvl.enemies.some((e) => e.type === 'wraith') && lvl.enemies.some((e) => e.type === 'fast'), 'level 2 introduces new enemy types (wraith + fast stalker) for a difficulty ramp');
  await page.evaluate(() => window.__SPB_DEBUG__.forceVictory());
  await page.waitForTimeout(100);
  s = await getState(page);
  assert(s.mode === 'victory', 'reaching the end of the final level triggers the victory screen');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  s = await getState(page);
  assert(s.mode === 'playing' && s.levelIndex === 0, 'restarting from the victory screen resets back to level 1');

  console.log('Checking pause, mute and reduced-motion toggles...');
  await page.keyboard.press('p');
  await page.waitForTimeout(100);
  s = await getState(page);
  assert(s.paused === true, 'P pauses the game');
  await page.keyboard.press('p');
  await page.waitForTimeout(100);
  s = await getState(page);
  assert(s.paused === false, 'P again resumes the game');

  let settingsBefore = await getSettings(page);
  await page.keyboard.press('m');
  await page.waitForTimeout(100);
  let settingsAfter = await getSettings(page);
  assert(settingsAfter.muted === !settingsBefore.muted, 'M toggles mute');

  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  let settingsAfter2 = await getSettings(page);
  assert(settingsAfter2.reducedMotion === !settingsAfter.reducedMotion, 'R toggles reduced motion');

  console.log('Checking on-screen touch controls actually move and jump the player...');
  const beforeTouch = await getPlayer(page);
  await page.locator('#touchRight').dispatchEvent('pointerdown');
  await page.waitForTimeout(400);
  await page.locator('#touchRight').dispatchEvent('pointerup');
  const afterTouch = await getPlayer(page);
  assert(afterTouch.x > beforeTouch.x, 'the on-screen touch "right" button moves the player');
  await page.locator('#touchJump').dispatchEvent('pointerdown');
  await page.waitForTimeout(50);
  await page.locator('#touchJump').dispatchEvent('pointerup');
  await page.waitForTimeout(100);
  const jumpedPlayer = await getPlayer(page);
  assert(jumpedPlayer.vy < 0, 'the on-screen touch "jump" button makes the player jump');

  console.log('Checking the hidden bonus alcove in level 1 is reachable...');
  page = await freshPage();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__SPB_DEBUG__.teleport(2210, 220)); // standing on the entry platform
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down(' ');
    await page.waitForTimeout(260);
    await page.keyboard.up(' ');
    await page.waitForTimeout(220);
  }
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(150);
  lvl = await getLevel(page);
  assert(lvl.coinsTaken >= 3, 'the hidden bonus platforming route is completable and yields its bonus coins');

  console.log('\nNo console/page errors across the whole run:');
  assert(consoleErrors.length === 0, 'zero browser console errors (' + consoleErrors.join(' | ') + ')');
  assert(pageErrors.length === 0, 'zero uncaught page errors (' + pageErrors.join(' | ') + ')');

  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('Smoke test crashed:', e); process.exit(1); });
