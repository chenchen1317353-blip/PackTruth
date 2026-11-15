/**
 * PackTruth V2.3 浏览器验收（离线，全部 Mock，不产生付费请求）。
 *
 * 场景：
 *   A 第一次识别返回无效内容 → 保留照片与编号 → 用户重试 → 成功
 *   B 冰乙酸：第一眼不是 GB 编号，健康结论有依据
 *   C 安赛蜜：不同甜味剂不混淆；含阿斯巴甜的盐类才提示苯丙酮尿症
 *   D 资料有限：保留身份与用途，健康区如实说明
 *   E 360 / 390 / 768 / 1280：健康区不挤坏布局
 */

import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { validateHealthInsights } from '../src/domain/evidence/healthGuard.js';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-v23');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const from = m.location()?.url || '';
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(from)) return;
  errors.push(`console: ${m.text()}`);
});

const apiHits = [];
const externalHits = [];
page.on('request', (r) => {
  const url = r.url();
  if (url.includes('/api/')) apiHits.push(`${r.method()} ${new URL(url).pathname}`);
  // 只关心「真实的模型/搜索上游」；字体 CDN（jsdelivr）不算 API 调用
  if (/api\.deepseek\.com|\/chat\/completions|\/tools\/search|\/tools\/fetch/.test(url)) {
    externalHits.push(url.slice(0, 120));
  }
});

const results = [];
const shot = async (name, target = page, fullPage = false) => {
  await page.waitForTimeout(220);
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await target.screenshot({ path: join(OUT, `${name}.png`), fullPage }).catch(() => {});
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
    await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`), fullPage: true }).catch(() => {});
  }
}

async function setKey(key = 'test-key-not-real') {
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill(key);
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.waitForTimeout(150);
}

/**
 * 每次回到首页都要重新填一次 Key：BYOK 凭据只存在页面内存里，
 * 整页导航（goto）会清空它，这是产品设计如此。
 */
async function gotoHome() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await setKey();
}

/**
 * 用「拍照识别」路径进入结果页（不是演示样品）。
 *
 * 演示样品走的是离线预录分支，不会请求 /api/ingredient/research，
 * 也就测不到真实的成分研究链路。这里用 Mock 的识别结果造一条真实记录。
 */
async function openPhotoRecord({ productName = '山椒脆笋', category = '酱腌菜', ingredientsText }) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          parsed: {
            product_name: productName,
            brand: null,
            category,
            net_content: '150g',
            ingredients_text: ingredientsText,
            ingredients: [],
            nutrition: {
              basis: 'per_100g',
              basis_text: '每 100 克',
              items: [{ name: '能量', value: '105', unit: 'kJ' }],
            },
          },
          partial: false,
          jsonParse: { ok: true, reason: null },
          finishReason: 'stop',
          requestId: 'ABCDEF',
          image: { width: 600, height: 800, mimeType: 'image/jpeg' },
          provider: 'deepseek-vision',
          model: 'mock-vision',
          durationMs: 800,
          usage: null,
        },
      },
    }),
  );

  await gotoHome();
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(400);
  await page.unroute('**/api/vision/extract');
}

// ---------------------------------------------------------------- 测试素材

const SOURCES = {
  ice: [
    {
      id: 'K2',
      title: 'GB 2760-2024 附录 D 食品添加剂功能类别',
      organization: '国家卫生健康委员会',
      sourceType: 'verified_local',
      url: 'https://gb2760.cfsa.net.cn/func.html',
      excerpt: 'D.1 酸度调节剂：用以维持或改变食品酸碱度的物质。',
    },
    {
      id: 'W3',
      title: 'JECFA 乙酸评估（INS 260）',
      organization: 'WHO / JECFA',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/',
      excerpt:
        'ACETIC ACID (INS 260). The group ADI "not limited" for acetic acid and its potassium and sodium salts, established in 1973, was maintained. Evaluation 2004: no safety concern at current levels of intake when used as a flavouring agent. 冰乙酸即无水乙酸，食品级产品按酸度调节剂使用。',
    },
  ],
  ace: [
    {
      id: 'W1',
      title: '安赛蜜（乙酰磺胺酸钾）评估摘要',
      organization: 'WHO / JECFA',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/',
      excerpt:
        '安赛蜜（乙酰磺胺酸钾，acesulfame potassium）的每日允许摄入量（ADI）为 0–15 mg/kg bw，由 JECFA 第 37 次会议（1990）确立；安赛蜜在人体内不被代谢。',
    },
    {
      id: 'W4',
      title: 'JECFA 规格：天门冬酰苯丙氨酸甲酯乙酰磺胺酸（INS 962）',
      organization: 'WHO / JECFA',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/',
      excerpt:
        'Aspartame-acesulfame salt (INS 962). The ADIs for aspartame (0-40 mg/kg bw) and for acesulfame K (0-15 mg/kg bw) cover the aspartame and acesulfame moieties of the salt.',
    },
    {
      id: 'W2',
      title: '含阿斯巴甜食品的标签要求',
      organization: 'Health Canada',
      sourceType: 'fetch_content',
      url: 'https://inspection.canada.ca/en/food-labels/labelling/industry/sweeteners',
      excerpt:
        'The label of a food sweetened with aspartame must include a statement warning individuals with phenylketonuria (PKU) that the food contains phenylalanine.',
    },
  ],
};

function researchPayload({ name, identity, brief, sections, sources, healthRaw }) {
  const health = validateHealthInsights({
    raw: healthRaw,
    evidenceSet: sources,
    ingredientName: name,
  });
  if (healthRaw && !health.insights) {
    throw new Error(`健康信息没有通过检查：${health.rejected.map((r) => r.rejectReason).join('; ')}`);
  }
  if (healthRaw && Object.keys(health.insights || {}).length !== Object.keys(healthRaw).length) {
    throw new Error('有健康条目被拒绝，检查测试素材');
  }
  const answerOf = (slot) => {
    if (health.insights?.[slot]) return { status: 'answered' };
    const rej = health.rejected.find((r) => r.slot === slot);
    if (rej) return { status: 'rejected', reason: rej.rejectReason };
    return { status: 'no_evidence' };
  };
  const healthAnswers = {
    normalIntake: answerOf('normalIntake'),
    highIntake: answerOf('highIntake'),
    sensitiveGroups: answerOf('sensitiveGroups'),
  };
  const healthUnanswered = ['normalIntake', 'highIntake', 'sensitiveGroups'].filter(
    (k) => healthAnswers[k].status !== 'answered',
  );
  return {
    status: 'ok',
    composition: 'mixed',
    ingredient: name,
    localMatched: true,
    query: `${name} 食品安全 评估`,
    sources,
    evidenceStats: { total: sources.length },
    identity: { type: identity.type, label: identity.label, note: identity.note },
    brief: { ...brief, sourceRefs: brief.sourceRefs, verified: true, tier: 'cited' },
    sections: sections.map((s, i) => ({
      id: `s${i + 1}`,
      section: s.section,
      text: s.text,
      sourceRefs: s.sourceRefs,
      limitations: null,
      verified: true,
      tier: 'cited',
      scientificCheck: { status: 'pass', issues: [] },
    })),
    rejectedSections: [],
    healthInsights: health.insights,
    healthSchema: 2,
    healthRejected: health.rejected,
    healthStats: health.stats,
    healthStatus: health.insights ? 'available' : 'unavailable',
    healthAnswers,
    healthUnanswered,
    healthCoverage: { available: Boolean(healthRaw), evidenceIds: [] },
    healthRoundUsed: true,
    notes: [],
    retrievedAt: new Date().toISOString(),
    cached: false,
    chat: { model: 'mock', usage: null, durationMs: 10 },
    timings: {},
    totalMs: 10,
  };
}

const ICE = researchPayload({
  name: '冰乙酸',
  identity: { type: 'additive', label: '食品添加剂 · 酸度调节剂', note: 'GB 2760 附录 D' },
  brief: {
    what: '冰乙酸就是浓度很高的乙酸，食品里用的是食品级产品。',
    why: '在酱腌菜这类食品里用来调节酸度、提供酸味。',
    howToUnderstand: '浓原液有腐蚀性，说的是未稀释的高浓度产品；食品里用的是稀释后的少量添加。',
    sourceRefs: ['K2', 'W3'],
  },
  sections: [
    { section: 'what', text: '冰乙酸即无水乙酸，食品级产品按酸度调节剂使用。', sourceRefs: ['W3'] },
    { section: 'misconception', text: '浓原液的腐蚀性不等于食品里那点酸度的危害。', sourceRefs: ['W3'] },
    { section: 'limits', text: '我国有专门的食品添加剂国家标准 GB 1886.10—2015，规定冰乙酸的技术要求。', sourceRefs: ['K2'] },
  ],
  sources: SOURCES.ice,
  healthRaw: {
    // 「not limited」是术语状态，只能当参考值；大字结论用 2004 年的物质评估
    practicalTakeaway: {
      text: 'JECFA 在 2004 年的评估认为，乙酸作为调味剂在当前摄入水平下没有安全关切。',
      evidenceStatus: 'authoritative',
      sourceRefs: ['W3'],
      quote: 'no safety concern at current levels of intake when used as a flavouring agent',
      conditions: '作为调味剂使用时的当前摄入水平',
      sourceYear: '2004',
    },
    highIntake: {
      text: '组 ADI「not limited」指未设数值上限，不等于可以当作饮用水大量饮用。',
      evidenceStatus: 'authoritative',
      sourceRefs: ['W3'],
      quote:
        'The group ADI "not limited" for acetic acid and its potassium and sodium salts, established in 1973, was maintained',
      conditions: '术语解释；不等于没有使用边界',
    },
  },
});

const ACE = researchPayload({
  name: '安赛蜜',
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '乙酰磺胺酸钾' },
  brief: {
    what: '安赛蜜又叫乙酰磺胺酸钾，是一种高倍甜味剂。',
    why: '用来给饮料、酱菜这类食品提供甜味，用量很小。',
    howToUnderstand: '它不提供能量，也不在人体内代谢；和糖不是一回事。',
    sourceRefs: ['W1'],
  },
  sections: [
    { section: 'what', text: '安赛蜜的化学名是乙酰磺胺酸钾，甜度约为蔗糖的 200 倍。', sourceRefs: ['W1'] },
    { section: 'limits', text: '配料表不标注实际添加量，无法据此推算摄入量。', sourceRefs: ['W1'] },
  ],
  sources: SOURCES.ace,
  healthRaw: {
    practicalTakeaway: {
      text: 'JECFA 的评估认为，安赛蜜按 0–15 mg/kg 体重的 ADI 使用时没有可觉察的健康风险。',
      evidenceStatus: 'authoritative',
      sourceRefs: ['W1'],
      quote: '安赛蜜（乙酰磺胺酸钾，acesulfame potassium）的每日允许摄入量（ADI）为 0–15 mg/kg bw',
      sourceYear: '1990',
    },
  },
});

const SALT = researchPayload({
  name: '天门冬酰苯丙氨酸甲酯乙酰磺胺酸',
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '阿斯巴甜-安赛蜜盐（INS 962）' },
  brief: {
    what: '它是阿斯巴甜与安赛蜜形成的一种混合甜味剂。',
    why: '在食品里提供甜味，同时改善单一甜味剂的口感。',
    howToUnderstand: '它不是安赛蜜本身，也不是阿斯巴甜本身；两者各自的评估覆盖这个盐里的对应部分。',
    sourceRefs: ['W4'],
  },
  sections: [
    { section: 'what', text: '阿斯巴甜-安赛蜜盐（INS 962）由阿斯巴甜与安赛蜜两种成分构成。', sourceRefs: ['W4'] },
    { section: 'limits', text: '标准里的折算系数是使用量核算规则，不代表健康风险。', sourceRefs: ['W4'] },
  ],
  sources: SOURCES.ace,
  healthRaw: {
    // 身份差异（「它不是安赛蜜本身」）属于 brief，不进 healthInsights ——
    // 这类句子正是本轮要清出健康区的「名词差异」。
    sensitiveGroups: {
      text: '含阿斯巴甜成分的食品，标签需要提醒苯丙酮尿症（PKU）患者注意苯丙氨酸。',
      evidenceStatus: 'authoritative',
      // W4 证明这个盐含阿斯巴甜组分，W2 是标签提示要求
      sourceRefs: ['W4', 'W2'],
      quote:
        'The label of a food sweetened with aspartame must include a statement warning individuals with phenylketonuria (PKU)',
    },
  },
});

// ---------------------------------------------------------------- 场景

await gotoHome();

await step('A · 第一次识别无效 → 保留照片与编号 → 重试成功', async () => {
  apiHits.length = 0;
  let call = 0;
  await page.route('**/api/vision/extract', async (route) => {
    call += 1;
    await new Promise((r) => setTimeout(r, 300));
    if (call === 1) {
      await route.fulfill({
        json: {
          ok: true,
          data: {
            parsed: null,
            partial: false,
            jsonParse: { ok: false, reason: 'INVALID_JSON' },
            finishReason: 'stop',
            requestId: 'A1B2C3',
            image: { width: 600, height: 800, mimeType: 'image/jpeg' },
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        ok: true,
        data: {
          parsed: {
            product_name: '山椒脆笋',
            brand: null,
            category: '酱腌菜',
            net_content: '150g',
            ingredients_text: '饮用水、竹笋、食品添加剂（谷氨酸钠、柠檬酸）、食用香精香料',
            ingredients: [],
            nutrition: { basis: 'per_100g', basis_text: '每 100 克', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
          },
          partial: false,
          jsonParse: { ok: true, reason: null },
          finishReason: 'stop',
          requestId: 'D4E5F6',
          image: { width: 600, height: 800, mimeType: 'image/jpeg' },
          provider: 'deepseek-vision',
          model: 'mock-vision',
          durationMs: 900,
          usage: null,
        },
      },
    });
  });

  await gotoHome();
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForSelector('.alert.error', { timeout: 10000 });

  const errText = await page.locator('.alert.error').innerText();
  if (!errText.includes('A1B2C3')) throw new Error(`失败提示里没有识别编号：${errText}`);
  if (!/不是完整的 JSON/.test(errText)) throw new Error(`失败原因不准确：${errText}`);
  // 照片还在，可以直接重试
  if (!(await page.getByRole('button', { name: /重试一次/ }).count())) throw new Error('缺少重试入口');
  await shot('A-error-390');

  await page.getByRole('button', { name: /重试一次/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.waitForTimeout(300);
  const okText = await page.locator('body').innerText();
  if (!okText.includes('确认识别结果')) throw new Error('重试后没有进入确认页');
  if (!okText.includes('括号内的具体成分')) throw new Error('重试后的子配料丢失');
  const nameValue = await page.locator('.confirm-page input').first().inputValue();
  if (!nameValue.includes('山椒脆笋')) throw new Error(`识别结果没有带过来：${nameValue}`);

  const visionCalls = apiHits.filter((u) => u.includes('/vision/extract')).length;
  if (visionCalls !== 2) throw new Error(`识别请求次数应为 2（用户主动重试），实际 ${visionCalls}`);
  await shot('A-recovered-390', page, true);
  await page.unroute('**/api/vision/extract');
});

async function researchScenario(name, payload, ingredient, ingredientsText) {
  await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: payload } }));
  await openPhotoRecord({ ingredientsText });
  await page.getByRole('button', { name: new RegExp(ingredient) }).first().click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(800);
  return name;
}

await step('B · 冰乙酸：第一眼不是标准编号，健康结论可追溯', async () => {
  await researchScenario('冰乙酸', ICE, '冰乙酸', '饮用水、竹笋、冰乙酸、食用香精香料');
  const sheet = await page.locator('.sheet').innerText();
  if (!sheet.includes('健康上需要知道什么')) throw new Error('缺少健康区块');
  const headline = await page.locator('.health-headline').innerText();
  if (/GB\s?\d/.test(headline)) throw new Error(`健康结论里出现标准编号：${headline}`);
  if (/腐蚀|灼伤/.test(headline)) throw new Error('把浓原液危险写进主要结论');
  if (!/JECFA/.test(headline)) throw new Error(`结论没有来源主体：${headline}`);
  await shot('B-ice-acetic-390', page.locator('.sheet'));

  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(400);
  // 有健康结论时，深入分析不再放一张同样醒目的「核心结论」
  if (await page.locator('.deep-core').count()) {
    throw new Error('深入分析仍有一张核心结论大卡片');
  }
  const deep = await page.locator('.deep-view').innerText();
  if (!deep.includes('这个成分是什么')) throw new Error('深入分析内容缺失');
  await shot('B-ice-acetic-core-390', page.locator('.deep-view'));
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
  await page.unroute('**/api/ingredient/research');
});

await step('C · 安赛蜜：不与盐类混淆，折算系数不当风险', async () => {
  await researchScenario('安赛蜜', ACE, '安赛蜜', '饮用水、竹笋、安赛蜜、食用香精香料');
  const sheet = await page.locator('.sheet').innerText();
  if (!/乙酰磺胺酸钾/.test(sheet)) throw new Error('没有说明安赛蜜的化学名');
  if (/苯丙酮尿症/.test(sheet)) throw new Error('把阿斯巴甜的人群提示安到了安赛蜜头上');
  if (/折算系数[^。]{0,12}(风险|安全)/.test(sheet)) throw new Error('把折算系数说成风险指标');
  await shot('C-acesulfame-390', page.locator('.sheet'));
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
  await page.unroute('**/api/ingredient/research');

  // 盐类：含阿斯巴甜组分，才提示苯丙酮尿症
  await researchScenario('盐', SALT, '天门冬酰苯丙氨酸甲酯乙酰磺胺酸', '饮用水、竹笋、天门冬酰苯丙氨酸甲酯乙酰磺胺酸');
  const saltSheet = await page.locator('.sheet').innerText();
  if (!saltSheet.includes('苯丙酮尿症')) throw new Error('含阿斯巴甜的盐类没有提示苯丙酮尿症');
  if (!/不是安赛蜜本身|两种成分/.test(saltSheet)) throw new Error('没有区分盐与单一甜味剂');
  await shot('C-aspartame-salt-390', page.locator('.sheet'));
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
  await page.unroute('**/api/ingredient/research');
});

await step('D · 资料有限：保留身份与用途，健康区如实说明', async () => {
  const limited = {
    ...ICE,
    ingredient: '食用香精香料',
    identity: { type: 'uncertain', label: '当前资料不足以确定', note: null },
    brief: {
      what: '食用香精香料是配料表里的类别写法，指用来提供香气的原料。',
      why: '这类原料通常用来补充或还原食品的香气。',
      howToUnderstand: '只写类别时标签没有告诉我们具体成分，不能凭常识补全。',
      sourceRefs: ['K2'],
    },
    sections: [
      { id: 's1', section: 'what', text: '食用香精香料是类别写法，不代表某一种具体物质。', sourceRefs: ['K2'], verified: true, scientificCheck: { status: 'pass' } },
    ],
    healthInsights: null,
    healthStatus: 'unavailable',
    healthStats: { offered: 0, accepted: 0, rejected: 0 },
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false, evidenceIds: [] },
    healthRoundUsed: true,
  };
  await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: limited } }));
  await openPhotoRecord({ ingredientsText: '饮用水、竹笋、食用香精香料' });
  await page.getByRole('button', { name: /食用香精香料/ }).first().click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(700);
  const sheet = await page.locator('.sheet').innerText();
  if (!sheet.includes('类别写法')) throw new Error('没有解释这是类别写法');
  if (!/健康评估资料|健康资料/.test(sheet)) throw new Error('缺少对健康资料不足的说明');
  if (/苯丙酮尿症|肾病患者|致癌/.test(sheet)) throw new Error('资料不足时编造了健康结论');
  await shot('D-limited-390', page.locator('.sheet'));
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(200);
  await page.unroute('**/api/ingredient/research');
});

await step('E · 360/390/768/1280：健康区不挤坏布局', async () => {
  await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: ICE } }));
  await openPhotoRecord({ ingredientsText: '饮用水、竹笋、冰乙酸' });
  await page.getByRole('button', { name: /冰乙酸/ }).first().click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(600);

  for (const w of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) throw new Error(`${w}px 出现横向溢出：${over}`);
    const box = await page.locator('.health-block').boundingBox();
    if (!box || box.width > w) throw new Error(`${w}px 健康区块超出视口`);
    if (w === 360) await shot('E-360', page.locator('.sheet'));
    if (w === 1280) await shot('E-1280', page.locator('.sheet'));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.unroute('**/api/ingredient/research');
});

await step('F · 全程没有真实上游调用', async () => {
  const external = externalHits.filter((u) => !u.includes('localhost'));
  if (external.length) throw new Error(`出现了真实上游请求：${external.join(', ')}`);
  // 识别 2 次（失败 + 用户主动重试），成分研究各 1 次，全部由 route 拦截
  const vision = apiHits.filter((u) => u.includes('/vision/extract')).length;
  if (vision !== 7) throw new Error(`识别请求次数异常：${vision}`);
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 3) : '无');
console.log(`\nV2.3 界面验收：${results.filter((r) => r.ok).length}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.error}`}`);

await browser.close();
if (results.some((r) => !r.ok) || errors.length) process.exit(1);
