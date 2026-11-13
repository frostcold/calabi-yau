// 「解 ↔ 线」对照功能的交互测试：?manual 步进 + 真实鼠标 / 键盘 / 触屏事件
import { chromium } from 'playwright-core';
import path from 'node:path';
const FILE = 'file://' + path.resolve(process.env.HTML || 'dist/index.html');
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const logs = [], results = [];
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' — ' + extra : '')); };
async function open(q, opt) {
  const ctx = await browser.newContext(opt || { viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').slice(0, 400)));
  await page.goto(FILE + q);
  await page.waitForFunction(() => window.CY);
  return page;
}
const P = page => page.evaluate(() => JSON.parse(JSON.stringify(CY.P)));
const steps = (page, n, dt) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) CY.step(dt); const g = CY.renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }, [n || 1, dt || 0.1]);
const samples = page => page.evaluate(() => CY.match.samples.map(s => ({ r: s.r, z1: s.z1, z2: s.z2, chk: s.chk, scr: s.scr })));
const hiOf = (page, k1, k2) => page.evaluate(([a, b]) => CY.sepW[2 * (b * 9 + a) + 1], [k1, k2]);
// 编号点可能正好落在面片的轮廓线上，所以在 ±3 px 内拾取
const pickNear = (page, x, y) => page.evaluate(([x, y]) => { const set = new Set(); for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) { const h = CY.pickPatch(x + dx, y + dy); if (h) set.add(h.join(',')); } return [...set]; }, [x, y]);
const txt = s => s.replace(/\s+/g, ' ').trim();
// 复数主值幂
const cpow = (z, p) => { const m = Math.hypot(z[0], z[1]); if (m < 1e-12) return [0, 0]; const a = Math.atan2(z[1], z[0]) * p, r = Math.pow(m, p); return [r * Math.cos(a), r * Math.sin(a)]; };
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
let p;

const page = await open('?manual');
await page.evaluate(() => CY.set('auto', false)); await steps(page, 2, 0.1);

// ---------- 1. 打开对照页
ok('初始在“参数”页、对照关闭', (await P(page)).match === false && !(await page.locator('#tab-match').isVisible()));
await page.locator('.tab', { hasText: '解 ↔ 线' }).click(); await steps(page, 8, 0.2);
p = await P(page);
ok('点“解 ↔ 线”页签 → 对照打开', p.match === true && await page.locator('#tab-match').isVisible() && !(await page.locator('#tab-params').isVisible()));
ok('自动切到按面片着色', p.colorMode === 'patch' && await page.locator('#btn-bypatch').evaluate(e => e.classList.contains('on')));
ok('图例 5 × 5 = 25 行', await page.locator('.leg .it').count() === 25);
ok('默认选中 (0,0) 且该行高亮', p.selK1 === 0 && p.selK2 === 0 && await page.locator('.leg .it[data-k="0,0"]').evaluate(e => e.classList.contains('on')));
ok('着色器高亮权重：选中 = 1，其余 = 0', await hiOf(page, 0, 0) === 1 && await hiOf(page, 1, 2) === 0 && await page.evaluate(() => CY.U.uHiFocus.value) > 0.99);

// ---------- 2. 点图例行
const row12 = page.locator('.leg .it[data-k="1,2"]');
await row12.scrollIntoViewIfNeeded(); await row12.click(); await steps(page, 8, 0.2);
p = await P(page);
ok('点图例行 k₁=1, k₂=2 → 选中', p.selK1 === 1 && p.selK2 === 2 && await row12.evaluate(e => e.classList.contains('on')) && await page.locator('.leg .it.on').count() === 1);
ok('高亮权重跟随', await hiOf(page, 1, 2) === 1 && await hiOf(page, 0, 0) === 0);
ok('图例行文字', txt(await row12.textContent()) === 'k₁=1, k₂=2z1 = ω·r1/5 z2 = ω2·(1−r)1/5', txt(await row12.textContent()));
const chip = await row12.locator('.pc').evaluate(e => getComputedStyle(e).backgroundColor);
const chip00 = await page.locator('.leg .it[data-k="0,0"] .pc').evaluate(e => getComputedStyle(e).backgroundColor);
ok('色标有颜色且各行不同', /^rgb/.test(chip) && chip !== chip00, chip + ' vs ' + chip00);
const fxT = txt(await page.locator('.fx').textContent());
ok('公式栏：方程 / 通解 / 当前分支', fxT.includes('z15 + z25 = 1') && fxT.includes('z1 = ωk₁·r1/5') && fxT.includes('k₁ = 1，k₂ = 2') && fxT.includes('z1 = e2πi·1/5·r1/5') && fxT.includes('z2 = e2πi·2/5·(1−r)1/5') && fxT.includes('5 × 5 = 25 组解'), fxT.slice(0, 200));
ok('公式栏给出单位根数值', fxT.includes('e2πi·1/5 = 0.309 + 0.951i') && fxT.includes('e2πi·2/5 = −0.809 + 0.588i'));
ok('左上角 HUD 显示当前分支', txt(await page.locator('#branch').textContent()).includes('k₁ = 1，k₂ = 2') && await page.locator('#branch').isVisible());
// 悬停预览
await page.locator('.leg .it[data-k="0,3"]').hover(); await steps(page, 8, 0.2);
ok('悬停图例行 → 该片临时亮起，选中不变', await hiOf(page, 0, 3) === 1 && await hiOf(page, 1, 2) === 1 && (await P(page)).selK1 === 1);
await page.mouse.move(300, 450); await steps(page, 8, 0.2);
ok('移开 → 预览消失', await hiOf(page, 0, 3) === 0);

// ---------- 3. 数值表与解的正确性
let S = await samples(page);
ok('数值表 5 行', await page.locator('.pts button.tr').count() === 5 && S.length === 5);
{
  let worst = 0, worstChk = 0, textOK = true;
  const om = k => [Math.cos(2 * Math.PI * k / 5), Math.sin(2 * Math.PI * k / 5)];
  for (let j = 0; j < 5; j++) {
    const r = S[j].r[0] < 1e-12 ? 0 : S[j].r[0], e1 = cmul(om(1), [Math.pow(r, 0.2), 0]), e2 = cmul(om(2), [Math.pow(1 - r, 0.2), 0]);
    worst = Math.max(worst, Math.hypot(S[j].z1[0] - e1[0], S[j].z1[1] - e1[1]), Math.hypot(S[j].z2[0] - e2[0], S[j].z2[1] - e2[1]), Math.abs(S[j].r[1]));
    const sum = [cpow(S[j].z1, 5)[0] + cpow(S[j].z2, 5)[0], cpow(S[j].z1, 5)[1] + cpow(S[j].z2, 5)[1]];
    worstChk = Math.max(worstChk, Math.hypot(sum[0] - 1, sum[1]));
    const cells = await page.locator('.pts button.tr').nth(j).locator('span').allTextContents();
    const f = (v, d) => (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '−' : '') + Math.abs(v).toFixed(d);
    const fc = z => f(z[0], 3) + (z[1] < 0 && +Math.abs(z[1]).toFixed(3) !== 0 ? '−' : '+') + Math.abs(z[1]).toFixed(3) + 'i';
    if (cells[0] !== String(j + 1) || cells[1] !== r.toFixed(3) || cells[2] !== fc(e1) || cells[3] !== fc(e2)) { textOK = false; console.log('row mismatch', j, cells, fc(e1), fc(e2)); }
  }
  ok('采样值 = e^{2πik/5}·r^{1/5} 的独立计算', worst < 1e-9, 'max err ' + worst.toExponential(2));
  ok('代回 z₁⁵ + z₂⁵ = 1（测试脚本独立代回）', worstChk < 1e-9, 'max |Σ−1| ' + worstChk.toExponential(2));
  ok('表格文字与独立计算一致', textOK);
}
ok('默认“沿线均匀取点”：r 为整齐的三位小数、0 → 1 递增', Math.abs(S[0].r[0]) < 1e-12 && Math.abs(S[4].r[0] - 1) < 1e-12 && S.every((q, j) => Math.abs(q.r[0] * 1000 - Math.round(q.r[0] * 1000)) < 1e-9 && (j === 0 || q.r[0] > S[j - 1].r[0])), S.map(q => q.r[0].toFixed(3)).join(' '));
{
  let dmin = 1e9; for (let j = 1; j < 5; j++) dmin = Math.min(dmin, Math.hypot(S[j].scr[0] - S[j - 1].scr[0], S[j].scr[1] - S[j - 1].scr[1]));
  const b = page.locator('#tab-match .seg button[data-mode="r"]'); await b.scrollIntoViewIfNeeded(); await b.click(); await steps(page, 1, 0.05);
  const R = await samples(page); let dminR = 1e9; for (let j = 1; j < 5; j++) dminR = Math.min(dminR, Math.hypot(R[j].scr[0] - R[j - 1].scr[0], R[j].scr[1] - R[j - 1].scr[1]));
  ok('点“r 等距取点” → r = 0, ¼, ½, ¾, 1', (await P(page)).sampMode === 'r' && R.every((q, j) => Math.abs(q.r[0] - j / 4) < 1e-12) && (await page.locator('.pts button.tr').nth(1).locator('span').nth(1).textContent()) === '0.250', `相邻点最小屏幕间距：均匀 ${dmin.toFixed(0)} px / r 等距 ${dminR.toFixed(0)} px`);
  await page.locator('#tab-match .seg button[data-mode="even"]').click(); await steps(page, 1, 0.05);
  ok('切回“沿线均匀取点”', (await P(page)).sampMode === 'even' && await page.locator('#tab-match .seg button[data-mode="even"]').evaluate(e => e.classList.contains('on')));
  await page.locator('.leg .it[data-k="1,2"]').scrollIntoViewIfNeeded();
}
ok('默认锁定第 3 点，详情含代回验证', (await P(page)).sampSel === 2 && txt(await page.locator('.det').textContent()).includes('= 1.0000 + 0.0000i') && txt(await page.locator('.det').textContent()).includes('点 3'), txt(await page.locator('.det').textContent()));

// ---------- 4. 标记点落在选中面片上（仅显示选中后逐点拾取）
await page.locator('#btn-solo').click(); await steps(page, 10, 0.2);
ok('“仅显示选中”打开', (await P(page)).solo === true && await page.evaluate(() => CY.U.uSolo.value) > 0.99);
S = await samples(page);
{
  let hits = 0, tried = 0;
  for (const j of [0, 1, 2, 3, 4]) { tried++; const h = await pickNear(page, S[j].scr[0], S[j].scr[1]); if (h.length === 1 && h[0] === '1,2') hits++; }
  ok('5 个编号点的屏幕位置都拾取到选中面片 (1,2)', hits === tried, `${hits}/${tried}`);
  const set = new Set();
  for (let x = 60; x < 700; x += 40) for (let y = 120; y < 860; y += 40) { const h = await page.evaluate(([x, y]) => CY.pickPatch(x, y), [x, y]); if (h) set.add(h.join(',')); }
  ok('仅显示选中：全屏扫描只拾取到 (1,2)', set.size === 1 && set.has('1,2'), [...set].join(' '));
}
await page.screenshot({ path: 'shots/i4_solo.png' });

// ---------- 5. 表格行 ↔ 图上的点
const lab = j => page.locator('#marks .mk').nth(j);
ok('图上 5 个圆点，编号标签不重叠时全部显示', await page.evaluate(() => CY.dbg.markCount()) === 5 && await page.locator('#marks .mk.show').count() >= 3, 'labels ' + await page.locator('#marks .mk.show').count());
ok('锁定点的标签展开并显示数值', await lab(2).evaluate(e => e.classList.contains('on')) && txt(await lab(2).textContent()).includes('z₁ = 0.269+0.828i'), txt(await lab(2).textContent()));
await page.locator('.pts button.tr').nth(3).hover(); await steps(page, 1, 0.05);
ok('悬停表格第 4 行 → 图上第 4 点高亮', await page.evaluate(() => CY.match.hoverPt) === 3 && await lab(3).evaluate(e => e.classList.contains('on')) && !(await lab(2).evaluate(e => e.classList.contains('on'))));
ok('标记点着色器收到高亮', await page.evaluate(() => { const a = CY.dbg.markSel(); return a[3] === 1 && a[2] === 0; }));
ok('详情切到第 4 点', txt(await page.locator('.det').textContent()).includes('点 4'));
await page.locator('.pts button.tr').nth(1).click(); await page.mouse.move(300, 60); await steps(page, 1, 0.05);
ok('点表格第 2 行 → 锁定', (await P(page)).sampSel === 1 && await lab(1).evaluate(e => e.classList.contains('on')) && await page.locator('.pts button.tr').nth(1).evaluate(e => e.classList.contains('on')));
S = await samples(page);
await page.mouse.move(S[3].scr[0] + 3, S[3].scr[1] - 2); await steps(page, 1, 0.05);
ok('鼠标移到图上第 4 点 → 表格第 4 行高亮', await page.evaluate(() => CY.match.hoverPt) === 3 && await page.locator('.pts button.tr').nth(3).evaluate(e => e.classList.contains('hv')) && await page.locator('#stage').evaluate(e => e.style.cursor) === 'pointer');
await page.mouse.click(S[3].scr[0] + 3, S[3].scr[1] - 2); await steps(page, 1, 0.05);
ok('点图上第 4 点 → 表格锁定第 4 行', (await P(page)).sampSel === 3 && await page.locator('.pts button.tr').nth(3).evaluate(e => e.classList.contains('on')));
await page.mouse.move(300, 60); await steps(page, 1, 0.05);
ok('移开后保持锁定，悬停态清除', await page.evaluate(() => CY.match.hoverPt) === -1 && await lab(3).evaluate(e => e.classList.contains('on')));
await page.screenshot({ path: 'shots/i4_point.png' });

// ---------- 6. 采样滑块
for (const [k, target] of [['sampN', 0.82], ['sampY', 0.82]]) {
  const inp = page.locator(`#scroll input[data-k="${k}"]`); await inp.scrollIntoViewIfNeeded();
  const box = await inp.boundingBox(), before = (await P(page))[k], min = +(await inp.getAttribute('min')), max = +(await inp.getAttribute('max'));
  const f0 = (before - min) / (max - min), y = box.y + box.height / 2, X = f => box.x + 6 + (box.width - 12) * f;
  await page.mouse.move(X(f0), y); await page.mouse.down(); await page.mouse.move(X((f0 + target) / 2), y, { steps: 3 }); await page.mouse.move(X(target), y, { steps: 3 }); await page.mouse.up();
  await steps(page, 1, 0.05);
  const after = (await P(page))[k];
  ok('slider ' + k, Math.abs(after - (min + (max - min) * target)) < (max - min) * 0.08, `${before} → ${after}`);
}
p = await P(page); S = await samples(page);
ok('采样点数改变 → 表格与标签行数跟随', await page.locator('.pts button.tr').count() === p.sampN && await page.evaluate(() => CY.dbg.markCount()) === p.sampN && S.length === p.sampN, 'N = ' + p.sampN);
{
  let worstChk = 0, cx = false;
  for (const s of S) { const sum = [cpow(s.z1, 5)[0] + cpow(s.z2, 5)[0], cpow(s.z1, 5)[1] + cpow(s.z2, 5)[1]]; worstChk = Math.max(worstChk, Math.hypot(sum[0] - 1, sum[1])); if (Math.abs(s.r[1]) > 0.01) cx = true; }
  ok('采样线偏离中线：r 为复数，仍满足 z₁⁵ + z₂⁵ = 1', cx && worstChk < 1e-9, 'max |Σ−1| ' + worstChk.toExponential(2));
  ok('表格 r 列显示复数', /i$/.test(await page.locator('.pts button.tr').nth(Math.floor(p.sampN / 2)).locator('span').nth(1).textContent()));
}
await page.evaluate(() => { CY.set('sampN', 5); CY.set('sampY', 0); CY.set('sampSel', 2); }); await steps(page, 1, 0.05);

// ---------- 7. 与「选中 k / 双击抽出 / 仅选中」打通
await page.locator('#btn-solo').click(); await steps(page, 8, 0.2);
ok('“仅显示选中”关闭', (await P(page)).solo === false);
await page.locator('.tab', { hasText: '参数' }).click(); await steps(page, 8, 0.2);
p = await P(page);
ok('回到“参数”页 → 对照关闭、着色还原、标记隐藏', p.match === false && p.colorMode === 'phase' && !(await page.locator('#marks').isVisible()) && await page.evaluate(() => CY.U.uHiFocus.value) < 0.01);
ok('“参数”页的选中滑块显示同一选中 (1,2)', await page.locator('input[data-k="selK1"]').inputValue() === '1' && await page.locator('input[data-k="selK2"]').inputValue() === '2');
{
  const inp = page.locator('#scroll input[data-k="selK1"]'); await inp.scrollIntoViewIfNeeded();
  const box = await inp.boundingBox(), y = box.y + box.height / 2, X = f => box.x + 6 + (box.width - 12) * f;
  await page.mouse.move(X(0.25), y); await page.mouse.down(); await page.mouse.move(X(0.5), y, { steps: 3 }); await page.mouse.move(X(0.75), y, { steps: 3 }); await page.mouse.up();
  await steps(page, 1, 0.05);
}
p = await P(page);
ok('拖“选中 k₁”滑块 → 3', p.selK1 === 3 && p.sepScope === 'one');
await page.keyboard.press('m'); await steps(page, 8, 0.2);
p = await P(page);
ok('M 键 → 回到对照页，图例跟随滑块选中 (3,2)', p.match === true && await page.locator('.leg .it[data-k="3,2"]').evaluate(e => e.classList.contains('on')) && await hiOf(page, 3, 2) === 1);
ok('图例把选中行滚到可见', await page.locator('.leg .it[data-k="3,2"]').evaluate(e => { const a = e.getBoundingClientRect(), b = e.parentElement.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }));
// 单击曲面 → 选中；双击 → 抽出
await page.evaluate(() => { CY.set('sepScope', 'all'); CY.set('gap', 0); }); await steps(page, 6, 0.2);
let hit = null, pt = null;
for (const c of [[300, 430], [380, 520], [250, 560], [420, 400], [200, 420], [330, 300]]) {
  const h = await page.evaluate(([x, y]) => CY.pickPatch(x, y), c);
  if (!h || (h[0] === 3 && h[1] === 2) || !(await page.evaluate(([x, y]) => CY.match.samples.every(s => Math.hypot(s.scr[0] - x, s.scr[1] - y) > 30), c))) continue;
  await page.mouse.click(c[0], c[1]); await steps(page, 8, 0.2); await page.waitForTimeout(600);
  hit = h; pt = c;
  if (await page.evaluate(([x, y]) => CY.match.samples.every(s => Math.hypot(s.scr[0] - x, s.scr[1] - y) > 30), c)) break;
}
p = await P(page);
ok('单击曲面上的面片 → 选中它（不抽出）', !!hit && p.selK1 === hit[0] && p.selK2 === hit[1] && p.gap === 0 && await page.locator(`.leg .it[data-k="${hit}"]`).evaluate(e => e.classList.contains('on')), `(${hit})`);
const hit2 = await page.evaluate(([x, y]) => CY.pickPatch(x, y), pt);
await page.mouse.dblclick(pt[0], pt[1]); await steps(page, 10, 0.2);
p = await P(page);
ok('双击面片 → 抽出，图例 / 公式栏 / 选中滑块一致', p.selK1 === hit2[0] && p.selK2 === hit2[1] && p.sepScope === 'one' && p.gap > 0.5 && await page.locator(`.leg .it[data-k="${hit2}"]`).evaluate(e => e.classList.contains('on')) && txt(await page.locator('.fx').textContent()).includes(`k₁ = ${hit2[0]}，k₂ = ${hit2[1]}`), `(${hit2}) gap ${p.gap.toFixed(2)}`);
S = await samples(page);
{
  await page.locator('#btn-solo').click(); await steps(page, 10, 0.2);
  let hits = 0; const S2 = await samples(page);
  for (const j of [0, 1, 2, 3, 4]) { const h = await pickNear(page, S2[j].scr[0], S2[j].scr[1]); if (h.length === 1 && h[0] === hit2.join(',')) hits++; }
  ok('抽出后编号点仍贴在该面片上（位移一致）', hits === 5, hits + '/5');
  await page.locator('#btn-solo').click(); await steps(page, 6, 0.2);
}
await page.screenshot({ path: 'shots/i4_pulled.png' });
// 图例点另一行 → 被抽出的面片换成它
await page.locator('.leg .it[data-k="0,1"]').scrollIntoViewIfNeeded(); await page.locator('.leg .it[data-k="0,1"]').click(); await steps(page, 10, 0.2);
ok('抽出状态下点图例另一行 → 抽出的面片随之更换', await page.evaluate(() => CY.sepW[2 * (1 * 9 + 0)] === 1 && CY.sepW[2 * (1 * 9 + 0) + 1] === 1) && await page.evaluate(([a, b]) => CY.sepW[2 * (b * 9 + a)] === 0, hit2));
// 在编号点上双击：也算双击抽出（不会被“点编号点”吃掉）
await page.evaluate(() => { CY.set('sepScope', 'all'); CY.set('gap', 0); CY.set('sampSel', 2); }); await steps(page, 10, 0.2); await page.waitForTimeout(600);
S = await samples(page);
await page.mouse.dblclick(S[2].scr[0], S[2].scr[1]); await steps(page, 10, 0.2);
p = await P(page);
ok('在编号点上双击 → 仍然抽出该面片', p.sepScope === 'one' && p.gap > 0.5 && p.selK1 === 0 && p.selK2 === 1, `gap ${p.gap.toFixed(2)} sel (${p.selK1},${p.selK2}) sampSel ${p.sampSel}`);
await page.evaluate(() => CY.set('sampSel', 2));
await page.evaluate(() => { CY.set('sepScope', 'all'); CY.animateGap(0); }); await steps(page, 10, 0.2);

// ---------- 8. 键盘方向键
await page.locator('#stage').focus().catch(() => {});
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await steps(page, 2, 0.1);
p = await P(page);
ok('方向键换一组解', p.selK1 === 1 && p.selK2 === 2, `(${p.selK1},${p.selK2})`);
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await steps(page, 2, 0.1);
ok('方向键循环', (await P(page)).selK1 === 4);

// ---------- 9. n = 2：四组 ± 解
await page.locator('.nseg button', { hasText: 'n = 2' }).click(); await steps(page, 12, 0.2);
p = await P(page);
ok('点“n = 2” → n 平滑变到 2', Math.abs(p.n - 2) < 1e-9 && Math.abs(p.n2 - 2) < 1e-9 && await page.locator('.nseg button', { hasText: 'n = 2' }).evaluate(e => e.classList.contains('on')));
const rowsT = (await page.locator('.leg .it').allTextContents()).map(txt);
ok('n = 2 图例正好四行 ± 解', rowsT.length === 4 && rowsT[0] === 'k₁=0, k₂=0z1 = +√r z2 = +√1−r' && rowsT[1] === 'k₁=0, k₂=1z1 = +√r z2 = −√1−r' && rowsT[2] === 'k₁=1, k₂=0z1 = −√r z2 = +√1−r' && rowsT[3] === 'k₁=1, k₂=1z1 = −√r z2 = −√1−r', rowsT.join(' | '));
ok('n = 2 公式栏用 ± 形式', txt(await page.locator('.fx').textContent()).includes('z1 = ±√r') && txt(await page.locator('.fx').textContent()).includes('z2 = ±√1−r') && txt(await page.locator('.fx').textContent()).includes('2 × 2 = 4 组解'), txt(await page.locator('.fx').textContent()).slice(0, 160));
p = await P(page);
ok('选中自动收回到范围内', await page.locator('.leg .it.on').count() === 1);
await page.locator('.leg .it[data-k="1,0"]').click(); await steps(page, 8, 0.2);
S = await samples(page);
{
  let worst = 0;
  for (let j = 0; j < 5; j++) { const r = Math.max(0, S[j].r[0]); worst = Math.max(worst, Math.abs(S[j].z1[0] + Math.sqrt(r)), Math.abs(S[j].z1[1]), Math.abs(S[j].z2[0] - Math.sqrt(1 - r)), Math.abs(S[j].z2[1])); }
  ok('n = 2 分支 (−,+)：z₁ = −√r，z₂ = +√(1−r)', worst < 1e-9, 'max err ' + worst.toExponential(2));
}
await page.screenshot({ path: 'shots/i4_n2.png' });

// ---------- 10. ψ ≠ 0：数值延拓的解代回形变方程
await page.locator('.nseg button', { hasText: 'n = 5' }).click(); await steps(page, 12, 0.2);
await page.evaluate(() => { CY.set('psi', 0.5); CY.set('psiArg', 40); CY.setSel(2, 3); }); await steps(page, 6, 0.2);
S = await samples(page);
{
  const mu = await page.evaluate(() => [CY.U.uMu.value, CY.U.uPsiArg.value]);
  let worst = 0, worstShown = 0;
  for (const s of S) {
    const m = [mu[0] * Math.cos(mu[1]), mu[0] * Math.sin(mu[1])], zz = cmul(m, cmul(s.z1, s.z2));
    const sum = [cpow(s.z1, 5)[0] + cpow(s.z2, 5)[0] - zz[0], cpow(s.z1, 5)[1] + cpow(s.z2, 5)[1] - zz[1]];
    worst = Math.max(worst, Math.hypot(sum[0] - 1, sum[1])); worstShown = Math.max(worstShown, Math.hypot(s.chk[0] - 1, s.chk[1]));
  }
  ok('ψ = 0.5：z₁⁵ + z₂⁵ − μe^{iφ}z₁z₂ = 1（测试脚本用 z 独立代回）', worst < 2e-3, `max |Σ−1| ${worst.toExponential(2)}（页面自报 ${worstShown.toExponential(2)}）`);
  ok('公式栏注明 ψ ≠ 0 为数值延拓', txt(await page.locator('.fx').textContent()).includes('数值延拓') && txt(await page.locator('.fx').textContent()).includes('− 5ψ z1z2'));
  ok('详情给出形变方程的代回', txt(await page.locator('.det').textContent()).includes('− 5ψ z1z2'), txt(await page.locator('.det').textContent()));
}
await page.locator('#btn-solo').click(); await steps(page, 10, 0.2);
S = await samples(page);
{ let hits = 0; for (const j of [0, 1, 2, 3, 4]) { const h = await pickNear(page, S[j].scr[0], S[j].scr[1]); if (h.length === 1 && h[0] === '2,3') hits++; } ok('ψ ≠ 0 时编号点仍贴在面片上', hits === 5, hits + '/5'); }
await page.screenshot({ path: 'shots/i4_psi.png' });

// ---------- 11. 截面收缩 / 非对称 / 非整数 n 不报错
await page.evaluate(() => { CY.set('psi', 0); CY.set('neck', 0.6); }); await steps(page, 4, 0.2);
ok('截面收缩：公式带 s，代回用 z/s', txt(await page.locator('.fx').textContent()).includes('z1 = s·') && txt(await page.locator('.det').textContent()).includes('(z1/s)5 + (z2/s)5= 1.0000 + 0.0000i'), txt(await page.locator('.det').textContent()));
await page.evaluate(() => { CY.set('neck', 1); CY.set('link', false); CY.set('n', 3); CY.set('n2', 7); CY.setSel(2, 6); }); await steps(page, 6, 0.2);
ok('非对称 3 × 7：21 行，ω₁ / ω₂ 分开', await page.locator('.leg .it').count() === 21 && txt(await page.locator('.leg .it[data-k="2,6"]').textContent()).includes('ω12·r1/3') && txt(await page.locator('.leg .it[data-k="2,6"]').textContent()).includes('ω26·(1−r)1/7'), txt(await page.locator('.leg .it[data-k="2,6"]').textContent()));
await page.evaluate(() => { CY.set('link', true); CY.set('n', 3.5); CY.set('n2', 3.5); }); await steps(page, 6, 0.2);
ok('非整数 n = 3.5：16 行并注明未闭合', await page.locator('.leg .it').count() === 16 && txt(await page.locator('.fx').textContent()).includes('尚未闭合'));
await page.evaluate(() => { CY.set('n', 9); CY.set('n2', 9); }); await steps(page, 6, 0.2);
ok('n = 9：81 行', await page.locator('.leg .it').count() === 81);

// ---------- 12. 按面片着色开关、分区折叠、重置
await page.locator('#btn-bypatch').scrollIntoViewIfNeeded(); await page.locator('#btn-bypatch').click(); await steps(page, 2, 0.1);
ok('关掉“按面片着色” → 回到相位着色', (await P(page)).colorMode === 'phase');
await page.locator('#btn-bypatch').click(); await steps(page, 2, 0.1);
ok('再点 → 按面片着色', (await P(page)).colorMode === 'patch');
for (const t of ['公式', '面片 ↔ 解', '采样点 ↔ 数值']) {
  const h2 = page.locator('#tab-match section h2', { hasText: t }); await h2.scrollIntoViewIfNeeded(); await h2.click();
  const closed = await h2.evaluate(e => e.parentElement.classList.contains('closed')); await h2.click();
  ok(`分区“${t}”可折叠 / 展开`, closed && await h2.evaluate(e => !e.parentElement.classList.contains('closed')));
}
await page.locator('#btn-reset').click(); await steps(page, 14, 0.2);
p = await P(page);
ok('重置：参数复位、仍在对照页', Math.abs(p.n - 5) < 1e-9 && p.selK1 === 0 && p.selK2 === 0 && p.solo === false && p.sampN === 5 && p.match === true);
// 截图按钮在对照模式下
const dl = page.waitForEvent('download', { timeout: 60000 });
await page.locator('#btn-shot').click(); const d = await dl; await d.saveAs('shots/i4_download.png');
ok('对照模式下截图下载', true, d.suggestedFilename());
await page.context().close();

// ---------- 13. URL 参数
const page2 = await open('?manual&match=1,2&solo');
await steps(page2, 4, 0.2);
p = await P(page2);
ok('URL ?match=1,2&solo', p.match && p.solo && p.selK1 === 1 && p.selK2 === 2 && await page2.locator('#tab-match').isVisible() && await page2.locator('.leg .it[data-k="1,2"]').evaluate(e => e.classList.contains('on')));
await page2.context().close();

// ---------- 14. 触屏 / 手机布局
const page3 = await open('?manual', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page3.evaluate(() => CY.set('auto', false)); await steps(page3, 2, 0.1);
await page3.locator('.tab', { hasText: '解 ↔ 线' }).tap(); await steps(page3, 8, 0.2);
ok('手机：点页签 → 抽屉展开并进入对照', (await P(page3)).match === true && await page3.evaluate(() => !document.body.classList.contains('sheet-peek')) && await page3.locator('.fx').isVisible());
await page3.locator('.leg .it[data-k="1,1"]').scrollIntoViewIfNeeded(); await page3.locator('.leg .it[data-k="1,1"]').tap(); await steps(page3, 8, 0.2);
ok('手机：点图例行', (await P(page3)).selK1 === 1 && (await P(page3)).selK2 === 1);
S = await samples(page3);
const vis = S.findIndex((s, j) => j !== 2 && s.scr[1] > 150 && s.scr[1] < 330 && s.scr[0] > 20 && s.scr[0] < 370);
await page3.touchscreen.tap(S[vis].scr[0], S[vis].scr[1]); await steps(page3, 2, 0.1);
ok('手机：点图上的编号点 → 锁定该行并滚到可见', (await P(page3)).sampSel === vis && await page3.locator('.pts button.tr').nth(vis).evaluate(e => { const a = e.getBoundingClientRect(), b = document.querySelector('#scroll').getBoundingClientRect(); return e.classList.contains('on') && a.top >= b.top && a.bottom <= b.bottom; }), 'pt ' + (vis + 1));
await page3.screenshot({ path: 'shots/i4_mobile.png' });
await page3.locator('.pts button.tr').nth(3).tap(); await steps(page3, 2, 0.1);
ok('手机：点表格行', (await P(page3)).sampSel === 3);
await page3.locator('#grab').tap(); await steps(page3, 6, 0.2);
ok('手机：抽屉可收起，HUD 保留当前分支', await page3.evaluate(() => document.body.classList.contains('sheet-peek')) && await page3.locator('#branch').isVisible());
await page3.waitForTimeout(900); await steps(page3, 2, 0.1);
await page3.screenshot({ path: 'shots/i4_mobile_peek.png' });
await page3.context().close();

// ---------- 15. 实时模式冒烟
const page4 = await open('', { viewport: { width: 760, height: 520 } });
await page4.waitForTimeout(2000);
await page4.keyboard.press('m'); await page4.waitForTimeout(4000);
await page4.locator('.leg .it[data-k="2,2"]').click(); await page4.waitForTimeout(3000);
await page4.locator('.nseg button', { hasText: 'n = 2' }).click(); await page4.waitForFunction(() => Math.abs(CY.P.n - 2) < 1e-6 && document.querySelectorAll('.leg .it').length === 4, null, { timeout: 60000 }).catch(() => {});
ok('实时模式：M → 点图例 → n = 2', (await P(page4)).match === true && Math.abs((await P(page4)).n - 2) < 1e-6 && await page4.locator('.leg .it').count() === 4);
await page4.screenshot({ path: 'shots/i4_realtime.png' });
await page4.context().close();

console.log(results.join('\n'));
console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'no console errors/warnings');
console.log(results.filter(r => r.startsWith('FAIL')).length + ' failed / ' + results.length);
await browser.close();
