/**
 * PackTruth V2.2 真实浏览器验收（Playwright + 本机 Chrome，零真实 API）。
 *
 * 所有识别请求都用 page.route 拦截成 Mock；演示模式本身不联网。
 */

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-v22');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const apiHits = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const from = m.location()?.url || '';
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(from)) return;
  errors.push(`console: ${m.text()}`);
});
page.on('request', (r) => {
  if (r.url().includes('/api/')) apiHits.push(r.url());
});

const results = [];
const shot = async (name, target = page, fullPage = false) => {
  await page.waitForTimeout(250);
  // 必须 await：否则下一个 step 已经导航走了，截出来是空白页
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await target
    .screenshot({ path: join(OUT, `${name}.png`), fullPage })
    .catch(() => {});
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
    await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`), fullPage: true }).catch(() => {});
  }
}

const noHScroll = async (label = '') => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error(`${label} 横向溢出 ${over}px`);
};

async function setKey(key = 'test-key-not-real') {
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill(key);
  await page.getByRole('button', { name: '完成设置' }).click();
  await page.waitForTimeout(150);
}

const PARTIAL = {
  parsed: {
    product_name: '山椒脆笋（部分识别）',
    brand: null,
    category: '酱腌菜',
    net_content: '150g',
    ingredients_text:
      '饮用水、竹笋、山椒、食用盐、香辛料、食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、柠檬酸、冰乙酸、乳酸）、食用香精香料',
    ingredients: [
      { name: '饮用水', raw: '饮用水' },
      { name: '竹笋', raw: '竹笋' },
    ],
    nutrition: { basis: 'per_100g', basis_text: '每100克', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
  },
  partial: true,
  jsonParse: { ok: false, reason: 'INVALID_JSON' },
  recovery: { used: true, recoveredKeys: ['product_name', 'ingredients_text', 'ingredients', 'nutrition'], truncatedKey: 'nutrition' },
  image: { width: 800, height: 600, mimeType: 'image/png' },
  provider: 'deepseek-vision',
  model: 'mock-vision',
  durationMs: 10,
  usage: null,
};

await step('A · 截断响应：保留部分字段并进入人工确认', async () => {
  apiHits.length = 0;
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({ json: { ok: true, data: PARTIAL } }),
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await setKey();
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 15000 });
  await page.waitForTimeout(400);

  const txt = await page.locator('body').innerText();
  if (!txt.includes('已保留识别到的部分内容，请检查并补全')) throw new Error('缺少部分识别提示');
  if (!txt.includes('配料表（7 项）')) throw new Error('原文里的配料没有被补全');
  if (!txt.includes('括号内的具体成分 · 5 项')) throw new Error('括号子配料丢失');
  if (apiHits.filter((u) => u.includes('/vision/extract')).length !== 1) {
    throw new Error(`识别请求次数异常：${apiHits.join(',')}`);
  }
  await shot('partial-confirm-390', page, true);
  await page.unroute('**/api/vision/extract');
});

await step('B · 无可恢复字段：如实失败，只提供重试 / 手动填写', async () => {
  apiHits.length = 0;
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          parsed: null,
          partial: false,
          jsonParse: { ok: false, reason: 'INVALID_JSON' },
          recovery: { used: false, recoveredKeys: [], truncatedKey: null, reason: 'NO_RECOVERABLE_FIELDS' },
          image: { width: 800, height: 600, mimeType: 'image/png' },
          provider: 'deepseek-vision',
          model: 'mock-vision',
          durationMs: 10,
          usage: null,
        },
      },
    }),
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await setKey();
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /开始识别/ }).click();
  // 一个字段都没拿到时，标题必须是「没能读出内容」，不能写成「不完整」
  await page.waitForFunction(() => document.body.innerText.includes('这次没能读出内容'), { timeout: 12000 });
  const txt = await page.locator('body').innerText();
  if (!txt.includes('没有可安全恢复的字段')) throw new Error('错误说明没有区分「无可恢复字段」');
  if (!txt.includes('重试一次') || !txt.includes('手动填写')) throw new Error('缺少重试 / 手动出口');
  if (apiHits.filter((u) => u.includes('/vision/extract')).length !== 1) {
    throw new Error('识别失败后发生了自动重试');
  }
  await shot('no-recovery-error-390');
  await page.unroute('**/api/vision/extract');
});

await step('C · 复合配料：父级不吞子项，子项可编辑、可点击', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /山椒脆笋/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.waitForTimeout(300);

  if (!(await page.locator('.ing-children').count())) throw new Error('确认页没有子配料编辑区');
  // 修改一个子项，确认后续用的是新名称
  const childInputs = page.locator('.ing-child-row input');
  let target = null;
  for (let i = 0; i < (await childInputs.count()); i += 1) {
    if ((await childInputs.nth(i).inputValue()) === '冰乙酸') {
      target = childInputs.nth(i);
      break;
    }
  }
  if (!target) throw new Error('找不到冰乙酸子项');
  await target.fill('冰醋酸');
  await target.press('Tab');
  await page.waitForTimeout(200);
  await shot('confirm-children-390');

  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(500);
  const resultText = await page.locator('body').innerText();
  if (!resultText.includes('包含 5 项')) throw new Error('结果页没有显示父级子项数量');
  if (!resultText.includes('5 项具体成分')) throw new Error('缺少展开入口');

  const group = page.locator('.ing-group').first();
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await group.locator('summary').click();
  await page.waitForTimeout(250);
  await group.getByRole('button', { name: /查看冰醋酸的解释/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(400);
  const sheet = await page.locator('.sheet').innerText();
  if (!sheet.includes('冰醋酸')) throw new Error('抽屉没有使用用户修改后的子项名称');
  if (!sheet.includes('食品添加剂')) throw new Error('抽屉没有说明它属于哪个类别');
  await shot('sheet-child-390', page.locator('.sheet'));
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
});

await step('D · 竹笋：第一眼是身份与用途，不是「资料不足」', async () => {
  await page.getByRole('button', { name: /竹笋/ }).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(400);
  const brief = await page.locator('.brief-view').innerText();
  if (!brief.includes('普通食材')) throw new Error('简明版没有说明它是普通食材');
  if (brief.includes('暂时不能可靠解读')) throw new Error('竹笋被当成未知成分');
  await shot('bamboo-brief-390', page.locator('.sheet'));

  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(400);
  const core = await page.locator('.deep-core').innerText();
  if (!core.includes('普通食材')) throw new Error('深入核心结论没有先说身份');
  if (/资料不足|无法判断合规/.test(core)) throw new Error('深入核心结论仍以不确定开头');
  await page.locator('.deep-core').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot('bamboo-core-390', page.locator('.deep-core'));
  await page.locator('.sheet-close').click();
});

await step('E · 香辛料：解释类别写法，不编造具体品种', async () => {
  await page.getByRole('button', { name: /香辛料/ }).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(350);
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('类别写法')) throw new Error('没有按类别写法解释');
  if (txt.includes('暂时不能可靠解读')) throw new Error('类别写法被当成未知成分');
  // 解释里会举例「不能补成辣椒、八角」——那是反例，不是编造。
  if (/含有(辣椒|八角|花椒)|具体使用了(辣椒|八角|花椒)/.test(txt)) {
    throw new Error('把包装上没有的香辛料写成了确定成分');
  }
  if (!txt.includes('不能凭常识补成')) throw new Error('没有明确拒绝补全具体品种');
  await shot('spice-category-390', page.locator('.sheet'));
  await page.locator('.sheet-close').click();
});

await step('F · 360 / 390：复合配料不挤坏布局，底栏仍贴底', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const group = page.locator('.ing-group').first();
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const over390 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over390 > 1) throw new Error(`390px 横向溢出 ${over390}px`);
  const isOpen = await group.locator('details').evaluate((el) => el.open);
  if (!isOpen) {
    await group.locator('summary').click();
    await page.waitForTimeout(200);
  }
  await shot('group-open-390');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  const over360 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over360 > 1) throw new Error(`360px 横向溢出 ${over360}px`);
  await shot('group-open-360');
  const bar = await page.locator('.action-bar').boundingBox();
  if (!bar || Math.abs(bar.y + bar.height - 800) > 1) throw new Error('底栏没有贴住 360px 视口底部');
});

await step('G · 无 Key：真实识别被拦下，不发起上游请求', async () => {
  apiHits.length = 0;
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('API Key'), { timeout: 8000 });
  if (apiHits.some((u) => u.includes('/vision/extract'))) throw new Error('无 Key 仍发起了识别请求');
});

await step('H · 演示模式与 Mock 之外没有真实 API 调用', async () => {
  const realHits = apiHits.filter((u) => !u.includes('/vision/extract'));
  if (realHits.length) throw new Error(`出现了未预期的 API 请求：${realHits.join(',')}`);
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\nV2.2 界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);

await browser.close();
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
