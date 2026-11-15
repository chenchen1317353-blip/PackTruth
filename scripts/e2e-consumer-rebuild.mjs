import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { createResearchBudget, researchBudgetScope, budgetTotal } from '../server/lib/researchBudget.js';
const dir = 'runtime-output/consumer-rebuild';
mkdirSync(`${dir}/screenshots`, { recursive: true });
const live = process.argv.includes('--live');
const files = process.argv.slice(2).filter(a => a !== '--live');
const ledgerFile = `${dir}/paid-ledger.json`;
const initial = JSON.parse(readFileSync(ledgerFile)).calls;
const budget = createResearchBudget({ limitCny: 5, initial,
  onChange: b => writeFileSync(ledgerFile, JSON.stringify({ limitCny: 5, upperCny: budgetTotal(b), calls: b.calls }, null, 2)),
  onResponse: (call, data) => writeFileSync(`${dir}/public-response-${call.number}.json`, JSON.stringify({call,data},null,2)) });
const app = createApp({ rateLimit: 1000 });
const server = live ? await new Promise(resolve => {
  const s = createServer((req,res) => researchBudgetScope.run(budget, () => app(req,res)));
  s.listen(0, '127.0.0.1', () => resolve(s));
  // Requests dispatched below carry the shared acceptance budget through ALS.
}) : null;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
await page.route(/https:\/\/(fonts\.googleapis\.com|cdn\.jsdelivr\.net)\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
// Synthetic packaging isolates this health rebuild; real research is explicitly selected.
const names = live ? [files[0] || '5′-呈味核苷酸二钠'] : files;
try {
  for (const [i, file] of names.entries()) {
    const saved = live ? null : JSON.parse(readFileSync(`${dir}/${file}`));
    const name = saved?.name || file;
    const start = budget.calls.length;
    let payload, requestBody;
    await page.unroute('**/api/ingredient/research');
    await page.route('**/api/ingredient/research', async route => {
      requestBody = route.request().postDataJSON();
      if (!live) return route.fulfill({ json: { ok: true, data: saved.result } });
      // HTTP app + BYOK boundary + actual providers. No key is written to diagnostics.
      // The real HTTP server enters the budget scope through an explicit middleware below.
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ingredient/research`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseek.apiKey}` },
        body: JSON.stringify(requestBody) });
      const json = await response.json(); payload = json.data;
      await route.fulfill({ status: response.status, json });
    });
    await page.route('**/api/vision/extract', route => route.fulfill({ json: { ok: true, data: {
      parsed: { product_name: '健康研究验收样本', category: '酱腌菜', ingredients_text: `水、食用盐、${name}`, nutrition: { basis: 'per_100g', basis_text: '每100克', items: [{name:'钠',value:800,unit:'mg'}] }, claims: [], unreadable: [] }, partial: false } } }));
    await page.goto('http://127.0.0.1:5193', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'AI 功能设置' }).click();
    await page.locator('.ai-settings-dialog input').fill('browser-acceptance-synthetic-key');
    await page.getByRole('button', { name: '完成设置' }).click();
    await page.setInputFiles('input[type=file]', 'public/test-label.png');
    await page.getByRole('button', { name: /开始识别/ }).click();
    await page.getByRole('button', { name: /确认无误/ }).waitFor();
    await page.getByRole('button', { name: /确认无误/ }).click();
    for (let j=0;j<6;j++) { const closed=page.locator('.ing-child-block:not([open]) > summary'); if (!await closed.count()) break; await closed.first().click(); }
    await page.locator('.ing-card-btn', { hasText: name }).first().click();
    await page.locator('.analyzing-bar').waitFor({ state: 'hidden', timeout: 340000 });
    await page.locator('.health-block, .health-empty').first().waitFor({ timeout: 15000 });
    if (requestBody.foodContext?.nutrition?.items?.[0]?.value !== 800) throw new Error('确认后的营养表未传给研究接口');
    const prefix = `${live?'live':'replay'}-${i}`;
    await page.locator('.sheet').screenshot({ path: `${dir}/screenshots/${prefix}-brief.png` });
    await page.getByRole('button', { name: /深入了解这个成分/ }).click();
    await page.locator('.deep-view').scrollIntoViewIfNeeded();
    await page.locator('.sheet').screenshot({ path: `${dir}/screenshots/${prefix}-deep.png` });
    const text = await page.locator('.sheet').innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow || errors.length) throw new Error(`页面溢出或运行错误：${errors.join(';')}`);
    if (live && name.includes('核苷酸') && (!text.includes('尿酸') || !payload?.healthInsights?.highIntake?.text?.includes('尿酸'))) throw new Error('真实HTTP结果未回答尿酸研究');
    if (live && name === '谷氨酸钠' && (!text.includes('2017') || !/血压|头痛/.test(text))) throw new Error('真实HTTP结果未解释EFSA2017和人体发现');
    for (const width of [360, 1280]) { await page.setViewportSize({width,height:844}); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`${width} 页面溢出`); }
    await page.setViewportSize({width:390,height:844});
    if (live) writeFileSync(`${dir}/browser-live.json`, JSON.stringify({name,result:payload,calls:budget.calls.slice(start)},null,2));
    results.push({name,mode:live?'real_http_research':'display_replay_of_real_api_result',nutritionPassed:true,overflow:false,text});
    console.log(`PASS ${live?'LIVE':'DISPLAY REPLAY'} ${name}`);
  }
} finally {
  writeFileSync(`${dir}/browser-${live?'live':'replay'}-checks.json`, JSON.stringify({results,errors},null,2));
  await browser.close(); server?.close();
}
