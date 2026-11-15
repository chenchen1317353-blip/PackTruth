import { redact } from './redact.js';
import { currentCredentials, scrubCredential } from './requestCredentials.js';
import { reserveCall, settleCall, researchRunScope } from './researchBudget.js';

/**
 * 统一的上游 HTTP 请求封装。
 * 目标：
 * 1. 所有出站请求走同一个地方，方便加超时、日志、脱敏。
 * 2. 把 fetch 抛出的异常和上游的 HTTP 错误统一成 ApiError 结构，
 *    让前端能稳定区分「网络不通 / 鉴权失败 / 余额不足 / 限流 / 服务端错误」。
 */

export class ApiError extends Error {
  /**
   * @param {object} o
   * @param {string} o.code     机器可读错误码
   * @param {number} o.httpStatus 建议返回给前端的 HTTP 状态
   * @param {string} o.message  人类可读中文说明
   * @param {object} [o.detail] 额外上下文（已脱敏）
   */
  constructor({ code, httpStatus = 500, message, detail = null }) {
    super(scrubCredential(message));
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = currentCredentials() ? null : detail;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      detail: redact(this.detail),
      // 识别链路会把 6 位编号挂上来；没有就是 null，不影响其他接口
      requestId: this.requestId || null,
    };
  }
}

const NETWORK_HINTS = {
  ENOTFOUND: 'DNS 解析失败，域名无法访问',
  ECONNREFUSED: '连接被拒绝，目标端口不可达',
  ECONNRESET: '连接被上游重置',
  ETIMEDOUT: '连接超时',
  EAI_AGAIN: 'DNS 临时解析失败',
  UND_ERR_CONNECT_TIMEOUT: '建立连接超时',
  CERT_HAS_EXPIRED: 'HTTPS 证书已过期',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'HTTPS 证书校验失败',
};

/** 把 Node/undici 抛出的底层错误翻译成人话 */
function describeNetworkError(err, timeoutMs) {
  const cause = err?.cause || {};
  const code = cause.code || err?.code || '';
  const detail = cause.message || err?.message || String(err);
  if (code === 'ABORT_ERR' || err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return { code: 'UPSTREAM_TIMEOUT', message: `请求超时（${timeoutMs} ms 内未返回）`, detail };
  }
  const hint = NETWORK_HINTS[code];
  if (hint) return { code: `NETWORK_${code}`, message: `${hint}`, detail };
  return { code: 'NETWORK_ERROR', message: '网络请求失败，无法连接到上游服务', detail };
}

/**
 * 发送 JSON POST 请求。
 * @returns {Promise<{status:number, ok:boolean, data:any, text:string, durationMs:number, headers:Headers}>}
 */
export async function postJson(url, { apiKey, body, timeoutMs = 60000, headers = {} } = {}) {
  const scope = currentCredentials();
  if (scope) {
    const target = new URL(url);
    if (target.origin !== 'https://api.deepseek.com' || target.username || target.password || target.search || !['/chat/completions', '/v1/chat/completions', '/v1/tools/search', '/v1/tools/fetch'].includes(target.pathname)) {
      throw new ApiError({ code: 'UNTRUSTED_UPSTREAM', httpStatus: 403, message: '服务端 API 地址不在 DeepSeek 官方允许范围内' });
    }
    if (scope.controller.signal.aborted) throw new ApiError({ code: 'REQUEST_CANCELLED', httpStatus: 499, message: '请求已取消' });
    if (!scope.key) throw new ApiError({ code: 'USER_KEY_REQUIRED', httpStatus: 401, message: '请先填写 DeepSeek API Key' });
    if (++scope.calls > scope.maxCalls) throw new ApiError({ code: 'CALL_BUDGET_EXCEEDED', httpStatus: 429, message: '本次分析已达到调用次数上限' });
    apiKey = scope.key;
  }
  const started = Date.now();
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(scope ? [scope.controller.signal] : []), ...(researchRunScope.getStore() ? [researchRunScope.getStore().controller.signal] : [])]),
    redirect: 'error',
  };

  let res;
  let text;
  const ticket = reserveCall(url, body);
  try {
    res = await fetch(url, init);
    // fetch resolves at response headers; reading the body can still time out
    // or fail with a network error and needs the same stable error mapping.
    text = await res.text();
    if (scope && apiKey) text = text.split(apiKey).join('[REDACTED]');
  } catch (err) {
    settleCall(ticket, null);
    const n = describeNetworkError(err, timeoutMs);
    throw new ApiError({
      code: n.code,
      httpStatus: 502,
      message: n.message,
      detail: { url, error: n.detail, durationMs: Date.now() - started },
    });
  }

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  settleCall(ticket, { status: res.status, ok: res.ok, data });

  return {
    status: res.status,
    ok: res.ok,
    data,
    text,
    durationMs: Date.now() - started,
    headers: res.headers,
  };
}

/**
 * 把非 2xx 响应转成带中文说明的 ApiError。
 * 只读取必要字段，且全部脱敏。
 */
export function assertUpstreamOk(res, { provider, endpoint }) {
  if (res.ok) return;

  const errObj = res.data?.error || res.data;
  const upstreamMessage =
    (typeof errObj === 'object' && errObj && (errObj.message || errObj.msg)) ||
    (typeof errObj === 'string' ? errObj : '') ||
    res.text?.slice(0, 400) ||
    '';

  const map = {
    400: { code: 'UPSTREAM_BAD_REQUEST', message: '请求参数不被上游接受（400）' },
    401: { code: 'UPSTREAM_UNAUTHORIZED', message: 'API Key 无效、缺失或已失效（401）' },
    402: { code: 'UPSTREAM_PAYMENT_REQUIRED', message: '账户余额不足，需要充值（402）' },
    403: { code: 'UPSTREAM_FORBIDDEN', message: '请求被拒绝，可能是权限不足或安全策略拦截（403）' },
    404: { code: 'UPSTREAM_NOT_FOUND', message: '接口或目标资源不存在（404）' },
    408: { code: 'UPSTREAM_TIMEOUT', message: '上游读取请求超时（408）' },
    413: { code: 'UPSTREAM_TOO_LARGE', message: '请求体过大（413）' },
    422: { code: 'UPSTREAM_UNPROCESSABLE', message: '请求内容无法被上游处理（422）' },
    429: { code: 'UPSTREAM_RATE_LIMITED', message: '触发限流（429），请降低频率后重试' },
    500: { code: 'UPSTREAM_SERVER_ERROR', message: '上游服务内部错误（500）' },
    502: { code: 'UPSTREAM_BAD_GATEWAY', message: '上游网关错误（502）' },
    503: { code: 'UPSTREAM_UNAVAILABLE', message: '上游服务暂时不可用（503）' },
    504: { code: 'UPSTREAM_GATEWAY_TIMEOUT', message: '上游网关超时（504）' },
  };

  const hit = map[res.status] || {
    code: 'UPSTREAM_HTTP_ERROR',
    message: `上游返回错误状态码 ${res.status}`,
  };

  throw new ApiError({
    code: hit.code,
    httpStatus: res.status >= 400 && res.status < 600 ? res.status : 502,
    message: `${provider}：${hit.message}`,
    detail: {
      endpoint,
      upstreamStatus: res.status,
      upstreamMessage: String(upstreamMessage).slice(0, 600),
      upstreamErrorType: errObj?.type || errObj?.code || null,
      durationMs: res.durationMs,
    },
  });
}
