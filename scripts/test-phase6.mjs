/**
 * 第六阶段：可靠性 / 安全性 / 一致性测试（全部本地，零 API 费用）。
 *
 * 用法：node scripts/test-phase6.mjs
 *
 * 三类内容：
 *   1. 服务器故障注入 —— 用桩替换 globalThis.fetch，模拟 429/超时/坏 JSON/无结果，
 *      验证每条路径都有用户能看懂的中文错误码与文案。
 *   2. 独立 Express 实例 —— 验证 server 启动、404、16MB 请求体上限（413）。
 *   3. 安全与一致性 —— 密钥不入前端产物、日志不漏凭据、
 *      话术证据全部是 GB 28050—2011、未标示 ≠ 0。
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import sharp from 'sharp';

const pass = [];
const fail = [];

function t(id, name, fn) {
  return fn().then(
    () => pass.push(`${id} ${name}`),
    (e) => fail.push(`${id} ${name} — ${e.message}`),
  );
}

function eq(actual, expected, label = '') {
  assert.strictEqual(actual, expected, label ? `${label}: ${actual} != ${expected}` : '');
}

// ---------------------------------------------------------- fetch 桩基础设施

const originalFetch = globalThis.fetch;

/** 任何测试结束后都会恢复原始 fetch，防止桩泄漏到后续测试 */
function stubFetch(routes) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (u.includes(prefix)) return handler(u, init);
    }
    throw new Error(`桩没有覆盖的请求: ${u}`);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

process.on('exit', () => {
  globalThis.fetch = originalFetch;
});

function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  };
}

/** 生成一张真实 JPEG（sharp），保证能通过服务端图片校验 */
async function makeJpegBase64() {
  // 纯色 JPEG 压得很小，铺一层伪随机噪点把体积抬到 1KB 以上
  const buf = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 210, g: 210, b: 210 } },
  })
    .composite([
      {
        input: Buffer.from(
          Array.from({ length: 400 * 300 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]).flat(),
        ),
        raw: { width: 400, height: 300, channels: 3 },
      },
    ])
    .jpeg({ quality: 100 })
    .toBuffer();
  if (buf.length < 1024) throw new Error(`测试图太小: ${buf.length}B`);
  return buf.toString('base64');
}

const GOOD_JPEG_BASE64 = await makeJpegBase64();
const GARBAGE_BASE64 = Buffer.alloc(2048, 7).toString('base64'); // 够大但不是图片

// ---------------------------------------------------------- 通用桩数据

const SEARCH_OK = {
  id: 's-1',
  object: 'search_result',
  results: [
    {
      title: '氯化钾 GB 2760 条目',
      url: 'https://gb2760.cfsa.net.cn/node/1',
      snippet: '氯化钾 功能',
      // 正文要超过 MIN_SINGLE_CONTENT(300) 且总量足够，走 search_content 路径，不触发 Fetch
      content:
        // 测试桩：让同一份资料能匹配本文件里用到的多个虚拟成分名。
        '<p>本页用于测试：桩测试成分甲、桩测试成分乙、桩测试成分丙、桩测试成分丁、桩测试成分戊、桩测试成分己、桩测试成分庚。</p>' +
        '<p>氯化钾（potassium chloride），CNS 00.006，INS 508。' +
        '在 GB 2760-2024 中登记为食品添加剂，功能类别为其他。' +
        '允许在各类食品中按生产需要适量使用，具体范围以标准正文为准。' +
        '本品应在达到预期效果的前提下尽可能降低使用量，不得掩盖食品腐败变质或掺假。'.repeat(8) +
        '</p>',
      site_name: 'CFSA',
      authority: 4,
      rerank_score: 2.0,
    },
  ],
};

const CHAT_OK = {
  id: 'c-1',
  model: 'deepseek-flash',
  choices: [
    {
      message: {
        content: JSON.stringify({
          identity: { type: 'additive', label: '食品添加剂', note: '标准条目' },
          sections: [
            { id: 's1', section: 'what', text: '氯化钾是一种食品添加剂。', sourceRefs: ['W1'], limitations: null },
            { id: 's2', section: 'why', text: '用于补充钾离子等工艺目的。', sourceRefs: ['W1'], limitations: null },
          ],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

// ============================================================ 1. 视觉识别

console.log('\n【1】视觉识别故障路径');

await t('1.1', '上游 429 → UPSTREAM_RATE_LIMITED，中文文案', async () => {
  const { extractPackage } = await import('../server/providers/vision.js');
  stubFetch({ 'chat/completions': () => jsonRes(429, { error: { message: 'rate limited' } }) });
  try {
    await extractPackage({ provider: 'deepseek-vision', imageBase64: GOOD_JPEG_BASE64, mimeType: 'image/jpeg' });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_RATE_LIMITED', 'code');
    assert.ok(/限流/.test(e.message), `文案应含「限流」: ${e.message}`);
    assert.ok(/DeepSeek Vision/.test(e.message), '应注明 provider');
  } finally {
    restoreFetch();
  }
});

await t('1.2', '上游 502 → UPSTREAM_BAD_GATEWAY', async () => {
  const { extractPackage } = await import('../server/providers/vision.js');
  stubFetch({ 'chat/completions': () => jsonRes(502, { error: { message: 'bad gateway' } }) });
  try {
    await extractPackage({ provider: 'deepseek-vision', imageBase64: GOOD_JPEG_BASE64, mimeType: 'image/jpeg' });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_BAD_GATEWAY', 'code');
  } finally {
    restoreFetch();
  }
});

await t('1.3', '连接超时 → UPSTREAM_TIMEOUT，用户可理解', async () => {
  const { extractPackage } = await import('../server/providers/vision.js');
  stubFetch({
    'chat/completions': async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    },
  });
  try {
    await extractPackage({ provider: 'deepseek-vision', imageBase64: GOOD_JPEG_BASE64, mimeType: 'image/jpeg' });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_TIMEOUT', 'code');
    assert.ok(/超时/.test(e.message), `文案应含「超时」: ${e.message}`);
  } finally {
    restoreFetch();
  }
});

await t('1.4', '坏图片 → 400 UNREADABLE_IMAGE（不是 500）', async () => {
  const { extractPackage } = await import('../server/providers/vision.js');
  try {
    await extractPackage({ provider: 'deepseek-vision', imageBase64: GARBAGE_BASE64, mimeType: 'image/jpeg' });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UNREADABLE_IMAGE', 'code');
    eq(e.httpStatus, 400, 'httpStatus');
  }
});

await t('1.5', '上游返回非 JSON 内容 → parsed=null，不抛裸 500', async () => {
  const { extractPackage } = await import('../server/providers/vision.js');
  stubFetch({
    'chat/completions': () =>
      jsonRes(200, { choices: [{ message: { content: '这不是JSON' }, finish_reason: 'stop' }], usage: {} }),
  });
  try {
    const d = await extractPackage({ provider: 'deepseek-vision', imageBase64: GOOD_JPEG_BASE64, mimeType: 'image/jpeg' });
    eq(d.parsed, null, 'parsed 应为 null');
    eq(d.jsonParse.ok, false, 'jsonParse.ok');
  } finally {
    restoreFetch();
  }
});

// ============================================================ 2. 成分研究

console.log('\n【2】成分研究故障路径');

await t('2.1', '正常链路（桩）：ok + 全部结论通过校验', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  stubFetch({
    '/search': () => jsonRes(200, SEARCH_OK),
    'chat/completions': () => jsonRes(200, CHAT_OK),
  });
  try {
    const d = await researchIngredient({ name: '桩测试成分甲', force: true });
    eq(d.status, 'ok', 'status');
    eq(d.sections.length, 2, '结论数');
    eq(d.scienceStats.rejected, 0, '科学检查拒绝数');
    eq(d.fetchCount, 0, '正文足够时不应 Fetch');
  } finally {
    restoreFetch();
  }
});

await t('2.2', 'Search 无结果 → no_source，不抛错', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  stubFetch({ '/search': () => jsonRes(200, { results: [] }) });
  try {
    const d = await researchIngredient({ name: '桩测试成分乙', force: true });
    eq(d.status, 'no_source', 'status');
    eq(d.sources.length, 0, '来源应为空');
  } finally {
    restoreFetch();
  }
});

await t('2.3', 'Search 429 且本地无条目 → 抛 UPSTREAM_RATE_LIMITED（不伪装成没资料）', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  stubFetch({ '/search': () => jsonRes(429, { error: { message: 'rate' } }) });
  try {
    await researchIngredient({ name: '桩测试成分丙', force: true });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_RATE_LIMITED', 'code');
    assert.ok(/限流/.test(e.message), e.message);
  } finally {
    restoreFetch();
  }
});

await t('2.4', 'Chat 返回非 JSON → status=failed，notes 说明原因', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  stubFetch({
    '/search': () => jsonRes(200, SEARCH_OK),
    'chat/completions': () =>
      jsonRes(200, { choices: [{ message: { content: '模型没按要求输出' }, finish_reason: 'stop' }] }),
  });
  try {
    const d = await researchIngredient({ name: '桩测试成分丁', force: true });
    eq(d.status, 'failed', 'status');
    assert.ok((d.notes || []).length > 0, '应有 notes');
  } finally {
    restoreFetch();
  }
});

await t('2.5', 'Chat 输出被截断 → failed 且标注截断', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  stubFetch({
    '/search': () => jsonRes(200, SEARCH_OK),
    'chat/completions': () =>
      jsonRes(200, {
        choices: [
          {
            message: { content: '{"sections":[{"id":"s1","text":"被截断的' },
            finish_reason: 'length',
          },
        ],
        usage: {},
      }),
  });
  try {
    const d = await researchIngredient({ name: '桩测试成分戊', force: true });
    eq(d.status, 'failed', 'status');
    assert.ok((d.notes || []).join('；').includes('截断'), 'notes 应说明截断');
  } finally {
    restoreFetch();
  }
});

await t('2.6', '未配置 API Key → MISSING_API_KEY 预检，不发任何请求', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  const { config } = await import('../server/config.js');
  const saved = config.deepseek.apiKey;
  config.deepseek.apiKey = '';
  stubFetch({
    '/search': () => {
      throw new Error('不应发起任何上游请求');
    },
  });
  try {
    await researchIngredient({ name: '桩测试成分己', force: true });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'MISSING_API_KEY', 'code');
    assert.ok(/DEEPSEEK_API_KEY/.test(e.message), e.message);
  } finally {
    config.deepseek.apiKey = saved;
    restoreFetch();
  }
});

await t('2.7', '并发去重：两个相同请求只走一次上游', async () => {
  const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
  let searchCalls = 0;
  stubFetch({
    '/search': async () => {
      searchCalls += 1;
      await new Promise((r) => setTimeout(r, 120));
      return jsonRes(200, SEARCH_OK);
    },
    'chat/completions': () => jsonRes(200, CHAT_OK),
  });
  try {
    // 不带 force：in-flight 去重只作用在正常入口上
    const [a, b] = await Promise.all([
      researchIngredient({ name: '桩测试成分庚' }),
      researchIngredient({ name: '桩测试成分庚' }),
    ]);
    // 一次分析按缺口推进若干轮（≤5），去重后仍应只跑「一次分析」的量
    assert.ok(searchCalls >= 3 && searchCalls <= 5, `两个并发请求应共用一次分析，实际检索 ${searchCalls} 轮`);
    eq(a.sections.length, b.sections.length, '两个调用应拿到同一份结果');
  } finally {
    restoreFetch();
  }
});

// ============================================================ 3. 独立服务器

console.log('\n【3】独立服务器实例（启动 / 404 / 413）');

await t('3.1', 'server 启动 + /api/health + 404 + 16MB 上限 413', async () => {
  restoreFetch(); // 防御：此测试必须走真实网络
  const { createApp } = await import('../server/app.js');
  const app = createApp();
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const h = await (await fetch(`${base}/api/health`)).json();
    eq(h.ok, true, 'health ok');

    const nf = await fetch(`${base}/api/no-such`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer offline-http-fixture' }, body: '{}' });
    eq(nf.status, 404, '未知接口 404');

    const big = JSON.stringify({ pad: 'x'.repeat(17 * 1024 * 1024) });
    const tooBig = await fetch(`${base}/api/ingredient/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer offline-http-fixture' },
      body: big,
    });
    eq(tooBig.status, 413, '超限应 413');
    const j = await tooBig.json();
    eq(j.error.code, 'PAYLOAD_TOO_LARGE', '错误码');
    assert.ok(/压缩|过大/.test(j.error.message), '中文提示');
  } finally {
    server.close();
  }
});

// ============================================================ 4. 安全与一致性

console.log('\n【4】安全与一致性');

await t('4.1', '生产构建产物不含 API Key', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const files = (await readdir('dist/assets')).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
  assert.ok(files.length > 0, '应有构建产物（先 npm run build）');
  for (const f of files) {
    const s = await readFile(`dist/assets/${f}`, 'utf8');
    assert.ok(!/sk-[A-Za-z0-9_-]{10,}/.test(s), `${f} 中发现疑似密钥`);
  }
});

await t('4.2', 'redact 覆盖 Authorization / sk- / api_key 三类泄漏', async () => {
  const { redact } = await import('../server/lib/redact.js');
  const out = redact({
    authorization: 'Bearer sk-abcdef1234567890',
    note: 'key=sk-zzzzzzzzzzzz url?api_key=sk-yyyyyyyyyy',
    nested: { 'api-key': 'should-not-matter', text: 'Bearer token123456789' },
  });
  const s = JSON.stringify(out);
  assert.ok(!s.includes('sk-abcdef'), '对象键 authorization 未脱敏');
  assert.ok(!s.includes('sk-zzzz'), 'key= 形式未脱敏');
  assert.ok(!s.includes('sk-yyyy'), 'api_key= 形式未脱敏');
  assert.ok(!s.includes('token123456789'), 'Bearer 未脱敏');
});

await t('4.3', '上游错误详情不含完整凭据', async () => {
  const { assertUpstreamOk } = await import('../server/lib/upstream.js');
  const fakeRes = {
    ok: false,
    status: 401,
    data: { error: { message: 'bad key' } },
    text: '{"error":{"message":"bad key"}}',
    durationMs: 5,
  };
  try {
    assertUpstreamOk(fakeRes, { provider: 'X', endpoint: 'https://api.example.com/v1/x' });
    throw new Error('应当抛错');
  } catch (e) {
    const s = JSON.stringify(e.toJSON());
    assert.ok(!/Bearer\s+[A-Za-z0-9]/.test(s), 'detail 不应带凭据');
    assert.ok(!s.includes('sk-'), 'detail 不应带密钥');
  }
});

await t('4.4', '图片不会被写盘：服务端无任何图片持久化调用', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['server/app.js', 'server/providers/vision.js', 'server/lib/imagePrep.js']) {
    const s = await readFile(f, 'utf8');
    assert.ok(!/writeFile|createWriteStream/.test(s), `${f} 不应写文件`);
  }
});

await t('4.5', '话术规则的证据全部来自 GB 28050—2011；2025 版仅作提示', async () => {
  const { STANDARDS, resolveEvidence } = await import('../src/domain/claims/evidence.js');
  // 2025 版注册条目必须明确标注「未实施 / 不用于判定」
  assert.ok(/尚未实施|不用于/.test(STANDARDS['GB28050-2025'].status + STANDARDS['GB28050-2025'].note), '2025 版应标注不用于判定');

  const { analyzeClaims } = await import('../src/domain/claims/index.js');
  const rec = {
    status: 'confirmed',
    claims: [{ id: 'c1', text: '0 脂肪', source: 'manual' }],
    nutrition: {
      basis: 'per_100ml',
      items: [{ id: 'n1', key: 'fat', name: '脂肪', value: 0, unit: 'g', presence: 'labeled' }],
    },
    ingredients: { items: [] },
  };
  const a = analyzeClaims(rec, { servingAmount: 500 });
  for (const ev of resolveEvidence(a[0].evidence)) {
    const std = STANDARDS[ev.standard];
    assert.ok(std.code.includes('2011'), `证据 ${std.code} 应为 2011 版`);
  }
});

await t('4.6', '未标示 ≠ 0：话术引擎对 null 与 0 区别对待', async () => {
  const { analyzeClaims } = await import('../src/domain/claims/index.js');
  const mk = (fat) => ({
    status: 'confirmed',
    claims: [{ id: 'c1', text: '0 脂肪', source: 'manual' }],
    nutrition: {
      basis: 'per_100ml',
      items: [{ id: 'n1', key: 'fat', name: '脂肪', value: fat, unit: 'g', presence: fat === null ? 'unreadable' : 'labeled' }],
    },
    ingredients: { items: [] },
  });
  const zero = analyzeClaims(mk(0), { servingAmount: 500 })[0];
  const unknown = analyzeClaims(mk(null), { servingAmount: 500 })[0];
  assert.ok(zero.calculation, '脂肪=0 应有理论上限计算');
  assert.ok(!unknown.calculation, '脂肪未识别不得编造计算');
  eq(unknown.status, 'insufficient', '未识别应判信息不足');
});

console.log(`\n结果：${pass.length} 通过 / ${fail.length} 失败\n`);
for (const f of fail) console.log('  ✗', f);
process.exit(fail.length === 0 ? 0 : 1);
