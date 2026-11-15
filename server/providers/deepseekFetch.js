import { deepseekKey, currentCredentials } from '../lib/requestCredentials.js';
import { config } from '../config.js';
import { postJson, assertUpstreamOk, ApiError } from '../lib/upstream.js';
import { checkUrlAllowed } from '../lib/sourceWhitelist.js';

/**
 * DeepSeek Fetch。
 * 文档：https://api-docs.deepseek.com/guides/search/（与 Search 同一篇）
 * 接口：POST {DEEPSEEK_BASE_URL}/v1/tools/fetch
 *
 * 关键区分（官方错误码）：
 *   403 = 被安全策略拒绝
 *   404 = 页面抓不到可用正文（可能是站点反爬 / 内容类型不支持 / 无可提取正文）
 *   这两类都属于「目标网站不可抓取」，不是「Fetch API 本身不可用」。
 */

const SITE_BLOCKED_HINTS = [403, 404];

export async function fetchPage({ url, timeoutMs = 60000 } = {}) {
  if (!deepseekKey(config.deepseek.apiKey)) {
    throw new ApiError({
      code: 'MISSING_API_KEY',
      httpStatus: 400,
      message: '服务端未配置 DEEPSEEK_API_KEY，请在 .env 中填写后重启',
    });
  }

  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new ApiError({ code: 'INVALID_URL', httpStatus: 400, message: 'URL 格式不合法' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ApiError({ code: 'INVALID_URL', httpStatus: 400, message: '仅支持 http / https 链接' });
  }
  if (parsed.username || parsed.password) {
    throw new ApiError({ code: 'INVALID_URL', httpStatus: 400, message: 'URL 不能包含用户名或密码' });
  }

  const endpoint = `${config.deepseek.baseUrl}/v1/tools/fetch`;
  const policy = checkUrlAllowed(parsed.toString());
  if (!policy.allowed) throw new ApiError({ code: 'UNSAFE_FETCH_URL', httpStatus: 403, message: policy.reason });

  let res;
  try {
    res = await postJson(endpoint, {
      apiKey: deepseekKey(config.deepseek.apiKey),
      body: { url: parsed.toString() },
      timeoutMs,
    });
  } catch (err) {
    throw err;
  }

  if (!res.ok) {
    // 把「网站抓不到」与「API 不通」分开归类
    if (SITE_BLOCKED_HINTS.includes(res.status)) {
      const reason =
        res.status === 403
          ? '目标网站拒绝了抓取（可能设置了反爬策略或 robots 限制）'
          : '目标页面没有可提取的正文（可能被站点策略拦截、内容类型不支持或页面为空）';
      throw new ApiError({
        code: res.status === 403 ? 'SITE_BLOCKED' : 'PAGE_NOT_EXTRACTABLE',
        httpStatus: 502,
        message: `网站无法抓取：${reason}。注意——这不代表 Fetch API 本身不可用。`,
        detail: {
          endpoint,
          upstreamStatus: res.status,
          upstreamMessage: String(res.data?.error?.message || res.text || '').slice(0, 400),
          verdict: 'SITE_LEVEL_FAILURE',
        },
      });
    }
    assertUpstreamOk(res, { provider: 'DeepSeek Fetch', endpoint });
  }

  const content = res.data?.content ?? '';
  const title = res.data?.title ?? '';

  return {
    provider: 'DeepSeek Fetch',
    endpoint,
    httpStatus: res.status,
    durationMs: res.durationMs,
    url: parsed.toString(),
    title,
    content,
    contentLength: typeof content === 'string' ? content.length : 0,
    billed: res.status === 200 && Boolean(content),
    // 展示前 3000 字，完整内容通过接口返回给前端时可自行截取
    contentPreview: typeof content === 'string' ? content.slice(0, 3000) : '',
    raw: { title, contentLength: content.length },
  };
}
