/**
 * CLAIMS V2 真实浏览器验收（Playwright + 本机 Chrome，零 API 成本）。
 *
 * 五个场景全部使用内置虚构演示样品，在真实 DOM 里改数值、点选项、读结果：
 *   A 低脂饮料：边界 1.5 / 1.6（每 100 mL）
 *   B 高蛋白：12 g 通过；6.1 g 通过「每 420 kJ」；5 g 不一致
 *   C 低糖但没标糖：信息不足，不用碳水顶替
 *   D 无添加糖：区分「不添加」与「无糖」
 *   E 手动输入「富含膳食纤维」：走通用规则，不靠演示按钮
 *
 * 另含：更多宣传语展开、食品形态切换、360px 移动端无横向溢出。
 */

import { chromium } from './browser-test-runtime.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-claims-v2');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const results = [];
const bodyText = () => page.locator('body').innerText();
const shot = async (name) => {
  await page.waitForTimeout(260);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
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

/** 打开某个演示样品，停在确认页 */
async function openDemo(matchText) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: new RegExp(matchText) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
}

/** 点选宣传语（默认组或展开后的更多组都要能点到） */
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
    await page.waitForTimeout(150);
  }
  const again = page.getByRole('button', { name: `＋ ${text}`, exact: true });
  if (!(await again.count())) throw new Error(`找不到宣传语按钮：${text}`);
  await again.first().click();
}

/** 更稳的做法：遍历行读 inputValue */
async function findNutRow(name) {
  const rows = page.locator('.nut-row');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const v = await rows.nth(i).locator('.nut-name').inputValue();
    if (v.trim() === name) return rows.nth(i);
  }
  throw new Error(`确认页找不到营养素行：${name}`);
}

async function setNutrient(name, value) {
  const row = await findNutRow(name);
  const input = row.locator('.nut-value');
  if (await input.isDisabled()) throw new Error(`「${name}」当前是「未标示」状态，不能填数值`);
  await input.fill(String(value));
  await input.press('Tab');
  await page.waitForTimeout(180);
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
  if (!(await card.count())) throw new Error(`结果页没有「${text}」的卡片`);
  return card.first().innerText();
}

// ================================================================ 场景 A

await step('确认页：食品形态可确认、更多宣传语可展开，移动端不溢出', async () => {
  await openDemo('清柠气泡水');
  const txt = await bodyText();
  if (!txt.includes('食品形态')) throw new Error('缺少食品形态确认');
  if (!txt.includes('已收录 30 类说法')) throw new Error('宣传语收录提示缺失');

  const toggle = page.locator('.more-claims-toggle');
  if (!(await toggle.count())) throw new Error('缺少「更多宣传语」入口');
  await toggle.click();
  await page.waitForTimeout(200);
  const moreCount = await page.locator('.chip-grid-more .chip').count();
  if (moreCount < 15) throw new Error(`更多宣传语只展开了 ${moreCount} 个`);
  if (!(await page.locator('.chip-grid-more').innerText()).includes('高钙')) {
    throw new Error('更多宣传语里没有「高钙」');
  }
  await noHScroll('确认页 390px');
  await shot('v2-01-confirm-more');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(250);
  await noHScroll('确认页 360px');
  await shot('v2-02-confirm-360');
  await page.setViewportSize({ width: 390, height: 844 });
});

await step('A · 低脂饮料：脂肪 1.5 g/100 mL 有标签依据', async () => {
  await openDemo('清柠气泡水');
  await addClaimChip('低脂');
  await setNutrient('脂肪', 1.5);
  await confirm();
  const card = await expectCard('低脂');
  if (!card.includes('有直接标签依据')) throw new Error(`1.5 应满足低脂：${card.slice(0, 160)}`);
  if (!card.includes('1.5')) throw new Error('卡片没有展示确认后的脂肪值');
  if (!card.includes('液体')) throw new Error('没有说明按液体口径判定');
  if (!card.includes('不等于无脂肪')) throw new Error('缺少「低脂 ≠ 无脂肪」');
  await noHScroll('结果页');
  await shot('v2-03-A-lowfat-pass');
});

await step('A2 · 低脂饮料：脂肪 1.6 g/100 mL 显示不一致疑点', async () => {
  await page.getByRole('button', { name: /返回修改/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await setNutrient('脂肪', 1.6);
  await confirm();
  const txt = await bodyText();
  if (!txt.includes('与标签数值不一致')) throw new Error('缺少「与标签数值不一致」状态');
  if (!txt.includes('不一致疑点')) throw new Error('缺少「不一致疑点」提示块');
  if (!txt.includes('不等于商家违法')) throw new Error('缺少「不等于违法」的边界说明');
  const card = await expectCard('低脂');
  if (!card.includes('1.6')) throw new Error('卡片没有展示 1.6');
  await shot('v2-04-A-lowfat-mismatch');
});

// ================================================================ 场景 B

await step('B · 高蛋白：12 g/100 g 通过固体阈值', async () => {
  await openDemo('原味发酵乳');
  await addClaimChip('高蛋白');
  await setNutrient('蛋白质', 12);
  await confirm();
  const card = await expectCard('高蛋白');
  if (!card.includes('有直接标签依据')) throw new Error(`12 g 应满足高蛋白：${card.slice(0, 160)}`);
  if (!card.includes('每 100 g 途径')) throw new Error('没有说明走的哪条途径');
  if (!card.includes('不代表低脂')) throw new Error('缺少「高蛋白 ≠ 低脂」');
  await shot('v2-05-B-protein-pass');
});

await step('B2 · 高蛋白：6.1 g 仍可通过「每 420 kJ」途径', async () => {
  await page.getByRole('button', { name: /返回修改/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await setNutrient('蛋白质', 6.1);
  await confirm();
  const card = await expectCard('高蛋白');
  if (!card.includes('有直接标签依据')) throw new Error(`6.1 g 应通过 420 kJ 途径：${card.slice(0, 200)}`);
  if (!card.includes('420 kJ')) throw new Error('没有提到每 420 kJ 途径');
  await shot('v2-06-B-protein-420');
});

await step('B3 · 高蛋白：5 g 时两条已实现途径都不满足 → 不一致疑点', async () => {
  await page.getByRole('button', { name: /返回修改/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await setNutrient('蛋白质', 5);
  await confirm();
  const card = await expectCard('高蛋白');
  if (!card.includes('不一致疑点')) throw new Error(`5 g 应显示不一致：${card.slice(0, 200)}`);
  if (!card.includes('不满足')) throw new Error('没有展示每条途径的判定');
  await shot('v2-07-B-protein-mismatch');
});

// ================================================================ 场景 C

await step('C · 低糖但没标糖：明确信息不足，不用碳水顶替', async () => {
  await openDemo('原味发酵乳');
  await addClaimChip('低糖');
  await confirm();
  const card = await expectCard('低糖');
  if (!card.includes('信息不足')) throw new Error(`应判信息不足：${card.slice(0, 160)}`);
  if (!card.includes('碳水化合物')) throw new Error('缺少「碳水不能代替糖」');
  if (!card.includes('第 4.2 条')) throw new Error('缺少「声称时应标示糖」的依据提示');
  if (card.includes('≤5')) throw new Error('信息不足时不应给出判定阈值结论');
  await shot('v2-08-C-lowsugar-unknown');
});

// ================================================================ 场景 D

await step('D · 无添加糖 + 白砂糖：显示不一致疑点，同时保留配方与成品糖的区分', async () => {
  await openDemo('原味发酵乳');
  await addClaimChip('无添加糖');
  await confirm();
  const card = await expectCard('无添加糖');
  // V2.1：明确的添加糖线索改为「不一致疑点」，不再只是一般性的理解偏差
  if (!card.includes('所选宣传语与配料信息存在不一致疑点')) {
    throw new Error(`应显示不一致状态：${card.slice(0, 200)}`);
  }
  if (!card.includes('配料表出现白砂糖')) throw new Error('结论句没有点名白砂糖');
  if (!card.includes('不添加糖 ≠ 无糖')) throw new Error('缺少核心区分');
  if (!card.includes('甜味剂不是糖')) throw new Error('缺少甜味剂说明');
  if (!card.includes('2027 年 3 月 16 日')) throw new Error('缺少可见的版本提示');
  await shot('v2-09-D-no-added-sugar');
});

// ================================================================ 场景 E

await step('E · 手动输入「富含膳食纤维」走通用规则', async () => {
  await openDemo('燕麦纤维饼干');
  await page.getByRole('button', { name: /手动添加宣传语/ }).click();
  const input = page.getByLabel('手动输入包装宣传语');
  await input.fill('富含膳食纤维');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.waitForTimeout(200);
  const selected = await page.locator('.selected-claims').innerText();
  if (!selected.includes('富含膳食纤维')) throw new Error('手动输入没有被加入');
  await confirm();
  const card = await expectCard('富含膳食纤维');
  if (!card.includes('高膳食纤维')) throw new Error('没有匹配到「高膳食纤维」规则');
  if (!card.includes('有直接标签依据')) throw new Error(`6 g 纤维应满足高膳食纤维：${card.slice(0, 200)}`);
  if (!card.includes('每 100 g 途径')) throw new Error('缺少判定途径');
  await shot('v2-10-E-manual-fiber');
});

await step('结果页：卡片标注规则名、声称类型与计量口径，360px 不溢出', async () => {
  const meta = claimCard('富含膳食纤维').locator('.claim-meta-row');
  const txt = await meta.innerText();
  if (!txt.includes('高膳食纤维')) throw new Error(`缺少规则名：${txt}`);
  if (!txt.includes('营养含量声称')) throw new Error('缺少声称类型');
  if (!txt.includes('固体')) throw new Error('缺少计量口径');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  await noHScroll('结果页 360px');
  await shot('v2-11-result-360');
  await page.setViewportSize({ width: 390, height: 844 });
});

await step('来源卡：新规则可展开，原文/摘要与条款齐全', async () => {
  const card = claimCard('富含膳食纤维');
  await card.locator('.evidence-block summary').click();
  await page.waitForTimeout(300);
  const txt = await card.innerText();
  if (!txt.includes('原文摘录')) throw new Error('缺少原文摘录标记');
  if (!txt.includes('GB 28050—2011')) throw new Error('缺少标准编号');
  if (!txt.includes('表 C.1')) throw new Error('缺少条款');
  if (!txt.includes('官方原文')) throw new Error('缺少官方链接');
  await shot('v2-12-evidence');
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\nCLAIMS V2 界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);

await browser.close();
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
