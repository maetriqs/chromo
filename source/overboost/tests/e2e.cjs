// By The_headphones
// Browser smoke test against a static build served under a subpath.
// Needs Playwright with Chromium (not a project dependency).
// Usage: node tests/e2e.cjs http://localhost:8765/overboost/ <screenshot dir> [quality]
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:8765/overboost/';
const out = process.argv[3] || '.';
const quality = process.argv[4] || 'medium';

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  await page.addInitScript((q) => {
    localStorage.setItem('overboost.settings.v1', JSON.stringify({ quality: q, autoQualityDone: true, showFps: true }));
  }, quality);

  const t0 = Date.now();
  await page.goto(url);
  await page.waitForSelector('#screen-main.active', { timeout: 90000 });
  console.log(`menu ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/01-menu.png` });

  // Navigate: PLAY -> setup -> start 1v1
  await page.click('[data-action="play"]');
  await page.waitForSelector('#screen-play.active');
  await page.screenshot({ path: `${out}/02-play-setup.png` });
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => window.__overboost.mode === 'match');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/03-kickoff.png` });
  // Wait for countdown to end (sim time based)
  await page.waitForFunction(() => window.__overboost.sim.state === 'playing', null, { timeout: 120000 });
  const p0 = await page.evaluate(() => ({ ...window.__overboost.sim.human.position }));

  // Drive with boost
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(() => window.__overboost.sim.stepCount > 0 && window.__overboost.sim.human.speed > 12, null, { timeout: 120000 });
  await page.screenshot({ path: `${out}/04-boosting.png` });
  await page.keyboard.up('ShiftLeft');
  const s1 = await page.evaluate(() => {
    const c = window.__overboost.sim.human;
    return { pos: { ...c.position }, speed: c.speed, boost: c.boost };
  });
  console.log('start', p0, 'after driving', s1);

  // Jump
  await page.keyboard.press('Space');
  let maxY = 0;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => window.__overboost.sim.human.position.y);
    maxY = Math.max(maxY, y);
    await page.waitForTimeout(50);
  }
  console.log('jump peak y', maxY.toFixed(2));
  await page.keyboard.up('KeyW');

  // Ball cam toggle
  const cam0 = await page.evaluate(() => window.__overboost.ballCam);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(1000);
  const cam1 = await page.evaluate(() => window.__overboost.ballCam);
  console.log('ball cam', cam0, '->', cam1);

  // Pause and settings
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-pause.active');
  await page.screenshot({ path: `${out}/05-pause.png` });
  await page.click('#screen-pause [data-action="settings"]');
  await page.waitForSelector('#screen-settings.active');
  await page.screenshot({ path: `${out}/06-settings.png` });
  await page.click('[data-tab="controls"]');
  await page.screenshot({ path: `${out}/07-settings-controls.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-pause.active');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__overboost.mode === 'match');
  console.log('resume OK');

  // Force a goal to exercise the celebration path: drop the ball into the orange net.
  await page.evaluate(() => {
    const sim = window.__overboost.sim;
    sim.lastTouchByTeam[0] = sim.human;
    sim.ball.lastTouch = sim.human;
    sim.ball.reset(0, 2, 49, 0, 0, 25);
  });
  await page.waitForFunction(() => window.__overboost.sim.score[0] === 1, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/08-goal.png` });
  console.log('goal registered, score', await page.evaluate(() => window.__overboost.sim.score));

  // Wait for kickoff reset and then end the match quickly
  await page.waitForFunction(() => window.__overboost.sim.state === 'countdown', null, { timeout: 60000 });
  await page.evaluate(() => { const s = window.__overboost.sim; s.timeLeft = 0.05; });
  await page.waitForFunction(() => window.__overboost.sim.state === 'ended', null, { timeout: 120000 });
  await page.waitForSelector('#screen-results.active', { timeout: 60000 });
  await page.screenshot({ path: `${out}/09-results.png` });
  console.log('results shown');

  // Play again, then quit to menu, then free play + training
  await page.click('#screen-results [data-action="restart"]');
  await page.waitForFunction(() => window.__overboost.mode === 'match' && window.__overboost.sim.score[0] === 0);
  await page.keyboard.press('Escape');
  await page.click('#screen-pause [data-action="quit"]');
  await page.waitForSelector('#screen-main.active');
  await page.click('[data-action="freeplay"]');
  await page.waitForFunction(() => window.__overboost.mode === 'match');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${out}/10-freeplay.png` });
  await page.keyboard.press('Escape');
  await page.click('#screen-pause [data-action="quit"]');
  await page.click('[data-action="training"]');
  await page.waitForFunction(() => window.__overboost.mode === 'match');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/11-training.png` });
  await page.keyboard.press('Escape');
  await page.click('#screen-pause [data-action="quit"]');
  await page.click('[data-action="controls"]');
  await page.waitForSelector('#screen-controls.active');
  await page.screenshot({ path: `${out}/12-controls.png` });
  await page.keyboard.press('Escape');
  await page.click('[data-action="credits"]');
  await page.screenshot({ path: `${out}/13-credits.png` });

  // Rebind jump to J from Settings -> Controls, then use it in free play.
  await page.keyboard.press('Escape');
  await page.click('[data-action="settings"]');
  await page.click('[data-tab="controls"]');
  await page.click('#binds tbody tr:nth-child(5) td:nth-child(2) .keycap');
  await page.keyboard.press('KeyJ');
  const jumpKeys = await page.evaluate(() => window.__overboost.settings.bindings.jump);
  console.log('jump rebound to', jumpKeys);
  await page.click('#screen-settings [data-action="back"]');
  await page.click('[data-action="freeplay"]');
  await page.waitForFunction(() => window.__overboost.mode === 'match' && window.__overboost.sim.human.onGround);
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__overboost.sim.human.position.y > 0.8, null, { timeout: 30000 });
  console.log('rebound key jumps: OK');
  await page.keyboard.press('Escape');
  await page.click('#screen-pause [data-action="quit"]');

  // 2v2 with a mocked gamepad holding the right trigger.
  await page.evaluate(() => {
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    pad.buttons[7] = { pressed: true, value: 1 };
    navigator.getGamepads = () => [pad];
  });
  await page.click('[data-action="play"]');
  await page.click('[data-seg="teamSize"] [data-value="2"]');
  await page.click('[data-action="start"]');
  await page.waitForFunction(() => window.__overboost.sim?.cars.length === 4 && window.__overboost.sim.state === 'playing', null, { timeout: 120000 });
  await page.waitForFunction(() => window.__overboost.sim.human.speed > 5, null, { timeout: 60000 });
  console.log('2v2 running with', await page.evaluate(() => window.__overboost.sim.cars.map((c) => `${c.name}/${c.team}`).join(', ')), '; gamepad throttle drives the car');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/14-2v2.png` });

  const audioOk = await page.evaluate(() => window.__overboost.audio.ready);
  console.log('audio graph running:', audioOk);
  const fps = await page.evaluate(() => window.__overboost.fps);
  console.log('fps (software renderer)', fps.toFixed(1));
  console.log('console errors/warnings:', errors.length ? `\n  ${errors.join('\n  ')}` : 'none');
  await browser.close();
  process.exit(errors.some((e) => e.startsWith('[pageerror]') || e.startsWith('[error]') || e.startsWith('[requestfailed]')) ? 1 : 0);
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
