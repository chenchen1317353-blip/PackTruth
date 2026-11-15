/**
 * 前端只跟本地中转服务说话（/api/*）。
 * BYOK 凭据仅存页面内存，通过同源请求头临时交给后端。
 */

import { requestCredential } from './credentials.js';

export class ApiCallError extends Error {
  constructor({ message, code, httpStatus, detail, requestId }) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = detail;
    this.requestId = requestId ?? null;
  }
}

export async function callApi(path, body, { timeoutMs = 150000, signal } = {}) {
  const paid = ['/api/vision/extract', '/api/ingredient/research'].includes(path);
  const credential = requestCredential();
  if (paid && !credential.header) throw new ApiCallError({ code: 'USER_KEY_REQUIRED', message: '请先在「AI 功能设置」填写 DeepSeek API Key；演示模式无需 Key' });
  if (paid && location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw new ApiCallError({ code: 'HTTPS_REQUIRED', message: '请通过 HTTPS 安全连接使用真实分析' });
  // 组合「超时」和「调用方主动取消」两个信号。
  // 成分切换时需要主动 abort 上一个请求，避免旧结果覆盖新卡片。
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([timeoutSignal, ...(signal ? [signal] : []), ...(paid ? [credential.signal] : [])]);

  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(paid ? { Authorization: credential.header } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    // 调用方主动取消：不要包装成「网络错误」，交给上层静默处理
    if (signal?.aborted || (paid && credential.signal.aborted)) {
      const abortErr = new Error('请求已取消');
      abortErr.name = 'AbortError';
      abortErr.code = 'ABORTED';
      throw abortErr;
    }
    throw new ApiCallError({
      code: 'FRONTEND_NETWORK_ERROR',
      httpStatus: null,
      message:
        err?.name === 'TimeoutError'
          ? `前端等待超时（${timeoutMs} ms）`
          : '无法连接本地中转服务，请确认 npm run dev 仍在运行',
      detail: { raw: String(err?.message || err) },
    });
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiCallError({
      code: 'BAD_RESPONSE',
      httpStatus: res.status,
      message: '中转服务返回的不是合法 JSON',
    });
  }

  if (!json.ok) {
    throw new ApiCallError({
      code: json.error?.code || 'UNKNOWN',
      httpStatus: res.status,
      message: json.error?.message || '请求失败',
      detail: json.error?.detail ?? null,
      requestId: json.error?.requestId ?? null,
    });
  }

  if (paid && credential.signal.aborted) { const err = new Error('凭据已清除或更换'); err.name = 'AbortError'; throw err; }
  return json.data;
}

/** 把 File 转成纯 base64（不含 data: 前缀） */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export async function urlToBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}
