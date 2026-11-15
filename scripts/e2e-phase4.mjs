import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 第四阶段界面验收（零成本）。
 * 全程使用演示样品，并监听网络请求确认没有触发任何付费 API。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase4');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const paidCalls = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('/api/vision/extract') || u.includes('/api/vision/compare') || u.includes('/api/deepseek')) {
    paidCalls.push(u);
  }
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

async function openDemo(id) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp(id) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function clickIngredient(name) {
  await page.locator('.ing-card-btn', { hasText: name }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForTimeout(350);
}

async function closeSheet() {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

await step('演示一 · 配料列表显示分类标签', async () => {
  await openDemo('清柠气泡水');
  const tags = await page.locator('.ing-tag').allInnerTexts();
  console.log(`      标签：${tags.join(' / ')}`);
  if (!tags.includes('甜味剂')) throw new Error('没有识别出甜味剂标签');
  // V5.2 起演示配料全部收录，不应再出现「未收录」
  if (tags.includes('未收录')) throw new Error('演示配料仍有未收录项，V5.2 应已全覆盖');
  await noHScroll();
  await shot('p4-01-ingredients');
});

await step('演示一 · 点三氯蔗糖：简明版三段 + 展开后六段', async () => {
  await clickIngredient('三氯蔗糖');
  let txt = await page.locator('.sheet').innerText();

  // V5.2 默认只显示简明三段
  for (const must of ['三氯蔗糖', '甜味剂', '它是什么', '为什么食品里会有它', '应该怎样理解']) {
    if (!txt.includes(must)) throw new Error(`简明版缺少：${must}`);
  }

  // 展开深入版后，第四阶段的六段内容应完整保留
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(250);

  txt = await page.locator('.sheet').innerText();
  for (const must of ['这个成分是什么', '为什么食品中会使用它', '容易误解', '证据从哪里来']) {
    if (!txt.includes(must)) throw new Error(`深入版缺少区块：${must}`);
  }
  await shot('p4-02-sucralose');
});

await step('演示一 · 三氯蔗糖卡片含「不是蔗糖」的纠正与 K8 来源', async () => {
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('蔗糖素')) throw new Error('未提到别名「蔗糖素」');
  if (!txt.includes('不是蔗糖') && !txt.includes('两种不同的物质')) throw new Error('缺少「与蔗糖不同」的纠正');
  if (!txt.includes('[K8]')) throw new Error('缺少来源 [K8]');
  if (!txt.includes('原文摘录')) throw new Error('缺少原文摘录标记');
  await closeSheet();
});

await step('未收录配料显示知识不足，而不是危险警告', async () => {
  // V5.2 起演示配料全部收录，这里手动加一个未收录成分，验证「未知」路径依然安全
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /清柠气泡水/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.getByRole('button', { name: /添加配料/ }).click();
  await page.waitForTimeout(200);
  await page.locator('.ing-item input').last().fill('亚硝酸钠');
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
  await page.waitForTimeout(300);

  await clickIngredient('亚硝酸钠');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('暂时不能可靠解读')) throw new Error('缺少知识不足提示');
  if (!txt.includes('不代表它有问题')) throw new Error('缺少反焦虑说明');
  for (const bad of ['危险等级', '风险等级', '不健康', '有害', '警告']) {
    if (txt.includes(bad)) throw new Error(`未收录卡片出现危险措辞：${bad}`);
  }
  await shot('p4-05-unknown');
  await closeSheet();
});

await step('演示二 · 普通配料与食品添加剂分类不同', async () => {
  await openDemo('燕麦纤维饼干');
  await clickIngredient('麦芽糊精');
  let badge = await page.locator('.sheet .cat-badge').innerText();
  if (!badge.includes('普通食品配料')) throw new Error(`麦芽糊精徽章异常：${badge}`);
  let txt = await page.locator('.sheet').innerText();
  if (!txt.includes('是普通食品配料') && !txt.includes('按普通食品配料使用')) {
    throw new Error('正文没有说明它是普通配料');
  }
  await shot('p4-03-maltodextrin');
  await closeSheet();

  await clickIngredient('柠檬酸');
  badge = await page.locator('.sheet .cat-badge').innerText();
  if (!badge.includes('食品添加剂')) throw new Error(`柠檬酸徽章异常：${badge}`);
  txt = await page.locator('.sheet').innerText();
  if (!txt.includes('酸度调节剂')) throw new Error('柠檬酸缺少酸度调节剂功能');
  if (!txt.includes('[K2]')) throw new Error('缺少来源 [K2]');
  await closeSheet();
});

await step('演示三 · 乳清蛋白作为普通原料可解读', async () => {
  await openDemo('原味发酵乳');
  await clickIngredient('浓缩乳清蛋白粉');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('乳清蛋白')) throw new Error('未匹配到乳清蛋白');
  if (!txt.includes('普通食品配料')) throw new Error('未标为普通食品配料');
  if (!txt.includes('包装上写的是')) throw new Error('缺少「包装写法 → 标准名」的提示');
  await shot('p4-04-whey');
  await closeSheet();
});

await step('抽屉在手机宽度下无横向溢出', async () => {
  await clickIngredient('浓缩乳清蛋白粉');
  const over = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return s ? s.scrollWidth - s.clientWidth : -1;
  });
  if (over > 1) throw new Error(`抽屉横向溢出 ${over}px`);
  await shot('p4-07-sheet-width');
  await closeSheet();
});

await step('全程未触发任何付费 API', async () => {
  if (paidCalls.length > 0) throw new Error(`检测到 ${paidCalls.length} 次付费接口调用：${paidCalls[0]}`);
  console.log('      /api/vision/* 与 /api/deepseek/* 调用次数：0');
});

await step('回归 · 话术拆解与食用量仍正常', async () => {
  await openDemo('清柠气泡水');
  const txt = await page.locator('body').innerText();
  if (!txt.includes('2.5')) throw new Error('0 脂肪的 2.5 g 上限缺失');
  if (!txt.includes('信息不足，无法确认')) throw new Error('0 蔗糖状态缺失');
  await page.locator('.slider-row input[type=range]').fill('1000');
  await page.waitForTimeout(400);
  const after = await page.locator('body').innerText();
  if (!after.includes('5')) throw new Error('滑块改动后结果未更新');
  await shot('p4-06-regression');
});

await step('回归 · 测试台与对比工具仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (!(await page.locator('body').innerText()).includes('API 测试台')) throw new Error('测试台打不开');

  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (!(await page.locator('body').innerText()).includes('双模型识别对比')) throw new Error('对比工具打不开');
  const thumbs = await page.locator('.thumb').count();
  if (thumbs !== 5) throw new Error(`对比工具照片数异常：${thumbs}`);
});

await step('桌面宽度回归', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (!(await page.locator('body').innerText()).includes('拍下包装背面')) throw new Error('桌面宽度异常');
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\n第四阶段界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
