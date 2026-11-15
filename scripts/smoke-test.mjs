import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config, keyStatus } from '../server/config.js';
import { analyzePackageImage } from '../server/providers/mimo.js';
import { generateJson, simulateEmptyContent, simulateMissingField } from '../server/providers/deepseekChat.js';
import { search } from '../server/providers/deepseekSearch.js';
import { fetchPage } from '../server/providers/deepseekFetch.js';
import { probeCors, CORS_PROBE_TARGETS } from '../server/lib/corsProbe.js';
import { redact } from '../server/lib/redact.js';

/**
 * 第一阶段命令行实测脚本。
 * 直接调用 providers 层（与网页走的是同一份代码），逐个验证四条链路。
 * 每次运行只消耗 5 次付费调用，且失败不重试，避免烧额度。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'runtime-output');

const line = (c = '─') => console.log(c.repeat(72));
const head = (t) => {
  console.log('');
  line('═');
  console.log(t);
  line('═');
};
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);
const info = (m) => console.log(`  · ${m}`);

const summary = {
  runAt: new Date().toISOString(),
  environment: {},
  cors: {},
  tests: {},
};

function record(key, payload) {
  summary.tests[key] = payload;
}

// ---------------------------------------------------------------- 0. 环境
head('0. 环境与密钥检查');
info(`Node ${process.version} · ${process.platform} ${process.arch}`);
const ks = keyStatus();
info(`MiMo Key: ${ks.mimo.configured ? `${ks.mimo.keyPreview}（已配置）` : '未配置'}`);
info(`DeepSeek Key: ${ks.deepseek.configured ? `${ks.deepseek.keyPreview}（已配置）` : '未配置'}`);
info(`MiMo 端点: ${ks.mimo.baseUrl} · 模型 ${ks.mimo.model}`);
info(`DeepSeek 端点: ${ks.deepseek.baseUrl} · 模型 ${ks.deepseek.chatModel}`);

summary.environment = {
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  mimo: { configured: ks.mimo.configured, model: ks.mimo.model, baseUrl: ks.mimo.baseUrl },
  deepseek: { configured: ks.deepseek.configured, model: ks.deepseek.chatModel, baseUrl: ks.deepseek.baseUrl },
};

// ---------------------------------------------------------------- 1. CORS
head('1. CORS 预检探测（零成本，不携带密钥）');
const corsResults = {};
for (const [name, url] of Object.entries(CORS_PROBE_TARGETS)) {
  const p = await probeCors(url);
  corsResults[name] = p;
  console.log(`  ${name}`);
  info(`OPTIONS 状态: ${p.optionsStatus ?? '无响应'}`);
  info(`Access-Control-Allow-Origin: ${p.accessControlAllowOrigin || '（不存在）'}`);
  info(`判定: ${p.verdict}`);
}
summary.cors = corsResults;

// ---------------------------------------------------------------- 2. 测试 A
head('2. 测试 A · 小米 MiMo 图片理解');
let mimoResult = null;
let searchResults = [];
try {
  const imgPath = join(ROOT, 'public', 'test-label.png');
  const buf = await readFile(imgPath);
  info(`测试图: public/test-label.png（${(buf.length / 1024).toFixed(1)} KB，虚构标签）`);

  const t0 = Date.now();
  mimoResult = await analyzePackageImage({
    imageBase64: buf.toString('base64'),
    mimeType: 'image/png',
  });
  const elapsed = Date.now() - t0;

  ok(`HTTP ${mimoResult.httpStatus} · ${elapsed} ms · 模型 ${mimoResult.model}`);
  info(`finish_reason: ${mimoResult.finishReason}`);
  if (mimoResult.usage) {
    info(
      `tokens: 输入 ${mimoResult.usage.prompt_tokens} / 输出 ${mimoResult.usage.completion_tokens} / 合计 ${mimoResult.usage.total_tokens}`,
    );
  }
  info(`JSON 解析: ${mimoResult.jsonParse.ok ? '成功' : `失败(${mimoResult.jsonParse.reason})`}`);

  const p = mimoResult.parsed;
  if (p) {
    console.log('');
    info(`食品名称: ${JSON.stringify(p.product_name)}`);
    info(`品牌: ${JSON.stringify(p.brand)}`);
    info(`净含量: ${JSON.stringify(p.net_content)}`);
    info(`配料表原文: ${JSON.stringify(p.ingredients_text)}`);
    info(`配料拆分数: ${Array.isArray(p.ingredients) ? p.ingredients.length : '—'}`);
    info(`营养基准: ${JSON.stringify(p.nutrition?.basis_text)} / ${JSON.stringify(p.nutrition?.basis)}`);
    info(`营养项目数: ${Array.isArray(p.nutrition?.items) ? p.nutrition.items.length : '—'}`);
    if (Array.isArray(p.nutrition?.items)) {
      for (const it of p.nutrition.items) {
        console.log(`      ${it.name} = ${it.value} ${it.unit ?? ''} (NRV ${it.nrv_percent ?? '—'})`);
      }
    }
    info(`宣传语: ${JSON.stringify(p.claims)}`);
    info(`无法辨认: ${JSON.stringify(p.unreadable)}`);
    info(`结构校验: ${mimoResult.structure?.valid ? '通过' : `未通过 ${JSON.stringify(mimoResult.structure)}`}`);
  }

  record('A_mimo', {
    status: 'SUCCESS',
    httpStatus: mimoResult.httpStatus,
    durationMs: elapsed,
    model: mimoResult.model,
    jsonParseOk: mimoResult.jsonParse.ok,
    structureValid: mimoResult.structure?.valid ?? null,
    usage: mimoResult.usage,
    parsed: p,
    content: mimoResult.content,
    corsBlocked: false,
  });
} catch (e) {
  bad(`${e.code || 'ERROR'} · HTTP ${e.httpStatus ?? '—'} · ${e.message}`);
  if (e.detail) console.log(`    详情: ${JSON.stringify(redact(e.detail)).slice(0, 500)}`);
  record('A_mimo', { status: 'FAILED', code: e.code, httpStatus: e.httpStatus, message: e.message, detail: redact(e.detail) });
}

// ---------------------------------------------------------------- 3. 测试 B
head('3. 测试 B · DeepSeek JSON 输出');

// 3.1 正常
try {
  const t0 = Date.now();
  const r = await generateJson({ mode: 'normal' });
  const elapsed = Date.now() - t0;
  ok(`正常模式 HTTP ${r.httpStatus} · ${elapsed} ms · 模型 ${r.model}`);
  info(`JSON.parse: ${r.jsonParse.ok ? '通过' : `失败(${r.jsonParse.reason})`}`);
  info(`ingredients 字段: ${r.structure?.valid ? '存在且为数组' : `不通过 ${JSON.stringify(r.structure)}`}`);
  info(`元素级校验: ${r.itemErrors.length === 0 ? '全部合格' : `${r.itemErrors.length} 项不合格`}`);
  info(`overallValid: ${r.overallValid}`);
  if (Array.isArray(r.parsed?.ingredients)) {
    for (const it of r.parsed.ingredients) {
      console.log(`      [${it.name}] ${it.category} | refs=${JSON.stringify(it.evidence_refs)} | ${it.confidence}`);
    }
  }
  record('B_json_normal', {
    status: r.overallValid ? 'SUCCESS' : 'PARSED_BUT_INVALID',
    httpStatus: r.httpStatus,
    durationMs: elapsed,
    model: r.model,
    jsonParseOk: r.jsonParse.ok,
    structureValid: r.structure?.valid ?? null,
    itemErrors: r.itemErrors,
    overallValid: r.overallValid,
    usage: r.usage,
    parsed: r.parsed,
    contentPreview: String(r.content).slice(0, 1200),
  });
} catch (e) {
  bad(`${e.code || 'ERROR'} · HTTP ${e.httpStatus ?? '—'} · ${e.message}`);
  if (e.detail) console.log(`    详情: ${JSON.stringify(redact(e.detail)).slice(0, 400)}`);
  record('B_json_normal', { status: 'FAILED', code: e.code, httpStatus: e.httpStatus, message: e.message, detail: redact(e.detail) });
}

// 3.2 故意不合规（真实调用）
try {
  const t0 = Date.now();
  const r = await generateJson({ mode: 'badshape' });
  const elapsed = Date.now() - t0;
  ok(`不合规模式 HTTP ${r.httpStatus} · ${elapsed} ms`);
  info(`JSON.parse: ${r.jsonParse.ok ? '通过（上游确实返回了合法 JSON）' : '失败'}`);
  info(`结构校验: ${r.structure?.valid ? '通过 —— 诱导未命中，模型没照做（system 约束优先）' : `被正确拦截，缺失字段 [${r.structure?.missing?.join('、')}]`}`);
  info(`overallValid: ${r.overallValid}`);
  console.log(`      content: ${String(r.content).slice(0, 200)}`);
  record('B_json_badshape', {
    status: r.structure?.valid ? 'INDUCE_MISSED' : 'VALIDATOR_CAUGHT',
    httpStatus: r.httpStatus,
    durationMs: elapsed,
    jsonParseOk: r.jsonParse.ok,
    structureValid: r.structure?.valid ?? null,
    overallValid: r.overallValid,
    contentPreview: String(r.content).slice(0, 600),
    note: r.structure?.valid
      ? 'user prompt 诱导未生效：模型仍按 system 结构输出完整 JSON。说明结构约束稳定，但该用例未覆盖校验失败分支。'
      : '模型按要求输出了缺字段 JSON，校验器成功拦截。',
  });
} catch (e) {
  bad(`${e.code || 'ERROR'} · HTTP ${e.httpStatus ?? '—'} · ${e.message}`);
  record('B_json_badshape', { status: 'FAILED', code: e.code, httpStatus: e.httpStatus, message: e.message });
}

// 3.3 确定性注入：字段缺失（本地，不调 API）
{
  const r = simulateMissingField();
  ok('字段缺失模拟（未调用 API）');
  info(`jsonParse.ok: ${r.jsonParse.ok}（期望 true，因为注入的是合法 JSON）`);
  info(`structure.valid: ${r.structure?.valid}（期望 false）`);
  info(`缺失字段: ${JSON.stringify(r.structure?.missing)}`);
  info(`overallValid: ${r.overallValid}（期望 false）`);
  record('B_json_missing', {
    status: r.structure?.valid ? 'VALIDATOR_MISSED' : 'VALIDATOR_CAUGHT',
    simulated: true,
    jsonParseOk: r.jsonParse.ok,
    structureValid: r.structure?.valid ?? null,
    missing: r.structure?.missing ?? [],
    overallValid: r.overallValid,
  });
}

// 3.3 空内容（本地模拟，不消耗额度）
{
  const r = simulateEmptyContent();
  ok('空内容模拟（未调用 API）');
  info(`isEmptyContent: ${r.isEmptyContent}`);
  info(`jsonParse.ok: ${r.jsonParse.ok}（期望 false）`);
  info(`jsonParse.reason: ${r.jsonParse.reason}`);
  info(`overallValid: ${r.overallValid}（期望 false）`);
  record('B_json_empty', {
    status: 'HANDLED',
    simulated: true,
    isEmptyContent: r.isEmptyContent,
    jsonParseReason: r.jsonParse.reason,
    overallValid: r.overallValid,
  });
}

// ---------------------------------------------------------------- 4. 测试 C
head('4. 测试 C · DeepSeek Search');
try {
  const q = 'WHO food additives safety evaluation';
  const t0 = Date.now();
  const r = await search({ query: q, count: 3 });
  const elapsed = Date.now() - t0;
  ok(`HTTP ${r.httpStatus} · ${elapsed} ms · 返回 ${r.resultCount} 条`);
  info(`查询: ${q}`);
  info(`是否计费: ${r.billed ? '是' : '否'}`);
  r.results.forEach((it, i) => {
    console.log(`      ${i + 1}. ${it.title}`);
    console.log(`         ${it.url}`);
    console.log(`         站点=${it.siteName ?? '—'} 权威度=${it.authority ?? '—'} 相关度=${it.rerankScore ?? '—'}`);
    console.log(`         摘要: ${String(it.snippet).slice(0, 110)}`);
  });
  searchResults = r.results;
  record('C_search', {
    status: r.resultCount > 0 ? 'SUCCESS' : 'EMPTY_RESULT',
    httpStatus: r.httpStatus,
    durationMs: elapsed,
    query: q,
    resultCount: r.resultCount,
    billed: r.billed,
    results: r.results,
  });
} catch (e) {
  bad(`${e.code || 'ERROR'} · HTTP ${e.httpStatus ?? '—'} · ${e.message}`);
  if (e.detail) console.log(`    详情: ${JSON.stringify(redact(e.detail)).slice(0, 400)}`);
  record('C_search', { status: 'FAILED', code: e.code, httpStatus: e.httpStatus, message: e.message, detail: redact(e.detail) });
}

// ---------------------------------------------------------------- 5. 测试 D
head('5. 测试 D · DeepSeek Fetch');
if (!searchResults.length) {
  bad('没有可用的真实搜索结果，跳过 Fetch 测试（绝不使用伪造 URL）');
  record('D_fetch', { status: 'SKIPPED', reason: '测试 C 未返回结果，无真实 URL 可抓取' });
} else {
  // 优先挑权威度最高的一条
  const target = [...searchResults].sort((a, b) => (b.authority ?? -1) - (a.authority ?? -1))[0];
  info(`目标页面: ${target.title}`);
  info(`URL: ${target.url}`);
  try {
    const t0 = Date.now();
    const r = await fetchPage({ url: target.url });
    const elapsed = Date.now() - t0;
    ok(`HTTP ${r.httpStatus} · ${elapsed} ms · 正文 ${r.contentLength} 字符`);
    info(`标题: ${r.title}`);
    info(`是否计费: ${r.billed ? '是' : '否'}`);
    console.log('  ── 正文前 600 字 ──');
    console.log(
      String(r.contentPreview)
        .slice(0, 600)
        .split('\n')
        .map((l) => `  | ${l}`)
        .join('\n'),
    );
    record('D_fetch', {
      status: 'SUCCESS',
      httpStatus: r.httpStatus,
      durationMs: elapsed,
      url: r.url,
      title: r.title,
      contentLength: r.contentLength,
      billed: r.billed,
      contentPreview: String(r.contentPreview).slice(0, 1500),
    });
  } catch (e) {
    bad(`${e.code || 'ERROR'} · HTTP ${e.httpStatus ?? '—'} · ${e.message}`);
    info(`判定: ${e.detail?.verdict || 'API 层面失败'}`);
    if (e.detail) console.log(`    详情: ${JSON.stringify(redact(e.detail)).slice(0, 400)}`);
    record('D_fetch', {
      status: e.detail?.verdict === 'SITE_LEVEL_FAILURE' ? 'SITE_BLOCKED' : 'FAILED',
      code: e.code,
      httpStatus: e.httpStatus,
      message: e.message,
      detail: redact(e.detail),
    });
  }
}

// ---------------------------------------------------------------- 汇总
head('汇总');
for (const [k, v] of Object.entries(summary.tests)) {
  const icon = v.status === 'SUCCESS' ? '✓' : v.status === 'SKIPPED' ? '·' : '!';
  console.log(`  ${icon} ${k.padEnd(18)} ${v.status}`);
}
console.log('');

await mkdir(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(outFile, JSON.stringify(redact(summary), null, 2), 'utf8');
console.log(`结果已保存: ${outFile}（已脱敏，且 runtime-output/ 已被 .gitignore 排除）`);
