/**
 * 健康证据检查表（纯函数，可单测，不联网）。
 *
 * 旧流程只有一个布尔判断：「有没有健康资料」。于是出现两种典型失败：
 *   1. 找到一条 ADI 就算「有健康资料」，不再补查高摄入与特殊人群；
 *   2. 找到 GB 使用标准就认为「食品资料齐了」，连健康检索都不发。
 *
 * 这里把「研究目标」拆成四项可判定的状态，用它决定下一轮查什么，
 * 而不是等结果回来以后再补几段文字：
 *
 *   identity   身份是否已经能对上（有正文且提到该物质 / 本地已收录）
 *   normal     正常膳食摄入：有没有机构评估结论（direct），还是只有参考值（reference）
 *   high       高摄入：有没有人体层面的具体影响（human_effect），
 *              还是只有动物/体外（animal）、只有参考值（reference）、或没有（missing）
 *   sensitive  特殊人群：来源有没有点名人群/疾病（named）
 *   recent     现有健康证据是否偏旧（needed），需要再查一次较新的正式评估
 *
 * 判据仍然是关键词层面，所以它**只用于调度与缺口说明**，
 * 不能用于给任何健康结论背书 —— 结论准入由 healthGuard 负责。
 */

import { classifyEvidenceKind, EVIDENCE_KIND } from '../../src/domain/evidence/healthEvidence.js';

export const RESEARCH_FOCUS = {
  IDENTITY: 'identity',
  FOOD_USE: 'food_use',
  NORMAL: 'normal',
  HIGH: 'high',
  SENSITIVE: 'sensitive',
  RECENT: 'recent',
};

export const FOCUS_LABELS = {
  identity: '确认成分身份',
  food_use: '确认食品用途',
  normal: '正常食用的健康评估',
  high: '高摄入与长期暴露',
  sensitive: '特殊人群注意事项',
  recent: '较新的官方评估',
};

/** 机构给出结论的措辞（不是报数） */
const EVALUATION_RE =
  /(no safety concern|no safety concerns|not specified|not limited|no adverse|no evidence of|did not (?:find|identify)|未发现|未观察到|没有发现|没有观察到|无安全(?:担忧|关切)|不构成[^。；]{0,8}(?:危害|风险)|低于[^。；]{0,12}(?:ADI|每日允许摄入量)|exposure[^.]{0,40}below the ADI)/i;

/** 具体身体影响 */
const EFFECT_RE =
  /(blood pressure|hypertension|headache|migraine|asthma|wheez|anaphyla|allergic reaction|adverse (?:effect|reaction)|dental caries|caries|weight gain|obesity|hyperactiv|kidney|renal|liver|hepatotox|blood glucose|serum cholesterol|constipation|diarrh|龋齿|血压|头痛|偏头痛|哮喘|喘息|过敏|不良反应|体重增加|肥胖|肾|肝|血糖|血脂|腹泻|便秘|结石)/i;

/** 高摄入语境：没有它，最多算「一般毒理描述」 */
const HIGH_CONTEXT_RE =
  /(high intake|high exposure|high consumption|high dose|excessive|overconsumption|exceed(?:s|ing|ed)? the ADI|above the ADI|long[- ]term|prolonged|chronic|高摄入|高暴露|高剂量|过量|长期|超出|超过)/i;

const HUMAN_RE =
  /(human|volunteer|participants|subjects|cohort|randomi[sz]ed|\btrial\b|epidemiolog|人群|受试者|志愿者|队列|临床试验|流行病学|儿童|成人|adults?|children)/i;

/**
 * 去掉「没有人体数据」这类否定说法，再判断有没有人体证据。
 * 否则「did not include human participants」会被当成人体研究。
 */
function stripNegatedHuman(text) {
  return String(text || '')
    .replace(/(?:no|not|without|did not include|lack of)[^.]{0,40}(?:human|volunteer|participants|subjects)/gi, ' ')
    .replace(/(?:未|没有|无)[^。；]{0,12}(?:人体|人群|受试者)/g, ' ');
}

const ANIMAL_RE = /(rat|mice|mouse|animal|in vitro|in vivo|大鼠|小鼠|动物实验|动物研究|体外|细胞实验)/i;

/** 来源点名的人群 / 疾病（与 healthAnswer 的名单保持同一套语义） */
const NAMED_GROUP_RE =
  /(苯丙酮尿症|phenylketonuria|\bPKU\b|哮喘|asthma|亚硫酸盐敏感|sulfite[- ]sensitive|过敏|allerg|不耐受|intoleran|婴幼儿|婴儿|infant|孕妇|pregnan|乳母|breastfeed|儿童|children|老年人|肾病|kidney|高血压|hypertension|糖尿病|diabet|痛风|gout|偏头痛|migraine|贫血|anaemia|anemia)/i;

function textOf(source) {
  // 证据对象在编排层用 excerpt，搜索结果原始对象用 content/snippet；
  // 两种形态都要能判，否则测试与生产会得出两套结论。
  const body =
    source?.excerpt ||
    source?.content ||
    [source?.snippet, source?.summary].filter(Boolean).join('\n') ||
    '';
  return `${source?.title || ''}\n${body}`;
}

function mentions(text, names) {
  const lowered = names.map((n) => String(n || '').toLowerCase().trim()).filter((n) => n.length >= 2);
  if (lowered.length === 0) return true;
  const lower = text.toLowerCase();
  return lowered.some((n) => lower.includes(n));
}

/** 从正文里抽出出现的年份（只用于判断资料新旧，不参与结论） */
function yearsIn(text) {
  const out = [];
  const re = /\b(19[5-9]\d|20[0-4]\d)\b/g;
  let m;
  while ((m = re.exec(text))) out.push(Number(m[1]));
  return out;
}

function newer(current, candidates) {
  let best = current;
  for (const y of candidates) if (best == null || y > best) best = y;
  return best;
}

/**
 * 评估当前证据能满足到哪一步。
 *
 * @param {Array} sources 证据集合（K/W 均可，需有 title + excerpt）
 * @param {{names?: string[], hasLocalEntry?: boolean, now?: number}} [opts]
 * @returns {{
 *   identity: 'confirmed'|'missing',
 *   normal: {state:'direct'|'reference'|'missing', evidenceIds:string[]},
 *   high: {state:'human_effect'|'animal'|'reference'|'missing', evidenceIds:string[]},
 *   sensitive: {state:'named'|'missing', evidenceIds:string[]},
 *   recent: {needed:boolean, newestYear:number|null, evidenceIds:string[]},
 *   satisfied: string[]
 * }}
 */
export function assessHealthChecklist(sources = [], { names = [], hasLocalEntry = false, now = Date.now() } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const normal = { state: 'missing', evidenceIds: [] };
  const high = { state: 'missing', evidenceIds: [] };
  const sensitive = { state: 'missing', evidenceIds: [] };
  let newest = null;
  const healthIds = [];
  let identity = hasLocalEntry ? 'confirmed' : 'missing';

  for (const s of list) {
    const text = textOf(s);
    if (!mentions(text, names)) continue;

    // 身份：有一份提到它、且有实际正文（>=200 字符）的资料，就够解释「它是什么」
    if (identity !== 'confirmed' && text.length >= 200) identity = 'confirmed';

    // 统一按「标题 + 正文」分类：证据对象用 excerpt，搜索结果用 content
    const kind = classifyEvidenceKind({ ...s, excerpt: text }).kind;
    const isHealth = kind === EVIDENCE_KIND.RISK || kind === EVIDENCE_KIND.SENSITIVE;
    if (isHealth) {
      healthIds.push(s.id);
      newest = newer(newest, yearsIn(text));
    }

    // normal：风险评估 + 结论措辞才算 direct；只有 ADI/限量是 reference
    if (kind === EVIDENCE_KIND.RISK) {
      if (EVALUATION_RE.test(text)) {
        normal.state = 'direct';
        normal.evidenceIds.push(s.id);
      } else if (normal.state === 'missing') {
        normal.state = 'reference';
        normal.evidenceIds.push(s.id);
      }
    }

    // high：必须同时有「影响」和「高摄入语境」
    if (EFFECT_RE.test(text) && HIGH_CONTEXT_RE.test(text)) {
      const human = HUMAN_RE.test(stripNegatedHuman(text));
      const animal = ANIMAL_RE.test(text);
      const state = human && !animal ? 'human_effect' : 'animal';
      const rank = { missing: 0, reference: 1, animal: 2, human_effect: 3 };
      if (rank[state] > rank[high.state]) {
        high.state = state;
        high.evidenceIds = [s.id];
      } else if (state === high.state) {
        high.evidenceIds.push(s.id);
      }
    } else if (kind === EVIDENCE_KIND.RISK && high.state === 'missing') {
      high.state = 'reference';
    }

    // sensitive：必须点名人群，且资料本身是评估/人群提示/人群研究
    if (NAMED_GROUP_RE.test(text) && (isHealth || kind === EVIDENCE_KIND.HUMAN)) {
      if (sensitive.state !== 'named') {
        sensitive.state = 'named';
        sensitive.evidenceIds = [s.id];
      } else {
        sensitive.evidenceIds.push(s.id);
      }
    }
  }

  const currentYear = new Date(now).getFullYear();
  const stale = newest == null || newest < currentYear - 8;
  const recent = {
    needed: Boolean(stale && healthIds.length > 0 && (normal.state !== 'direct' || high.state !== 'human_effect')),
    newestYear: newest,
    evidenceIds: healthIds,
  };

  const satisfied = [];
  if (identity === 'confirmed') satisfied.push('identity');
  if (normal.state === 'direct') satisfied.push('normal');
  if (high.state === 'human_effect') satisfied.push('high');
  if (sensitive.state === 'named') satisfied.push('sensitive');
  if (!recent.needed) satisfied.push('recent');

  return { identity, normal, high, sensitive, recent, satisfied };
}

/**
 * 下一轮该查什么（纯函数）。
 *
 * 顺序体现产品优先级，而不是固定脚本：
 *   身份 → 正常食用 → 高摄入 → 特殊人群 → 较新评估。
 * 已经满足的项会跳过；全部满足则返回 null，研究提前结束。
 *
 * @returns {'identity'|'food_use'|'normal'|'high'|'sensitive'|'recent'|null}
 */
export function chooseResearchFocus(checklist, { hasLocalEntry = false, attempted = [] } = {}) {
  if (!checklist) return RESEARCH_FOCUS.IDENTITY;
  if (checklist.identity !== 'confirmed') {
    return hasLocalEntry ? RESEARCH_FOCUS.FOOD_USE : RESEARCH_FOCUS.IDENTITY;
  }

  // 健康类目标每个只有一条固定查询，重复同一目标不会带来新资料。
  // 已经试过且没有改善的，直接跳到下一项，避免四轮都耗在同一个缺口上。
  const tried = new Set(attempted);
  const plan = [
    ['normal', checklist.normal?.state === 'direct'],
    ['high', checklist.high?.state === 'human_effect'],
    ['sensitive', checklist.sensitive?.state === 'named'],
    ['recent', !checklist.recent?.needed],
  ];
  for (const [focus, satisfied] of plan) {
    if (satisfied) continue;
    if (tried.has(focus)) continue;
    return focus;
  }
  return null;
}

/**
 * 判断这一轮有没有带来实质进展（用于「连续两轮没有新增」时提前停止）。
 * 只比较四项状态与证据编号数量，不比较文本。
 */
export function checklistSignature(checklist) {
  if (!checklist) return '';
  return JSON.stringify({
    identity: checklist.identity,
    normal: checklist.normal?.state,
    high: checklist.high?.state,
    sensitive: checklist.sensitive?.state,
    recent: checklist.recent?.needed,
    n: (checklist.normal?.evidenceIds?.length || 0) + (checklist.high?.evidenceIds?.length || 0),
  });
}
