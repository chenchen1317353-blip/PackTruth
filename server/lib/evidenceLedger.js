/**
 * 证据台账（纯函数，不联网）。
 *
 * 旧流程的问题是「收集完资料再让模型整理」：
 *   - 程序不知道一份长报告里到底有没有人体研究章节；
 *   - 也不知道「高摄入」这一项到底答没答上；
 *   - 抓取失败、域名被拦、资料只有 ADI，最后都被写成同一句「没有健康信息」。
 *
 * 这个模块把每份资料拆成可判定的记录：
 *   身份匹配 / 证据类型 / 章节 / 四项健康问题覆盖 / 研究条件 / 失败原因。
 * 它不生成任何健康结论，只服务于「下一步查什么」和「最后诚实说明查过什么」。
 */

import {
  matchEvidenceToIdentity,
  BASIS_LABELS,
  normalizeName,
} from './substanceIdentity.js';

/** 章节类型 */
export const SECTION = {
  IDENTITY: 'identity',
  METABOLISM: 'metabolism',
  ANIMAL: 'animal',
  HUMAN: 'human',
  DIETARY: 'dietary',
  ADVERSE: 'adverse',
  SENSITIVE: 'sensitive',
  EVALUATION: 'evaluation',
  COMMENTS: 'comments',
  REFERENCES: 'references',
  OTHER: 'other',
};

export const SECTION_LABELS = {
  identity: '身份与说明',
  metabolism: '代谢与生化',
  animal: '动物/体外毒理',
  human: '人体观察',
  dietary: '膳食暴露',
  adverse: '不良反应',
  sensitive: '敏感人群',
  evaluation: '正式评价/结论',
  comments: '评述',
  references: '参考文献',
  other: '其他正文',
};

export const QUESTION = {
  IDENTITY: 'identity',
  NORMAL: 'normal',
  HIGH: 'high',
  SENSITIVE: 'sensitive',
  RECENT: 'recent',
  ORIGINAL: 'original',
};

export const QUESTION_LABELS = {
  identity: '研究对象身份',
  normal: '正常食用的健康评估',
  high: '高摄入/长期暴露的人体影响',
  sensitive: '特殊人群',
  recent: '较新的正式评估',
  original: '关键原始资料',
};

/**
 * 标题必须「整行就是标题」。
 *
 * 旧写法允许 `adverse effects?` 在句首命中，结果
 * "adverse effects related to ... (Palmer" 这种正文句子被当成章节标题，
 * 把整篇切得七零八落。下面先去掉编号，再要求整行匹配。
 */
const HEADING_RULES = [
  { key: SECTION.EVALUATION, re: /^(?:evaluation|conclusions?|overall conclusions?|评价|结论|安全性评价)$/i },
  { key: SECTION.HUMAN, re: /^(?:observations?\s+in\s+humans?|human\s+(?:studies|observations|data|evidence)|clinical\s+(?:studies|trials?)|studies?\s+in\s+humans?|人体观察|人体研究|人群研究|临床研究)$/i },
  { key: SECTION.SENSITIVE, re: /^(?:(?:sensitive|susceptible|at[- ]risk|vulnerable)\s+(?:population|populations|groups?|subgroups?)|特殊人群|敏感人群|易感人群)$/i },
  { key: SECTION.DIETARY, re: /^(?:dietary\s+exposure|exposure\s+assessment|intake\s+assessment|膳食暴露|摄入量评估)$/i },
  { key: SECTION.ADVERSE, re: /^(?:adverse\s+(?:effects?|reactions?)|side\s+effects?|health\s+effects?|不良反应|健康影响)$/i },
  { key: SECTION.METABOLISM, re: /^(?:biochemical\s+aspects?|biological\s+data|absorption(?:,\s*distribution(?:,\s*and\s*excretion)?)?|distribution|biotransformation|metabolism|pharmacokinetics|代谢|生物转化|吸收)$/i },
  { key: SECTION.ANIMAL, re: /^(?:toxicological\s+studies?|acute\s+toxicity(?:\s+studies?)?|short[- ]term\s+toxicity(?:\s+studies?)?|long[- ]term\s+toxicity(?:\s*\/\s*carcinogenicity)?(?:\s+studies?)?|carcinogenicity(?:\s+studies?)?|reproduction\s+studies?|reproductive\s+toxicity|special\s+studies?(?:\s+on\s+.+)?|genotoxicity(?:\s+studies?)?|embryotoxicity|teratogenicity|毒理学研究|急性毒性|短期毒性|长期毒性|致癌性|繁殖毒性|遗传毒性)$/i },
  { key: SECTION.COMMENTS, re: /^(?:comments?|discussion|评述|讨论)$/i },
  { key: SECTION.IDENTITY, re: /^(?:explanation|identity|chemical\s+names?|synonyms|definition|说明|身份|名称)$/i },
  { key: SECTION.REFERENCES, re: /^(?:references?|bibliography|参考文献)$/i },
];

function headingKey(line) {
  const t = String(line || '').trim();
  if (!t || t.length > 120) return null;
  let clean = t
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s*/, '').replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/, '')
    .trim();
  // 去掉章节编号（2.2.1 / 4. / 1）
  clean = clean.replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim();
  // 去掉标题末尾的括号说明（例如 "Adverse effects (human)"）
  clean = clean.replace(/\s*[（(][^（）()]{0,40}[）)]\s*$/, '').trim();
  for (const rule of HEADING_RULES) {
    if (rule.re.test(clean)) return rule.key;
  }
  if (/^(?:abstract|summary)$/i.test(clean)) return SECTION.EVALUATION;
  if (!/^#{1,6}\s/.test(t) && !/^\d+(?:\.\d+)*\s/.test(t)) return null;
  if (/human|clinical|volunteer|hypersensitiv|allergenicity|food intolerance/i.test(clean)) return SECTION.HUMAN;
  if (/exposure (?:estimate|assessment)|dietary exposure/i.test(clean)) return SECTION.DIETARY;
  // Every markdown heading is a boundary, even when its meaning is unknown.
  if (/^#{1,6}\s/.test(t)) return SECTION.OTHER;
  return null;
}

/**
 * 按标题切分长篇原文。
 *
 * 返回的 section 保留原始顺序和起止位置，text 是逐字原文（只去掉标题行本身）。
 * 没有识别到任何标题时，整篇归到 other —— 不能因为切不出来就丢掉正文。
 */
export function splitSections(rawText) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return { sections: [], found: [], textLength: 0 };

  const lines = text.split('\n');
  const markers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const key = headingKey(lines[i]);
    if (key) markers.push({ key, line: i, heading: lines[i].trim() });
  }

  if (markers.length === 0) {
    return {
      sections: [{ key: SECTION.OTHER, heading: '正文', text: text.trim(), start: 0, end: text.length }],
      found: [SECTION.OTHER],
      textLength: text.length,
    };
  }

  // 同一位置连续多个标题时只保留最后一个（例如 "2. BIOLOGICAL DATA" 后紧跟 "2.1 ..."）
  const dedup = [];
  for (const m of markers) {
    if (dedup.length && dedup[dedup.length - 1].line === m.line) dedup[dedup.length - 1] = m;
    else if (dedup.length && m.line - dedup[dedup.length - 1].line <= 1) dedup[dedup.length - 1] = m;
    else dedup.push(m);
  }

  const sections = [];
  for (let i = 0; i < dedup.length; i += 1) {
    const cur = dedup[i];
    const next = dedup[i + 1];
    const bodyStart = cur.line + 1;
    const bodyEnd = next ? next.line : lines.length;
    const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();
    if (!body) continue;
    sections.push({
      key: cur.key,
      heading: cur.heading.replace(/^#{1,6}\s*/, '').trim(),
      text: body,
      start: bodyStart,
      end: bodyEnd,
    });
  }

  if (sections.length === 0) {
    return {
      sections: [{ key: SECTION.OTHER, heading: '正文', text: text.trim(), start: 0, end: text.length }],
      found: [SECTION.OTHER],
      textLength: text.length,
    };
  }

  return {
    sections,
    found: [...new Set(sections.map((s) => s.key))],
    textLength: text.length,
  };
}

// ---------------------------------------------------------------- 语汇

const HEALTH_EFFECT_RE =
  /(uric acid|serum urate|blood pressure|hypertension|headache|migraine|asthma|wheez|bronchospasm|anaphyla|allergic|allergy|adverse (?:effect|reaction)|dental caries|caries|weight gain|obesity|hyperactiv|kidney|renal|liver|hepatotox|blood glucose|serum cholesterol|constipation|diarrh|nausea|vomit|abdominal pain|flushing|palpitation|symptom complex|insulin|尿酸|血压|头痛|偏头痛|哮喘|喘息|过敏|不良反应|龋齿|体重增加|肥胖|肾|肝|血糖|血脂|腹泻|便秘|恶心|呕吐|腹痛|心悸)/i;

const DOSE_RE =
  /(\d[\d,.]*\s*(?:-|–|to)?\s*\d*\s*(?:mg|g|µg|μg|milligrams?|grams?)\s*(?:\/\s*(?:kg\s*(?:bw|body weight)?|day|d|person|人|公斤|千克|天|serving|份))?|\d[\d,.]*\s*(?:mg|g)\s*(?:\/\s*(?:100\s*ml|dl|day))|per\s+serving|每份|doses?\s+(?:of|at)|剂量|mg\/kg|mg\/day|g\/day)/i;

/** 高摄入语境：没有具体剂量时，至少要有这个，才能把人体影响算进「高摄入」 */
const HIGH_CONTEXT_RE =
  /(high intake|high exposure|high consumption|high dose|excessive|overconsumption|long[- ]term|prolonged|chronic|at high|高摄入|高暴露|高剂量|过量|长期)/i;

const HUMAN_RE =
  /(human|volunteer|participants?|subjects?|cohort|randomi[sz]ed|\btrial\b|epidemiolog|healthy (?:men|women|adults)|patients?|individuals?|asthma|asthmatic|人群|受试者|志愿者|队列|临床试验|流行病学|健康(?:男|女|人)|儿童|成人|患者)/i;

const ANIMAL_RE =
  /(rat|rats|mice|mouse|animal|in vitro|in vivo|rabbit|dog|monkey|大鼠|小鼠|豚鼠|动物实验|动物研究|体外|细胞实验|兔|犬|猴)/i;

const NAMED_GROUP_RE =
  /(苯丙酮尿症|phenylketonuria|\bPKU\b|哮喘|asthma|亚硫酸盐敏感|sulfite[- ]sensitive|sulphite[- ]sensitive|过敏|allerg|不耐受|intoleran|婴幼儿|婴儿|infant|孕妇|pregnan|乳母|breastfeed|儿童|children|老年人|肾病|kidney disease|高血压|hypertension|糖尿病|diabet|痛风|gout|偏头痛|migraine|贫血|anaemia|anemia|遗传代谢)/i;

const CONCLUSION_RE =
  /(no safety concern|not of toxicological significance|no toxicological significance|no adverse (?:effects?|findings?)|did not (?:find|identify|observe)|not specified|not limited|no need to (?:revise|change)|exposure[^.]{0,60}below the ADI|below the (?:group )?ADI|(?:mean |high )?exposure exceeded|exceeded the (?:proposed )?ADI|re-?confirmed|未发现|未观察到|没有发现|没有观察到|无安全(?:担忧|关切)|不构成[^。；]{0,8}(?:危害|风险)|低于[^。；]{0,12}(?:ADI|每日允许摄入量)|超过[^。；]{0,12}(?:ADI|每日允许摄入量)|无需规定|无须规定)/i;

const REFERENCE_RE =
  /(\bADIs?\b|acceptable daily intake|tolerable daily intake|\bTDI\b|每日允许摄入量|每日容许摄入量|耐受摄入量|参考摄入量|暴露量|mg\/kg\s*(?:bw|体重))/i;

const TECHNICAL_RE =
  /(GB\s?\d{4,5}|食品添加剂使用标准|最大使用量|最大残留量|使用范围|食品分类号|CNS\s*号|\bINS\s?\d+|good manufacturing practice|\bGMP\b|表\s?A\.\d)/i;

const JOINT_RE = /(mixture|combined|50\s*[:：]\s*50|联合|混合物|both substances|these substances)/i;

function sourceText(record) {
  return `${record?.title || ''}\n${record?.rawText || record?.excerpt || ''}`;
}

/** 取一句包含关键词的短句，供规划器阅读（不改写） */
function sentencesAround(text, re, { max = 3, width = 360 } = {}) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const out = [];
  const reG = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = reG.exec(s)) !== null && out.length < max) {
    const start = Math.max(0, m.index - 120);
    const end = Math.min(s.length, m.index + width);
    out.push(s.slice(start, end).trim());
    if (m.index === reG.lastIndex) reG.lastIndex += 1;
  }
  return [...new Set(out)];
}

/** 从人体章节里抽出研究条件（只用于展示/规划，不作为结论） */
export function extractStudyHints(text) {
  const s = String(text || '');
  const hints = {
    subjects: sentencesAround(s, /\b(?:healthy|male|female|volunteer|subject|participant|men|women|adults?|children|infants?)\b|受试者|志愿者|健康(?:男|女)/i, { max: 2 }),
    doses: sentencesAround(s, DOSE_RE, { max: 3 }),
    duration: sentencesAround(s, /(?:for|over|during)\s+\d+\s*(?:days?|weeks?|months?|years?)|每(?:个)?剂量\s*\d+\s*天|\d+\s*(?:天|周|个月|年)/i, { max: 2 }),
    effects: sentencesAround(s, HEALTH_EFFECT_RE, { max: 3 }),
  };
  return hints;
}

function yearsIn(text) {
  const out = [];
  const re = /\b(19[5-9]\d|20[0-4]\d)\b/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(Number(m[1]));
  return out;
}

/** 从记录里推断评估年份：优先 date/publishedAt，其次正文里的四位数年份 */
export function recordYear(record) {
  const fromMeta = String(record?.publishedAt || record?.date || '').match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (fromMeta) return Number(fromMeta[1]);
  // 正文里的年份太多（参考文献），只在评价/身份章节里找
  const evalText = [
    record?.sections?.evaluation || '',
    record?.sections?.identity || '',
    record?.sections?.comments || '',
  ].join('\n');
  const years = yearsIn(evalText);
  if (years.length) return Math.max(...years);
  return null;
}

// ---------------------------------------------------------------- 台账

let recordSeq = 0;
export function resetLedgerIds() {
  recordSeq = 0;
}
function nextRecordId() {
  recordSeq += 1;
  return `S${recordSeq}`;
}

export function createEvidenceLedger({ identity, hasLocalEntry = false } = {}) {
  return {
    identity,
    hasLocalEntry: Boolean(hasLocalEntry),
    records: [],
    searches: [],
    fetchFailures: [],
    blocked: [],
    notes: [],
    createdAt: Date.now(),
    coverage: {
      identity: hasLocalEntry ? 'confirmed' : 'missing',
      normal: 'missing',
      high: 'missing',
      sensitive: 'missing',
      recent: 'untouched',
      original: 'missing',
    },
    evidenceIdsByQuestion: {
      normal: [],
      high: [],
      sensitive: [],
      recent: [],
      original: [],
    },
  };
}

function classifyRecord(record) {
  const text = sourceText(record);
  const sec = record.sections || {};
  const hasEval = Boolean(sec.evaluation || sec.comments);
  const hasHuman = Boolean(sec.human);
  const hasAnimal = Boolean(sec.animal);
  const hasAdverse = Boolean(sec.adverse);
  const hasSensitive = Boolean(sec.sensitive);
  const healthish = HEALTH_EFFECT_RE.test(text);
  const technical = TECHNICAL_RE.test(text);
  const conclusion = CONCLUSION_RE.test(text);
  const reference = REFERENCE_RE.test(text);

  if (hasHuman || (HUMAN_RE.test(text) && healthish && DOSE_RE.test(text))) return 'human';
  if (hasSensitive) return 'sensitive';
  if (hasEval || conclusion || reference) return 'evaluation';
  if (hasAnimal || ANIMAL_RE.test(text)) return 'animal';
  if (hasAdverse && healthish) return 'adverse';
  if (technical) return 'technical';
  return 'other';
}

function assessNormal(record, text) {
  if (!record.match?.allowsDirectClaim) return null;
  const sec = `${record.sections?.evaluation || ''}\n${record.sections?.comments || ''}\n${text}`;
  if (CONCLUSION_RE.test(sec) && (REFERENCE_RE.test(sec) || /exposure|dietary|膳食|摄入/i.test(sec))) {
    return 'direct';
  }
  if (CONCLUSION_RE.test(sec)) return 'direct';
  if (REFERENCE_RE.test(sec)) return 'reference';
  return null;
}

function assessHigh(record) {
  const humanText = record.sections?.human || '';
  const adverseText = record.sections?.adverse || '';
  const evalText = record.sections?.evaluation || '';
  const all = sourceText(record);
  const humanPool = `${humanText}\n${adverseText}`;
  const humanEvidence =
    HUMAN_RE.test(humanPool) &&
    HEALTH_EFFECT_RE.test(humanPool) &&
    (DOSE_RE.test(humanPool) || HIGH_CONTEXT_RE.test(humanPool) || /increase|decrease|doubled|elevated|升高|增加|下降/i.test(humanPool));

  if (humanEvidence) return 'human';
  // 没有单独人体章节时，正文里同时出现人体、高摄入语境和影响，也算；
  // 剂量不是硬门槛（很多摘要不写剂量），但最终结论必须保留资料实际给出的条件。
  if (
    HUMAN_RE.test(all) &&
    HEALTH_EFFECT_RE.test(all) &&
    (DOSE_RE.test(all) || HIGH_CONTEXT_RE.test(all)) &&
    !ANIMAL_RE.test(all)
  ) {
    return 'human';
  }
  if (ANIMAL_RE.test(`${record.sections?.animal || ''}\n${all}`) && HEALTH_EFFECT_RE.test(all) && DOSE_RE.test(all)) {
    return 'animal';
  }
  if (REFERENCE_RE.test(`${evalText}\n${all}`)) return 'reference';
  return null;
}

function assessSensitive(record) {
  // 只看「人」的章节：动物实验里的 pregnant rats / kidney weight
  // 不是「特殊人群提示」。参考文献里的标题也不能算。
  const pool = [
    record.sections?.evaluation,
    record.sections?.human,
    record.sections?.sensitive,
    record.sections?.adverse,
    record.sections?.dietary,
    record.sections?.comments,
  ]
    .filter(Boolean)
    .join('\n');
  const text = pool || (record.sections?.animal || record.sections?.references ? '' : sourceText(record));
  if (!text || !NAMED_GROUP_RE.test(text)) return null;

  // 必须有一句「点名人群 + 提示/风险/建议」的话，而不是只在研究标题里出现
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  const hasAdvice = sentences.some(
    (s) =>
      NAMED_GROUP_RE.test(s) &&
      /(risk|sensitive|susceptib|adverse|reaction|should|advise|avoid|caution|concern|limit|exposure|intake|recommend|not applicable|需要|注意|风险|建议|避免|敏感|不良反应|不宜|限制|暴露|摄入)/i.test(
        s,
      ),
  );
  if (!hasAdvice) return null;
  return 'named';
}

/**
 * 把一条搜索结果或抓取结果写入台账。
 *
 * @param {object} ledger
 * @param {object} p
 * @param {string} p.url
 * @param {string} p.title
 * @param {string} p.content 可用正文（搜索 content / Fetch Markdown）
 * @param {string} p.snippet
 * @param {string} [p.organization]
 * @param {string} [p.publishedAt]
 * @param {number} [p.authority]
 * @param {boolean} [p.read] 是否是 Fetch 读取的原文
 * @param {string} [p.focus]
 * @param {number} [p.round]
 * @returns {object} record
 */
export function addRecord(ledger, p = {}) {
  const content = String(p.content || '').trim();
  const snippet = String(p.snippet || '').trim();
  const rawText = content || snippet;
  const split = content ? splitSections(content) : { sections: [], found: [] };
  const sections = {};
  for (const s of split.sections) {
    // 同一类型出现多次时保留最长的一段（例如多个 "Comments"）
    sections[s.key] = [sections[s.key], s.text].filter(Boolean).join('\n\n');
  }

  const identity = ledger.identity;
  const match = matchEvidenceToIdentity(`${p.title || ''}\n${rawText}`, identity);
  const record = {
    id: nextRecordId(),
    url: p.url || '',
    title: p.title || p.url || '',
    organization: p.organization || '',
    publishedAt: p.publishedAt || p.date || null,
    authority: p.authority ?? null,
    sourceType: p.read ? 'fetch_content' : content ? 'search_content' : 'search_summary',
    read: Boolean(p.read),
    focus: p.focus || null,
    round: p.round ?? null,
    rawText,
    excerpt: '',
    sections,
    sectionList: split.sections,
    found: split.found,
    match,
    kind: 'other',
    year: null,
    questions: { normal: null, high: null, sensitive: null },
    studyHints: {},
    note: null,
  };
  record.kind = classifyRecord(record);
  record.year = recordYear(record);
  record.questions.normal = assessNormal(record, rawText);
  record.questions.high = assessHigh(record);
  record.questions.sensitive = assessSensitive(record);
  record.studyHints = extractStudyHints(`${record.sections.human || ''}\n${rawText}`);

  // 同一 URL 已存在：用更完整的版本替换，不重复计数
  const idx = ledger.records.findIndex((r) => r.url && r.url === record.url);
  if (idx >= 0) {
    const old = ledger.records[idx];
    // 保留原来的编号，便于规划器前后引用
    record.id = old.id;
    if (old.rawText.length > rawText.length) {
      old.read ||= record.read;
      if (old.read) old.sourceType = 'fetch_content';
      refreshCoverage(ledger);
      return old;
    }
    record.read ||= old.read;
    if (record.read) record.sourceType = 'fetch_content';
    ledger.records[idx] = record;
  } else {
    ledger.records.push(record);
  }

  refreshCoverage(ledger);
  return record;
}

/** 记录一次搜索（用于完成度审计与提示词） */
export function addSearch(ledger, { round, focus, query, resultCount = 0, addedCount = 0, durationMs = 0 } = {}) {
  ledger.searches.push({ round, focus, query, resultCount, addedCount, durationMs });
}

/** 记录一次抓取失败：必须保留真实原因，不能写成「没有资料」 */
export function addFetchFailure(ledger, { url, reason, code = null } = {}) {
  ledger.fetchFailures.push({ url: String(url || ''), reason: String(reason || '未知原因'), code });
}

/**
 * 重新计算四项覆盖。
 *
 * 规则：
 * - 只有「允许直接引用」的证据才算答上；组成物质的联合评估也算，
 *   但会记下 basis，最终展示时必须标明。
 * - 动物证据只能算「查过，但只有动物证据」，不能算人体高摄入已回答。
 * - 敏感人群必须点名，且资料本身是健康/人群资料。
 */
export function refreshCoverage(ledger) {
  const coverage = {
    identity: ledger.hasLocalEntry ? 'confirmed' : 'missing',
    normal: 'missing',
    high: 'missing',
    sensitive: 'missing',
    recent: 'untouched',
    original: 'missing',
  };
  const ids = { normal: [], high: [], sensitive: [], recent: [], original: [] };
  let newest = null;

  // 「相关但不同的化学形式」只有在共享组 ADI 时，才能给高摄入/人群提供背景证据；
  // 它永远不能把「正常食用」变成 direct。
  const usableFor = (r, question) => {
    if (r.match?.allowsDirectClaim) return true;
    if (r.match?.match === 'analog' && r.match?.groupShared && question !== 'normal') return true;
    return false;
  };

  for (const r of ledger.records) {
    if (r.match?.allowsDirectClaim && r.rawText.length >= 120) coverage.identity = 'confirmed';
    if (!usableFor(r, 'normal') && !usableFor(r, 'high') && !usableFor(r, 'sensitive')) continue;

    if (r.questions.normal === 'direct' && usableFor(r, 'normal')) {
      if (coverage.normal !== 'direct') {
        coverage.normal = 'direct';
        ids.normal = [r.id];
      } else ids.normal.push(r.id);
    } else if (r.questions.normal === 'reference' && coverage.normal === 'missing' && usableFor(r, 'normal')) {
      coverage.normal = 'reference';
      ids.normal = [r.id];
    }

    if (r.questions.high === 'human' && usableFor(r, 'high')) {
      if (coverage.high !== 'human') {
        coverage.high = 'human';
        ids.high = [r.id];
      } else ids.high.push(r.id);
    } else if (r.questions.high === 'animal' && usableFor(r, 'high')) {
      // 动物证据比「只有参考值」更有信息量，可以覆盖 reference
      if (coverage.high === 'missing' || coverage.high === 'reference') {
        coverage.high = 'animal';
        ids.high = [r.id];
      } else if (coverage.high === 'animal') ids.high.push(r.id);
    } else if (r.questions.high === 'reference' && coverage.high === 'missing' && usableFor(r, 'high')) {
      coverage.high = 'reference';
      ids.high = [r.id];
    }

    if (r.questions.sensitive === 'named' && usableFor(r, 'sensitive')) {
      if (coverage.sensitive !== 'named') {
        coverage.sensitive = 'named';
        ids.sensitive = [r.id];
      } else ids.sensitive.push(r.id);
    }

    if (r.kind === 'evaluation' || r.kind === 'human') {
      if (r.year && (newest == null || r.year > newest)) newest = r.year;
      // Search 的 need_content=true 可能已经带回完整正文；
      // 只要正文足够长且能定位到人体/评价章节，就算「已取得可读原文」。
      const readableBody =
        r.read ||
        (r.rawText.length >= 1500 && Boolean(r.sections?.human || r.sections?.evaluation));
      if (readableBody) coverage.original = 'read';
      else if (coverage.original === 'missing') coverage.original = 'search_only';
    }
  }

  const currentYear = new Date().getFullYear();
  // 10 年作为「偏旧」的阈值：EFSA/JECFA 的评估通常不会每年重做，
  // 8 年会误伤仍在有效期内、只是没有新版本的评估。
  const stale = newest == null || newest < currentYear - 10;
  // 只有「已经有健康证据但偏旧」时才需要补查新评估；
  // 完全没有健康证据时，先补证据，不要一上来就查「最新」。
  const hasHealth = coverage.normal !== 'missing' || coverage.high !== 'missing' || coverage.sensitive !== 'missing';
  if (hasHealth) {
    coverage.recent = stale ? 'needed' : 'current';
    ids.recent = ledger.records
      .filter((r) => r.match?.allowsDirectClaim && (r.kind === 'evaluation' || r.kind === 'human'))
      .map((r) => r.id);
  }

  ledger.coverage = coverage;
  ledger.evidenceIdsByQuestion = ids;
  ledger.newestYear = newest;
  return coverage;
}

/** 供最终提示词使用的「本次到底查过什么」审计块 */
export function buildResearchAudit(ledger, { completion = null } = {}) {
  const lines = [];
  lines.push('=== 本次研究过程（程序记录，不是模型推测）===');
  lines.push(
    `检索轮次：${ledger.searches.length} 轮；成功抓取：${
      ledger.records.filter((r) => r.read).length
    } 页；抓取失败：${ledger.fetchFailures.length} 次；白名单拦截：${ledger.blocked.length} 条`,
  );
  for (const s of ledger.searches) {
    lines.push(
      `- 第 ${s.round} 轮 · ${s.focus}：${s.query}（返回 ${s.resultCount} 条，新增 ${s.addedCount} 条）`,
    );
  }
  for (const f of ledger.fetchFailures) {
    lines.push(`- 抓取失败：${f.url} —— ${f.reason}`);
  }
  for (const b of ledger.blocked) {
    lines.push(`- 白名单未放行：${b.url} —— ${b.reason}`);
  }
  lines.push('');
  lines.push('=== 四项问题的证据覆盖（程序判定）===');
  lines.push(`身份：${coverageLabel(ledger.coverage.identity)}`);
  lines.push(`正常食用：${coverageLabel(ledger.coverage.normal)}`);
  lines.push(`高摄入/长期暴露：${coverageLabel(ledger.coverage.high)}`);
  lines.push(`特殊人群：${coverageLabel(ledger.coverage.sensitive)}`);
  lines.push(`较新评估：${coverageLabel(ledger.coverage.recent)}`);
  lines.push(`关键原文：${coverageLabel(ledger.coverage.original)}`);
  if (completion) {
    lines.push('');
    lines.push('=== 八项完成度检查 ===');
    for (const item of completion.items) {
      lines.push(`- [${item.status}] ${item.label}：${item.detail}`);
    }
  }
  return lines.join('\n');
}

export function coverageLabel(state) {
  const map = {
    confirmed: '已确认',
    direct: '有直接评估结论',
    reference: '只有参考值',
    human: '有人体证据',
    animal: '只有动物/体外证据',
    named: '点名了人群',
    missing: '未取得',
    untouched: '未检查',
    needed: '需要补查',
    current: '已检索到较新评估',
    read: '已读原文',
    search_only: '只有搜索摘要',
  };
  return map[state] || state;
}

/**
 * 给规划器的紧凑摘要。
 * 只给标题、类型、章节、命中的问题与少量原文句，不把整篇长文塞进去。
 */
export function digestForPlanner(ledger, { maxSources = 12 } = {}) {
  const lines = [];
  lines.push('=== 研究对象 ===');
  lines.push(`名称：${ledger.identity?.canonical || '未知'}`);
  if (ledger.identity?.en?.length) lines.push(`英文名：${ledger.identity.en.slice(0, 4).join('；')}`);
  if (ledger.identity?.constituents?.length) {
    lines.push(
      `组成物质：${ledger.identity.constituents
        .map((c) => `${c.name}${c.ins ? `（${c.ins}）` : ''}`)
        .join(' + ')}`,
    );
  }
  if (ledger.identity?.group) lines.push(`评估组：${ledger.identity.group}`);
  lines.push('');
  lines.push('=== 覆盖状态 ===');
  for (const key of ['identity', 'normal', 'high', 'sensitive', 'recent', 'original']) {
    lines.push(
      `${QUESTION_LABELS[key]}：${coverageLabel(ledger.coverage[key])}` +
        (ledger.evidenceIdsByQuestion[key]?.length
          ? `（${ledger.evidenceIdsByQuestion[key].slice(0, 3).join(',')}）`
          : ''),
    );
  }
  lines.push('');
  lines.push('=== 已取得的资料 ===');

  const ranked = [...ledger.records]
    .sort((a, b) => scoreRecord(b) - scoreRecord(a))
    .slice(0, maxSources);

  if (ranked.length === 0) {
    lines.push('（还没有任何资料）');
  }
  for (const r of ranked) {
    const bits = [
      `[${r.id}] ${r.title}`,
      `机构：${r.organization || '未知'}`,
      `类型：${r.kind}`,
      `身份匹配：${BASIS_LABELS[r.match?.match] || r.match?.match || 'none'}` +
        (r.match?.allowsDirectClaim ? '（可用于直接结论）' : '（不能直接当结论）'),
      `读取：${r.read ? '已读原文' : '只有搜索摘要'}`,
      `章节：${r.found?.length ? r.found.join('/') : '未识别'}`,
      `年份：${r.year || '未知'}`,
      `URL：${r.url}`,
    ];
    lines.push(bits.join(' | '));

    const q = [];
    if (r.questions.normal) q.push(`正常=${r.questions.normal}`);
    if (r.questions.high) q.push(`高摄入=${r.questions.high}`);
    if (r.questions.sensitive) q.push(`人群=${r.questions.sensitive}`);
    if (q.length) lines.push(`  问题命中：${q.join('，')}`);

    const snippets = [
      ...(r.studyHints?.subjects || []).slice(0, 1),
      ...(r.studyHints?.doses || []).slice(0, 1),
      ...(r.studyHints?.effects || []).slice(0, 2),
    ];
    for (const s of [...new Set(snippets)].slice(0, 3)) {
      lines.push(`  原文线索：${String(s).slice(0, 420)}`);
    }
  }

  if (ledger.fetchFailures.length) {
    lines.push('');
    lines.push('=== 抓取失败（不要重复抓同一 URL）===');
    for (const f of ledger.fetchFailures.slice(-8)) lines.push(`- ${f.url} —— ${f.reason}`);
  }
  if (ledger.blocked.length) {
    lines.push('');
    lines.push('=== 白名单拦截 ===');
    for (const b of ledger.blocked.slice(-8)) lines.push(`- ${b.url} —— ${b.reason}`);
  }
  return lines.join('\n');
}

function scoreRecord(r) {
  let score = 0;
  if (/re.evaluation|safety of|scientific opinion|toxicological evaluation|finds.*safe/i.test(r.title)) score += 12;
  if (/minutes|call.for.data|protocol|work.*plan|update on|agenda|meeting|state.of.play/i.test(r.title)) score -= 20;
  if (r.match?.allowsDirectClaim) score += 8;
  if (r.match?.match === 'direct') score += 2;
  if (r.match?.match === 'constituent') score += 1;
  if (r.read) score += 4;
  if (r.kind === 'human') score += 5;
  if (r.kind === 'evaluation') score += 5;
  if (r.kind === 'sensitive') score += 3;
  if (r.questions.high === 'human') score += 4;
  if (r.questions.sensitive === 'named') score += 3;
  if (r.sections?.human) score += 3;
  if (r.sections?.evaluation) score += 3;
  score += Math.min(Math.max(r.authority ?? 0, 0), 4) * 0.5;
  return score;
}

/** 给规划器的候选 URL（只列尚未读取、且身份相关的） */
export function fetchCandidates(ledger, { limit = 8 } = {}) {
  return [...ledger.records]
    .filter((r) => {
      if (r.read || !r.url || ledger.fetchFailures.some(f => f.url === r.url)) return false;
      // Search 的 need_content=true 已经带回完整正文、且能定位到
      // 人体/评价章节时，不必再花一次 Fetch。
      const alreadyReadable =
        r.rawText.length >= 3000 && Boolean(r.sections?.human || r.sections?.evaluation);
      return !alreadyReadable || !r.sections?.human;
    })
    .sort((a, b) => scoreRecord(b) - scoreRecord(a))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      kind: r.kind,
      sections: r.found,
      basis: r.match?.match,
      score: Math.round(scoreRecord(r)),
    }));
}

/**
 * 章节优先的摘录。
 *
 * 这是「深入读取原始文献」的落点：不再只取正文前 1200 字，
 * 而是先取评价、人体观察、膳食暴露、敏感人群、不良反应，
 * 再补充身份/代谢；只有完全没有人体章节时才取动物毒理。
 *
 * 所有片段都是逐字原文，只做长度截断，不改写。
 */
export function buildEvidenceExcerpt(record, { maxChars = 14000 } = {}) {
  const raw = String(record.rawText || '');
  if (raw.length <= maxChars) return raw;
  const list = record.sectionList || [];
  const parts = [];
  let used = 0;
  const add = (heading, text, cap) => {
    const piece = String(text || '').slice(0, Math.min(cap, maxChars - used - 100));
    if (!piece || piece.length < 80 || parts.some(p => p.includes(piece))) return;
    parts.push(`${heading}\n${piece}`); used += piece.length + heading.length + 40;
  };
  // Keep conclusions independently: a generic Assessment or tables cannot consume their allocation.
  const evals = list.filter(s => s.key === SECTION.EVALUATION);
  for (const s of [...evals].reverse()) add(s.heading, s.text, 3000);
  for (const s of list.filter(s => s.key === SECTION.HUMAN)) add(s.heading, s.text, 4000);
  // Some reports have no 'human studies' heading, or put human results inside Discussion.
  // Take separated, verbatim windows with context instead of treating the first 8 KB as the paper.
  const human = /(?:\b(?:healthy (?:men|women|adults)|volunteers?|participants?|randomi[sz]ed|human studies|human data|human evidence|blood pressure|glucose and insulin|clinical trials?)\b|人体研究|受试者)/gi;
  const referenceStart = raw.search(/(?:^|\n)#{0,3}\s*(?:\d+\.?\s+)?References\s*(?:\n|$)/i);
  const body = referenceStart > 0 ? raw.slice(0, referenceStart) : raw;
  let match; const ranges = [];
  while ((match = human.exec(body)) && used < maxChars - 1000) {
    if (ranges.some(([a,b]) => match.index >= a && match.index < b)) continue;
    const start = Math.max(0, match.index - 350), end = Math.min(body.length, match.index + 1900);
    ranges.push([start,end]); add('人体/健康相关原文窗口', body.slice(start,end), 2250);
  }
  for (const key of [SECTION.DIETARY, SECTION.COMMENTS, SECTION.ADVERSE, SECTION.SENSITIVE, SECTION.METABOLISM, SECTION.ANIMAL]) {
    for (const s of list.filter(s => s.key === key)) add(s.heading, s.text, 1800);
  }
  if (!parts.length) add('正文', raw, maxChars);
  return parts.join('\n\n[… excerpt boundary …]\n\n').slice(0, maxChars);
}

/**
 * 八项研究完成度（1–6 由台账判定，7–8 在最终结论校验后补）。
 *
 * 状态：
 *   done      已做到，且有证据
 *   partial   查过，但只到某一步（例如只有动物证据）
 *   missing   还没查/没查到
 *   failed    技术上失败（抓取失败、白名单拦截），必须如实说明
 */
export function buildCompletionAudit(ledger, { final = null } = {}) {
  const c = ledger.coverage;
  const items = [];
  const push = (id, label, status, detail) => items.push({ id, label, status, detail });

  push(
    'identity',
    '确认研究对象的身份',
    c.identity === 'confirmed' ? 'done' : 'partial',
    c.identity === 'confirmed'
      ? '已确认名称/别名/组成关系，并取得至少一份相关正文'
      : '只确认了名称，尚未取得能说明身份的相关正文',
  );

  const evalRecords = ledger.records.filter(
    (r) => r.match?.allowsDirectClaim && (r.kind === 'evaluation' || r.sections?.evaluation),
  );
  push(
    'authority',
    '找到适用的权威风险评估',
    evalRecords.length ? 'done' : c.normal === 'reference' ? 'partial' : 'missing',
    evalRecords.length
      ? `取得 ${evalRecords.length} 份评估类资料（${evalRecords.slice(0, 3).map((r) => r.id).join(',')}）`
      : c.normal === 'reference'
        ? '只取得参考摄入值，没有取得正式评估结论'
        : '本次检索没有取得适用评估',
  );

  push(
    'high',
    '查找并核对高摄入人体影响',
    c.high === 'human' ? 'done' : c.high === 'animal' ? 'partial' : c.high === 'reference' ? 'partial' : 'missing',
    c.high === 'human'
      ? '取得人体层面的影响描述，需在结论中保留剂量与人数'
      : c.high === 'animal'
        ? '只取得动物/体外证据，不能写成人体高摄入后果'
        : c.high === 'reference'
          ? '只有参考摄入值，没有超过参考值后的具体人体反应'
          : '本次检索没有取得高摄入影响资料',
  );

  push(
    'sensitive',
    '检查特殊人群资料',
    c.sensitive === 'named' ? 'done' : 'missing',
    c.sensitive === 'named'
      ? '来源点名了人群/疾病，需保留原文限定'
      : '本次检索没有取得点名人群的资料；不能据此推断某类患者需要忌口',
  );

  push(
    'recent',
    '查找较新的正式评估',
    c.recent === 'current' ? 'done' : c.recent === 'needed' ? 'partial' : 'missing',
    c.recent === 'current'
      ? `现有评估年份 ${ledger.newestYear || '未知'}，未发现明显过期`
      : c.recent === 'needed'
        ? `现有评估偏旧（${ledger.newestYear || '未知'}），已尝试补查新评估`
        : '尚未取得评估，无法判断新旧',
  );

  const readable = (r) =>
    r.match?.allowsDirectClaim &&
    (r.read || (r.rawText.length >= 1500 && Boolean(r.sections?.human || r.sections?.evaluation))) &&
    (r.sections?.human || r.sections?.evaluation || r.kind === 'human' || r.kind === 'evaluation');
  const readKey = ledger.records.some(readable);
  push(
    'original',
    '查阅最关键的原始资料',
    readKey ? 'done' : ledger.records.some((r) => r.read) ? 'partial' : 'missing',
    readKey
      ? '已取得评估/人体章节正文，而不是只看标题或摘要'
      : ledger.records.some((r) => r.read)
        ? '读取了原文，但没有定位到评估/人体章节'
        : '只取得搜索摘要，没有读取原文',
  );

  push(
    'answers',
    '生成结论回答消费者的问题',
    final ? (final.answered >= 2 ? 'done' : final.answered >= 1 ? 'partial' : 'missing') : 'missing',
    final
      ? `正常食用/高摄入/特殊人群中有 ${final.answered} 项真正回答（参考值不计）`
      : '尚未生成最终结论',
  );

  push(
    'conditions',
    '结论准确反映研究条件',
    final ? (final.conditionsKept ? 'done' : 'partial') : 'missing',
    final
      ? final.conditionsKept
        ? '关键结论保留了研究对象、剂量或适用条件'
        : '部分结论缺少研究条件，已降级或移除'
      : '尚未生成最终结论',
  );

  const count = (s) => items.filter((i) => i.status === s).length;
  return {
    items,
    done: count('done'),
    partial: count('partial'),
    missing: count('missing'),
    failed: count('failed'),
    total: items.length,
    summary: `${count('done')}/${items.length} 项完成，${count('partial')} 项部分完成，${count('missing')} 项仍缺证据`,
  };
}

/**
 * 最终结论的「证据基础」标签：让用户知道这句话依据的是
 * 同一物质、组成物质联合评估、组评估，还是相关但不同的化学形式。
 */
export function basisForEvidenceIds(ledger, ids = []) {
  const set = new Set(ids);
  const hits = ledger.records.filter((r) => set.has(r.id));
  if (!hits.length) return null;
  // 取最强的一个
  const order = ['direct', 'constituent', 'group', 'analog', 'none'];
  const best = hits
    .map((r) => r.match?.match || 'none')
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return {
    basis: best,
    label: BASIS_LABELS[best] || BASIS_LABELS.none,
    records: hits.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      match: r.match?.match,
      joint: r.match?.joint,
      read: r.read,
    })),
  };
}

/** 名称归一化 re-export，供测试与调用方统一 */
export { normalizeName };
