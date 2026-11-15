/**
 * 真实联调检查（默认零调用；需要显式 --confirm-paid 才会花钱）。
 *
 * 用法：
 *   1. 确认 .env 里有你的 DeepSeek Key（或服务端已配置）；
 *   2. node scripts/live-research-check.mjs            # 只打印将要发生什么与费用预估，不调用
 *   3. node scripts/live-research-check.mjs --confirm-paid 5'-呈味核苷酸二钠
 *      # 真实调用一次完整研究：最多 5 轮检索 + 5 次读取 + 2 次规划 + 1 次整理
 *      # 按 2026-11-04 官方价目，最坏情况 < 0.1 元；实际以账单为准
 *
 * 输出：身份解析、研究路径、四问覆盖、八项完成度、健康回答、引用与费用。
 */

import { config } from '../server/config.js';
import { researchIngredient, clearResearchCache } from '../server/providers/ingredientResearch.js';
import { resolveSubstanceIdentity, describeIdentity } from '../server/lib/substanceIdentity.js';
import { coverageLabel } from '../server/lib/evidenceLedger.js';

const args = process.argv.slice(2);
const confirmPaid = args.includes('--confirm-paid');
const nameArg = args.find((a) => !a.startsWith('--')) || '5′-呈味核苷酸二钠';

const identity = resolveSubstanceIdentity({ name: nameArg });
console.log('=== 研究对象（程序解析） ===');
console.log(describeIdentity(identity));

if (!config.deepseek.apiKey) {
  console.log('\n服务端没有配置 DEEPSEEK_API_KEY（.env），无法真实调用。');
  process.exit(1);
}

console.log('\n=== 费用预估（2026-11-04 官方价目） ===');
console.log('Search/Fetch：每 1000 次成功请求 5 元（0.005 元/次），失败与空结果不计费');
console.log('Chat：deepseek-flash 高峰价上限估算（输入 2 元/百万 tokens，输出 8 元/百万 tokens）');
console.log('最坏预算：5 轮检索 + 5 次读取 + 2 次规划 + 1 次整理 ≈ 0.05 元（Web）+ <0.05 元（Chat）');
console.log('取消保护：界面取消后不再发起新调用；已发出的请求可能仍计费。');

if (!confirmPaid) {
  console.log('\n未加 --confirm-paid：本次不做任何付费调用。');
  console.log(`确认后运行：node scripts/live-research-check.mjs --confirm-paid ${nameArg}`);
  process.exit(0);
}

console.log('\n=== 开始真实研究（会产生少量费用） ===');
clearResearchCache();
const t = Date.now();
try {
  const d = await researchIngredient({ name: nameArg, force: true });
  console.log(`\n状态：${d.status}；用时 ${d.totalMs} ms；停止原因：${d.researchStopReason}`);
  console.log(
    `预算使用：检索 ${d.searchBudget.usedRounds}/${d.searchBudget.maxRounds}，读取 ${d.searchBudget.usedFetchPages}/${d.searchBudget.maxFetchPages}，规划 ${d.searchBudget.usedPlannerCalls}/${d.searchBudget.maxPlannerCalls}，整理 ${d.searchBudget.usedChatCalls}/1`,
  );
  console.log('\n=== 实际研究路径 ===');
  for (const a of d.researchActions) {
    console.log(
      `- ${a.type === 'search' ? `检索[${a.focus}]` : '读取原文'}：${a.query || a.url}` +
        (a.ok === false ? `（失败：${a.error}）` : ''),
    );
  }
  console.log('\n=== 四问覆盖 ===');
  for (const [k, v] of Object.entries(d.researchCoverage || {})) {
    console.log(`- ${k}: ${coverageLabel(v)}`);
  }
  console.log('\n=== 八项完成度 ===');
  for (const item of d.completion?.items || []) {
    console.log(`- [${item.status}] ${item.label}：${item.detail}`);
  }
  console.log('\n=== 健康回答 ===');
  const h = d.healthInsights || {};
  for (const slot of ['consumerTakeaway', 'normalIntake', 'highIntake', 'sensitiveGroups']) {
    const item = h[slot];
    if (!item) continue;
    console.log(
      `\n【${slot}】${item.text}\n  依据：${item.sourceRefs.join(',')}；类型：${item.studyType}；证据基础：${item.evidenceBasis}` +
        (item.studyContext ? `\n  研究条件：${item.studyContext}` : '') +
        (item.conditions ? `\n  适用条件：${item.conditions}` : '') +
        (item.quote ? `\n  原文：“${item.quote.slice(0, 120)}”` : ''),
    );
  }
  if (d.foodMeaning?.text) {
    console.log(`\n【对这款食品】${d.foodMeaning.text}`);
  }
  if (!d.healthInsights) {
    console.log(`\n（没有取得健康结论）${d.healthGapText || d.notes?.[0] || ''}`);
  }
  console.log('\n=== 费用（估算） ===');
  console.log(JSON.stringify(d.cost));
  console.log('\n完整结果里还有 sources / rejected / notes，可在前端抽屉中查看。');
} catch (e) {
  console.error('\n研究失败：', e.code || '', e.message);
  process.exit(1);
}
