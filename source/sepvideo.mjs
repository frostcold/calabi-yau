// 分离 / 拼合演示：确定性逐帧渲染  node sepvideo.mjs <w> <h> <fps> <outDir>
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const [w, h, fps, outDir] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 300)); });
page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await page.goto('file://' + path.resolve(process.env.HTML || 'dist/index.html') + '?manual');
await page.waitForFunction(() => window.CY);
await page.evaluate(() => {
  document.querySelector('#hint').classList.add('gone');
  document.querySelectorAll('#scroll section')[2].scrollIntoView();
  CY.set('speed', 1.3); for (let i = 0; i < 20; i++) CY.step(1 / 30);
});
const DUR = 16, N = DUR * fps;
const events = [
  [0.5,  () => CY.animateGap(0.55)],                                        // 一键分离（四维质心、逐片）
  [2.8,  () => CY.set('sepDir', '3d')],                                     // 三维径向
  [4.0,  () => CY.set('sepGroup', 'row')],                                  // 按 k₁ 行成组
  [5.3,  () => CY.set('sepGroup', 'col')],                                  // 按 k₂ 列成组
  [6.6,  () => { CY.set('sepGroup', 'patch'); CY.set('selK1', 3); CY.set('selK2', 1); CY.set('sepScope', 'one'); }],   // 只抽出一片
  [7.8,  () => { CY.set('selK1', 0); CY.set('selK2', 0); }],                // 换一片
  [8.8,  () => { CY.set('sepScope', 'all'); CY.animateGap(0); }],           // 一键拼合
  [10.5, () => CY.applyPreset('bloom')],                                    // 预设「面片绽放」
  [12.45, () => CY.set('speed', 2.6)]                                       // 预设过渡结束后加速，让呼吸式开合在片尾合拢
];
let ei = 0;
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const t = f / fps;
  while (ei < events.length && t >= events[ei][0]) { await page.evaluate(events[ei][1]); ei++; }
  await page.evaluate(dt => { CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, 1 / fps);
  await page.screenshot({ path: `${outDir}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 96 });
  if (f % 30 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('saved', N, logs.length ? 'CONSOLE: ' + logs.join(' | ') : 'no console errors/warnings');
await browser.close();
