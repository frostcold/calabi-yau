import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 640 }, acceptDownloads: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
await page.goto('file://' + path.resolve('dist/index.html'));
await page.waitForFunction(() => window.CY);
await page.waitForTimeout(2500);
const P = () => page.evaluate(() => JSON.parse(JSON.stringify(CY.P)));
const results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

// stop auto-evolution so slider checks are deterministic
await page.evaluate(() => { CY.set('auto', false); CY.set('link', false); CY.set('psi', 0.3); });
// --- sliders: real mouse drags
const keys = await page.evaluate(() => Object.keys(CY.DEF));
for (const k of keys) {
  const idx = keys.indexOf(k);
  const inp = page.locator('#scroll input[type=range]').nth(idx);
  await inp.scrollIntoViewIfNeeded();
  const box = await inp.boundingBox();
  const before = (await P())[k];
  const def = await page.evaluate(k => CY.DEF[k], k);
  const frac0 = (before - def.min) / (def.max - def.min);
  const target = frac0 < 0.5 ? 0.82 : 0.18;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 6 + (box.width - 12) * frac0, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 6 + (box.width - 12) * (frac0 + target) / 2, y, { steps: 3 });
  await page.mouse.move(box.x + 6 + (box.width - 12) * target, y, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = (await P())[k];
  const txt = await page.locator('#scroll .row output').nth(idx).textContent();
  const expected = def.min + (def.max - def.min) * target;
  ok('slider ' + k, Math.abs(after - before) > 1e-6 && Math.abs(after - expected) < (def.max - def.min) * 0.08, `${before.toFixed(3)} → ${after.toFixed(3)} (label “${txt}”)`);
}
await page.screenshot({ path: 'shots/i_sliders.png' });
// --- presets
for (const pr of await page.evaluate(() => CY.PRESETS.map(p => [p.id, p.name]))) {
  const chip = page.locator('.chip', { hasText: pr[1] }).first();
  await chip.scrollIntoViewIfNeeded(); await chip.click();
  await page.waitForTimeout(400);
  const on = await chip.evaluate(e => e.classList.contains('on'));
  ok('preset ' + pr[1], on);
}
await page.waitForTimeout(3000);
// --- segmented, swatches, layer toggles, switches, dots
for (const sel of ['.seg button', '.sw', '.tg', '.sw-row', '.dot']) {
  const n = await page.locator(sel).count();
  let fails = 0;
  for (let i = 0; i < n; i++) {
    const e = page.locator(sel).nth(i);
    if (!(await e.isVisible())) continue;
    await e.scrollIntoViewIfNeeded();
    const before = JSON.stringify(await P());
    try { await e.click({ timeout: 3000 }); } catch (err) { fails++; continue; }
    await page.waitForTimeout(80);
    const after = JSON.stringify(await P());
    if (sel !== '.seg button' && sel !== '.sw' && before === after) fails++;
  }
  ok(`${sel} × ${n}`, fails === 0, fails ? fails + ' failed' : '');
}
await page.screenshot({ path: 'shots/i_toggles.png' });
// --- orbit + zoom on canvas
const cam0 = await page.evaluate(() => CY.camera.position.toArray());
await page.mouse.move(250, 320); await page.mouse.down(); await page.mouse.move(380, 260, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(600);
const cam1 = await page.evaluate(() => CY.camera.position.toArray());
ok('orbit drag', Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]) > 0.3);
await page.mouse.move(250, 320); await page.mouse.wheel(0, -400); await page.waitForTimeout(900);
const cam2 = await page.evaluate(() => CY.camera.position.toArray());
ok('wheel zoom', Math.hypot(...cam2) < Math.hypot(...cam1) - 0.1, `${Math.hypot(...cam1).toFixed(2)} → ${Math.hypot(...cam2).toFixed(2)}`);
// --- buttons / keys
await page.locator('#btn-reset').click(); await page.waitForTimeout(2500);
ok('reset', (await page.evaluate(() => document.querySelector('.chip.on')?.textContent)) === '五次 · 经典');
await page.locator('#btn-rand').click(); await page.waitForTimeout(2500);
ok('random', (await page.evaluate(() => document.querySelector('.chip.on'))) === null);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#btn-shot').click()]);
await dl.saveAs('shots/i_download.png');
ok('screenshot download', fs.statSync('shots/i_download.png').size > 50000, dl.suggestedFilename() + ' ' + fs.statSync('shots/i_download.png').size + ' bytes');
await page.keyboard.press('h'); await page.waitForTimeout(900);
ok('H hides UI', await page.evaluate(() => document.body.classList.contains('ui-hidden')));
await page.screenshot({ path: 'shots/i_hidden.png' });
await page.locator('#open').click(); await page.waitForTimeout(600);
ok('open button', await page.evaluate(() => !document.body.classList.contains('ui-hidden')));
const a0 = (await P()).auto; await page.keyboard.press('Space'); await page.waitForTimeout(200);
ok('space toggles auto', (await P()).auto !== a0);
await page.keyboard.press('1'); await page.waitForTimeout(500);
// --- section collapse
await page.locator('section h2').nth(2).click(); await page.waitForTimeout(100);
ok('section collapse', await page.locator('section').nth(2).evaluate(e => e.classList.contains('closed')));
await page.locator('section h2').nth(2).click();
// --- resize
await page.setViewportSize({ width: 600, height: 800 }); await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/i_mobile_resize.png' });
await page.setViewportSize({ width: 1200, height: 700 }); await page.waitForTimeout(800);
ok('resize', await page.evaluate(() => CY.renderer.domElement.width > 0));
console.log(results.join('\n'));
console.log('info', JSON.stringify(await page.evaluate(() => CY.info)));
console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'no console errors/warnings');
await browser.close();
