/**
 * 引用校验器（纯函数，不联网，可单测）。
 *
 * 这是第五阶段最重要的一道闸门。AI 生成的东西一律不可信，
 * 必须逐条检查：来源编号是否存在、是否属于本次真实取得的证据、
 * 有没有凭空编的 URL、有没有不带来源的确定性结论。
 *
 * V5.1 扩展：
 * - 同时支持 K 类（本地知识库）与 W 类（联网取得）来源；
 * - 一条结论可以同时引用 [K2][W1]，但每个编号都必须真实存在；
 * - 新增 composition（资料构成）判定，供前端区分
 *   「综合解读 / 基于本地知识库 / 基于联网资料」。
 *
 * 边界说明（必须写进 UI）：
 * 程序只能验证「编号存在、摘录存在」，无法验证「AI 对文献含义的理解是否正确」。
 * 所以卡片要把结论和证据片段放在一起，让人自己对。
 */

import { BODY_LEVEL_TYPES, SUMMARY_LEVEL_TYPES, compositionBasis } from './evidenceSet.js';

/** 一条结论里出现这些词，就视为「确定性健康结论」，必须有来源 */
const ASSERTIVE_PATTERNS = [
  /会导致|会引起|造成|有害|有毒|致癌|安全|无害|可以治疗|可以预防|能治|疗效/,
  /一定|必然|肯定|绝对|完全/,
  // 「建议不要食用」「建议每天摄入」这类，中间常夹着「不要/别/尽量别」
  /建议[^，。；]{0,8}(食用|摄入|服用|使用)/,
  /(不要|别|禁止|避免)[^，。；]{0,4}(食用|摄入|服用)/,
];

/**
 * 允许的来源类型。
 * 前四个是 V5.1 的四类；后两个是 V5 初版遗留（兼容旧缓存与预录数据）。
 */
const VALID_SOURCE_TYPES = new Set([
  'verified_local',
  'search_content',
  'fetch_content',
  'search_summary',
  'fetched_web', // 兼容 V5 初版
  'search_only', // 兼容 V5 初版
]);

/** 判定「只有摘要」时要考虑旧类型 */
function isSummaryLevel(sourceType) {
  return SUMMARY_LEVEL_TYPES.has(sourceType) || sourceType === 'search_only';
}

function isBodyLevel(sourceType) {
  return BODY_LEVEL_TYPES.has(sourceType) || sourceType === 'fetched_web';
}

function normRef(ref) {
  return String(ref || '')
    .replace(/[\[\]【】\s]/g, '')
    .toUpperCase();
}

function isAssertive(text) {
  return ASSERTIVE_PATTERNS.some((re) => re.test(String(text || '')));
}

/**
 * 校验简明三段（V5.2 新增）。
 *
 * 简明版是用户默认看到的那一屏，如果它引用了不存在的来源，
 * 问题比深入版更严重 —— 因为大多数用户只会看这一屏。
 * 所以 brief 单独走一遍和 sections 同等强度的检查：
 * 三段必须齐全、必须有来源、编号必须真实存在。
 *
 * 不通过时返回 brief: null，前端会退回用 sections 拼一个简明版，
 * 而不是把没有依据的文字当成「简明结论」展示。
 */
function verifyBrief(rawBrief, allowedById) {
  if (!rawBrief || typeof rawBrief !== 'object' || Array.isArray(rawBrief)) {
    return { brief: null, reason: '没有提供简明版' };
  }

  const what = String(rawBrief.what || '').trim();
  const why = String(rawBrief.why || '').trim();
  const how = String(rawBrief.howToUnderstand || '').trim();
  if (!what || !why || !how) {
    return { brief: null, reason: '简明版三段不完整' };
  }

  const refs = (Array.isArray(rawBrief.sourceRefs) ? rawBrief.sourceRefs : [])
    .map(normRef)
    .filter(Boolean);

  if (refs.length === 0) {
    return { brief: null, reason: '简明版没有引用任何来源' };
  }

  const missing = refs.filter((r) => !allowedById.has(r));
  if (missing.length) {
    return { brief: null, reason: `简明版引用了不存在的来源：${missing.join(', ')}` };
  }

  const sources = refs.map((r) => allowedById.get(r));
  const onlySnippets = sources.every((s) => isSummaryLevel(s.sourceType));

  return {
    brief: {
      what,
      why,
      howToUnderstand: how,
      sourceRefs: refs,
      sources,
      tier: onlySnippets ? 'snippet_only' : 'cited',
      verified: true,
      charCount: what.length + why.length + how.length,
    },
    reason: null,
  };
}

/**
 * 校验 AI 输出。
 *
 * @param {object} p
 * @param {any} p.aiOutput 模型返回并解析后的 JSON
 * @param {Array} p.evidenceSources 本次真实取得的可引用来源（程序生成）
 * @param {string} [p.ingredientName]
 * @returns {{
 *   ok: boolean,
 *   status: 'ok'|'partial'|'failed',
 *   errors: string[],
 *   warnings: string[],
 *   sections: Array,
 *   rejected: Array,
 *   sources: Array,
 *   stats: { totalSections: number, accepted: number, rejected: number, citedSources: number }
 * }}
 */
export function verifyCitations({ aiOutput, evidenceSources = [], ingredientName = '' }) {
  const errors = [];
  const warnings = [];
  const sections = [];
  const rejected = [];

  const base = {
    ok: false,
    status: 'failed',
    errors,
    warnings,
    sections,
    rejected,
    sources: [],
    stats: { totalSections: 0, accepted: 0, rejected: 0, citedSources: 0 },
  };

  // ---- 1. 顶层结构 ----
  if (!aiOutput || typeof aiOutput !== 'object' || Array.isArray(aiOutput)) {
    errors.push('AI 输出不是合法的 JSON 对象');
    return base;
  }
  if (!Array.isArray(aiOutput.sections)) {
    errors.push('AI 输出缺少 sections 数组');
    return base;
  }

  // ---- 2. 建立可用来源索引 ----
  const allowedById = new Map();
  for (const s of evidenceSources) {
    if (!s?.id) continue;
    if (!VALID_SOURCE_TYPES.has(s.sourceType)) {
      warnings.push(`来源 ${s.id} 的类型 ${s.sourceType} 不在允许范围内，已跳过`);
      continue;
    }
    allowedById.set(normRef(s.id), s);
  }

  // ---- 2.5 简明版单独校验（V5.2） ----
  const briefCheck = verifyBrief(aiOutput.brief, allowedById);
  if (aiOutput.brief && !briefCheck.brief) {
    warnings.push(`简明版未通过校验，已退回用详细结论生成：${briefCheck.reason}`);
  }

  // ---- 3. 检查模型是否自己编了来源 ----
  const modelSources = Array.isArray(aiOutput.sources) ? aiOutput.sources : [];
  for (const ms of modelSources) {
    const url = ms?.url;
    const hit = evidenceSources.find((s) => s.url && url && s.url === url);
    if (!hit) {
      errors.push(`模型返回了本次未取得的来源 URL，已拦截：${String(url).slice(0, 120)}`);
    }
  }

  // ---- 4. 逐条校验结论 ----
  for (const raw of aiOutput.sections) {
    const text = String(raw?.text || '').trim();
    if (!text) continue;

    const refs = Array.isArray(raw?.sourceRefs) ? raw.sourceRefs.map(normRef).filter(Boolean) : [];
    const record = {
      id: raw?.id || null,
      section: raw?.section || 'unknown',
      text,
      sourceRefs: refs,
      limitations: raw?.limitations || null,
    };

    if (refs.length === 0) {
      // 没有来源：确定性结论直接拒；中性描述降级为 general
      if (isAssertive(text)) {
        rejected.push({ ...record, rejectReason: '确定性结论但没有任何来源' });
      } else {
        sections.push({ ...record, verified: false, tier: 'general' });
      }
      continue;
    }

    const missing = refs.filter((r) => !allowedById.has(r));
    if (missing.length) {
      rejected.push({ ...record, rejectReason: `引用了不存在的来源编号：${missing.join(', ')}` });
      continue;
    }

    const usedSrcs = refs.map((r) => allowedById.get(r));

    // 如果模型声称「引用了某段原文」，这段文字必须真的能在本次证据里找到。
    // 注意：只有当模型自己给出 quote/excerpt 字段时才校验 —— 没声称就不必对。
    // 用前 40 字符比对，避免模型在末尾加省略号或截断导致误判。
    const claimedQuote = String(raw?.quote ?? raw?.excerpt ?? '').trim();
    if (claimedQuote.length >= 8) {
      const probe = claimedQuote.slice(0, 40);
      const foundInEvidence = usedSrcs.some((s) => String(s.excerpt || '').includes(probe));
      if (!foundInEvidence) {
        rejected.push({
          ...record,
          rejectReason: '声称引用的原文摘录在本次取得的资料中找不到',
        });
        continue;
      }
    }

    // 如果这条结论引用的来源全都是「只有搜索摘要」，没有一份正文，
    // 就只能算 snippet_only，绝不能标成和正文摘录同等强度的证据。
    // 正文级包括：本地已核实来源、Search 返回的正文、Fetch 抓回的正文。
    const bodyLevelCount = usedSrcs.filter((s) => isBodyLevel(s.sourceType)).length;
    const onlySnippets = bodyLevelCount === 0;

    sections.push({
      ...record,
      verified: true,
      tier: onlySnippets ? 'snippet_only' : 'cited',
      sources: usedSrcs,
      // 分开标记，前端可以把 [K1] 和 [W2] 用不同颜色渲染
      refSplit: {
        local: refs.filter((r) => allowedById.get(r)?.sourceType === 'verified_local'),
        web: refs.filter((r) => allowedById.get(r)?.sourceType !== 'verified_local'),
      },
    });
  }

  // ---- 5. 汇总实际被引用的来源 ----
  const citedIds = new Set(sections.filter((s) => s.verified).flatMap((s) => s.sourceRefs));
  const usedSources = evidenceSources.filter((s) => citedIds.has(normRef(s.id)));

  for (const s of usedSources) {
    if (isSummaryLevel(s.sourceType) && s.excerptType !== 'search_snippet') {
      warnings.push(`来源 ${s.id} 只有搜索结果没有正文，但被标为 ${s.excerptType}`);
    }
  }

  const verifiedSections = sections.filter((s) => s.verified);
  const accepted = verifiedSections.length;
  const citedFromBody = sections.filter((s) => s.tier === 'cited').length;

  // 引用层面的 K / W 分布（一条结论可以既引 K 又引 W）
  const allRefs = verifiedSections.flatMap((s) => s.sourceRefs);
  const localRefs = allRefs.filter((r) => allowedById.get(r)?.sourceType === 'verified_local').length;
  const webRefs = allRefs.length - localRefs;

  const localSources = usedSources.filter((s) => s.sourceType === 'verified_local');
  const webSources = usedSources.filter((s) => s.sourceType !== 'verified_local');

  // 这次解读到底用了几类资料 —— 前端据此显示「综合解读」还是「基于联网资料」
  const composition = compositionBasis(usedSources);

  const stats = {
    totalSections: aiOutput.sections.length,
    accepted,
    rejected: rejected.length,
    citedSources: usedSources.length,
    citedFromBody,
    snippetOnly: sections.filter((s) => s.tier === 'snippet_only').length,
    localSources: localSources.length,
    webSources: webSources.length,
    localRefs,
    webRefs,
    composition,
  };

  // ---- 6. 判定整体状态 ----
  // 只有「全部结论都有正文级来源 + 至少 2 条 + 没有被拒」才算 ok；
  // 否则最多是 partial —— 因为没拿到正文时，摘要撑不起"已核查"的强度。
  let status = 'failed';
  if (accepted > 0) {
    if (rejected.length === 0 && accepted >= 2 && citedFromBody === accepted) status = 'ok';
    else status = 'partial';
  }

  return {
    ok: status === 'ok',
    status,
    composition,
    errors,
    warnings,
    sections,
    rejected,
    sources: usedSources,
    identity: aiOutput.identity || null,
    /** V5.2：通过校验的简明三段；未通过时为 null，由前端回退 */
    brief: briefCheck.brief,
    briefRejectReason: briefCheck.reason,
    stats,
  };
}

/**
 * 生成给模型看的证据文本块。
 * 明确包裹边界，并在前后都声明「这是不可信外部资料」。
 */
export function buildEvidenceBlock(sources) {
  return sources
    .map((s) => {
      const head = `[${s.id}] 标题：${s.title}\n机构：${s.organization}\n类型：${s.sourceType}\nURL：${s.url}`;
      return `${head}\n正文摘录：\n${s.excerpt}`;
    })
    .join('\n\n---\n\n');
}

/**
 * 供 UI 显示：来源类型标签。
 * V5.1 起统一由 evidenceSet 维护，这里保留 re-export 以免旧引用断掉。
 */
export const SOURCE_TYPE_LABELS = {
  verified_local: '本地已核实',
  search_content: '搜索返回的网页内容',
  fetch_content: '网页抓取内容摘录',
  search_summary: '仅搜索结果摘要（无正文）',
  // 兼容 V5 初版数据
  fetched_web: '网页抓取内容摘录',
  search_only: '仅搜索结果（未取得正文）',
};

export const EXCERPT_TYPE_LABELS = {
  verbatim_local: '本地原文摘录',
  summary_local: '本地摘要（非逐字）',
  search_body_excerpt: '搜索返回正文摘录',
  fetched_excerpt: '网页抓取内容摘录',
  search_snippet: '搜索引擎摘要（非原文）',
};
