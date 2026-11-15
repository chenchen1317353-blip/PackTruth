import { AsyncLocalStorage } from 'node:async_hooks';

// Prices verified against DeepSeek's CNY price table on 2026-11-04.
// Always reserve peak/cache-miss prices. An uncertain response keeps its reservation.
export const researchBudgetScope = new AsyncLocalStorage();
export const researchRunScope = new AsyncLocalStorage();
export async function withResearchLimits(fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 330000);
  timer.unref();
  try { return await researchRunScope.run({ controller, calls: 0, upperCny: 0 }, fn); }
  finally { clearTimeout(timer); }
}
export function createResearchBudget({ limitCny = 0.8, onChange = () => {}, onResponse = null, initial = [] } = {}) {
  return { limitCny, calls: [...initial], onChange, onResponse, consecutiveErrors: 0 };
}
export function budgetTotal(budget) {
  return budget.calls.reduce((sum, call) => sum + call.chargedUpperCny, 0);
}
export function reserveCall(url, body) {
  const budget = researchBudgetScope.getStore();
  if (!budget) return null;
  const run = researchRunScope.getStore();
  if (run?.controller.signal.aborted) throw Object.assign(new Error('研究已超时或取消'), { code: 'RESEARCH_CANCELLED' });
  if (new URL(url).origin !== 'https://api.deepseek.com') throw Object.assign(new Error('研究只能调用 DeepSeek 官方接口'), { code: 'UNTRUSTED_UPSTREAM' });
  const path = new URL(url).pathname;
  const kind = path.endsWith('/search') ? 'search' : path.endsWith('/fetch') ? 'fetch' : 'chat';
  if (budget.consecutiveErrors >= 3) throw Object.assign(new Error('连续三次上游错误，已停止付费调用'), { code: 'RESEARCH_ERROR_LIMIT' });
  const prices = /^(deepseek-flash|deepseek-v4-flash)$/.test(body.model || '') ? [2, 8] : null;
  if (kind === 'chat' && !prices) throw Object.assign(new Error('此模型未配置可验证的费用上限，停止调用'), { code: 'UNKNOWN_MODEL_PRICE' });
  // UTF-8 byte length is a conservative token bound; include framing overhead.
  const inputBound = kind === 'chat' ? Buffer.byteLength(JSON.stringify(body), 'utf8') + 4096 : 0;
  const outputBound = kind === 'chat' ? Number(body.max_tokens) : 0;
  if (kind === 'chat' && (!outputBound || outputBound > 12000)) throw new Error('研究输出预算无效');
  const reservedCny = kind === 'chat' ? (inputBound * prices[0] + outputBound * prices[1]) / 1e6 : 0.005;
  if (run && (run.calls >= 18 || run.upperCny + reservedCny > 0.8)) throw Object.assign(new Error('单成分研究达到18次调用或0.80元费用上限'), { code: 'RESEARCH_COST_LIMIT' });
  if (budgetTotal(budget) + reservedCny > budget.limitCny) throw Object.assign(new Error('本次研究费用已达到硬上限，未发出下一请求'), { code: 'RESEARCH_COST_LIMIT' });
  const call = { number: budget.calls.length + 1, kind, endpoint: url, model: body.model || null,
    query: body.query || null, url: body.url || null, startedAt: new Date().toISOString(),
    reservedCny, chargedUpperCny: reservedCny, status: 'pending', usage: null };
  budget.calls.push(call);
  if (run) { run.calls++; run.upperCny += reservedCny; }
  budget.onChange(budget);
  return { budget, call, run, started: Date.now(), prices };
}
export function settleCall(ticket, res) {
  if (!ticket) return;
  const { budget, call, run, started, prices } = ticket;
  call.durationMs = Date.now() - started;
  call.status = res?.status || 'network_error';
  call.usage = res?.data?.usage || null;
  if (call.kind !== 'chat' && res) {
    call.chargedUpperCny = res.status === 200 && (res.data?.results?.length || res.data?.content) ? 0.005 : 0;
  } else if (res?.ok && call.usage) {
    call.chargedUpperCny = ((call.usage.prompt_tokens || 0) * prices[0] + (call.usage.completion_tokens || 0) * prices[1]) / 1e6;
  }
  budget.consecutiveErrors = res?.ok ? 0 : budget.consecutiveErrors + 1;
  if (run) run.upperCny += call.chargedUpperCny - call.reservedCny;
  budget.onResponse?.(call, res?.data);
  budget.onChange(budget);
}
