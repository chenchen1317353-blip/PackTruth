/**
 * 科学证据适用性检查（V5.2 科学性修复 · Scientific Evidence Guard）。
 *
 * 解决的问题：
 * citationGuard 能保证「来源编号存在、摘录存在」，但保证不了「这句话说得对」。
 * 实测出现过三类错误，都不是引用造假，而是**解释越界**：
 *
 *   A. 术语扩大化 —— 证据写的是 "ADI not specified"，输出变成「没有摄入限制」
 *   B. 条目错配   —— 证据里「抗结剂」属于相邻的另一个添加剂，被安到碳酸氢钠头上
 *   C. 领域错配   —— 证据讨论的是尿液/皮肤清洁，却拿来支持食品用途
 *
 * 这里对三类分别做**确定性检查**。能用代码判断的绝不用提示词祈祷。
 *
 * ============ 能力边界（必须原样保留在文档里）============
 * 这些检查器只能识别「已知的错误模式」，不能判断「整段论述在科学上是否成立」。
 *   - 未触发任何规则 ≠ 已核实，只等于「没有命中我们已知的坑」
 *   - 语义层面的对错仍需人工核对原始文献
 *   - 规则表（safetyTerms.js）不全时，新术语不会被拦住
 * 因此 UI 上不做「科学已核验」徽章，只保留中性的「引用对应关系已检查」。
 * ======================================================
 */

import { SAFETY_TERMS, detectTermsInEvidence, isNegatedAt } from './safetyTerms.js';

export const CHECK_STATUS = {
  PASS: 'pass', // 在当前可机器核对的范围内通过
  REVIEW: 'review', // 缺少上下文或无法判断，不能当作已核实的事实
  REJECT: 'reject', // 与已确认事实或规则明显矛盾
};

const SEVERITY = { pass: 0, review: 1, reject: 2 };

function worst(statuses) {
  return statuses.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'pass');
}

// ============================================================ 规则 A：安全术语

/** 从文本里抽 ADI 数值（mg/kg bw） */
function extractAdiNumbers(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*mg\s*\/\s*kg\s*(?:bw|体重)?/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) out.push(Number(m[1]));
  return out;
}

/**
 * 检查结论是否把安全评价术语做了扩大解释。
 *
 * @param {string} claimText 一条结论的正文
 * @param {Array} citedEvidence 这条结论引用的证据
 * @returns {{ status: string, issues: Array }}
 */
export function checkSafetyTerm(claimText, citedEvidence = []) {
  const text = String(claimText || '');
  const issues = [];

  const termsInEvidence = citedEvidence.flatMap((s) => detectTermsInEvidence(s.excerpt || ''));
  const termIds = new Set(termsInEvidence.map((t) => t.id));

  if (termIds.size === 0) return { status: CHECK_STATUS.PASS, issues };

  // A-1 术语 → 禁止推论
  for (const id of termIds) {
    const term = SAFETY_TERMS[id];
    if (!term) continue;

    for (const f of term.forbidden || []) {
      const re = new RegExp(f.pattern.source, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        // 正确的否定句（「不意味着无限量安全」）不应被拦截
        if (isNegatedAt(text, m.index)) continue;
        issues.push({
          level: CHECK_STATUS.REJECT,
          rule: 'A',
          term: id,
          matched: m[0].slice(0, 60),
          why: f.why,
        });
      }
    }
  }

  // A-2 临时 ADI 不得省略「临时」
  if (termIds.has('TEMPORARY_ADI') && /ADI|每日允许摄入量/i.test(text)) {
    if (!/临时|暂定|temporary/i.test(text)) {
      issues.push({
        level: CHECK_STATUS.REVIEW,
        rule: 'A',
        term: 'TEMPORARY_ADI',
        why: '证据给出的是临时 ADI，但结论没有说明其临时性',
      });
    }
  }

  // A-3 结论里的 ADI 数值必须与证据一致
  const claimNums = extractAdiNumbers(text);
  if (claimNums.length > 0) {
    const evNums = extractAdiNumbers(citedEvidence.map((s) => s.excerpt || '').join(' '));
    if (evNums.length > 0) {
      for (const n of claimNums) {
        if (!evNums.includes(n)) {
          issues.push({
            level: CHECK_STATUS.REJECT,
            rule: 'A',
            why: `结论中的 ADI 数值 ${n} mg/kg bw 在引用的资料里找不到`,
          });
        }
      }
    }
  }

  // A-4 证据是 NOT SPECIFIED，结论却给了数值 ADI
  if (termIds.has('ADI_NOT_SPECIFIED') && !termIds.has('NUMERIC_ADI') && claimNums.length > 0) {
    issues.push({
      level: CHECK_STATUS.REJECT,
      rule: 'A',
      why: '资料给出的是 ADI not specified（未规定数值），结论不能给出一个具体数值',
    });
  }

  const status = worst(issues.map((i) => i.level));
  return { status, issues };
}

// ============================================================ 规则 B：身份与用途

/** GB 2760 附录 D 的功能类别词（用于识别结论里声称了哪种功能） */
export const FUNCTION_TERMS = [
  '防腐剂',
  '抗氧化剂',
  '着色剂',
  '护色剂',
  '漂白剂',
  '膨松剂',
  '酸度调节剂',
  '稳定剂',
  '凝固剂',
  '增稠剂',
  '抗结剂',
  '水分保持剂',
  '乳化剂',
  '甜味剂',
  '增味剂',
  '面粉处理剂',
  '被膜剂',
  '消泡剂',
  '抗结',
  '膨松',
];

/**
 * 把证据切成语义片段。
 * 分隔符包括换行、竖线、句号、分号、逗号——这些在标准网页和表格里
 * 通常正好对应「一个字段」或「一行的相邻单元格」。
 */
function splitSegments(text) {
  return String(text || '')
    .split(/[\n|｜。；;，,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 取「成分名所在位置」之后的有限范围，遇到下一个条目就停。
 *
 * 为什么需要停：GB 2760 那种页面会把多个添加剂的条目拼在一起，
 * 如果不设边界，碳酸氢钠条目后面紧跟的山梨酸钾功能也会被算进来。
 *
 * names 是「当前成分的已知称呼集合」（中文名 + 别名 + 英文名，统一小写匹配）。
 * V6.1 教训：Codex GSFA 页面通篇用英文名 "Potassium chloride"，
 * 只拿中文名「氯化钾」去定位会找不到起点——如果把「定位失败」
 * 错误地当成「资料列出了完整功能清单」，就会把明明支持的功能冤枉成错配。
 */
function scopesOf(excerpt, names) {
  const segs = splitSegments(excerpt);
  const lowerNames = (Array.isArray(names) ? names : [names])
    .map((n) => String(n || '').toLowerCase())
    .filter(Boolean);
  const scopes = [];

  for (let start = 0; start < segs.length; start += 1) {
    const segLower = segs[start].toLowerCase();
    if (!lowerNames.some((n) => segLower.includes(n))) continue;

    const out = [segs[start]];
    // CFSA 表格被拆成「中文名称 / 成分名 / --- / 英文名称 / 英文名 / CNS /
    // 编号 / INS / 编号 / 功能 / 功能清单」等多个片段，功能清单可能落在
    // 成分名之后第 10 段。窗口要覆盖完整条目，但仍以「中文名称」为硬边界，
    // 不会读到下一个添加剂条目。
    for (let i = start + 1; i < Math.min(segs.length, start + 16); i += 1) {
      if (/中文名称/.test(segs[i])) break;
      out.push(segs[i]);
    }
    scopes.push(out.join('|'));
  }

  return scopes;
}

/**
 * 证据里是否真的「定位到了」当前成分的作用域。
 * 定位不到时（比如资料通篇用另一种语言的名字），功能清单判断不可靠，
 * 后续只能降级为「归属不明」，不能武断拒绝。
 */
function locatedInEvidence(excerpt, names) {
  return scopesOf(excerpt, names).length > 0;
}

/** 证据里是否有「该成分 + 该功能」的直接共现 */
export function hasFunctionSupport(excerpt, ingredientName, functionTerm, aliases = []) {
  const scopes = scopesOf(excerpt, [ingredientName, ...aliases]);
  return scopes.some((s) => s.includes(functionTerm));
}

/**
 * 某成分的作用域里明确列出了几个功能。
 * 用来判断「我们是否拿到了这个成分的完整功能清单」——
 * 拿到了（≥2 个），清单外的功能就是明确错误；没拿到，只能存疑。
 */
function countFunctionsInScope(excerpt, names) {
  const scopes = scopesOf(excerpt, names);
  let max = 0;
  for (const scope of scopes) {
    const hits = new Set(FUNCTION_TERMS.filter((f) => scope.includes(f)));
    // 去掉被更长词包含的短词（「抗结剂」命中时不再重复算「抗结」）
    const unique = [...hits].filter((f) => ![...hits].some((g) => g !== f && g.includes(f)));
    max = Math.max(max, unique.length);
  }
  return max;
}

/**
 * 检查结论里声称的技术用途是否有对应依据。
 *
 * 注意规则 B 的一个边界（写进代码注释是刻意的）：
 * 「资料没写这个功能」只能推出「当前证据不足」，**不能**推出「该物质绝不可能有这个作用」。
 * 所以这里判的是「这句话能不能被手上这些资料支持」，不是「这个功能不存在」。
 */
export function checkFunctionScope(claimText, { ingredientName = '', aliases = [], citedEvidence = [] } = {}) {
  const text = String(claimText || '');
  const issues = [];
  const names = [ingredientName, ...aliases];

  const claimed = FUNCTION_TERMS.filter((f) => text.includes(f));
  if (claimed.length === 0) return { status: CHECK_STATUS.PASS, issues };

  const hasMixed = citedEvidence.some((s) => s.possibleMixedContent);
  // 证据里一个功能类别词都没有，说明它压根不是标准类资料（比如论文摘要）。
  // 这种时候只能说「无法确认」，不能说「资料否定了这个功能」。
  const evidenceHasAnyFunction = citedEvidence.some((s) =>
    FUNCTION_TERMS.some((f) => String(s.excerpt || '').includes(f)),
  );
  // 证据里能不能定位到当前成分的作用域？
  // V6.1 教训：资料通篇用英文名时，中文名定位失败——此时「清单外」判断不可靠，
  // 必须降级为「归属不明」（review），否则会把独立可靠来源支持的功能冤枉成错配。
  const located = citedEvidence.some((s) => locatedInEvidence(String(s.excerpt || ''), names));
  // 是否拿到了这个成分的完整功能清单（同一作用域里 ≥2 个功能词）
  const hasFullFunctionList =
    located &&
    citedEvidence.some((s) => countFunctionsInScope(String(s.excerpt || ''), names) >= 2);

  for (const fn of claimed) {
    const supported = citedEvidence.some((s) =>
      hasFunctionSupport(s.excerpt || '', ingredientName, fn, aliases),
    );
    if (supported) continue;

    issues.push({
      level: !located || (!hasFullFunctionList && (hasMixed || !evidenceHasAnyFunction))
        ? CHECK_STATUS.REVIEW
        : CHECK_STATUS.REJECT,
      rule: 'B',
      term: fn,
      why: !located
        ? `引用的资料里没有找到「${ingredientName}」的条目（可能使用了其他语言的名称），无法确认「${fn}」的归属`
        : hasFullFunctionList
          ? `资料明确列出了「${ingredientName}」的功能，「${fn}」不在其中`
          : hasMixed
            ? `资料混排了多个添加剂条目，「${fn}」无法确认属于「${ingredientName}」`
            : !evidenceHasAnyFunction
              ? `引用的资料没有列出功能类别，无法据此确认「${ingredientName}」是否具有「${fn}」功能`
              : `引用的资料里没有直接支持「${ingredientName}」具有「${fn}」功能的内容`,
    });
  }

  const status = worst(issues.map((i) => i.level));
  return { status, issues };
}

/** 提取编号 */
function extractCodes(text) {
  const s = String(text || '');
  // 容忍「CNS 06.001」「CNS号06.001」「CNS 号是 06.001」「CNS：06.001」，
  // 以及表格里的「CNS | 06.001」（V6.1 教训：CFSA 条目用竖线分隔字段，
  // 之前正则不认管道符，导致编号明明在摘录里却被判「资料里没有编号」而误拒）。
  const sep = String.raw`[号:：]?\s*(?:是|为)?\s*[|｜]?\s*`;
  const cns = [...s.matchAll(new RegExp(String.raw`CNS\s*${sep}([0-9]{2}\.[0-9]{3})`, 'gi'))].map((m) => m[1]);
  const ins = [...s.matchAll(new RegExp(String.raw`INS\s*${sep}([0-9]{2,4}(?:\([ivx]+\))?)`, 'gi'))].map((m) =>
    m[1].toLowerCase(),
  );
  return { cns, ins };
}

/**
 * 检查结论里给出的 CNS / INS 编号是否与证据一致。
 * 编号错位是「相邻条目混淆」最硬的信号：名称可能写得含糊，编号是唯一的。
 */
export function checkIngredientIdentity(claimText, { citedEvidence = [] } = {}) {
  const claim = extractCodes(claimText);
  const issues = [];

  if (claim.cns.length === 0 && claim.ins.length === 0) {
    return { status: CHECK_STATUS.PASS, issues };
  }

  const evText = citedEvidence.map((s) => s.excerpt || '').join(' ');
  const ev = extractCodes(evText);

  if (ev.cns.length === 0 && ev.ins.length === 0) {
    // 结论给了编号，但资料里根本没有编号 —— 这是编造或跨来源拼接
    issues.push({
      level: CHECK_STATUS.REJECT,
      rule: 'B',
      why: '结论给出了 CNS/INS 编号，但引用的资料里没有出现任何编号',
    });
  } else {
    for (const c of claim.cns) {
      if (ev.cns.length && !ev.cns.includes(c)) {
        issues.push({
          level: CHECK_STATUS.REJECT,
          rule: 'B',
          why: `结论中的 CNS ${c} 与资料中的编号（${ev.cns.join(',')}）不一致`,
        });
      }
    }
    for (const c of claim.ins) {
      if (ev.ins.length && !ev.ins.includes(c)) {
        issues.push({
          level: CHECK_STATUS.REJECT,
          rule: 'B',
          why: `结论中的 INS ${c} 与资料中的编号（${ev.ins.join(',')}）不一致`,
        });
      }
    }
  }

  const status = worst(issues.map((i) => i.level));
  return { status, issues };
}

// ============================================================ 规则 C：证据相关性

/** 食品语境标记 —— 强信号：命中任意一个即视为食品相关 */
const STRONG_FOOD_MARKERS = [
  '食品添加剂',
  '食品安全',
  '营养标签',
  '配料表',
  'gb 2760',
  'gb2760',
  '甜味剂',
  '增味剂',
  '膨松剂',
  '防腐剂',
  '酸度调节剂',
  '增稠剂',
  '抗结剂',
  '着色剂',
  '乳化剂',
  '稳定剂',
  '凝固剂',
  '被膜剂',
  '消泡剂',
  '护色剂',
  '漂白剂',
  '水分保持剂',
  '面粉处理剂',
  'food additive',
  'food safety',
  'food industry',
  'food science',
  'food ingredient',
  'nutrition label',
  'jecfa evaluation',
  // 正式毒理学评估的标题/章节词：这些页面即使正文出现 urine/kidney，
  // 也是在讲健康终点，不是「非食品主题」。
  'jecfa',
  'who food additives series',
  'toxicological evaluation',
  'toxicological monograph',
  'safety evaluation',
  'risk assessment',
  'dietary exposure',
  'acceptable daily intake',
  'no observed adverse effect',
  'efsa journal',
];

/** 食品语境标记 —— 弱信号：单独出现不算（如 FAO 机构名 Food and Agriculture Organization 里的 food），需两个不同弱词同时命中 */
const WEAK_FOOD_MARKERS = [
  '食品',
  'food',
  '饮料',
  'beverage',
  '焙烤',
  '烘焙',
  'baking',
  'bread',
  '饼干',
  '糕点',
  '膨松',
  '防腐',
  '酸度调节',
  '增稠',
  '抗结',
  '配料',
  'cereal',
  'snack',
  'dairy',
];

/** 兼容导出：旧测试可能引用完整清单 */
const FOOD_MARKERS = [...STRONG_FOOD_MARKERS, ...WEAK_FOOD_MARKERS];

/** 明显非食品语境标记 */
const NON_FOOD_MARKERS = [
  // urine / kidney 本身不是「非食品」证据：JECFA/EFSA 的人体观察章节
  // 经常写 urinary excretion / kidney weight。这里保留标记，
  // 但只有在「没有任何食品/正式评估语境」时才据此剔除（见 classifyRelevance）。
  '尿液疗法',
  'urine therapy',
  'topical',
  '鱼菜共生',
  'aquarium',
  'aquaculture',
  '水质',
  'wastewater',
  'water treatment',
  '牙膏',
  'toothpaste',
  '化妆品',
  'cosmetic',
  '混凝土',
  'concrete',
  '灭火',
  'fire extinguishing',
  '静脉',
  'catheter',
  '洗浴',
  'bath',
];

/**
 * 判断一份证据的主题是否与食品分析相关。
 *
 * 只做「明显不相关」的剔除，不做精细分类：
 * 权威机构对某物质的整体毒理学评价，即便不属于食品领域，对食品安全分析也可能有参考价值，
 * 所以只有「命中非食品词、且完全没有食品词」时才判 unrelated。
 *
 * 食品判定用强/弱双层标记（V6.1 教训）：FAO 机构名 "Food and Agriculture Organization"
 * 里的 "food" 曾让纯农业资料被判成食品相关。所以——
 *   - 强标记（食品添加剂 / GB 2760 / 甜味剂 / food additive…）命中 1 个就算；
 *   - 弱标记（食品 / food / 饮料 / 配料…）单独出现不算，需要 2 个不同弱词。
 *
 * @returns {{ topic: 'food_related'|'unrelated'|'unclear', reason: string }}
 */
export function classifyRelevance(source) {
  const text = `${source?.title || ''} ${source?.excerpt || ''}`.toLowerCase();

  const strongHits = STRONG_FOOD_MARKERS.filter((m) => text.includes(m.toLowerCase()));
  const weakHits = WEAK_FOOD_MARKERS.filter((m) => text.includes(m.toLowerCase()));
  const nonFoodHits = NON_FOOD_MARKERS.filter((m) => text.includes(m.toLowerCase()));

  if (strongHits.length > 0 || weakHits.length >= 2) {
    return {
      topic: 'food_related',
      reason: `命中食品语境：${[...strongHits, ...weakHits].slice(0, 3).join('/')}`,
    };
  }
  if (nonFoodHits.length > 0) {
    // 正式毒理学评估里出现 urine / kidney 是健康终点，不是「非食品主题」。
    // 只有既没有食品语境、也没有正式评估语境时，才按不相关处理。
    const formalEval =
      /(jecfa|efsa|who food additives|toxicological evaluation|risk assessment|safety evaluation|acceptable daily intake|dietary exposure)/i.test(
        text,
      );
    if (!formalEval) {
      return {
        topic: 'unrelated',
        reason: `命中非食品语境且没有食品语境：${nonFoodHits.slice(0, 3).join('/')}`,
      };
    }
    return {
      topic: 'food_related',
      reason: `正式毒理学评估中的健康终点（${nonFoodHits.slice(0, 2).join('/')}），不按非食品剔除`,
    };
  }
  return { topic: 'unclear', reason: '没有明确的食品或非食品领域标记' };
}

/**
 * 对一批证据做相关性初筛。
 * 明确无关的会被排除（不进入提示词、不进入展示来源），并记下理由。
 *
 * @returns {{ kept: Array, dropped: Array }}
 */
export function filterEvidenceByRelevance(sources = []) {
  const kept = [];
  const dropped = [];

  for (const s of sources) {
    const rel = classifyRelevance(s);
    if (rel.topic === 'unrelated') {
      dropped.push({ id: s.id, title: s.title, url: s.url, reason: rel.reason });
    } else {
      kept.push({ ...s, relevance: rel.topic });
    }
  }

  return { kept, dropped };
}

// ============================================================ 统一入口

/**
 * 对一批结论跑完三类检查。
 *
 * @param {object} p
 * @param {Array} p.claims 结论数组，每条至少含 text 与 sourceRefs
 * @param {Array} p.evidenceSet 本次全部证据（用于按 sourceRefs 取引用来源）
 * @param {string} p.ingredientName
 * @returns {Array} 每条结论附加 scientificCheck: { status, issues, checkedRules }
 */
export function validateScientificClaims({ claims = [], evidenceSet = [], ingredientName = '', aliases = [] }) {
  const byId = new Map(evidenceSet.map((s) => [s.id, s]));

  return claims.map((claim) => {
    const refs = Array.isArray(claim.sourceRefs) ? claim.sourceRefs : [];
    const cited = refs.map((r) => byId.get(r)).filter(Boolean);
    // 没有引用时用全部证据兜底，避免因为 refs 缺失就跳过检查
    const scope = cited.length > 0 ? cited : evidenceSet;

    const results = [
      checkSafetyTerm(claim.text, scope),
      checkFunctionScope(claim.text, { ingredientName, aliases, citedEvidence: scope }),
      checkIngredientIdentity(claim.text, { citedEvidence: scope }),
    ];

    const issues = results.flatMap((r) => r.issues || []);
    const status = worst(results.map((r) => r.status));

    return {
      ...claim,
      scientificCheck: { status, issues },
    };
  });
}

/**
 * 顶部成分标签的科学检查（V6.1 最终一致性修复新增）。
 *
 * 背景：identity（模型输出的分类 + 功能清单）此前直接透传到卡片顶部，
 * 完全绕过了 scientificGuard——出现过「正文结论被拒，顶部却展示同一功能」的矛盾。
 *
 * 处理规则（与正文同一套检查器、同一份证据集合，保证两处一致）：
 *   - 功能词逐个检查：有来源共现 → pass，正常保留在顶部；
 *   - review（归属不明/资料定位失败）→ 从顶部移除，移入「待核实」说明；
 *   - reject（明确错配）→ 从顶部移除，并记录移除原因；
 *   - 编号声明同样过 checkIngredientIdentity。
 *
 * 注意：checkFunctionScope 对「一个混排来源不支持、但另一个清晰来源支持」的
 * 功能会判 pass（supported 检查遍历全部证据），不会因为单一坏来源误删好功能。
 *
 * @returns {object|null} 过滤后的 identity（含 checked 元数据），identity 为空时返回 null
 */
export function checkIdentityLabel({ identity, evidenceSet = [], ingredientName = '', aliases = [] }) {
  if (!identity || (!identity.label && !identity.note && !identity.type)) return null;

  const text = `${identity.label || ''} ${identity.note || ''}`;
  const claimed = FUNCTION_TERMS.filter((f) => text.includes(f));

  const functions = claimed.map((term) => {
    const supported = evidenceSet.some((s) =>
      hasFunctionSupport(s.excerpt || '', ingredientName, term, aliases),
    );
    if (supported) return { term, status: CHECK_STATUS.PASS, why: null };

    const r = checkFunctionScope(term, { ingredientName, aliases, citedEvidence: evidenceSet });
    const issue = r.issues.find((i) => i.term === term);
    return { term, status: issue?.level || CHECK_STATUS.REVIEW, why: issue?.why || null };
  });

  const codeCheck = checkIngredientIdentity(text, { citedEvidence: evidenceSet });

  const rejectedTerms = functions.filter((f) => f.status === CHECK_STATUS.REJECT).map((f) => f.term);
  const pendingTerms = functions.filter((f) => f.status === CHECK_STATUS.REVIEW).map((f) => f.term);

  // 从顶部展示文本中移除未通过检查的功能词（reject 与 review 一并移出主标签）
  let label = String(identity.label || '');
  for (const t of [...rejectedTerms, ...pendingTerms]) {
    label = label.split(t).join('');
  }
  // 清理删除后的残留：重复顿号、空括号、失去功能词的悬空括号
  label = label
    .replace(/、{2,}/g, '、')
    .replace(/、\s*[）)]/g, '）')
    .replace(/[（(]\s*[、]/g, '（')
    .replace(/[（(]([^（）()]*)[）)]/g, (m, inner) =>
      // 括号里已没有任何功能词、且只是「中列为/包括」这类悬空引导 → 删掉整对
      FUNCTION_TERMS.some((f) => inner.includes(f)) || inner.length > 14 ? m : '',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*·\s*$/, '')
    .trim();

  // A failed function/code check must also apply to the visible classification
  // explanation. Dropping words from a sentence can reverse its meaning, so
  // omit the unreliable note in full and retain the reason in diagnostics.
  const labelCodeCheck = checkIngredientIdentity(label, { citedEvidence: evidenceSet });
  const noteCodeCheck = checkIngredientIdentity(identity.note || '', { citedEvidence: evidenceSet });
  const blockedTerms = [...rejectedTerms, ...pendingTerms];
  const noteBlocked = blockedTerms.some((term) => String(identity.note || '').includes(term)) ||
    noteCodeCheck.status !== CHECK_STATUS.PASS;
  if (labelCodeCheck.status !== CHECK_STATUS.PASS) label = '分类信息待核实';

  const overall =
    rejectedTerms.length > 0 || pendingTerms.length > 0 || codeCheck.status !== CHECK_STATUS.PASS
      ? CHECK_STATUS.REVIEW
      : CHECK_STATUS.PASS;

  return {
    type: identity.type || null,
    label,
    originalLabel: identity.label || '',
    note: noteBlocked ? null : identity.note || null,
    checked: {
      status: overall,
      functions,
      codeCheckStatus: codeCheck.status,
      codeIssues: codeCheck.issues,
      rejectedTerms,
      pendingTerms,
      pendingNote: pendingTerms.length
        ? `「${pendingTerms.join('、')}」等功能归属待核实，未计入顶部分类`
        : null,
      rejectedNote: [
        rejectedTerms.length ? `「${rejectedTerms.join('、')}」未获当前资料支持，已从顶部分类中移除` : '',
        noteBlocked ? '分类依据含未通过检查的内容，已隐藏该说明' : '',
        codeCheck.status !== CHECK_STATUS.PASS ? '分类中的 CNS/INS 编号未通过检查，已移除相关展示' : '',
      ].filter(Boolean).join('；') || null,
    },
  };
}

/**
 * 检测「本次没检索到」被写成「科学上不存在」的过度断言（确定性正则，保守提示）。
 * 例：「没有相关科学资料」「无任何研究」——检索波动很常见，这种断言经不起下一轮搜索。
 * 返回 true 时调用方应记入 notes 提示复核，不直接拒绝展示。
 */
export function hasUnfoundedAbsenceClaim(text) {
  const s = String(text || '');
  const strong = s.match(/(没有|无|不存在)(任何)?(相关)?(的)?(科学|权威)?(研究|资料|文献|证据)/);
  if (!strong) return false;
  // 带了「目前检索到 / 本次 / 尚未」这类限定的是正确表述
  const window = s.slice(Math.max(0, (strong.index || 0) - 20), (strong.index || 0) + strong[0].length + 20);
  return !/检索|本次|尚未|暂未|目前/.test(window);
}

/** 把检查结果拆成「通过 / 需复核 / 拒绝」三组 */
export function partitionByScienceCheck(claims = []) {
  const passed = [];
  const review = [];
  const rejected = [];

  for (const c of claims) {
    const st = c.scientificCheck?.status || CHECK_STATUS.PASS;
    if (st === CHECK_STATUS.REJECT) rejected.push(c);
    else if (st === CHECK_STATUS.REVIEW) review.push(c);
    else passed.push(c);
  }

  return { passed, review, rejected };
}

/** 检查器能力自述，供报告与界面文案使用 */
export const GUARD_CAPABILITY_NOTE =
  '程序可核对：来源编号与摘录是否存在、CNS/INS 编号是否一致、安全术语是否被扩大解释、技术用途是否在引用的资料中与成分直接共现、来源主题是否明显偏离食品。程序不能核对：论述在科学上是否成立、数值是否正确表述了原文语境、文献结论是否可外推到具体产品。';
