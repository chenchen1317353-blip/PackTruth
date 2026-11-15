/**
 * PackTruth 健康科普全局整改 · 浏览器验收（离线，全部 Mock，无付费请求）。
 *
 * 对应验收清单第九节的四类结果：
 *   A 乙二胺四乙酸二钠（EDTA 二钠）
 *   B 焦亚硫酸钠（亚硫酸盐敏感人群）
 *   C 冰乙酸（正常膳食使用）
 *   D 食用香精（证据有限，不编造）
 *
 * 另加：手机端、来源展开、成分切换、长配料名。
 */

import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { HEALTH_CASES } from './fixtures/health-cases.mjs';
import { ACESULFAME_K, buildReplayResearch } from './fixtures/v23-health.mjs';
import { GENERAL_CASES } from './fixtures/health-general.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-health-12');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const from = m.location()?.url || '';
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(from)) return;
  errors.push(`console: ${m.text()}`);
});
const upstream = [];
page.on('request', (r) => {
  if (/api\.deepseek\.com|\/chat\/completions|\/tools\/search|\/tools\/fetch/.test(r.url())) upstream.push(r.url());
});

const results = [];
const shot = async (name) => {
  await page.waitForTimeout(260);
  await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
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
    await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.png`) }).catch(() => {});
  }
}

async function setKey() {
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.waitForTimeout(150);
}
async function gotoHome() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(420);
  await setKey();
}

function parsed(ingredientsText) {
  return {
    product_name: '山椒脆笋',
    net_content: '150g',
    ingredients_text: ingredientsText,
    nutrition: { basis: 'per_100g', basis_text: '每 100 克', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
    claims: [],
    brand: null,
    category: '酱腌菜',
    unreadable: [],
    notes: null,
  };
}

async function recognize(ingredientsText) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          parsed: parsed(ingredientsText),
          partial: false,
          jsonParse: { ok: true, reason: null },
          finishReason: 'stop',
          requestId: 'A1B2C3',
          image: { width: 600, height: 800, mimeType: 'image/jpeg' },
        },
      },
    }),
  );
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(280);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(300);
  await page.unroute('**/api/vision/extract');
}

async function openIngredient(name) {
  for (let i = 0; i < 6; i += 1) {
    const closed = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(100);
  }
  const child = page.locator(`.ing-child-btn[aria-label*="${name}"]`);
  const card = page.locator('.ing-card-btn').filter({ hasText: name });
  if (await child.count()) await child.first().click();
  else if (await card.count()) await card.first().click();
  else throw new Error(`找不到成分：${name}`);
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(700);
}

const caseOf = (key) => HEALTH_CASES.find((x) => x.key === key);

async function showFixture(fx, { ingredientsText, shotName }) {
  const research = buildReplayResearch(fx, { identity: fx.identity });
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: research } }),
  );
  await gotoHome();
  await recognize(ingredientsText);
  await openIngredient(fx.name);
  await page.waitForTimeout(300);
  const sheet = await page.locator('.sheet').innerText();
  await shot(shotName);
  return { fx, research, sheet };
}

async function showCase(key, opts) {
  return showFixture(caseOf(key), opts);
}

await gotoHome();

// ---------------------------------------------------------------- A EDTA
await step('A · EDTA 二钠：身份、ADI 的「以钙二钠 EDTA 计」、不套用腌渍菌藻规定', async () => {
  const { sheet } = await showCase('edta', {
    ingredientsText: '饮用水、竹笋、食品添加剂（乙二胺四乙酸二钠、柠檬酸）、食用香精香料',
    shotName: 'A-edta-390',
  });
  if (!sheet.includes('2.5 mg/kg')) throw new Error(`没有 ADI：${sheet.slice(0, 200)}`);
  if (!sheet.includes('钙二钠 EDTA')) throw new Error('没有保留计量基准');
  if (/腌渍的食用菌|藻类/.test(sheet.split('深入了解')[0])) {
    throw new Error('腌渍菌藻的范围说明出现在主视图');
  }
  if (!sheet.includes('螯合')) throw new Error('没有解释用途');
  const core = await page.locator('.deep-core').count();
  if (core) {
    const text = await page.locator('.deep-core').innerText();
    if (/腌渍|食用菌|藻类/.test(text)) throw new Error(`核心结论仍是类别说明：${text}`);
  }
  // 展开依据原文
  await page.locator('.health-meta > summary').first().click();
  await page.waitForTimeout(200);
  const quote = await page.locator('.health-quote').first().innerText();
  if (!/calcium disodium EDTA|dietary minerals|0-2\.5/i.test(quote)) throw new Error(`原文不对：${quote}`);
  await shot('A-edta-quote-390');
});

// ---------------------------------------------------------------- B 焦亚硫酸钠
await step('B · 焦亚硫酸钠：部分哮喘患者 / 敏感人群，不扩大成所有哮喘', async () => {
  const { sheet } = await showCase('sulfite', {
    ingredientsText: '竹笋、饮用水、食品添加剂（焦亚硫酸钠、柠檬酸）、食用盐',
    shotName: 'B-sulfite-390',
  });
  if (!sheet.includes('部分哮喘')) throw new Error('没有「部分哮喘患者」');
  if (!sheet.includes('亚硫酸盐敏感')) throw new Error('没有点名亚硫酸盐敏感人群');
  if (/所有哮喘|哮喘患者都应/.test(sheet)) throw new Error('把限定扩大了');
  if (!sheet.includes('0–0.7 mg/kg')) throw new Error('没有组 ADI');
  if (/苯丙酮尿症|肾病|糖尿病/.test(sheet)) throw new Error('串了其他成分的人群提示');
});

// ---------------------------------------------------------------- C 冰乙酸
await step('C · 冰乙酸：先给膳食评估结论，not limited 按术语解释', async () => {
  const { sheet } = await showCase('acetic', {
    ingredientsText: '饮用水、竹笋、食品添加剂（冰乙酸、柠檬酸）、食用香精香料',
    shotName: 'C-acetic-390',
  });
  if (!sheet.includes('2004')) throw new Error('没有评估年份');
  if (!sheet.includes('not limited')) throw new Error('没有解释 not limited');
  if (/GMP|酸度调节剂是/.test(sheet.split('它是什么')[0])) throw new Error('健康区被技术功能占据');
  const firstBlock = sheet.indexOf('健康上需要知道什么');
  const identityBlock = sheet.indexOf('它是什么');
  if (firstBlock === -1 || identityBlock === -1 || firstBlock > identityBlock) {
    throw new Error('健康区没有排在身份之前');
  }
});

// ---------------------------------------------------------------- D 证据有限
await step('D · 食用香精：保留身份与用途，只给一句证据缺口，不编造', async () => {
  const { sheet } = await showCase('flavouring', {
    ingredientsText: '饮用水、竹笋、食品添加剂（焦亚硫酸钠）、食用香精香料、食用盐',
    shotName: 'D-limited-390',
  });
  if (!sheet.includes('类别写法')) throw new Error('没有解释这是类别写法');
  if (!/健康评估资料/.test(sheet)) throw new Error('没有说明健康资料缺口');
  if (/苯丙酮尿症|肾病患者|致癌|有毒/.test(sheet)) throw new Error('编造了健康结论');
  const gapCount = (sheet.match(/没有取得|没有提供/g) || []).length;
  if (gapCount > 2) throw new Error(`缺口说明重复过多：${gapCount}`);
});

// ---------------------------------------------------------------- 切换与布局
await step('E · 成分切换：EDTA → 焦亚硫酸钠，结果不串用', async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(200);
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: buildReplayResearch(caseOf('sulfite'), { identity: caseOf('sulfite').identity }) } }),
  );
  await openIngredient('焦亚硫酸钠');
  const text = await page.locator('.sheet').innerText();
  if (text.includes('钙二钠 EDTA')) throw new Error('切换后仍显示上一个成分的内容');
  if (!text.includes('部分哮喘')) throw new Error('切换后没有加载新成分');
  await page.unroute('**/api/ingredient/research');
});

await step('F · 360 / 768：长成分名与健康区不横向溢出', async () => {
  for (const w of [360, 768]) {
    await page.setViewportSize({ width: w, height: 860 });
    await showCase('edta', {
      ingredientsText: '饮用水、竹笋、食品添加剂（乙二胺四乙酸二钠）、食用香精香料',
      shotName: `F-edta-${w}`,
    });
    const over = await page.evaluate(
      () => document.querySelector('.sheet-body').scrollWidth - document.querySelector('.sheet-body').clientWidth,
    );
    if (over > 1) throw new Error(`${w}px 抽屉横向溢出 ${over}px`);
    const head = await page.locator('.sheet-head h2').innerText();
    if (!head.includes('乙二胺四乙酸二钠')) throw new Error(`长名称被截断：${head}`);
    await page.locator('.sheet-close').click();
    await page.waitForTimeout(200);
  }
  await page.setViewportSize({ width: 390, height: 844 });
});

// ---------------------------------------------------------------- G 三氯蔗糖
await step('G · 三氯蔗糖：EFSA 再评估结论第一眼可见，深入分析不再压一张技术卡片', async () => {
  const { sheet } = await showFixture(caseOf('sucralose'), {
    ingredientsText: '饮用水、竹笋、食品添加剂（三氯蔗糖）、食用香精香料',
    shotName: 'G-sucralose-390',
  });
  const headline = await page.locator('.health-headline').innerText();
  if (!/安全/.test(headline)) throw new Error('首句不是评估结论：' + headline);
  if (/ADI\s*是|每日允许摄入量是/.test(headline)) throw new Error('首句只是 ADI：' + headline);
  if (sheet.indexOf('健康上需要知道什么') > sheet.indexOf('它是什么')) {
    throw new Error('健康区块没有排在身份之前');
  }
  const coreCount = await page.locator('.deep-core').count();
  if (coreCount !== 0) throw new Error('深入分析仍有大号核心卡片：' + coreCount);
  await page.locator('.health-meta > summary').first().click();
  await page.waitForTimeout(200);
  // 健康依据里现在还会显示「证据类型 / 研究条件」；只要求高温限定仍然保留
  const condCount = await page.locator('.health-cond', { hasText: '高温' }).count();
  if (!condCount) {
    const all = await page.locator('.health-cond').allInnerTexts();
    throw new Error('没有保留高温限定：' + all.join(' | '));
  }
});

// ---------------------------------------------------------------- H 安赛蜜
await step('H · 安赛蜜：大字结论是再评估结论，不再只剩 ADI 数字', async () => {
  const { sheet } = await showFixture(ACESULFAME_K, {
    ingredientsText: '饮用水、竹笋、食品添加剂（安赛蜜）、食用香精香料',
    shotName: 'H-acesulfame-390',
  });
  const headline = await page.locator('.health-headline').innerText();
  if (!/没有安全担忧/.test(headline)) throw new Error('首句不是再评估结论：' + headline);
  if (/^ADI|^它的 ADI/.test(headline)) throw new Error('首句仍是 ADI：' + headline);
  if (headline.length < 20) throw new Error('首句过短，可能只是数值：' + headline);
  if (/苯丙酮尿症|PKU/.test(sheet)) throw new Error('把阿斯巴甜的人群提示串了过来');
  // ADI 数值仍然可在下方看到，但不占大字结论
  if (!/15 mg\/kg/.test(sheet)) throw new Error('ADI 数值丢失');
});

// ---------------------------------------------------------------- I 白砂糖
await step('I · 白砂糖：大字是龋齿/体重证据，摄入建议退居辅助', async () => {
  const sugar = GENERAL_CASES.find((x) => x.key === 'sugar');
  const { sheet } = await showFixture(sugar, {
    ingredientsText: '白砂糖、饮用水、竹笋',
    shotName: 'I-sugar-390',
  });
  const headline = await page.locator('.health-headline').innerText();
  if (!/龋齿/.test(headline)) throw new Error('大字没有龋齿风险：' + headline);
  if (!/超重|肥胖/.test(headline)) throw new Error('大字没有体重相关证据：' + headline);
  if (/10%|5%/.test(headline)) throw new Error('大字被摄入建议占满：' + headline);
  const body = await page.locator('.health-block').innerText();
  if (!/10%/.test(body)) throw new Error('摄入建议丢失');
  if (/这包|本产品|含量为/.test(body)) throw new Error('推断了这包食品的含糖量');
  if (/糖尿病|必然|一定/.test(body)) throw new Error('扩大成疾病必然发生');
});

// ---------------------------------------------------------------- J 谷氨酸钠
await step('J · 谷氨酸钠：大字是 EFSA 2017 再评估，不是「总膳食不构成危害」', async () => {
  const { sheet } = await showFixture(caseOf('msg'), {
    ingredientsText: '饮用水、竹笋、食品添加剂（谷氨酸钠）、食用盐',
    shotName: 'J-msg-390',
  });
  const h = await page.locator('.health-headline').innerText();
  if (!/EFSA/.test(h)) throw new Error('大字不是 EFSA 评估：' + h);
  if (!/30 mg\/kg/.test(h)) throw new Error('没有保留组 ADI：' + h);
  if (/无需规定|不构成健康危害|绝对安全|无论/.test(h)) throw new Error('仍是旧的无条件结论：' + h);
  if (/总膳食摄入不构成健康危害/.test(sheet)) throw new Error('用评估外推成了无危害');
  if (!/头痛/.test(sheet)) throw new Error('没有写出已报告的人体反应');
  if (!/幼儿和儿童/.test(sheet)) throw new Error('没有点名超暴露的幼儿与儿童');
  const blockLabel = await page.locator('.health-label').innerText();
  if (!/健康上需要知道什么/.test(blockLabel)) throw new Error('有评估结论时不应降级：' + blockLabel);
});

// ---------------------------------------------------------------- K 演示
await step('K · 离线演示：三氯蔗糖直接显示健康评估，标注人工整理且不联网', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /演示一/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(400);
  const before = upstream.length;
  await page.getByRole('button', { name: /三氯蔗糖/ }).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(500);
  const headline = await page.locator('.health-headline').innerText();
  if (!/安全/.test(headline)) throw new Error('演示首句不是评估：' + headline);
  if (/两种不同|和蔗糖/.test(headline)) throw new Error('演示又回到名词差异');
  const note = await page.locator('.demo-replay-note').innerText();
  if (!/离线演示/.test(note)) throw new Error('没有标注离线演示：' + note);
  if (!/人工整理/.test(note)) throw new Error('没有说明是人工整理：' + note);
  if (!/不是某次 DeepSeek 查询/.test(note)) throw new Error('没有区分人工整理与真实查询：' + note);
  if (upstream.length !== before) throw new Error('演示触发了真实上游请求');
  await shot('K-demo-sucralose-390');
});

// ---------------------------------------------------------------- L 四个演示
await step('L · 四个演示样品：有整理资料的成分都能看到健康区块', async () => {
  const plans = [
    ['演示一', '三氯蔗糖'],
    ['演示二', '白砂糖'],
    ['演示三', '白砂糖'],
    ['演示四', '谷氨酸钠'],
  ];
  for (const [demo, ingredient] of plans) {
    const before = upstream.length;
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: new RegExp(demo) }).click();
    await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
    await page.getByRole('button', { name: /确认无误/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
    await page.waitForTimeout(300);
    for (let i = 0; i < 4; i += 1) {
      const closed = page.locator('.ing-child-block:not([open]) > summary');
      if (!(await closed.count())) break;
      await closed.first().click();
      await page.waitForTimeout(80);
    }
    const child = page.locator(`.ing-child-btn[aria-label*="${ingredient}"]`);
    const card = page.locator('.ing-card-btn').filter({ hasText: ingredient });
    if (await child.count()) await child.first().click();
    else if (await card.count()) await card.first().click();
    else throw new Error(`${demo} 找不到成分：${ingredient}`);
    await page.waitForSelector('.sheet', { timeout: 8000 });
    await page.waitForTimeout(350);
    if (!(await page.locator('.health-block').count())) {
      throw new Error(`${demo} 的 ${ingredient} 没有健康区块`);
    }
    const note = await page.locator('.demo-replay-note').innerText();
    if (!/人工整理/.test(note)) throw new Error(`${demo} 没有标注人工整理`);
    if (upstream.length !== before) throw new Error(`${demo} 触发了真实上游请求`);
    await page.locator('.sheet-close').click();
    await page.waitForTimeout(150);
  }
});

if (upstream.length) console.log(`\n⚠ 出现真实上游请求：${upstream.length} 次`);
if (errors.length) console.log(`⚠ 页面报错 ${errors.length} 条`);

const failed = results.filter((r) => !r.ok);
console.log(`\n健康科普浏览器验收：${results.length - failed.length} 通过 / ${failed.length} 失败`);
console.log(`真实上游请求：${upstream.length} 次 / 页面报错：${errors.length} 条`);
await browser.close();
process.exit(failed.length === 0 && upstream.length === 0 ? 0 : 1);
