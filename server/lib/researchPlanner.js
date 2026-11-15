/**
 * 研究规划器（模型规划 + 确定性兜底 + 程序硬校验）。
 *
 * 解决的问题：
 *   旧流程的「下一轮查什么」完全由固定规则决定，模型只在最后整理时出现。
 *   结果是找到登记页/ADI 就提前结束，或者四轮都围着同一个名字打转。
 *
 * 现在的分工：
 *   - 模型看到「身份关系 + 已取得资料 + 四项覆盖 + 剩余预算」，
 *     决定下一步是换名字、查组成物质、读原文、补高摄入/人群/新评估，还是停止；
 *   - 程序不把决定权交出去：查询长度、身份词、白名单、预算、重复查询、
 *     只能抓搜索结果里已有的 URL —— 全部由代码校验；
 *   - 模型不可用/输出不合法时，用确定性规划兜底，研究不会中断。
 *
 * 规划器不生成任何健康结论，只决定「下一步找什么」。
 */

import { identitySearchNames, describeIdentity, matchEvidenceToIdentity } from './substanceIdentity.js';
import { digestForPlanner, fetchCandidates, coverageLabel, refreshCoverage } from './evidenceLedger.js';
import { checkUrlAllowed } from './sourceWhitelist.js';
import { QUERY_MAX_CHARS } from './searchQuery.js';
import { normalizeQuote } from '../../src/domain/evidence/healthGuard.js';

export const FOCUS = {
  IDENTITY: 'identity',
  CONSTITUENT: 'constituent',
  NORMAL: 'normal',
  HIGH: 'high',
  SENSITIVE: 'sensitive',
  RECENT: 'recent',
  FOOD_USE: 'food_use',
};

export const FOCUS_LABELS = {
  identity: '确认身份',
  constituent: '查组成物质',
  food_use: '确认食品用途',
  normal: '正常食用评估',
  high: '高摄入人体影响',
  sensitive: '特殊人群',
  recent: '较新评估',
};

const MAX_ACTIONS_PER_PLAN = 3;

const PLANNER_SYSTEM = `你是 PackTruth 的食品成分研究规划器。你不写健康结论，只决定「下一步查什么」。
你的目标是尽量回答四个消费者问题：
1. 正常食用时，权威机构怎么评估？
2. 长期或大量摄入，有哪些已经研究过的人体影响？
3. 哪些人需要特别注意？
4. 这些证据对当前这款食品意味着什么？

你会收到：
- 研究对象身份（正式名、英文名、INS/E 编号、混合物组成、评估组、不同化学形式）；
- 已取得的资料（标题、机构、类型、章节、身份匹配、问题命中、原文线索）；
- 四项问题的覆盖状态；
- 已试过的查询；
- 剩余预算和可抓取的候选 URL。

决策规则：
A. 身份优先。身份没确认时，先换名字/英文名/编号查，不要直接写健康结论。
B. 拿到 ADI/登记页不等于回答了「吃多了会怎样」。如果只有参考值，继续找正式评估、人体研究或高摄入资料。
C. 混合物优先查组成物质的联合评估。例：商品名找不到时，用组成物质名 + JECFA/EFSA + safety evaluation。
D. 优先正式评估/人体资料，不把会议纪要、征集数据、工作计划、进度表当成评估。若进度表提到已发表，搜索物质+机构+发表年份/标题找到实际评估。抓取失败后用新查询寻找可读取的官方摘要/原文/归档，不要连续尝试同一出版社多个失败页面。
E. 阅读原文时优先看：正式评价/结论、人体观察、膳食暴露、不良反应、敏感人群；动物毒理只能作为背景。
F. 特殊人群必须有来源点名；没有点名就不要编。已经查过且没有，就承认缺口。
G. 优先适用的最新正式评估。若只有flavouring用途，而包装用途不同，继续查食品添加剂/酸度调节/代谢/人体资料，不要停止在用途不同。普通食材查膳食与营养研究，不套ADI。
H. 抓取失败/白名单拦截要如实记录，不要当成「科学界没有资料」。
I. 最多给 3 个动作；没有必要时返回空 actions 并 stop=true。
J. 查询≤128字符。可用已知名、从资料读到的新别名、组成物质或联合评估名；不为每个成分套用疾病关键词。新别名只是检索假设，不能直接确认为同物质。不要查询URL。
K. 只能抓 candidates 里出现过的 URL；不要编造 URL。

只输出一个 json 对象，不要 markdown，不要解释文字：
{
  "assessment": {
    "identity": "confirmed | partial",
    "normal": "answered | reference_only | missing",
    "high": "human | animal_only | reference_only | missing",
    "sensitive": "named | missing",
    "recent": "current | needed | unknown"
  },
  "actions": [
    { "type": "search", "query": "...", "focus": "identity|constituent|normal|high|sensitive|recent|food_use", "why": "一句话" },
    { "type": "fetch", "url": "https://...", "why": "一句话" }
  ],
  "identityUpdates": [{ "name": "从本次资料确认的新别名或组成物质", "relation": "alias|constituent|group|analog", "sourceId": "S编号", "quote": "说明身份关系的连续原文，不确定则不填" }],
  "stop": false,
  "stopReason": "evidence_sufficient | no_new_value | budget | none",
  "notes": "一句话，说明还缺什么"
}`;

function uniqueBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function normalizeQuery(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function identityTerms(identity) {
  return uniqueBy(
    [
      ...identitySearchNames(identity),
      ...(identity?.constituents || []).flatMap((c) => [c.name, ...(c.en || [])]),
      ...(identity?.groupNames || []),
      identity?.ins,
      identity?.eNumber,
    ]
      .map((x) => String(x || '').trim())
      .filter((x) => x.length >= 2),
    (x) => normalizeQuery(x),
  );
}

function containsIdentityTerm(query, identity) {
  const q = normalizeQuery(query);
  return identityTerms(identity).some((t) => q.includes(normalizeQuery(t)));
}

/** 把过长的查询压到 128 字符以内，但保留至少一个身份词 */
export function fitQuery(query, identity, maxChars = QUERY_MAX_CHARS) {
  let q = String(query || '').replace(/\s+/g, ' ').trim();
  if (q.length <= maxChars) return q;
  // 先尝试去掉末尾的 site: 片段
  const parts = q.split(/\s+OR\s+/i);
  while (parts.length > 1 && parts.join(' OR ').length > maxChars) parts.pop();
  q = parts.join(' OR ');
  if (q.length <= maxChars) return q;
  // 再按词边界截断
  q = q.slice(0, maxChars);
  const cut = q.lastIndexOf(' ');
  if (cut > 20) q = q.slice(0, cut);
  if (!containsIdentityTerm(q, identity)) {
    const head = identitySearchNames(identity)[0] || identity?.canonical || '';
    q = `${head} ${q}`.slice(0, maxChars);
  }
  return q.trim();
}

/** 从查询里抽出 site: 域名，校验是否在白名单内 */
export function validateQuerySites(query) {
  const sites = [...String(query || '').matchAll(/site:([^\s]+)/gi)].map((m) => m[1].toLowerCase());
  const bad = [];
  for (const s of sites) {
    const chk = checkUrlAllowed(`https://${s}/`);
    if (!chk.allowed) bad.push(s);
  }
  return { sites, bad };
}

/**
 * 程序校验模型给出的动作。
 *
 * @returns {{actions:Array, rejected:Array}}
 */
export function validatePlannerActions(rawActions = [], {
  identity,
  ledger,
  budget = {},
  candidates = [],
  attemptedQueries = [],
} = {}) {
  const actions = [];
  const rejected = [];
  const candidateUrls = new Set(candidates.map((c) => c.url));
  const attempted = new Set(attemptedQueries.map(normalizeQuery));
  // 只有「已经读过原文」的 URL 才拒绝重复抓取；
  // 搜索结果里有摘要但还没读原文的，正是应该抓的候选。
  const readUrls = new Set(
    (ledger?.records || []).filter((r) => r.read).map((r) => r.url).filter(Boolean),
  );
  const failedUrls = new Set((ledger?.fetchFailures || []).map((f) => f.url));
  let searches = 0;
  let fetches = 0;

  for (const a of Array.isArray(rawActions) ? rawActions : []) {
    if (!a || typeof a !== 'object') continue;
    if (actions.length >= MAX_ACTIONS_PER_PLAN) break;

    if (a.type === 'search') {
      if ((budget.searchesLeft ?? 0) <= searches) {
        rejected.push({ ...a, reason: '搜索预算已用完' });
        continue;
      }
      const rawQ = String(a.query || '').trim();
      if (!rawQ) {
        rejected.push({ ...a, reason: '查询为空' });
        continue;
      }
      const q = fitQuery(rawQ, identity);
      if (!containsIdentityTerm(q, identity) && !String(a.why || '').trim()) {
        rejected.push({ ...a, reason: '查询里没有研究对象/组成物质的名称' });
        continue;
      }
      if (attempted.has(normalizeQuery(q))) {
        rejected.push({ ...a, reason: '这条查询已经试过' });
        continue;
      }
      const siteCheck = validateQuerySites(q);
      if (siteCheck.bad.length) {
        rejected.push({ ...a, reason: `查询里出现白名单外站点：${siteCheck.bad.join(', ')}` });
        continue;
      }
      const focus = Object.values(FOCUS).includes(a.focus) ? a.focus : FOCUS.NORMAL;
      actions.push({ type: 'search', query: q, focus, why: String(a.why || '').slice(0, 160) });
      attempted.add(normalizeQuery(q));
      searches += 1;
      continue;
    }

    if (a.type === 'fetch') {
      if ((budget.fetchesLeft ?? 0) <= fetches) {
        rejected.push({ ...a, reason: '抓取预算已用完' });
        continue;
      }
      const url = String(a.url || '').trim();
      const chk = checkUrlAllowed(url);
      if (!chk.allowed) {
        rejected.push({ ...a, reason: `域名不在白名单：${chk.reason}` });
        continue;
      }
      if (!candidateUrls.has(url)) {
        rejected.push({ ...a, reason: 'URL 不在本次搜索结果里，可能是编造的' });
        continue;
      }
      if (readUrls.has(url)) {
        rejected.push({ ...a, reason: '这个 URL 的原文已经读过' });
        continue;
      }
      if (failedUrls.has(url)) {
        rejected.push({ ...a, reason: '这个 URL 之前抓取失败，不重复抓' });
        continue;
      }
      actions.push({ type: 'fetch', url, why: String(a.why || '').slice(0, 160) });
      fetches += 1;
      continue;
    }

    rejected.push({ ...a, reason: '未知动作类型' });
  }

  return { actions, rejected };
}

/**
 * 确定性规划：模型不可用时的兜底，也是测试的基准。
 */
export function deterministicPlan({ identity, ledger, budget = {}, attemptedQueries = [] } = {}) {
  const actions = [];
  const attempted = new Set(attemptedQueries.map(normalizeQuery));
  const c = ledger.coverage;
  const searchesLeft = budget.searchesLeft ?? 0;
  const fetchesLeft = budget.fetchesLeft ?? 0;
  const candidates = fetchCandidates(ledger, { limit: 8 });
  const hasSearch = (q) => attempted.has(normalizeQuery(q));

  const addSearch = (query, focus, why) => {
    if (actions.filter((a) => a.type === 'search').length >= 2) return;
    if (searchesLeft <= actions.filter((a) => a.type === 'search').length) return;
    const q = fitQuery(query, identity);
    if (!q || hasSearch(q)) return;
    actions.push({ type: 'search', query: q, focus, why });
    attempted.add(normalizeQuery(q));
  };
  const addFetch = (why) => {
    if (actions.filter((a) => a.type === 'fetch').length >= 2) return;
    if (fetchesLeft <= actions.filter((a) => a.type === 'fetch').length) return;
    const target = candidates.find((x) => !actions.some((a) => a.url === x.url));
    if (!target) return;
    actions.push({ type: 'fetch', url: target.url, why: why || `读取 ${target.id} 的评估/人体章节` });
  };

  // 1) 身份没确认：换英文名/编号查
  if (c.identity !== 'confirmed') {
    const names = identitySearchNames(identity).slice(0, 3);
    addSearch(`${names.join(' OR ')} food additive`, FOCUS.IDENTITY, '确认研究对象身份');
    return { actions, source: 'deterministic', notes: '身份未确认，先补身份' };
  }

  // 2) 有未读的评估/人体候选：先读原文
  const unreadEval = candidates.find(
    (x) => ['evaluation', 'human', 'sensitive'].includes(x.kind) || x.sections.includes('evaluation') || x.sections.includes('human'),
  );
  if (unreadEval && fetchesLeft > 0) {
    addFetch(`读取 ${unreadEval.id} 的评估/人体章节`);
    // 读原文的同时，如果高摄入还缺，允许再排一条搜索
    if (c.high !== 'human' && searchesLeft > 0) {
      addSearch(
        `${identitySearchNames(identity).slice(0, 2).join(' ')} high intake adverse effects`,
        FOCUS.HIGH,
        '现有资料还没有人体高摄入证据',
      );
    }
    return { actions, source: 'deterministic', notes: '优先读取已找到的评估/人体原文' };
  }

  // 3) 没有评估类资料：查正式评估（优先组/组成物质）
  //    但「正常食用」这个目标已经查过一次时，不再用另一条近似查询重复它；
  //    直接把预算让给高摄入/人群等真正不同的缺口。
  const evalSeen = ledger.records.some(
    (r) => r.match?.allowsDirectClaim && (r.kind === 'evaluation' || r.sections?.evaluation),
  );
  const normalTried = (ledger.searches || []).some((s) => s.focus === FOCUS.NORMAL);
  if (!evalSeen && !normalTried && searchesLeft > 0) {
    const head =
      identity.constituents?.length && identity.mixture
        ? identity.constituents.map((x) => (x.en || [])[0] || x.name).slice(0, 2).join(' ')
        : identitySearchNames(identity).slice(0, 2).join(' ');
    addSearch(`${head} JECFA safety evaluation`, FOCUS.NORMAL, '查找正式风险评估');
    if (identity.mixture && identity.constituents?.length && searchesLeft > 1) {
      addSearch(
        `${identity.constituents.map((x) => (x.en || [])[0] || x.name).slice(0, 2).join(' ')} JECFA toxicological evaluation`,
        FOCUS.CONSTITUENT,
        '商品名没有评估时，查组成物质的联合评估',
      );
    }
    return { actions, source: 'deterministic', notes: '还没有正式评估，先查评估' };
  }

  // 4) 高摄入只有动物/参考值：查人体影响
  if (c.high !== 'human' && searchesLeft > 0) {
    addSearch(
      `${identitySearchNames(identity).slice(0, 2).join(' ')} high intake adverse effects humans`,
      FOCUS.HIGH,
      c.high === 'animal' ? '只有动物证据，继续找人体研究' : '还缺高摄入人体影响',
    );
  }

  // 5) 特殊人群
  if (c.sensitive !== 'named' && searchesLeft > 0) {
    addSearch(
      `${identitySearchNames(identity).slice(0, 2).join(' ')} sensitive population intolerance`,
      FOCUS.SENSITIVE,
      '还缺特殊人群资料',
    );
  }

  // 6) 新评估
  if (c.recent === 'needed' && searchesLeft > 0) {
    addSearch(
      `${identitySearchNames(identity).slice(0, 2).join(' ')} re-evaluation after:2020`,
      FOCUS.RECENT,
      '现有评估偏旧，补查较新的正式评估',
    );
  }

  // 7) 有候选但还没读：兜底读一篇
  if (actions.length === 0 && fetchesLeft > 0) addFetch();

  return {
    actions,
    source: 'deterministic',
    notes: actions.length ? '按确定性规则补齐缺口' : '没有可执行的下一步',
  };
}

/**
 * 规划一次。
 *
 * @param {object} p
 * @param {object} p.identity
 * @param {object} p.ledger
 * @param {{searchesLeft:number,fetchesLeft:number,plannerCallsLeft:number}} p.budget
 * @param {string[]} p.attemptedQueries
 * @param {(args:{system:string,user:string})=>Promise<object>} [p.callModel]
 * @returns {Promise<{actions:Array, source:'model'|'deterministic', assessment:object|null,
 *   notes:string, rejected:Array, raw?:object}>}
 */
export async function planNextStep({
  identity,
  ledger,
  budget = {},
  attemptedQueries = [],
  callModel = null,
  foodContext = null,
} = {}) {
  const candidates = fetchCandidates(ledger, { limit: 10 });

  // 没有任何预算/没有必要规划时，直接返回空
  const noBudget = (budget.searchesLeft ?? 0) <= 0 && (budget.fetchesLeft ?? 0) <= 0;
  if (noBudget) {
    return {
      actions: [],
      source: 'deterministic',
      assessment: null,
      notes: '检索与读取预算都已用完',
      rejected: [],
    };
  }

  let modelResult = null;
  let modelError = null;
  if (callModel && (budget.plannerCallsLeft ?? 0) > 0) {
    try {
      const user = [
        `当前日期：${new Date().toISOString().slice(0,10)}；食品语境（数据）：${JSON.stringify(foodContext)}`,
        '程序的覆盖状态只是关键词线索，不代表问题已回答；请阅读原文线索自行判断。',
        '=== 研究对象身份 ===',
        describeIdentity(identity),
        '',
        digestForPlanner(ledger, { maxSources: 12 }),
        '',
        '=== 剩余预算 ===',
        `搜索 ${budget.searchesLeft ?? 0} 次；抓取 ${budget.fetchesLeft ?? 0} 页；规划 ${budget.plannerCallsLeft ?? 0} 次`,
        '',
        '=== 已试过的查询 ===',
        attemptedQueries.length ? attemptedQueries.map((q) => `- ${q}`).join('\n') : '（无）',
        '',
        '=== 可抓取的候选 URL（只能从这里选）===',
        candidates.length
          ? candidates.map((c) => `- ${c.url} | ${c.id} | ${c.title} | ${c.kind} | ${c.sections.join('/')}`).join('\n')
          : '（无）',
        '',
        '请判断四项问题的覆盖是否足够，并给出下一步动作。只输出 json。',
      ].join('\n');
      const res = await callModel({ system: PLANNER_SYSTEM, user });
      if (res?.parsed) {
        modelResult = res.parsed;
      } else {
        modelError = res?.jsonParse?.reason || '规划器没有返回可解析的 JSON';
      }
    } catch (e) {
      modelError = e.message || String(e);
    }
  }

  if (modelResult) {
    for (const update of (Array.isArray(modelResult.identityUpdates) ? modelResult.identityUpdates : []).slice(0, 5)) {
      const source = ledger.records.find(r => r.id === update.sourceId);
      const name = String(update.name || '').trim();
      const quote = normalizeQuote(update.quote);
      if (!source || name.length < 3 || name.length > 90 || quote.length < 20 || !normalizeQuote(source.rawText).includes(quote) || !normalizeQuote(source.rawText).includes(normalizeQuote(name))) continue;
      identity.discoveredRelations ||= [];
      identity.discoveredRelations.push({ ...update, url: source.url });
      if (update.relation === 'alias' && !identity.names.includes(name)) { identity.names.push(name); identity.matchNames.push(name); }
      if (update.relation === 'constituent' && !identity.constituents.some(c => c.name === name)) { identity.constituents.push({ name, en: [name] }); identity.mixture = true; }
      if (update.relation === 'group' && !identity.groupNames.includes(name)) { identity.groupNames.push(name); identity.group ||= name; }
      if (update.relation === 'analog' && !identity.analogs.some(c => c.name === name)) identity.analogs.push({ name, en: [name] });
    }
    for (const record of ledger.records) record.match = matchEvidenceToIdentity(`${record.title}\n${record.rawText}`, identity);
    refreshCoverage(ledger);
    const { actions, rejected } = validatePlannerActions(modelResult.actions, {
      identity,
      ledger,
      budget,
      candidates,
      attemptedQueries,
    });
    // 模型说 stop，但覆盖仍有缺口时，不让它提前停。
    // 特殊人群/新评估即使只算「软缺口」，也要至少尝试一次 ——
    // 否则「哪些人需要注意」永远停在「没查」而不是「查过没有」。
    const c = ledger.coverage;
    const hardGap =
      c.identity !== 'confirmed' ||
      c.normal !== 'direct' ||
      c.high !== 'human';
    const sensitiveTried = (ledger.searches || []).some((s) => s.focus === 'sensitive');
    const recentTried = (ledger.searches || []).some((s) => s.focus === 'recent');
    const softGapNeedsAttempt =
      (c.sensitive === 'missing' && !sensitiveTried) ||
      (c.recent === 'needed' && !recentTried);
    const gapButBudget =
      (hardGap || softGapNeedsAttempt) &&
      ((budget.searchesLeft ?? 0) > 0 || (budget.fetchesLeft ?? 0) > 0);
    const tried = new Set((ledger.searches || []).map(s => s.focus));
    const stop = Boolean(modelResult.stop) && (modelResult.assessment?.normal === 'answered') && (tried.has('high') || modelResult.assessment?.high === 'human') && (tried.has('sensitive') || modelResult.assessment?.sensitive === 'named');

    // 模型被否掉「提前停」但没有给出动作时，用确定性规则补上
    if (!stop && actions.length === 0) {
      const fallback = deterministicPlan({
        identity,
        ledger,
        budget,
        attemptedQueries,
      });
      return {
        ...fallback,
        source: 'deterministic-fallback',
        assessment: modelResult.assessment || null,
        rejected,
        raw: modelResult,
        modelError,
        stoppedByPlanner: false,
        notes: fallback.notes || '规划器想停止，但仍有未尝试的健康问题，改用确定性规则补齐',
      };
    }

    return {
      actions: stop ? [] : actions,
      source: 'model',
      assessment: modelResult.assessment || null,
      notes: String(modelResult.notes || modelResult.stopReason || '').slice(0, 300),
      rejected,
      raw: modelResult,
      modelError,
      stoppedByPlanner: stop,
    };
  }

  const fallback = deterministicPlan({ identity, ledger, budget, attemptedQueries });
  return { ...fallback, assessment: null, rejected: [], modelError };
}

/** 规划器是否能参与：有模型调用且有预算 */
export function canUsePlanner(budget = {}) {
  return (budget.plannerCallsLeft ?? 0) > 0 && ((budget.searchesLeft ?? 0) > 0 || (budget.fetchesLeft ?? 0) > 0);
}

/** 给测试/报告用的可读状态 */
export function plannerState(ledger) {
  return ['identity', 'normal', 'high', 'sensitive', 'recent', 'original']
    .map((k) => `${k}=${coverageLabel(ledger.coverage[k])}`)
    .join(' ');
}
