/**
 * 「这次到底有没有健康评估资料」的确定性判定（V2.3 全局整改，纯函数）。
 *
 * 为什么需要单独一层：
 * 旧流程用「有没有食品相关正文」当作唯一门槛。GB 2760 的使用条件页当然是
 * 食品相关的，于是第一轮刚拿到技术标准，程序就认为资料齐了 ——
 * 健康区块自然是空的，用户看到的永远是「它是甜味剂的一种」。
 *
 * 这一层不判断结论对错，只回答两个问题：
 *   1. 现有证据里，有没有一份既提到这个物质、又真的在讲健康评估的资料？
 *   2. 这些资料分别属于哪一类（风险评估 / 敏感人群 / 人体研究 / 动物研究 / 技术标准）？
 *
 * 判据是关键词而非语义 —— 所以它只能用来决定「还要不要补搜」「要不要提示资料缺口」，
 * 绝不能用来给健康结论背书。真正的准入仍然由 healthGuard 逐条检查。
 */

/** 证据类型：决定它能回答什么，不能回答什么 */
export const EVIDENCE_KIND = {
  RISK: 'risk_assessment', // 正式风险评估 / ADI / 每日允许摄入量
  SENSITIVE: 'sensitive_group', // 点名了某类人群或疾病
  HUMAN: 'human_study', // 人群研究
  ANIMAL: 'animal_study', // 动物 / 体外研究
  STANDARD: 'technical_standard', // 使用标准、产品标准、限量表
  OTHER: 'other',
};

export const EVIDENCE_KIND_LABELS = {
  risk_assessment: '风险评估',
  sensitive_group: '人群提示',
  human_study: '人群研究',
  animal_study: '动物/体外研究',
  technical_standard: '技术标准',
  other: '其他资料',
};

/** 一眼就能确认是「评估结论」的强标记 */
const STRONG_RISK_MARKERS = [
  /\bADIs?\b/i,
  /acceptable daily intake/i,
  /每日允许摄入量/,
  /每日容许摄入量/,
  /健康指导值/,
  /风险评估/,
  /risk assessment/i,
  /safety evaluation/i,
  /safety assessment/i,
  /\bTDI\b/i,
  // 正式再评估 / 科学意见的标题与结论措辞（EFSA 的页面常常只写 re-evaluation，
  // 不出现 "risk assessment" 字样；漏掉它们会把最新的评估当成普通网页）
  /re-?evaluation/i,
  /scientific opinion/i,
  /no safety concern/i,
  /dietary exposure/i,
  // JECFA 专论 / 正式毒理学评估的标题与结论措辞
  /toxicological (?:evaluation|monograph|data)/i,
  /who food additives series/i,
  /not of toxicological significance/i,
  /observations? in humans?/i,
  /evaluation year/i,
  /monograph/i,
];

/** 健康评估语境标记（中英）—— 含弱标记，用于判断语境 */
const RISK_MARKERS = [
  /\bADIs?\b/i,
  /\bNOAEL\b/i,
  /\bNOEL\b/i,
  /\bTDI\b/i,
  /acceptable daily intake/i,
  /tolerable daily intake/i,
  /每日允许摄入量/,
  /每日容许摄入量/,
  /耐受摄入量/,
  /健康指导值/,
  /风险评估/,
  /risk assessment/i,
  /safety evaluation/i,
  /safety assessment/i,
  /毒理学/,
  /mg\/kg\s*(bw|体重)/i,
];

/** 正式评估机构的评估语汇（与 RISK_MARKERS 同时出现时更像评估结论） */
const EVALUATION_ORG = /(JECFA|EFSA|WHO|FAO|世界卫生组织|粮农组织|风险评估中心|CFSA|FDA)/i;

/** 技术标准 / 使用条件的标记 */
const STANDARD_MARKERS = [
  /GB\s?\d{4,5}/i,
  /食品添加剂使用标准/,
  /最大使用量/,
  /最大残留量/,
  /使用范围/,
  /食品分类号/,
  /CNS\s*号/,
  /\bINS\s?\d+/i,
  /表\s?A\.\d/,
  /good manufacturing practice/i,
  /\bGMP\b/,
];

/** 点名人群 / 疾病 */
const SENSITIVE_MARKERS = [
  /苯丙酮尿症/,
  /phenylketonuria/i,
  /\bPKU\b/,
  /哮喘/,
  /asthma/i,
  /亚硫酸盐敏感/,
  /sulfite[- ]sensitive/i,
  /过敏/,
  /allerg/i,
  /不耐受/,
  /intoleran/i,
  /婴幼儿/,
  /婴儿/,
  /infant/i,
  /孕妇/,
  /pregnan/i,
  /乳母/,
  /breastfeed/i,
  /儿童/,
  /children/i,
  /肾病/,
  /kidney/i,
];

const ANIMAL_MARKERS = [/大鼠/, /小鼠/, /豚鼠/, /动物实验/, /动物研究/, /\brats?\b/i, /\bmice\b/i, /in vitro/i, /细胞实验/];
const HUMAN_MARKERS = [/人群/, /受试者/, /志愿者/, /队列/, /临床试验/, /randomi[sz]ed/i, /cohort/i, /\btrial\b/i];

function evidenceText(ev) {
  return `${ev?.title || ''}\n${ev?.excerpt || ''}`;
}

/**
 * 判断一份证据属于哪一类。
 *
 * 优先级：风险评估 > 人群提示 > 人体研究 > 动物研究 > 技术标准 > 其他。
 * 一份资料可以同时是「标准 + 提到 ADI」，这时按风险评估算 ——
 * 但只有在它真的出现评估语汇时才这样判，不会因为标题里有 GB 号就升级。
 */
export function classifyEvidenceKind(source) {
  const text = evidenceText(source);
  const strongHits = STRONG_RISK_MARKERS.filter((re) => re.test(text));
  const riskHits = RISK_MARKERS.filter((re) => re.test(text));
  const standardHits = STANDARD_MARKERS.filter((re) => re.test(text));
  const sensitiveHits = SENSITIVE_MARKERS.filter((re) => re.test(text));
  const org = EVALUATION_ORG.test(text);

  // 纯技术标准：有标准标记、且没有任何评估语汇 → 只能解释使用条件
  if (riskHits.length === 0 && standardHits.length > 0) {
    return {
      kind: EVIDENCE_KIND.STANDARD,
      markers: [],
      standardMarkers: standardHits.map(String).slice(0, 2),
      sensitive: sensitiveHits.length > 0,
    };
  }
  // 出现 ADI / 每日允许摄入量 / 风险评估这类强标记 → 评估资料
  if (strongHits.length > 0) {
    return {
      kind: EVIDENCE_KIND.RISK,
      markers: [...strongHits, ...riskHits].map((re) => (text.match(re) || [''])[0]).filter(Boolean).slice(0, 4),
      sensitive: sensitiveHits.length > 0,
    };
  }
  // 只有 NOAEL / mg/kg 这类弱标记时，必须同时出现评估机构才按评估算，
  // 否则一份动物实验摘要会被误当成「权威评估」。
  if (riskHits.length > 0 && org) {
    return {
      kind: EVIDENCE_KIND.RISK,
      markers: riskHits.map((re) => (text.match(re) || [''])[0]).filter(Boolean).slice(0, 4),
      sensitive: sensitiveHits.length > 0,
    };
  }
  if (ANIMAL_MARKERS.some((re) => re.test(text))) {
    return { kind: EVIDENCE_KIND.ANIMAL, markers: [], sensitive: sensitiveHits.length > 0 };
  }
  if (HUMAN_MARKERS.some((re) => re.test(text))) {
    return { kind: EVIDENCE_KIND.HUMAN, markers: [], sensitive: sensitiveHits.length > 0 };
  }
  if (sensitiveHits.length > 0) {
    return { kind: EVIDENCE_KIND.SENSITIVE, markers: [], sensitive: true };
  }
  return { kind: EVIDENCE_KIND.OTHER, markers: [] };
}

/**
 * 找出「提到该物质 + 含健康评估语汇」的证据。
 *
 * 技术标准不算健康评估 —— 这正是上一版最关键的误判：
 * GB 2760 页面让程序以为「资料齐了」，于是永远不会补搜健康资料。
 *
 * @param {Array} sources 证据集合（K/W）
 * @param {{ names?: string[] }} [opts] 该物质的名称与别名
 * @returns {{ available: boolean, evidenceIds: string[], kinds: object, markers: string[] }}
 */
export function findHealthEvidence(sources = [], { names = [] } = {}) {
  const lowered = names.map((n) => String(n || '').toLowerCase()).filter((n) => n.length >= 2);
  const hits = [];
  const kinds = {};
  const markers = new Set();

  for (const s of sources) {
    const text = evidenceText(s);
    const lower = text.toLowerCase();
    const mentions = lowered.length === 0 || lowered.some((n) => lower.includes(n));
    if (!mentions) continue;

    const cls = classifyEvidenceKind(s);
    kinds[s.id] = cls.kind;
    // 风险评估与「点名人群」的资料都算健康材料；技术标准不算。
    if (cls.kind !== EVIDENCE_KIND.RISK && cls.kind !== EVIDENCE_KIND.SENSITIVE) continue;

    hits.push(s.id);
    (cls.markers || []).forEach((m) => markers.add(m));
  }

  return {
    available: hits.length > 0,
    evidenceIds: [...new Set(hits)],
    kinds,
    markers: [...markers].slice(0, 6),
  };
}
