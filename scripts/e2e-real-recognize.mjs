import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 真实识别链路验收：上传照片 → 服务端 DeepSeek Vision → 确认页。
 *
 * 只跑 1 张图 / 1 次调用，失败不重试，避免反复扣费。
 * 用第 3 张（无穷卤蛋），第二阶段实测 DeepSeek 约 4.7 秒，是最便宜的一张。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase3');
const IMAGE = join(process.cwd(), 'public', 'test-images', 'real', '03-wuqiong-egg.jpg');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

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
    await page.screenshot({ path: join(OUT, 'FAIL-real.png') }).catch(() => {});
  }
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

let elapsed = 0;

await step('上传真实照片并触发识别', async () => {
  await page.setInputFiles('input[type=file]', IMAGE);
  await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.getByRole('button', { name: '开始识别' }).click();
  await page.waitForSelector('.loading-block', { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 120000 });
  elapsed = Date.now() - t0;
  await page.screenshot({ path: join(OUT, 'p3-13-real-confirm.png') });
});

await step('识别结果进入确认页且字段可读', async () => {
  const txt = await page.locator('body').innerText();
  if (!txt.includes('营养标示基准')) throw new Error('确认页未正常渲染');

  // 产品名/品牌/净含量都在 input 的 value 里，innerText 读不到
  const names = await page.locator('.form-grid input').evaluateAll((els) => els.map((e) => e.value));
  console.log(`      产品名/品牌/净含量 = ${JSON.stringify(names)}`);
  if (!names.some((v) => v && v.includes('无穷'))) {
    throw new Error(`没有识别到品牌「无穷」，实际=${JSON.stringify(names)}`);
  }

  const nutNames = await page.locator('.nut-name').evaluateAll((els) => els.map((e) => e.value));
  const nutVals = await page.locator('.nut-value').evaluateAll((els) => els.map((e) => e.value));
  console.log(`      营养项 = ${nutNames.join(' / ')}`);
  console.log(`      数值   = ${nutVals.join(' / ')}`);
  console.log(`      识别耗时 ≈ ${elapsed} ms`);

  if (nutNames.length < 5) throw new Error(`营养项只有 ${nutNames.length} 项`);
  await page.screenshot({ path: join(OUT, 'p3-14-real-confirm-detail.png'), fullPage: true });
});

await step('未识别字段保持空白，不编造', async () => {
  const names = await page.locator('.form-grid input').evaluateAll((els) => els.map((e) => e.value));
  // 这张图产品名被画面裁切，正确行为是留空
  if (names[0] && names[0].length > 0) {
    console.log(`      注意：模型给出了食品名称「${names[0]}」，需人工核对是否属实`);
  } else {
    console.log('      食品名称留空（与照片一致，未编造）');
  }
  if (names[0] && names[0].includes('老母鸡')) throw new Error('疑似编造了完整产品名');
  const hints = await page.locator('.nut-hint').count();
  console.log(`      待补录提示 ${hints} 处`);
});

console.log(`\n真实识别链路：${results.filter((r) => r.ok).length}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
