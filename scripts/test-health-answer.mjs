/**
 * 消费者健康核心结论 · 资格判定与通用性测试（零成本、不联网）。
 *
 * 这份测试只回答一个问题：
 *   一句话能不能成为「健康上最值得知道什么」？
 *
 * 规则不是「给健康句加分」，而是资格制：
 *   标准编号 / 技术用途 / 食品类别 / 名词差异 / 只有 ADI 数字 / 只有 ADI 定义
 *   → 一律没有资格当核心结论，无论它在原文里排第几。
 *
 * 同时用普通食材（食用盐、白砂糖）、类别写法（香辛料）、
 * 本地未收录成分验证同一套流程对非添加剂也成立。
 */

import { readFileSync } from 'node:fs';
import {
  ANSWER_KIND,
  judgeAnswerKind,
  answersQuestion,
  pickConsumerHeadline,
  isTechnicalOnly,
} from '../src/domain/evidence/healthAnswer.js';
import { validateHealthInsights } from '../src/domain/evidence/healthGuard.js';
import { buildHealthView, buildHealthGapView, buildIngredientCore } from '../src/app/ingredientView.js';
import { summarizeHealthAnswers } from '../server/providers/ingredientResearch.js';
import { HEALTH_CASES } from './fixtures/health-cases.mjs';
import { ACESULFAME_K, ACETIC_ACID } from './fixtures/v23-health.mjs';
import { GENERAL_CASES } from './fixtures/health-general.mjs';
import { getDemoResearch } from '../src/domain/ingredients/researchDemo.js';

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

const ALL_ADDITIVES = [
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

// ---------------------------------------------------------------- A 资格判定

console.log('\n【A】一句话有没有资格当健康结论（1-12）');

const KIND_CASES = [
  [1, '安赛蜜是一种甜味剂。', 'normalIntake', ANSWER_KIND.NONE],
  [2, 'GB 2760 规定它的最大使用量为 0.3 g/kg。', 'normalIntake', ANSWER_KIND.NONE],
  [3, '三氯蔗糖和蔗糖是两种不同物质。', 'normalIntake', ANSWER_KIND.NONE],
  [4, '资料提到的护色工艺针对的是腌渍的食用菌和藻类，不是腌渍蔬菜。', 'limits', ANSWER_KIND.NONE],
  [5, '配料表不标注实际添加量，无法推算这款食品里有多少。', 'normalIntake', ANSWER_KIND.NONE],
  [6, '它的 ADI 是 0–15 mg/kg 体重。', 'normalIntake', ANSWER_KIND.REFERENCE],
  [7, 'ADI 是按体重计、终生每天摄入也不产生可觉察健康风险的估计量。', 'normalIntake', ANSWER_KIND.REFERENCE],
  [8, 'JECFA 在 2004 年的评估认为，乙酸在当前摄入水平下没有安全关切。', 'normalIntake', ANSWER_KIND.EVALUATION],
  [9, '部分哮喘患者摄入亚硫酸盐可能出现严重反应。', 'highIntake', ANSWER_KIND.EFFECT],
  [10, '苯丙酮尿症患者不适用这个 ADI。', 'sensitiveGroups', ANSWER_KIND.NAMED_GROUP],
  [11, '长期摄入超过 ADI 后的人体反应，现有资料没有给出。', 'highIntake', ANSWER_KIND.REFERENCE],
  [12, '它是一种防腐剂，用于抑制霉菌。', 'normalIntake', ANSWER_KIND.NONE],
];

for (const [id, text, slot, want] of KIND_CASES) {
  t(id, `判定：${text.slice(0, 22)}… → ${want}`, () => {
    eq(judgeAnswerKind({ slot, text }), want);
  });
}

// ---------------------------------------------------------------- B 回答资格

console.log('\n【B】「有字」不等于「回答了问题」（13-20）');

t(13, 'ADI 数字不能算回答了「摄入过多会怎样」', () => {
  eq(answersQuestion(ANSWER_KIND.REFERENCE, 'highIntake'), false);
  eq(answersQuestion(ANSWER_KIND.EVALUATION, 'highIntake'), false);
  eq(answersQuestion(ANSWER_KIND.EFFECT, 'highIntake'), true);
});

t(14, 'ADI 定义不能成为「最值得知道的一句」', () => {
  const r = validateHealthInsights({
    raw: {
      consumerTakeaway: {
        text: '它的 ADI 是 0–15 mg/kg 体重。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-15 mg/kg bw',
      },
    },
    evidenceSet: [ACESULFAME_K.sources[0]],
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
  });
  eq(r.insights, null);
  assert(
    r.rejected[0].rejectReason.includes('参考'),
    r.rejected[0].rejectReason,
  );
});

t(15, '「和蔗糖不同」不能成为健康核心结论', () => {
  const text = '三氯蔗糖和蔗糖是两种不同物质，不能混为一谈。';
  assert(isTechnicalOnly(text), '未被识别为技术/名词差异');
  eq(judgeAnswerKind({ slot: 'normalIntake', text }), ANSWER_KIND.NONE);
});

t(16, '标准编号 + 使用范围不能成为健康核心结论', () => {
  const text = 'GB 2760-2024 规定它在腌渍蔬菜中的最大使用量按表 A.1 执行。';
  eq(judgeAnswerKind({ slot: 'normalIntake', text }), ANSWER_KIND.NONE);
});

t(17, '只有参考值时，页面不给大字结论，只给「健康参考」', () => {
  const view = buildHealthView({
    healthSchema: 4,
    healthInsights: {
      highIntake: {
        text: '它的 ADI 是 0–25 mg/kg 体重。',
        answerKind: 'reference',
        answersQuestion: false,
        headlineEligible: false,
        evidenceStatus: 'authoritative',
        evidenceLabel: '权威评估直接支持',
        sourceRefs: ['W1'],
      },
    },
  });
  eq(view.headline, null);
  eq(view.answered, false);
  eq(view.rows.length, 0);
  assert(view.gaps.length === 1, '资料不足应合并为一条说明');
});

t(18, '评估结论可以当标题，参考值永远排在它后面', () => {
  const insights = {
    consumerTakeaway: {
      text: 'ADI 是 0–15 mg/kg 体重。',
      answerKind: 'reference',
      answersQuestion: false,
      headlineEligible: false,
      evidenceStatus: 'authoritative',
      evidenceLabel: '权威评估直接支持',
      sourceRefs: ['W1'],
    },
    normalIntake: {
      text: 'JECFA 的评估认为，当前摄入水平下没有安全关切。',
      answerKind: 'evaluation',
      answersQuestion: true,
      headlineEligible: true,
      evidenceStatus: 'authoritative',
      evidenceLabel: '权威评估直接支持',
      sourceRefs: ['W1'],
    },
  };
  const picked = pickConsumerHeadline(insights);
  eq(picked.slot, 'normalIntake');
});

t(19, '三个问题的统计不再把 ADI 算成「已回答」', () => {
  const s = summarizeHealthAnswers({
    insights: {
      highIntake: { answersQuestion: false, answerKind: 'reference' },
    },
  });
  eq(s.healthScore.answered, 0);
  eq(s.healthScore.referenceOnly, 1);
  eq(s.healthAnswers.highIntake.status, 'reference_only');
});

t(20, '消费者结论本身是评估时，也计入「正常食用已回答」', () => {
  const s = summarizeHealthAnswers({
    insights: {
      consumerTakeaway: { answersQuestion: true, answerKind: 'evaluation' },
    },
  });
  eq(s.healthAnswers.normalIntake.status, 'answered');
  eq(s.healthAnswers.normalIntake.via, 'consumerTakeaway');
});

// ---------------------------------------------------------------- C 内容质量

console.log('\n【C】12 种添加剂：大字结论的内容质量（21-32）');

const FORBIDDEN_HEADLINE = [
  [/(GB|CNS|INS)\s?\/?\s?T?\s?\d/i, '标准编号'],
  [/最大使用量|使用范围|食品分类号|食品分类|食品类别/, '使用规定/类别'],
  [/(甜味剂|防腐剂|酸度调节剂|增稠剂|乳化剂|护色剂|抗氧化剂).{0,4}的一种|(功能|作用)(是|为)/, '技术功能'],
  [/两种不同|不是同一(种|回事)|和.{1,8}不同/, '名词差异'],
  [/^[^。]{0,20}ADI\s*(是|为|=)?\s*[0-9]/, '只有 ADI 数值'],
  [/^ADI\s*(是|指的是)|终生每天摄入也不产生可觉察健康风险的估计量$/, '只有 ADI 定义'],
  [/没有(实际)?添加量|无法(推算|判断)/, '以「没有添加量」代替结论'],
  [/^(无法|不能|资料不足)/, '免责声明'],
];

for (const [i, fx] of ALL_ADDITIVES.entries()) {
  t(21 + i, `${fx.name}：大字结论不是技术结论`, () => {
    const r = run(fx);
    const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
    if (!view?.headline) {
      // 山梨酸钾这类只有参考值的成分允许没有大字结论，但必须没有硬凑
      if (view) eq(view.answered, false, '没有合格结论时不应标记为已回答');
      else eq(r.insights, null, '没有视图却仍有健康条目');
      return;
    }
    for (const [re, label] of FORBIDDEN_HEADLINE) {
      assert(!re.test(view.headline.text), `大字结论属于「${label}」：${view.headline.text}`);
    }
    assert(
      ['evaluation', 'effect', 'named_group'].includes(view.headline.answerKind),
      `大字结论的回答类型不合格：${view.headline.answerKind}`,
    );
    assert(view.headline.text.length <= 80, `大字结论过长：${view.headline.text.length}`);
  });
}

t(33, '有健康结论时，深入分析不再重复一张「核心结论」大卡片', () => {
  const fx = ACETIC_ACID;
  const research = {
    healthSchema: 4,
    healthInsights: run(fx).insights,
    sections: [
      {
        id: 's1',
        section: 'limits',
        text: '最大使用量按 GB 2760-2024 表 A.1 执行，食品分类号 12.10。',
        verified: true,
        sourceRefs: ['W1'],
        scientificCheck: { status: 'pass' },
      },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  eq(core.suppressed, true);
  eq(core.headline, null);
});

t(34, '没有健康结论时，技术细节只能是普通字号的「科学背景」', () => {
  const research = {
    status: 'ok',
    healthInsights: null,
    sections: [
      {
        id: 's1',
        section: 'limits',
        text: '最大使用量按 GB 2760-2024 表 A.1 执行，食品分类号 12.10。',
        verified: true,
        sourceRefs: ['W1'],
        scientificCheck: { status: 'pass' },
      },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  eq(core.suppressed, false);
  eq(core.label, '科学背景');
  eq(core.headline, null);
  eq(core.tone, 'quiet');
  assert(core.explanation.length > 0, '没有给出背景说明');
});

// ---------------------------------------------------------------- D 通用性

console.log('\n【D】非添加剂也走同一套流程（35-44）');

const runGeneral = (fx) =>
  validateHealthInsights({
    raw: fx.model.healthInsights,
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });

t(35, '食用盐（普通食材）：同样能回答三个问题', () => {
  const r = runGeneral(GENERAL_CASES.find((x) => x.key === 'salt'));
  const s = summarizeHealthAnswers({ insights: r.insights, rejected: r.rejected });
  eq(s.healthScore.answered, 3, `实际：${JSON.stringify(s.healthAnswers)}`);
  assert(/血压/.test(r.insights.highIntake.text), '高摄入没有给出真实影响');
  assert(/儿童/.test(r.insights.sensitiveGroups.text), '没有点名儿童');
});

t(36, '食用盐：正常食用给的是膳食建议，不是添加剂式 ADI', () => {
  const r = runGeneral(GENERAL_CASES.find((x) => x.key === 'salt'));
  assert(/2000 mg|5 g/.test(r.insights.normalIntake.text), '缺少钠摄入建议');
  eq(r.insights.normalIntake.answerKind, 'reference', '膳食建议应按参考值展示');
});

t(37, '白砂糖：有龋齿/体重证据时给出结论，并保留条件', () => {
  const fx = GENERAL_CASES.find((x) => x.key === 'sugar');
  const r = runGeneral(fx);
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
  assert(view.headline, '白砂糖缺少大字结论');
  assert(/龋齿/.test(view.headline.text), `没有提取龋齿证据：${view.headline.text}`);
  assert(/超重|肥胖|体重/.test(view.headline.text), '没有覆盖体重相关证据');
  const cond = view.headline.conditions || '';
  assert(/长期/.test(cond), '缺少「长期膳食模式」这一条件');
  assert(/不是指吃一次/.test(cond), '没有区分单次食用');
  eq(r.insights.highIntake.answerKind, 'effect');
  // 不能扩大成「所有糖」或疾病必然发生
  assert(!/所有糖|包括水果|必然|一定|糖尿病/.test(view.headline.text), '出现了超出证据的说法');
});

t(37.5, '白砂糖：游离糖的定义没有被扩大成「所有天然糖」', () => {
  const fx = GENERAL_CASES.find((x) => x.key === 'sugar');
  const r = runGeneral(fx);
  const all = Object.values(r.insights).map((x) => x.text).join('');
  assert(!/水果|乳糖|所有糖/.test(all), '把完整水果或乳糖也算进了游离糖');
  assert(/游离糖/.test(all), '没有说明游离糖这一前提');
});


t(38, '香辛料（类别写法）：没有健康结论，也不编', () => {
  const fx = GENERAL_CASES.find((x) => x.key === 'spice');
  eq(fx.model.healthInsights, null);
  const research = {
    status: 'ok',
    healthSchema: 4,
    identity: fx.identity,
    healthInsights: null,
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false },
    healthRoundUsed: true,
  };
  const gap = buildHealthGapView(research);
  assert(gap && gap.text.includes('身份与用途'), gap?.text);
  const view = buildHealthView(research, {name:'香辛料'});
  eq(view.headline, null);
  eq(view.rows.length, 0);
  eq(view.gaps.length, 1);
});

t(39, '本地未收录成分：没有资料就只说资料不足', () => {
  const fx = GENERAL_CASES.find((x) => x.key === 'unknown');
  const research = {
    status: 'partial',
    healthSchema: 4,
    identity: fx.identity,
    healthInsights: null,
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false },
    healthRoundUsed: true,
  };
  const gap = buildHealthGapView(research);
  assert(/检索都没有取得/.test(gap.text), gap.text);
  assert(!/安全|有害|毒性/.test(gap.text), '缺口说明里出现了安全判断');
});

t(40, '普通食材没有健康资料时，不套添加剂说法', () => {
  const research = {
    status: 'ok',
    healthSchema: 4,
    identity: { type: 'food_ingredient' },
    healthInsights: null,
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false },
    healthRoundUsed: true,
  };
  const gap = buildHealthGapView(research);
  assert(gap.text.includes('普通食材'), gap.text);
  assert(!gap.text.includes('ADI'), '给普通食材套了 ADI');
});

t(41, '复合配料里的子成分走同一条链路', () => {
  // 括号里的成分由 ingredientStructure 解析后，逐个用同一个 name 调用研究接口
  const childName = '谷氨酸钠';
  const fx = ALL_ADDITIVES.find((x) => x.name === childName);
  const r = run(fx);
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
  // 子成分用同一个 name 走同一条链路：谷氨酸钠现在能拿到 EFSA 2017 的再评估
  assert(view.headline, '子成分没有拿到健康结论');
  assert(/EFSA/.test(view.headline.text), `大字不是 EFSA：${view.headline.text}`);
  assert(view.deepFacts.some((x) => x.answerKind === 'effect'), '具体人体反应必须仍在共享证据中');
  assert(!/不构成健康危害|绝对安全|无论.{0,6}都/.test(JSON.stringify(r.insights)), '仍在做无条件结论');
});


t(42, '离线演示资料已按当前健康结构重做，且不伪装成实时结果', () => {
  const demo = getDemoResearch('三氯蔗糖');
  assert(demo, '预录数据不存在');
  eq(demo.healthSchema, 4);
  eq(demo.demoCurated, true);
  const view = buildHealthView(demo);
  eq(view.legacy, false);
  assert(view.headline, '演示缺少大字结论');
  assert(/安全/.test(view.headline.text), `演示结论不是评估：${view.headline.text}`);
  // 健康部分必须标明是人工整理；身份部分可以沿用原始检索
  eq(demo.healthProvenance, 'curated');
  assert(demo.healthReviewedAt, '缺少整理日期');
  assert(demo.healthStats.accepted > 0, '整理后的健康条目没有通过校验');
});


t(43, '缓存键包含结构版本，旧缓存不会继续展示', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  const block = src.slice(src.indexOf('const cacheKey'), src.indexOf('const hit = cache.get(cacheKey)'));
  assert(/RESEARCH_SCHEMA_VERSION/.test(block), '缓存键没有带结构版本');
  assert(/r6-consumer-quality-2026-11-04/.test(src), '结构版本号没有更新');
});

t(44, '新增结构版本随结果返回，预录/缓存据此判断', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  assert(/healthSchema: HEALTH_SCHEMA_VERSION/.test(src), '结果里没有 healthSchema');
  const view = buildHealthView({
    healthSchema: 3,
    healthInsights: {
      normalIntake: {
        text: 'JECFA 的评估认为，当前摄入水平下没有安全关切。',
        answerKind: 'evaluation',
        answersQuestion: true,
        headlineEligible: true,
        evidenceStatus: 'authoritative',
        evidenceLabel: '权威评估直接支持',
        sourceRefs: ['W1'],
      },
    },
  });
  eq(view.legacy, true);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
