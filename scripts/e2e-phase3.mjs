import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 第三阶段界面验收（零成本）。
 * 真实识别链路用 network route 拦截模拟，不消耗任何额度；
 * 演示样品走完整流程，验证规则引擎在真实 DOM 里的表现。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase3');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const results = [];
const shot = async (name) => {
  await page.waitForTimeout(320);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};

async function step(name, fn) {
  process.stdout.write(`\n── ${name}\n`);
  try {
    await fn();
    console.log('   ✓ 通过');
    results.push({ name, ok: true });
  } catch (e) {
    console.log(`   ✗ 失败: ${String(e.message).split('\n')[0]}`);
    results.push({ name, ok: false, error: String(e.message).split('\n')[0] });
    await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`) }).catch(() => {});
  }
}

const noHScroll = async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error(`横向溢出 ${over}px`);
};

const bodyText = () => page.locator('body').innerText();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

await step('页面 1 · 上传页显示识别引擎与三个演示样品', async () => {
  const txt = await bodyText();
  if (!txt.includes('拍下包装背面')) throw new Error('上传页标题缺失');
  // 前端美化后首屏不再写具体模型名，改为「AI 标签识别」
  if (!txt.includes('AI 标签识别')) throw new Error('没有显示识别引擎');
  for (const name of ['清柠气泡水', '燕麦纤维饼干', '原味发酵乳']) {
    if (!txt.includes(name)) throw new Error(`演示样品「${name}」缺失`);
  }
  await noHScroll();
  await shot('p3-01-upload');
});

await step('API 失败时显示错误 + 重试 + 手动填写入口', async () => {
  // BYOK 之后，真实识别需要先有 Key；否则请求根本不会发出，
  // 测不到「上游失败」这条链路。这里填一个假 Key，请求仍被下面的 route 拦截。
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.waitForTimeout(200);

  let interceptions = 0;
  await page.route('**/api/vision/extract', async (route) => {
    interceptions += 1;
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_TIMEOUT', message: 'DeepSeek Vision：请求超时（120000 ms 内未返回）' } }),
    });
  });

  await page.setInputFiles('input[type=file]', join(process.cwd(), 'public', 'test-images', 'real', '03-wuqiong-egg.jpg'));
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '开始识别' }).click();

  // 加载态出现，且按钮消失（防重复点击）
  await page.waitForSelector('.loading-block', { timeout: 5000 });
  const loadingTxt = await bodyText();
  if (!/正在读取包装上的文字|正在识别配料表/.test(loadingTxt)) throw new Error('没有分阶段加载提示');
  const btnCount = await page.getByRole('button', { name: '开始识别' }).count();
  if (btnCount > 0) throw new Error('识别中「开始识别」按钮仍然存在，可能重复点击');
  await shot('p3-02-loading');

  await page.waitForSelector('.alert.error', { timeout: 15000 });
  const errTxt = await bodyText();
  if (!errTxt.includes('识别失败')) throw new Error('错误标题缺失');
  if (!errTxt.includes('重试一次')) throw new Error('缺少重试按钮');
  if (!errTxt.includes('手动填写')) throw new Error('缺少手动填写入口');
  if (interceptions !== 1) throw new Error(`请求被发送了 ${interceptions} 次，疑似重复调用`);
  await shot('p3-03-error');

  await page.unroute('**/api/vision/extract');
});

await step('手动填写入口可以进入确认页', async () => {
  await page.getByRole('button', { name: /跳过识别，直接手动填写/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  const txt = await bodyText();
  if (!txt.includes('营养标示基准')) throw new Error('确认页未渲染');
});

await step('演示一 · 气泡水进入确认页，未标示状态可见', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /清柠气泡水/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  const txt = await bodyText();
  if (!txt.includes('包装未标示')) throw new Error('没有显示「包装未标示」状态');
  await noHScroll();
  await shot('p3-04-confirm-demo1');
});

await step('演示一 · 确认后进入结果页', async () => {
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 10000 });
  await noHScroll();
  await shot('p3-05-result-demo1');
});

await step('结果页 · 0 脂肪卡片显示 2.5 g 理论上限', async () => {
  const txt = await bodyText();
  if (!txt.includes('容易被扩大理解')) throw new Error('缺少「容易被扩大理解」状态');
  if (!txt.includes('500 ÷ 100 × 0.5')) throw new Error('缺少计算式');
  if (!txt.includes('2.5')) throw new Error('缺少 2.5 g 结果');
  if (!txt.includes('理论上限')) throw new Error('没有标注「理论上限」');
  if (!txt.includes('不是实测值')) throw new Error('没有声明不是实测值');
});

await step('结果页 · 0 蔗糖卡片判定为信息不足', async () => {
  const txt = await bodyText();
  if (!txt.includes('信息不足，无法确认')) throw new Error('缺少「信息不足」状态');
  if (!txt.includes('不等于')) throw new Error('缺少「0 蔗糖 ≠ 0 糖」的说明');
  if (!txt.includes('甜味剂')) throw new Error('缺少甜味剂说明');
});

await step('结果页 · 拖动食用量后上限同步变化', async () => {
  const before = await page.locator('.claim-card', { hasText: '0 脂肪' }).innerText();
  if (!before.includes('2.5')) throw new Error('初始值不是 2.5');

  await page.locator('.slider-row input[type=range]').fill('1000');
  await page.waitForTimeout(500);

  const after = await page.locator('.claim-card', { hasText: '0 脂肪' }).innerText();
  if (!after.includes('5')) throw new Error(`滑块改到 1000 后应是 5 g，实际：${after.slice(0, 200)}`);
  if (after.includes('2.5')) throw new Error('仍显示旧的 2.5，没有实时同步');
  await shot('p3-06-slider-1000');
});

await step('结果页 · 来源卡可展开且标注原文/摘要类型', async () => {
  await page.locator('.evidence-block summary').first().click();
  await page.waitForTimeout(400);
  const txt = await bodyText();
  if (!txt.includes('原文摘录')) throw new Error('缺少原文摘录标记');
  if (!txt.includes('GB 28050')) throw new Error('缺少标准编号');
  if (!txt.includes('表 1')) throw new Error('缺少条款编号');
  if (!txt.includes('官方原文')) throw new Error('缺少官方链接');
  await shot('p3-07-evidence');
});

await step('演示三 · 酸奶展示「未标示」与「有值」的区别', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /原味发酵乳/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  const txt = await bodyText();
  if (!txt.includes('包装未标示')) throw new Error('缺少未标示状态');
  await shot('p3-08-confirm-demo3');
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 10000 });
  const rt = await bodyText();
  if (!rt.includes('信息不足，无法确认')) throw new Error('酸奶的 0 蔗糖应判定信息不足');
  await shot('p3-09-result-demo3');
});

await step('演示二 · 含膳食纤维走数值判定，非油炸只解释工艺', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /燕麦纤维饼干/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 10000 });
  const txt = await bodyText();
  // V2：两条宣传语都已有规则，不再显示「规则尚未支持」
  if (txt.includes('规则尚未支持')) throw new Error('演示二的宣传语已收录，不应再显示「规则尚未支持」');
  if (!txt.includes('有直接标签依据')) throw new Error('含膳食纤维（6 g/100 g）应有标签依据');
  if (!txt.includes('加工方式')) throw new Error('非油炸应说明这是加工方式描述');
  if (!txt.includes('非油炸不等于低脂')) throw new Error('非油炸缺少「不能推出低脂」的说明');
  await noHScroll();
  await shot('p3-10-result-demo2');
});

await step('项目回归 · #/lab 与 #/lab/vision 仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  let txt = await bodyText();
  if (!txt.includes('API 测试台')) throw new Error('第一阶段测试台打不开');
  if (!txt.includes('小米 MiMo 图片理解')) throw new Error('测试 A 缺失');

  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  txt = await bodyText();
  if (!txt.includes('真实包装 · 双模型识别对比')) throw new Error('对比工具打不开');
  const thumbs = await page.locator('.thumb').count();
  if (thumbs !== 5) throw new Error(`对比工具应有 5 张照片，实际 ${thumbs}`);
  await shot('p3-11-lab-regression');
});

await step('桌面宽度回归', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const txt = await bodyText();
  if (!txt.includes('拍下包装背面')) throw new Error('桌面宽度下上传页异常');
  await shot('p3-12-desktop');
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\n第三阶段界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
