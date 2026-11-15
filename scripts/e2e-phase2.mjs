import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 历史阶段回归（零成本）。
 *
 * 第三阶段把「进入演示模式」拆成了三个演示样品，三页流程的完整验证
 * 已由 e2e-phase3.mjs 接管。这里只保留跨阶段必须持续成立的回归项：
 * 上传页能打开、能选图、两个测试入口还能进。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase3');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

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
  }
}

const noHScroll = async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error(`横向溢出 ${over}px`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

await step('第一阶段入口 #/lab 仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('API 测试台')) throw new Error('测试台标题缺失');
  for (const block of ['小米 MiMo 图片理解', 'DeepSeek JSON 结构化输出', 'DeepSeek Search', 'DeepSeek Fetch']) {
    if (!txt.includes(block)) throw new Error(`缺少区块：${block}`);
  }
  await noHScroll();
  await page.screenshot({ path: join(OUT, 'p3-15-lab.png') });
});

await step('第二阶段对比工具与 5 张真实照片仍在', async () => {
  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('真实包装 · 双模型识别对比')) throw new Error('对比工具标题缺失');
  const thumbs = await page.locator('.thumb').count();
  if (thumbs !== 5) throw new Error(`照片数量应为 5，实际 ${thumbs}`);
  await noHScroll();
  await page.screenshot({ path: join(OUT, 'p3-16-vision.png') });
});

await step('正式产品首页可打开且能选图', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('拍下包装背面')) throw new Error('上传页异常');

  await page.setInputFiles('input[type=file]', join(process.cwd(), 'public', 'test-images', 'real', '01-bamboo-shoot-shanjiao.jpg'));
  await page.waitForTimeout(600);
  const preview = await page.locator('.drop-preview').count();
  if (!preview) throw new Error('选图后没有预览');
  await noHScroll();
});

await step('桌面宽度回归', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('拍下包装背面')) throw new Error('桌面宽度下异常');
});

console.log('\n页面报错：', errors.length ? errors.slice(0, 3) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\n回归验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
