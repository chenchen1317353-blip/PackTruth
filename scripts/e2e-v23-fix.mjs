/**
 * PackTruth V2.3 验收修复 · 浏览器验收（离线，全部 Mock，不产生付费请求）。
 *
 * 与 e2e-v23 的区别：这次的截图和断言直接对应验收清单上的 12 项，
 * 特别是「首次截断 → 重试成功」「健康区块排在身份之前」「只有技术标准时的降级」
 * 「补充查找健康评估资料的费用提示与请求次数」。
 *
 * 真实联网与真实模型调用**没有发生**：所有 /api 响应都由 page.route 返回。
 */

import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  ACESULFAME_K,
  ACETIC_ACID,
  STANDARD_ONLY,
  buildReplayResearch,
} from './fixtures/v23-health.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-v23fix');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const from = m.location()?.url || '';
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(from)) return;
  errors.push(`console: ${m.text()}`);
});

/** 所有真正发到上游的请求（不应出现） */
const upstreamHits = [];
page.on('request', (r) => {
  const url = r.url();
  if (/api\.deepseek\.com|\/chat\/completions|\/tools\/search|\/tools\/fetch/.test(url)) {
    upstreamHits.push(url.slice(0, 120));
  }
});

const apiCalls = [];
page.on('request', (r) => {
  const url = r.url();
  if (url.includes('/api/')) apiCalls.push(new URL(url).pathname);
});

const results = [];
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(260);
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts }).catch(() => {});
};

async function step(name, fn) {
  process.stdout.write(`\n── ${name}\n`);
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('   ✓ 通过');
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`   ✗ 失败: ${e.message}`);
    await page
      .screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.png`), fullPage: true })
      .catch(() => {});
  }
}

async function setKey(key = 'test-key-not-real') {
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill(key);
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.waitForTimeout(150);
}

async function gotoHome() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(420);
  await setKey();
}

function visionOk({ parsed, requestId = 'A1B2C3', finishReason = 'stop', partial = false }) {
  return {
    ok: true,
    data: {
      parsed,
      partial,
      partialMissing: [],
      jsonParse: { ok: true, reason: null },
      finishReason,
      requestId,
      image: { width: 600, height: 800, mimeType: 'image/jpeg' },
      provider: 'deepseek-vision',
      model: 'mock-vision',
      durationMs: 900,
      usage: null,
    },
  };
}

const BASE_PARSED = (over = {}) => ({
  product_name: '山椒脆笋',
  net_content: '150g',
  ingredients_text: '饮用水、竹笋、食品添加剂（谷氨酸钠、柠檬酸）、食用香精香料',
  nutrition: {
    basis: 'per_100g',
    basis_text: '每 100 克',
    items: [
      { name: '能量', value: '105', unit: 'kJ', nrv_percent: '1' },
      { name: '钠', value: '1180', unit: 'mg', nrv_percent: '59' },
    ],
  },
  claims: [],
  brand: null,
  category: '酱腌菜',
  unreadable: [],
  notes: null,
  ...over,
});

/** 走「拍照识别」路径进入确认页 / 结果页 */
async function recognize({ parsed, onConfirm = true }) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({ json: visionOk({ parsed }) }),
  );
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(280);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  if (!onConfirm) return;
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(350);
  await page.unroute('**/api/vision/extract');
}

/**
 * 打开某个成分的抽屉。
 *
 * 括号里的具体成分渲染成 .ing-child-btn（可访问名是「查看 XX 的解释」），
 * 顶层配料是 .ing-card-btn。这里按 DOM 结构定位，避免依赖可访问名的匹配细节。
 */
async function openIngredient(name) {
  // 括号里的子成分默认折叠在 <details> 里，先像用户那样点开
  for (let guard = 0; guard < 6; guard += 1) {
    const closed = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(120);
  }
  const child = page.locator(`.ing-child-btn[aria-label*="${name}"]`);
  const card = page.locator('.ing-card-btn').filter({ hasText: name });
  if (await child.count()) await child.first().click();
  else if (await card.count()) await card.first().click();
  else throw new Error(`结果页找不到成分：${name}`);
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(700);
}

await gotoHome();

// ---------------------------------------------------------------- A 首次截断 → 重试

await step('A · 首次识别被长度上限截断 → 编号与照片保留 → 用户重试成功（只发 2 次）', async () => {
  apiCalls.length = 0;
  let call = 0;
  await page.route('**/api/vision/extract', async (route) => {
    call += 1;
    await new Promise((r) => setTimeout(r, 200));
    if (call === 1) {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            parsed: null,
            partial: false,
            partialMissing: ['ingredients_text', 'nutrition'],
            jsonParse: { ok: false, reason: 'NO_RECOVERABLE_FIELDS' },
            finishReason: 'length',
            recovery: { used: false, complete: false, recoveredKeys: [], truncatedKey: 'ingredients_text', missing: ['ingredients_text', 'nutrition'] },
            requestId: '007942',
            image: { width: 600, height: 800, mimeType: 'image/jpeg' },
          },
        },
      });
      return;
    }
    await route.fulfill({ json: visionOk({ parsed: BASE_PARSED(), requestId: 'D4E5F6' }) });
  });

  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(280);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForSelector('.alert.error', { timeout: 10000 });

  const errText = await page.locator('.alert.error').innerText();
  if (!errText.includes('长度上限截断')) throw new Error(`失败原因没有指向截断：${errText}`);
  if (!errText.includes('007942')) throw new Error(`失败提示里没有识别编号：${errText}`);
  if (!(await page.getByRole('button', { name: /重试一次/ }).count())) throw new Error('缺少重试入口');
  if (!(await page.getByRole('button', { name: /手动填写/ }).count())) throw new Error('缺少手动填写入口');
  await shot('A1-truncated-390');

  await page.getByRole('button', { name: /重试一次/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.waitForTimeout(300);
  const visionCalls = apiCalls.filter((u) => u.includes('/vision/extract')).length;
  if (visionCalls !== 2) throw new Error(`识别请求应为 2 次（一次失败 + 一次用户重试），实际 ${visionCalls}`);
  await shot('A2-retry-ok-390', { fullPage: true });
  await page.unroute('**/api/vision/extract');
});

// ---------------------------------------------------------------- B 长配料表

const LONG_TEXT = [
  '小麦粉',
  '棕榈油',
  '白砂糖',
  '食用盐',
  '麦芽糊精',
  '谷朊粉',
  '酵母提取物',
  '香辛料',
  '食品添加剂（碳酸钠、碳酸钾、三聚磷酸钠、六偏磷酸钠、焦磷酸二氢二钠）',
  '复配酸度调节剂（柠檬酸、乳酸、苹果酸、冰乙酸、柠檬酸钠）',
  '食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、琥珀酸二钠、酵母抽提物）',
  '食品添加剂（黄原胶、瓜尔胶、羧甲基纤维素钠、海藻酸钠、卡拉胶）',
  '食品添加剂（山梨酸钾、脱氢乙酸钠、乳酸链球菌素、丙酸钙）',
  '食品添加剂（三氯蔗糖、安赛蜜、阿斯巴甜、甜菊糖苷、赤藓糖醇）',
  '食品添加剂（焦糖色、日落黄、柠檬黄、胭脂红、亮蓝）',
  '食品添加剂（特丁基对苯二酚、丁基羟基茴香醚、二丁基羟基甲苯、抗坏血酸钠）',
  '食品添加剂（二氧化硅、磷酸氢钙、硫酸钙、氯化钙）',
  '复合调味料（牛肉粉、鸡肉粉、洋葱粉、蒜粉、黑胡椒粉、辣椒粉、花椒粉、姜粉）',
  '食用香精香料（食用香料、天然香料、合成香料）',
  '营养强化剂（维生素 B1、维生素 B2、烟酸、叶酸、硫酸亚铁、氧化锌）',
  '麦麸',
  '燕麦粉',
  '玉米淀粉',
  '马铃薯淀粉',
  '大豆分离蛋白',
  '乳清蛋白粉',
  '全脂乳粉',
  '食用葡萄糖',
  '果葡糖浆',
  '蜂蜜',
  '芝麻',
  '花生碎',
  '核桃仁',
  '南瓜籽',
  '葵花籽仁',
  '蔓越莓干',
  '葡萄干',
  '椰蓉',
  '可可粉',
  '速溶咖啡粉',
  '抹茶粉',
  '食用酒精',
  '饮用水',
  '浓缩苹果汁',
  '柠檬汁',
  '番茄粉',
  '胡萝卜粉',
  '菠菜粉',
  '海苔碎',
  '虾粉',
  '鱼露',
  '蚝油',
  '酱油粉',
  '食醋粉',
  '料酒',
  '味精',
  '鸡精调味料',
  '骨汤',
].join('、');

await step('B · 60 项长配料表 + 多层括号：一次识别、结构完整、不判截断', async () => {
  await gotoHome();
  await recognize({
    parsed: BASE_PARSED({
      product_name: '长配料测试饼干',
      ingredients_text: LONG_TEXT,
      nutrition: {
        basis: 'per_100g',
        basis_text: '每 100 克',
        items: Array.from({ length: 18 }, (_, i) => ({
          name: `营养素${i + 1}`,
          value: String(1 + i),
          unit: 'g',
          nrv_percent: String(i),
        })),
      },
    }),
    onConfirm: false,
  });

  if (await page.locator('.partial-notice').count()) throw new Error('完整输出却被标记为截断');
  const items = await page.locator('.ing-item-wrap').count();
  if (items < 55) throw new Error(`配料项数偏少：${items}`);
  const values = await page.evaluate(() =>
    [...document.querySelectorAll('.confirm-page input, .confirm-page textarea')].map((el) => el.value),
  );
  const all = values.join('\n');
  if (!all.includes('复配酸度调节剂')) throw new Error('缺少类别型父级配料');
  if (!all.includes('冰乙酸')) throw new Error('缺少括号内的具体成分');
  await shot('B-long-label-390', { fullPage: true });
});

// ---------------------------------------------------------------- 健康回放

const ACE = buildReplayResearch(ACESULFAME_K, {
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '乙酰磺胺酸钾（INS 950）' },
});
const ACETIC = buildReplayResearch(ACETIC_ACID, {
  identity: { type: 'additive', label: '食品添加剂 · 酸度调节剂', note: '乙酸（INS 260）' },
});
const ONLY_STD = buildReplayResearch(STANDARD_ONLY, {
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '乙酰磺胺酸钾' },
});

async function withResearch(payload, ingredient, ingredientsText, fn) {
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: payload } }),
  );
  await gotoHome();
  await recognize({ parsed: BASE_PARSED({ ingredients_text: ingredientsText }) });
  await openIngredient(ingredient);
  await fn();
  await page.unroute('**/api/ingredient/research');
}

await step('C · 安赛蜜：健康结论排在身份之前，能展开看到所引原文，不出现 PKU', async () => {
  await withResearch(
    ACE,
    '安赛蜜',
    '饮用水、食品添加剂（安赛蜜、柠檬酸）、食用香精香料',
    async () => {
      const order = await page.evaluate(() => {
        const body = document.querySelector('.sheet-body');
        const health = document.querySelector('.health-block');
        const firstBrief = document.querySelector('.brief-block');
        if (!body || !health || !firstBrief) return null;
        const pos = health.compareDocumentPosition(firstBrief);
        return {
          hasHealth: true,
          // DOCUMENT_POSITION_FOLLOWING = 4 → brief 在 health 之后
          healthFirst: Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING),
          text: health.innerText,
        };
      });
      if (!order) throw new Error('没有找到健康区块');
      if (!order.healthFirst) throw new Error('健康区块没有排在身份解释之前');
      const t = order.text;
      if (!/15 mg\/kg/.test(t)) throw new Error(`健康区没有 ADI：${t}`);
      if (/苯丙酮尿症|PKU/.test(t)) throw new Error('安赛蜜上出现了阿斯巴甜才有的 PKU 提示');
      if (!/权威评估直接支持/.test(t)) throw new Error('缺少证据状态标注');

      await page.locator('.health-meta > summary').first().click();
      await page.waitForTimeout(250);
      const quote = await page.locator('.health-quote').first().innerText();
      // 大字结论优先采用 EFSA 再评估；展开后必须是它的原文
      if (!/below the ADI|no safety concern/i.test(quote)) {
        throw new Error(`原文摘句不对：${quote}`);
      }
      const src = await page.locator('.health-quote-src').first().innerText();
      if (!/W3/.test(src)) throw new Error(`原文来源编号不对：${src}`);

      await shot('C-acesulfame-390');
      await page.locator('.sheet-body').evaluate((el) => el.scrollTo(0, 0));
      await shot('C-acesulfame-top-390');
    },
  );
});

await step('D · 冰乙酸：not limited 的术语说清楚，不列疾病清单', async () => {
  await withResearch(
    ACETIC,
    '冰乙酸',
    '饮用水、竹笋、食品添加剂（冰乙酸、柠檬酸）、食用香精香料',
    async () => {
      const text = await page.locator('.health-block').innerText();
      if (!text.includes('2004')) throw new Error(`缺少评估年份：${text}`);
      if (!text.includes('not limited')) throw new Error(`没有解释 not limited：${text}`);
      if (/苯丙酮尿症|孕妇|婴幼儿|肾病|糖尿病/.test(text)) throw new Error('无依据地点名了人群');
      if (/无限量|想吃多少/.test(text)) throw new Error('把 not limited 说成了无限量');
      const brief = await page.locator('.brief-view').innerText();
      if (/所以.*(安全|没问题)/.test(brief)) throw new Error('用法规事实冒充了健康结论');
      await shot('D-acetic-390');
    },
  );
});

await step('E · 只有技术标准：自动补搜后仍无健康资料 → 一句缺口说明，无需再点', async () => {
  let researchCalls = 0;
  const bodies = [];
  await page.route('**/api/ingredient/research', async (route) => {
    researchCalls += 1;
    bodies.push(route.request().postDataJSON());
    await new Promise((r) => setTimeout(r, 250));
    await route.fulfill({ json: { ok: true, data: ONLY_STD } });
  });

  await gotoHome();
  await recognize({ parsed: BASE_PARSED({ ingredients_text: '饮用水、食品添加剂（安赛蜜）、食用香精香料' }) });
  await openIngredient('安赛蜜');

  const empty = await page.locator('.health-empty').innerText();
  // 只有技术标准时，健康区只留一句说明，并说明已经检索过几轮
  if (!/轮检索都没有取得/.test(empty)) throw new Error(`缺口说明不对：${empty}`);
  if (empty.includes('GB 2760')) throw new Error('把标准编号写进了健康区');
  if (!empty.includes('身份与用途')) throw new Error('没有说明保留了什么');
  if (await page.getByRole('button', { name: /补充查找/ }).count()) {
    throw new Error('仍存在需要额外点击的补查入口');
  }
  if (researchCalls !== 1) throw new Error(`打开成分应只发 1 次研究请求，实际 ${researchCalls}`);
  const body = bodies[0] || {};
  if (body.supplement || body.priorSources) throw new Error('请求里仍带补查字段');

  // 自动提示写在点击前的说明里：最多两轮、费用由用户承担
  const hint = await page.locator('.auto-note').innerText().catch(() => '');
  await shot('E1-health-gap-390');
  await page.unroute('**/api/ingredient/research');
});

await step('F · 预算与费用说明常驻：抽屉页脚 + AI 设置', async () => {
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: ACETIC } }),
  );
  await gotoHome();
  await recognize({ parsed: BASE_PARSED({ ingredients_text: '饮用水、食品添加剂（冰乙酸）、食用香精香料' }) });
  await openIngredient('冰乙酸');
  const foot = await page.locator('.research-foot').innerText();
  if (!/最多使用 5 轮联网检索/.test(foot)) throw new Error(`页脚没有预算说明：${foot}`);
  if (!/DeepSeek 账户[^\n]{0,20}承担/.test(foot)) throw new Error(`页脚没有费用说明：${foot}`);
  await shot('F-cost-note-390');
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  const dlg = await page.locator('.ai-settings-dialog').innerText();
  if (!/最多 5 轮检索/.test(dlg)) throw new Error(`设置里没有预算说明：${dlg.slice(0, 120)}`);
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.unroute('**/api/ingredient/research');
});

// ---------------------------------------------------------------- 布局

await step('G · 360 / 768 / 1280：抽屉不横向溢出，健康区不被裁切', async () => {
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: ACETIC } }),
  );
  const widths = [360, 768, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
    await gotoHome();
    await recognize({ parsed: BASE_PARSED({ ingredients_text: '饮用水、食品添加剂（冰乙酸）、食用香精香料' }) });
    await openIngredient('冰乙酸');
    const overflow = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet-body');
      const inner = document.querySelector('.health-block');
      if (!sheet || !inner) return { ok: false, reason: 'missing' };
      return {
        ok: sheet.scrollWidth <= sheet.clientWidth + 1,
        sheetScroll: sheet.scrollWidth,
        sheetClient: sheet.clientWidth,
        innerRight: inner.getBoundingClientRect().right,
        viewport: window.innerWidth,
      };
    });
    if (!overflow.ok) throw new Error(`${width}px 横向溢出：${JSON.stringify(overflow)}`);
    await shot(`G-${width}`, { fullPage: false });
    await page.getByRole('button', { name: '关闭' }).click();
    await page.unroute('**/api/ingredient/research');
    await page.route('**/api/ingredient/research', (route) =>
      route.fulfill({ json: { ok: true, data: ACETIC } }),
    );
  }
  await page.unroute('**/api/ingredient/research');
  await page.setViewportSize({ width: 390, height: 844 });
});

// ---------------------------------------------------------------- 收尾

if (upstreamHits.length) {
  console.log(`\n⚠ 出现了真实上游请求：${upstreamHits.join(', ')}`);
}
if (errors.length) {
  console.log(`\n⚠ 页面错误 ${errors.length} 条`);
  errors.slice(0, 5).forEach((e) => console.log(`   ${e}`));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n浏览器验收：${results.length - failed.length} 通过 / ${failed.length} 失败`);
console.log(`真实上游请求：${upstreamHits.length} 次`);
console.log(`页面报错：${errors.length} 条`);

await browser.close();
process.exit(failed.length === 0 && upstreamHits.length === 0 ? 0 : 1);
