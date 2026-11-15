/**
 * 复合配料解析（V2.2）。
 *
 * 包装上常见两种结构：
 *   食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、柠檬酸）
 *   复合调味料（A、B（B1、B2）、C）
 *
 * 这一层只做「按括号和分隔符还原层次」，不做任何成分推断：
 * - 只有括号在原文里完整出现，才拆子项；
 * - 括号内没有分隔符、且父级不是类别词时，视为注释（如「柠檬酸（酸度调节剂）」），不拆；
 * - 括号不闭合、括号后还有文字、父级为空，一律保留原文，标记结构待核对；
 * - 不根据常识补充任何未写出的子配料。
 */

/** 常见的「类别型」父级：即使括号内只有一项，也按子配料处理 */
const GROUP_WORDS = [
  '食品添加剂',
  '复配食品添加剂',
  '添加剂',
  '复合调味料',
  '复配调味料',
  '调味料',
  '香辛料',
  '食用香精',
  '食用香料',
  '食品用香精',
  '食品用香料',
  '着色剂',
  '防腐剂',
  '甜味剂',
  '乳化剂',
  '增稠剂',
  '酸度调节剂',
  '抗氧化剂',
  '膨松剂',
  '稳定剂',
  '抗结剂',
  '水分保持剂',
  '漂白剂',
  '护色剂',
  '酶制剂',
  '增味剂',
  '面粉处理剂',
  '被膜剂',
  '消泡剂',
  '凝固剂',
  '加工助剂',
  '营养强化剂',
  '食用色素',
];

const GROUP_RE = new RegExp(`^(?:${GROUP_WORDS.join('|')})$`);

const OPENERS = new Set(['（', '(']);
const CLOSERS = new Set(['）', ')']);

function isSeparator(ch) {
  return ch === '、' || ch === ',' || ch === '，' || ch === ';' || ch === '；';
}

/**
 * 按顶层分隔符切分，括号内的分隔符不切。
 * @returns {{parts:string[], balanced:boolean}}
 */
export function splitTopLevel(text) {
  const s = String(text || '');
  const parts = [];
  let buf = '';
  let depth = 0;

  for (const ch of s) {
    if (OPENERS.has(ch)) {
      depth += 1;
      buf += ch;
      continue;
    }
    if (CLOSERS.has(ch)) {
      if (depth > 0) depth -= 1;
      buf += ch;
      continue;
    }
    if (depth === 0 && isSeparator(ch)) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = '';
      continue;
    }
    buf += ch;
  }

  const tail = buf.trim();
  if (tail) parts.push(tail);
  return { parts, balanced: depth === 0 };
}

/** 找到与第一个开括号配对的闭括号；找不到返回 -1 */
function findClose(s, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < s.length; i += 1) {
    if (OPENERS.has(s[i])) depth += 1;
    else if (CLOSERS.has(s[i])) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function normalizeSpace(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析单个配料写法。
 *
 * @returns {{
 *   name: string,            // 用于匹配/展示的名称（去掉了成功拆出的括号）
 *   raw: string,             // 原文
 *   children: Array,         // 子配料，元素结构同本返回值
 *   note: string|null,       // 结构待核对的原因
 *   isGroup: boolean         // 父级是否是类别词
 * }}
 */
export function parseIngredientName(rawInput) {
  const raw = normalizeSpace(rawInput);
  const base = { name: raw, raw, children: [], note: null, isGroup: false };
  if (!raw) return base;

  const openIndex = raw.search(/[（(]/);
  if (openIndex <= 0) return base;

  const closeIndex = findClose(raw, openIndex);
  if (closeIndex === -1) {
    return { ...base, note: '括号没有闭合，保留原文待核对' };
  }
  if (raw.slice(closeIndex + 1).trim()) {
    return { ...base, note: '括号后还有文字，保留原文待核对' };
  }

  const parent = raw.slice(0, openIndex).trim();
  const inside = raw.slice(openIndex + 1, closeIndex).trim();
  if (!parent || !inside) return base;

  const isGroup = GROUP_RE.test(parent.replace(/\s+/g, ''));
  const { parts, balanced } = splitTopLevel(inside);

  if (!balanced) {
    return { ...base, note: '括号内的层次不完整，保留原文待核对' };
  }
  // 单一项且父级不是类别词：更像注释/说明（柠檬酸（酸度调节剂）），不拆
  if (parts.length <= 1 && !isGroup) return base;
  if (parts.length === 0) return base;

  const children = parts.map((p) => {
    const sub = parseIngredientName(p);
    // 子项自身如果还能拆，保留它的子结构；否则原样保留整段写法
    return {
      name: sub.children.length ? sub.name : sub.raw,
      raw: sub.raw,
      children: sub.children,
      note: sub.note,
    };
  });

  return {
    name: parent,
    raw,
    children,
    note: null,
    isGroup,
  };
}

/**
 * 解析整段配料原文。
 * 只在结构完整时拆子项；任何异常都退回「一段原文」。
 *
 * @returns {{items:Array, balanced:boolean}}
 */
export function parseIngredientText(text) {
  const s = normalizeSpace(text)
    .replace(/^配\s*料\s*表?\s*[:：]\s*/, '')
    .replace(/[。.]\s*$/, '');
  if (!s) return { items: [], balanced: true };

  const { parts, balanced } = splitTopLevel(s);
  const items = parts.map((p) => {
    const parsed = parseIngredientName(p);
    return {
      name: parsed.name,
      raw: parsed.raw,
      children: parsed.children,
      note: parsed.note,
    };
  });
  return { items, balanced };
}

/** 把一条配料（含子项）展开成名称列表，供话术规则/检索上下文使用 */
export function flattenIngredientNames(items = []) {
  const out = [];
  const walk = (it) => {
    if (it?.name) out.push(it.name);
    for (const c of it?.children || []) walk(c);
  };
  for (const it of items) walk(it);
  return out;
}

/** 从一条配料里收集所有「具体成员」；没有子项时返回自身 */
export function leafIngredients(item) {
  if (!item) return [];
  if (!item.children?.length) return [item];
  return item.children.flatMap((c) => leafIngredients(c));
}
