/**
 * PackTruth 12 种食品添加剂 · 健康科普验收集（零成本、不联网）。
 *
 * 每条样本的证据文本逐字取自 WHO / FAO / EFSA / FDA 的公开页面，
 * 健康结论经过真实的 validateHealthInsights（原文锚点 + 数字核对 + 人群点名）。
 *
 * 这份测试证明的是「机制对所有成分通用」，而不是「两个例子调好了」：
 *   A 身份与别名：中文名、英文名、INS 编号是否对得上
 *   B 三个问题：正常食用 / 摄入过多 / 特殊人群，各自有没有真正回答
 *   C 核心结论：只能来自回答过问题的健康条目
 *   D 反例：无依据的人群清单、跨物质套用、把使用标准当健康结论
 *   E 展示：没有资格就不放大，有资格就不重复
 */

import { readFileSync } from 'node:fs';
import { HEALTH_CASES, STANDARD_ONLY } from './fixtures/health-cases.mjs';
import { ACESULFAME_K, ACETIC_ACID, buildReplayResearch } from './fixtures/v23-health.mjs';
import { GENERAL_CASES } from './fixtures/health-general.mjs';
import { validateHealthInsights } from '../src/domain/evidence/healthGuard.js';
import {
  findHealthEvidence,
  classifyEvidenceKind,
  EVIDENCE_KIND,
} from '../src/domain/evidence/healthEvidence.js';
import { buildHealthView, buildHealthGapView, buildIngredientCore } from '../src/app/ingredientView.js';
import { buildIngredientCard, matchIngredient } from '../src/domain/ingredients/index.js';
import { mergeAliases } from '../src/domain/ingredients/aliasSeeds.js';
import { buildSearchQuery } from '../server/lib/searchQuery.js';
import { summarizeHealthAnswers } from '../server/providers/ingredientResearch.js';

let pass = 0;
let fail = 0;
const rows = [];

function t(id, name, fn) {
  try {
    fn();
    pass += 1;
    rows.push({ id, name, ok: true });
    console.log('  ✓ [' + String(id).padStart(2) + '] ' + name);
  } catch (e) {
    fail += 1;
    rows.push({ id, name, ok: false, error: e.message });
    console.log('  ✗ [' + String(id).padStart(2) + '] ' + name + '\n         ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a));
  }
}

const ALL = [
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

const answers = (fx) => {
  const r = run(fx);
  const s = summarizeHealthAnswers({ insights: r.insights, rejected: r.rejected });
  return { r, s };
};

/**
 * 三个问题的期望：true = 这一项真的回答了问题。
 * highIntake 为 true 的只有焦亚硫酸钠（确实写明了高摄入下的反应）；
 * 其余成分只有参考值 —— 这是事实，不是遗漏。
 */
const EXPECT = {
  // EFSA 2017 再评估：组 ADI、超暴露人群、头痛等人体反应、幼儿与儿童
  msg: { normal: true, high: true, sensitive: true, headline: true },
  ribonucleotide: { normal: false, high: false, sensitive: false, headline: false },
  citric: { normal: false, high: false, sensitive: false, headline: false },
  acetic: { normal: true, high: false, sensitive: false, headline: true },
  lactic: { normal: true, high: false, sensitive: true, headline: true },
  sulfite: { normal: true, high: true, sensitive: true, headline: true },
  edta: { normal: true, high: false, sensitive: false, headline: true },
  acesulfame: { normal: true, high: false, sensitive: false, headline: true },
  sucralose: { normal: true, high: false, sensitive: false, headline: true },
  sorbate: { normal: false, high: false, sensitive: false, headline: false },
  aspartame: { normal: true, high: false, sensitive: true, headline: true },
  flavouring: { normal: false, high: false, sensitive: false, headline: false },
};

console.log('\n【A】身份与检索词（1-12）');

for (const [i, fx] of ALL.entries()) {
  t(i + 1, fx.name + '：中文名 / 英文名 / INS 与检索词', () => {
    const aliases = mergeAliases(fx.name, fx.aliases);
    assert(aliases.length > 0, '没有英文别名，检索只能命中中文页面');
    const q = buildSearchQuery(fx.name, aliases);
    assert(q.length <= 128, '查询词超长：' + q.length);
    const joined = fx.sources.map((s) => s.title + '\n' + s.excerpt).join('\n');
    if (fx.ins) {
      const wanted = fx.sourceIns || fx.ins.replace('INS ', '');
      assert(joined.includes(wanted), '来源里没有 ' + fx.ins + ' 编号');
    }
    if (fx.key !== 'flavouring') {
      assert(fx.sources.length >= 1);
      assert(/who\.int|fao\.org|efsa\.europa\.eu|fda\.gov/.test(fx.sources[0].url), '首选来源不是权威域名');
    }
  });
}

console.log('\n【B】三个问题是否真的被回答（13-24）');

for (const [i, fx] of ALL.entries()) {
  t(13 + i, fx.name + '：三个问题的回答状态与回答类型', () => {
    const exp = EXPECT[fx.key];
    const { r, s } = answers(fx);

    if (fx.key === 'flavouring') {
      eq(findHealthEvidence(fx.sources, { names: [fx.name, ...fx.aliases] }).available, false);
      eq(r.stats.accepted, 0);
      return;
    }

    eq(r.stats.rejected, 0, '有健康条目被拒：' + r.rejected.map((x) => x.rejectReason).join('; '));

    const status = (k) => s.healthAnswers[k].status === 'answered';
    eq(status('normalIntake'), exp.normal, '正常食用的回答状态与预期不符');
    eq(status('highIntake'), exp.high, '摄入过多的回答状态与预期不符');
    eq(status('sensitiveGroups'), exp.sensitive, '特殊人群的回答状态与预期不符');

    for (const [slot, item] of Object.entries(r.insights || {})) {
      assert(
        ['evaluation', 'effect', 'reference', 'named_group'].includes(item.answerKind),
        slot + ' 缺回答类型',
      );
      if (slot === 'highIntake' && item.answerKind === 'reference') {
        eq(item.answersQuestion, false, 'ADI 参考值被标成已回答');
      }
    }
  });
}

console.log('\n【C】核心结论只能来自回答过问题的健康条目（25-33）');

const FORBIDDEN = /(GB|CNS|INS)\s?\d|最大使用量|食品分类|适用范围|两种不同|不是同一|无法判断|不能确认|资料不足/;

for (const [i, fx] of ALL.entries()) {
  t(25 + i, fx.name + '：大字结论的资格与内容', () => {
    const { r } = answers(fx);
    const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
    const exp = EXPECT[fx.key];

    if (!exp.headline) {
      assert(!view?.headline, '不应有大字结论：' + view?.headline?.text);
      return;
    }
    assert(view?.headline, '缺少大字结论');
    assert(!FORBIDDEN.test(view.headline.text), '大字结论是技术内容：' + view.headline.text);
    assert(
      ['evaluation', 'effect', 'named_group'].includes(view.headline.answerKind),
      '大字结论类型不合格：' + view.headline.answerKind,
    );
  });
}

t(37, '有健康结论时，深入分析不再重复大卡片', () => {
  const fx = ACETIC_ACID;
  const research = buildReplayResearch(fx, { identity: fx.identity });
  const core = buildIngredientCore({ card: buildIngredientCard(matchIngredient(fx.name)), research });
  eq(core.suppressed, true);
});

t(38, '没有健康结论时，技术内容退为普通字号的科学背景', () => {
  const fx = STANDARD_ONLY;
  const research = buildReplayResearch(fx, { identity: fx.identity });
  const core = buildIngredientCore({ card: null, research });
  eq(core.suppressed, false);
  eq(core.label, '科学背景');
  eq(core.headline, null);
});

t(39, 'EDTA 二钠：大字结论不是「腌渍菌藻 vs 腌渍蔬菜」', () => {
  const fx = ALL.find((x) => x.key === 'edta');
  const { r } = answers(fx);
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
  assert(!/腌渍|食用菌|藻类/.test(view.headline.text), '仍是类别说明：' + view.headline.text);
  assert(/EDTA/.test(view.headline.text), '没讲这个物质：' + view.headline.text);
});

t(40, 'EDTA 二钠：ADI 的「以钙二钠 EDTA 计」限定被保留', () => {
  const fx = ALL.find((x) => x.key === 'edta');
  const { r } = answers(fx);
  const text = Object.values(r.insights).map((x) => x.text).join('');
  assert(/2\.5 mg\/kg/.test(text), '缺少 ADI 数值');
  assert(/以钙二钠 EDTA 计|计量基准是钙二钠 EDTA/.test(text), '没有保留计量基准');
});

t(41, 'EDTA 二钠：没有人体高摄入后果证据时不编肾损伤', () => {
  const fx = ALL.find((x) => x.key === 'edta');
  const { r } = answers(fx);
  const all = Object.values(r.insights).map((x) => x.text).join('');
  assert(!/肾损伤|肝损伤|肾衰/.test(all), '凭空写了器官损伤');
  eq(r.insights.highIntake.answerKind, 'reference', '高摄入被当成了已发现的影响');
});

t(42, '焦亚硫酸钠：人群限定是「部分哮喘患者」', () => {
  const fx = ALL.find((x) => x.key === 'sulfite');
  const { r } = answers(fx);
  const text = r.insights.sensitiveGroups.text;
  assert(/部分哮喘/.test(text), '没有保留「部分」：' + text);
  assert(!/所有哮喘|哮喘患者都应/.test(text), '把限定扩大了');
});

t(43, '焦亚硫酸钠：高摄入后果来自真实资料，不是 ADI 换算', () => {
  const fx = ALL.find((x) => x.key === 'sulfite');
  const { r } = answers(fx);
  assert(/10 mg/.test(r.insights.highIntake.text), '缺少具体剂量');
  assert(/反应/.test(r.insights.highIntake.text), '没有写具体反应');
  eq(r.insights.highIntake.answerKind, 'effect');
});

t(44, '阿斯巴甜：PKU 人群提示写明 ADI 不适用', () => {
  const fx = ALL.find((x) => x.key === 'aspartame');
  const { r } = answers(fx);
  assert(/苯丙酮尿症/.test(r.insights.sensitiveGroups.text), '缺少 PKU');
  assert(/不适用/.test(r.insights.sensitiveGroups.text), '没有说明 ADI 不适用');
  eq(r.insights.sensitiveGroups.quoteSourceId, 'W2');
});

t(45, '安赛蜜：采用 EFSA 近年再评估，而不是只报 JECFA 旧 ADI', () => {
  const fx = ALL.find((x) => x.key === 'acesulfame');
  const { r } = answers(fx);
  const text = Object.values(r.insights).map((x) => x.text).join('');
  assert(/没有安全担忧/.test(text), '没有采用再评估结论');
  assert(r.insights.consumerTakeaway.sourceRefs.includes('W3'), '没有引用 EFSA 来源');
});

t(46, '三氯蔗糖：使用 EFSA 再评估结论，并保留高温用途的不确定性', () => {
  const fx = ALL.find((x) => x.key === 'sucralose');
  const { r } = answers(fx);
  assert(/安全/.test(r.insights.consumerTakeaway.text), '没有采用再评估结论');
  assert(/高温/.test(r.insights.consumerTakeaway.conditions || ''), '没有保留高温用途的限定');
});

t(47, '谷氨酸钠 / 核苷酸 / 柠檬酸：把「无需规定」讲成低毒性判断，不是无限量', () => {
  // 谷氨酸钠现在采用 EFSA 2017 的再评估（组 ADI + 超暴露人群），
  // 不再依赖「无需规定」这一术语；这里验证的仍是「术语不能讲成无限量」。
  for (const key of ['ribonucleotide', 'citric']) {
    const fx = ALL.find((x) => x.key === key);
    const { r } = answers(fx);
    const text = Object.values(r.insights).map((x) => x.text).join('');
    assert(/not limited|无需规定|not specified/.test(text), fx.name + ' 没有解释术语');
    const affirmative = text.replace(
      /(不是|不等于|并非|并不是)[^。；]{0,14}(无限量|无限吃|随便吃)[^。；]{0,6}/g,
      '',
    );
    assert(!/可以无限量|可以随便吃/.test(affirmative), fx.name + ' 把术语讲成了无限量');
  }
});

console.log('\n【D】反例与降级（48-56）');

t(48, '只有 GB 标准时：不生成健康结论，只说明缺口', () => {
  const fx = STANDARD_ONLY;
  const r = run(fx);
  eq(findHealthEvidence(fx.sources, { names: [fx.name, ...fx.aliases] }).available, false);
  eq(r.stats.accepted, 0);
  eq(classifyEvidenceKind(fx.sources[0]).kind, EVIDENCE_KIND.STANDARD);
});

t(49, '把 GB 最大使用量当健康结论 → 拒绝', () => {
  const fx = STANDARD_ONLY;
  const r = validateHealthInsights({
    raw: {
      normalIntake: {
        text: 'GB 2760 规定了安赛蜜的最大使用量，所以正常吃没问题。',
        evidenceStatus: 'supported',
        sourceRefs: ['W1'],
        quote: '最大使用量按 GB 2760-2024 表 A.1 执行',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
});

t(50, '把技术用途当健康结论 → 拒绝', () => {
  const fx = ALL.find((x) => x.key === 'sucralose');
  const r = validateHealthInsights({
    raw: {
      normalIntake: {
        text: '三氯蔗糖是一种甜味剂。',
        evidenceStatus: 'supported',
        sourceRefs: ['W1'],
        quote: 'SUCRALOSE',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
  assert(r.rejected[0].rejectReason.includes('不是健康结论'), r.rejected[0].rejectReason);
});

t(51, '没有来源支持的人群清单（肾病 / 孕妇 / 糖尿病）→ 拒绝', () => {
  const fx = ALL.find((x) => x.key === 'sucralose');
  const r = validateHealthInsights({
    raw: {
      sensitiveGroups: {
        text: '肾病患者、孕妇和糖尿病患者应避免食用。',
        evidenceStatus: 'supported',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-15 mg/kg bw',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
});

t(52, '跨物质套用：把阿斯巴甜的 PKU 提示安到三氯蔗糖上 → 拒绝', () => {
  const fx = ALL.find((x) => x.key === 'sucralose');
  const r = validateHealthInsights({
    raw: {
      sensitiveGroups: {
        text: '苯丙酮尿症患者需要限制三氯蔗糖。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-15 mg/kg bw',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
});

t(53, '健康缺口只有一句说明，不重复三遍「没有证据」', () => {
  const research = buildReplayResearch(HEALTH_CASES.find((x) => x.key === 'flavouring'));
  const gap = buildHealthGapView(research);
  assert(gap, '没有缺口说明');
  assert((gap.text.match(/没有|未/g) || []).length <= 2, '重复太多否定：' + gap.text);
});

t(54, '有健康结论时不会同时显示缺口提示', () => {
  const research = buildReplayResearch(ALL.find((x) => x.key === 'aspartame'));
  eq(buildHealthGapView(research), null);
});

t(55, '证据类型标签覆盖五类，技术标准不会被当成风险评估', () => {
  const samples = [
    ['W1', 'GB 2760-2024 最大使用量 食品分类号 14.04', EVIDENCE_KIND.STANDARD],
    ['W2', 'JECFA Evaluation year: 1990. ADI: 0-15 mg/kg bw', EVIDENCE_KIND.RISK],
    ['W3', 'The label must warn individuals with phenylketonuria (PKU)', EVIDENCE_KIND.SENSITIVE],
    ['W4', '大鼠 90 天喂养试验，NOAEL 为 500 mg/kg', EVIDENCE_KIND.ANIMAL],
    ['W5', '随机对照试验，受试者 120 人', EVIDENCE_KIND.HUMAN],
  ];
  for (const [id, excerpt, want] of samples) {
    eq(classifyEvidenceKind({ id, title: '', excerpt }).kind, want, id + ' 分类错误');
  }
});

t(56, '非添加剂样本也走同一流程（食用盐 / 白砂糖 / 香辛料 / 未知）', () => {
  const salt = GENERAL_CASES.find((x) => x.key === 'salt');
  const r = validateHealthInsights({
    raw: salt.model.healthInsights,
    evidenceSet: salt.sources,
    ingredientName: salt.name,
    aliases: salt.aliases,
  });
  const s = summarizeHealthAnswers({ insights: r.insights, rejected: r.rejected });
  eq(s.healthScore.answered, 3);
  for (const key of ['spice', 'unknown', 'bamboo', 'polylysine']) {
    const fx = GENERAL_CASES.find((x) => x.key === key);
    const rr = validateHealthInsights({
      raw: fx.model.healthInsights,
      evidenceSet: fx.sources,
      ingredientName: fx.name,
      aliases: fx.aliases,
    });
    eq(rr.insights?.consumerTakeaway, undefined, fx.name + ' 硬造了核心结论');
  }
  // 白砂糖有真实龋齿/体重证据，应当能给出核心结论
  const sugar = GENERAL_CASES.find((x) => x.key === 'sugar');
  const sr = validateHealthInsights({
    raw: sugar.model.healthInsights,
    evidenceSet: sugar.sources,
    ingredientName: sugar.name,
    aliases: sugar.aliases,
  });
  assert(/龋齿/.test(sr.insights.consumerTakeaway.text), '白砂糖没有提取龋齿证据');
});

console.log('\n【E】展示与回归（57-64）');

t(57, '每条健康结论都能翻到原文（quote + 来源编号）', () => {
  for (const fx of ALL) {
    const { r } = answers(fx);
    for (const [slot, item] of Object.entries(r.insights || {})) {
      assert(item.quote, fx.name + '/' + slot + ' 缺原文');
      assert(item.quoteSourceId, fx.name + '/' + slot + ' 缺来源编号');
    }
  }
});

t(58, '人群提示只出现在有来源支持的地方', () => {
  const withGroups = ALL.filter((fx) => answers(fx).r.insights?.sensitiveGroups).length;
  eq(withGroups, 4, '有来源支持的人群提示数量变了');
});

t(59, '仅参考值不冒充具体健康后果；原文保留在深入区', () => {
  const view = buildHealthView({
    healthSchema: 4,
    sources: [{id:'W1', title:'ADI assessment', excerpt:'ADI: 0–25 mg/kg bw'}],
    healthInsights: {
      highIntake: {
        text: '它的 ADI 是 0–25 mg/kg 体重。',
        answerKind: 'reference',
        answersQuestion: false,
        headlineEligible: false,
        evidenceStatus: 'authoritative',
        evidenceLabel: '权威评估直接支持',
        sourceRefs: ['W1'],
        quote: 'ADI: 0–25 mg/kg bw',
      },
    },
  });
  eq(view.rows.length, 0);
  eq(view.headline, null);
  eq(view.gaps.length, 1);
  assert(view.deepFacts.some(f=>f.answerKind==='reference' && /0–25/.test(f.fullText)));
});

t(60, '费用与预算文案：最多 7 轮 + 规划上限，且不承诺「一定找到」', () => {
  const src = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  assert(/最多使用 7 轮联网检索/.test(src));
  assert(/3 次研究规划/.test(src));
  assert(/DeepSeek 账户[^\n]{0,12}承担/.test(src));
});

t(61, '四个演示样品与 30 条宣传语仍在（回归）', () => {
  const demo = readFileSync('src/domain/demoData.js', 'utf8');
  const rules = readFileSync('src/domain/claims/registry.js', 'utf8');
  assert(/DEMO_SAMPLES/.test(demo));
  assert(/RULE_COUNT/.test(rules));
});

t(62, '12 种成分在结果页都能匹配到本地卡片或给出类别解释', () => {
  for (const fx of ALL) {
    if (fx.key === 'flavouring') continue;
    const card = buildIngredientCard(matchIngredient(fx.name));
    assert(card || matchIngredient(fx.name).status !== 'matched', fx.name + ' 匹配异常');
  }
});

t(63, '12 种成分的大字结论逐条打印（供人工核对）', () => {
  for (const fx of ALL) {
    const { r } = answers(fx);
    const view = buildHealthView({ healthInsights: r.insights, healthSchema: 4 });
    console.log('       ' + fx.name.padEnd(10, '　') + ' ' + (view?.headline?.text || '（无大字结论，仅健康参考）'));
  }
});

t(64, '报告口径：已回答数不等于字段数', () => {
  const totals = ALL.map((fx) => answers(fx).s.healthScore);
  const answered = totals.reduce((n, x) => n + x.answered, 0);
  const reference = totals.reduce((n, x) => n + x.referenceOnly, 0);
  assert(answered < ALL.length * 3, '把每一格都算成了已回答');
  assert(reference > 0, '参考值没有被单独统计');
  console.log('       12 成分合计：已回答 ' + answered + ' 项 / 仅参考值 ' + reference + ' 项');
});

t(65, '竹笋：普通食材不套添加剂 ADI 模板，缺口说明用食材语言', () => {
  const fx = GENERAL_CASES.find((x) => x.key === 'bamboo');
  const gap = buildHealthGapView({
    status: 'ok',
    healthSchema: 4,
    healthInsights: null,
    identity: fx.identity,
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false },
    healthRoundUsed: true,
  });
  assert(/普通食材/.test(gap.text), gap.text);
  assert(/不按添加剂的方式/.test(gap.text), gap.text);
  assert(!/ADI 是|每日允许摄入量是/.test(gap.text), '给普通食材编了 ADI');
});

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败\n');
if (fail > 0) {
  for (const r of rows.filter((x) => !x.ok)) console.log('  [' + r.id + '] ' + r.name + ' — ' + r.error);
}
process.exit(fail === 0 ? 0 : 1);
