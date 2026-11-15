/** Independent-review regressions. All API requests are mocked or blocked. */
import assert from 'node:assert/strict';
import { chromium } from './browser-test-runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE || 'http://127.0.0.1:5193';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const results = [];
const out = 'runtime-output/codex-review';
await mkdir(out, { recursive: true });
const apiCalls = [];
async function test(name, fn) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    apiCalls.push(route.request().url());
    await route.fulfill({ status: 503, json: { ok: false, error: { code: 'OFFLINE_TEST', message: '离线测试已拦截' } } });
  });
  try {
    await fn(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
    results.push({ name, ok: true });
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    results.push({ name, ok: false, error: e.message });
  } finally { await page.close(); }
}
async function demo(page, sample = 'drink') {
  await page.goto(base);
  await page.locator(`.demo-${sample}`).click();
}
async function analyze(page) { await page.getByRole('button', { name: /确认无误，查看分析/ }).click(); }
function claim(page, text) { return page.locator('.claim-card').filter({ has: page.locator('.claim-quote', { hasText: text }) }); }

await test('new nutrient name participates in rules', async page => {
  await demo(page);
  await page.getByRole('button', { name: /添加营养素/ }).click();
  const row = page.locator('.nut-row').last();
  await row.locator('.nut-name').fill('膳食纤维');
  await row.locator('.nut-value').fill('10');
  await row.locator('.nut-unit').selectOption('g');
  await page.getByRole('button', { name: '＋ 含膳食纤维', exact: true }).click();
  await analyze(page);
  assert.match(await claim(page, '含膳食纤维').innerText(), /10 g/);
  assert.doesNotMatch(await claim(page, '含膳食纤维').innerText(), /表里没有这一行/);
});

await test('renamed nutrient no longer uses its old key', async page => {
  await demo(page);
  const row = page.locator('.nut-row').filter({ has: page.locator('.nut-name[value="脂肪"]') });
  await row.locator('.nut-name').fill('蛋白质');
  await analyze(page);
  assert.match(await claim(page, '0 脂肪').innerText(), /没有这一行|没有脂肪|缺少|未识别|未找到/);
  assert.equal(await claim(page, '0 脂肪').locator('.calc-result').count(), 0);
});

await test('bound-value text survives editing and refocus', async page => {
  await demo(page);
  const input = page.getByRole('textbox', { name: '脂肪标示数值', exact: true });
  await input.fill('>0.5');
  await input.press('Tab');
  assert.equal(await input.inputValue(), '>0.5');
  await input.focus();
  await input.press('Tab');
  assert.equal(await input.inputValue(), '>0.5');
});

for (const [sample, net, expected] of [['drink', '1 L', '1000 mL'], ['cookie', '1 kg', '1000 g'], ['drink', '250 g', '100 mL']]) {
  await test(`net quantity ${net} respects unit (${sample})`, async page => {
    await demo(page, sample);
    await page.getByRole('textbox', { name: '净含量', exact: true }).fill(net);
    await analyze(page);
    assert.equal(await page.locator('.slider-value').innerText(), expected);
    const range = page.getByRole('slider');
    assert.equal(Number(await range.inputValue()), Number(expected.split(' ')[0]));
  });
}

await test('upload explains when an image is sent', async page => {
  await page.goto(base);
  assert.match(await page.locator('.scan-card').innerText(), /开始识别.*DeepSeek|DeepSeek.*开始识别/);
});

await test('ingredient cache isolates products and reuses same product', async page => {
  let productName = '测试饮料甲';
  let calls = 0;
  await page.route('**/api/vision/extract', route => route.fulfill({ json: {
    ok: true,
    data: { parsed: { product_name: productName, ingredients: ['柠檬酸'], nutrition: { basis: 'per_100ml', items: [] } } },
  } }));
  await page.route('**/api/ingredient/research', async route => {
    calls += 1;
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, data: {
      ingredient: body.name, status: 'no_source', composition: 'local_only',
      brief: { what: `离线语境：${body.foodContext.productName}`, why: '离线回归数据', howToUnderstand: '没有产品用途结论', sourceRefs: [], sources: [] },
      sections: [], sources: [],
    } } });
  });
  async function recognizeFixture() {
    // Synthetic PNG, never a user photograph; route intercept prevents all upstream calls.
    await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('button', { name: /开始识别/ }).click();
    await analyze(page);
    await page.locator('.ing-card-btn', { hasText: '柠檬酸' }).click();
    await page.getByText(`离线语境：${productName}`, { exact: true }).waitFor();
  }
  await page.goto(base);
  await recognizeFixture();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.ing-card-btn', { hasText: '柠檬酸' }).click();
  await page.getByText('离线语境：测试饮料甲', { exact: true }).waitFor();
  assert.equal(calls, 1);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '分析另一件商品', exact: true }).click();
  productName = '测试饮料乙';
  await recognizeFixture();
  assert.equal(calls, 2);
});

await test('three demos stay offline; responsive sheet, focus and bottom actions', async page => {
  const start = apiCalls.length;
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const sample of ['drink', 'cookie', 'yogurt']) {
      await demo(page, sample);
      await analyze(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const trigger = page.locator('.ing-card-btn').first();
      await trigger.click();
      const sheet = page.getByRole('dialog');
      await sheet.waitFor();
      await page.getByRole('button', { name: /深入了解这个成分/ }).click();
      await page.keyboard.press('Tab');
      assert.ok(await sheet.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      assert.ok(await trigger.evaluate(el => el === document.activeElement));
      await page.getByRole('button', { name: '分析另一件商品', exact: true }).scrollIntoViewIfNeeded();
      if (sample === 'drink') await page.screenshot({ path: `${out}/result-${width}.png`, fullPage: true });
    }
  }
  assert.equal(apiCalls.length, start, 'demo made an API request');
});

await browser.close();
const suffix = process.argv.includes('--baseline') ? 'before' : 'after';
await writeFile(`${out}/ui-${suffix}.json`, JSON.stringify({ results, unmockedApiRequests: apiCalls.length }, null, 2));
console.log(`${results.filter(r => r.ok).length}/${results.length} passed; all endpoints intercepted`);
if (results.some(r => !r.ok)) process.exitCode = 1;
