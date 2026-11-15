import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * V5.2 真实浏览器验证（会花钱，约 0.003 元）。
 *
 * 只拦截识图（避免额外的 Vision 费用），**不拦截成分分析** ——
 * 走的是真实的 Search + Chat 链路，用来证明「本地未收录的成分
 * 在浏览器里点一次就能拿到解释」这件事真的成立。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase5-v52');
const INGREDIENT = process.argv[2] || '碳酸氢钠';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const researchCalls = [];
page.on('request', (r) => {
  if (r.url().includes('/api/ingredient/research')) researchCalls.push(r.url());
});

// 只拦识图，省下 Vision 的钱；成分分析走真实链路
await page.route('**/api/vision/extract', (route) =>
  route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_ERROR', message: '跳过识图以节省费用' } }),
  }),
);

console.log(`真实浏览器验证：${INGREDIENT}`);
console.log('（识图已拦截，成分分析走真实 Search + Chat）\n');

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await page.locator('input[type=file]').setInputFiles('public/test-label.png');
await page.waitForTimeout(700);
await page.getByRole('button', { name: /开始识别/ }).click();
await page.waitForFunction(() => document.body.innerText.includes('识别失败'), { timeout: 20000 });
await page.getByRole('button', { name: /跳过识别/ }).click();
await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });

await page.locator('.form-grid input').first().fill('真实测试用饼干');
await page.locator('.basis-btn').first().click();
await page.getByRole('button', { name: /添加配料/ }).click();
await page.waitForTimeout(250);
await page.locator('.ing-item input').first().fill(INGREDIENT);
await page.getByRole('button', { name: /确认无误/ }).click();
await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
await page.waitForTimeout(300);

console.log('进入结果页，点击成分（只点这一下）…');
const t0 = Date.now();

await page.locator('.ing-card-btn', { hasText: INGREDIENT }).first().click();
await page.waitForSelector('.sheet', { timeout: 5000 });

// 自动分析是否真的启动了
const started = await page
  .waitForSelector('.analyzing-bar', { timeout: 4000 })
  .then(() => true)
  .catch(() => false);
console.log('  自动开始分析:', started ? '是' : '否（异常）');

// 等真实结果
await page.waitForSelector('.composition-bar', { timeout: 60000 });
const elapsed = Date.now() - t0;
await page.waitForTimeout(500);

const txt = await page.locator('.sheet').innerText();
console.log(`  耗时: ${(elapsed / 1000).toFixed(1)} 秒`);
console.log('  真实请求次数:', researchCalls.length);

await page.screenshot({ path: join(OUT, 'v52-06-real-new-ingredient-brief.png') });

// 展开深入版再截一张
await page.getByRole('button', { name: /深入了解这个成分/ }).click();
await page.waitForSelector('.deep-view', { timeout: 5000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'v52-07-real-new-ingredient-deep.png') });

console.log('\n===== 简明版实际输出 =====');
const blocks = await page.locator('.brief-block').allInnerTexts();
for (const b of blocks) console.log(b.replace(/\n/g, ' '));

const chips = await page.locator('.brief-view .ref-chip').allInnerTexts();
console.log('\n来源芯片:', chips.join(' '));

console.log('\n===== 深入版区块 =====');
const sections = await page.locator('.deep-view .sheet-section h3').allInnerTexts();
for (const s of sections) console.log('  -', s.replace(/\n/g, ' '));

const hasUnknown = txt.includes('暂时不能可靠解读');
console.log('\n是否仍停留在未知状态:', hasUnknown ? '是（失败）' : '否');
console.log('截图: v52-06-real-new-ingredient-brief.png / v52-07-real-new-ingredient-deep.png');

await browser.close();

if (hasUnknown || !started) process.exit(1);
