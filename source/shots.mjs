// usage: node shots.mjs '<json array of {out, js, steps, w, h, q}>'
import { chromium } from 'playwright-core';
import path from 'node:path';
const jobs = JSON.parse(process.argv[2]);
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let logs = [];
for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: j.w || 1100, height: j.h || 700 }, deviceScaleFactor: j.dsf || 1, hasTouch: !!j.touch, isMobile: !!j.touch });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(j.out + ' ' + m.type() + ': ' + m.text().slice(0, 500)); });
  page.on('pageerror', e => logs.push(j.out + ' PAGEERROR: ' + e.message));
  await page.goto('file://' + path.resolve(process.env.HTML || 'dist/index.html') + '?manual' + (j.q ? '&' + j.q : ''));
  await page.waitForFunction(() => window.CY, null, { timeout: 20000 });
  if (j.js) await page.evaluate(j.js);
  const n = j.steps === undefined ? 4 : j.steps;
  for (let i = 0; i < n; i++) await page.evaluate(dt => { CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, j.dt || 0.5);
  await page.screenshot({ path: 'shots/' + j.out + '.png', timeout: 120000 });
  await ctx.close();
}
console.log(logs.length ? logs.join('\n') : 'no console errors/warnings');
await browser.close();
