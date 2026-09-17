/* RWH 精读页通用质检：控制台零报错 + 交互可用 + 移动端无横向溢出
 * 用法：node _qc.js <index.html 绝对路径>
 */
const { chromium } = require('playwright');
const path = process.argv[2];
if (!path) { console.error('用法: node _qc.js <页面绝对路径>'); process.exit(2); }

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path);
  await page.waitForTimeout(700);

  const url = 'file://' + path;
  const R = [];
  const ok = (k, v, extra) => R.push([k, v, extra === undefined ? '' : extra]);

  // 结构
  const n = async sel => page.locator(sel).count();
  ok('节数 section', await n('section') > 0, await n('section'));
  ok('目录项', await n('aside a') > 0, await n('aside a'));
  ok('金句条 .aband', await n('.aband'));
  ok('卡片 .card', await n('.card'));
  ok('案例卡 .case', await n('.case'));
  ok('表格 table', await n('table'));
  ok('自测清单 .check', await n('.check'));
  ok('校勘条 .note', await n('.note'));
  ok('篇间导航 .bknav', await n('.bknav') === 2, await n('.bknav'));

  // 正文限长
  const over = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('p.prose')];
    return ps.map(p => p.innerText.replace(/\s/g, '').length).filter(x => x > 165).length;
  });
  ok('正文段 >165 字', over === 0, over);

  // 转义残留（未渲染的裸标签）
  const leak = await page.evaluate(() => {
    const t = document.querySelector('main').innerText;
    return /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(t);
  });
  ok('裸露标签残留', leak === false);

  // 交互：案例卡展开 + 互斥
  if (await n('.case') >= 2) {
    await page.locator('.case .ch').nth(0).click();
    await page.waitForTimeout(420);
    const h1 = await page.locator('.case').nth(0).evaluate(e => e.querySelector('.cb').getBoundingClientRect().height);
    await page.locator('.case .ch').nth(1).click();
    await page.waitForTimeout(420);
    const open1 = await page.locator('.case').nth(0).evaluate(e => e.classList.contains('on'));
    const h2 = await page.locator('.case').nth(1).evaluate(e => e.querySelector('.cb').getBoundingClientRect().height);
    ok('案例卡展开', h1 > 20, Math.round(h1));
    ok('案例卡互斥', open1 === false && h2 > 20);
  }

  // 交互：自测清单 + localStorage
  if (await n('.check') > 0) {
    const c = page.locator('.check').nth(0);
    await c.locator('input').nth(0).check();
    await c.locator('input').nth(2).check();
    await page.waitForTimeout(150);
    const txt = await c.locator('.cf b').innerText();
    const done = await c.locator('label.done').count();
    ok('自测计数', txt === '2', txt);
    ok('自测划线', done === 2, done);
    await page.reload(); await page.waitForTimeout(600);
    ok('自测存续', (await page.locator('.check').nth(0).locator('label.done').count()) === 2);
  }

  // 交互：校勘跳转
  if (await n('.note') > 0) {
    await page.locator('[data-n]').first().click();
    await page.waitForTimeout(350);
    ok('校勘跳转闪烁', await page.locator('.note.flash').count() > 0);
  }

  // 交互：目录滚动高亮 + 进度条
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.waitForTimeout(300);
  ok('目录高亮', await page.locator('aside a.on').count() > 0);
  const w = await page.evaluate(() => document.getElementById('pbar').style.width);
  ok('进度条', parseFloat(w) > 0, w);

  // 移动端
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(320);
  const of = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('移动端横向溢出', of <= 1, of + 'px');

  ok('JS 报错', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  let bad = 0;
  for (const [k, v, e] of R) {
    if (!v) bad++;
    console.log(`${v ? '✅' : '❌'} ${k}${e !== '' ? '  → ' + e : ''}`);
  }
  console.log(`\n${path.split('/').slice(-2)[0]}：${R.length - bad}/${R.length} 通过`);
  process.exit(bad ? 1 : 0);
})();
