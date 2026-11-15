/**
 * Search need_content 对照测试（V5.1 任务 1）。
 *
 * 目的：确认 need_content=true 返回的 content 是否可用，
 * 从而判断"能不能用 Search 正文替代大部分 Fetch 调用"。
 *
 * 同一条 query、同样的 count，只切换 need_content，保证对比干净。
 * 费用：2 次 Search ≈ $0.0015。
 *
 * 用法：node scripts/search-content-ab.mjs [成分名]
 */

import { search } from '../server/providers/deepseekSearch.js';
import { checkUrlAllowed } from '../server/lib/sourceWhitelist.js';
import { buildSearchQuery } from '../server/lib/searchQuery.js';

const NAME = process.argv[2] || '三氯蔗糖';
const ALIASES = NAME === '三氯蔗糖' ? ['sucralose'] : [];

const q = buildSearchQuery(NAME, ALIASES);
console.log(`成分：${NAME}`);
console.log(`查询：${q.query}`);
console.log(`查询长度：${q.length} / 128`);
console.log(`限定站点：${q.sites.join(', ')}`);
console.log('');

const runs = [];

for (const needContent of [false, true]) {
  const t0 = Date.now();
  let res;
  try {
    res = await search({ query: q.query, count: 5, needContent });
  } catch (e) {
    console.log(`need_content=${needContent} 失败: ${e.code || ''} ${e.message}`);
    continue;
  }
  const elapsed = Date.now() - t0;

  const allowed = [];
  const blocked = [];
  for (const r of res.results) {
    const chk = checkUrlAllowed(r.url);
    if (chk.allowed) allowed.push(r);
    else blocked.push({ url: r.url, reason: chk.reason });
  }

  const withContent = res.results.filter((r) => r.content && r.content.length > 0);
  const allowedWithContent = allowed.filter((r) => r.content && r.content.length > 0);

  const run = {
    needContent,
    resultCount: res.resultCount,
    allowedCount: allowed.length,
    blockedCount: blocked.length,
    contentCount: withContent.length,
    allowedWithContent: allowedWithContent.length,
    contentChars: res.contentChars ?? 0,
    elapsed,
  };
  runs.push(run);

  console.log(`===== need_content = ${needContent} =====`);
  console.log(`  返回结果      ${run.resultCount} 条`);
  console.log(`  通过白名单    ${run.allowedCount} 条（拦下 ${run.blockedCount} 条）`);
  console.log(`  content 非空  ${run.contentCount} 条（其中白名单内 ${run.allowedWithContent} 条）`);
  console.log(`  content 总字数 ${run.contentChars}`);
  console.log(`  耗时          ${elapsed} ms`);

  console.log('  --- 逐条 ---');
  for (const r of res.results) {
    const chk = checkUrlAllowed(r.url);
    const cLen = r.content?.length || 0;
    console.log(
      `   ${chk.allowed ? '✓' : '✗'} ${String(r.title || r.url).slice(0, 42).padEnd(42)} ` +
        `c=${String(cLen).padStart(5)}  auth=${r.authority ?? '-'}  ${chk.allowed ? chk.org : chk.reason}`,
    );
  }

  if (allowedWithContent.length > 0) {
    console.log('  --- content 样本（前 300 字）---');
    const sample = allowedWithContent[0];
    console.log('  来源：', sample.title);
    console.log('  正文：', sample.content.slice(0, 300).replace(/\s+/g, ' '));
    console.log('  正文提及成分名：', sample.content.includes(NAME) ? '是' : '否');
  }
  console.log('');
}

if (runs.length === 2) {
  const [off, on] = runs;
  console.log('===== 对比结论 =====');
  console.log(`  白名单内可用正文：${off.allowedWithContent} → ${on.allowedWithContent} 条`);
  console.log(`  正文总字数：      ${off.contentChars} → ${on.contentChars}`);
  console.log(`  耗时：            ${off.elapsed}ms → ${on.elapsed}ms（增加 ${on.elapsed - off.elapsed}ms）`);
  console.log(
    `  判断：${on.allowedWithContent > 0 ? 'need_content=true 能替代部分 Fetch' : 'need_content=true 未取得可用正文，仍需 Fetch'}`,
  );
}
