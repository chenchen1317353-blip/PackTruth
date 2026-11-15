/**
 * 统一证据集合（V5.1 核心模块）。
 *
 * 解决的问题：第五阶段初版把「本地知识库」和「联网检索」做成了两套互不相干的东西，
 * 本地来源用 K1 编号、联网用 W1 编号，citationGuard 只认识 W，
 * 于是永远只能输出两份答案。
 *
 * 这里的做法：把两类来源都归一化成同一种结构，
 * 交给同一个校验器、同一张卡片渲染。差别只体现在 sourceType 上：
 *
 *   verified_local  —— 本地知识库已核实的来源（K 类）
 *   search_content  —— Search 直接返回的网页正文（W 类，V5.1 新增）
 *   fetch_content   —— Fetch 抓回来的网页正文（W 类，按需使用）
 *   search_summary  —— 只有搜索摘要，没有正文（W 类，证据最弱）
 *
 * 强度排序（用于 tier 判定）：
 *   verified_local ≈ search_content ≈ fetch_content  >  search_summary
 *
 * 注意：「有正文」不等于「拿到权威全文」。Search 返回的 content 和 Fetch 的 Markdown
 * 都可能是截断片段，所以展示时一律叫「摘录」，不叫「原文全文」。
 */

import { getSource } from '../ingredients/sources.js';

/** 来源类型常量，避免各处硬编码字符串 */
export const EVIDENCE_TYPES = {
  LOCAL: 'verified_local',
  SEARCH_CONTENT: 'search_content',
  FETCH_CONTENT: 'fetch_content',
  SEARCH_SUMMARY: 'search_summary',
};

/** 有正文的来源（证据强度高） */
export const BODY_LEVEL_TYPES = new Set([
  EVIDENCE_TYPES.LOCAL,
  EVIDENCE_TYPES.SEARCH_CONTENT,
  EVIDENCE_TYPES.FETCH_CONTENT,
]);

/** 仅摘要的来源（证据强度低） */
export const SUMMARY_LEVEL_TYPES = new Set([EVIDENCE_TYPES.SEARCH_SUMMARY]);

/** 该来源是否属于 K 类（本地知识库） */
export function isLocalSource(ev) {
  return ev?.sourceType === EVIDENCE_TYPES.LOCAL;
}

/** 该来源是否属于 W 类（本次联网取得） */
export function isWebSource(ev) {
  return ev && !isLocalSource(ev) && Object.values(EVIDENCE_TYPES).includes(ev.sourceType);
}

// ---------------------------------------------------------------- 本地 K 类

/**
 * 把本地知识库条目的 sourceIds 展开成统一证据。
 *
 * 为什么要展开：本地条目的正文（whatIsIt 等）是人工基于 K1–K9 这些来源编写的，
 * 但模型需要看到**来源本身的原文**才能判断某句话能不能引用它。
 * 只给模型「结论」不给「来源原文」，等于让它凭感觉配编号。
 *
 * @param {object} entry 知识库条目
 * @returns {Array} 统一格式的证据数组，id 保持 K1..K9
 */
export function localEntryToEvidence(entry) {
  if (!entry?.sourceIds?.length) return [];

  return entry.sourceIds
    .map((id) => {
      const src = getSource(id);
      if (!src) return null;

      // 原文 + 译文（如果有）+ 条款位置，一起给模型看
      const parts = [];
      if (src.clause) parts.push(`条款/位置：${src.clause}`);
      parts.push(src.quote);
      if (src.translation) parts.push(`中文译文：${src.translation}`);

      const versionBits = [
        src.code,
        src.effectiveAt ? `实施 ${src.effectiveAt}` : null,
        src.publishedAt ? `发布 ${src.publishedAt}` : null,
      ].filter(Boolean);

      return {
        id,
        title: src.title,
        organization: src.issuer,
        sourceType: EVIDENCE_TYPES.LOCAL,
        url: src.url,
        excerpt: parts.join('\n'),
        // quoteType 为 verbatim 才算原文摘录，否则是摘要
        excerptType: src.quoteType === 'verbatim' ? 'verbatim_local' : 'summary_local',
        retrievedAt: null, // 本地资料没有「本次检索时间」
        verifiedAt: src.verifiedAt || null,
        version: versionBits.join(' · '),
        conditions: src.conditions || [],
        tier: 'local',
      };
    })
    .filter(Boolean);
}

/**
 * 生成给模型看的「本地已有结论」文本块。
 *
 * 关键：每句话后面标出它对应的 K 编号，模型才知道引用哪个。
 * 如果不标，模型只能瞎猜或干脆不引用 K —— 那就退化成纯联网答案了。
 */
export function buildLocalKnowledgeBlock(entry) {
  if (!entry) return '';

  const ref = (ids) => (ids?.length ? `（来源 ${ids.join('、')}）` : '（本地条目未标注来源，不要引用）');
  const lines = [];

  lines.push(`标准名称：${entry.canonicalName}`);
  if (entry.aliases?.length) lines.push(`包装上可能写的别名：${entry.aliases.slice(0, 6).join('、')}`);
  lines.push(`本地分类：${entry.categoryLabel}`);
  if (entry.codes?.cns || entry.codes?.ins) {
    lines.push(
      `编号：${[entry.codes.cns ? `CNS ${entry.codes.cns}` : null, entry.codes.ins ? `INS ${entry.codes.ins}` : null]
        .filter(Boolean)
        .join(' / ')}`,
    );
  }
  if (entry.functions?.length) lines.push(`登记功能：${entry.functions.join('、')}`);

  lines.push('');
  lines.push(`这是什么：${entry.whatIsIt}${ref(entry.sourceIds)}`);
  lines.push(`为什么用：${entry.whyUsed}${ref(entry.sourceIds)}`);

  if (entry.misconceptions?.length) {
    lines.push('');
    lines.push('本地已整理的可能误解：');
    entry.misconceptions.forEach((m, i) => {
      lines.push(`  ${i + 1}) 常见说法：${m.statement}`);
      lines.push(`     实际情况：${m.correction}${ref(m.sourceIds)}`);
    });
  }

  lines.push('');
  lines.push(`安全管理原则：${entry.safetyPrinciples}${ref(entry.sourceIds)}`);
  lines.push(`目前不能确认的：${entry.limits}${ref(entry.sourceIds)}`);

  if (entry.verification === 'partial') {
    lines.push('');
    lines.push(`注意：本地条目被标记为「部分待完善」——${entry.verificationNote || '部分说明尚未取得可直接引用的来源'}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------- 联网 W 类

/** 搜索结果的标题有时本身是 HTML 片段，展示前需要清一下 */
function cleanTitle(raw, fallback = '') {
  const t = String(raw || '')
    .replace(/<[^>]{1,200}>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t || fallback;
}

/**
 * 把一次 Search 结果转成统一证据。
 * content 非空 → search_content；否则 → search_summary。
 */
export function searchResultToEvidence(result, { index, extractedContent }) {
  const hasContent = Boolean(extractedContent && extractedContent.trim().length > 0);
  return {
    id: `W${index}`,
    title: cleanTitle(result.title, result.url),
    organization: result.org || result.siteName || '未知机构',
    sourceType: hasContent ? EVIDENCE_TYPES.SEARCH_CONTENT : EVIDENCE_TYPES.SUMMARY,
    url: result.url,
    excerpt: hasContent ? extractedContent : result.snippet || result.summary || '',
    excerptType: hasContent ? 'search_body_excerpt' : 'search_snippet',
    retrievedAt: new Date().toISOString(),
    publishedAt: result.date || null,
    authority: result.authority ?? null,
    suspicion: result.suspicion || [],
    /** 该页疑似混排了多个添加剂条目，数值需谨慎（V5.2） */
    possibleMixedContent: Boolean(result.possibleMixedContent),
    tier: hasContent ? 'web_body' : 'web_summary',
  };
}

/** 把一次 Fetch 结果转成统一证据 */
export function fetchResultToEvidence(target, { index, content }) {
  return {
    id: `W${index}`,
    title: cleanTitle(target.pageTitle || target.title, target.url),
    organization: target.org || '未知机构',
    sourceType: EVIDENCE_TYPES.FETCH_CONTENT,
    url: target.url,
    excerpt: content,
    excerptType: 'fetched_excerpt',
    retrievedAt: new Date().toISOString(),
    publishedAt: target.date || null,
    authority: target.authority ?? null,
    suspicion: target.suspicion || [],
    tier: 'web_body',
  };
}

// ---------------------------------------------------------------- 合并与统计

/**
 * 合并本地与联网证据，保证 id 唯一。
 * 本地在前（K 类），联网在后（W 类）—— 顺序也提示模型「先看本地」。
 */
export function mergeEvidence(localEvidence = [], webEvidence = []) {
  const seen = new Set();
  const out = [];
  for (const ev of [...localEvidence, ...webEvidence]) {
    if (!ev?.id || seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  return out;
}

/**
 * 统计证据构成，供前端决定显示「综合解读」还是「基于联网资料」。
 * @returns {{ local: number, webBody: number, webSummary: number, total: number }}
 */
export function summarizeEvidence(sources = []) {
  let local = 0;
  let webBody = 0;
  let webSummary = 0;

  for (const s of sources) {
    if (isLocalSource(s)) local += 1;
    else if (s.sourceType === EVIDENCE_TYPES.SEARCH_SUMMARY) webSummary += 1;
    else webBody += 1;
  }

  return { local, webBody, webSummary, total: sources.length };
}

/**
 * 判定这次解读的资料构成。
 * mixed      —— 同时用了本地和联网
 * local_only —— 只有本地
 * web_only   —— 只有联网
 */
export function compositionBasis(usedSources = []) {
  const hasLocal = usedSources.some(isLocalSource);
  const hasWeb = usedSources.some(isWebSource);
  if (hasLocal && hasWeb) return 'mixed';
  if (hasLocal) return 'local_only';
  if (hasWeb) return 'web_only';
  return 'none';
}

export const COMPOSITION_LABELS = {
  mixed: '综合解读：本地知识库 + 权威网络资料',
  local_only: '基于本地知识库',
  web_only: '基于权威网络资料的解读',
  none: '没有可用依据',
};

/** 来源类型的中文标签（V5.1 四类） */
export const EVIDENCE_TYPE_LABELS = {
  verified_local: '本地已核实',
  search_content: '搜索返回的网页内容',
  fetch_content: '网页抓取内容摘录',
  search_summary: '仅搜索结果摘要（无正文）',
};

/** 摘录类型的中文标签 */
export const EXCERPT_KIND_LABELS = {
  verbatim_local: '本地原文摘录',
  summary_local: '本地摘要（非逐字）',
  search_body_excerpt: '搜索返回正文摘录',
  fetched_excerpt: '网页抓取内容摘录',
  search_snippet: '搜索引擎摘要（非原文）',
};
