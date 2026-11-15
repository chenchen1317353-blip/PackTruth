/**
 * V2.4 深度研究 · 浏览器验收（真实 Chrome，全部 Mock，零付费调用）。
 *
 * 场景：
 *   A. 进度是真实阶段（服务端写入 → 前端轮询），不是按时间编的文案
 *   B. 取消：先通知服务端，再断开前端；不再发起新的调用
 *   C. 谷氨酸钠：深入分析第一眼是 EFSA 评估，其后才是身份与依据
 *   D. 三氯蔗糖：健康结论在简明与深入两处一致，不重复大卡片
 *   E. 资料不足：一句缺口说明，不编造、不空白
 *   F. 360 / 390 / 1280：深入分析不横向溢出
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { HEALTH_CASES, STANDARD_ONLY } from './fixtures/health-cases.mjs';
import { buildReplayResearch } from './fixtures/v23-health.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = 'runtime-output/shots-deep';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

let upstream = [];
page.on('request', (req) => {
  const u = req.url();
  if (/deepseek|api\.who|api\.fao|efsa\.europa/.test(u)) upstream.push(u);
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}\n     ${e.message}`);
    await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/[^\w]+/g, '-').slice(0, 40)}.png` });
  }
}
async function shot(name, locator = null) {
  const target = locator ? await locator : page;
  await target.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

async function setKey() {
  const btn = page.getByRole('button', { name: 'AI 功能设置' });
  if (await btn.count()) {
    await btn.click();
    await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
    await page.getByRole('button', { name: '完成设置' }).click();
    await page.waitForTimeout(120);
  }
}

async function gotoHome() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await setKey();
}

const BASE_PARSED = (text) => ({
  product_name: '山椒脆笋',
  brand: null,
  category: '酱腌菜',
  net_content: '150g',
  ingredients_text: text,
  nutrition: {
    basis: 'per_100g',
    basis_text: '每 100 克',
    items: [
      { name: '能量', value: '105', unit: 'kJ' },
      { name: '钠', value: '820', unit: 'mg' },
    ],
  },
  claims: [],
  unreadable: [],
  notes: null,
});

async function recognize(parsed) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          parsed,
          partial: false,
          jsonParse: { ok: true, reason: null },
          finishReason: 'stop',
          requestId: 'DP0001',
          image: { width: 600, height: 800, mimeType: 'image/jpeg' },
        },
      },
    }),
  );
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(350);
}

async function openIngredient(name) {
  for (let i = 0; i < 6; i += 1) {
    const closed = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(80);
  }
  const child = page.locator(`.ing-child-btn[aria-label*="${name}"]`);
  const card = page.locator('.ing-card-btn').filter({ hasText: name });
  if (await child.count()) await child.first().click();
  else if (await card.count()) await card.first().click();
  else throw new Error(`找不到成分：${name}`);
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(500);
}

async function mockResearch(payload) {
  await page.route(/\/api\/ingredient\/research$/, (route) => route.fulfill({ json: { ok: true, data: payload } }));
}

// ---------------------------------------------------------------- A 真实阶段

await step('A · 进度条显示服务端真实阶段与轮次', async () => {
  await gotoHome();
  let progressCalls = 0;
  await page.route('**/api/ingredient/research/progress*', (route) => {
    progressCalls += 1;
    const stage = progressCalls >= 2
      ? { stage: 'search_normal', label: '正在查找正常食用的健康评估…', round: 2, totalRounds: 4 }
      : { stage: 'search_identity', label: '正在确认成分身份与权威资料…', round: 1, totalRounds: 4 };
    route.fulfill({ json: { ok: true, data: stage } });
  });
  await page.route(/\/api\/ingredient\/research$/, async (route) => {
    await new Promise((r) => setTimeout(r, 2600));
    try {
      await route.fulfill({ json: { ok: true, data: buildReplayResearch(HEALTH_CASES.find((x) => x.key === 'sucralose')) } });
    } catch {
      /* 用户取消后 fetch 已断开，fulfill 会失败，属正常 */
    }
  });

  await recognize(BASE_PARSED('饮用水、食品添加剂（三氯蔗糖）、食用香精香料'));
  await openIngredient('三氯蔗糖');
  await page.waitForSelector('.analyzing-bar', { timeout: 8000 });
  await page.waitForTimeout(1700);
  const bar = await page.locator('.analyzing-bar').innerText();
  if (!/正在查找正常食用的健康评估/.test(bar)) throw new Error(`未显示真实阶段：${bar}`);
  if (!/当前第 2 轮/.test(bar)) throw new Error(`未显示轮次：${bar}`);
  if (/正在整理解释…/.test(bar) && !/正在查找/.test(bar)) throw new Error('仍是旧的假阶段文案');
  if (progressCalls < 2) throw new Error('前端没有轮询进度');
  await shot('A-real-stage-390', page.locator('.analyzing-bar'));
  await page.waitForFunction(() => !document.querySelector('.analyzing-bar'), { timeout: 12000 });
});

// ---------------------------------------------------------------- B 取消

await step('B · 取消：通知服务端、立即收手、如实说明可能计费', async () => {
  await gotoHome();
  let cancelCalls = 0;
  let researchCalls = 0;
  page.on('request', (req) => {
    if (/\/api\/ingredient\/research\/cancel$/.test(req.url())) cancelCalls += 1;
  });
  await page.route('**/api/ingredient/research/progress*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { stage: 'search_high', label: '正在核对高摄入与长期暴露证据…', round: 3, totalRounds: 4 },
      },
    }),
  );
  await page.route(/\/api\/ingredient\/research$/, async (route) => {
    researchCalls += 1;
    await new Promise((r) => setTimeout(r, 4000));
    try {
      await route.fulfill({ json: { ok: true, data: buildReplayResearch(STANDARD_ONLY) } });
    } catch {
      /* aborted */
    }
  });

  await recognize(BASE_PARSED('饮用水、食品添加剂（安赛蜜）、食用香精香料'));
  await openIngredient('安赛蜜');
  await page.waitForSelector('.analyzing-bar', { timeout: 8000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(500);

  if (await page.locator('.analyzing-bar').count()) throw new Error('取消后仍在显示进行中');
  const note = await page.locator('.research-cancelled').innerText();
  if (!/已取消/.test(note)) throw new Error(`缺少取消说明：${note}`);
  if (!/计费/.test(note)) throw new Error(`没有说明已发出的请求可能仍会计费：${note}`);
  if (cancelCalls < 1) throw new Error('没有通知服务端取消');
  if (researchCalls !== 1) throw new Error(`不应重复发起研究，实际 ${researchCalls} 次`);
  await shot('B-cancelled-390');
});

// ---------------------------------------------------------------- C 谷氨酸钠

await step('C · 谷氨酸钠：深入分析先给 EFSA 评估，再给「对这款食品」，最后才是依据', async () => {
  await gotoHome();
  await mockResearch(buildReplayResearch(HEALTH_CASES.find((x) => x.key === 'msg'), {
    identity: { type: 'additive', label: '食品添加剂 · 增味剂', note: '谷氨酸钠（INS 621）' },
  }));
  await recognize(BASE_PARSED('饮用水、竹笋、食品添加剂（谷氨酸钠）、食用盐'));
  await openIngredient('谷氨酸钠');

  const headline = await page.locator('.sheet .health-headline').innerText();
  if (!/EFSA/.test(headline)) throw new Error(`首句不是 EFSA 评估：${headline}`);
  if (/无需规定|不构成健康危害/.test(headline)) throw new Error(`仍是旧结论：${headline}`);
  if (!/30 mg\/kg/.test(await page.locator('.sheet .health-block').innerText())) {
    throw new Error('健康区没有组 ADI 数值');
  }

  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(400);

  const order = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.deep-view > *')];
    return nodes.map((n) => n.className || n.tagName);
  });
  const hIdx = order.findIndex((c) => String(c).includes('health-block'));
  const dIdx = order.findIndex((c) => String(c).includes('deep-divider'));
  if (hIdx < 0) throw new Error(`深入分析没有健康区块：${order.join(' | ')}`);
  if (!(hIdx < dIdx)) throw new Error(`顺序不对：${order.join(' | ')}`);
  // 「对这款食品」现在是健康区块内的最后一小节，必须在三个问题之后、健康脚注之前
  const blockText = await page.locator('.deep-view .health-block').innerText();
  const meaningIdx = blockText.indexOf('对这款食品有什么实际意义');
  const footIdx = blockText.indexOf('这部分只说明一般食品科学信息');
  if (meaningIdx < 0) throw new Error(`健康区块没有「对这款食品」：${blockText.slice(0, 200)}`);
  if (!(meaningIdx < footIdx)) throw new Error('「对这款食品」应出现在健康脚注之前');

  const meaning = await page.locator('.health-meaning').innerText();
  if (!/山椒脆笋/.test(meaning)) throw new Error('「对这款食品」没有使用已确认的产品名');
  if (!/配料表不标实际添加量/.test(meaning)) throw new Error('没有含量边界说明');
  if (/建议少吃|风险很高|不健康/.test(meaning)) throw new Error('出现了没有依据的饮食建议');

  const deepText = await page.locator('.deep-view').innerText();
  if (/不构成健康危害|无论.{0,6}都/.test(deepText)) throw new Error('深入分析仍有无条件安全结论');
  await shot('C-msg-deep-390', page.locator('.sheet'));
});

// ---------------------------------------------------------------- D 三氯蔗糖

await step('D · 三氯蔗糖：简明与深入同一句结论，深入版不重复大卡片', async () => {
  await gotoHome();
  await mockResearch(buildReplayResearch(HEALTH_CASES.find((x) => x.key === 'sucralose'), {
    identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '三氯蔗糖（INS 955）' },
  }));
  await recognize(BASE_PARSED('饮用水、食品添加剂（三氯蔗糖）、食用香精香料'));
  await openIngredient('三氯蔗糖');

  const briefHeadline = await page.locator('.sheet .health-headline').innerText();
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(400);
  const deepHeadline = await page.locator('.deep-view .health-headline').innerText();
  if (briefHeadline !== deepHeadline) throw new Error('简明与深入不是同一句结论');
  if (await page.locator('.deep-view .deep-core').count()) throw new Error('深入分析又出现大号核心卡片');
  if (!/安全/.test(deepHeadline)) throw new Error(`结论不是评估：${deepHeadline}`);
  await shot('D-sucralose-deep-390', page.locator('.sheet'));
});

// ---------------------------------------------------------------- E 资料不足

await step('E · 资料不足：一句缺口说明，不编造也不空白', async () => {
  await gotoHome();
  await mockResearch(buildReplayResearch(STANDARD_ONLY, {
    identity: { type: 'additive', label: '食品添加剂', note: null },
  }));
  await recognize(BASE_PARSED('饮用水、食品添加剂（安赛蜜）、食用香精香料'));
  await openIngredient('安赛蜜');
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(350);

  const deep = await page.locator('.deep-view').innerText();
  const gap = await page.locator('.deep-view .health-empty').innerText();
  if (!/健康评估资料/.test(gap)) throw new Error(`缺口说明不对：${gap}`);
  if ((deep.match(/没有取得|资料不足/g) || []).length > 3) throw new Error('反复重复同一句免责声明');
  if (/肝|肾|癌|中毒/.test(deep)) throw new Error('没有证据却写了危害');
  await shot('E-limited-deep-390', page.locator('.sheet'));
});

// ---------------------------------------------------------------- F 响应式

await step('F · 360 / 390 / 1280：深入分析不横向溢出', async () => {
  // 用带健康结论的抽屉做宽度检查，确保大字标题在小屏也不被裁切
  await gotoHome();
  await mockResearch(buildReplayResearch(HEALTH_CASES.find((x) => x.key === 'sucralose'), {
    identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '三氯蔗糖（INS 955）' },
  }));
  await recognize(BASE_PARSED('饮用水、食品添加剂（三氯蔗糖）、食用香精香料'));
  await openIngredient('三氯蔗糖');
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(400);

  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');
      const deep = document.querySelector('.deep-view');
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sheetOverflow: sheet ? sheet.scrollWidth - sheet.clientWidth : 0,
        deepOverflow: deep ? deep.scrollWidth - deep.clientWidth : 0,
      };
    });
    if (m.docOverflow > 1) throw new Error(`${width}px 文档横向溢出 ${m.docOverflow}`);
    if (m.sheetOverflow > 1) throw new Error(`${width}px 抽屉横向溢出 ${m.sheetOverflow}`);
    if (m.deepOverflow > 1) throw new Error(`${width}px 深入分析横向溢出 ${m.deepOverflow}`);
    await shot(`F-deep-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
});

await browser.close();

console.log(`\n深度研究浏览器验收：${passed} 通过 / ${failed} 失败`);
console.log(`真实上游请求：${upstream.length} 次`);
if (pageErrors.length) {
  console.log('页面报错：');
  for (const e of pageErrors.slice(0, 5)) console.log('  -', e);
}
process.exit(failed === 0 && upstream.length === 0 && pageErrors.length === 0 ? 0 : 1);
