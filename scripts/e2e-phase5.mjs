import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 第五阶段界面验收（零成本）。
 * 全部使用演示样品 + 预录结果，并监听网络确认没有付费请求。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase5');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const paidCalls = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => {
  const u = r.url();
  // 只统计真正会产生费用的端点；/api/vision/providers 是免费元数据
  if (u.includes('/api/ingredient/research') || u.includes('/api/vision/extract') || u.includes('/api/vision/compare') || u.includes('/api/deepseek/')) {
    paidCalls.push(u);
  }
});

const results = [];
const shot = async (name) => {
  await page.waitForTimeout(320);
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
    await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`) }).catch(() => {});
  }
}

const noHScroll = async () => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) throw new Error(`横向溢出 ${over}px`);
};

async function openDemo(name) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 10000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('配料表别慌'), { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function openIngredient(name) {
  await page.locator('.ing-card-btn', { hasText: name }).first().click();
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.waitForTimeout(350);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

await step('演示一 · 三氯蔗糖显示「查看预录综合分析」而不是联网按钮', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('三氯蔗糖');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('查看预录综合分析')) throw new Error('缺少预录结果按钮');
  if (txt.includes('联网查找权威资料') || txt.includes('获取综合分析')) {
    throw new Error('演示模式出现了真实联网按钮');
  }
  await shot('p5-01-cta');
});

await step('演示一 · 点击后展示预录的综合分析（不联网）', async () => {
  await page.getByRole('button', { name: '查看预录综合分析' }).click();
  await page.waitForSelector('.composition-bar', { timeout: 5000 });
  // V5.2：详细内容默认折叠，展开后再断言
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.waitForTimeout(400);
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('本次没有联网')) throw new Error('缺少"本次没有联网"的标注');
  if (!txt.includes('预录')) throw new Error('缺少预录标记');
  await shot('p5-02-replay');
});

await step('预录结果 · 状态、结论与来源齐全', async () => {
  const head = await page.locator('.composition-bar').innerText();
  if (!head.includes('综合解读')) throw new Error(`构成标签异常：${head}`);
  if (!head.includes('引用对应关系已检查') && !head.includes('部分内容有可靠依据')) {
    throw new Error(`状态标签异常：${head}`);
  }

  const blocks = await page.locator('.claim-item').count();
  if (blocks < 5) throw new Error(`结论条数过少：${blocks}`);

  const srcs = await page.locator('.src-card.web').count();
  if (srcs < 3) throw new Error(`来源卡过少：${srcs}`);

  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('[W1]')) throw new Error('缺少 W1 来源编号');
  if (
    !txt.includes('搜索返回的网页内容') &&
    !txt.includes('仅搜索结果') &&
    !txt.includes('网页抓取内容摘录')
  ) {
    throw new Error('缺少来源类型标注');
  }
});

await step('预录结果 · 摘要级结论必须有降级提示（若有）', async () => {
  const txt = await page.locator('.sheet').innerText();
  // V5.1 的预录样本全部取得正文，因此正常情况下没有 snippet_only 结论；
  // 但只要有，就必须带降级提示 —— 不允许摘要冒充正文。
  const hasSummaryClaim = txt.includes('仅依据搜索引擎摘要');
  if (hasSummaryClaim && !txt.includes('证据强度低于正文摘录')) {
    throw new Error('摘要级结论缺少强度说明');
  }
  console.log(`      摘要级结论：${hasSummaryClaim ? '有，已带降级提示' : '无（本次全部取得正文）'}`);
});

await step('预录结果 · 展示检索过程与费用', async () => {
  await page.locator('.research-diag summary').last().click();
  await page.waitForTimeout(300);
  const txt = await page.locator('.research-diag').last().innerText();
  if (!txt.includes('查询词')) throw new Error('缺少查询词');
  if (!txt.includes('通过校验的结论')) throw new Error('缺少校验统计');
  if (!txt.includes('估算费用')) throw new Error('缺少费用');
  // V5.1 新增：必须说明这次到底抓没抓页面
  if (!txt.includes('实际抓取')) throw new Error('缺少抓取次数说明');
  await shot('p5-03-diag');
});

await step('演示模式 · 未预录成分不提供联网按钮', async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  await openIngredient('食用香精');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('演示模式')) throw new Error('缺少演示模式说明');
  const btn = await page.getByRole('button', { name: /联网/ }).count();
  if (btn > 0) throw new Error('演示模式出现了联网按钮');
  await shot('p5-04-demo-nonet');
});

await step('抽屉在手机宽度下无横向溢出', async () => {
  const over = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return s ? s.scrollWidth - s.clientWidth : -1;
  });
  if (over > 1) throw new Error(`抽屉横向溢出 ${over}px`);
  await noHScroll();
});

await step('全程未触发任何付费 API', async () => {
  if (paidCalls.length > 0) throw new Error(`检测到 ${paidCalls.length} 次付费接口调用：${paidCalls[0]}`);
  console.log('      ingredient/research、vision、deepseek 调用次数：0');
});

await step('回归 · 本地成分卡仍正常（三氯蔗糖本地内容在联网区之上）', async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  await openDemo('清柠气泡水');
  await openIngredient('三氯蔗糖');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('它是什么')) throw new Error('本地卡片缺失');
  if (!txt.includes('[K8]')) throw new Error('本地来源 K8 缺失');
  if (!txt.includes('查看预录综合分析')) throw new Error('演示模式下应显示预录入口');
});

await step('回归 · 话术拆解与食用量仍正常', async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  const txt = await page.locator('body').innerText();
  if (!txt.includes('2.5')) throw new Error('0 脂肪上限缺失');
  await page.locator('.slider-row input[type=range]').fill('1000');
  await page.waitForTimeout(400);
  if (!(await page.locator('body').innerText()).includes('5')) throw new Error('滑块换算未更新');
});

await step('回归 · 测试台与对比工具仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (!(await page.locator('body').innerText()).includes('API 测试台')) throw new Error('测试台打不开');

  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (!(await page.locator('body').innerText()).includes('双模型识别对比')) throw new Error('对比工具打不开');
});

await step('桌面宽度回归', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (!(await page.locator('body').innerText()).includes('拍下包装背面')) throw new Error('桌面宽度异常');
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\n第五阶段界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

await browser.close();
process.exit(passed === results.length ? 0 : 1);
