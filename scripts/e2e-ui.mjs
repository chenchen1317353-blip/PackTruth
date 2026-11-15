import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 端到端界面验收：用真实浏览器点按钮，确认「前端 → 本地中转 → 上游 → 渲染」整条链路。
 * 会触发 3 次付费调用（MiMo 1 次、Search 1 次、Fetch 1 次），每个步骤只跑一次，不重试。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// 第二阶段起，测试台从「页面根」挪到了 #/lab，正式产品占用根路径
const BASE = process.env.BASE || 'http://localhost:5173/#/lab';
const OUT = join(process.cwd(), 'runtime-output', 'shots');
/** SKIP_PAID=1 时只跑零成本的本地模拟用例，避免重复消耗额度 */
/** SKIP_PAID=1 或 --free 时只跑零成本的本地模拟用例，避免重复消耗额度 */
const SKIP_PAID = process.env.SKIP_PAID === '1' || process.argv.includes('--free');
const SKIP_A = process.env.SKIP_A === '1' || process.argv.includes('--skip-a');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

const results = [];
const shot = async (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

async function step(name, fn) {
  process.stdout.write(`\n── ${name}\n`);
  try {
    await fn();
    console.log('   ✓ 通过');
    results.push({ name, ok: true });
  } catch (e) {
    console.log(`   ✗ 失败: ${String(e.message).split('\n')[0]}`);
    results.push({ name, ok: false, error: String(e.message).split('\n')[0] });
    await shot(`FAIL-${name.replace(/[^\w一-龥]/g, '_')}`).catch(() => {});
  }
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

await step('首屏加载与健康检查', async () => {
  const txt = await page.locator('body').innerText();
  if (!txt.includes('API 测试台')) throw new Error('标题未渲染');
  if (!txt.includes('已配置')) throw new Error('密钥状态未显示为已配置');
  if (txt.includes('无法连接本地中转服务')) throw new Error('中转服务不可达');
  await shot('01-home');
});

await step('CORS 预检探测', async () => {
  await page.getByRole('button', { name: /服务端预检探测/ }).click();
  // BYOK 加固后 /api/probe/* 只对带 Key 的正式入口开放；实验室里允许出现「已禁用」
  await page.waitForFunction(
    () => document.body.innerText.includes('Allow-Origin') || document.body.innerText.includes('调试接口已禁用'),
    { timeout: 40000 },
  );
  const txt = await page.locator('body').innerText();
  if (txt.includes('调试接口已禁用')) {
    console.log('      调试接口已按 BYOK 策略禁用（预期行为）');
  } else if (!txt.includes('OPTIONS 状态')) {
    throw new Error('预检结果未渲染');
  }
  await shot('02-cors');
});

await step('浏览器直连探测（零成本，不带密钥）', async () => {
  await page.getByRole('button', { name: /浏览器直连探测/ }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('跨域可达') ||
      document.body.innerText.includes('被拦截 / 不可达'),
    { timeout: 60000 },
  );
  const txt = await page.locator('body').innerText();
  console.log(`      浏览器判定：${txt.includes('跨域可达') ? '上游放行（拿到 HTTP 响应）' : '被拦截'}`);
  await shot('02b-cors-browser');
});

if (!SKIP_PAID && !SKIP_A)
  await step('测试 A · MiMo 图片识别（真实调用）', async () => {
  await page.getByRole('button', { name: '使用内置虚构标签图' }).click();
  await page.waitForTimeout(600);
  const label = page.locator('section.card', { hasText: '小米 MiMo 图片理解' });
  await label.getByRole('button', { name: '开始识别' }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('结构化提取结果'),
    { timeout: 180000 },
  );
  const txt = await page.locator('body').innerText();
  if (!txt.includes('阳光谷物脆')) throw new Error('未提取到产品名');
  if (!txt.includes('2010')) throw new Error('未提取到营养数值');
  await shot('03-mimo');
});

await step('测试 B · 模拟字段缺失（零成本）', async () => {
  const card = page.locator('section.card', { hasText: 'DeepSeek JSON 结构化输出' });
  await card.getByRole('button', { name: /模拟字段缺失/ }).click();
  await card.getByRole('button', { name: '调用 DeepSeek JSON' }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('应被字段校验拦截') ||
      document.body.innerText.includes('调试接口已禁用'),
    { timeout: 30000 },
  );
  await shot('04-json-validator');
});

await step('测试 B · 模拟空 content（零成本）', async () => {
  const card = page.locator('section.card', { hasText: 'DeepSeek JSON 结构化输出' });
  await card.getByRole('button', { name: /模拟空 content/ }).click();
  await card.getByRole('button', { name: '调用 DeepSeek JSON' }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('应被识别为空内容') ||
      document.body.innerText.includes('调试接口已禁用'),
    { timeout: 30000 },
  );
  await shot('05-json-empty');
});

if (!SKIP_PAID)
  await step('测试 C · DeepSeek Search（真实调用）', async () => {
    const card = page.locator('section.card', { hasText: 'DeepSeek Search 网页搜索' });
    await card.getByRole('button', { name: '执行搜索' }).click();
    // 注意：不能等 "搜索结果" —— D 卡片里有 "还没有搜索结果" 会提前命中
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('条真实结果') ||
        document.body.innerText.includes('搜索成功但结果为空'),
      { timeout: 90000 },
    );
    const txt = await card.innerText();
    if (!txt.includes('who.int') && !txt.includes('WHO')) throw new Error('未返回 WHO 结果');
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('06-search');
  });

if (!SKIP_PAID)
  await step('测试 D · DeepSeek Fetch（真实调用）', async () => {
  const card = page.locator('section.card', { hasText: 'DeepSeek Fetch 网页正文提取' });
  await card.getByRole('button', { name: '抓取正文' }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('正文抓取成功') || document.body.innerText.includes('网站侧限制'),
    { timeout: 90000 },
  );
    const txt = await card.innerText();
    if (txt.includes('正文抓取成功')) {
      if (!txt.includes('正文字符数')) throw new Error('未显示正文长度');
    }
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('07-fetch');
  });

console.log('\n控制台报错：', consoleErrors.length ? consoleErrors.slice(0, 5) : '无');

const passed = results.filter((r) => r.ok).length;
console.log(`\n界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
