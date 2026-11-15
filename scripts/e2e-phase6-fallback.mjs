/**
 * V6.1 浏览器验证：兜底触发的真实结果在成分卡上的呈现。
 *
 * 场景：氯化钾 —— 服务端已有 V6.1 真实回放的缓存结果（非 force 命中缓存，零费用）。
 * 走「跳过识别 → 手动填写」进入真实模式（自动联网开启），
 * 验证：自动分析 → 降级简明版（缺段过滤 + degraded 提示）→ 深入版。
 */

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase6');
mkdirSync(OUT, { recursive: true });

let passed = 0;
let failed = 0;
const realCalls = [];

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${name} — ${e.message}`);
    try {
      await page.screenshot({ path: join(OUT, `FAIL-v61-${name.replace(/[^\w一-龥]+/g, '_')}.png`), fullPage: true });
    } catch {}
  }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

page.on('request', (r) => {
  if (r.url().includes('/api/ingredient/research')) realCalls.push(r.url());
});

await step('进入真实模式（跳过识别手动填写），加入氯化钾', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // BYOK：成分研究必须带用户 Key；测试里填一个假 Key（上游会被拦截回放）
  {
    const btn = page.getByRole('button', { name: 'AI 功能设置' });
    if (await btn.count()) {
      await btn.click();
      await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
      await page.getByRole('button', { name: '完成设置' }).click();
      await page.waitForTimeout(150);
    }
  }
  // 拦截识别为失败，走「跳过识别」进入手动模式（零识图费用）
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'UPSTREAM_ERROR', message: '模拟失败' } }),
    }),
  );
  await page.locator('input[type=file]').setInputFiles('public/test-label.png');
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('识别失败'), { timeout: 15000 });
  await page.getByRole('button', { name: /跳过识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });

  await page.locator('.form-grid input').first().fill('电解质饮料(白桃味)');
  await page.locator('.basis-btn').nth(1).click(); // 每 100 mL
  await page.getByRole('button', { name: /添加配料/ }).click();
  await page.waitForTimeout(200);
  await page.locator('.ing-item input').first().fill('氯化钾');
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
});

await step('点击氯化钾 → 自动分析 → 回放 V6.1 最终真实结果（拦截请求，零费用）', async () => {
  // 用 CLI 真实回放保存的数据（research-v61-final-potassium-chloride.json：
  // 兜底触发 → 命中 GB 2760 + Codex → 顶部标签过检查 pass → 简明版三段齐全非降级）
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile('runtime-output/research-v61-final-potassium-chloride.json', 'utf8'));
  assert.ok(saved.identity?.checked?.status === 'pass', '保存样本的顶部标签应已过检查');
  assert.ok(!saved.brief?.degraded, '保存样本的简明版应非降级');

  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: saved }) }),
  );

  await page.locator('.ing-card-btn', { hasText: '氯化钾' }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForSelector('.composition-bar', { timeout: 15000 });
  await page.waitForTimeout(400);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('引用对应关系已检查')) throw new Error('缺少校验状态');
  // 顶部标签：分类 + 国际功能清单（已过科学检查，与正文一致）
  if (!txt.includes('食品添加剂')) throw new Error('缺少分类徽章');
  if (!txt.includes('固化剂') || !txt.includes('稳定剂')) throw new Error('顶部缺少国际功能清单');
  // 简明三段齐全
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3，实际 ${blocks}`);
  // 措辞规范：「尚不足以确认」式表达，不说「没有相关科学资料」
  if (!txt.includes('尚不足以确认') && !txt.includes('无法据此推算')) throw new Error('缺少措辞规范句式');
  if (txt.includes('没有相关科学资料')) throw new Error('出现了被禁止的「没有相关科学资料」断言');
  if (txt.includes('从逐条结论中提炼') || txt.includes('逐条结论中提炼')) throw new Error('非降级结果不应出现提炼提示');
  if (!txt.includes('[W6]') || !txt.includes('[W10]')) throw new Error('缺少 GB 2760 / Codex 来源引用');
  await page.screenshot({ path: join(OUT, 'v61-final-brief.png'), fullPage: true });
});

await step('深入版：标准情境、农业资料辨析、完整限定与「不适用于本产品」局限', async () => {
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(300);
  const txt = await page.locator('.deep-view').innerText();
  if (!txt.includes('盐及代盐制品')) throw new Error('缺少 GB 2760 低钠盐情境');
  if (!txt.includes('自然来源类饮用水不能使用')) throw new Error('完整限定语丢失');
  if (!txt.includes('尚不足以确认') && !txt.includes('无法仅凭配料表判断')) {
    throw new Error('缺少「不能外推到本产品」的局限说明');
  }
  await page.screenshot({ path: join(OUT, 'v61-final-deep.png'), fullPage: true });
  await page.locator('.sheet-close').click();
});

await step('付费统计：research 请求 1 次且被拦截回放，零新费用', async () => {
  // 关闭抽屉时的取消请求（/api/ingredient/research/cancel）不计入付费研究
  const researchCalls = realCalls.filter((u) => /\/api\/ingredient\/research$/.test(u));
  if (researchCalls.length !== 1) throw new Error(`research 请求应为 1，实际 ${researchCalls.length}（全部：${realCalls.join(', ')}）`);
  console.log('      research 请求 1 次（测试拦截回放真实数据，未到达上游）');
});

await browser.close();
console.log(`\nV6.1 浏览器验证：${passed}/${passed + failed} 通过\n`);
process.exit(failed === 0 ? 0 : 1);
