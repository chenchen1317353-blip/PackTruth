/**
 * CORS 预检探测。
 *
 * 目的：不消耗任何 API 额度、不携带任何密钥，判断浏览器能否直连上游接口。
 * 原理：浏览器跨域调用前会先发 OPTIONS 预检；只有响应里包含
 *       Access-Control-Allow-Origin 且匹配当前页面源，浏览器才放行真实请求。
 * 说明：这是「预检推断」，最终以浏览器真实 fetch 的结果为准，
 *       所以测试页里还提供了一个浏览器直连探测按钮做交叉验证。
 */

const PAGE_ORIGIN = 'http://localhost:5173';

export async function probeCors(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: PAGE_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
      signal: AbortSignal.timeout(15000),
    });

    const acao = res.headers.get('access-control-allow-origin');
    const acah = res.headers.get('access-control-allow-headers');
    const acam = res.headers.get('access-control-allow-methods');

    const allowOrigin = Boolean(acao) && (acao === '*' || acao.split(',').map((s) => s.trim()).includes(PAGE_ORIGIN));

    return {
      target: targetUrl,
      reachable: true,
      optionsStatus: res.status,
      accessControlAllowOrigin: acao,
      accessControlAllowHeaders: acah,
      accessControlAllowMethods: acam,
      browserDirectCallAllowed: allowOrigin,
      verdict: allowOrigin
        ? '响应包含匹配的 Access-Control-Allow-Origin，浏览器直连可能可行'
        : '响应缺少匹配的 Access-Control-Allow-Origin，浏览器直连会被 CORS 拦截',
    };
  } catch (err) {
    return {
      target: targetUrl,
      reachable: false,
      optionsStatus: null,
      accessControlAllowOrigin: null,
      accessControlAllowHeaders: null,
      accessControlAllowMethods: null,
      browserDirectCallAllowed: false,
      verdict: '预检请求未能完成，无法判断 CORS 策略',
      error: String(err?.cause?.code || err?.message || err),
    };
  }
}

export const CORS_PROBE_TARGETS = {
  mimo: 'https://api.xiaomimimo.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  deepseekSearch: 'https://api.deepseek.com/v1/tools/search',
};
