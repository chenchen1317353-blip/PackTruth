/**
 * 第六阶段端到端验收（真实浏览器）。
 *
 * 用法：node scripts/e2e-phase6.mjs
 *
 * 花钱的部分（只有两处，其余全部 Mock / 本地）：
 *   1. 真实上传 04-dongpeng-drink.jpg 走一次 DeepSeek Vision 识别；
 *   2. 真实点击「氯化钾」走一次联网循证分析。
 * 其余：演示模式零成本；429 / no_source 用请求拦截模拟；服务器故障由 test-phase6 覆盖。
 */

import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase6');
mkdirSync(OUT, { recursive: true });

const errors = [];
const paidCalls = []; // 真实到达上游的付费端点请求
const mocked = { vision: false, research: false };

let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${name} — ${e.message}`);
    try {
      await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]+/g, '_')}.png`), fullPage: true });
    } catch {}
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('request', (r) => {
  const u = r.url();
  const isVision = u.includes('/api/vision/extract');
  const isResearch = u.includes('/api/ingredient/research');
  if (!isVision && !isResearch) return;
  // 被测试自己拦截（route.fulfill）的请求不会到达上游
  if ((isVision && mocked.vision) || (isResearch && mocked.research)) return;
  paidCalls.push(u);
});

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
const fullShot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

async function noHScroll(sel = 'body') {
  const over = await page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.scrollWidth - el.clientWidth : -1;
  }, sel);
  if (over > 1) throw new Error(`${sel} 横向溢出 ${over}px`);
}

async function openDemo(label) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 15000 });
}

async function confirmDemo() {
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 15000 });
}

async function closeSheet() {
  await page.locator('.sheet-close').click();
  await page.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 5000 });
}

/** 防御：任何一步失败都可能留下打开的抽屉，后续步骤先确保干净 */
async function ensureSheetClosed() {
  if (await page.locator('.sheet').count()) {
    await page.locator('.sheet-close').click().catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 5000 }).catch(() => {});
  }
}

// ============================================================ 1. 移动端四宽度

console.log('\n── 移动端四宽度检查（演示模式，零成本）──');

for (const width of [360, 390, 768, 1280]) {
  await step(`宽度 ${width}px · 上传页无横向溢出`, async () => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await noHScroll();
    await shot(`p6-w${width}-upload`);
  });

  await step(`宽度 ${width}px · 确认页无横向溢出`, async () => {
    await page.getByRole('button', { name: /清柠气泡水/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 15000 });
    await noHScroll();
    await shot(`p6-w${width}-confirm`);
  });

  await step(`宽度 ${width}px · 结果页无横向溢出且话术拆解在最前`, async () => {
    await page.getByRole('button', { name: /确认无误/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 15000 });
    await noHScroll();
    const order = await page.evaluate(() => {
      const h2s = [...document.querySelectorAll('.result-section h2')].map((x) => x.textContent.trim());
      return h2s.indexOf('包装话术拆解') < h2s.indexOf('单品食用量');
    });
    if (!order) throw new Error('话术拆解应排在食用量之前');
    await shot(`p6-w${width}-result`);
  });

  await step(`宽度 ${width}px · 成分抽屉可滚动、可关闭、无溢出`, async () => {
    await page.locator('.ing-card-btn', { hasText: '柠檬酸钠' }).first().click();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    await page.waitForTimeout(350);
    await noHScroll('.sheet');
    const scrollable = await page.evaluate(() => {
      const b = document.querySelector('.sheet-body');
      return b ? b.scrollHeight >= b.clientHeight - 2 || b.clientHeight < 200 : false;
    });
    if (!scrollable) throw new Error('抽屉内容区不可滚动');
    const closeVisible = await page.locator('.sheet-close').isVisible();
    if (!closeVisible) throw new Error('关闭按钮不可见');
    await shot(`p6-w${width}-sheet`);
    await closeSheet();
    await page.getByRole('button', { name: /分析另一件商品/ }).click();
  });
}

// ============================================================ 2. 识别失败 UI（Mock 429，零成本）

console.log('\n── 识别故障 UI（Mock 429）──');

await step('识别 429 → 明确中文提示 + 重试 + 手动填写出口', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_RATE_LIMITED', message: 'DeepSeek Vision：触发限流（429），请降低频率后重试' } }),
    }),
  );
  mocked.vision = true;

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles('public/test-images/real/04-dongpeng-drink.jpg');
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('识别失败'), { timeout: 20000 });
  await page.waitForTimeout(300);

  const txt = await page.locator('body').innerText();
  if (!txt.includes('限流')) throw new Error('没有显示限流文案');
  if (!txt.includes('UPSTREAM_RATE_LIMITED')) throw new Error('没有显示错误码');
  if (!(await page.getByRole('button', { name: /重试一次/ }).count())) throw new Error('缺少重试按钮');
  if (!txt.includes('跳过识别')) throw new Error('缺少手动填写出口');
  await shot('p6-vision-429');
  await page.unroute('**/api/vision/extract');
  mocked.vision = false;
});

// ============================================================ 3. 真实食品端到端（真实 API ×2）

console.log('\n── 真实食品端到端（东鹏电解质饮料，2 次真实调用）──');

await step('真实识别：上传 04 号照片 → 进入确认页', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('input[type=file]').setInputFiles('public/test-images/real/04-dongpeng-drink.jpg');
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 90000 });
  await page.waitForTimeout(400);
  await fullShot('p6-real-confirm');
});

await step('识别结果与包装原文一致（电解质饮料 · 每100mL · 13 种配料）', async () => {
  const values = await page.locator('.form-grid input').evaluateAll((els) => els.map((e) => e.value));
  if (!values[0].includes('电解质饮料')) throw new Error(`产品名异常: ${values[0]}`);
  if (!values[1].includes('东鹏')) throw new Error(`品牌异常: ${values[1]}`);

  const basisOn = await page.locator('.basis-btn.on').innerText();
  if (!/100\s*(mL|毫升)/i.test(basisOn)) throw new Error(`基准异常: ${basisOn}`);

  const nutNames = await page.locator('.nut-name').evaluateAll((els) => els.map((e) => e.value));
  const nutVals = await page.locator('.nut-value').evaluateAll((els) => els.map((e) => e.value));
  const expected = { 能量: '75', 蛋白质: '0', 脂肪: '0', 碳水化合物: '4.4', 钠: '22' };
  for (const [name, val] of Object.entries(expected)) {
    const i = nutNames.findIndex((n) => n === name);
    if (i < 0) throw new Error(`缺少营养项 ${name}`);
    if (nutVals[i] !== val) throw new Error(`${name} 识别为 ${nutVals[i]}，包装原文为 ${val}`);
  }
  const ingCount = await page.locator('.ing-item input').count();
  if (ingCount < 10) throw new Error(`配料只有 ${ingCount} 项`);
  console.log(`      营养 5 项与包装一致 · 配料 ${ingCount} 项`);
});

await step('人工修正：补录净含量 555mL（AI 漏读）+ 手动添加「0 脂肪」', async () => {
  // 修正 1：净含量（第 3 个基本信息输入框）
  await page.locator('.form-grid input').nth(2).fill('555mL');
  // 修正 2：手动添加宣传语
  await page.getByRole('button', { name: /手动添加宣传语/ }).click();
  await page.locator('.manual-row input').last().fill('0 脂肪');
  await page.getByRole('button', { name: '添加', exact: true }).last().click();
  await page.waitForTimeout(200);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('0 脂肪')) throw new Error('宣传语未添加成功');
});

await step('确认后进入结果页：0 脂肪卡给出理论上限 2.775 g（555mL 换算）', async () => {
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 15000 });
  await page.waitForTimeout(400);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('0 脂肪')) throw new Error('没有 0 脂肪卡');
  if (!txt.includes('理论上限')) throw new Error('没有理论上限标注');
  if (!/2\.775|2\.78/.test(txt)) throw new Error('换算值不是 2.775 g 上下');
  if (!txt.includes('555 mL') && !txt.includes('555mL')) throw new Error('食用量没有默认取净含量 555');
  await fullShot('p6-real-result');
});

// ---- 成分研究的 Mock 数据（与真实返回结构一致，供确定性验证交互） ----
const MOCK_BRIEF = {
  what: '',
  why: '',
  howToUnderstand: '',
  sourceRefs: ['W1'],
  tier: 'cited',
  verified: true,
  charCount: 60,
};
const MOCK_SOURCES = [
  {
    id: 'W1',
    title: 'GB 2760-2024 食品添加剂使用标准（Mock）',
    organization: '国家食品安全风险评估中心',
    sourceType: 'search_content',
    url: 'https://gb2760.cfsa.net.cn/mock/1',
    excerpt: '氯化钾（Mock 摘录）：功能为其他，允许按生产需要适量使用。',
    excerptType: 'search_body_excerpt',
    retrievedAt: new Date().toISOString(),
  },
];
function mockResearch({ name, brief, sources = MOCK_SOURCES, sections = [], status = 'ok', composition = 'web_only' }) {
  return {
    status,
    composition,
    ingredient: name,
    localMatched: false,
    localEntryId: null,
    query: `${name} site:who.int`,
    querySites: ['who.int'],
    queryLength: 20,
    searchCount: 2,
    searchContentCount: 2,
    searchRounds: 1,
    fallback: { triggered: false, reason: null, firstQuery: '', secondQuery: null, secondResultCount: 0, secondAddedCount: 0 },
    blocked: [],
    fetchFailures: [],
    fetchCount: 0,
    sources,
    evidenceStats: { local: 0, webBody: 2, webSummary: 0 },
    identity: { type: 'additive', label: '食品添加剂', note: 'Mock' },
    brief,
    briefRejectReason: null,
    briefScienceReview: null,
    sections,
    rejectedSections: [],
    verification: {
      status,
      composition,
      errors: [],
      warnings: [],
      stats: { totalSections: sections.length, accepted: sections.length, rejected: 0, citedFromBody: sections.length, snippetOnly: 0 },
    },
    notes: [],
    chat: null,
    timings: {},
    totalMs: 300,
    retrievedAt: new Date().toISOString(),
    cached: false,
    scienceStats: { passed: sections.length, review: 0, rejected: 0 },
    relevanceFiltered: [],
  };
}

await step('联网分析「氯化钾」（点击即分析，Mock 固定响应保证确定性）', async () => {
  // V6.1 起改为 Mock：真实搜索每次返回的内容有随机性（上一轮曾导致 2 段/3 段不稳定），
  // 本步骤要验证的是「点击即自动分析」这个交互，不是搜索质量——后者由 V6.1 真实回放覆盖。
  await page.route('**/api/ingredient/research', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: mockResearch({
          name: body.name,
          brief: {
            ...MOCK_BRIEF,
            what: '氯化钾是一种含钾的化合物，在标准中登记为食品添加剂。',
            why: '按标准登记的功能在食品中使用，如调节酸碱度或作为钾来源。',
            howToUnderstand: '标准允许的用法不等于每款产品都这样用，配料表看不出具体用量。',
          },
          sources: MOCK_SOURCES,
          sections: [
            { id: 's1', section: 'what', text: '氯化钾是一种食品添加剂。', sourceRefs: ['W1'], verified: true, tier: 'cited' },
            { id: 's2', section: 'why', text: '按标准登记的功能在食品中使用。', sourceRefs: ['W1'], verified: true, tier: 'cited' },
          ],
        }),
      }),
    });
  });
  mocked.research = true;

  await page.locator('.ing-card-btn', { hasText: '氯化钾' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  // 关键：不需要再点任何按钮，分析应自动开始。
  await page.waitForSelector('.analyzing-bar, .composition-bar', { timeout: 8000 });
  await page.waitForSelector('.composition-bar', { timeout: 30000 });
  await page.waitForTimeout(500);

  const txt = await page.locator('.sheet').innerText();
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3，实际 ${blocks}`);
  if (!txt.includes('引用对应关系已检查')) throw new Error('缺少校验状态');
  if (txt.includes('科学已核验')) throw new Error('出现了「科学已核验」这类过度保证');
  const chips = await page.locator('.ref-chip').count();
  if (chips === 0) throw new Error('没有来源芯片');
  await shot('p6-real-research-brief');
});

await step('氯化钾深入版可展开，含来源卡与检索过程', async () => {
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(300);
  const srcs = await page.locator('.deep-view .src-card').count();
  if (srcs < 1) throw new Error('深入版没有来源卡');
  await page.locator('.research-diag summary').last().click().catch(() => {});
  await page.waitForTimeout(200);
  await shot('p6-real-research-deep');
  await closeSheet();
});

await step('真实模式下本地成分同样自动补充联网（Mock 响应，验证不额外付费）', async () => {
  await ensureSheetClosed();
  // V5.2 设计：真实模式下点击任何成分都会自动联网，本地内容只是先行展示。
  // 这里拦截请求返回一个「只有本地构成」的响应，验证：请求照常发出（但不付费）、
  // 本地简明内容正常渲染 —— 不能因为本地有条目就跳过通用分析流程。
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          status: 'partial',
          composition: 'local_only',
          ingredient: '柠檬酸钠',
          query: '柠檬酸钠 site:who.int',
          querySites: ['who.int'],
          searchCount: 2,
          searchContentCount: 0,
          fetchCount: 0,
          blocked: [],
          fetchFailures: [],
          sources: [],
          evidenceStats: { local: 0, webBody: 0, webSummary: 0 },
          identity: null,
          sections: [],
          rejectedSections: [],
          verification: { status: 'partial', composition: 'local_only', errors: [], warnings: [], stats: {} },
          notes: ['搜索返回的资料均与食品用途无关，已过滤'],
          chat: null,
          timings: {},
          totalMs: 200,
          retrievedAt: new Date().toISOString(),
          brief: null,
          briefRejectReason: null,
          briefScienceReview: null,
          scienceStats: { passed: 0, review: 0, rejected: 0 },
          relevanceFiltered: [],
        },
      }),
    }),
  );
  mocked.research = true;

  await page.locator('.ing-card-btn', { hasText: '柠檬酸钠' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForSelector('.composition-bar', { timeout: 10000 });
  await page.waitForTimeout(300);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('酸度调节剂')) throw new Error('本地解释未显示');
  if ((await page.locator('.brief-block').count()) !== 3) throw new Error('简明段落异常');
  await shot('p6-local-ingredient-autoflow');
  await closeSheet();
  await page.unroute('**/api/ingredient/research');
  mocked.research = false;
});

// ============================================================ 4. 成分研究故障 UI（Mock，零成本）

console.log('\n── 成分研究故障 UI（Mock）──');

await step('研究 429 → 失败提示 + 本地内容仍然有效（山梨酸钾）', async () => {
  await ensureSheetClosed();
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_RATE_LIMITED', message: 'DeepSeek Search：触发限流（429），请降低频率后重试' } }),
    }),
  );
  mocked.research = true;

  await page.locator('.ing-card-btn', { hasText: '山梨酸钾' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes('联网补充失败'), { timeout: 20000 });
  await page.waitForTimeout(300);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('限流')) throw new Error('没有显示限流原因');
  if (!txt.includes('仍然有效')) throw new Error('没有说明本地内容仍有效');
  if (!txt.includes('防腐剂')) throw new Error('本地简明内容丢失');
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`失败后简明段落应为 3，实际 ${blocks}`);
  await shot('p6-research-429-keeps-local');
  await closeSheet();
  await page.unroute('**/api/ingredient/research');
  mocked.research = false;
});

await step('研究无结果 → 本地解释 + 诚实的「没有找到资料」状态（食用盐）', async () => {
  await ensureSheetClosed();
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          status: 'no_source',
          composition: 'none',
          ingredient: '食用盐',
          query: '食用盐 site:who.int',
          querySites: ['who.int'],
          searchCount: 0,
          searchContentCount: 0,
          fetchCount: 0,
          blocked: [],
          fetchFailures: [],
          sources: [],
          evidenceStats: { local: 0, webBody: 0, webSummary: 0 },
          identity: null,
          sections: [],
          rejectedSections: [],
          verification: { status: 'no_source', composition: 'none', errors: [], warnings: [], stats: {} },
          notes: ['搜索没有返回任何结果'],
          chat: null,
          timings: {},
          totalMs: 120,
          retrievedAt: new Date().toISOString(),
          brief: null,
          briefRejectReason: null,
          briefScienceReview: null,
          scienceStats: { passed: 0, review: 0, rejected: 0 },
          relevanceFiltered: [],
        },
      }),
    }),
  );
  mocked.research = true;

  await page.locator('.ing-card-btn', { hasText: '食用盐' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForSelector('.composition-bar', { timeout: 10000 });
  await page.waitForTimeout(300);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('没有找到足够可信的资料')) throw new Error('没有显示无资料状态');
  // 本地简明内容应继续显示（食用盐有基础条目）
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`本地简明段落应为 3，实际 ${blocks}`);
  await shot('p6-research-nosource');
  await closeSheet();
  await page.unroute('**/api/ingredient/research');
  mocked.research = false;
});

// ============================================================ 5. 汇总

await step('控制台零报错（排除被 Mock 的预期失败）', async () => {
  const relevant = errors.filter(
    (e) => !e.includes('Failed to load resource') && !e.includes('429') && !e.includes('502'),
  );
  if (relevant.length > 0) throw new Error(`有未预期的报错: ${relevant[0]}`);
});

await step('付费调用统计：真实 1 次识图；研究请求全部 Mock（零研究费用）', async () => {
  // paidCalls 只统计未被 route.fulfill 拦截、真正到达上游的请求
  const vision = paidCalls.filter((u) => u.includes('/api/vision/extract')).length;
  const research = paidCalls.filter((u) => u.includes('/api/ingredient/research')).length;
  console.log(`      真实到达上游：vision=${vision}、research=${research}（Mock 的 4 次未计入）`);
  if (vision !== 1) throw new Error(`真实 vision 应为 1，实际 ${vision}`);
  if (research !== 0) throw new Error(`真实 research 应为 0（V6.1 起全部 Mock），实际 ${research}`);
});

await browser.close();

console.log(`\n界面验收：${passed}/${passed + failed} 通过\n`);
process.exit(failed === 0 ? 0 : 1);
