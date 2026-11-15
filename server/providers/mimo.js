import { config } from '../config.js';
import { postJson, assertUpstreamOk, ApiError } from '../lib/upstream.js';
import { extractJson, validateStructure } from '../lib/jsonMaybe.js';
import { redact } from '../lib/redact.js';

/**
 * 小米 MiMo 图片理解。
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/multimodal-understanding/image-understanding
 * 接口：POST {MIMO_BASE_URL}/chat/completions（OpenAI Chat Completions 兼容）
 * 传图：Base64，格式 data:{MIME};base64,{BASE64}
 */

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

/** 包装信息提取的结构化目标 */
export const PACKAGE_SCHEMA = {
  product_name: 'string|null',
  brand: 'string|null',
  net_content: 'string|null',
  ingredients_text: 'string|null',
  ingredients: 'array',
  nutrition: 'object',
  claims: 'string[]',
  unreadable: 'string[]',
  notes: 'string|null',
};

const SYSTEM_PROMPT = `你是严谨的食品包装信息提取器。你的唯一任务是读取图片中真实可见的文字，不做任何推测。

必须遵守：
1. 只输出一个 JSON 对象，不要输出解释、不要使用 markdown 代码块。
2. 图片中看不清、被遮挡或不存在的字段，一律填 null，禁止根据常识补全。
3. 数值必须原样照抄（包含小数点和单位），不要换算、不要四舍五入。
4. 无法辨认的项目统一记录到 unreadable 数组，用简短中文描述位置，例如"配料表末尾两行被遮挡"。
5. 严禁编造配料、营养数值、品牌或宣传语。

JSON 结构（严格按此结构输出）：
{
  "product_name": "食品名称，没有则 null",
  "brand": "品牌，没有则 null",
  "net_content": "净含量原文，如 250g，没有则 null",
  "ingredients_text": "配料表完整原文，保留原有顺序与标点，没有则 null",
  "ingredients": [{ "name": "单一配料名", "raw": "该配料在原文中的完整写法，含括号内子配料" }],
  "nutrition": {
    "basis": "per_100g | per_100ml | per_serving | per_serving_with_serving_size | null",
    "basis_text": "标示基准原文，如 每100克 / 每份(30g)，没有则 null",
    "items": [{ "name": "营养项目名", "value": "数值字符串", "unit": "单位", "nrv_percent": "营养素参考值百分比字符串或 null" }]
  },
  "claims": ["包装上出现的宣传语原文，如 0蔗糖"],
  "unreadable": ["无法辨认的内容描述"],
  "notes": "其他需要说明的情况，没有则 null"
}

注意：basis 只能取上述五个枚举值之一；如果图片里没写基准，必须为 null，不要猜测。`;

/**
 * @param {object} p
 * @param {string} p.imageBase64 纯 base64（不含 data: 前缀）
 * @param {string} p.mimeType
 * @param {string} [p.model]
 */
export async function analyzePackageImage({ imageBase64, mimeType, model }) {
  if (!config.mimo.apiKey) {
    throw new ApiError({
      code: 'MISSING_API_KEY',
      httpStatus: 400,
      message: '服务端未配置 MIMO_API_KEY，请在 .env 中填写后重启',
    });
  }

  const mime = String(mimeType || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    throw new ApiError({
      code: 'UNSUPPORTED_IMAGE_TYPE',
      httpStatus: 400,
      message: `不支持的图片格式：${mime || '(空)'}，仅支持 JPG / PNG / GIF / WebP / BMP`,
    });
  }
  if (!imageBase64 || imageBase64.length < 100) {
    throw new ApiError({ code: 'EMPTY_IMAGE', httpStatus: 400, message: '图片内容为空或过小' });
  }

  const usedModel = model || config.mimo.visionModel;
  const endpoint = `${config.mimo.baseUrl}/chat/completions`;

  const body = {
    model: usedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
          { type: 'text', text: '请提取这张食品包装图片中的全部信息，严格按 system 指定的 JSON 结构输出。' },
        ],
      },
    ],
    max_completion_tokens: 2048,
    temperature: 0.1,
  };

  const res = await postJson(endpoint, {
    apiKey: config.mimo.apiKey,
    body,
    timeoutMs: 120000,
  });

  assertUpstreamOk(res, { provider: 'MiMo 图片理解', endpoint });

  const choice = res.data?.choices?.[0];
  const content = choice?.message?.content ?? '';

  const parsedResult = extractJson(content);
  let structure = null;
  if (parsedResult.ok) {
    structure = validateStructure(parsedResult.value, PACKAGE_SCHEMA);
  }

  return {
    provider: 'MiMo',
    model: res.data?.model || usedModel,
    endpoint,
    httpStatus: res.status,
    durationMs: res.durationMs,
    finishReason: choice?.finish_reason ?? null,
    usage: res.data?.usage ?? null,
    content,
    reasoningContent: choice?.message?.reasoning_content ?? null,
    jsonParse: { ok: parsedResult.ok, reason: parsedResult.reason, detail: parsedResult.detail ?? null },
    parsed: parsedResult.ok ? parsedResult.value : null,
    structure,
    raw: redact(res.data),
  };
}
