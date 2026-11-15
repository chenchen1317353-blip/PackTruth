/**
 * PackTruth V2.1 真实浏览器验收（Playwright + 本机 Chrome，零 API 成本）。
 *
 * 覆盖：
 *   A 包装话术：低脂（满足）/ 低糖（信息不足）/ 无添加糖（与白砂糖冲突）三种结论
 *   B 成分分析：简明三段重点句、深入分析核心结论、部分资料与未知成分
 *   视觉层级：结论字号必须明显大于正文；移动端 360/390 不溢出；桌面 1280 不退化
 *
 * 所有数据来自内置虚构演示样品，演示模式不发起任何 /api 请求。
 */

import { chromium } from './browser-test-runtime.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-claims-v21');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const apiCalls = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('request', (r) => {
  if (r.url().includes('/api/')) apiCalls.push(r.url());
});

const results = [];
const bodyText = () => page.locator('body').innerText();
const shot = async (name, target = page) => {
  await page.waitForTimeout(260);
  await target.screenshot({ path: join(OUT, `${name}.png`), fullPage: target === page });
};

async function step(name, fn) {
  process.stdout.write(`\n── ${name}\n`);
  try {
    await fn();
    console.log('   ✓ 通过');
    results.push({ name, ok: true });
  } catch (e) {
    const msg = String(e.message).split('\n')[0];
    console.log(`   ✗ 失败: ${msg}`);
    results.push({ name, ok: false, error: msg });
    await page
      .screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`), fullPage: true })
      .catch(() => {});
  }
}

const noHScroll = async (label = '') => {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over > 1) throw new Error(`${label} 横向溢出 ${over}px`);
};

async function openDemo(matchText) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: new RegExp(matchText) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
}

async function addClaimChip(text) {
  const exact = page.getByRole('button', { name: `＋ ${text}`, exact: true });
  if (await exact.count()) {
    await exact.first().click();
    return;
  }
  const toggle = page.locator('.more-claims-toggle');
  if (await toggle.count()) {
    const expanded = await toggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await toggle.click();
    await page.waitForTimeout(180);
  }
  const again = page.getByRole('button', { name: `＋ ${text}`, exact: true });
  if (!(await again.count())) throw new Error(`找不到宣传语按钮：${text}`);
  await again.first().click();
}

async function findNutRow(name) {
  const rows = page.locator('.nut-row');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    if ((await rows.nth(i).locator('.nut-name').inputValue()).trim() === name) return rows.nth(i);
  }
  throw new Error(`找不到营养素行：${name}`);
}

async function setNutrient(name, value) {
  const row = await findNutRow(name);
  const input = row.locator('.nut-value');
  await input.fill(String(value));
  await input.press('Tab');
  await page.waitForTimeout(160);
}

async function confirm() {
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
}

function claimCard(text) {
  return page
    .locator('.claim-card')
    .filter({ has: page.locator('.claim-quote', { hasText: `「${text}」` }) });
}

async function expectCard(text) {
  const card = claimCard(text);
  if (!(await card.count())) throw new Error(`没有「${text}」卡片`);
  return card.first();
}

async function fontPx(locator) {
  return locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
}

// ================================================================ A 话术

await step('A · 同屏呈现满足 / 信息不足 / 不一致三种结论', async () => {
  await openDemo('原味发酵乳');
  await addClaimChip('低脂');
  await addClaimChip('低糖');
  await addClaimChip('无添加糖');
  await setNutrient('脂肪', 2);
  await confirm();

  const fat = await expectCard('低脂');
  const sugar = await expectCard('低糖');
  const added = await expectCard('无添加糖');

  const fatText = await fat.innerText();
  if (!fatText.includes('有直接标签依据')) throw new Error('低脂应为有标签依据');
  if (!fatText.includes('达到「低脂肪」条件')) throw new Error(`低脂结论缺失：${fatText.slice(0, 160)}`);

  const sugarText = await sugar.innerText();
  if (!sugarText.includes('信息不足')) throw new Error('低糖应为信息不足');
  if (!sugarText.includes('无法确认「低糖」')) throw new Error('低糖结论应说明无法确认');
  if (sugarText.includes('安全')) throw new Error('信息不足不得写成安全结论');

  const addedText = await added.innerText();
  if (!addedText.includes('所选宣传语与配料信息存在不一致疑点')) {
    throw new Error('无添加糖应显示不一致状态');
  }
  if (!addedText.includes('配料表出现白砂糖')) throw new Error('结论句应点名白砂糖');
  if (!addedText.includes('确实印在这款包装上')) throw new Error('缺少宣传语来源提示');
  if (!addedText.includes('2027 年 3 月 16 日')) throw new Error('缺少可见的版本提示');

  await noHScroll('话术页 390px');
  await shot('A-claims-390');
});

await step('A2 · 结论字号明显大于解释正文', async () => {
  for (const name of ['低脂', '低糖', '无添加糖']) {
    const card = await expectCard(name);
    const takeaway = card.locator('.claim-takeaway');
    if (!(await takeaway.count())) throw new Error(`${name} 缺少结论句`);
    const t = await fontPx(takeaway);
    const s = await fontPx(card.locator('.claim-summary'));
    if (t < s + 4) throw new Error(`${name} 结论字号 ${t}px 未明显大于正文 ${s}px`);
  }
  await shot('card-低脂', await expectCard('低脂'));
  await shot('card-低糖', await expectCard('低糖'));
  await shot('card-无添加糖', await expectCard('无添加糖'));
});

await step('A3 · 360 / 1440 无横向溢出，桌面布局不退化', async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(250);
  await noHScroll('话术页 360px');
  await shot('A-claims-360');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await noHScroll('话术页 1440px');
  await shot('A-claims-1440');

  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(250);
  await noHScroll('话术页 768px');

  await page.setViewportSize({ width: 390, height: 844 });
});

// ================================================================ B 成分

await step('B1 · 简明三段的关键句被放大，正文保持完整', async () => {
  await openDemo('清柠气泡水');
  await confirm();
  await page.getByRole('button', { name: /三氯蔗糖/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(350);

  const blocks = page.locator('.brief-block');
  const count = await blocks.count();
  if (count !== 3) throw new Error(`简明段数量异常：${count}`);

  const keys = page.locator('.brief-key');
  const keyCount = await keys.count();
  // V2.2 起演示模式直接展示人工整理的健康资料，简明三段可能没有可安全放大的句子；
  // 这里只约束「最多一句重点」，不允许整页粗体。
  if (keyCount > 1) throw new Error(`简明三段最多 1 句重点，实际 ${keyCount}`);

  for (let i = 0; i < keyCount; i += 1) {
    const key = keys.nth(i);
    const keySize = await fontPx(key);
    const textSize = await fontPx(blocks.first().locator('.brief-text'));
    if (keySize <= textSize) throw new Error('重点句没有大于正文');
    const text = await key.innerText();
    const blockText = await key.locator('xpath=..').innerText();
    if (!blockText.includes(text)) throw new Error('重点句脱离了原文');
  }

  await shot('B-brief-390', page.locator('.sheet'));
});

await step('B2 · 预录联网资料 + 深入分析：核心结论醒目且不重复简明段', async () => {
  // V2.2 起演示模式不再有「查看预录综合分析」按钮：
  // 有整理资料时直接展示健康区块，点「深入了解」看同一份数据的深入版。
  const replay = page.getByRole('button', { name: /查看预录综合分析/ });
  if (await replay.count()) {
    await replay.click();
    await page.waitForTimeout(700);
  } else {
    const healthVisible = await page.locator('.health-block').count();
    if (!healthVisible) throw new Error('演示模式没有直接展示预录健康资料');
  }

  const deep = page.getByRole('button', { name: /深入了解这个成分/ });
  await deep.click();
  await page.waitForTimeout(450);

  const core = page.locator('.deep-core');
  if (await core.count()) {
    const coreText = await core.innerText();
    if (!coreText.includes('核心结论') && !coreText.includes('科学背景')) {
      throw new Error('核心区缺少标签');
    }
    if (coreText.length < 30) throw new Error('核心区过短');
  } else {
    // V2.3 起：健康结论已经在深入版顶部整块展示时，不再重复一张「核心结论」大卡。
    const deepHealth = await page.locator('.deep-view .health-block').count();
    if (!deepHealth) throw new Error('深入分析既没有核心区也没有健康区块');
    const headlineText = (await page.locator('.deep-view .health-headline').innerText()).trim();
    if (!headlineText) throw new Error('健康区块缺少首句结论');
    const briefBlob = await page.locator('.brief-view').innerText();
    if (briefBlob.includes(headlineText)) throw new Error('健康首句与上方简明段重复');
  }

  if (await core.count()) {
    // V2.1.1：核心区改成「短标题 + 普通字号说明」两层
    const headline = core.locator('.deep-core-headline');
    const explain = core.locator('.deep-core-explain');
    if (!(await headline.count())) throw new Error('核心结论缺少短标题');
    const coreSize = await fontPx(headline);
    const explainSize = await fontPx(explain);
    const claimSize = await fontPx(page.locator('.deep-view .claim-text').first());
    if (coreSize < 17) throw new Error(`核心结论字号过小：${coreSize}px`);
    if (coreSize < claimSize + 2) throw new Error(`核心结论 ${coreSize}px 未明显大于逐条结论 ${claimSize}px`);
    if (explainSize >= coreSize) throw new Error(`说明 ${explainSize}px 不应与标题同大`);

    const headlineText2 = (await headline.innerText()).trim();
    if (headlineText2.length > 46) throw new Error(`短标题过长：${headlineText2.length} 字`);
    const briefBlob2 = await page.locator('.brief-view').innerText();
    if (briefBlob2.includes(headlineText2)) throw new Error('深入结论与上方简明段重复');
  }

  const limits = page.locator('.deep-view .claim-limit').first();
  if (await limits.count()) {
    const visible = await limits.isVisible();
    if (!visible) throw new Error('限定语被隐藏');
  }

  await shot('B-deep-390', page.locator('.sheet'));
  if (await core.count()) await shot('B-deep-core-390', core);
});

await step('B3 · 部分可靠资料与未知成分：信息不足明确可见', async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /赤藓糖醇/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(300);
  const partial = await page.locator('.sheet').innerText();
  if (!partial.includes('它是什么') || !partial.includes('应该怎样理解')) {
    throw new Error('部分资料成分缺少简明三段');
  }
  await shot('B-partial-390', page.locator('.sheet'));

  const partialDeep = page.getByRole('button', { name: /深入了解这个成分/ });
  if (await partialDeep.count()) {
    await partialDeep.click();
    await page.waitForTimeout(400);
    const deepText = await page.locator('.sheet').innerText();
    if (!deepText.includes('部分内容待完善')) throw new Error('部分资料成分缺少「待完善」限定');
    if (!deepText.includes('不能确认')) throw new Error('深入版缺少「不能确认什么」');
    await shot('B-partial-deep-390', page.locator('.sheet'));
  }

  // 未知成分：把演示二的「燕麦片」改成知识库没有的名字
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
  await openDemo('燕麦纤维饼干');
  const rows = page.locator('.ing-item');
  const n = await rows.count();
  let renamed = false;
  for (let i = 0; i < n; i += 1) {
    const input = rows.nth(i).locator('input[type=text]');
    if ((await input.inputValue()).trim() === '燕麦片') {
      await input.fill('神秘提取物');
      renamed = true;
      break;
    }
  }
  if (!renamed) throw new Error('没有找到可改名的演示配料');
  await confirm();
  await page.getByRole('button', { name: /神秘提取物/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(350);
  const unknown = await page.locator('.sheet').innerText();
  if (!unknown.includes('暂时不能可靠解读')) throw new Error('未知成分没有明确说明资料不足');
  if (!unknown.includes('不代表它有问题')) throw new Error('缺少「不代表有问题」的说明');
  if (/主要起|作用是|用于稳定/.test(unknown)) throw new Error('未知成分被写成确定用途');
  await shot('B-unknown-390', page.locator('.sheet'));
});

await step('B4 · 成分抽屉 360 / 1280 无溢出', async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(250);
  await noHScroll('成分抽屉 360px');
  await shot('B-unknown-360', page.locator('.sheet'));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  await noHScroll('成分抽屉 1280px');
  await shot('B-unknown-1280', page.locator('.sheet'));
});

await step('全程演示模式：没有发起任何 /api 请求', async () => {
  if (apiCalls.length) throw new Error(`演示模式发起了 ${apiCalls.length} 个 API 请求：${apiCalls[0]}`);
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\nV2.1 界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);

await browser.close();
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
