// 面片分离功能的交互测试：真实鼠标 / 键盘事件 + ?manual 确定性步进
import { chromium } from 'playwright-core';
import path from 'node:path';
const FILE = 'file://' + path.resolve(process.env.HTML || 'dist/index.html');
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const logs = [], results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + extra : '')); };
async function open(q, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 900, height: 640 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
  await page.goto(FILE + q);
  await page.waitForFunction(() => window.CY);
  return page;
}
const P = page => page.evaluate(() => JSON.parse(JSON.stringify(CY.P)));
const steps = (page, n, dt) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, [n, dt]);

let p;
const page = await open('?manual');
await page.evaluate(() => { CY.set('auto', false); CY.set('link', false); CY.set('psi', 0.3); });
await steps(page, 2, 0.1);

// ---------- 1. 所有滑块（含新增的 4 个）真实拖动
const keys = await page.evaluate(() => Object.keys(CY.DEF).filter(k => k !== 'sampN' && k !== 'sampY'));
for (const k of keys) {
  const inp = page.locator(`#scroll input[data-k="${k}"]`);
  await inp.scrollIntoViewIfNeeded();
  const box = await inp.boundingBox();
  const before = (await P(page))[k];
  const min = +(await inp.getAttribute('min')), max = +(await inp.getAttribute('max'));
  const frac0 = (Math.min(before, max) - min) / (max - min);
  const target = frac0 < 0.5 ? 0.82 : 0.18;
  const y = box.y + box.height / 2, X = f => box.x + 6 + (box.width - 12) * f;
  await page.mouse.move(X(frac0), y); await page.mouse.down();
  await page.mouse.move(X((frac0 + target) / 2), y, { steps: 3 }); await page.mouse.move(X(target), y, { steps: 3 });
  await page.mouse.up();
  await steps(page, 1, 0.05);
  const after = (await P(page))[k];
  const txt = await page.locator(`#scroll input[data-k="${k}"]`).locator('xpath=..').locator('output').textContent();
  const expected = min + (max - min) * target;
  const tol = Math.max((max - min) * 0.08, k.startsWith('selK') ? 0.6 : 0);
  ok('slider ' + k, Math.abs(after - before) > 1e-6 && Math.abs(after - expected) < tol, `${(+before).toFixed(3)} → ${(+after).toFixed(3)} (显示 “${txt}”, max ${max})`);
}
ok('拖动“选中 k”自动切到仅选中', (await P(page)).sepScope === 'one');
await page.locator('#btn-reset').click(); await steps(page, 12, 0.2);
p = await P(page);
ok('重置后间隙归零、其余参数复位', p.gap === 0 && p.sepScope === 'all' && Math.abs(p.ext - 1) < 1e-9 && Math.abs(p.n - 5) < 1e-9 && Math.abs(p.shrink - 0.05) < 1e-9, `gap ${p.gap} ext ${p.ext} n ${p.n}`);

// ---------- 2. 分段控件：分组 / 方向 / 范围
const sec = page.locator('#scroll section', { hasText: '面片分离' });
await sec.scrollIntoViewIfNeeded();
for (const [label, key, val] of [['k₁ 行', 'sepGroup', 'row'], ['k₂ 列', 'sepGroup', 'col'], ['逐片', 'sepGroup', 'patch'],
  ['三维径向', 'sepDir', '3d'], ['四维质心', 'sepDir', '4d'], ['仅选中', 'sepScope', 'one'], ['全部', 'sepScope', 'all']]) {
  const b = sec.locator('.seg button', { hasText: label });
  await b.scrollIntoViewIfNeeded(); await b.click();
  await steps(page, 1, 0.1);
  const p = await P(page);
  ok(`分段 ${label}`, p[key] === val && await b.evaluate(e => e.classList.contains('on')), `${key} = ${p[key]}`);
  if (key === 'sepGroup') {
    const off1 = await page.locator('input[data-k="selK1"]').locator('xpath=..').evaluate(e => e.classList.contains('off'));
    const off2 = await page.locator('input[data-k="selK2"]').locator('xpath=..').evaluate(e => e.classList.contains('off'));
    ok(`  选中滑块禁用状态 (${val})`, off1 === (val === 'col') && off2 === (val === 'row'), `k₁ off=${off1} k₂ off=${off2}`);
  }
}

// ---------- 3. 一键分离 / 拼合
const btn = page.locator('#btn-sep');
await btn.scrollIntoViewIfNeeded();
ok('按钮初始文字', (await btn.locator('span').textContent()) === '分离');
await btn.click();
const mid = []; for (let i = 0; i < 8; i++) { await steps(page, 1, 0.2); mid.push((await P(page)).gap); }
ok('点击 → 平滑分离', Math.abs(mid[7] - 0.55) < 1e-6 && mid[0] > 0 && mid[0] < 0.05 && mid.every((v, i) => i === 0 || v >= mid[i - 1]), mid.map(v => v.toFixed(3)).join(' '));
ok('按钮文字变为拼合', (await btn.locator('span').textContent()) === '拼合' && await btn.evaluate(e => e.classList.contains('open')));
await page.screenshot({ path: 'shots/i3_open.png' });
await btn.click();
const mid2 = []; for (let i = 0; i < 8; i++) { await steps(page, 1, 0.2); mid2.push((await P(page)).gap); }
ok('再点 → 平滑拼合到 0', mid2[7] === 0 && mid2[0] < 0.55 && mid2.every((v, i) => i === 0 || v <= mid2[i - 1]), mid2.map(v => v.toFixed(3)).join(' '));
ok('按钮文字变回分离', (await btn.locator('span').textContent()) === '分离');

// ---------- 4. 间隙自动演变（呼吸式开合）
const dot = page.locator('input[data-k="gap"]').locator('xpath=..').locator('.dot');
await dot.click();
p = await P(page);
ok('间隙圆点点亮并开启自动演变', p.autos.gap === true && p.auto === true && await dot.evaluate(e => e.classList.contains('on')));
const tr = [];
for (let i = 0; i < 60; i++) { await page.evaluate(() => CY.step(0.25)); tr.push((await P(page)).gap); }
const mx = Math.max(...tr), zeros = tr.filter(v => v === 0).length;
ok('呼吸式开合：到达上限并完全拼合', mx > 0.55 && mx <= 0.62 + 1e-6 && zeros >= 3 && tr.some((v, i) => i > 30 && v > 0.3), `max ${mx.toFixed(3)}, 完全拼合帧 ${zeros}/60`);
await dot.click();
ok('圆点熄灭', (await P(page)).autos.gap !== true);
await page.evaluate(() => { CY.set('auto', false); CY.set('gap', 0); });

// ---------- 5. 键盘
await page.locator('#stage').focus().catch(() => {});
await page.keyboard.press('g'); await steps(page, 9, 0.2);
ok('G → 分离', Math.abs((await P(page)).gap - 0.55) < 1e-6, 'gap ' + (await P(page)).gap.toFixed(3));
const g0 = (await P(page)).gap;
await page.keyboard.press(']'); await page.keyboard.press(']'); await steps(page, 1, 0.05);
ok('] 加大间隙', Math.abs((await P(page)).gap - (g0 + 0.1)) < 0.011, (await P(page)).gap.toFixed(3));
await page.keyboard.press('['); await steps(page, 1, 0.05);
ok('[ 减小间隙', Math.abs((await P(page)).gap - (g0 + 0.05)) < 0.011, (await P(page)).gap.toFixed(3));
await page.keyboard.press('g'); await steps(page, 9, 0.2);
ok('G → 拼合', (await P(page)).gap === 0);
await page.keyboard.press('-'); await steps(page, 1, 0.05);
ok('- → 预设 面片绽放', await page.locator('.chip', { hasText: '面片绽放' }).evaluate(e => e.classList.contains('on')));
await page.keyboard.press('='); await steps(page, 1, 0.05);
ok('= → 预设 分组拆解', await page.locator('.chip', { hasText: '分组拆解' }).evaluate(e => e.classList.contains('on')) && (await P(page)).sepGroup === 'row');
await steps(page, 12, 0.2);
p = await P(page);
ok('分组拆解 预设参数到位', Math.abs(p.gap - 0.62) < 1e-6 && Math.abs(p.n - 4) < 1e-6 && p.material === 'solid', `gap ${p.gap} n ${p.n}`);
await page.locator('.chip', { hasText: '面片绽放' }).click(); await steps(page, 12, 0.2);
p = await P(page);
ok('面片绽放 预设（点击）', p.autos.gap === true && p.sepDir === '3d' && p.sepGroup === 'patch', `gap ${p.gap.toFixed(3)}`);
await page.locator('.chip', { hasText: '五次 · 经典' }).click(); await steps(page, 12, 0.2);
ok('切回旧预设 → 间隙为 0', (await P(page)).gap === 0);

// ---------- 6. 双击拾取面片
await page.evaluate(() => { CY.set('auto', false); });
await steps(page, 1, 0.05);
const pts = [[250, 330], [330, 270], [200, 400], [300, 420]];
let picked = 0, agree = 0, last = null;
for (const [x, y] of pts) {
  const expect = await page.evaluate(([x, y]) => CY.pickPatch(x, y), [x, y]);
  if (!expect) continue;
  picked++;
  await page.evaluate(() => { CY.set('sepScope', 'all'); CY.set('gap', 0); });
  await page.mouse.dblclick(x, y);
  p = await P(page);
  if (p.sepScope === 'one' && p.selK1 === expect[0] && p.selK2 === expect[1]) agree++;
  last = [x, y, expect];
}
ok('双击面片 → 选中并抽出', picked >= 3 && agree === picked, `${agree}/${picked} 个点命中，最后一次 (${last && last[2]})`);
await steps(page, 9, 0.2);
ok('双击后间隙动画到位（沿用上次间隙）', Math.abs((await P(page)).gap - (await page.evaluate(() => CY.info.sepLast))) < 1e-6 && (await P(page)).gap > 0.5, 'gap ' + (await P(page)).gap.toFixed(3));
await page.screenshot({ path: 'shots/i3_pick.png' });
// 同一面片再双击 → 归位（先把它放回原处的屏幕位置：间隙很小但仍视为打开）
await page.evaluate(() => { CY.set('gap', 0.03); }); await steps(page, 1, 0.05);
await page.mouse.dblclick(last[0], last[1]); await steps(page, 9, 0.2);
ok('再次双击同一面片 → 归位', (await P(page)).gap === 0, 'gap ' + (await P(page)).gap);
const scopeBefore = (await P(page)).sepScope;
await page.mouse.dblclick(30, 600); await steps(page, 1, 0.05);
ok('双击空白处无动作', (await P(page)).sepScope === scopeBefore && (await page.evaluate(() => CY.pickPatch(30, 600))) === null);
// 行分组下双击 → 抽出整行
await page.evaluate(() => { CY.set('sepGroup', 'row'); CY.set('sepScope', 'all'); CY.set('gap', 0); });
await page.mouse.dblclick(pts[0][0], pts[0][1]); await steps(page, 9, 0.2);
p = await P(page);
ok('k₁ 行分组下双击 → 抽出整行', p.sepScope === 'one' && p.gap > 0.5, `selK1 ${p.selK1}`);
await page.screenshot({ path: 'shots/i3_pickrow.png' });
// 拖动（旋转）不应触发拾取
await page.evaluate(() => { CY.set('sepScope', 'all'); CY.set('gap', 0); });
const cam0 = await page.evaluate(() => CY.camera.position.toArray());
await page.mouse.move(250, 320); await page.mouse.down(); await page.mouse.move(380, 260, { steps: 6 }); await page.mouse.up();
await steps(page, 3, 0.1);
const cam1 = await page.evaluate(() => CY.camera.position.toArray());
ok('拖动仍是旋转、不触发拾取', Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1], cam1[2] - cam0[2]) > 0.3 && (await P(page)).sepScope === 'all');

// ---------- 7. 截图按钮在分离状态下可用
const dl = page.waitForEvent('download', { timeout: 60000 });
await page.evaluate(() => { CY.set('gap', 0.5); });
await page.locator('#btn-shot').click();
const d = await dl; await d.saveAs('shots/i3_download.png');
ok('分离状态截图下载', true, d.suggestedFilename());
await page.context().close();

// ---------- 8. URL 参数
const page2 = await open('?manual&gap=0.6&group=col');
p = await P(page2);
ok('URL ?gap=0.6&group=col', p.gap === 0.6 && p.sepGroup === 'col' && (await page2.locator('#btn-sep span').textContent()) === '拼合');
await page2.context().close();
const page3 = await open('?manual&preset=slices&clean');
p = await P(page3);
ok('URL ?preset=slices&clean', p.gap === 0.62 && p.sepGroup === 'row' && await page3.evaluate(() => document.body.classList.contains('ui-hidden')));
await page3.context().close();

// ---------- 9. 实时模式冒烟：按 G、切预设，不应有任何控制台报错
const page4 = await open('', { width: 640, height: 420 });
await page4.waitForTimeout(2500);
await page4.keyboard.press('g'); await page4.waitForTimeout(5000);
const g4 = (await P(page4)).gap;
await page4.keyboard.press('-'); await page4.waitForTimeout(5000);
await page4.mouse.dblclick(200, 210); await page4.waitForTimeout(3000);
ok('实时模式：G 之后间隙在增大', g4 > 0.01, 'gap ' + g4.toFixed(3));
await page4.screenshot({ path: 'shots/i3_realtime.png' });
await page4.context().close();

console.log(results.join('\n'));
console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'no console errors/warnings');
console.log(results.filter(r => r.startsWith('FAIL')).length + ' failed / ' + results.length);
await browser.close();
