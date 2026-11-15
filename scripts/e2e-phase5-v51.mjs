import { chromium } from './browser-test-runtime.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 第五阶段 V5.1 界面验收。
 *
 * 重点验证「最终只有一份解读」这件事：
 * 旧版是本地卡 + 下面再追加一份联网报告，新版联网成功后替换为综合卡。
 *
 * 全程使用演示样品 + 预录数据，监听网络确认零付费请求。
 */

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-phase5-v51');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const paidCalls = [];
// 场景 C 会自己拦截 vision 与 research，这两个请求没到上游，需从付费统计中排除
const mocked = { research: false, vision: false };
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // 场景 C 故意返回 500/502，浏览器会把它们记成资源错误 —— 那是测试造成的，不是产品缺陷
  const loc = m.location()?.url || '';
  if (mocked.research && loc.includes('/api/ingredient/research')) return;
  if (mocked.vision && loc.includes('/api/vision/extract')) return;
  errors.push(m.text());
});
page.on('request', (r) => {
  const u = r.url();
  if (
    u.includes('/api/ingredient/research') ||
    u.includes('/api/vision/extract') ||
    u.includes('/api/vision/compare') ||
    u.includes('/api/deepseek/')
  ) {
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
    await page
      .screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`) })
      .catch(() => {});
  }
}

const noHScroll = async () => {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
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

const closeSheet = async () => {
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// ============================================================ 1. 初始状态：只有本地卡

await step('演示一 · 打开三氯蔗糖，先只显示本地知识库内容', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('三氯蔗糖');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('基于本地知识库')) throw new Error('缺少「基于本地知识库」标记');
  if (!txt.includes('[K8]')) throw new Error('缺少本地来源 [K8]');
  // 此时不应该已经出现综合卡
  if ((await page.locator('.composition-bar').count()) > 0) throw new Error('未点击就出现了综合卡');
  await noHScroll();
  await shot('v51-01-local-only');
});

await step('入口按钮文案正确（演示模式 = 查看预录综合分析）', async () => {
  const btn = page.getByRole('button', { name: '查看预录综合分析' });
  if ((await btn.count()) !== 1) throw new Error('没有找到「查看预录综合分析」按钮');
  // 演示模式不能出现会真花钱的按钮
  if ((await page.getByRole('button', { name: /获取综合分析|联网分析此成分/ }).count()) > 0) {
    throw new Error('演示模式出现了真实联网按钮');
  }
});

// ============================================================ 2. 点击后：单卡综合结果

await step('点击后替换为综合卡，而不是追加第二份报告', async () => {
  await page.getByRole('button', { name: '查看预录综合分析' }).click();
  await page.waitForSelector('.composition-bar', { timeout: 10000 });
  // V5.2：详细内容默认折叠，展开后再断言
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 10000 });
  await page.waitForTimeout(250);
  await page.waitForTimeout(300);

  const bar = await page.locator('.composition-bar').innerText();
  if (!bar.includes('综合解读')) throw new Error(`构成提示异常：${bar}`);
  if (!bar.includes('本地知识库') || !bar.includes('权威网络资料')) {
    throw new Error(`构成提示没有说明两类资料：${bar}`);
  }

  // 核心断言：简明版只有一份（V5.2 起默认只显示三段，详细内容折叠）
  const briefBlocks = await page.locator('.brief-block').count();
  if (briefBlocks !== 3) throw new Error(`简明段落应为 3，实际 ${briefBlocks}`);
  if ((await page.locator('.deep-view').count()) === 0) throw new Error('展开后应有深入内容');
  await noHScroll();
  await shot('v51-02-combined');
});

await step('预录标识清晰，且说明「本次没有联网」', async () => {
  const note = await page.locator('.demo-replay-note').innerText();
  if (!note.includes('本次没有联网')) throw new Error(`预录标识缺少说明：${note}`);
  if (!note.includes('预录')) throw new Error('缺少「预录」字样');
  // 应为真实检索日期而非「刚刚」
  if (!note.includes('2026')) throw new Error(`没有显示原始检索日期：${note}`);
});

await step('结论带 K / W 两类来源芯片', async () => {
  const localChips = await page.locator('.ref-chip.ref-local').count();
  const webChips = await page.locator('.ref-chip.ref-web').count();
  if (localChips === 0) throw new Error('没有任何本地 [K] 芯片');
  if (webChips === 0) throw new Error('没有任何联网 [W] 芯片');

  const claims = await page.locator('.claim-item').count();
  if (claims < 8) throw new Error(`结论只有 ${claims} 条`);

  const texts = await page.locator('.claim-text').allInnerTexts();
  if (!texts.some((t) => t.includes('蔗糖素'))) throw new Error('结论里没有提到别名「蔗糖素」');
});

await step('来源卡同时包含本地与联网，且都有真实链接', async () => {
  const localCards = await page.locator('.src-card.local').count();
  const webCards = await page.locator('.src-card.web').count();
  if (localCards === 0) throw new Error('没有本地来源卡');
  if (webCards === 0) throw new Error('没有联网来源卡');

  const links = await page.locator('.src-card.web .src-foot a').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href')),
  );
  if (links.length === 0) throw new Error('联网来源卡没有链接');
  for (const href of links) {
    if (!href || !/^https?:\/\//.test(href)) throw new Error(`链接不合法：${href}`);
  }
});

await step('本地原始条目仍可展开查看（信息没丢）', async () => {
  const det = page.locator('.local-original');
  if ((await det.count()) === 0) throw new Error('缺少本地原始条目折叠区');
  await det.locator('summary').click();
  await page.waitForTimeout(250);
  const txt = await page.locator('.local-original').innerText();
  if (!txt.includes('不能确认什么') && !txt.includes('这是什么')) throw new Error('展开后缺少本地原文内容');
  await shot('v51-03-local-original');
  await det.locator('summary').click();
  await page.waitForTimeout(200);
});

await step('检索过程面板显示「无需抓取」与证据构成', async () => {
  const diag = page.locator('.research-diag').first();
  await diag.locator('summary').click();
  await page.waitForTimeout(250);
  const txt = await diag.innerText();
  if (!txt.includes('带正文')) throw new Error('没有显示带正文的结果数');
  if (!txt.includes('本地证据')) throw new Error('没有显示本地证据数量');
  if (!txt.includes('联网证据')) throw new Error('没有显示联网证据数量');
  await shot('v51-04-diag');
  await diag.locator('summary').click();
});

await closeSheet();

// ============================================================ 3. 本地未收录

await step('演示模式 · 所有配料都有简明内容，没有「未收录」死路', async () => {
  await openIngredient('食用香精');
  const txt = await page.locator('.sheet').innerText();
  // V5.2 起食用香精已收录，应直接有解释而不是「未收录」
  if (txt.includes('暂时不能可靠解读')) throw new Error('仍然显示未知');
  const blocks = await page.locator('.brief-block').count();
  if (blocks !== 3) throw new Error(`简明段落应为 3，实际 ${blocks}`);

  for (const bad of ['危险等级', '风险等级', '不健康', '有害'] ) {
    if (txt.includes(bad)) throw new Error(`出现危险措辞：${bad}`);
  }
  await noHScroll();
  await shot('v51-05-unknown');
  await closeSheet();
});

// ============================================================ 4. 普通原料 / 添加剂分类

await step('演示二：普通原料与添加剂分类仍然正确', async () => {
  await openDemo('燕麦纤维饼干');
  await openIngredient('麦芽糊精');
  let badge = await page.locator('.sheet .cat-badge').innerText();
  if (!badge.includes('普通食品配料')) throw new Error(`麦芽糊精徽章异常：${badge}`);
  await closeSheet();

  await openIngredient('柠檬酸');
  badge = await page.locator('.sheet .cat-badge').innerText();
  if (!badge.includes('食品添加剂')) throw new Error(`柠檬酸徽章异常：${badge}`);
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('酸度调节剂')) throw new Error('柠檬酸缺少酸度调节剂功能');
  await closeSheet();
});

await step('演示三：乳清蛋白显示「包装写法 → 标准名」提示', async () => {
  await openDemo('原味发酵乳');
  await openIngredient('浓缩乳清蛋白粉');
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('乳清蛋白')) throw new Error('未匹配到乳清蛋白');
  if (!txt.includes('包装上写的是')) throw new Error('缺少写法提示');
  await closeSheet();
});

// ============================================================ 5. 抽屉交互与溢出

await step('抽屉可滚动、可关闭，手机宽度无横向溢出', async () => {
  await openDemo('清柠气泡水');
  await openIngredient('三氯蔗糖');
  await page.getByRole('button', { name: '查看预录综合分析' }).click();
  await page.waitForSelector('.composition-bar', { timeout: 10000 });
  // V5.2：详细内容默认折叠，展开后再断言
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForSelector('.deep-view', { timeout: 10000 });
  await page.waitForTimeout(250);

  const m = await page.evaluate(() => {
    const s = document.querySelector('.sheet-body');
    return { scrollH: s.scrollHeight, clientH: s.clientHeight, over: s.scrollWidth - s.clientWidth };
  });
  if (m.over > 1) throw new Error(`抽屉横向溢出 ${m.over}px`);
  if (m.scrollH <= m.clientH) throw new Error('内容没有超出，滚动测试无意义（可能渲染不全）');

  // 滚到底再关，确认不会卡住
  await page.evaluate(() => {
    const s = document.querySelector('.sheet-body');
    s.scrollTop = s.scrollHeight;
  });
  await page.waitForTimeout(200);
  await noHScroll();
  if (!(await page.locator('.sheet-body').evaluate(el => el.scrollTop > 0))) throw new Error('抽屉正文未实际滚动');
  await shot('v51-06-scrolled');
  await closeSheet();
  if ((await page.locator('.sheet').count()) !== 0) throw new Error('抽屉没有关闭');
  if (!(await page.evaluate(() => document.activeElement?.textContent?.includes('三氯蔗糖')))) throw new Error('关闭后焦点未返回配料按钮');
});

// ============================================================ 8. 历史功能回归

await step('包装话术拆解仍然正常（2.5 g 上限 + 滑块联动）', async () => {
  // 上一个测试停在了另一个记录上，重新打开演示一
  await openDemo('清柠气泡水');
  const txt = await page.locator('body').innerText();
  if (!txt.includes('2.5')) throw new Error('0 脂肪的 2.5 g 上限缺失');
  if (!txt.includes('信息不足，无法确认')) throw new Error('0 蔗糖状态缺失');
  await page.locator('.slider-row input[type=range]').fill('1000');
  await page.waitForTimeout(400);
  const after = await page.locator('body').innerText();
  if (!after.includes('5 g') && !after.includes('5.0 g')) throw new Error('滑块改动后上限未更新');
});

await step('测试台与对比工具仍可访问', async () => {
  await page.goto(`${BASE}/#/lab`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (!(await page.locator('body').innerText()).includes('API 测试台')) throw new Error('测试台打不开');
  await page.goto(`${BASE}/#/lab/vision`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (!(await page.locator('body').innerText()).includes('双模型识别对比')) throw new Error('对比工具打不开');
});

await step('全程没有产生真实付费 API 调用', async () => {
  // 本脚本只跑演示模式，不应出现任何付费端点请求
  if (paidCalls.length > 0) {
    throw new Error(`发生了 ${paidCalls.length} 次付费调用：${paidCalls[0]}`);
  }
});

await step('控制台没有报错', async () => {
  if (errors.length > 0) throw new Error(`${errors.length} 条错误：${errors[0]}`);
});

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n界面验收：${pass}/${results.length} 通过`);
if (pass !== results.length) {
  console.log('失败项：');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.error}`);
  process.exit(1);
}
