import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 对比工具的界面验收：真实点击一次「用两个模型识别」，确认
 * 页面 → /api/vision/compare → 两个模型 → 并排渲染 → 人工标记 整条链路可用。
 *
 * 注意：会消耗 2 次付费调用，只选一张图跑一次，不重试。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase2');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const results = [];
async function step(name, fn) {
  process.stdout.write(`\n── ${name}\n`);
  try {
    await fn();
    console.log('   ✓ 通过');
    results.push({ name, ok: true });
  } catch (e) {
    console.log(`   ✗ 失败: ${String(e.message).split('\n')[0]}`);
    results.push({ name, ok: false, error: String(e.message).split('\n')[0] });
    await page.screenshot({ path: join(OUT, 'FAIL-vision.png') }).catch(() => {});
  }
}

await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await step('对比工具初始状态', async () => {
  const txt = await page.locator('body').innerText();
  if (!txt.includes('真实包装 · 双模型识别对比')) throw new Error('标题缺失');
  const thumbs = await page.locator('.thumb').count();
  if (thumbs !== 5) throw new Error(`缩略图 ${thumbs} 张`);
  await page.screenshot({ path: join(OUT, 'p2-08-vision-compare.png') });
});

await step('选择第 3 张图（无穷卤蛋，最小最快）', async () => {
  await page.locator('.thumb').nth(2).click();
  await page.waitForTimeout(400);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('无穷')) throw new Error('没有切换到卤蛋那张图');
});

await step('真实调用两个模型（各 1 次）', async () => {
  await page.getByRole('button', { name: '用两个模型识别' }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('人工标记统计'),
    { timeout: 180000 },
  );
  const txt = await page.locator('body').innerText();
  if (!txt.includes('小米 MiMo') || !txt.includes('DeepSeek Vision')) throw new Error('两个模型的结果卡缺失');
  if (!txt.includes('耗时')) throw new Error('耗时信息缺失');
  await page.screenshot({ path: join(OUT, 'p2-10-vision-result.png') });
});

await step('并排表格里两个模型都有内容', async () => {
  const tables = await page.locator('.cmp-table').count();
  if (tables < 2) throw new Error(`应有字段表和营养表两张，实际 ${tables}`);
  const rows = await page.locator('.cmp-table').first().locator('tbody tr').count();
  if (rows < 6) throw new Error(`字段对比表只有 ${rows} 行`);
  // 营养值在第二张表里，用整页文本检查更稳
  const bodyTxt = await page.locator('body').innerText();
  if (!bodyTxt.includes('912')) throw new Error('没有看到能量 912 的识别结果');
  if (!bodyTxt.includes('922')) throw new Error('没有看到钠 922 的识别结果');
});

await step('人工标记可以改并且统计会更新', async () => {
  const sel = page.locator('.mark-select').first();
  await sel.selectOption('number');
  await page.waitForTimeout(400);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('有问题 1')) throw new Error(`统计没有更新为「有问题 1」\n${txt.slice(-400)}`);
  await page.screenshot({ path: join(OUT, 'p2-11-vision-marked.png') });
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 4) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\n对比工具验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
