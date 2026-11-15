import { deepseekKey, currentCredentials } from '../lib/requestCredentials.js';
import { config } from '../config.js';
import { postJson, assertUpstreamOk, ApiError } from '../lib/upstream.js';
import { redact } from '../lib/redact.js';

/**
 * DeepSeek Search。
 * 文档：https://api-docs.deepseek.com/guides/search/
 * 接口：POST {DEEPSEEK_BASE_URL}/v1/tools/search
 *
 * 计费：按「成功请求」计费，$0.75 / 1000 次；
 * 只有 HTTP 200 且 results 非空才计费，空结果和失败不计费。
 */

export async function search({ query, count = 8, needContent = false, oriQuestion = null } = {}) {
  if (!deepseekKey(config.deepseek.apiKey)) {
    throw new ApiError({
      code: 'MISSING_API_KEY',
      httpStatus: 400,
      message: '服务端未配置 DEEPSEEK_API_KEY，请在 .env 中填写后重启',
    });
  }
  const q = String(query || '').trim();
  if (!q) {
    throw new ApiError({ code: 'EMPTY_QUERY', httpStatus: 400, message: '搜索关键词不能为空' });
  }
  if (q.length > 128) {
    throw new ApiError({ code: 'QUERY_TOO_LONG', httpStatus: 400, message: '搜索关键词最多 128 个字符' });
  }

  // 官方允许 1–50 条；计费按「成功请求」而不是条数，所以适当多取几条
  // 能提高找到健康评估原文的概率，不增加单次费用。
  // 上限仍收在 10：正文体积会直接进 Chat 提示词，过多会挤占输出预算。
  const safeCount = Math.min(Math.max(Number(count) || 8, 1), 10);
  const endpoint = `${config.deepseek.baseUrl}/v1/tools/search`;
  const question = String(oriQuestion || '').trim().slice(0, 128);

  const res = await postJson(endpoint, {
    apiKey: deepseekKey(config.deepseek.apiKey),
    body: {
      query: q,
      count: safeCount,
      need_content: Boolean(needContent),
      ...(question ? { ori_question: question } : {}),
    },
    timeoutMs: 45000,
  });

  assertUpstreamOk(res, { provider: 'DeepSeek Search', endpoint });

  const results = Array.isArray(res.data?.results) ? res.data.results : [];

  // need_content=true 时官方在每条结果里返回 content（网页正文），
  // 为 false 或正文缺失时是空字符串。
  // 注意：content 非空 ≠ 拿到完整原文，仍可能被截断，展示时必须标为「网页内容」而非「全文」。
  const mapped = results.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.snippet ?? '',
    summary: r.summary ?? '',
    content: typeof r.content === 'string' ? r.content : '',
    siteName: r.site_name ?? null,
    date: r.date ?? null,
    authority: typeof r.authority === 'number' ? r.authority : null,
    rerankScore: typeof r.rerank_score === 'number' ? r.rerank_score : null,
  }));

  const withContent = mapped.filter((r) => r.content.length > 0);

  return {
    provider: 'DeepSeek Search',
    endpoint,
    httpStatus: res.status,
    durationMs: res.durationMs,
    query: q,
    requestedCount: safeCount,
    resultCount: results.length,
    needContent: Boolean(needContent),
    oriQuestion: question || null,
    contentCount: withContent.length,
    contentChars: withContent.reduce((n, r) => n + r.content.length, 0),
    billed: res.status === 200 && results.length > 0,
    results: mapped,
    raw: redact(res.data),
  };
}
