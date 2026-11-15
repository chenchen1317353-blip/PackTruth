/**
 * V2.5 消费者健康回答 · 截图（全部离线回放，零付费调用）。
 *
 * 八个验收案例的真实官方证据 → 真实校验器 → 前端渲染。
 * 截图用于 PACKTRUTH_CONSUMER_RESEARCH_ENGINE_FINAL_REPORT.md 的前后对比。
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import {
  ACCEPTANCE_CASES,
  ACCEPTANCE_BRIEFS,
} from './fixtures/acceptance-cases.mjs';
import { resolveSubstanceIdentity } from '../server/lib/substanceIdentity.js';
import { createEvidenceLedger, addRecord, buildCompletionAudit, coverageLabel } from '../server/lib/evidenceLedger.js';
import { validateHealthInsights, validateFoodMeaning } from '../src/domain/evidence/healthGuard.js';
import { summarizeHealthAnswers } from '../src/domain/evidence/healthAnswer.js';
import { findHealthEvidence } from '../src/domain/evidence/healthEvidence.js';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = 'runtime-output/shots-consumer';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}\n     ${e.message}`);
  }
}
const shot = async (name, locator = null) => {
  const target = locator ? await locator : page;
  await target.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
};

function buildReplay(caseItem) {
  const identity = resolveSubstanceIdentity({ name: caseItem.name, aliases: caseItem.aliases || [] });
  const aliases = [
    ...(caseItem.aliases || []),
    ...identity.names,
    ...(identity.analogs || []).flatMap((a) => [a.name, ...(a.en || [])]),
    ...(identity.groupNames || []),
    ...(identity.constituents || []).flatMap((x) => [x.name, ...(x.en || [])]),
  ];
  const ledger = createEvidenceLedger({ identity, hasLocalEntry: false });
  for (const ev of caseItem.evidence) {
    addRecord(ledger, {
      url: ev.url,
      title: ev.title,
      content: ev.excerpt,
      organization: ev.organization,
      publishedAt: ev.publishedAt,
      authority: 4,
      read: true,
      round: 1,
      focus: 'normal',
    });
  }
  const health = validateHealthInsights({
    raw: caseItem.model.healthInsights,
    evidenceSet: caseItem.evidence,
    ingredientName: caseItem.name,
    aliases,
  });
  const food = validateFoodMeaning({
    raw: caseItem.model.foodMeaning,
    evidenceSet: caseItem.evidence,
    ingredientName: caseItem.name,
    aliases,
    foodContext: caseItem.foodContext,
  });
  const answers = summarizeHealthAnswers({ insights: health.insights, rejected: health.rejected });
  const completion = buildCompletionAudit(ledger, {
    final: { answered: answers.healthScore.answered, conditionsKept: true },
  });
  const briefs = ACCEPTANCE_BRIEFS[caseItem.key];
  const sections = (briefs?.sections || caseItem.model.sections || []).map((s, i) => ({
    id: `s${i + 1}`,
    section: s.section,
    text: s.text,
    sourceRefs: s.sourceRefs,
    limitations: null,
    verified: true,
    tier: 'cited',
    scientificCheck: { status: 'pass', issues: [] },
  }));
  const names = [caseItem.name, ...identity.names];
  return {
    status: 'ok',
    composition: 'web_only',
    ingredient: caseItem.name,
    localMatched: false,
    localEntryId: null,
    query: `${identity.en?.[0] || caseItem.name} safety evaluation`,
    querySites: ['who.int', 'fao.org', 'inchem.org'],
    queryLength: 60,
    searchCount: caseItem.evidence.length * 3,
    searchContentCount: caseItem.evidence.length * 2,
    searchRounds: 4,
    fallback: { triggered: true, reason: '按健康证据缺口安排检索' },
    blocked: [],
    fetchFailures: [],
    fetchCount: caseItem.evidence.length,
    fetchAttempts: caseItem.evidence.length,
    sources: caseItem.evidence,
    evidenceStats: { total: caseItem.evidence.length },
    identity: {
      type: caseItem.model.identity.type,
      label: caseItem.model.identity.label,
      note: caseItem.model.identity.note || null,
      checked: {},
    },
    identityGraph: {
      canonical: identity.canonical,
      en: identity.en,
      ins: identity.ins,
      eNumber: identity.eNumber,
      mixture: identity.mixture,
      constituents: identity.constituents,
      group: identity.group,
      analogs: identity.analogs,
      hasGraph: identity.hasGraph,
      note: identity.note,
    },
    brief: {
      ...(briefs?.brief || {}),
      sources: caseItem.evidence,
      tier: 'cited',
      verified: true,
      degraded: false,
    },
    briefRejectReason: null,
    briefScienceReview: null,
    sections,
    rejectedSections: [],
    healthInsights: health.insights,
    healthSchema: 2,
    healthRejected: health.rejected,
    healthStats: health.stats,
    healthStatus: health.insights ? 'available' : 'unavailable',
    healthCoverage: findHealthEvidence(caseItem.evidence, { names }),
    healthAnswers: answers.healthAnswers,
    healthScore: answers.healthScore,
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'].filter(
      (k) => answers.healthAnswers[k].status !== 'answered',
    ),
    researchCoverage: { ...ledger.coverage },
    researchCoverageLabels: Object.fromEntries(
      Object.entries(ledger.coverage).map(([k, v]) => [k, coverageLabel(v)]),
    ),
    completion,
    researchActions: caseItem.evidence.map((ev) => ({ type: 'fetch', url: ev.url, why: '读取官方原文', ok: true })),
    researchStopReason: 'evidence_sufficient',
    plannerNote: null,
    researchRounds: [
      { round: 1, focus: 'identity', focusLabel: '确认成分身份' },
      { round: 2, focus: 'normal', focusLabel: '正常食用的健康评估' },
      { round: 3, focus: 'high', focusLabel: '高摄入与长期暴露' },
      { round: 4, focus: 'sensitive', focusLabel: '特殊人群注意事项' },
    ],
    searchBudget: {
      maxRounds: 5,
      usedRounds: 4,
      maxFetchPages: 5,
      usedFetchPages: caseItem.evidence.length,
      fetchAttempts: caseItem.evidence.length,
      maxPlannerCalls: 2,
      usedPlannerCalls: 1,
      maxChatCalls: 1,
      usedChatCalls: 1,
    },
    healthRoundUsed: true,
    foodMeaning: food.value,
    foodMeaningRejected: food.rejectedReason || null,
    notes: health.insights ? [] : [health.reason || '本次资料没有给出可核查的健康结论'],
    retrievedAt: new Date().toISOString(),
    cached: false,
    chat: { model: 'replay', usage: null, durationMs: 10 },
    timings: {},
    totalMs: 10,
    cost: { currency: 'CNY', total: 0.02 },
    demoReplay: true,
  };
}

const BASE_PARSED = (text) => ({
  product_name: '回放测试样品',
  brand: null,
  category: '测试',
  net_content: '100g',
  ingredients_text: text,
  nutrition: { basis: 'per_100g', basis_text: '每 100 克', items: [] },
  claims: [],
  unreadable: [],
  notes: null,
});

async function setKey() {
  const btn = page.getByRole('button', { name: 'AI 功能设置' });
  if (await btn.count()) {
    await btn.click();
    await page.locator('.ai-settings-dialog input').fill('test-key-not-real');
    await page.getByRole('button', { name: '完成设置' }).click();
    await page.waitForTimeout(120);
  }
}

async function showCase(caseItem) {
  const payload = buildReplay(caseItem);
  await page.route('**/api/ingredient/research', (route) =>
    route.fulfill({ json: { ok: true, data: payload } }),
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setKey();
  await page.route('**/api/vision/extract', (route) =>
    route.fulfill({
      json: { ok: true, data: { parsed: BASE_PARSED(`饮用水、${caseItem.name}、食用盐`), partial: false } },
    }),
  );
  await page.setInputFiles('input[type=file]', 'public/test-label.png');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /开始识别/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('确认识别结果'), { timeout: 12000 });
  await page.getByRole('button', { name: /确认无误/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('包装话术拆解'), { timeout: 12000 });
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i += 1) {
    const closed = page.locator('.ing-child-block:not([open]) > summary');
    if (!(await closed.count())) break;
    await closed.first().click();
    await page.waitForTimeout(60);
  }
  await page.locator('.ing-card-btn', { hasText: caseItem.name }).first().click();
  await page.waitForSelector('.sheet', { timeout: 8000 });
  await page.waitForTimeout(400);
  await shot(`${caseItem.key}-brief-390`, page.locator('.sheet'));
  const deepBtn = page.getByRole('button', { name: /深入了解这个成分/ });
  if (await deepBtn.count()) {
    await deepBtn.click();
    await page.waitForTimeout(400);
    await shot(`${caseItem.key}-deep-390`, page.locator('.sheet'));
    const deepText = await page.locator('.deep-view').innerText();
    await page.locator('.sheet-close').click();
    await page.waitForTimeout(250);
    return deepText;
  }
  await page.locator('.sheet-close').click();
  await page.waitForTimeout(250);
  return '';
}

await step('首页可打开', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setKey();
});

for (const caseItem of ACCEPTANCE_CASES) {
  await step(`${caseItem.name}：截图 + 健康区块`, async () => {
    const deepText = await showCase(caseItem);
    if (caseItem.model.healthInsights) {
      if (!deepText.includes('健康上需要知道什么') && !deepText.includes('健康参考')) {
        throw new Error('深入版没有健康区块');
      }
    }
  });
}

await browser.close();
console.log(`\n消费者回答截图：${passed} 通过 / ${failed} 失败`);
if (pageErrors.length) console.log('页面报错：', pageErrors.slice(0, 3));
process.exit(failed === 0 ? 0 : 1);
