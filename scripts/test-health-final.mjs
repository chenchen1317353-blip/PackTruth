/**
 * 健康内容最终验收修复 · 专项测试（零成本、不联网）。
 *
 * 覆盖本轮三项修复：
 *   A 已存在的健康证据不再漏检（白砂糖龋齿/体重）
 *   B ADI 术语不再被扩大成无条件安全结论
 *   C 离线演示与真实模式使用同一套健康结构
 *
 * 以及 21 条验收要求里的其余项（化学形式、人群、拒绝、缓存、四个演示）。
 */

import { readFileSync } from 'node:fs';
import { HEALTH_CASES } from './fixtures/health-cases.mjs';
import { GENERAL_CASES } from './fixtures/health-general.mjs';
import { ACESULFAME_K, ACETIC_ACID } from './fixtures/v23-health.mjs';
import {
  checkHealthClaim,
  isTerminologySource,
  validateHealthInsights,
} from '../src/domain/evidence/healthGuard.js';
import { buildHealthView, buildIngredientCore } from '../src/app/ingredientView.js';
import { summarizeHealthAnswers } from '../src/domain/evidence/healthAnswer.js';
import { createDemoRecord, DEMO_SAMPLES } from '../src/domain/demoData.js';
import { getDemoResearch } from '../src/domain/ingredients/researchDemo.js';
import { buildDemoHealth, DEMO_HEALTH_CASES } from '../src/domain/ingredients/healthDemo.js';
import { parseIngredientText } from '../src/domain/ingredientStructure.js';
import { CHECK_STATUS } from '../src/domain/evidence/scientificGuard.js';

let pass = 0;
let fail = 0;
const rows = [];

function t(id, name, fn) {
  try {
    fn();
    pass += 1;
    rows.push({ id, name, ok: true });
    console.log(`  ✓ [${String(id).padStart(2)}] ${name}`);
  } catch (e) {
    fail += 1;
    rows.push({ id, name, ok: false, error: e.message });
    console.log(`  ✗ [${String(id).padStart(2)}] ${name}\n         ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
  }
}

const allCases = [
  ...HEALTH_CASES.filter((x) => !['acesulfame', 'acetic'].includes(x.key)),
  ACESULFAME_K,
  ACETIC_ACID,
];
const run = (fx) =>
  validateHealthInsights({
    raw: fx.model.healthInsights,
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
const viewOf = (fx) => buildHealthView({ healthInsights: run(fx).insights, healthSchema: 4 });
const sugar = GENERAL_CASES.find((x) => x.key === 'sugar');
const salt = GENERAL_CASES.find((x) => x.key === 'salt');

// ---------------------------------------------------------------- A 漏检

console.log('\n【A】已有健康证据不再漏检（1-6）');

t(1, '白砂糖：提取出龋齿风险，而不是只给摄入建议', () => {
  const r = run(sugar);
  assert(r.insights?.consumerTakeaway, '缺少消费者结论');
  assert(/龋齿/.test(r.insights.consumerTakeaway.text), '没有龋齿结论');
  assert(/龋齿/.test(r.insights.highIntake.text), '高摄入没有提到龋齿');
});

t(2, '白砂糖：长期过量与超重/肥胖的关系有原文支持', () => {
  const r = run(sugar);
  assert(/超重|肥胖/.test(r.insights.consumerTakeaway.text), '没有体重相关结论');
  assert(
    /major risk factor for overweight, obesity and dental caries/.test(
      r.insights.consumerTakeaway.quote,
    ),
    '原文不支持体重结论',
  );
});

t(3, '白砂糖：结论保留「长期膳食模式」条件，不写成单次致病', () => {
  const view = viewOf(sugar);
  assert(/长期/.test(view.headline.text), '缺少「长期」');
  assert(/长期/.test(view.headline.conditions), '条件里没有「长期」');
  assert(/不是指吃一次/.test(view.headline.conditions), '没有排除单次食用');
  assert(!/吃一次|马上|必然|一定/.test(view.headline.text), '写成了即时/必然');
});

t(4, '白砂糖：没有把完整水果/乳糖一并算作游离糖', () => {
  const text = Object.values(run(sugar).insights).map((x) => x.text).join('');
  assert(!/水果|乳糖|所有糖/.test(text), '扩大了游离糖的范围');
  assert(/游离糖/.test(text), '没有说明游离糖');
});

t(5, '食用盐：高钠与血压的证据仍在，且点名儿童', () => {
  const r = run(salt);
  assert(/血压/.test(r.insights.highIntake.text), '高摄入没有血压');
  assert(/儿童/.test(r.insights.sensitiveGroups.text), '没有儿童');
});

t(6, '焦亚硫酸钠 / 阿斯巴甜 / 三氯蔗糖的既有健康结论没有被削弱', () => {
  const sulfite = viewOf(allCases.find((x) => x.key === 'sulfite'));
  assert(/部分哮喘/.test(sulfite.rows.map((x) => x.text).join('')), '亚硫酸盐人群丢失');
  const asp = viewOf(allCases.find((x) => x.key === 'aspartame'));
  assert(/苯丙酮尿症/.test(asp.rows.map((x) => x.text).join('')), 'PKU 丢失');
  const suc = viewOf(allCases.find((x) => x.key === 'sucralose'));
  assert(/安全/.test(suc.headline.text), '三氯蔗糖结论丢失');
});

// ---------------------------------------------------------------- B 术语

console.log('\n【B】ADI 术语不再被扩大（7-14）');

t(7, '通用术语表能被识别，且不能当物质评估', () => {
  assert(isTerminologySource({ title: 'FAO/WHO 术语表（ANNEX 4: GLOSSARY）' }), '术语表未识别');
  assert(!isTerminologySource({ title: 'ACESULFAME POTASSIUM（JECFA）' }), '物质条目被误判');
});

t(8, '只有术语定义、却写「不构成健康危害」→ 拒绝或被降级', () => {
  const fx = allCases.find((x) => x.key === 'msg');
  const r = validateHealthInsights({
    raw: {
      consumerTakeaway: {
        text: '在 JECFA 评估的范围内，谷氨酸盐的总膳食摄入不构成健康危害。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1', 'W2'],
        quote:
          'A term applicable to a food substance of very low toxicity that, on the basis of the available chemical, biochemical and toxicological data as well as the total dietary intake of the substance, does not, in the opinion of the Joint FAO/WHO Expert Committee on Food Additives, represent a hazard to health.',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
  assert(
    /术语/.test(r.rejected[0].rejectReason),
    r.rejected[0].rejectReason,
  );
});

t(9, '「无需规定」不会被判成「已回答健康问题」', () => {
  // 谷氨酸钠已改用 EFSA 2017 的再评估，不再靠术语作答；
  // 这里用仍只有「无需规定」的核苷酸验证同一条规则。
  const fx = allCases.find((x) => x.key === 'ribonucleotide');
  const r = run(fx);
  const s = summarizeHealthAnswers({ insights: r.insights, rejected: r.rejected });
  eq(s.healthScore.answered, 0, 'ADE 术语被算成已回答');
  assert(s.healthScore.referenceOnly >= 1, '没有记成参考值');
  eq(viewOf(fx).headline, null);
});

t(10, '「not limited」不会被解释成「没有使用边界」', () => {
  const fx = allCases.find((x) => x.key === 'citric');
  const r = run(fx);
  const text = Object.values(r.insights).map((x) => x.text).join('');
  assert(/not limited/.test(text), '没有解释术语');
  assert(/不表示没有上限|不等于/.test(text), '没有说明不等于无边界');
  eq(viewOf(fx).headline, null);
});

t(11, '无条件「无危害」结论会被 H13 拦下', () => {
  const res = checkHealthClaim('JECFA 认为谷氨酸盐的总膳食摄入不构成健康危害。', {
    ingredientName: '谷氨酸钠',
  });
  eq(res.status, CHECK_STATUS.REJECT);
  assert(/适用范围|摄入条件/.test(res.issues[0].why), res.issues[0].why);
});

t(12, '带作用域的「没有安全关切」可以通过', () => {
  const res = checkHealthClaim('作为调味剂在当前摄入水平下，乳酸没有安全关切。', {
    ingredientName: '乳酸',
  });
  eq(res.status, CHECK_STATUS.PASS);
});

t(13, '把结论扩大成「无论摄入多少」→ 拒绝', () => {
  const res = checkHealthClaim('无论摄入多少，这种成分都不会有风险。', {
    ingredientName: '安赛蜜',
  });
  eq(res.status, CHECK_STATUS.REJECT);
});

t(14, '有物质专属评估时，保留用途与暴露条件', () => {
  const fx = allCases.find((x) => x.key === 'sucralose');
  const view = viewOf(fx);
  assert(view.headline.conditions.includes('获准'), '没有保留获准用途');
  const allQuotes = [view.headline.quote, ...view.rows.map((r) => r.quote)].join(' ');
  assert(/exposure|暴露/.test(allQuotes), '原文没有提到暴露');
});

// ---------------------------------------------------------------- C 化学形式与人群

console.log('\n【C】化学形式、人群与拒绝（15-19）');

t(15, 'EDTA：ADI 的计量基准与化学形式被保留', () => {
  const fx = allCases.find((x) => x.key === 'edta');
  const view = viewOf(fx);
  const all = view.deepFacts.map((x) => x.fullText).join('');
  assert(/2\.5 mg\/kg/.test(all), '缺少数值');
  assert(/以钙二钠 EDTA 计|计量基准是钙二钠 EDTA/.test(all), '缺少计量基准');
});

t(16, '不同化学形式不能互相套用：把 2.5 说成所有 EDTA 都适用 → 不进大字', () => {
  const fx = allCases.find((x) => x.key === 'edta');
  const r = validateHealthInsights({
    raw: {
      consumerTakeaway: {
        text: '所有 EDTA 形式的每日允许摄入量都是 2.5 mg/kg 体重，可以放心使用。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'The Committee established an ADI of 2.5 mg/kg bw/day in 1977',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: '乙二胺四乙酸二钠',
    aliases: fx.aliases,
  });
  const item = r.insights?.consumerTakeaway;
  assert(!item, '把不同化学形式混用了');
});

t(17, '没有来源点名时，不给特殊人群', () => {
  const fx = allCases.find((x) => x.key === 'sorbate');
  const r = validateHealthInsights({
    raw: {
      sensitiveGroups: {
        text: '肾病患者应少吃山梨酸钾。',
        evidenceStatus: 'supported',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-25 mg/kg bw',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
});

t(18, '被拒绝的健康结论不会进入大字区域', () => {
  const fx = allCases.find((x) => x.key === 'msg');
  const r = validateHealthInsights({
    raw: {
      consumerTakeaway: {
        text: 'GB 2760 允许使用它，所以正常吃没问题。',
        evidenceStatus: 'supported',
        sourceRefs: ['W1'],
        quote: 'SODIUM GLUTAMATE',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
  eq(view.headline, null);
  eq(view.rows.length, 0);
});

t(19, '没有真实人体后果证据时，不编造症状', () => {
  for (const key of ['sorbate', 'msg', 'citric']) {
    const fx = allCases.find((x) => x.key === key);
    const text = JSON.stringify(run(fx).insights || {});
    assert(
      !/肾损伤|肝损伤|致癌|中毒|失明|不孕/.test(text),
      `${fx.name} 编造了后果：${text.slice(0, 80)}`,
    );
  }
});

// ---------------------------------------------------------------- D 演示

console.log('\n【D】离线演示与真实模式一致（20-25）');

t(20, '演示健康数据经过同一个校验器，且结构版本一致', () => {
  for (const c of DEMO_HEALTH_CASES) {
    const h = buildDemoHealth(c.name);
    assert(h, `${c.name} 缺少演示健康数据`);
    eq(h.healthSchema, 4, `${c.name} 结构版本不对`);
    eq(h.healthProvenance, 'curated');
    for (const item of Object.values(h.healthInsights || {})) {
      assert(item.answerKind, `${c.name} 缺回答类型`);
      assert(item.quote, `${c.name} 缺原文`);
    }
  }
});

t(21, '三氯蔗糖演示：大字是 EFSA 评估，不是「和蔗糖不同」', () => {
  const demo = getDemoResearch('三氯蔗糖');
  const view = buildHealthView(demo);
  assert(view?.headline, '缺少大字结论');
  assert(!/两种不同|和蔗糖/.test(view.headline.text), '仍是名词差异');
  assert(/安全/.test(view.headline.text), '不是评估结论');
  assert(demo.demoCurated, '没有标记为人工整理');
});

t(22, '白砂糖演示：与真实路径给出同一结论', () => {
  const demo = getDemoResearch('白砂糖');
  const view = buildHealthView(demo);
  assert(/龋齿/.test(view.headline.text), '演示没有龋齿结论');
  eq(view.headline.answerKind, 'effect');
  eq(demo.searchCount, 0, '人工整理带了检索次数');
});

t(23, '预录不伪装成实时：没有检索词/检索轮次/假时间', () => {
  const demo = getDemoResearch('食用盐');
  eq(demo.query, null);
  eq(demo.searchCount, 0);
  eq(demo.retrievedAt, null);
  eq(demo.demoCurated, true);
});

t(24, '四个演示样品仍能构建，且配料完整', () => {
  for (const s of DEMO_SAMPLES) {
    const r = createDemoRecord(s.id);
    assert(r?.ingredients?.items?.length >= 3, `${s.id} 配料缺失`);
  }
});

t(25, '演示与真实模式使用同一套三问记账', () => {
  const demo = getDemoResearch('食用盐');
  const s = summarizeHealthAnswers({
    insights: demo.healthInsights,
    rejected: demo.healthRejected,
    evidenceFacts: demo.consumerEvidence.facts,
  });
  eq(s.healthScore.answered, demo.healthScore.answered);
  eq(s.healthAnswers.highIntake.status, demo.healthAnswers.highIntake.status);
});

// ---------------------------------------------------------------- E 回归与一致

console.log('\n【E】缓存、子成分与既有能力（26-31）');

t(26, '缓存键仍带结构版本，旧缓存不会覆盖新结论', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  const block = src.slice(src.indexOf('const cacheKey'), src.indexOf('const hit = cache.get(cacheKey)'));
  assert(/RESEARCH_SCHEMA_VERSION/.test(block), '缓存键没有结构版本');
  assert(/r6-consumer-quality-2026-11-04/.test(src), '版本号未更新');
});

t(27, '复合配料子成分走同一条链路', () => {
  const parsed = parseIngredientText('食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠）');
  const names = parsed.items[0].children.map((c) => c.name);
  assert(names.includes('谷氨酸钠'), '子成分解析失败');
  const fx = allCases.find((x) => x.name === '谷氨酸钠');
  const view = viewOf(fx);
  assert(view.headline || view.deepFacts.length, '子成分没有共享健康证据');
});

t(28, '真实联网结果与演示使用同一展示函数', () => {
  const code = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  assert(/buildHealthView/.test(code), '页面没有走统一健康视图');
  const demo = getDemoResearch('乳酸');
  const view = buildHealthView(demo);
  assert(view?.headline?.quoteSourceId, '演示缺少来源编号');
});

t(29, 'BYOK 请求头与调用上限逻辑未被改动', () => {
  const src = readFileSync('server/lib/byokBoundary.js', 'utf8');
  assert(/req\.get\('authorization'\)/.test(src), 'BYOK 头读取变了');
  assert(/maxCalls/.test(src), '调用上限逻辑变了');
});

t(30, '30 条包装宣传语与四个演示都在', () => {
  const rules = readFileSync('src/domain/claims/registry.js', 'utf8');
  const demo = readFileSync('src/domain/demoData.js', 'utf8');
  assert(/RULE_COUNT/.test(rules));
  assert(/DEMO_SAMPLES/.test(demo));
});

t(31, '大字结论不重复、不抢戏：有健康结论时深入分析不渲染大卡片', () => {
  const demo = getDemoResearch('三氯蔗糖');
  const core = buildIngredientCore({ card: null, research: demo });
  eq(core.suppressed, true);
  eq(core.headline, null);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
