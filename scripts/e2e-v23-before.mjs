/**
 * 修改前版本（备份代码，端口 5174）的同场景截图。
 *
 * 用与 e2e-v23-fix.mjs 完全相同的 Mock 数据，唯一变量是代码版本，
 * 这样「修改前 / 修改后」两张图可以直接对比。
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
const BASE = process.env.BEFORE_BASE || 'http://localhost:5174';
const OUT = join(process.cwd(), 'runtime-output', 'shots-v23before');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const shot = async (name) => {
  await page.waitForTimeout(260);
  await page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
};

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

const PARSED = (ingredients_text) => ({
  product_name: '山椒脆笋',
  net_content: '150g',
  ingredients_text,
  nutrition: { basis: 'per_100g', basis_text: '每 100 克', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
  claims: [],
  brand: null,
  category: '酱腌菜',
  unreadable: [],
  notes: null,
});

async function recognize(ingredientsText) {
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          parsed: PARSED(ingredientsText),
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
  await page.waitForTimeout(400);
  await page.unroute('**/api/vision/extract');
}

async function openChild(name) {
  for (let i = 0; i < 6; i += 1) {
    const closed = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(120);
  }
  await page.locator(`.ing-child-btn[aria-label*="${name}"]`).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(700);
}

const ACE = buildReplayResearch(ACESULFAME_K, {
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '乙酰磺胺酸钾（INS 950）' },
});
const ACETIC = buildReplayResearch(ACETIC_ACID, {
  identity: { type: 'additive', label: '食品添加剂 · 酸度调节剂', note: '乙酸（INS 260）' },
});
const ONLY_STD = buildReplayResearch(STANDARD_ONLY, {
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '乙酰磺胺酸钾' },
});

// A 截断失败
await gotoHome();
await page.route('**/api/vision/extract', (route) =>
  route.fulfill({
    json: {
      ok: true,
      data: {
        parsed: null,
        partial: false,
        jsonParse: { ok: false, reason: 'NO_RECOVERABLE_FIELDS' },
        finishReason: 'length',
        requestId: '007942',
        image: { width: 600, height: 800, mimeType: 'image/jpeg' },
      },
    },
  }),
);
await page.setInputFiles('input[type=file]', 'public/test-label.png');
await page.waitForTimeout(280);
await page.getByRole('button', { name: /开始识别/ }).click();
await page.waitForSelector('.alert.error', { timeout: 10000 });
await shot('A1-truncated-390');
await page.unroute('**/api/vision/extract');

// C 安赛蜜
await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: ACE } }));
await gotoHome();
await recognize('饮用水、食品添加剂（安赛蜜、柠檬酸）、食用香精香料');
await openChild('安赛蜜');
await shot('C-acesulfame-390');
await page.unroute('**/api/ingredient/research');

// D 冰乙酸
await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: ACETIC } }));
await gotoHome();
await recognize('饮用水、竹笋、食品添加剂（冰乙酸、柠檬酸）、食用香精香料');
await openChild('冰乙酸');
await shot('D-acetic-390');
await page.unroute('**/api/ingredient/research');

// E 只有技术标准
await page.route('**/api/ingredient/research', (route) => route.fulfill({ json: { ok: true, data: ONLY_STD } }));
await gotoHome();
await recognize('饮用水、食品添加剂（安赛蜜）、食用香精香料');
await openChild('安赛蜜');
await shot('E1-health-gap-390');

console.log('before screenshots written to', OUT);
await browser.close();
