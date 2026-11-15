/**
 * 成分匹配：把配料表上的一个名称，对应到知识库条目。
 *
 * 核心约束（第四阶段最容易出错的地方）：
 * 绝不做「包含」匹配。如果写成 name.includes('蔗糖')，
 * 「三氯蔗糖」就会被当成「蔗糖」，这是典型的假阳性。
 *
 * 所以这里的策略是：规范化之后做**全等**匹配，
 * 只有括号结构能拆分时才分段匹配，其余一律判为未知。
 */

import { INGREDIENT_KNOWLEDGE, CATEGORY_TYPES } from './knowledge.js';
import { BASIC_INGREDIENTS } from './basics.js';
import { resolveSources } from './sources.js';

export { CATEGORY_TYPES };
export { INGREDIENT_KNOWLEDGE, BASIC_INGREDIENTS };

/**
 * 完整成分索引 = 第四阶段的深度条目 + V5.2 的基础配料条目。
 *
 * 为什么要合并成一个索引：匹配逻辑只应该有一份。
 * 如果基础配料另走一套匹配，就会出现「三氯蔗糖」匹配到深度条目、
 * 「二氧化碳」匹配到基础条目，两套规则各判各的，早晚不一致。
 */
export const ALL_INGREDIENTS = [...INGREDIENT_KNOWLEDGE, ...BASIC_INGREDIENTS];

/** 统一写法：全角转半角、去空白、小写、去首尾标点 */
export function normalizeName(input) {
  let s = String(input || '');
  // 全角字符转半角（含全角括号、全角逗号）
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/\u3000/g, '');
  s = s.replace(/\s+/g, '');
  s = s.toLowerCase();
  s = s.replace(/^[、,;:.\-·]+/, '').replace(/[、,;:.\-·]+$/, '');
  return s;
}

/** 预建索引：规范化名称 -> 条目 */
const EXACT_INDEX = (() => {
  const map = new Map();
  for (const entry of ALL_INGREDIENTS) {
    const keys = [entry.canonicalName, ...(entry.aliases || [])];
    for (const k of keys) {
      const n = normalizeName(k);
      if (n && !map.has(n)) map.set(n, { entry, alias: k });
    }
  }
  return map;
})();

/** 常见的前缀，匹配前先剥掉 */
const PREFIXES = ['食品添加剂', '添加剂', '复配食品添加剂', '复配'];

function stripPrefix(norm) {
  for (const p of PREFIXES) {
    const pn = normalizeName(p);
    if (norm.startsWith(pn) && norm.length > pn.length) {
      return norm.slice(pn.length).replace(/^[（(]/, '').replace(/[）)]$/, '');
    }
  }
  return null;
}

/**
 * 主匹配函数。
 * @returns {{
 *   status: 'matched'|'unknown'|'composite',
 *   entry: object|null,
 *   matchedName: string|null,
 *   matchedBy: 'canonical'|'alias'|'parenthesis'|null,
 *   input: string,
 *   normalized: string,
 *   note: string|null
 * }}
 */
export function matchIngredient(rawName) {
  const input = String(rawName || '').trim();
  const base = {
    status: 'unknown',
    entry: null,
    matchedName: null,
    matchedBy: null,
    input,
    normalized: normalizeName(input),
    note: null,
  };

  if (!input) {
    return { ...base, note: '配料名称为空' };
  }

  const norm = base.normalized;

  // 1) 整体全等
  const direct = EXACT_INDEX.get(norm);
  if (direct) {
    return {
      ...base,
      status: 'matched',
      entry: direct.entry,
      matchedName: direct.entry.canonicalName,
      matchedBy: normalizeName(direct.entry.canonicalName) === norm ? 'canonical' : 'alias',
    };
  }

  // 2) 剥掉「食品添加剂」之类前缀后再试
  const stripped = stripPrefix(norm);
  if (stripped) {
    const hit = EXACT_INDEX.get(stripped);
    if (hit) {
      return {
        ...base,
        status: 'matched',
        entry: hit.entry,
        matchedName: hit.entry.canonicalName,
        matchedBy: 'canonical',
      };
    }
  }

  // 3) 括号结构：「防腐剂（山梨酸钾）」「山梨酸钾（防腐剂）」
  const paren = norm.match(/^(.+?)[（(](.+?)[）)]$/);
  if (paren) {
    const outside = paren[1].trim();
    const inside = paren[2].trim();

    // 括号内是多个物质 -> 复合配料，无法单一匹配
    if (/[、,;+]/.test(inside)) {
      return {
        ...base,
        status: 'composite',
        note: '括号内是多个成分，属于复合配料，无法对应单个知识条目',
      };
    }

    // 先试括号内（通常括号内才是具体物质名）
    const inner = EXACT_INDEX.get(inside);
    if (inner) {
      return {
        ...base,
        status: 'matched',
        entry: inner.entry,
        matchedName: inner.entry.canonicalName,
        matchedBy: 'parenthesis',
      };
    }
    // 再试括号外
    const outer = EXACT_INDEX.get(outside);
    if (outer) {
      return {
        ...base,
        status: 'matched',
        entry: outer.entry,
        matchedName: outer.entry.canonicalName,
        matchedBy: 'parenthesis',
      };
    }
  }

  // 4) 到此为止 —— 不做任何模糊/包含匹配
  return base;
}

/**
 * 批量分析一份 FoodRecord 的配料。
 * 注意：直接读 record.ingredients，用户改过的数据会立即反映。
 */
export function analyzeIngredients(record) {
  const items = record?.ingredients?.items || [];
  const results = items.map((it) => {
    // 子配料是独立可点的成分；groupName 让抽屉知道「它被列在哪个类别下」
    const children = (it.children || []).map((c) => ({
      ingredient: c,
      match: {
        ...matchIngredient(c.name),
        groupName: it.name || null,
        groupRaw: it.raw || null,
      },
    }));
    return {
      ingredient: it,
      match: matchIngredient(it.name),
      children,
    };
  });

  // 有子项的父级本身通常只是类别标题（食品添加剂、复合调味料），
  // 覆盖率按真正的成员算，不让「食品添加剂」四个字拉低或抬高统计。
  const leaves = results.flatMap((r) => (r.children.length ? r.children : [r]));
  const matched = leaves.filter((r) => r.match.status === 'matched').length;
  const unknown = leaves.filter((r) => r.match.status === 'unknown').length;
  const composite = leaves.filter((r) => r.match.status === 'composite').length;

  return {
    items: results,
    summary: {
      total: leaves.length,
      matched,
      unknown,
      composite,
      groups: results.filter((r) => r.children.length).length,
      coverage: leaves.length ? Math.round((matched / leaves.length) * 100) : 0,
    },
  };
}

/** 组装一条完整的成分卡数据（含来源、分类标签、待完善提示） */
export function buildIngredientCard(match) {
  if (!match || match.status !== 'matched' || !match.entry) return null;
  const e = match.entry;
  return {
    id: e.id,
    name: e.canonicalName,
    enteredName: match.input,
    matchedBy: match.matchedBy,
    categoryType: e.categoryType,
    categoryLabel: e.categoryLabel,
    categoryMeta: CATEGORY_TYPES[e.categoryType] || CATEGORY_TYPES.unknown,
    functions: e.functions || [],
    codes: e.codes || {},

    // ---- V5.2 简明三段：默认展示的内容 ----
    brief: e.brief || null,
    briefNote: e.briefNote || null,

    // ---- 深入版内容（基础配料条目可能没有） ----
    whatIsIt: e.whatIsIt || null,
    whyUsed: e.whyUsed || null,
    misconceptions: (e.misconceptions || []).map((m) => ({
      ...m,
      sources: resolveSources(m.sourceIds),
    })),
    safetyPrinciples: e.safetyPrinciples || null,
    limits: e.limits || null,

    /** 这个条目有没有「深入版」可展开的内容 */
    hasDeep: Boolean(e.whatIsIt || e.misconceptions?.length || e.safetyPrinciples),

    verification: e.verification,
    verificationNote: e.verificationNote || null,
    sources: resolveSources(e.sourceIds),
  };
}

/** 知识库统计，用于页面显示覆盖度 */
export function knowledgeStats() {
  const total = ALL_INGREDIENTS.length;
  const deep = INGREDIENT_KNOWLEDGE.length;
  const verified = ALL_INGREDIENTS.filter((e) => e.verification === 'verified').length;
  const basics = ALL_INGREDIENTS.filter((e) => e.verification === 'basics').length;
  const byType = {};
  for (const e of ALL_INGREDIENTS) {
    byType[e.categoryType] = (byType[e.categoryType] || 0) + 1;
  }
  return { total, deep, basics, verified, partial: total - verified - basics, byType };
}
