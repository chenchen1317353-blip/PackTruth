/**
 * PackTruth V2.1.1 真实浏览器验收（Playwright + 本机 Chrome，零 API 成本）。
 *
 * 覆盖：
 *   A 深入分析：短结论 + 普通字号说明、来源编号、无法拆分时的降级
 *   B 部分资料 / 未知成分：不编造用途，限定仍在
 *   C 手机结果页：固定底栏、末尾留白、来源链接可点、无横向溢出
 *   D 360 / 390 / 768 / 1280 / 1440 与窄视口（200% 缩放代理）
 *   E 成分抽屉滚动、关闭不受影响；演示模式零 /api 请求
 *
 * 修改前的真实截图由 .workbuddy/backup-claims-v211-20261102 单独启动生成，
 * 文件名固定为 v211-*-before.png，本脚本不覆盖它们。
 */

import { chromium } from './browser-test-runtime.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = join(process.cwd(), 'runtime-output', 'shots-claims-v211');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
const apiCalls = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // MiSans 字体走第三方 CDN，网络抖动不属于应用错误
  const from = m.location()?.url || '';
  if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(from)) return;
  errors.push(`console: ${m.text()}`);
});
page.on('request', (r) => {
  if (r.url().includes('/api/')) apiCalls.push(r.url());
});

const results = [];
const shot = async (name, target = page, fullPage = false) => {
  await page.waitForTimeout(250);
  await target.screenshot({ path: join(OUT, `${name}.png`), fullPage });
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
    await page
      .screenshot({ path: join(OUT, `FAIL-${name.replace(/[^\w一-龥]/g, '_')}.png`), fullPage: true })
      .catch(() => {});
  }
}

const noHScroll = async (label = '') => {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over > 1) throw new Error(`${label} 横向溢出 ${over}px`);
};

const scrollToBottom = async () => {
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await page.waitForTimeout(450);
};

async function openDemo(matchText) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: new RegExp(matchText) }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
}

async function addClaimChip(text) {
  const exact = page.getByRole('button', { name: `＋ ${text}`, exact: true });
  if (await exact.count()) {
    await exact.first().click();
    return;
  }
  const toggle = page.locator('.more-claims-toggle');
  if (await toggle.count()) {
    const expanded = await toggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await toggle.click();
    await page.waitForTimeout(150);
  }
  const btn = page.getByRole('button', { name: `＋ ${text}`, exact: true });
  if (!(await btn.count())) throw new Error(`找不到宣传语选项：${text}`);
  await btn.first().click();
}

async function confirm() {
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  // 确认页到结果页是平滑滚动，等它回到顶部再量布局
  await page.waitForFunction(() => window.scrollY < 6, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function setNutrient(name, value) {
  const rows = page.locator('.nut-row');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const label = (await rows.nth(i).locator('.nut-name').inputValue()).trim();
    if (label === name) {
      await rows.nth(i).locator('.nut-value').fill(String(value));
      await rows.nth(i).locator('.nut-value').press('Tab');
      await page.waitForTimeout(120);
      return;
    }
  }
  throw new Error(`找不到营养行：${name}`);
}

const barBox = () =>
  page.evaluate(() => {
    const el = document.querySelector('.action-bar');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      position: getComputedStyle(el).position,
      top: r.top,
      bottom: r.bottom,
      height: r.height,
      innerLeft: document.querySelector('.action-bar-inner').getBoundingClientRect().left,
      pageLeft: document.querySelector('.result-page').getBoundingClientRect().left,
      vh: window.innerHeight,
      docBottom: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
    };
  });

await step('A · 三氯蔗糖：离线演示也先给健康评估，深入分析不再压大卡片', async () => {
  await openDemo('清柠气泡水');
  await confirm();
  await page.getByRole('button', { name: /三氯蔗糖/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(450);

  // 演示资料已按当前结构重做：不需要点「查看预录」就能看到健康结论
  const headline = await page.locator('.health-headline').innerText();
  if (!/安全/.test(headline)) throw new Error(`演示首句不是评估：${headline}`);
  if (/两种不同|和蔗糖/.test(headline)) throw new Error(`演示又回到名词差异：${headline}`);
  const note = await page.locator('.demo-replay-note').innerText();
  if (!/人工整理/.test(note) || !/不是某次 DeepSeek 查询/.test(note)) {
    throw new Error(`预录标注不清楚：${note}`);
  }

  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(450);
  if (await page.locator('.deep-core').count()) {
    throw new Error('有健康结论时不应再有大号核心卡片');
  }
  const deepBlob = await page.locator('.deep-view').innerText();
  if (!/实际含量/.test(deepBlob) || !/食用量/.test(deepBlob)) {
    throw new Error('深入分析里丢了「需要实际含量与食用量」的限定');
  }
  if (/undefined|NaN/.test(deepBlob)) throw new Error('深入分析出现 undefined / NaN');
  await shot('v211-demo-health-first');
  await shot('v211-demo-sheet-context', page.locator('.sheet'));
});


await step('B · 部分资料与未知成分：不编造用途，信息不足可见', async () => {
  // 本地资料成分：结论来自已核验原文
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /赤藓糖醇/ }).click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /深入了解这个成分/ }).click();
  await page.waitForTimeout(350);
  await page.locator('.deep-core').scrollIntoViewIfNeeded();
  const local = await page.locator('.deep-core').innerText();
  if (!local.includes('科学背景')) throw new Error('本地成分缺少科学背景');
  // 背景文字必须取自上方已核验的简明三段原文，不能是新写的一句话
  const localExplain = (await page.locator('.deep-core-explain').innerText())
    .trim()
    .replace(/。$/, '');
  const briefBlob = await page.locator('.brief-view').innerText();
  if (!briefBlob.includes(localExplain)) {
    throw new Error(`本地科学背景不是已核验原文：${localExplain}`);
  }
  if (/主要起|可以稳定|作用是/.test(local)) throw new Error('本地成分被写成没有依据的确定用途');
  await shot('v211-deep-partial');

  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
});

await step('B2 · 未知成分：资料不足，不生成确定用途', async () => {
  // 把演示二里知识库没有收录的「燕麦片」改成完全未知的名字
  await openDemo('燕麦纤维饼干');
  let renamed = false;
  const rows = page.locator('.ing-item');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const input = rows.nth(i).locator('input[type=text]');
    if (!(await input.count())) continue;
    if ((await input.inputValue()).trim() === '燕麦片') {
      await input.fill('神秘提取物');
      await input.press('Tab');
      renamed = true;
      break;
    }
  }
  if (!renamed) throw new Error('没有找到可改名的演示配料');
  await confirm();
  await page.getByRole('button', { name: /神秘提取物/ }).click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(350);
  const deep = page.getByRole('button', { name: /深入了解这个成分/ });
  if (await deep.count()) {
    await deep.click();
    await page.waitForTimeout(350);
  }
  const txt = await page.locator('.sheet').innerText();
  if (!txt.includes('资料不足') && !txt.includes('暂时不能可靠解读')) {
    throw new Error('未知成分没有明确说明资料不足');
  }
  if (!txt.includes('不代表它有问题')) throw new Error('缺少「不代表有问题」的说明');
  if (/主要起|作用是|用于稳定/.test(txt)) throw new Error('未知成分被写成确定用途');
  await shot('v211-deep-unknown');
});

await step('C · 390px：底栏固定，最后一条提示与页脚完整在按钮上方', async () => {
  await page.locator('.sheet-close').click().catch(() => {});
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await openDemo('原味发酵乳');
  await addClaimChip('低脂');
  await addClaimChip('低糖');
  await addClaimChip('无添加糖');
  await setNutrient('脂肪', 2);
  await confirm();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  // 展开最后一张卡的来源依据
  const cards = page.locator('.claim-card');
  const last = cards.nth((await cards.count()) - 1);
  const summary = last.locator('.evidence-block summary');
  if (await summary.count()) {
    await summary.click();
    await page.waitForTimeout(350);
  }
  await scrollToBottom();
  await noHScroll('结果页 390px');

  // 不产生新的双滚动条：页面本身只应有 window 一个滚动容器
  const extraScrollers = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          /(auto|scroll)/.test(s.overflowY) &&
          el.scrollHeight > el.clientHeight + 2 &&
          el.clientHeight > 40
        );
      })
      .map((el) => el.className || el.tagName),
  );
  if (extraScrollers.length) {
    throw new Error(`出现额外的纵向滚动容器：${extraScrollers.join(' / ')}`);
  }

  const m = await barBox();
  if (m.position !== 'fixed') throw new Error(`底栏不是固定定位：${m.position}`);
  if (Math.abs(m.bottom - m.vh) > 1) throw new Error(`底栏没有贴住底部：bottom=${m.bottom}, vh=${m.vh}`);
  if (Math.abs(m.innerLeft - m.pageLeft) > 1.5) {
    throw new Error(`按钮与正文没对齐：inner=${m.innerLeft}, page=${m.pageLeft}`);
  }

  const tail = await page.evaluate(() => {
    const bar = document.querySelector('.action-bar').getBoundingClientRect();
    const notes = document.querySelectorAll('.result-page .page-note');
    const note = notes[notes.length - 1].getBoundingClientRect();
    const meta = document.querySelector('.footer-meta').getBoundingClientRect();
    const links = document.querySelectorAll('.claim-card .ev-foot a');
    const link = links[links.length - 1];
    return {
      barTop: bar.top,
      noteBottom: note.bottom,
      metaBottom: meta.bottom,
      lastLink: link ? link.textContent.trim() : null,
      lastCardBottom: (() => {
        const c = document.querySelectorAll('.claim-card');
        return c[c.length - 1].getBoundingClientRect().bottom;
      })(),
    };
  });
  if (tail.noteBottom > tail.barTop - 8) {
    throw new Error(`最后一条提示被底栏压住：note.bottom=${tail.noteBottom}, bar.top=${tail.barTop}`);
  }
  if (tail.metaBottom > tail.barTop - 8) {
    throw new Error(`页脚最后一行被压住：meta.bottom=${tail.metaBottom}, bar.top=${tail.barTop}`);
  }
  if (tail.noteBottom > tail.barTop - 16) throw new Error('末尾留白不足 16px');

  // 来源链接：滚到按钮上方后，点击位置不能被底栏挡住
  const link = page.locator('.claim-card .ev-foot a').last();
  if (await link.count()) {
    await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const target = window.scrollY + r.top - (window.innerHeight - r.height - 140);
      window.scrollTo({ top: target, behavior: 'instant' });
    });
    await page.waitForTimeout(300);
    const hit = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        visible: r.top >= 0 && r.bottom <= window.innerHeight,
        coveredByBar: Boolean(top?.closest('.action-bar')),
        topTag: top?.tagName || null,
      };
    });
    if (!hit.visible) throw new Error('来源链接无法完整显示在视口内');
    if (hit.coveredByBar) throw new Error('来源链接被底栏挡住');
  }

  await scrollToBottom();
  await shot('v211-mobile-bottom-after');
  await shot('v211-mobile-full', page, true);

  // 底栏按钮仍可点击（返回修改）
  const before = await page.locator('.action-bar').innerText();
  if (!before.includes('返回修改') || !before.includes('分析另一件商品')) {
    throw new Error('底栏按钮文案丢失');
  }
});

await step('D · 360px：无横向溢出，底栏仍贴底且留白足够', async () => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(350);
  await scrollToBottom();
  await noHScroll('结果页 360px');
  const m = await barBox();
  if (m.position !== 'fixed') throw new Error('底栏在 360px 不是 fixed');
  if (Math.abs(m.bottom - m.vh) > 1) throw new Error(`360px 底栏没有贴底：${m.bottom}/${m.vh}`);
  const gap = await page.evaluate(() => {
    const bar = document.querySelector('.action-bar').getBoundingClientRect();
    const meta = document.querySelector('.footer-meta').getBoundingClientRect();
    return bar.top - meta.bottom;
  });
  if (gap < 8) throw new Error(`360px 页脚与底栏间距只有 ${gap}px`);
  await shot('v211-mobile-360');
});

await step('E · 768 / 1280 / 1440：按钮与正文对齐，桌面不退化', async () => {
  for (const [w, h] of [
    [768, 900],
    [1280, 900],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    await scrollToBottom();
    await noHScroll(`结果页 ${w}px`);
    const m = await barBox();
    if (m.position !== 'fixed') throw new Error(`${w}px 底栏不是 fixed`);
    if (Math.abs(m.bottom - m.vh) > 1) throw new Error(`${w}px 底栏没有贴底`);
    if (Math.abs(m.innerLeft - m.pageLeft) > 1.5) {
      throw new Error(`${w}px 按钮与正文没对齐：${m.innerLeft} vs ${m.pageLeft}`);
    }
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('.action-bar').getBoundingClientRect();
      const meta = document.querySelector('.footer-meta').getBoundingClientRect();
      return bar.top - meta.bottom;
    });
    if (gap < 8) throw new Error(`${w}px 页脚与底栏间距只有 ${gap}px`);
    if (w === 1440) await shot('v211-desktop-1440');
  }
});

await step('F · 窄视口（720×450，约等于 1440 宽的 200% 缩放）', async () => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.waitForTimeout(400);
  await scrollToBottom();
  await noHScroll('720px 窄视口');
  const m = await barBox();
  if (m.position !== 'fixed') throw new Error('窄视口底栏不是 fixed');
  if (Math.abs(m.bottom - m.vh) > 1) throw new Error('窄视口底栏没有贴底');
  const gap = await page.evaluate(() => {
    const bar = document.querySelector('.action-bar').getBoundingClientRect();
    const meta = document.querySelector('.footer-meta').getBoundingClientRect();
    return bar.top - meta.bottom;
  });
  if (gap < 6) throw new Error(`窄视口页脚与底栏间距只有 ${gap}px`);
});

await step('G · 底栏高度变化时，末尾留白跟着更新', async () => {
  const read = () =>
    page.evaluate(() => ({
      h: getComputedStyle(document.documentElement).getPropertyValue('--result-action-bar-height').trim(),
      pb: getComputedStyle(document.querySelector('.app-footer')).paddingBottom,
    }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const mobile = await read();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(450);
  const desk = await read();
  if (!mobile.h || !desk.h) throw new Error('没有写入 --result-action-bar-height');
  if (mobile.h === desk.h) throw new Error(`高度变量没有随尺寸更新：${mobile.h}`);
  if (mobile.pb === desk.pb) throw new Error(`页脚留白没有随底栏更新：${mobile.pb}`);
});

await step('H · 成分抽屉：滚动、关闭、页面滚动互不影响', async () => {
  // 用较矮的视口，确保抽屉内容一定超过一屏
  await page.setViewportSize({ width: 390, height: 600 });
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /白砂糖/ }).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(300);
  // 展开深入版，让抽屉内容一定超过一屏，才能验证内部滚动
  const deep = page.getByRole('button', { name: /深入了解这个成分/ });
  if (await deep.count()) {
    await deep.click();
    await page.waitForTimeout(400);
  }
  // 结果页的抽屉是 flex 布局，真正滚动的是 .sheet-body，不是 .sheet
  const scrolled = await page.evaluate(() => {
    const body = document.querySelector('.sheet-body');
    body.scrollTop = body.scrollHeight;
    return { top: body.scrollTop, sh: body.scrollHeight, ch: body.clientHeight };
  });
  if (scrolled.sh <= scrolled.ch + 2) throw new Error('抽屉内容不足一屏，无法验证滚动');
  if (scrolled.top <= 0) throw new Error('抽屉无法滚动');
  const pageY = await page.evaluate(() => window.scrollY);
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(300);
  if (await page.locator('.sheet').count()) throw new Error('抽屉没有关闭');
  const pageY2 = await page.evaluate(() => window.scrollY);
  if (Math.abs(pageY - pageY2) > 2) throw new Error('关闭抽屉时页面被意外滚动');
});

await step('J · 底栏两个按钮仍可正常操作', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /返回修改/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 8000 });
  await confirm();
  await page.getByRole('button', { name: /分析另一件商品/ }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('AI 标签识别') || document.body.innerText.includes('拍下'),
    { timeout: 8000 },
  );
  await noHScroll('回到上传页');
});

await step('I · 演示模式没有发起任何 /api 请求', async () => {
  if (apiCalls.length) throw new Error(`演示模式发起了 ${apiCalls.length} 个 API 请求：${apiCalls[0]}`);
});

console.log('\n控制台报错：', errors.length ? errors.slice(0, 5) : '无');
const passed = results.filter((r) => r.ok).length;
console.log(`\nV2.1.1 界面验收：${passed}/${results.length} 通过`);
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);

await browser.close();
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
