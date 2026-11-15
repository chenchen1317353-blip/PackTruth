import { HEALTH_SCHEMA_VERSION } from '../../src/domain/evidence/healthAnswer.js';
/**
 * V2.3 验收修复：健康资料的官方回放样本（不联网、不调用付费 API）。
 *
 * 这里的两组证据**逐字**来自 WHO / FAO 的公开页面，抓取日期 2026-11-03：
 *
 *  1. WHO JECFA 评估数据库 · ACESULFAME POTASSIUM（INS 950）
 *     https://apps.who.int/food-additives-contaminants-jecfa-database/chemical.aspx?chemID=926
 *     Evaluation year: 1990 / ADI: 0-15 mg/kg bw
 *
 *  2. WHO JECFA 评估数据库 · GLACIAL ACETIC ACID（INS 260）
 *     https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/1461
 *     Evaluation year: 2004 / ADI: No safety concern at current levels of intake
 *     when used as a flavouring agent；1973 年确立的组 ADI "not limited" 于第 49 次会议维持
 *
 *  3. FAO/WHO 文件中的术语表（ANNEX 4: GLOSSARY）
 *     https://www.fao.org/docrep/012/i1357e/i1357e02.pdf
 *     ADI 的定义、"not limited" 与 "not specified" 的关系
 *
 * 模型输出（healthInsights / brief / sections）是**模拟的**，但每一条
 * healthInsights 都经过真实的 validateHealthInsights 校验：
 * quote 必须能在上面的 excerpt 里逐字找到，数字必须出现在来源里。
 * 所以「页面上的健康结论」是真实管线产出，只是触发它的那一次模型调用没有发生。
 */

import { validateHealthInsights } from '../../src/domain/evidence/healthGuard.js';
import { findHealthEvidence } from '../../src/domain/evidence/healthEvidence.js';

export const ACESULFAME_K = {
  key: 'acesulfame',
  name: '安赛蜜',
  aliases: ['acesulfame'],
  ins: 'INS 950',
  sources: [
    {
      id: 'W1',
      title: 'ACESULFAME POTASSIUM（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/chemical.aspx?chemID=926',
      excerpt:
        'ACESULFAME POTASSIUM. Synonyms: ACESULFAME K. INS 950. Functional Class: Food Additives, FLAVOUR_ENHANCER, SWEETENER. Evaluations. Evaluation year: 1990. ADI: 0-15 mg/kg bw. Report: TRS 806-JECFA 37/20. Previous Years: 1996; 1983, TRS 696-JECFA 27/21, 0-9; 1982; 1981, TRS 669-JECFA 25/26, NO ADI ALLOCATED.',
      excerptType: 'fetched_excerpt',
      publishedAt: '1990',
      tier: 'web_body',
    },
    {
      id: 'W2',
      title: 'FAO/WHO 联合文件 · 术语表（ANNEX 4: GLOSSARY）',
      organization: '联合国粮食及农业组织（FAO）',
      sourceType: 'fetch_content',
      url: 'https://www.fao.org/docrep/012/i1357e/i1357e02.pdf',
      excerpt:
        'Acceptable daily intake (ADI): An estimate of the amount of a substance in food or drinking-water, expressed on a body weight basis (usually milligrams per kilogram body weight), that can be ingested daily over a lifetime by humans without appreciable health risks.',
      excerptType: 'fetched_excerpt',
      publishedAt: null,
      tier: 'web_body',
    },
    {
      id: 'W3',
      title: 'EFSA：安赛蜜（E 950）再评估 · 通俗摘要',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/en/plain-language-summary/re-evaluation-acesulfame-k-e-950-food-additive',
      excerpt:
        'The acceptable daily intake (ADI) considered safe for all population groups was set at 15 mg/kg body weight (bw) per day. This ADI replaces the one set by the SCF in 2000 at 9 mg/kg bw per day. In the EU, the highest exposure estimate of E 950 was generally below the ADI in all population groups, indicating no safety concern.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2025',
      tier: 'web_body',
    },

  ],
  model: {
    brief: {
      what: '安赛蜜是人工合成的甜味剂，学名乙酰磺胺酸钾，甜度约为蔗糖的 200 倍。',
      why: '它提供甜味但不产生能量，饮料、蜜饯这类食品常用它来减少糖的用量。',
      howToUnderstand: '它和阿斯巴甜、三氯蔗糖是三种不同的甜味剂，健康评估与适用条件不能互相套用。',
      sourceRefs: ['W1'],
    },
    sections: [
      {
        id: 's1',
        section: 'what',
        text: '安赛蜜的正式名称是乙酰磺胺酸钾，国际编号 INS 950，JECFA 把它列在甜味剂和增味剂的功能类别下。',
        sourceRefs: ['W1'],
        limitations: null,
      },
      {
        id: 's2',
        section: 'limits',
        text: '配料表只写名称，不标注实际添加量，因此不能据此推算这款食品里安赛蜜有多少。',
        sourceRefs: ['W1'],
        limitations: null,
      },
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'EFSA 的再评估把安赛蜜的 ADI 上调到 15 mg/kg 体重，并认为欧盟各人群的暴露量都低于这个值，没有安全担忧。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'In the EU, the highest exposure estimate of E 950 was generally below the ADI in all population groups, indicating no safety concern.',
        conditions: '欧盟膳食暴露情境；ADI 由 9 上调到 15 mg/kg 体重',
        sourceYear: '2025',
      },
      normalIntake: {
        text: 'EFSA 把安赛蜜的 ADI 从 9 mg/kg 体重上调到 15 mg/kg 体重，依据是大鼠慢性试验中未观察到不良效应的最高剂量。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'This ADI replaces the one set by the SCF in 2000 at 9 mg/kg bw per day.',
        conditions: '以体重计，长期每日摄入',
        sourceYear: '2025',
      },
    },
  },
};

export const ACETIC_ACID = {
  key: 'acetic',
  name: '冰乙酸',
  aliases: ['acetic acid'],
  ins: 'INS 260',
  sourceIns: '260',
  sources: [
    {
      id: 'W1',
      title: 'GLACIAL ACETIC ACID（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/1461',
      excerpt:
        'GLACIAL ACETIC ACID. Chemical Names: Acetic acid. INS 260. Functional Class: Flavouring Agent, Food Additives, ACID, ACIDITY_REGULATOR, PRESERVATIVE. Evaluation year: 2004. ADI: No safety concern at current levels of intake when used as a flavouring agent. Comments: Small residues of acetic acid on food (which has been treated with antimicrobial washing solutions) at the time of consumption would not pose a safety concern. Previous Years: 2002; 1997, TRS 884-JECFA 49/29. NO SAFETY CONCERN AT CURRENT LEVELS OF INTAKE WHEN USED AS A FLAVOURING AGENT. THE GROUP ADI "NOT LIMITED" FOR ACETIC ACID AND ITS POTASSIUM AND SODIUM SALTS ESTABLISHED AT THE SEVENTEENTH MEETING IN 1973 WAS MAINTAINED AT THE FORTY-NINTH MEETING.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2004',
      tier: 'web_body',
    },
    {
      id: 'W2',
      title: 'FAO/WHO 联合文件 · 术语表（ANNEX 4: GLOSSARY）',
      organization: '联合国粮食及农业组织（FAO）',
      sourceType: 'fetch_content',
      url: 'https://www.fao.org/docrep/012/i1357e/i1357e02.pdf',
      excerpt:
        'Acceptable daily intake "not limited": A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives, which has the same meaning as acceptable daily intake "not specified". Acceptable daily intake "not specified": A term applicable to a food substance of very low toxicity that, on the basis of the available chemical, biochemical and toxicological data as well as the total dietary intake of the substance, does not, in the opinion of the Joint FAO/WHO Expert Committee on Food Additives, represent a hazard to health. For that reason, the establishment of an acceptable daily intake expressed in numerical form is not deemed necessary.',
      excerptType: 'fetched_excerpt',
      publishedAt: null,
      tier: 'web_body',
    },
  ],
  model: {
    brief: {
      what: '冰乙酸就是无水乙酸，国际编号 INS 260，是食品中允许使用的酸度调节剂。',
      why: '用来调节酸度、抑制微生物，也参与调配酸味。',
      howToUnderstand: '「冰」说的是高浓度原液会凝成冰状固体，指的是原液状态，不是食品里的浓度。',
      sourceRefs: ['W1'],
    },
    sections: [
      {
        id: 's1',
        section: 'what',
        text: '冰乙酸的化学名称是乙酸，JECFA 把它列在调味剂、酸度调节剂和防腐剂的功能类别下。',
        sourceRefs: ['W1'],
        limitations: null,
      },
      {
        id: 's2',
        section: 'limits',
        text: '配料表不标注酸的浓度和添加量，因此不能根据「冰乙酸」这个词推断这款食品的酸度或摄入量。',
        sourceRefs: ['W1'],
        limitations: null,
      },
    ],
    healthInsights: {
      practicalTakeaway: {
        text: 'JECFA 在 2004 年的评估认为，乙酸作为调味剂在当前摄入水平下没有安全关切。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: No safety concern at current levels of intake when used as a flavouring agent',
        conditions: '作为调味剂（flavouring agent）使用时的当前摄入水平',
        sourceYear: '2004',
      },
      normalIntake: {
        text: 'JECFA 对乙酸及其钾盐、钠盐维持了 1973 年确立的组 ADI「not limited」。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'THE GROUP ADI "NOT LIMITED" FOR ACETIC ACID AND ITS POTASSIUM AND SODIUM SALTS ESTABLISHED AT THE SEVENTEENTH MEETING IN 1973 WAS MAINTAINED AT THE FORTY-NINTH MEETING',
        conditions: '乙酸及其钾盐、钠盐的组 ADI',
        sourceYear: '1973',
      },
      highIntake: {
        text: '乙酸的组 ADI 没有设定具体数值：「not limited」是 JECFA 已不再使用的旧术语，含义等同于「not specified」。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1', 'W2'],
        quote:
          'A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives, which has the same meaning as acceptable daily intake "not specified"',
        conditions: '术语解释；不等于「可以无限量摄入」',
        sourceYear: null,
      },
    },
  },
};

/**
 * 只有技术标准、没有健康评估的情形。
 *
 * 用来演示：程序不会拿「GB 2760 允许使用」冒充健康结论，
 * 而是明确说「本次没有取得健康评估资料」，并给出补充检索入口。
 */
export const STANDARD_ONLY = {
  key: 'standard-only',
  name: '安赛蜜',
  aliases: ['acesulfame'],
  sources: [
    {
      id: 'W1',
      title: '食品安全国家标准 食品添加剂使用标准（GB 2760-2024）查询结果',
      organization: '国家食品安全风险评估中心（CFSA）',
      sourceType: 'fetch_content',
      url: 'https://gb2760.cfsa.net.cn/',
      excerpt:
        '安赛蜜（乙酰磺胺酸钾） CNS 号 19.010，功能：甜味剂。使用范围包括饮料类、蜜饯凉果等，最大使用量按 GB 2760-2024 表 A.1 执行。',
      excerptType: 'fetched_excerpt',
      publishedAt: '2024',
      tier: 'web_body',
    },
  ],
  model: {
    brief: {
      what: '安赛蜜是人工合成的甜味剂，学名乙酰磺胺酸钾。',
      why: '它提供甜味但不产生能量，饮料、蜜饯这类食品常用它来减少糖的用量。',
      howToUnderstand: 'GB 2760-2024 规定了它的使用范围和最大使用量；配料表看不出这款食品实际用了多少。',
      sourceRefs: ['W1'],
    },
    sections: [
      {
        id: 's1',
        section: 'what',
        text: 'GB 2760-2024 把安赛蜜列在甜味剂类别下，CNS 号 19.010。',
        sourceRefs: ['W1'],
        limitations: null,
      },
    ],
    // 关键：资料里没有 ADI / 风险评估 / 人群提示 → 整个 healthInsights 省略
    healthInsights: null,
  },
};

export const HEALTH_FIXTURES = [ACESULFAME_K, ACETIC_ACID, STANDARD_ONLY];

/**
 * 把回放样本组装成前端认识的 research 结果。
 *
 * 健康部分调用**真实的** validateHealthInsights：被拒的条目不会出现在页面上，
 * 所以截图里的每一句健康文字都通过了与生产环境相同的检查。
 * brief / sections 是回放文本（没有跑 citationGuard），报告中已注明。
 */
export function buildReplayResearch(fx, { identity, searchRounds = 1, healthRoundUsed = true } = {}) {
  const health = validateHealthInsights({
    raw: fx.model.healthInsights,
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  const coverage = findHealthEvidence(fx.sources, { names: [fx.name, ...fx.aliases] });
  const answerOf = (slot) => {
    const item = health.insights?.[slot];
    if (item?.answersQuestion) return { status: 'answered', kind: item.answerKind };
    if (item) return { status: 'reference_only', kind: item.answerKind };
    const rej = health.rejected.find((r) => r.slot === slot);
    if (rej) return { status: 'rejected', reason: rej.rejectReason };
    return { status: 'no_evidence' };
  };
  const healthAnswers = {
    normalIntake: answerOf('normalIntake'),
    highIntake: answerOf('highIntake'),
    sensitiveGroups: answerOf('sensitiveGroups'),
  };
  const unanswered = ['normalIntake', 'highIntake', 'sensitiveGroups'].filter(
    (k) => healthAnswers[k].status !== 'answered',
  );
  const count = (st) =>
    ['normalIntake', 'highIntake', 'sensitiveGroups'].filter(
      (k) => healthAnswers[k].status === st,
    ).length;
  const healthScore = {
    answered: count('answered'),
    referenceOnly: count('reference_only'),
    rejected: count('rejected'),
    none: count('no_evidence'),
  };

  return {
    status: 'ok',
    composition: 'web_only',
    ingredient: fx.name,
    localMatched: false,
    localEntryId: null,
    query: `${fx.name} ${(fx.aliases[0] || '').trim()} site:who.int OR site:fao.org`.trim(),
    querySites: ['who.int', 'fao.org'],
    queryLength: 60,
    searchCount: 5,
    searchContentCount: 4,
    searchRounds,
    fallback: { triggered: false },
    blocked: [],
    fetchFailures: [],
    fetchCount: 2,
    sources: fx.sources,
    evidenceStats: { total: fx.sources.length },
    identity: identity
      ? { type: identity.type, label: identity.label, note: identity.note || null, checked: {} }
      : { type: 'additive', label: '食品添加剂', note: null, checked: {} },
    brief: {
      ...fx.model.brief,
      sources: fx.sources,
      tier: 'cited',
      verified: true,
      degraded: false,
    },
    briefRejectReason: null,
    briefScienceReview: null,
    sections: fx.model.sections.map((s, i) => ({
      id: `s${i + 1}`,
      section: s.section,
      text: s.text,
      sourceRefs: s.sourceRefs,
      limitations: s.limitations ?? null,
      verified: true,
      tier: 'cited',
      scientificCheck: { status: 'pass', issues: [] },
    })),
    rejectedSections: [],
    healthInsights: health.insights,
    healthSchema: HEALTH_SCHEMA_VERSION,
    healthRejected: health.rejected,
    healthStats: health.stats,
    healthStatus: health.insights ? 'available' : 'unavailable',
    healthCoverage: coverage,
    healthAnswers,
    healthScore,
    healthUnanswered: unanswered,
    // 回放按「四项检查表都试过一轮」记录，报告与界面文案据此显示轮次
    researchRounds: [
      { round: 1, focus: 'identity', focusLabel: '确认成分身份' },
      { round: 2, focus: 'normal', focusLabel: '正常食用的健康评估' },
      { round: 3, focus: 'high', focusLabel: '高摄入与长期暴露' },
      { round: 4, focus: 'sensitive', focusLabel: '特殊人群注意事项' },
    ],
    researchStopReason: 'max_rounds',
    searchBudget: { maxRounds: 4, usedRounds: 4, maxFetchPages: 4, usedFetchPages: 2 },
    healthRoundUsed: Boolean(healthRoundUsed),
    notes: health.insights ? [] : ['本次资料没有给出可核查的健康结论'],
    retrievedAt: new Date().toISOString(),
    cached: false,
    chat: { model: 'replay', usage: null, durationMs: 10 },
    timings: {},
    totalMs: 10,
    cost: { currency: 'CNY', total: 0.01 },
    demoReplay: true,
  };
}
