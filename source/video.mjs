// deterministic frame-by-frame capture: node video.mjs <w> <h> <fps> <outDir> [frameStride]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const [w, h, fps, outDir, stride] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +(process.argv[6] || 1)];
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 300)); });
page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await page.goto('file://' + path.resolve(process.env.HTML || 'dist/index.html') + '?manual');
await page.waitForFunction(() => window.CY);
await page.evaluate(() => { document.querySelector('#hint').classList.add('gone'); CY.set('speed', 1.5); for (let i = 0; i < 20; i++) CY.step(1 / 30); });
const DUR = 15, N = DUR * fps;
const events = [
  [3.2, () => { CY.P.autos.n = true; CY.set('speed', 3.2); }],
  [7.3, () => { CY.applyPreset('dwork'); CY.set('speed', 1.7); }],
  [11.2, () => { CY.applyPreset('stardust'); CY.set('speed', 1.6); }]
];
let ei = 0, saved = 0;
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const t = f / fps;
  while (ei < events.length && t >= events[ei][0]) { await page.evaluate(events[ei][1]); ei++; }
  const shoot = f % stride === 0;
  await page.evaluate(([dt, sync]) => { CY.step(dt); if (sync) { const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); } }, [1 / fps, shoot]);
  if (shoot) { await page.screenshot({ path: `${outDir}/f${String(saved).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 96 }); saved++; }
  if (f % 30 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('saved', saved, logs.length ? 'CONSOLE: ' + logs.join(' | ') : 'no console errors/warnings');
await browser.close();
