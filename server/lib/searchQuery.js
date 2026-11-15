/**
 * 搜索词构造（纯函数，可单测）。
 *
 * DeepSeek Search 的 query 上限是 128 个 Unicode 字符，超了直接报错。
 * 而 `site:` 操作符是命中权威站的关键手段，5 个站点拼起来很容易超长：
 *
 *   "三氯蔗糖 sucralose site:nhc.gov.cn OR site:cfsa.net.cn OR site:who.int
 *    OR site:fao.org OR site:pubmed.ncbi.nlm.nih.gov"
 *
 * 上面这条 128 出头，正好会失败。所以这里按优先级贪心装填：
 * 从最重要的站点开始加，加到装不下就停，绝不硬拼。
 *
 * 宁可少限定几个站点，也不能因为超长让整次搜索失败。
 */

import { getSearchSitePriority, getHealthSitePriority } from './sourceWhitelist.js';

export const QUERY_MAX_CHARS = 128;

/** 头部太长会挤掉所有 site:，所以别名有长度上限 */
const MAX_HEAD_CHARS = 40;
const MAX_ALIAS_CHARS = 26;

/**
 * 选查询头部：主名 + 一个短别名。
 * 优先挑拉丁名（sucralose / xanthan gum），因为 site:who.int 这类英文站
 * 用中文名命中率低；但别名本身也不能太长，否则挤占站点名额。
 */
export function pickQueryHead(name, aliases = []) {
  const core = String(name || '').trim();

  const alt = (aliases || []).find(
    (a) =>
      a &&
      a.length >= 3 &&
      a.length <= MAX_ALIAS_CHARS &&
      a !== core &&
      !/^E\d+$/i.test(a) && // 排除 E955 这类编号，对搜索没帮助
      !/^INS\s*\d+$/i.test(a) &&
      !/^\d+$/.test(a),
  );

  if (!alt) return core;

  const combined = `${core} ${alt}`;
  if (combined.length <= MAX_HEAD_CHARS) return combined;
  // 中文名太长、拼上英文名会挤掉 site: 名额时，优先保留英文名：
  // who.int / fao.org / efsa 的评估文档标题是英文，中文名对它们几乎没有帮助。
  // 纯拉丁别名才这样处理；中文别名仍然回到原名。
  if (/^[\x20-\x7E]+$/.test(alt)) return alt;
  return core;
}

/**
 * 构造受长度限制的搜索词。
 * @returns {{ query: string, head: string, sites: string[], length: number, truncated: boolean }}
 */
export function buildSearchQuery(name, aliases = [], { maxChars = QUERY_MAX_CHARS, sitePriority } = {}) {
  const core = String(name || '').trim();
  if (!core) return { query: '', head: '', sites: [], length: 0, truncated: false };

  const head = pickQueryHead(core, aliases);
  const sites = sitePriority || getSearchSitePriority();

  const parts = [];
  let len = head.length;

  for (const site of sites) {
    const seg = `site:${site}`;
    // 第一个站点前是一个空格，之后每个是 " OR "
    const add = (parts.length === 0 ? 1 : 4) + seg.length;
    if (len + add > maxChars) break;
    parts.push(seg);
    len += add;
  }

  const query = parts.length === 0 ? head : `${head} ${parts.join(' OR ')}`;

  return {
    query,
    head,
    sites: parts.map((p) => p.slice('site:'.length)),
    length: query.length,
    truncated: parts.length < sites.length,
  };
}

/**
 * 健康评估专项查询（V2.3 验收修复，纯函数）。
 *
 * 由服务端在「首轮有身份资料、但没有健康评估」时自动使用（第二轮），
 * 不再需要用户额外点击。
 *
 * 与首轮的区别：
 *  1. 多一个健康术语 ADI —— 国际机构的评估文档里一定出现这个词，
 *     而 GB 2760 的使用条件页一般没有，正好把技术资料挡在外面；
 *  2. 站点优先级换成「评估机构优先」：who.int / fao.org（JECFA）、
 *     efsa.europa.eu、pubmed，最后才是国内标准机构。
 *
 * 之所以不把它放进首轮：两个意图混在一条查询里，会同时削弱身份检索
 * 与健康检索。而开发阶段不能调用付费 API 做 A/B，所以首轮保持
 * 「身份优先」，健康证据用一次显式的、由用户付费的补充检索来补。
 *
 * @returns {{ query: string, head: string, sites: string[], length: number, terms: string }}
 */
export function buildHealthQuery({ name, aliases = [], maxChars = QUERY_MAX_CHARS } = {}) {
  const head = pickQueryHead(name, aliases);
  if (!head) return { query: '', head: '', sites: [], length: 0, terms: '' };

  const terms = 'ADI';
  const sites = getHealthSitePriority();
  const parts = [];
  let len = head.length + 1 + terms.length;

  for (const site of sites) {
    const seg = `site:${site}`;
    const add = (parts.length === 0 ? 1 : 4) + seg.length;
    if (len + add > maxChars) break;
    parts.push(seg);
    len += add;
  }

  const query = parts.length === 0 ? `${head} ${terms}` : `${head} ${terms} ${parts.join(' OR ')}`;
  return { query, head, sites: parts.map((p) => p.slice('site:'.length)), length: query.length, terms };
}

/**
 * 兜底搜索词构造（V6.1 新增，纯函数）。
 *
 * 触发时机：首轮搜索返回了结果，但经过相关性检查后没有任何「食品相关正文」。
 * 这时不能重复第一次请求，而要根据「缺什么」构造一条带食品语境的针对性查询。
 *
 * 通用规则，不按成分名写特例：
 *   - gap = 'identity'  连身份都没确认 → 查「食品添加剂 标准」
 *   - gap = 'food_use'  身份清楚但缺食品用途 → 查「食品 功能 用途」
 *   - gap = 'safety'    缺安全评价 → 查「安全 评估」（本版未启用，预留）
 *
 * 语境词优先用用户确认的食品类别（如「饮料」「饼干」），让结果贴着当前食品；
 * 站点仍走同一份白名单优先级，绝不放开到商业/自媒体来源。
 *
 * @returns {{ query: string, head: string, sites: string[], length: number, gap: string }}
 */
export function buildFallbackQuery({
  name,
  aliases = [],
  foodContext = null,
  gap = 'food_use',
  maxChars = QUERY_MAX_CHARS,
} = {}) {
  const head = pickQueryHead(name, aliases);

  const GAP_TERMS = {
    identity: '食品添加剂 标准',
    food_use: '食品添加剂 功能 用途',
    safety: '食品安全 评估',
  };
  let terms = GAP_TERMS[gap] || GAP_TERMS.food_use;

  // 用户确认的食品类别是最强的语境信号，但只留短词，避免挤掉 site: 名额
  const category = String(foodContext?.category || '')
    .trim()
    .slice(0, 6);
  if (category) terms = `${terms} ${category}`;

  const sites = getSearchSitePriority();
  const parts = [];
  let len = head.length + 1 + terms.length;

  for (const site of sites) {
    const seg = `site:${site}`;
    const add = (parts.length === 0 ? 1 : 4) + seg.length;
    if (len + add > maxChars) break;
    parts.push(seg);
    len += add;
  }

  const query = parts.length === 0 ? `${head} ${terms}` : `${head} ${terms} ${parts.join(' OR ')}`;

  return {
    query,
    head,
    sites: parts.map((p) => p.slice('site:'.length)),
    length: query.length,
    gap,
  };
}


// ---------------------------------------------------------------- 研究聚焦

/**
 * 四项研究目标各自的关键词（纯数据，可单测）。
 *
 * 设计约束：
 *  - 只用国际评估文档里真实会出现的英文词，避免中文词把 who.int/fao.org 的正文挡住；
 *  - 不写任何成分名，保证对所有成分通用；
 *  - 每个词都对应一个健康问题，不是「安全 风险 健康」这种泛词堆砌。
 */
export const FOCUS_TERMS = {
  normal: 'safety assessment dietary exposure',
  high: 'high intake adverse effects',
  sensitive: 'sensitivity intolerance',
  recent: 're-evaluation safety',
};

/** 传给 Search 的 ori_question：帮助搜索引擎理解意图，不参与证据引用 */
export const FOCUS_QUESTIONS = {
  identity: '这个配料是什么，在食品里起什么作用？',
  food_use: '这个配料在食品里通常用来做什么？',
  normal: '正常食用这种成分，权威机构有没有发现健康担忧？',
  high: '长期或大量摄入这种成分，有哪些已经发现的人体影响？',
  sensitive: '哪些人需要特别注意这种成分，依据是什么？',
  recent: '有没有比现有资料更新的官方安全评估？',
};

export function oriQuestionFor(focus) {
  return FOCUS_QUESTIONS[focus] || FOCUS_QUESTIONS.normal;
}

// ---------------------------------------------------------------- 身份感知查询

/**
 * 通用装填：head + terms + site: 片段，总长不超过 128。
 * 站点按优先级贪心加入，装不下就停，绝不硬拼。
 */
export function packQuery(head, terms, sites = [], maxChars = QUERY_MAX_CHARS) {
  const h = String(head || '').trim();
  const t = String(terms || '').trim();
  if (!h) return { query: '', head: '', terms: t, sites: [], length: 0, truncated: false };
  let base = t ? `${h} ${t}` : h;
  if (base.length > maxChars) {
    // 先砍 terms，保留 head；head 本身超长时按词边界截断
    base = h.length > maxChars ? h.slice(0, maxChars) : h;
  }
  const parts = [];
  let len = base.length;
  for (const site of sites) {
    const seg = `site:${site}`;
    const add = (parts.length === 0 ? 1 : 4) + seg.length;
    if (len + add > maxChars) break;
    parts.push(seg);
    len += add;
  }
  const query = parts.length ? `${base} ${parts.join(' OR ')}` : base;
  return {
    query,
    head: h,
    terms: t,
    sites: parts.map((p) => p.slice('site:'.length)),
    length: query.length,
    truncated: parts.length < sites.length,
  };
}

/** 身份查询：英文名/编号优先，中文名兜底；站点以标准机构 + 国际评估为主 */
export function buildIdentityQuery({ identity, maxChars = QUERY_MAX_CHARS } = {}) {
  const en = identity?.en || [];
  const head = en[0] || identity?.canonical || '';
  const extra = identity?.ins || identity?.eNumber || '';
  const terms = /^[\x20-\x7E]+$/.test(head) ? 'food additive' : '食品添加剂';
  const headWithCode = extra && head ? `${head} ${extra}` : head;
  return packQuery(headWithCode, terms, ['who.int', 'fao.org', 'inchem.org', 'cfsa.net.cn', 'nhc.gov.cn'], maxChars);
}

/**
 * 健康问题查询（身份感知）。
 *
 * 与旧版的区别：
 *  - 混合物优先用组成物质的英文名（JECFA 的标题就是这么写的）；
 *  - 每个问题用该物质最可能命中的研究主题（identity.highTerms / sensitiveTerms），
 *    而不是对所有物质都套同一句泛词；
 *  - JECFA 专论在 inchem.org 有镜像，站点优先级把它放在前面。
 */
export function buildAssessmentQuery({
  identity,
  focus = 'normal',
  maxChars = QUERY_MAX_CHARS,
} = {}) {
  // 每个组成物质取一个英文名，而不是把同一物质的多个变体都塞进去
  const constituentHead = identity?.mixture
    ? (identity.constituents || [])
        .map((c) => (c.en || [])[0] || c.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
    : '';
  const head = constituentHead || identity?.en?.[0] || identity?.canonical || '';

  const TERMS = {
    normal: 'JECFA safety evaluation',
    high: identity?.highTerms || 'high intake adverse effects',
    sensitive: identity?.sensitiveTerms || 'sensitive population intolerance',
    recent: 're-evaluation safety after:2020',
    constituent: 'JECFA toxicological evaluation',
    food_use: 'food additive function use',
  };
  const SITES = {
    normal: ['inchem.org', 'fao.org', 'who.int', 'efsa.europa.eu', 'pubmed.ncbi.nlm.nih.gov'],
    high: ['pubmed.ncbi.nlm.nih.gov', 'inchem.org', 'efsa.europa.eu', 'fao.org'],
    sensitive: ['pubmed.ncbi.nlm.nih.gov', 'fda.gov', 'efsa.europa.eu', 'inchem.org'],
    recent: ['efsa.europa.eu', 'who.int', 'fao.org', 'inchem.org'],
    constituent: ['inchem.org', 'fao.org', 'who.int', 'efsa.europa.eu'],
    food_use: ['cfsa.net.cn', 'nhc.gov.cn', 'fao.org'],
  };
  const terms = TERMS[focus] || TERMS.normal;
  const sites = []; // Broad discovery; source trust is evaluated after retrieval, not by truncating a site list.
  const r = packQuery(head, terms, sites, maxChars);
  return { ...r, focus, terms };
}

/**
 * 按「这一轮要回答哪个问题」构造查询词。
 *
 * identity / food_use 复用兜底查询（带食品语境，站点按标准机构优先）；
 * normal / high / sensitive / recent 走健康站点优先，并带上对应术语。
 *
 * @returns {{ query:string, head:string, sites:string[], length:number, focus:string, terms:string }}
 */
export function buildResearchQuery({
  name,
  aliases = [],
  focus = 'normal',
  foodContext = null,
  maxChars = QUERY_MAX_CHARS,
} = {}) {
  if (focus === 'identity' || focus === 'food_use') {
    const r = buildFallbackQuery({ name, aliases, foodContext, gap: focus, maxChars });
    return { ...r, focus, terms: '' };
  }

  const head = pickQueryHead(name, aliases);
  if (!head) return { query: '', head: '', sites: [], length: 0, focus, terms: '' };

  const terms = FOCUS_TERMS[focus] || FOCUS_TERMS.normal;
  const sites = getHealthSitePriority();
  const parts = [];
  let len = head.length + 1 + terms.length;

  for (const site of sites) {
    const seg = `site:${site}`;
    const add = (parts.length === 0 ? 1 : 4) + seg.length;
    if (len + add > maxChars) break;
    parts.push(seg);
    len += add;
  }

  const query = parts.length === 0 ? `${head} ${terms}` : `${head} ${terms} ${parts.join(' OR ')}`;
  return {
    query,
    head,
    sites: parts.map((p) => p.slice('site:'.length)),
    length: query.length,
    focus,
    terms,
  };
}
