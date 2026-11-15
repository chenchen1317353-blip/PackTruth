/**
 * 修改前对照截图：用备份代码（2 轮检索 + 旧深入分析）在 5174 端口，
 * 喂与修改后完全相同的产品与成分，只换回「修改前的健康数据」。
 *
 * 只用于报告对照，不参与验收判定。
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { HEALTH_CASES } from '../.workbuddy/backup-deep-research-20261104/scripts/fixtures/health-cases.mjs';
import { buildReplayResearch } from '../.workbuddy/backup-deep-research-20261104/scripts/fixtures/v23-health.mjs';

const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5174';
const OUT = 'runtime-output/shots-deep';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

async function setKey() {
  await page.getByRole('button', { name: 'AI 功能设置' }).click();
  await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
  await page.getByRole('button', { name: '完成设置' }).click();
}

async function open(name, key, ingredients) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await setKey();
  await page.route('**/api/vision/extract', (r) =>
    r.fulfill({
      json: {
        ok: true,
        data: {
          parsed: {
            product_name: '山椒脆笋',
            category: '酱腌菜',
            net_content: '150g',
            ingredients_text: ingredients,
            nutrition: { basis: 'per_100g', basis_text: '每 100 克', items: [] },
            claims: [],
          },
          partial: false,
          jsonParse: { ok: true },
          finishReason: 'stop',
          requestId: 'BEFORE1',
          image: { width: 600, height: 800, mimeType: 'image/jpeg' },
        },
      },
    }),
  );
  await page.route(/\/api\/ingredient\/research$/, (r) =>
    r.fulfill({
      json: {
        ok: true,
        data: buildReplayResearch(HEALTH_CASES.find((x) => x.key === key), {
          identity: { type: 'additive', label: '食品添加剂', note: null },
        }),
      },
    }),
  );
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'));
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'));
  for (let i = 0; i < 4; i += 1) {
    const c = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await c.count())) break;
    await c.first().click();
    await page.waitForTimeout(80);
  }
  await page.locator(`.ing-child-btn[aria-label*="${name}"]`).first().click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/BEFORE-${name}-brief-390.png` });
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(500);
  const deep = page.locator('.deep-view');
  await deep.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/BEFORE-${name}-deep-390.png` });
  console.log('BEFORE', name, (await deep.innerText()).slice(0, 160).replace(/\n/g, ' | '));
}

await open('谷氨酸钠', 'msg', '饮用水、竹笋、食品添加剂（谷氨酸钠）、食用盐');
await open('三氯蔗糖', 'sucralose', '饮用水、食品添加剂（三氯蔗糖）、食用香精香料');
await browser.close();
