// 回归：原有控件 + 随机 + 触屏双击，在 ?manual 模式下用真实事件点一遍
import { chromium } from 'playwright-core';
import path from 'node:path';
const FILE = 'file://' + path.resolve(process.env.HTML || 'dist/index.html');
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const logs = [], results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + extra : '')); };
const hook = page => {
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
};
const P = page => page.evaluate(() => JSON.stringify(CY.P));
const step = (page, n, dt) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, [n || 1, dt || 0.1]);

{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 640 } })).newPage(); hook(page);
  await page.goto(FILE + '?manual'); await page.waitForFunction(() => window.CY);
  await page.evaluate(() => { CY.set('subdiv', 16); CY.set('link', false); CY.set('gap', 0.3); });
  for (const sel of ['.chip', '.seg button', '.sw', '.tg', '.sw-row', '.dot']) {
    const n = await page.locator(sel).count(); let fails = [], done = 0;
    for (let i = 0; i < n; i++) {
      const e = page.locator(sel).nth(i);
      if (!(await e.isVisible())) continue;
      if (await e.evaluate(x => !!x.closest('.row.off'))) continue;   // 被禁用的行（如同步时的 n₂）按设计不可点
      await e.scrollIntoViewIfNeeded();
      const before = await P(page);
      try { await e.click({ timeout: 4000 }); } catch (err) { fails.push(i + ':click'); continue; }
      await step(page, 1, 0.1); done++;
      const after = await P(page);
      const on = await e.evaluate(x => x.classList.contains('on') || !!x.querySelector('.switch.on'));
      if (sel === '.chip' || sel === '.seg button' || sel === '.sw') { if (!on) fails.push(i + ':not-on'); }
      else if (before === after) fails.push(i + ':no-change');
      if (sel === '.chip') await page.evaluate(() => { CY.set('link', false); });
    }
    ok(`${sel} × ${done}/${n}`, fails.length === 0, fails.join(' '));
  }
  for (let i = 0; i < 24; i++) { await page.locator('#btn-rand').click(); await step(page, 2, 0.6); }
  ok('随机 × 24', true, await page.evaluate(() => `gap ${CY.P.gap.toFixed(2)} ${CY.P.sepGroup}/${CY.P.sepDir}`));
  await page.locator('#btn-reset').click(); await step(page, 12, 0.2);
  ok('重置', await page.evaluate(() => Math.abs(CY.P.n - 5) < 1e-9 && CY.P.gap === 0 && CY.P.material === 'glass'));
  await page.keyboard.press('h'); await step(page, 3, 0.2);
  ok('H 隐藏界面', await page.evaluate(() => document.body.classList.contains('ui-hidden')));
  await page.locator('#open').click(); await step(page, 3, 0.2);
  ok('“参数”按钮恢复界面', await page.evaluate(() => !document.body.classList.contains('ui-hidden')));
  await page.keyboard.press('Space'); ok('空格暂停', await page.evaluate(() => CY.P.auto === false));
  await page.keyboard.press('Space'); ok('空格继续', await page.evaluate(() => CY.P.auto === true));
  await page.keyboard.press('1'); await page.keyboard.press('8'); await step(page, 12, 0.2);
  ok('数字键预设 8 = Dwork', await page.evaluate(() => CY.P.material === 'solid' && Math.abs(CY.P.psi - 0.4) < 0.3));
  // 分区折叠
  const h2 = page.locator('#scroll section h2', { hasText: '面片分离' });
  await h2.scrollIntoViewIfNeeded(); await h2.click();
  ok('“面片分离”分区可折叠', await h2.evaluate(e => e.parentElement.classList.contains('closed')));
  await h2.click();
  ok('“面片分离”分区可展开', await h2.evaluate(e => !e.parentElement.classList.contains('closed')));
  // Dwork 形变 + 非整数 n + 分离 + 四维透视 一起开，逐帧渲染若干帧
  await page.evaluate(() => { CY.set('n', 3.4); CY.set('persp', 0.3); CY.set('neck', 0.5); CY.set('sepDir', '3d'); CY.set('sepGroup', 'col'); CY.set('sepScope', 'one'); CY.set('selK2', 8); CY.toggleSep(); });
  await step(page, 14, 0.2);
  ok('组合压力：Dwork + 非整数 n + 透视 + 收缩 + 列分离(越界选中)', await page.evaluate(() => CY.P.gap > 0.5));
  await page.screenshot({ path: 'shots/r_stress.png' });
  await page.setViewportSize({ width: 600, height: 800 }); await step(page, 3, 0.2);
  await page.setViewportSize({ width: 1200, height: 700 }); await step(page, 3, 0.2);
  ok('窗口缩放', await page.evaluate(() => CY.info.W === 1200 && CY.info.H === 700));
  await page.context().close();
}
{
  // 触屏：轻点两下拾取；底部抽屉里的分离按钮
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); hook(page);
  await page.goto(FILE + '?manual'); await page.waitForFunction(() => window.CY);
  await page.evaluate(() => CY.set('auto', false)); await step(page, 2, 0.1);
  const hit = await page.evaluate(() => CY.pickPatch(195, 400));
  await page.touchscreen.tap(195, 400); await page.touchscreen.tap(195, 400);
  await step(page, 9, 0.2);
  const p = JSON.parse(await P(page));
  ok('触屏轻点两下 → 抽出面片', !!hit && p.sepScope === 'one' && p.selK1 === hit[0] && p.selK2 === hit[1] && p.gap > 0.5, `(${hit}) gap ${p.gap.toFixed(2)}`);
  await page.screenshot({ path: 'shots/r_touch.png' });
  await page.locator('#grab').tap(); await step(page, 4, 0.2);
  const b = page.locator('#btn-sep'); await b.scrollIntoViewIfNeeded(); await b.tap(); await step(page, 9, 0.2);
  ok('触屏点“拼合”', JSON.parse(await P(page)).gap === 0);
  await ctx.close();
}
console.log(results.join('\n'));
console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'no console errors/warnings');
console.log(results.filter(r => r.startsWith('FAIL')).length + ' failed / ' + results.length);
await browser.close();
