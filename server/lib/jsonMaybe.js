/**
 * 模型返回的「类 JSON」文本解析 + 轻量结构校验。
 * JSON mode 并不保证一定合法（官方文档明确提示 content 可能只剩空格），
 * 所以这一层必须假设输入是不可靠的。
 */

/**
 * 把模型返回的 content 统一成字符串（V2.3）。
 *
 * 有的 OpenAI 兼容实现会把 content 返回成分段数组：
 *   [{ type: 'text', text: '{"a":1}' }]
 * 旧代码只接受 string，遇到数组会直接判定为「空内容」——
 * 同一张图重试一次又变回 string，就出现「第一次失败、第二次成功」。
 */
export function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p.text === 'string') return p.text;
        return '';
      })
      .join('');
  }
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }
  return '';
}

/**
 * 找出文本里所有「括号配平」的片段（忽略字符串内部的括号）。
 * 用于模型在 JSON 之后又补了一段说明、或返回两个对象时逐个尝试解析。
 */
export function balancedSlices(text) {
  const s = String(text || '');
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

/** 从可能带 markdown 围栏 / 前后废话的文本里抠出 JSON */
export function extractJson(text) {
  const raw = normalizeContent(text);
  if (!raw.trim()) {
    return { ok: false, reason: 'EMPTY_CONTENT', value: null };
  }

  let s = raw.trim();

  // 去掉 ```json ... ``` 围栏
  const fence = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();

  try {
    return { ok: true, reason: null, value: JSON.parse(s) };
  } catch (e1) {
    // 退化策略一：逐个尝试「括号配平」的片段。
    // 比「第一个 { 到最后一个 }」可靠：模型在 JSON 之后补一段解释、
    // 或返回了两个对象时，后者会把两段拼在一起，必然解析失败。
    const slices = balancedSlices(s);
    let firstError = null;
    for (const slice of slices) {
      try {
        const value = JSON.parse(slice);
        if (value && typeof value === 'object') {
          return { ok: true, reason: 'TRIMMED_BALANCED', value };
        }
      } catch (e) {
        if (!firstError) firstError = e;
      }
    }

    // 退化策略二（保留旧行为兜底）：第一个 { 到最后一个 }
    const firstBrace = s.search(/[{[]/);
    const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const sliced = s.slice(firstBrace, lastBrace + 1);
      try {
        return { ok: true, reason: 'TRIMMED', value: JSON.parse(sliced) };
      } catch (e2) {
        return { ok: false, reason: 'INVALID_JSON', detail: e2.message, value: null };
      }
    }
    return {
      ok: false,
      reason: 'INVALID_JSON',
      detail: (firstError || e1).message,
      value: null,
    };
  }
}

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  'number[]': (v) => Array.isArray(v) && v.every((x) => typeof x === 'number'),
  'string[]': (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  'string|null': (v) => v === null || typeof v === 'string',
  any: () => true,
};

/**
 * 校验必需字段是否存在 + 类型是否正确。
 * @param {any} obj
 * @param {Record<string,string>} schema 字段名 -> 类型字符串
 * @returns {{valid:boolean, missing:string[], wrongType:{field:string,expected:string,actual:string}[], extra:string[]}}
 */
export function validateStructure(obj, schema) {
  const missing = [];
  const wrongType = [];
  const extra = [];

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      valid: false,
      missing: Object.keys(schema),
      wrongType: [{ field: '(root)', expected: 'object', actual: Array.isArray(obj) ? 'array' : typeof obj }],
      extra: [],
    };
  }

  for (const [field, expected] of Object.entries(schema)) {
    if (!(field in obj) || obj[field] === undefined) {
      missing.push(field);
      continue;
    }
    const check = TYPE_CHECKS[expected] || TYPE_CHECKS.any;
    if (!check(obj[field])) {
      const actual = Array.isArray(obj[field]) ? 'array' : obj[field] === null ? 'null' : typeof obj[field];
      wrongType.push({ field, expected, actual });
    }
  }

  for (const k of Object.keys(obj)) if (!(k in schema)) extra.push(k);

  return { valid: missing.length === 0 && wrongType.length === 0, missing, wrongType, extra };
}

/**
 * 从被截断的 JSON 文本里恢复「已经完整写出」的字段（V2.2）。
 *
 * 只做一件事：按 JSON 语法扫描，遇到不完整的字符串 / 数组元素 / 对象字段就停，
 * 把此前已经闭合的内容原样返回。它不会补齐引号、不会猜缺失字段，
 * 也不会把一个写到一半的配料名当成完整配料。
 *
 * @returns {{
 *   ok: boolean,
 *   complete: boolean,
 *   value: object|null,
 *   recoveredKeys: string[],
 *   truncatedKey: string|null,
 *   reason?: string
 * }}
 */
export function recoverPartialJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, complete: false, value: null, recoveredKeys: [], truncatedKey: null, reason: 'EMPTY_CONTENT' };
  }

  let s = text.trim();
  const fence = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();

  const start = s.indexOf('{');
  if (start === -1) {
    return { ok: false, complete: false, value: null, recoveredKeys: [], truncatedKey: null, reason: 'NO_OBJECT' };
  }

  const scanned = scanObject(s, start);
  const value = scanned?.value && typeof scanned.value === 'object' ? scanned.value : null;
  const keys = value ? Object.keys(value).filter((k) => value[k] !== undefined) : [];

  if (!value || keys.length === 0) {
    return {
      ok: false,
      complete: false,
      value: null,
      recoveredKeys: [],
      truncatedKey: scanned?.truncatedKey ?? null,
      reason: 'NO_RECOVERABLE_FIELDS',
    };
  }

  return {
    ok: true,
    complete: Boolean(scanned.complete),
    value,
    recoveredKeys: keys,
    truncatedKey: scanned.truncatedKey ?? null,
  };
}

function skipWs(s, i) {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j += 1;
  return j;
}

function scanString(s, i) {
  if (s[i] !== '"') return { complete: false, value: undefined, end: i };
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') {
      j += 2;
      continue;
    }
    if (s[j] === '"') {
      try {
        return { complete: true, value: JSON.parse(s.slice(i, j + 1)), end: j + 1 };
      } catch {
        return { complete: false, value: undefined, end: j + 1 };
      }
    }
    j += 1;
  }
  return { complete: false, value: undefined, end: j };
}

function scanPrimitive(s, i) {
  const rest = s.slice(i);
  const m = rest.match(/^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!m) return { complete: false, value: undefined, end: i };
  let value;
  if (m[1] === 'true') value = true;
  else if (m[1] === 'false') value = false;
  else if (m[1] === 'null') value = null;
  else value = Number(m[1]);
  return { complete: true, value, end: i + m[1].length };
}

function scanValue(s, i) {
  const j = skipWs(s, i);
  if (s[j] === '"') return scanString(s, j);
  if (s[j] === '[') return scanArray(s, j);
  if (s[j] === '{') return scanObject(s, j);
  return scanPrimitive(s, j);
}

function scanArray(s, i) {
  const items = [];
  let j = skipWs(s, i + 1);
  if (s[j] === ']') return { complete: true, value: items, end: j + 1 };

  while (j < s.length) {
    const v = scanValue(s, j);
    if (!v.complete) {
      // 不完整的元素（例如只写到一半的配料对象）不放进结果
      return { complete: false, value: items, end: v.end, truncated: true };
    }
    items.push(v.value);
    j = skipWs(s, v.end);
    if (s[j] === ',') {
      j = skipWs(s, j + 1);
      continue;
    }
    if (s[j] === ']') return { complete: true, value: items, end: j + 1 };
    return { complete: false, value: items, end: j, truncated: true };
  }
  return { complete: false, value: items, end: j, truncated: true };
}

function scanObject(s, i) {
  const obj = {};
  let j = skipWs(s, i + 1);
  if (s[j] === '}') return { complete: true, value: obj, end: j + 1 };

  while (j < s.length) {
    const key = scanString(s, j);
    if (!key.complete) return { complete: false, value: obj, end: key.end };
    j = skipWs(s, key.end);
    if (s[j] !== ':') return { complete: false, value: obj, end: j };
    j = skipWs(s, j + 1);

    const v = scanValue(s, j);
    if (!v.complete) {
      // 对象值可以保留已经闭合的子字段（例如 nutrition 只写到一半）
      if (v.value && typeof v.value === 'object') {
        const hasContent = Array.isArray(v.value)
          ? v.value.length > 0
          : Object.keys(v.value).length > 0;
        if (hasContent) obj[key.value] = v.value;
      }
      return { complete: false, value: obj, end: v.end, truncatedKey: key.value };
    }

    obj[key.value] = v.value;
    j = skipWs(s, v.end);
    if (s[j] === ',') {
      j = skipWs(s, j + 1);
      continue;
    }
    if (s[j] === '}') return { complete: true, value: obj, end: j + 1 };
    return { complete: false, value: obj, end: j };
  }
  return { complete: false, value: obj, end: j };
}
