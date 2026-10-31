// By The_headphones
// Checks the Chromo home page shelf entry and the round trip into Overboost and back.
// Needs Playwright with Chromium (not a project dependency).
// Usage: node tests/site.cjs http://localhost:8766/chromo/ <screenshot dir>
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:8766/chromo/';
const out = process.argv[3] || '.';

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));
  await page.goto(base);
  await page.waitForSelector('canvas[data-demo="overboost"]');
  await page.waitForTimeout(2500);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-demo="overboost"]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n / (d.length / 4);
  });
  console.log('preview canvas painted fraction', painted.toFixed(2));
  const shelf = await page.$('#sports');
  await shelf.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/site-shelf.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await (await page.$('#sports')).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/site-shelf-phone.png` });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.click('.box-overboost');
  await page.waitForFunction(() => window.__overboost?.mode === 'menu', null, { timeout: 120000 });
  console.log('game loaded at', page.url());
  await page.click('.site-link');
  await page.waitForSelector('#sports');
  console.log('back link returned to', page.url());
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SITE TEST FAILED:', e); process.exit(1); });
