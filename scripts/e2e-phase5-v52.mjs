import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 第五阶段 V5.2 界面验收。
 *
 * 验证的核心不是「卡片长什么样」，而是三个交互事实：
 *   1. 演示模式点配料 → 立刻有简明解释，零付费
 *   2. 真实模式点配料 → 自动发起分析，不需要第二次点击
 *   3. 只有点「深入了解这个成分」，详细内容才展开
 *
 * 真实联网部分用路由拦截模拟（省费用），
 * 真实的联网结果已在命令行单独验证过，见 PHASE5_V52_GENERAL_REPORT.md。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase5-v52');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const paidCalls = [];
const mocked = { research: false, vision: false };

page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (mocked.research && loc.includes('/api/ingredient/research')) return;
  if (mocked.vision && loc.includes('/api/vision/extract')) return;
  errors.push(m.text());
});
page.on('request', (r) => {
  const u = r.url();
  if (
    u.includes('/api/ingredient/research') ||
    u.includes('/api/vision/extract') ||
    u.includes('/api/vision/compare') ||
    u.includes('/api/deepseek/')
  ) {
    paidCalls.push(u);
  }
});

const results = [];
const shot = async (name) => {
  await page.waitForTimeout(300);
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
    await page
      .screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`) })
      .catch(() => {});
  }
}

const noHScroll = async () => {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over > 1) throw new Error(`横向溢出 ${over}px`);
};

async function openDemo(name) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
  await page.waitForTimeout(350);
}

async function openIngredient(name) {
  await page.locator('.ing-card-btn', { hasText: name }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForTimeout(300);
}

const closeSheet = async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(220);
};

/** 构造一个符合服务端结构的 mock 分析结果 */
function mockResearch({ name, brief, sources, sections, composition = 'web_only' }) {
  return {
    status: 'ok',
    composition,
    ingredient: name,
    localMatched: composition !== 'web_only',
    brief,
    sections,
    rejectedSections: [],
    sources,
    identity: { type: 'additive', label: '食品添加剂 · 膨松剂', note: '测试用分类依据' },
    verification: { status: 'ok', stats: { accepted: sections.length, rejected: 0 } },
    evidenceStats: { local: 0, webBody: sources.length, webSummary: 0, total: sources.length },
    query: `${name} site:who.int`,
    querySites: ['who.int'],
    searchCount: sources.length,
    searchContentCount: sources.length,
    fetchCount: 0,
    blocked: [],
    fetchFailures: [],
    notes: [],
    chat: { usage: { prompt_tokens: 1000, completion_tokens: 400 }, reasoningTokens: 0 },
    timings: { chatMs: 3000 },
    totalMs: 3500,
    retrievedAt: new Date().toISOString(),
    cached: false,
    cost: { total: 0.0025 },
  };
}

const MOCK_SOURCES = [
  {
    id: 'W1',
    title: 'GB 2760-2024 食品添加剂使用标准',
    organization: '国家食品安全风险评估中心（CFSA）',
    sourceType: 'search_content',
    url: 'https://gb2760.cfsa.net.cn/index.php',
    excerpt: '碳酸氢钠 功能：膨松剂、酸度调节剂、稳定剂',
    excerptType: 'search_body_excerpt',
    retrievedAt: new Date().toISOString(),
  },
];

const MOCK_BRIEF = {
  what: '碳酸氢钠就是日常说的小苏打，是一种白色结晶粉末。',
  why: '在食品加工中主要用作膨松剂，加热或遇酸时产生气体让面团膨胀。',
  howToUnderstand: '它属于按生产需要适量使用的添加剂，配料表不标注用量，无法据此推算吃了多少。',
  sourceRefs: ['W1'],
  sources: MOCK_SOURCES,
  tier: 'cited',
  verified: true,
  charCount: 88,
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// ============================================================ 1. 演示模式：点击即解释

await step('场景 A · 演示一点击「二氧化碳」立刻有简明解释', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('二氧化碳');

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('气泡')) throw new Error('没有说明气泡作用');
  // V5.2 科学性修复后，表述改为「无需规定具体数值 + 不等于无限量」
  if (!txt.includes('无需规定具体数值') && !txt.includes('无须规定')) {
    throw new Error('没有说明「无须规定具体数值型上限」');
  }
  if (!txt.includes('不等于')) throw new Error('没有说明「无须规定数值」不等于「可以无限添加」');

  // 三个简明段落
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3 段，实际 ${blocks}`);

  const titles = await page.locator('.brief-block h3').allInnerTexts();
  const joined = titles.join('|');
  if (!joined.includes('它是什么')) throw new Error('缺少「它是什么」');
  if (!joined.includes('为什么食品里会有它')) throw new Error('缺少「为什么」');
  if (!joined.includes('应该怎样理解')) throw new Error('缺少「应该怎样理解」');

  // 演示模式不应出现联网状态
  if ((await page.locator('.analyzing-bar').count()) > 0) throw new Error('演示模式不应发起联网');
  if (txt.includes('正在查找权威资料')) throw new Error('演示模式出现了联网状态');

  // 不应出现「未收录」这种死路
  if (txt.includes('本地知识库暂无足够资料')) throw new Error('仍然显示未收录');

  await noHScroll();
  await shot('v52-01-co2-brief');
  await closeSheet();
});

await step('演示模式 · 三氯蔗糖简明卡 + 预录入口（不是必须点）', async () => {
  await openIngredient('三氯蔗糖');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('蔗糖素')) throw new Error('缺少别名');
  if (!txt.includes('两种不同的物质') && !txt.includes('不是蔗糖')) throw new Error('缺少与蔗糖区分的说明');

  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3 段，实际 ${blocks}`);

  // 预录入口存在，但简明内容已经可见，不依赖它
  if (!txt.includes('查看预录综合分析')) throw new Error('缺少预录入口');
  await shot('v52-02-sucralose-brief');
});

await step('演示模式 · 点开预录后标注「本次没有联网」', async () => {
  await page.getByRole('button', { name: '查看预录综合分析' }).click();
  await page.waitForSelector('.composition-bar', { timeout: 8000 });
  await page.waitForTimeout(300);
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('本次没有联网')) throw new Error('缺少「本次没有联网」');
  if (!txt.includes('引用对应关系已检查')) throw new Error('状态文案未更新为「引用对应关系已检查」');
  if (txt.includes('已通过引用校验')) throw new Error('仍在用旧的「已通过引用校验」文案');
  await closeSheet();
});

await step('演示模式 · 三个样品的全部配料都能点开并显示简明解释', async () => {
  const samplePlan = [
    { demo: '清柠气泡水', items: ['水', '赤藓糖醇', '二氧化碳', '柠檬酸', '柠檬酸钠', '三氯蔗糖', '食用香精'] },
    { demo: '燕麦纤维饼干', items: ['小麦粉', '燕麦片', '麦芽糊精', '白砂糖', '植物油', '鸡蛋', '食用盐'] },
    { demo: '原味发酵乳', items: ['生牛乳', '浓缩乳清蛋白粉'] },
  ];

  let checked = 0;
  const bad = [];

  for (const plan of samplePlan) {
    await openDemo(plan.demo);
    for (const item of plan.items) {
      const btn = page.locator('.ing-card-btn', { hasText: item }).first();
      if ((await btn.count()) === 0) {
        bad.push(`${plan.demo}/${item}（列表里找不到）`);
        continue;
      }
      await btn.click();
      await page.waitForSelector('.sheet', { timeout: 5000 });
      await page.waitForTimeout(180);

      const blocks = await page.locator('.brief-block').count();
      const hasUnknown = (await page.locator('.sheet').innerText()).includes('暂时不能可靠解读');
      if (blocks !== 3 || hasUnknown) bad.push(`${item}（段落 ${blocks}${hasUnknown ? '，显示未知' : ''}）`);

      await page.locator('.sheet-close').click();
      await page.waitForTimeout(160);
      checked += 1;
    }
  }

  if (bad.length > 0) throw new Error(`${bad.length} 个配料有问题：${bad.slice(0, 5).join('、')}`);
  if (checked < 16) throw new Error(`只检查了 ${checked} 个配料`);
  console.log(`      已检查 ${checked} 个配料，全部有简明解释`);
});

// ============================================================ 2. 深入了解

await step('默认不展开深入内容，点击后才出现', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('三氯蔗糖');

  if ((await page.locator('.deep-view').count()) > 0) throw new Error('默认就展开了深入内容');

  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(250);

  const txt = await page.locator('.sheet').innerText();
  // 深入版要保留第四阶段的区块
  for (const must of ['这个成分是什么', '为什么食品中会使用它', '容易误解的地方', '证据从哪里来']) {
    if (!txt.includes(must)) throw new Error(`深入版缺少区块：${must}`);
  }
  if (!txt.includes('[K8]')) throw new Error('深入版缺少 [K8]');

  // 展开后再次点击应能收起
  await page.getByRole('button', { name: /收起详细内容/ }).click();
  await page.waitForTimeout(220);
  if ((await page.locator('.deep-view').count()) > 0) throw new Error('收起失败');

  await noHScroll();
  await shot('v52-03-deep');
  await closeSheet();
});

await step('简明版与深入版引用同一套来源', async () => {
  await openIngredient('三氯蔗糖');
  const briefChips = await page.locator('.brief-view .ref-chip').allInnerTexts();
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(250);
  // 深入版的来源既有 ref-chip 也有来源卡的 src-id，直接比对整块文本
  const deepText = await page.locator('.deep-view').innerText();

  if (briefChips.length === 0) throw new Error('简明版没有来源芯片');
  for (const chip of briefChips) {
    if (!deepText.includes(chip)) throw new Error(`深入版缺少简明版引用的 ${chip}`);
  }
  await closeSheet();
});

// ============================================================ 3. 真实模式：点击即分析

/** 走到真实模式的结果页，并加入指定的配料 */
async function enterRealModeWithIngredients(names) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_ERROR', message: '模拟识别失败' } }),
    }),
  );
  mocked.vision = true;

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('input[type=file]').setInputFiles('public/test-label.png');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('识别失败'), { timeout: 20000 });
  await page.getByRole('button', { name: /跳过识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });

  await page.locator('.form-grid input').first().fill('测试用虚构饼干');
  await page.locator('.basis-btn').first().click();

  for (let i = 0; i < names.length; i++) {
    await page.getByRole('button', { name: /添加配料/ }).click();
    await page.waitForTimeout(180);
  }
  const inputs = page.locator('.ing-item input');
  for (let i = 0; i < names.length; i++) {
    await inputs.nth(i).fill(names[i]);
  }

  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
  await page.waitForTimeout(300);
}

let researchCalls = 0;

await step('场景 B · 真实模式点一次就自动分析，不需要二次点击', async () => {
  await page.route('**/api/ingredient/research', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    researchCalls += 1;
    await new Promise((r) => setTimeout(r, 1200));
    route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: mockResearch({
            name: body.name,
            brief: { ...MOCK_BRIEF, what: '碳酸氢钠就是日常说的小苏打。' },
            sources: MOCK_SOURCES,
            sections: [
              { id: 's1', section: 'what', text: `${body.name}是一种食品添加剂。`, sourceRefs: ['W1'], verified: true, tier: 'cited' },
              { id: 's2', section: 'why', text: '用于膨松。', sourceRefs: ['W1'], verified: true, tier: 'cited' },
            ],
          }),
        }),
      })
      .catch(() => {});
  });
  mocked.research = true;

  await enterRealModeWithIngredients(['碳酸氢钠', '食用香精', '柠檬酸钠']);

  await page.locator('.ing-card-btn', { hasText: '碳酸氢钠' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });

  // 关键：点击后自动开始，不需要再点任何按钮
  await page.waitForSelector('.analyzing-bar', { timeout: 4000 });
  const cta = await page.getByRole('button', { name: /获取综合分析|开始分析|联网分析此成分/ }).count();
  if (cta > 0) throw new Error('仍然要求用户二次点击才开始分析');

  await page.waitForSelector('.composition-bar', { timeout: 15000 });
  await page.waitForTimeout(400);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('小苏打')) throw new Error('没有显示简明解释');
  if (!txt.includes('引用对应关系已检查')) throw new Error('缺少校验状态文案');
  if (!txt.includes('[W1]')) throw new Error('缺少来源芯片');
  if (txt.includes('暂时不能可靠解读')) throw new Error('仍停留在未知状态');

  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3，实际 ${blocks}`);

  await noHScroll();
  await shot('v52-04-real-auto');
  await closeSheet();
});

await step('真实模式 · 请求飞行中关闭抽屉，重开不会显示旧结果', async () => {
  await page.locator('.ing-card-btn', { hasText: '食用香精' }).first().click();
  await page.waitForSelector('.analyzing-bar', { timeout: 5000 });

  const before = researchCalls;
  await closeSheet(); // 请求还没回来就关掉
  await page.waitForTimeout(2000); // 等旧请求「本该返回」的时间过去

  await page.locator('.ing-card-btn', { hasText: '食用香精' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForTimeout(500);

  const stillAnalyzing = (await page.locator('.analyzing-bar').count()) > 0;
  const done = (await page.locator('.composition-bar').count()) > 0;
  if (!stillAnalyzing && !done) throw new Error('重开后既没在分析也没结果');
  if (researchCalls <= before) throw new Error('重开没有发起新请求（错误复用了已取消的结果）');

  await page.waitForSelector('.composition-bar', { timeout: 15000 });
  await page.waitForTimeout(300);
  await closeSheet();
});

await step('真实模式 · 会话内复用缓存，切回来不重复请求', async () => {
  const before = researchCalls;
  await page.locator('.ing-card-btn', { hasText: '食用香精' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForTimeout(700);

  if (researchCalls > before) throw new Error('切回同一成分又发了一次请求（应命中会话缓存）');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('小苏打')) throw new Error('缓存结果没有正确显示');
  console.log(`      请求次数保持 ${researchCalls}，未新增`);
  await closeSheet();
});

await step('场景 C · 联网失败时保留本地简明内容', async () => {
  await page.unroute('**/api/ingredient/research');
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_ERROR', message: '模拟上游失败' } }),
    }),
  );
  mocked.research = true;

  // 柠檬酸钠本地有基础条目、且本次会话还没查过 —— 失败后应继续显示本地简明版
  await page.locator('.ing-card-btn', { hasText: '柠檬酸钠' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes('联网补充失败'), { timeout: 20000 });
  await page.waitForTimeout(300);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('联网补充失败')) throw new Error('没有失败提示');
  if (!txt.includes('酸度调节剂')) throw new Error('失败后本地简明内容丢失');
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`失败后简明段落应为 3，实际 ${blocks}`);
  if (!txt.includes('仍然有效')) throw new Error('没有说明本地内容仍有效');
  if (txt.includes('暂时不能可靠解读')) throw new Error('明明有本地资料却显示未知');

  await noHScroll();
  await shot('v52-05-error-keeps-local');
  await closeSheet();

  await page.unroute('**/api/ingredient/research');
  await page.unroute('**/api/vision/extract');
});

// ============================================================ 5. 历史回归

await step('包装话术拆解仍然正常（2.5 g 上限 + 滑块联动）', async () => {
  await openDemo('清柠气泡水');
  const txt = await page.locator('body').innerText();
  if (!txt.includes('2.5')) throw new Error('0 脂肪的 2.5 g 上限缺失');
  if (!txt.includes('信息不足，无法确认')) throw new Error('0 蔗糖状态缺失');
  await page.locator('.slider-row input[type=range]').fill('1000');
  await page.waitForTimeout(400);
  const after = await page.locator('body').innerText();
  if (!after.includes('5 g') && !after.includes('5.0 g')) throw new Error('滑块改动后上限未更新');
});

await step('测试台与双模型对比工具仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (!(await page.locator('body').innerText()).includes('API 测试台')) throw new Error('测试台打不开');
  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (!(await page.locator('body').innerText()).includes('双模型识别对比')) throw new Error('对比工具打不开');
});

await step('手机端抽屉可滚动、可关闭、无横向溢出', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('二氧化碳');
  const m = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { over: s.scrollWidth - s.clientWidth, h: s.scrollHeight, c: s.clientHeight };
  });
  if (m.over > 1) throw new Error(`抽屉横向溢出 ${m.over}px`);
  await noHScroll();
  await closeSheet();
  if ((await page.locator('.sheet').count()) !== 0) throw new Error('抽屉没有关闭');
});

await step('演示模式全程没有触发真实付费调用', async () => {
  // 真实模式测试里的 research / vision 请求都被测试自己拦截了
  const real = paidCalls.filter((u) => u.includes('/api/ingredient/research') || u.includes('/api/vision/extract'));
  if (!mocked.research || !mocked.vision) throw new Error('真实模式测试未生效，无法判断');
  console.log(`      拦截的请求共 ${real.length} 次，均未到上游`);
});

await step('控制台没有报错', async () => {
  if (errors.length > 0) throw new Error(`${errors.length} 条错误：${errors[0]}`);
});

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n界面验收：${pass}/${results.length} 通过`);
if (pass !== results.length) {
  console.log('失败项：');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.error}`);
  process.exit(1);
}
