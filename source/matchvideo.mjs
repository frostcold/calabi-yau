// 「解 ↔ 线」对照演示：确定性逐帧渲染 + 真实鼠标事件  node matchvideo.mjs <w> <h> <fps> <outDir> [maxFrames]
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const [w, h, fps, outDir] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const every = +(process.env.EVERY || 1);            // EVERY=10 → 只存每 10 帧，用来快速预览
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
  // 演示用的假光标（无头浏览器截图里没有系统光标）
  const c = document.createElement('div'); c.id = 'vcur';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;pointer-events:none;width:22px;height:22px;margin:-2px 0 0 -3px';
  c.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3.5 2.5v15l4.1-3.9 2.7 6 2.3-1-2.7-5.9h5.6z" fill="#fff" stroke="#0a0c16" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = 'vring';
  r.style.cssText = 'position:fixed;left:0;top:0;z-index:98;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid rgba(255,255,255,.9);opacity:0';
  document.body.append(r, c);
  CY.set('speed', 0.3); for (let i = 0; i < 20; i++) CY.step(1 / 30);
});
const center = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
const marker = j => page.evaluate(j => { const s = CY.match.samples[j]; return s ? [s.scr[0], s.scr[1]] : null; }, j);
const row = j => `.pts button.tr[data-j="${j}"]`, leg = k => `.leg .it[data-k="${k}"]`;
// 时间线：t（秒）到达目标；click 表示到达时点击；scroll 表示面板滚动到某处（0…1 = 顶…底）
const DUR = 16.5;
const TL = [
  { t: 0.0, at: [w * 0.47, h * 0.62] },
  { t: 1.0, sel: '.tab[data-tab="match"]', click: true },          // 打开「解 ↔ 线」
  { t: 2.2, sel: leg('0,2'), click: true },                        // 点图例：一组解 ↔ 一片曲面
  { t: 3.2, sel: leg('1,0'), click: true },
  { t: 4.2, sel: leg('1,2'), click: true },
  { t: 5.1, sel: '#btn-solo', click: true },                       // 仅显示选中
  { t: 6.3, sel: '#btn-solo', click: true },
  { t: 7.3, sel: row(0) },                                         // 表格行 → 图上的点
  { t: 7.9, sel: row(1) },
  { t: 8.5, sel: row(2) },
  { t: 9.1, sel: row(3) },
  { t: 9.7, sel: row(4) },
  { t: 10.3, sel: row(3), click: true },
  { t: 11.4, mark: 1 },                                            // 图上的点 → 表格行
  { t: 12.0, mark: 1, click: true },
  { t: 13.1, sel: '.nseg button:nth-child(1)', click: true },      // n = 2：四组 ± 解
  { t: 14.5, sel: leg('1,0'), click: true },
  { t: 15.4, sel: leg('0,1'), click: true },
  { t: DUR + 1, sel: leg('0,1') }
];
const SCROLL = [[6.4, 7.1, 'samples'], [12.2, 12.8, 'top']];      // 面板滚动（模拟滚轮）
const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const target = async e => e.at || (e.mark !== undefined ? await marker(e.mark) : await center(e.sel));
const N = Math.round(DUR * fps);
let seg = 0, from = TL[0].at, cur = TL[0].at, ring = -1, scrollFrom = null;
await page.mouse.move(cur[0], cur[1]);
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const t = f / fps;
  // 面板滚动
  for (const [a, b, where] of SCROLL) if (t >= a && t <= b + 1 / fps) {
    await page.evaluate(([x, where]) => {
      const root = document.querySelector('#scroll'); window.__s0 ??= {}; window.__s0[where] ??= root.scrollTop;
      const det = document.querySelector('.det'), end = where === 'top' ? 0 : root.scrollTop + det.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom + 18;
      window.__s1 ??= {}; window.__s1[where] ??= Math.max(0, end);
      root.scrollTop = window.__s0[where] + (window.__s1[where] - window.__s0[where]) * x;
    }, [ease(Math.min(1, (t - a) / (b - a))), where]);
  }
  // 光标
  while (seg + 1 < TL.length && t >= TL[seg + 1].t - 1e-9) {
    seg++; const e = TL[seg], p = await target(e);
    if (p) { cur = p; await page.mouse.move(p[0], p[1]); if (e.click) { await page.mouse.down(); await page.mouse.up(); ring = 0; } }
    from = cur;
  }
  if (seg + 1 < TL.length) {
    const a = TL[seg], b = TL[seg + 1], p = await target(b);
    // 每段先停一会儿再走，像人手的节奏
    const x = Math.max(0, Math.min(1, ((t - a.t) / (b.t - a.t) - 0.25) / 0.75));
    if (p) { cur = [from[0] + (p[0] - from[0]) * ease(x), from[1] + (p[1] - from[1]) * ease(x)]; await page.mouse.move(cur[0], cur[1]); }
  }
  await page.evaluate(([x, y, ring, dt]) => {
    const c = document.querySelector('#vcur'), r = document.querySelector('#vring');
    c.style.transform = `translate(${x}px,${y}px)`;
    if (ring >= 0 && ring < 1) { r.style.opacity = String(0.9 * (1 - ring)); r.style.transform = `translate(${x}px,${y}px) scale(${0.35 + ring * 0.9})`; } else r.style.opacity = '0';
    CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4));
  }, [cur[0], cur[1], ring, 1 / fps]);
  if (ring >= 0) { ring += 1 / (0.4 * fps); if (ring >= 1) ring = -1; }
  if (f % every === 0) await page.screenshot({ path: `${outDir}/f${String(f / every).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 96 });
  if (f % 30 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('saved', N, logs.length ? 'CONSOLE: ' + logs.join(' | ') : 'no console errors/warnings');
await browser.close();
