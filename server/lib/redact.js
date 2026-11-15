/**
 * 脱敏工具：任何要写日志、写文件、返回给前端的上游错误文本，
 * 都必须先过一遍这里，防止 API Key 顺着错误信息泄漏。
 *
 * ⚠️ 踩过的坑（第二阶段实测）：这里原本把递归深度限制在 6 层，
 * 结果视觉识别返回的 parsed.nutrition.items[0].name 正好在第 7 层，
 * 被替换成了 "[depth-limit]"，前端拿不到营养素名称和数值，整页空白。
 * 教训：脱敏只能改「值」，不能因为层级深就丢掉结构。
 * 现在的做法是：深度阈值放到 24 层，并且用 WeakSet 防循环引用，
 * 保证真实数据结构（一般不超过 10 层）永远不被破坏。
 */

const PATTERNS = [
  // sk- 开头的各类密钥
  [/sk-[A-Za-z0-9_\-]{6,}/g, 'sk-***REDACTED***'],
  // Bearer xxx
  [/(Bearer\s+)[A-Za-z0-9_\-.=]{6,}/gi, '$1***REDACTED***'],
  // 常见的 key=xxx 查询参数
  [/((?:api[_-]?key|access[_-]?token|token)=)[^&\s"']{6,}/gi, '$1***REDACTED***'],
];

const MAX_DEPTH = 24;

export function redactText(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** 深度脱敏：对象 / 数组 / 字符串都能处理 */
export function redact(input, depth = 0, seen = new WeakSet()) {
  if (typeof input === 'string') return redactText(input);
  if (typeof input !== 'object' || input === null) return input;

  if (seen.has(input)) return '[circular]';
  if (depth > MAX_DEPTH) return '[too-deep]';
  seen.add(input);

  // Track only ancestors, not every previously visited object. Shared evidence
  // appears in sources, brief and sections without forming a circular reference.
  try {
    if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1, seen));

    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (/^(authorization|api[_-]?key)$/i.test(k)) {
        out[k] = '***REDACTED***';
      } else {
        out[k] = redact(v, depth + 1, seen);
      }
    }
    return out;
  } finally {
    seen.delete(input);
  }
}
