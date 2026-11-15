import { randomBytes } from 'node:crypto';
import { deepseekKey, currentCredentials } from '../lib/requestCredentials.js';
import { config } from '../config.js';
import { postJson, assertUpstreamOk, ApiError } from '../lib/upstream.js';
import { extractJson, validateStructure, recoverPartialJson, normalizeContent } from '../lib/jsonMaybe.js';
import { redact } from '../lib/redact.js';
import { prepareImage } from '../lib/imagePrep.js';
import { PACKAGE_SCHEMA, SYSTEM_PROMPT, USER_PROMPT } from '../lib/packagePrompt.js';
import { parseIngredientText } from '../../src/domain/ingredientStructure.js';
import { appendVisionDiagnostic } from '../lib/visionLog.js';

/**
 * 统一的视觉识别层：同一份 prompt、同一套输出结构，两种模型。
 *
 * mimo           —— 小米 MiMo，OpenAI 兼容 /chat/completions，用 max_completion_tokens
 * deepseek-vision —— DeepSeek flash，同样是 OpenAI 兼容，但用 max_tokens，且支持 detail 字段
 *
 * 注意：这里刻意不复用第一阶段的 providers/mimo.js。
 * 第一阶段那个是「验证接口能不能通」，prompt 已经跑过真实数据；
 * 这里是「两个模型公平对比 + 正式产品用」，prompt 必须完全一致。
 * 两者互不影响，第一阶段测试台仍然用它自己那份。
 */

export const VISION_PROVIDERS = {
  mimo: {
    id: 'mimo',
    label: '小米 MiMo',
    shortLabel: 'MiMo',
    getModel: () => config.mimo.visionModel,
    getEndpoint: () => `${config.mimo.baseUrl}/chat/completions`,
    getApiKey: () => config.mimo.apiKey,
    // 官网价目：¥1.00 / 百万输入，¥2.00 / 百万输出（mimo-v2.6-flash）
    pricing: { currency: 'CNY', inputPerM: 1.0, outputPerM: 2.0, note: 'mimo-v2.6-flash 官方价目表' },
  },
  'deepseek-vision': {
    id: 'deepseek-vision',
    label: 'DeepSeek Vision',
    shortLabel: 'DeepSeek',
    getModel: () => config.deepseek.chatModel,
    getEndpoint: () => `${config.deepseek.baseUrl}/chat/completions`,
    getApiKey: () => deepseekKey(config.deepseek.apiKey),
    // 官网价目：高峰 $0.30 / $1.20，非高峰减半。此处按高峰价做上限估算
    pricing: { currency: 'USD', inputPerM: 0.3, outputPerM: 1.2, note: 'deepseek-flash 高峰价上限估算' },
  },
};

export const VISION_PROVIDER_IDS = Object.keys(VISION_PROVIDERS);

/**
 * 正式产品默认使用的视觉模型。
 *
 * 第三阶段切换到 DeepSeek Vision，理由是第二阶段 5 张真实包装实测：
 * 平均耗时 10.5s（MiMo 40.6s），输出结构更干净，单次成本更低。
 *
 * 切换模型只改这一行，不要去改 UploadPage 或复制一套识别代码。
 * MiMo 仍然保留，供 #/lab 测试台和 #/lab/vision 对比工具独立使用。
 */
export const DEFAULT_PRODUCT_PROVIDER = 'deepseek-vision';

/**
 * 单次识别的输出上限（两个模型共用同一个数值，便于对比）。
 * 4096 的由来与「为什么本版不上调」写在请求体附近的注释里。
 */
export const VISION_MAX_TOKENS = 4096;

/** 用指定模型识别一张包装照片 */
export async function extractPackage({ provider, imageBase64, mimeType, model }) {
  const cfg = VISION_PROVIDERS[provider];
  if (!cfg) {
    throw new ApiError({
      code: 'UNKNOWN_VISION_PROVIDER',
      httpStatus: 400,
      message: `未知的视觉模型：${provider}`,
    });
  }

  const apiKey = cfg.getApiKey();
  if (!apiKey) {
    throw new ApiError({
      code: 'MISSING_API_KEY',
      httpStatus: 400,
      message: `服务端未配置 ${cfg.label} 的 API Key，请在 .env 中填写后重启`,
    });
  }

  // 统一预处理：两个模型拿到完全相同的图片字节
  let prepared;
  try {
    prepared = await prepareImage({ base64: imageBase64, mimeType });
  } catch (e) {
    // 图片本身有问题属于「用户输入错误」，应当 400，而不是 500
    throw new ApiError({
      code: e.code || 'IMAGE_ERROR',
      httpStatus: 400,
      message: e.message || '图片无法处理',
    });
  }
  const usedModel = model || cfg.getModel();
  const endpoint = cfg.getEndpoint();

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${prepared.mimeType};base64,${prepared.base64}` } },
    { type: 'text', text: USER_PROMPT },
  ];

  const baseBody = {
    model: usedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
  };

  // 两家对输出上限的参数名不同，其余保持一致。
  //
  // V2.3 验收修复：输出结构已从「原文 + 配料对象数组」压缩为「原文一次」，
  // 同类包装的实测（Mock 回放）输出长度从 ~4.3k 字符降到 ~2.4k 字符。
  // 因此 4096 保持不变 —— 这个值是上限，不是费用；只有当模型真的写出更多
  // token 时才会产生费用。上调上限会让「模型啰嗦」这一失败模式重新变得便宜，
  // 反而增加截断与费用风险。是否上调需要单独决策，本版不动。
  const body =
    provider === 'mimo'
      ? { ...baseBody, max_completion_tokens: VISION_MAX_TOKENS }
      : { ...baseBody, max_tokens: VISION_MAX_TOKENS };

  const startedAt = Date.now();
  // 每次识别一个短编号：用户报错时只需说这 6 位，运维就能对上服务端日志。
  const requestId = randomBytes(3).toString('hex').toUpperCase();

  let res;
  try {
    res = await postJson(endpoint, { apiKey, body, timeoutMs: 120000 });
  } catch (e) {
    logVisionDiagnostics({
      requestId,
      provider: cfg.id,
      stage: 'upstream_request',
      httpStatus: e?.httpStatus ?? null,
      code: e?.code ?? 'UPSTREAM_ERROR',
      durationMs: Date.now() - startedAt,
    });
    // 把短编号挂到错误上：前端只需展示它，反馈时能对上服务端日志
    if (e && typeof e === 'object') e.requestId = requestId;
    throw e;
  }

  assertUpstreamOkWithStage(res, { provider: cfg.label, endpoint, requestId });

  const choice = res.data?.choices?.[0];
  const rawContent = choice?.message?.content;
  const content = normalizeContent(rawContent);
  const interpreted = interpretVisionContent(content);
  const { parse, structure, recovery, parsedValue, recoveredKeys } = interpreted;

  const diagnostics = buildVisionDiagnostics({
    requestId,
    provider: cfg.id,
    res,
    choice,
    rawContent,
    content,
    interpreted,
    maxTokens: VISION_MAX_TOKENS,
    durationMs: res.durationMs,
  });

  logVisionDiagnostics(diagnostics);

  return {
    provider: cfg.id,
    providerLabel: cfg.label,
    model: res.data?.model || usedModel,
    endpoint,
    image: {
      width: prepared.width,
      height: prepared.height,
      originalBytes: prepared.originalBytes,
      processedBytes: prepared.processedBytes,
      compressed: prepared.compressed,
      note: prepared.note,
    },
    requestId,
    diagnostics,
    httpStatus: res.status,
    durationMs: res.durationMs,
    startedAt: new Date(startedAt).toISOString(),
    finishReason: choice?.finish_reason ?? null,
    usage: res.data?.usage ?? null,
    costEstimate: estimateCost(res.data?.usage, cfg.pricing),
    jsonParse: { ok: parse.ok, reason: parse.reason, detail: parse.detail ?? null },
    recovery: recovery
      ? {
          used: Boolean(recovery.ok),
          complete: Boolean(recovery.complete),
          recoveredKeys,
          truncatedKey: recovery.truncatedKey ?? null,
          missing: interpreted.missingFields,
          reason: recovery.reason ?? null,
        }
      : null,
    /** 截断时仍缺哪些字段（中文标签由前端映射，不在这里拼文案） */
    partialMissing: interpreted.partial ? interpreted.missingFields : [],
    /** 由 ingredients_text 确定性解析出的配料项数量（不是模型给的） */
    derivedIngredients: interpreted.derivedIngredients,
    partial: interpreted.partial,
    structure,
    parsed: parsedValue,
    content,
    raw: redact(res.data),
  };
}

/**
 * assertUpstreamOk 的薄包装：只用于记录「请求到达上游但状态码异常」这一阶段。
 * 不改变原有错误类型与文案。
 */
function assertUpstreamOkWithStage(res, meta) {
  try {
    assertUpstreamOk(res, meta);
  } catch (e) {
    logVisionDiagnostics({
      requestId: meta.requestId ?? null,
      provider: meta.provider,
      stage: 'upstream_status',
      httpStatus: res?.status ?? null,
      code: e?.code ?? 'UPSTREAM_ERROR',
    });
    if (e && typeof e === 'object' && !e.requestId) e.requestId = meta.requestId ?? null;
    throw e;
  }
}

/**
 * 结构化诊断日志：只有编号、状态分类、长度、解析状态。
 * 绝不包含 API Key、Authorization、图片、模型原文或完整食品记录。
 *
 * 同时写 stdout 与 runtime-output/vision-diagnostics.jsonl：
 * 只写 stdout 的话，开发服务器一重启，用户报来的编号就再也查不到了。
 */
function logVisionDiagnostics(d) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[vision] ${JSON.stringify(d)}`);
  } catch {
    /* 日志失败不影响识别 */
  }
  appendVisionDiagnostic(d);
}

/**
 * 结构化诊断（纯函数，可离线测试）。
 *
 * 只包含：编号、阶段、状态码、finish_reason、内容长度/形态、解析与结构校验结果、
 * 恢复了哪些字段、最终进入哪条前端分支。
 * 绝不包含：API Key、Authorization、图片或 base64、模型原文、完整食品记录。
 */
export function buildVisionDiagnostics({
  requestId,
  provider,
  res,
  choice,
  rawContent,
  content,
  interpreted,
  maxTokens = null,
  durationMs,
} = {}) {
  const { parse, structure, recovery, parsedValue, recoveredKeys, missingFields } = interpreted || {};
  const branch = !parsedValue ? 'unusable' : interpreted?.partial ? 'recovered_partial' : 'parsed_full';

  return {
    requestId,
    provider,
    stage: 'interpreted',
    httpStatus: res?.status ?? null,
    finishReason: choice?.finish_reason ?? null,
    maxTokens,
    // 只记长度与形态，不记原文、不记图片
    contentType: Array.isArray(rawContent) ? 'array' : typeof rawContent,
    contentLength: String(content || '').length,
    json: {
      ok: Boolean(parse?.ok),
      reason: parse?.reason ?? null,
      trimmedBy:
        parse?.reason === 'TRIMMED_BALANCED' || parse?.reason === 'TRIMMED' ? parse.reason : null,
    },
    structure: structure
      ? {
          valid: Boolean(structure.valid),
          missing: structure.missing || [],
          wrongType: (structure.wrongType || []).map((w) => `${w.field}:${w.expected}<-${w.actual}`),
          extra: structure.extra || [],
        }
      : null,
    recovery: recovery
      ? {
          used: Boolean(recovery.ok),
          complete: Boolean(recovery.complete),
          recoveredKeys: recoveredKeys || [],
          truncatedKey: recovery.truncatedKey ?? null,
          /** 截断后仍然缺的字段：用户能看到「哪些没完成」，而不是只看到「失败了」 */
          missing: missingFields || [],
        }
      : null,
    /** 配料父子结构由程序从原文解析，模型不再重复输出 */
    derivedIngredients: interpreted?.derivedIngredients ?? 0,
    partial: Boolean(interpreted?.partial),
    branch,
    durationMs: durationMs ?? null,
    usage: res?.data?.usage
      ? {
          promptTokens: res.data.usage.prompt_tokens ?? null,
          completionTokens: res.data.usage.completion_tokens ?? null,
        }
      : null,
  };
}

/**
 * 把模型返回的 content 解释成可核对的数据（纯函数，便于离线测试）。
 *
 * 完整 JSON 解析失败时，只恢复已经闭合的字段/数组元素：
 * 不补齐引号、不猜缺失字段；写了一半的配料名不会被当成完整配料。
 */
export function interpretVisionContent(content) {
  const parse = extractJson(content);
  const structure = parse.ok ? validateStructure(parse.value, PACKAGE_SCHEMA) : null;
  const recovery = parse.ok ? null : recoverPartialJson(content);
  const parsedValue = parse.ok ? parse.value : recovery?.ok ? recovery.value : null;
  const recoveredKeys = recovery?.ok ? recovery.recoveredKeys : [];

  // 模型不再输出配料对象数组；父子结构在这里由原文确定性解析。
  // 解析失败（括号不闭合等）时不补任何东西，保留原文由前端标记待核对。
  const derived = deriveIngredients(parsedValue);
  const missingFields = parsedValue
    ? Object.keys(PACKAGE_SCHEMA).filter((k) => !(k in parsedValue))
    : Object.keys(PACKAGE_SCHEMA);

  return {
    parse,
    structure,
    recovery,
    parsedValue,
    recoveredKeys,
    missingFields,
    derivedIngredients: derived,
    partial: !parse.ok && Boolean(parsedValue),
  };
}

/**
 * 用 ingredients_text 补出 ingredients[]（纯函数）。
 *
 * 只在「原文存在、且模型没有给出数组」时补；返回解析出的条目数。
 * 这里刻意不改变任何名称：解析出的 name 就是原文里写的名称。
 */
export function deriveIngredients(parsedValue) {
  if (!parsedValue || typeof parsedValue !== 'object') return 0;
  if (Array.isArray(parsedValue.ingredients) && parsedValue.ingredients.length > 0) {
    return parsedValue.ingredients.length;
  }
  const text = typeof parsedValue.ingredients_text === 'string' ? parsedValue.ingredients_text.trim() : '';
  if (!text) return 0;

  const { items } = parseIngredientText(text);
  if (!items.length) return 0;
  parsedValue.ingredients = items.map((it) => ({ name: it.name, raw: it.raw }));
  return items.length;
}

function estimateCost(usage, pricing) {
  if (!usage) return null;
  const inTok = Number(usage.prompt_tokens || 0);
  const outTok = Number(usage.completion_tokens || 0);
  if (!inTok && !outTok) return null;
  const amount = (inTok / 1e6) * pricing.inputPerM + (outTok / 1e6) * pricing.outputPerM;
  return {
    currency: pricing.currency,
    amount: Math.round(amount * 1e6) / 1e6,
    inputTokens: inTok,
    outputTokens: outTok,
    basis: pricing.note,
  };
}
