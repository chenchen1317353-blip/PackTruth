import { getCategoryHint } from '../domain/ingredients/categories.js';
import { organizeConsumerEvidence } from '../domain/evidence/consumerEvidence.js';
/**
 * 成分解读的展示层选择器。
 *
 * 这里只做「从已经通过校验的文字里挑一句来放大」，不做任何新的科学判断：
 * - 不调用模型；
 * - 不读 rejectedSections；
 * - 不把 briefScienceReview 标记为需核对的简明解释放进醒目区域；
 * - 全文仍然完整渲染，重点句只是同一段文字里的一段。
 */

import {
  HEALTH_SCHEMA_VERSION,
  pickConsumerHeadline,
} from '../domain/evidence/healthAnswer.js';

const MARKER_GROUPS = [
  /不代表|不等于|并非|并不/,
  /不能|无法|不足以|看不出来/,
  /主要|通常|一般|取决于|要看/,
  /只是|仅仅|只说明|只能/,
];

/** 按句号 / 问号 / 叹号切句，保留标点与原文顺序 */
export function splitSentences(text) {
  const s = String(text || '');
  const out = [];
  const re = /[^。！？!?]+[。！？!?]?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[0].trim()) out.push(m[0]);
  }
  return out.length ? out : s.trim() ? [s] : [];
}

/**
 * 选一句作为重点。
 * 规则是确定性的：结论标记越多、长度适中、靠前的句子优先。
 * 拿不准时宁可不放大（keyIndex = -1），也不硬凑。
 *
 * @returns {{parts:string[], keyIndex:number}}
 */
export function pickKeySentence(text) {
  const parts = splitSentences(text);
  if (parts.length === 0) return { parts: [], keyIndex: -1 };
  if (parts.length === 1) {
    // 单句段落只有足够短才整体放大，避免把一整段解释都变成粗体
    const only = parts[0].trim();
    return { parts, keyIndex: only.length >= 8 && only.length <= 44 ? 0 : -1 };
  }

  let best = -1;
  let bestScore = -Infinity;
  parts.forEach((part, i) => {
    const t = part.trim();
    if (t.length < 10) return;
    let score = 0;
    for (const re of MARKER_GROUPS) if (re.test(t)) score += 3;
    if (t.length >= 14 && t.length <= 64) score += 2;
    if (i === 0) score += 1;
    if (/^(但|而|所以|因此|不过|另外|例如|比如)/.test(t)) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });

  // 所有句子都不够像结论时，不强行放大
  return { parts, keyIndex: bestScore >= 3 ? best : -1 };
}

export function firstSentence(text) {
  const parts = splitSentences(text);
  return parts[0] || '';
}

// ---------------------------------------------------------------- 深入版核心结论

/**
 * 深入分析顶部只放一句能独立成立的短结论。
 * 手机上 1～3 行大约就是 46 个字，超过这个长度就不适合当标题。
 */
const CORE_MAX = 50;
const CORE_MIN = 8;

/**
 * 各板块作为「最值得先看」的参考权重（V2.2 调整）。
 *
 * 普通食材先回答「它是什么、为什么在这类食品里」；
 * 食品添加剂先回答「身份/功能」和常见误解，用量与合规边界放后面。
 * 这不是科学重要性排序，是阅读顺序的编辑取舍。
 */
const SECTION_WEIGHT_ADDITIVE = {
  what: 3.1,
  misconception: 2.9,
  why: 2.7,
  how: 2.3,
  evidence: 2.1,
  limits: 1.6,
};
const SECTION_WEIGHT_FOOD = {
  what: 3.2,
  why: 3,
  how: 2.6,
  misconception: 2.4,
  evidence: 2,
  limits: 1.4,
};

const SECTION_ORDER = ['limits', 'misconception', 'evidence', 'why', 'what'];

/**
 * 以这些词开头的句子依赖上文，不能单独拎出来当标题。
 * 「它」不在此列：卡片标题已经写着成分名，这里的「它」指向明确。
 */
const HEADLINE_DEPENDENT =
  /^(但|而|且|所以|因此|不过|另外|此外|同时|例如|比如|这|那|其|该|此|以上|上述|总之|也就是说|换言之|换句话说)/;

/** 切开后剩下的解释如果这样开头，说明它依赖被切走的前半句，不能切 */
const REST_DEPENDENT =
  /^(但|而|且|所以|因此|不过|另外|此外|同时|例如|比如|这|那|它|他|其|该|此|于是|总之)/;

/**
 * 适用范围 / 类别差异 / 工艺差异类陈述。
 * 这类句子对「这条资料能不能用」很重要，但对「我吃进去会怎样」没有回答，
 * 因此不能占据核心结论。
 */
const SCOPE_STATEMENT =
  /(食品类别|食品分类|不适用于|仅适用于|只适用于|针对的是|指的是.{0,8}(腌渍|罐藏|发酵)|不能据此|适用范围|适用条件|工艺|本底|分类号)/;

/** 纯页面说明，不是成分结论 */
const META_START = /^(本页|本文|以上|下面|前述|我们|点击|参见|来源|说明|注意|备注)[，,：:。]?\s*/;

/**
 * 「配料表里出现…只能说明…」这类话是对标签的元描述，不是成分本身。
 * 它们可以留在下方「目前不能确认什么」，但不适合当第一眼结论。
 */
const LABEL_META_START =
  /^(配料表|标签|包装)(里|上|中)?(出现|写着|写|只|无法|不能|不|没有|能)/;

/** 分句末尾如果是「如下：」「包括：」这类引导语，前半句不能独立成立 */
const LEAD_IN_END = /(如下|以下|包括|分为|主要有|有以下|例如|比如|分别是|即)[：:]?$/;

function normalizeClause(text) {
  let t = String(text || '').trim();
  if (!t) return '';
  t = t.replace(/[；;：:]+$/, '');
  if (!/[。！？!?]$/.test(t)) t += '。';
  return t;
}

function isStandalone(clause) {
  if (!clause) return false;
  if (clause.length < CORE_MIN || clause.length > CORE_MAX) return false;
  if (HEADLINE_DEPENDENT.test(clause)) return false;
  if (META_START.test(clause)) return false;
  if (LABEL_META_START.test(clause)) return false;
  if (LEAD_IN_END.test(clause.replace(/[。！？!?]$/, ''))) return false;
  return true;
}

/**
 * 从一段已核验文字的开头取候选：
 * - 首句本身够短，就用首句，剩下的句子作为解释；
 * - 首句太长时，只在第一个「；」或「：」处切一次，前半句当标题，后半句（连同后续句子）当解释。
 *
 * 只在开头切，是为了保证解释部分始终是连续的原文，不会把中间的句子抽走。
 */
function leadingCandidate(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const sentences = splitSentences(s);
  if (!sentences.length) return null;

  const first = sentences[0].trim();
  const tail = s.slice(first.length).trim();

  if (first.length <= CORE_MAX) {
    const clause = normalizeClause(first);
    if (!isStandalone(clause)) return null;
    return { clause, rest: tail };
  }

  for (const m of first.matchAll(/[；;：:]/g)) {
    const left = normalizeClause(first.slice(0, m.index));
    if (!isStandalone(left)) continue;
    // 切开的另一半 + 后面的句子，必须是连续的原文
    const rest = `${first.slice(m.index + 1).trim()}${tail}`.trim();
    if (!rest) continue;
    // 解释部分如果以「这 / 它 / 其」等指代词开头，说明它依赖被切走的前半句，
    // 这时不切，避免出现读不懂的断章。
    if (REST_DEPENDENT.test(rest)) continue;
    return { clause: left, rest };
  }

  return null;
}

function scoreCandidate(cand) {
  const t = cand.clause;
  let score = cand.weight * 2;
  if (t.length >= 12 && t.length <= 30) score += 2;
  else if (t.length <= 38) score += 1;
  // 只作为同权重候选之间的微弱偏好，不单独决定科学重要性
  if (/不代表|不等于|并非|只说明|只能|不是/.test(t)) score += 1;
  if (cand.order === 0) score += 0.5;
  if (t.length > 42) score -= 0.5;

  // V2.3：标准编号不是健康结论。
  // 一句话如果主要是在报标准号（GB / INS / CNS / ADI 数值），
  // 只有在没有别的可用结论时才让它当标题。
  if (/(GB|INS|CNS)\s?\d/i.test(t)) score -= 2.4;
  if (/^(我国|国家|现行|目前)\S{0,10}(标准|规定|允许)/.test(t)) score -= 1.2;
  // 只是「按标准使用」不构成健康结论
  if (/按生产需要适量使用|按标准使用|符合标准/.test(t)) score -= 1.6;

  return score;
}

function refsOfCard(card) {
  return (card?.sources || []).map((s) => s.id).filter(Boolean);
}

function collectCandidates({ card, research }) {
  const out = [];
  const sections = research?.sections || [];

  // V2.3 验收修复：这里**不再**把 healthInsights 放进候选。
  //
  // 之前把健康结论的权重设成最高，结果是卡片上出现同一句话两次：
  // 健康区块的标题句，和「深入分析 · 核心结论」的标题句。
  // 健康信息已经有了自己的区块，核心结论应当回答「它是什么、为什么在这里」，
  // 这样两处各司其职，也不会有低价值重复。
  const weights =
    card?.categoryType === 'food_ingredient'
      ? SECTION_WEIGHT_FOOD
      : SECTION_WEIGHT_ADDITIVE;

  for (const key of SECTION_ORDER) {
    const items = sections.filter(
      (s) =>
        s.section === key &&
        s.verified === true &&
        s.text &&
        s.scientificCheck?.status !== 'review',
    );
    items.forEach((s, i) => {
      const cand = leadingCandidate(s.text);
      if (!cand) return;
      out.push({
        ...cand,
        weight: weights[key],
        order: i,
        from: key,
        sourceRefs: s.sourceRefs || [],
        fallbackText: s.text,
        fallbackRefs: s.sourceRefs || [],
        fallbackWeight: weights[key],
      });
    });
  }

  // 简明汇总只有在没被科学检查标记、也没有降级时才可用
  const briefFlagged = Boolean(research?.briefScienceReview?.length);
  const brief = research?.brief;
  if (brief && !briefFlagged && !brief.degraded && brief.howToUnderstand) {
    const cand = leadingCandidate(brief.howToUnderstand);
    if (cand) {
      out.push({
        ...cand,
        weight: 1.5,
        order: 0,
        from: 'brief',
        sourceRefs: brief.sourceRefs || [],
        fallbackText: brief.howToUnderstand,
      });
    }
  }

  // 本地条目的「是什么 / 为什么」也要进入候选。
  // 否则只有 limits 可挑，普通食材一打开就变成「无法判断合规」。
  if (card?.brief?.what) {
    const cand = leadingCandidate(card.brief.what);
    if (cand) {
      out.push({
        ...cand,
        weight: weights.what,
        order: 0,
        from: 'local-what',
        sourceRefs: refsOfCard(card),
        fallbackText: card.brief.what,
      });
    }
  }

  if (card?.brief?.why) {
    const cand = leadingCandidate(card.brief.why);
    if (cand) {
      out.push({
        ...cand,
        weight: weights.why,
        order: 0,
        from: 'local-why',
        sourceRefs: refsOfCard(card),
        fallbackText: card.brief.why,
      });
    }
  }

  for (const [i, m] of (card?.misconceptions || []).entries()) {
    if (!m?.text) continue;
    const cand = leadingCandidate(m.text);
    if (!cand) continue;
    out.push({
      ...cand,
      weight: weights.misconception,
      order: i,
      from: 'local-misconception',
      sourceRefs: refsOfCard(card),
      fallbackText: m.text,
    });
  }

  if (card?.limits) {
    const cand = leadingCandidate(card.limits);
    if (cand) {
      out.push({
        ...cand,
        weight: weights.limits,
        order: 0,
        from: 'local-limits',
        sourceRefs: refsOfCard(card),
        fallbackText: card.limits,
      });
    }
  }

  if (card?.brief?.howToUnderstand) {
    const cand = leadingCandidate(card.brief.howToUnderstand);
    if (cand) {
      // 本地简明的后半句如果换了一个话题（例如从「不是蔗糖」跳到 WHO 建议），
      // 不把它硬接在标题下面；它仍然完整显示在上方简明段里。
      const linkedRest =
        cand.rest && /^(所以|因此|也就是说|换句话说|这意味着)/.test(cand.rest)
          ? cand.rest
          : null;
      out.push({
        ...cand,
        rest: linkedRest,
        weight: weights.how,
        order: 0,
        from: 'local-brief',
        sourceRefs: refsOfCard(card),
        fallbackText: card.brief.howToUnderstand,
      });
    }
  }

  return out;
}

/**
 * 深入分析顶部的「核心结论」。
 *
 * 返回两层：
 *   headline    能独立成立的短结论（已核验原文中的一句 / 一个分句）
 *   explanation 紧随其后的原文说明；没有可安全切分的短句时只有这一层
 *
 * 选择顺序不是「先看限定」，而是把边界、误解、证据、用途放在同一张表里按
 * 板块权重 + 长度 + 是否独立成立来打分；拿不准就不放大，改成中性标签 + 原文。
 * 任何情况下都不读 rejectedSections，也不把 review 内容当成确定事实。
 */
export function buildIngredientCore({ card, research, foodContext = null } = {}) {
  /**
   * 第一优先：已通过校验的健康结论。
   *
   * 注意这**不是**「给健康句加分」。健康句根本不参与 section 打分：
   * 只有 healthInsights 里 answerKind 为评估结论 / 已发现影响 / 点名人群的条目，
   * 才有资格被放大。标准编号、技术用途、类别差异无论分数多高都进不来。
   */
  // 旧版预录/旧缓存的健康字段没有经过当前判定，不能拿来当大字结论
  const healthCurrent = Number(research?.healthSchema) === HEALTH_SCHEMA_VERSION;
  const chosen = healthCurrent ? getConsumerEvidence(research, {name: card?.name || research?.ingredient,foodContext}).slots.consumerTakeaway : null;
  const health = chosen ? {slot:'consumerTakeaway',item:chosen} : null;
  if (health) {
    // 页面顶部已经显示同一句话时，这里不再重复一张同样醒目的卡片。
    return {
      suppressed: true,
      reason: 'health-shown-above',
      label: '',
      headline: null,
      explanation: null,
      text: '',
      source: 'health',
      from: `health:${health.slot}`,
      sourceRefs: health.item.sourceRefs || [],
      tone: 'none',
    };
  }

  // 第二优先：没有可用的健康结论时，只给普通字号的「科学背景」，
  // 不再叫「核心结论」——避免技术细节抢占健康结论的视觉位置。
  const candidates = collectCandidates({ card, research });

  if (candidates.length) {
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((cand, i) => {
      const score = scoreCandidate(cand) - i * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    });

    return {
      suppressed: false,
      label: '科学背景',
      headline: null,
      explanation: best.rest ? `${best.clause}${best.rest}` : best.clause,
      text: best.clause,
      source: 'background',
      from: best.from,
      sourceRefs: best.sourceRefs || [],
      tone: 'quiet',
    };
  }

  // 有文字但无法安全切成短句：不截断、不改写，用中性标签 + 普通字号原文
  const fullTextCandidates = [
    ...((research?.sections || [])
      .filter(
        (s) =>
          s.section === 'limits' &&
          s.verified === true &&
          s.text &&
          s.scientificCheck?.status !== 'review',
      )
      .map((s) => ({ text: s.text, refs: s.sourceRefs || [], weight: 3 }))),
    ...((research?.sections || [])
      .filter(
        (s) =>
          s.section !== 'limits' &&
          s.verified === true &&
          s.text &&
          s.scientificCheck?.status !== 'review',
      )
      .map((s) => ({ text: s.text, refs: s.sourceRefs || [], weight: 1 }))),
    card?.limits ? { text: card.limits, refs: refsOfCard(card), weight: 2.5 } : null,
    card?.brief?.howToUnderstand
      ? { text: card.brief.howToUnderstand, refs: refsOfCard(card), weight: 1 }
      : null,
  ].filter(Boolean);

  const briefFlagged = Boolean(research?.briefScienceReview?.length);
  if (research?.brief?.howToUnderstand && !briefFlagged && !research.brief.degraded) {
    fullTextCandidates.push({
      text: research.brief.howToUnderstand,
      refs: research.brief.sourceRefs || [],
      weight: 1.2,
    });
  }

  if (fullTextCandidates.length) {
    const top = fullTextCandidates.sort((a, b) => b.weight - a.weight)[0];
    return {
      suppressed: false,
      label: '科学背景',
      headline: null,
      explanation: top.text,
      text: top.text,
      source: 'background',
      from: 'full-text',
      sourceRefs: top.refs || [],
      tone: 'quiet',
    };
  }

  if (research?.status === 'failed' || research?.status === 'no_source') {
    return {
      suppressed: false,
      label: '目前能确认的',
      headline: '这次没有找到足够可靠的资料解释这个成分。',
      explanation: null,
      text: '这次没有找到足够可靠的资料解释这个成分。',
      source: 'insufficient',
      from: 'insufficient',
      sourceRefs: [],
      tone: 'quiet',
    };
  }

  return {
    suppressed: false,
    label: '目前能确认的',
    headline: '目前资料不足以确定它在这款食品中的具体作用。',
    explanation: null,
    text: '目前资料不足以确定它在这款食品中的具体作用。',
    source: 'insufficient',
    from: 'insufficient',
    sourceRefs: [],
    tone: 'quiet',
  };
}

// ---------------------------------------------------------------- 类别写法

/**
 * 配料表里有些词不是具体物质，而是类别：
 * 「食品添加剂」「香辛料」「复合调味料」。
 * 它们没有可匹配的知识条目，但也不该被当成「资料不足的未知成分」。
 * 这里只解释标签写法，不推断里面有什么、更不补全。
 */
export { getCategoryHint } from '../domain/ingredients/categories.js';

// ---------------------------------------------------------------- 健康信息

/** 健康区块里「正常食用 / 摄入过多 / 特别注意」的展示顺序 */
const HEALTH_ROW_ORDER = ['normalIntake', 'highIntake', 'sensitiveGroups'];

const HEALTH_ROW_TITLES = {
  normalIntake: '正常吃会怎么样',
  highIntake: '吃多了可能怎么样',
  sensitiveGroups: '哪些人需要特别注意',
};

const STUDY_TYPE_LABELS = {
  human: '人体研究',
  animal: '动物实验',
  in_vitro: '体外研究',
  assessment: '机构评估',
  reference: '参考摄入值',
  none: '未标明证据类型',
};

const BASIS_LABELS_VIEW = {
  direct: '同一物质',
  constituent: '组成物质联合评估',
  group: '同一评估组',
  analog: '不同化学形式',
};

/**
 * 把已通过校验的 healthInsights 整理成卡片结构。
 *
 * 只做排序与去重：
 * - 打头的一句优先用 practicalTakeaway，没有就用 normalIntake；
 * - 剩余三项按固定顺序展示，和标题重复的句子不重复渲染；
 * - 没有可答事实时只保留一条缺口，不生成多个空栏目。
 */
export function getConsumerEvidence(research, { foodContext = null, name = '' } = {}) {
  return organizeConsumerEvidence({ facts: research?.consumerEvidence?.facts, insights: research?.healthInsights,
    studies: research?.studies, sources: research?.sources?.length ? research.sources : Object.values(research?.healthInsights || {}).flatMap(f=>f.sources || []), foodContext,
    name: name || research?.ingredient || '', aliases: research?.identityGraph?.en || [],
    category: research?.consumerEvidence?.category || Boolean(getCategoryHint(name || research?.ingredient)) });
}

function displayFact(item) {
  if (!item) return null;
  const suggested = item.semanticChecked && item.consumerSummary;
  const summary = suggested && suggested.length <= 150 && !/无法|资料不足/.test(suggested) ? suggested : item.consumerLead || item.text;
  return { ...item, text: summary, fullText: item.fullText || item.text,
    studyTypeLabel: STUDY_TYPE_LABELS[item.studyType], evidenceBasisLabel: BASIS_LABELS_VIEW[item.evidenceBasis] };
}

export function buildHealthView(research, { foodContext = null, name = '' } = {}) {
  if (!research) return null;
  if (Number(research.healthSchema) !== HEALTH_SCHEMA_VERSION) {
    return research.healthInsights ? {legacy:true,answered:false,headline:null,rows:[]} : null;
  }
  const evidence = getConsumerEvidence(research,{foodContext,name});
  const headline = displayFact(evidence.slots.consumerTakeaway);
  const seen = new Set(headline ? [headline.id] : []);
  const rows = HEALTH_ROW_ORDER.flatMap(slot => {
    const item = evidence.slots[slot];
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{...displayFact(item),key:slot,title:HEALTH_ROW_TITLES[slot],
      referenceOnly:item.answerKind==='reference',
      note:item.applicability.dose==='experimental_high' ? '这是研究剂量下的观察，不等于日常吃这款食品会有同样反应。' : null,
      showBadge:item.evidenceStatus!==headline?.evidenceStatus}];
  });
  const usedText = new Set([headline,...rows].filter(Boolean).map(x=>x.fullText));
  const context = evidence.populationContext.filter(f=>!usedText.has(f.fullText)).map(displayFact);
  const foodMeaning = evidence.category ? null : research.foodMeaning?.text ? {...research.foodMeaning,model:true} :
    (headline || rows.length) ? {text:buildFoodMeaning({research,foodContext,name,view:{legacy:false,headline}})?.lines.join(' '),model:false} : null;
  return {legacy:false,answered:Boolean(headline),headline,rows,context,foodMeaning,
    gaps:evidence.gaps,deepFacts:evidence.deepFacts,category:evidence.category};
}

// ---------------------------------------------------------------- 健康缺口

/**
 * 健康区块缺失时的**一条**说明（V2.3 全局整改）。
 *
 * 旧版会在三个地方各说一次「没有证据」，用户读到的是三遍免责声明。
 * 这里把「哪几个问题没答上、为什么」合并成一句，并明确是
 * 「本次检索没取得」而不是「这个成分没有资料」。
 *
 * @returns {{ text: string, missing: string[], reason: string }|null}
 */
export function buildHealthGapView(research) {
  if (!research || research.healthInsights) return null;
  const answers = research.healthAnswers;
  if (!answers) return null;

  const missing = (research.healthUnanswered || []).filter((k) => answers[k]);
  if (missing.length === 0) return null;

  const rejected = missing.filter((k) => answers[k].status === 'rejected');
  const covered = research.healthCoverage?.available;
  const isFood = research.identity?.type === 'food_ingredient';

  let text;
  const failed = research.fetchFailures?.length || 0;
  const budgetUsed = research.searchBudget?.usedRounds || research.searchRounds || null;
  const completionGap = (research.completion?.items || []).filter((x) => x.status === 'missing');
  const missingLabels = completionGap.map((x) => x.label).slice(0, 3);

  if (covered && rejected.length > 0) {
    text = '这次找到的健康资料没有通过来源核对，因此没有放进卡片；身份与用途不受影响。';
  } else if (covered) {
    text = '这次找到的资料只够说明身份与用途，没有可直接引用的健康评估结论。';
  } else if (isFood) {
    text = '它是普通食材，本次检索没有取得针对它的健康评估资料；普通食材通常不按添加剂的方式设定摄入上限。';
  } else if (failed > 0) {
    text =
      `本次找到了可能相关的资料，但有 ${failed} 个原文页面读取失败（${research.fetchFailures[0]?.reason?.slice(0, 60) || '原因见下方'}）。` +
      '没有读到的内容不会被写成结论；这不等于科学界没有相关研究。';
  } else if (missingLabels.length) {
    text = `本次研究仍有未取得的证据：${missingLabels.join('、')}。上面只解释已经确认的身份与用途，不把缺口写成「没有风险」。`;
  } else if (research.healthRoundUsed) {
    text = budgetUsed
      ? `${budgetUsed} 轮检索都没有取得针对它的健康评估资料（ADI、风险评估或人群提示），上面只解释身份与用途。`
      : '几轮检索都没有取得针对它的健康评估资料，上面只解释身份与用途。';
  } else {
    text = '本次检索没有取得针对它的健康评估资料，上面只解释身份与用途。';
  }

  return { text, missing, reason: covered ? 'rejected_or_incomplete' : 'no_health_material' };
}

// ---------------------------------------------------------------- 对这款食品

/**
 * 「对于这款食品，实际该怎样理解？」（V2.4）
 *
 * 这一块**不由模型生成**，只用两样已经确认过的东西拼出来：
 *   1. 用户在确认页核对过的产品信息（名称/类别）；
 *   2. 已通过检查的健康结论自带的适用条件。
 *
 * 为什么不让模型写：模型没有这款食品的实际添加量，也没有检测数据。
 * 让它「结合语境说两句」很容易变成「这款食品含糖较高，建议少吃」这类
 * 没有依据的推断。这里只说明适用性与边界，不产生新的健康结论。
 *
 * @returns {{ lines: string[], hasContext: boolean }|null}
 */
export function buildFoodMeaning({ research, foodContext = null, name = '', view: providedView = null } = {}) {
  const view = providedView || buildHealthView(research);
  if (!view || view.legacy) return null;

  // 模型已经给出并通过检查的版本优先，避免同一块出现两套说法
  if (research?.foodMeaning?.text) {
    return {
      lines: [
        research.foodMeaning.text,
        ...(research.foodMeaning.conditions
          ? [`适用条件：${research.foodMeaning.conditions}。`]
          : []),
      ],
      hasContext: Boolean(foodContext?.productName || foodContext?.category),
      model: true,
    };
  }

  const ctx = foodContext || {};
  const product = String(ctx.productName || '').trim();
  const category = String(ctx.category || '').trim();
  const headline = view.headline;

  const lines = [];
  const hasContext = Boolean(product || category);

  if (hasContext) {
    const label = [product, category].filter(Boolean).join(' · ');
    lines.push(
      name
        ? `这款食品：${label}；配料表里写作「${name}」。`
        : `这款食品：${label}。`,
    );
  }
  const nutrition = ctx.nutrition;
  if (Array.isArray(nutrition?.items) && nutrition.items.length) {
    const values = nutrition.items.slice(0, 6).map(x => `${x.name} ${x.value}${x.unit || ''}`).join('、');
    const basis = nutrition.basis === 'per_100g' ? '每100克' : nutrition.basis === 'per_100ml' ? '每100毫升' : '每份';
    lines.push(`已确认的营养表标注${basis}${values}；这些是整款食品的数据，不能全部归到当前成分。`);
  }

  if (headline?.conditions) {
    lines.push('研究的适用条件可在“依据原文与研究条件”中展开查看。');
  } else if (headline) {
    lines.push('上面的结论针对的是这种成分在食品中的一般使用，不是对这款具体产品的检测结果。');
  } else {
    lines.push(
      '上述研究应按所注明的人群和摄入条件来理解。',
    );
  }

  lines.push(
    '配料表不标实际添加量，不能据此换算这一份食品的成分剂量。',
  );

  return { lines, hasContext };
}
