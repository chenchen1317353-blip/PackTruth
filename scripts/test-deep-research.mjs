/**
 * V2.4 深度研究引擎专项测试（全部桩注入，零 API 费用）。
 *
 * 这份测试针对的是「共用流程」，不是几个成分的文案：
 *   A. 证据检查表：身份 / 正常 / 高摄入 / 特殊人群 / 新旧评估
 *   B. 下一轮查什么：顺序、跳过已试过的目标、证据够了提前停
 *   C. 查询构造：中英文名、四项专用词、128 字符上限、ori_question
 *   D. Fetch：正文很长也要先抓健康原文；最多 4 页
 *   E. 编排：最多 4 轮、技术标准不阻止健康补查、ADI ≠ 后果、动物 ≠ 人体
 *   F. 可靠性：取消、429、402、缓存版本、计价币种
 *   G. 展示：简明与深入共用同一份证据，深入版先健康后依据
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assessHealthChecklist,
  chooseResearchFocus,
  checklistSignature,
} from '../server/lib/healthChecklist.js';
import {
  buildResearchQuery,
  FOCUS_TERMS,
  oriQuestionFor,
  QUERY_MAX_CHARS,
} from '../server/lib/searchQuery.js';
import { planFetch, MAX_FETCH_PAGES } from '../server/lib/fetchPolicy.js';
import {
  estimateResearchCost,
  MAX_SEARCH_ROUNDS,
} from '../server/providers/ingredientResearch.js';
import {
  getProgress,
  requestCancel,
  clearProgressStore,
} from '../server/lib/researchProgress.js';
import { buildHealthView } from '../src/app/ingredientView.js';
import { validateHealthInsights } from '../src/domain/evidence/healthGuard.js';
import { isAnimalEvidence } from '../src/domain/evidence/healthAnswer.js';
import { mergeAliases } from '../src/domain/ingredients/aliasSeeds.js';
import { HEALTH_CASES } from './fixtures/health-cases.mjs';

let pass = 0;
let fail = 0;
const failures = [];

async function t(id, name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ✓ [${String(id).padStart(2)}] ${name}`);
  } catch (e) {
    fail += 1;
    failures.push(`${id} ${name} — ${e.message}`);
    console.log(`  ✗ [${String(id).padStart(2)}] ${name}\n         ${e.message}`);
  }
}

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg = '') {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} 期望 ${y}，实际 ${x}`);
}

// ---------------------------------------------------------------- 桩

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
});

function hit(url, title, content, date = null) {
  return {
    title,
    url,
    snippet: title.slice(0, 60),
    summary: title,
    content,
    site_name: 'x',
    authority: 4,
    rerank_score: 2,
    date,
  };
}

const repeat = (s, n = 6) => s.repeat(n);

function gbSource(name, tag) {
  return hit(
    `https://gb2760.cfsa.net.cn/node/${tag}`,
    `${name} GB 2760-2024 条目`,
    repeat(
      `${name}在 GB 2760-2024《食品添加剂使用标准》中登记为食品添加剂，功能类别为增味剂。允许在各类食品中按生产需要适量使用，最大使用量按表 A.1 执行，食品分类号 12.10，应符合良好生产规范。`,
    ),
  );
}

function riskSource(name, tag, year = '2017') {
  return hit(
    `https://www.efsa.europa.eu/en/efsajournal/pub/${tag}`,
    `Re-evaluation of ${name} (E 999)`,
    repeat(
      `In its ${year} re-evaluation the Panel concluded that no safety concern was identified at the assessed dietary exposure. The group ADI of 30 mg/kg bw per day applies to the general population.`,
    ),
    `${year}-03-01T00:00:00+00:00`,
  );
}

function adiSource(name, tag) {
  return hit(
    `https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/${tag}`,
    `${name}（JECFA）`,
    repeat(
      `ADI: 30 mg/kg bw per day. The Committee established an ADI of 30 mg/kg bw per day for ${name}. Comments: the substance is used as a flavouring agent.`,
    ),
    '1987-01-01T00:00:00+00:00',
  );
}

function humanSource(name, tag) {
  return hit(
    `https://pubmed.ncbi.nlm.nih.gov/${tag}`,
    `${name} high intake and blood pressure: a randomised trial`,
    repeat(
      `In a randomised trial with 120 participants, high intake of ${name} was associated with a small increase in blood pressure and headache in some subjects. The study did not establish a mechanism.`,
    ),
    '2021-06-01T00:00:00+00:00',
  );
}

function animalSource(name, tag) {
  return hit(
    `https://pubmed.ncbi.nlm.nih.gov/${tag}`,
    `${name} high dose study in rats`,
    repeat(
      `In rats given a high dose of ${name} by gavage, liver damage was observed at the top dose. The study was conducted in animals only and did not include human participants.`,
    ),
    '2019-01-01T00:00:00+00:00',
  );
}

function groupSource(name, tag) {
  return hit(
    `https://www.who.int/news-room/fact-sheets/detail/${tag}`,
    `${name}：sensitive groups`,
    repeat(
      `Certain sulfite sensitive individuals, including some people with asthma, may experience adverse reactions. ${name} used in foods should be considered in this context.`,
    ),
    '2020-01-01T00:00:00+00:00',
  );
}

/** 一条同时满足四项的评估页（用于「证据足够提前停」） */
function allInOneSource(name, tag) {
  return hit(
    `https://www.efsa.europa.eu/en/efsajournal/pub/${tag}`,
    `Re-evaluation of ${name} (E 999)`,
    repeat(
      `In its 2024 re-evaluation the Panel concluded that no safety concern was identified at the assessed dietary exposure. At high intake, a randomised trial in human volunteers reported a small increase in blood pressure. Some people with asthma may experience adverse reactions.`,
    ),
    '2024-05-01T00:00:00+00:00',
  );
}

function chatBody(name, health = null) {
  const payload = {
    identity: { type: 'additive', label: '食品添加剂', note: '依据标准条目' },
    sections: [
      {
        id: 's1',
        section: 'what',
        text: `${name}是一种食品添加剂。`,
        sourceRefs: ['W1'],
        limitations: null,
      },
    ],
  };
  if (health) payload.healthInsights = health;
  return {
    choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1200, completion_tokens: 300 },
  };
}

const originalFetch = globalThis.fetch;
const cachedSearchPages = new Map();
function stubFetch(routes) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (u.includes(prefix)) return handler(u, init);
    }
    if (u.endsWith('/fetch')) { const target = cachedSearchPages.get(JSON.parse(init.body).url); return target ? jsonRes(200,{title:target.title,content:target.content}) : jsonRes(404, {error:{message:'offline target unavailable'}}); }
    throw new Error(`桩没有覆盖的请求: ${u}`);
  };
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}
process.on('exit', () => {
  globalThis.fetch = originalFetch;
});

/** 按调用顺序返回结果；超过后重复最后一轮 */
function searchStub(rec, rounds) {
  let i = 0;
  return {
    '/search': async (url, init) => {
      const body = JSON.parse(init?.body || '{}');
      rec.calls.push({
        query: body.query,
        needContent: body.need_content,
        count: body.count,
        ori: body.ori_question,
      });
      const r = rounds[Math.min(i, rounds.length - 1)];
      i += 1;
      const results = typeof r === 'function' ? r() : r;
      for (const result of results) cachedSearchPages.set(result.url, result);
      return jsonRes(200, { results });
    },
  };
}

// ============================================================ A. 证据检查表

console.log('\n【A】证据检查表：四项问题各自到了哪一步');

await t(1, '只有 GB 使用标准：身份确认，但没有任何健康问题被回答', () => {
  const c = assessHealthChecklist([gbSource('测试成分A', 'a1')], { names: ['测试成分A'] });
  eq(c.identity, 'confirmed');
  eq(c.normal.state, 'missing');
  eq(c.high.state, 'missing');
  eq(c.sensitive.state, 'missing');
  eq(c.recent.needed, false, '没有健康资料时不该为「较新评估」再花钱');
});

await t(2, 'EFSA 再评估：正常食用算「直接评估」，不是参考值', () => {
  const c = assessHealthChecklist([riskSource('测试成分A', 'a2')], { names: ['测试成分A'] });
  eq(c.normal.state, 'direct');
  eq(c.high.state, 'reference', '评估页里有 ADI，但没写高摄入后果');
  eq(c.recent.needed, true, '2017 年的评估相对当前年份偏旧，应允许补查新评估');
});

await t(3, '只有 ADI 数值：正常食用只能算参考值', () => {
  const c = assessHealthChecklist([adiSource('测试成分A', 'a3')], { names: ['测试成分A'] });
  eq(c.normal.state, 'reference');
  eq(c.high.state, 'reference', '只有 ADI 时高摄入也只能算参考值');
});

await t(4, '人体高摄入研究：高摄入算 human_effect；动物研究只算 animal', () => {
  const human = assessHealthChecklist([humanSource('测试成分A', 'a4')], { names: ['测试成分A'] });
  eq(human.high.state, 'human_effect');
  const animal = assessHealthChecklist([animalSource('测试成分A', 'a5')], { names: ['测试成分A'] });
  eq(animal.high.state, 'animal');
});

await t(5, '点名人群：只有来源真的点名才算 named', () => {
  const named = assessHealthChecklist([groupSource('测试成分A', 'a6')], { names: ['测试成分A'] });
  eq(named.sensitive.state, 'named');
  const generic = assessHealthChecklist([riskSource('测试成分A', 'a7')], { names: ['测试成分A'] });
  eq(generic.sensitive.state, 'missing');
});

await t(6, '证据检查表不认别的成分的资料（防串用）', () => {
  const c = assessHealthChecklist([groupSource('另一个成分', 'a8')], { names: ['测试成分A'] });
  eq(c.sensitive.state, 'missing');
});

// ============================================================ B. 调度

console.log('\n【B】下一轮查什么：顺序、跳过、提前停');

const baseChecklist = () => ({
  identity: 'confirmed',
  normal: { state: 'missing' },
  high: { state: 'missing' },
  sensitive: { state: 'missing' },
  recent: { needed: false },
});

await t(7, '身份未确认：先补身份；本地有条目则补食品用途', () => {
  const c = { ...baseChecklist(), identity: 'missing' };
  eq(chooseResearchFocus(c), 'identity');
  eq(chooseResearchFocus(c, { hasLocalEntry: true }), 'food_use');
});

await t(8, '正常食用未答 → 先查 normal；答上后再查 high / sensitive', () => {
  eq(chooseResearchFocus(baseChecklist()), 'normal');
  const c2 = { ...baseChecklist(), normal: { state: 'direct' } };
  eq(chooseResearchFocus(c2), 'high');
  const c3 = { ...c2, high: { state: 'human_effect' } };
  eq(chooseResearchFocus(c3), 'sensitive');
  const c4 = { ...c3, sensitive: { state: 'named' }, recent: { needed: true } };
  eq(chooseResearchFocus(c4), 'recent');
});

await t(9, '已经试过且没改善的目标不重复查，避免四轮耗在同一个缺口', () => {
  const c = baseChecklist();
  eq(chooseResearchFocus(c, { attempted: ['normal'] }), 'high');
  eq(chooseResearchFocus(c, { attempted: ['normal', 'high'] }), 'sensitive');
  eq(chooseResearchFocus(c, { attempted: ['normal', 'high', 'sensitive'] }), null);
});

await t(10, '四项都满足 → 不再检索；签名能识别状态变化', () => {
  const c = {
    identity: 'confirmed',
    normal: { state: 'direct' },
    high: { state: 'human_effect' },
    sensitive: { state: 'named' },
    recent: { needed: false },
  };
  eq(chooseResearchFocus(c), null);
  assertOk(checklistSignature(c) !== checklistSignature(baseChecklist()), '签名应能区分状态');
});

// ============================================================ C. 查询

console.log('\n【C】查询构造：中英文名 + 四项专用词');

await t(11, '四项查询各带专用词，且都 ≤128 字符', () => {
  for (const focus of ['normal', 'high', 'sensitive', 'recent']) {
    const q = buildResearchQuery({
      name: '谷氨酸钠',
      aliases: ['monosodium glutamate', 'glutamic acid'],
      focus,
    });
    assertOk(q.query.includes(FOCUS_TERMS[focus]), `${focus} 缺专用词：${q.query}`);
    assertOk(q.length <= QUERY_MAX_CHARS, `${focus} 超长：${q.length}`);
    eq(q.focus, focus);
  }
});

await t(12, '长英文名不再被 14 字符上限挡掉（谷氨酸钠 → monosodium glutamate）', () => {
  const q = buildResearchQuery({
    name: '谷氨酸钠',
    aliases: ['monosodium glutamate', 'glutamic acid'],
    focus: 'normal',
  });
  assertOk(/monosodium glutamate/i.test(q.query), `查询里没有英文名：${q.query}`);
  assertOk(!/^谷氨酸钠 ?$/.test(q.head), '头部不应只有中文名');
});

await t(13, 'identity 走食品语境兜底，不是健康词', () => {
  const q = buildResearchQuery({ name: '测试成分A', aliases: ['test a'], focus: 'identity' });
  assertOk(/食品添加剂/.test(q.query), q.query);
  assertOk(!/safety assessment/.test(q.query), '身份查询不应混入健康评估词');
});

await t(14, '每个目标都有对应的 ori_question，且互不相同', () => {
  const qs = ['identity', 'normal', 'high', 'sensitive', 'recent'].map((f) => oriQuestionFor(f));
  eq(new Set(qs).size, qs.length, 'ori_question 应各不相同');
  for (const q of qs) assertOk(q.length > 6 && q.length <= 128, q);
});

await t(15, '不同化学形式不共用别名（EDTA 二钠 ≠ 钙二钠 EDTA）', () => {
  const edta = mergeAliases('乙二胺四乙酸二钠', []);
  assertOk(edta.some((a) => /disodium edta/i.test(a)), '缺少 disodium edta');
  assertOk(!edta.some((a) => /calcium/i.test(a)), '不应把钙二钠 EDTA 当成同一种物质');
  const asp = mergeAliases('阿斯巴甜', []);
  assertOk(!asp.some((a) => /acesulfame/i.test(a)), '阿斯巴甜不应混入安赛蜜');
});

// ============================================================ D. Fetch

console.log('\n【D】Fetch：健康原文优先，不被长正文挤掉');

await t(16, '两篇长 GB 正文 + 一篇健康页：仍要抓健康页', () => {
  const plan = [
    { kind: 'search_content', body: 'x'.repeat(5000), result: { title: 'GB 2760 条目', authority: 3 }, mentions: true },
    { kind: 'search_content', body: 'y'.repeat(5000), result: { title: 'GB 2760 另一页', authority: 3 }, mentions: true },
    {
      kind: 'pending',
      body: '',
      result: {
        title: 'EFSA re-evaluation: high intake and blood pressure',
        snippet: 'dietary exposure safety assessment, adverse effects',
        summary: '',
        authority: 4,
      },
      mentions: true,
    },
  ];
  const d = planFetch(plan, { missingQuestions: ['high'] });
  eq(d.needFetch, true, '正文很长也必须抓健康原文');
  eq(d.targets.length, 1);
  assertOk(/EFSA/.test(d.targets[0].result.title), '抓的不是健康页');
});

await t(17, '没有健康缺口时回到长度规则：正文足够就不抓', () => {
  const plan = [
    { kind: 'search_content', body: 'x'.repeat(5000) },
    { kind: 'pending', body: '', result: { title: '普通页面', snippet: '' } },
  ];
  const d = planFetch(plan, { missingQuestions: [] });
  eq(d.needFetch, false);
  eq(d.targets.length, 0);
});

await t(18, 'Fetch 硬上限是 4 页', () => {
  const plan = Array.from({ length: 10 }, (_, i) => ({
    kind: 'pending',
    body: '',
    result: { title: `safety assessment ${i}`, snippet: 'ADI dietary exposure', summary: '' },
  }));
  const d = planFetch(plan, { missingQuestions: ['normal'] });
  assertOk(d.targets.length <= MAX_FETCH_PAGES, `抓了 ${d.targets.length} 页`);
  eq(MAX_FETCH_PAGES, 4);
});

// ============================================================ E. 编排

console.log('\n【E】编排：最多 4 轮、按缺口推进、ADI/动物不算人体后果');

await t(19, 'GB → 评估 → 人体研究 → 人群：四轮各司其职，最后答上三项', async () => {
  clearProgressStore();
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [
      () => [gbSource('测试成分B', 'b1')],
      () => [riskSource('测试成分B', 'b2')],
      () => [humanSource('测试成分B', 'b3')],
      () => [groupSource('测试成分B', 'b4')],
    ]),
    'chat/completions': () =>
      jsonRes(
        200,
        chatBody('测试成分B', {
          normalIntake: {
            text: 'EFSA 的再评估认为，在所评估的膳食暴露下没有安全担忧。',
            evidenceStatus: 'authoritative',
            sourceRefs: ['W2'],
            quote: 'no safety concern was identified at the assessed dietary exposure',
            conditions: '所评估的膳食暴露',
            sourceYear: '2017',
          },
          highIntake: {
            text: '人体随机试验中，高摄入与部分受试者血压轻度升高和头痛有关。',
            evidenceStatus: 'supported',
            sourceRefs: ['W3'],
            quote: 'high intake of 测试成分B was associated with a small increase in blood pressure and headache',
            conditions: '人体随机试验',
            sourceYear: '2021',
          },
          sensitiveGroups: {
            text: '部分哮喘患者可能出现敏感反应，需要特别注意。',
            evidenceStatus: 'authoritative',
            sourceRefs: ['W4'],
            quote: 'some people with asthma',
            conditions: null,
            sourceYear: '2020',
          },
        }),
      ),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分B', aliases: ['test b'], force: true });
    assertOk(rec.calls.length >= 3 && rec.calls.length <= 7, '检索应在预算内');
    assertOk(d.researchRounds.some(r=>r.focus==='normal') && d.researchRounds.some(r=>r.focus==='recent'), '健康评估与较新评估都应检索');
    assertOk(['evidence_sufficient','gaps_remain','planner_stop','no_new_evidence','max_budget'].includes(d.researchStopReason), d.researchStopReason);
    eq(d.evidenceChecklist.normal.state, 'direct');
    eq(d.evidenceChecklist.high.state, 'human_effect');
    eq(d.evidenceChecklist.sensitive.state, 'named');
    eq(d.healthAnswers.normalIntake.status, 'answered');
    eq(d.healthAnswers.highIntake.status, 'answered');
    eq(d.healthAnswers.sensitiveGroups.status, 'answered');
    // 第二轮开始必须是健康专项词，不能拿 GB 标准收尾
    assertOk(/safety (?:assessment|evaluation)|JECFA|EFSA/i.test(rec.calls[1].query), rec.calls[1].query);
    for (const c of rec.calls) {
      assertOk(c.needContent === true, 'need_content 必须开启');
      assertOk(c.query.length <= 128, `查询超长 ${c.query.length}`);
      assertOk(typeof c.ori === 'string' && c.ori.length > 6, '缺少 ori_question');
    }
  } finally {
    restoreFetch();
  }
});

await t(20, '一条资料同时满足四项 → 只查一轮就停', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [allInOneSource('测试成分C', 'c1')]]),
    'chat/completions': () => jsonRes(200, chatBody('测试成分C')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分C', aliases: ['test c'], force: true });
    assertOk(rec.calls.length >= 3 && rec.calls.length <= 7);
    eq(d.searchRounds, rec.calls.length);
    assertOk(['evidence_sufficient','gaps_remain','planner_stop','no_new_evidence','max_budget'].includes(d.researchStopReason), d.researchStopReason);
  } finally {
    restoreFetch();
  }
});

await t(21, '只有 ADI 时：健康区只算参考值，不把「有数值」当成「过量后果已回答」', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [gbSource('测试成分D', 'd1')], () => [adiSource('测试成分D', 'd2')]]),
    'chat/completions': () =>
      jsonRes(
        200,
        chatBody('测试成分D', {
          normalIntake: {
            text: '该物质的 ADI 是 30 mg/kg 体重。',
            evidenceStatus: 'authoritative',
            sourceRefs: ['W2'],
            quote: 'ADI: 30 mg/kg bw per day',
          },
          highIntake: {
            text: '该物质的 ADI 是 30 mg/kg 体重，超过它并不等于中毒。',
            evidenceStatus: 'conditional',
            sourceRefs: ['W2'],
            quote: 'ADI: 30 mg/kg bw per day',
          },
        }),
      ),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分D', aliases: ['test d'], force: true });
    eq(d.evidenceChecklist.normal.state, 'reference');
    eq(d.healthAnswers.normalIntake.status, 'reference_only');
    eq(d.healthAnswers.highIntake.status, 'reference_only');
    eq(d.healthScore.answered, 0, 'ADI 不应被算成已回答');
    assertOk(!d.healthInsights?.normalIntake, '纯参考值不生成正常食用答案');
    assertOk(!d.healthInsights?.highIntake, '纯参考值不生成身体后果答案');
    assertOk(d.consumerEvidence.deepFacts.some(f=>f.originSlots.includes('normalIntake') && f.answerKind==='reference'));
    assertOk(d.consumerEvidence.deepFacts.some(f=>f.originSlots.includes('highIntake') && f.answerKind==='reference'));
  } finally {
    restoreFetch();
  }
});

await t(22, '只有动物研究：高摄入状态是 animal，不算人体后果、不进大字结论', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [gbSource('测试成分E', 'e1')], () => [animalSource('测试成分E', 'e2')]]),
    'chat/completions': () =>
      jsonRes(
        200,
        chatBody('测试成分E', {
          highIntake: {
            text: '大鼠实验中，高剂量摄入出现肝损伤。',
            evidenceStatus: 'conditional',
            sourceRefs: ['W2'],
            quote: 'liver damage was observed at the top dose',
            conditions: '动物实验，高剂量',
          },
        }),
      ),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分E', aliases: ['test e'], force: true });
    eq(d.evidenceChecklist.high.state, 'animal');
    eq(d.healthAnswers.highIntake.status, 'reference_only');
    assertOk(!d.healthInsights?.highIntake?.answersQuestion, '动物结果被当成了人体后果');
    assertOk(d.consumerEvidence.deepFacts.some(f=>f.applicability.population==='animal'), '动物研究应保留在深入区');
    assertOk(!d.healthInsights?.highIntake, '动物不能占一般高摄入主栏');
    const view = buildHealthView(d);
    assertOk(!view?.headline, '动物结果不应成为大字健康结论');
  } finally {
    restoreFetch();
  }
});

await t(23, '没有健康资料：不编造，按缺口如实说明', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [gbSource('测试成分F', 'f1')]]),
    'chat/completions': () => jsonRes(200, chatBody('测试成分F')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分F', aliases: ['test f'], force: true });
    eq(d.healthInsights, null);
    eq(d.healthScore.answered, 0);
    eq(d.healthAnswers.highIntake.status, 'no_evidence');
    assertOk(!JSON.stringify(d.healthInsights || {}).includes('肝'), '凭空出现器官描述');
    assertOk(
      ['max_rounds', 'gaps_remain', 'no_new_evidence'].includes(d.researchStopReason),
      d.researchStopReason,
    );
  } finally {
    restoreFetch();
  }
});

// ============================================================ F. 可靠性

console.log('\n【F】取消、上游错误、缓存与计价');

await t(24, '取消后不再发起新的付费调用，进度停在 cancelled', async () => {
  clearProgressStore();
  let calls = 0;
  stubFetch({
    '/search': async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 60));
      return jsonRes(200, { results: [gbSource('测试成分G', 'g1')] });
    },
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const p = researchIngredient({ name: '测试成分G', aliases: ['test g'], force: true, requestId: 'rid-g' });
    setTimeout(() => requestCancel('rid-g'), 15);
    let code = null;
    try {
      await p;
    } catch (e) {
      code = e.code;
    }
    eq(code, 'RESEARCH_CANCELLED');
    eq(calls, 1, '取消后不应再搜索');
    eq(getProgress('rid-g').stage, 'cancelled');
  } finally {
    restoreFetch();
  }
});

await t(25, '首轮 429：只调一次，抛限流错误，不继续烧钱', async () => {
  let calls = 0;
  stubFetch({
    '/search': async () => {
      calls += 1;
      return jsonRes(429, { error: { message: 'rate limited' } });
    },
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    let code = null;
    try {
      await researchIngredient({ name: '测试成分H', aliases: ['test h'], force: true });
    } catch (e) {
      code = e.code;
    }
    eq(code, 'UPSTREAM_RATE_LIMITED');
    eq(calls, 1);
  } finally {
    restoreFetch();
  }
});

await t(26, '402 余额不足：区分于「没资料」，原样告诉用户', async () => {
  let calls = 0;
  stubFetch({
    '/search': async () => {
      calls += 1;
      return jsonRes(402, { error: { message: 'insufficient balance' } });
    },
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    let err = null;
    try {
      await researchIngredient({ name: '测试成分I', aliases: ['test i'], force: true });
    } catch (e) {
      err = e;
    }
    eq(err?.code, 'UPSTREAM_PAYMENT_REQUIRED');
    assertOk(/余额|充值/.test(err.message), err.message);
    eq(calls, 1);
  } finally {
    restoreFetch();
  }
});

await t(27, '缓存命中不再调上游；结构版本已升级，旧缓存不会冒充新结果', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [gbSource('测试成分J', 'j1')]]),
    'chat/completions': () => jsonRes(200, chatBody('测试成分J')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    await researchIngredient({ name: '测试成分J', aliases: ['test j'] });
    const after = rec.calls.length;
    await researchIngredient({ name: '测试成分J', aliases: ['test j'] });
    eq(rec.calls.length, after, '缓存命中不应再调上游');
    const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
    assertOk(/RESEARCH_SCHEMA_VERSION = 'r6-consumer-quality-2026-11-04'/.test(src), '结构版本没有升级');
    assertOk(/RESEARCH_SCHEMA_VERSION,\s*\n\s*\]\)/.test(src), '缓存键没有带结构版本');
  } finally {
    restoreFetch();
  }
});

await t(28, '计价按人民币与实际调用次数，不按预算上限', () => {
  eq(MAX_SEARCH_ROUNDS, 7);
  const cost = estimateResearchCost({ searchRounds: 2, fetchCount: 1, usage: null });
  eq(cost.currency, 'CNY');
  eq(cost.webRequests, 3);
  eq(cost.total, 0.015);
  const full = estimateResearchCost({ searchRounds: 5, fetchCount: 5, usage: null });
  eq(full.total, 0.05, '用满预算也应按实际调用计价');
});

await t(29, '最终整理只有一处 Chat 调用；规划器是受预算限制的独立调用', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  const calls = (src.match(/await chatJson\(/g) || []).length;
  eq(calls, 3, `chatJson 调用点应为 2 处（规划 + 整理），实际 ${calls}`);
  assertOk(/MAX_PLANNER_CALLS = 3/.test(src), '规划调用没有上限');
  assertOk(/plannerCall\(\{ system, user \}\)/.test(src), '规划调用不是独立入口');
});

await t(30, '动物证据判定：动物结果不算人体，含人体受试者时不算动物-only', () => {
  eq(isAnimalEvidence('大鼠实验中高剂量出现肝损伤'), true);
  eq(isAnimalEvidence('人体随机试验中受试者出现头痛'), false);
  eq(isAnimalEvidence('大鼠实验，另有 20 名志愿者的人体观察'), false);
  const r = validateHealthInsights({
    raw: {
      highIntake: {
        text: '大鼠高剂量实验出现肝损伤。',
        evidenceStatus: 'conditional',
        sourceRefs: ['W1'],
        quote: 'liver damage was observed at the top dose',
      },
    },
    evidenceSet: [
      {
        ...animalSource('测试成分K', 'k1'),
        id: 'W1',
        excerpt: animalSource('测试成分K', 'k1').content,
        organization: 'PubMed',
        sourceType: 'fetch_content',
      },
    ],
    ingredientName: '测试成分K',
  });
  eq(r.insights.highIntake.answersQuestion, false);
});

// ============================================================ G. 展示

console.log('\n【G】展示：简明与深入共用同一份证据');

await t(31, '深入版先健康（含对这款食品），最后才是科学依据', () => {
  const src = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  const deep = src.slice(src.indexOf('function DeepView'), src.indexOf('function DeepFromResearch'));
  const healthIdx = deep.indexOf('<HealthBlock');
  const dividerIdx = deep.indexOf('进一步了解科学依据');
  assertOk(healthIdx > 0, '深入版没有健康区块');
  assertOk(healthIdx < dividerIdx, '健康区块应在科学依据之前');
  assertOk(/foodContext=\{foodContext\}/.test(deep.slice(healthIdx, healthIdx + 300)), '健康块没有拿到食品语境');
  const block = src.slice(src.indexOf('function HealthBlock'), src.indexOf('function HealthMeta'));
  assertOk(/对这款食品有什么实际意义/.test(block), '健康块没有「对这款食品」');
  assertOk(/view\.foodMeaning/.test(block), '健康块没有使用已校验的食品意义');
});

await t(32, '「对这款食品」只讲适用性，不推算含量、不产生新结论', () => {
  const src = readFileSync('src/app/ingredientView.js', 'utf8');
  const fn = src.slice(src.indexOf('export function buildFoodMeaning'), src.indexOf('\n}', src.indexOf('export function buildFoodMeaning')));
  assertOk(/配料表不标实际添加量/.test(fn), '缺少含量边界');
  assertOk(!/建议(?:少|多)吃|风险较高|不健康/.test(fn), '出现了没有依据的饮食建议');
  assertOk(/conditions/.test(fn), '没有使用已核验结论的适用条件');
});

await t(33, '预算文案写明 5 轮检索 / 5 次原文 / 2 次规划 + 1 次整理，且由用户账户承担', () => {
  const sheet = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  const settings = readFileSync('src/app/components/AISettings.jsx', 'utf8');
  assertOk(/最多使用 7 轮联网检索/.test(sheet), '抽屉页脚缺少 5 轮说明');
  assertOk(/4 次原文读取、最多 3 次研究规划及 3 次身份\/整理\/核验调用/.test(settings), '设置页缺少预算说明');
  assertOk(/DeepSeek 账户承担/.test(settings), '缺少费用承担说明');
  assertOk(!/固定.{0,4}(?:花费|费用)|每次.{0,4}0\.0\d 元/.test(settings), '不应宣称固定金额');
});

await t(34, '健康结论的原文锚点与适用条件仍随每条结论返回', () => {
  const research = {
    sources:[{id:'W2',excerpt:'no safety concern',title:'Assessment'}],
    healthSchema: 4,
    healthInsights: {
      normalIntake: {
        text: '在所评估的暴露下没有安全担忧。',
        answerKind: 'evaluation',
        answersQuestion: true,
        headlineEligible: true,
        evidenceStatus: 'authoritative',
        evidenceLabel: '权威评估直接支持',
        sourceRefs: ['W2'],
        quote: 'no safety concern',
        conditions: '所评估的膳食暴露',
        sourceYear: '2017',
      },
    },
  };
  const view = buildHealthView(research);
  eq(view.headline.conditions, '所评估的膳食暴露');
  eq(view.headline.sourceYear, '2017');
  assertOk(view.headline.quote, '缺少原文摘句');
});

await t(35, '新增提示词规则：新评估优先、证据类型、对这款食品、四问留空', () => {
  const src = readFileSync('server/providers/researchPrompt.js', 'utf8');
  for (const phrase of ['新的适用权威评估','动物/体外结果','研究剂量不是产品含量','foodMeaning','特殊人群']) assertOk(src.includes(phrase), `缺少科学约束 ${phrase}`);
});

await t(36, '谷氨酸钠：大字是 EFSA 2017 的再评估，不再是「总膳食不构成危害」', () => {
  const fx = HEALTH_CASES.find((x) => x.key === 'msg');
  const r = validateHealthInsights({
    raw: fx.model.healthInsights,
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.stats.rejected, 0, r.rejected.map((x) => x.rejectReason).join('; '));
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
  assertOk(/EFSA/.test(view.headline.text), `大字不是 EFSA：${view.headline.text}`);
  assertOk(/30 mg\/kg/.test(view.headline.text), '没有保留组 ADI 数值');
  const all = JSON.stringify(r.insights);
  assertOk(!/不构成健康危害|无论[^。]{0,8}都/.test(all), '仍在做无条件安全结论');
  eq(r.insights.highIntake.answerKind, 'effect');
  assertOk(/头痛/.test(r.insights.highIntake.text), '没有写出具体人体反应');
  assertOk(/幼儿|儿童/.test(r.insights.sensitiveGroups.text), '没有点名超暴露人群');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
for (const f of failures) console.log('  ✗', f);
process.exit(fail === 0 ? 0 : 1);
