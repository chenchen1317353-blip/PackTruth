/**
 * V6.1 搜索兜底机制测试（全部桩注入，零 API 费用）。
 *
 * 用法：node scripts/test-phase6-fallback.mjs
 *
 * 覆盖指令要求的五种情况 + 去重/编号/长度/缓存/通用性：
 *   A. 首轮证据充分 → 不触发兜底（1 次 Search）
 *   B. 首轮跨领域（模拟氯化钾真实场景）→ 兜底 1 次 → 合并去重 → ok
 *   C. 两轮均无食品资料 → no_source，措辞不声称「没有权威资料」
 *   D. 首轮 429 → 服务故障处理，绝不触发第二次收费搜索
 *   E. 本地有条目 + 联网失败 → 降级本地，保留解释，不兜底
 *   另：查询长度 128、两轮词不同、need_content、URL 去重、编号连续、缓存复用、非氯化钾成分通用性。
 */

import assert from 'node:assert/strict';

const pass = [];
const fail = [];

function t(id, name, fn) {
  return fn().then(
    () => pass.push(`${id} ${name}`),
    (e) => fail.push(`${id} ${name} — ${e.message}`),
  );
}

function eq(a, b, label = '') {
  assert.strictEqual(a, b, label ? `${label}: ${a} != ${b}` : '');
}

const originalFetch = globalThis.fetch;

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

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
});

/** 构造一条长正文搜索结果（>300 字符，走 search_content 路径） */
function hit(url, title, content) {
  return { title, url, snippet: title.slice(0, 30), content, site_name: 'x', authority: 4, rerank_score: 2 };
}

// —— 首轮「权威但与食品无关」的资料（主题取自真实检索场景：水质/皮肤/尿液/职业环境/肥料）——
// 注意：正文措辞必须避开 FOOD_MARKERS（食品/food/配料/…），否则相关性检查会误判为食品相关。
const AGRI = (tag) => [
  hit(
    `https://www.fao.org/agri/${tag}`,
    'Fish tilapia aquaculture water quality management',
    '鱼菜共生系统中的碳酸盐硬度调节。碳酸氢盐常用于水产养殖水质管理，提高循环系统的缓冲能力。农业灌溉与水体硬度监测是种植系统的日常操作，日常巡塘与投喂管理同样重要。'.repeat(6),
  ),
  hit(
    `https://pubmed.ncbi.nlm.nih.gov/${tag}-skin`,
    'Topical use for skin cleaning with catheters',
    '皮肤清洁与中央静脉导管的随机对照研究。比较了表面消毒方案对皮肤油脂的清除效果，属于医疗护理领域，观察终点为导管相关菌落定植。'.repeat(6),
  ),
  hit(
    `https://pubmed.ncbi.nlm.nih.gov/${tag}-urine`,
    'Urinary citrate excretion in stone formers',
    '口服补充剂对尿液柠檬酸排泄的影响研究。受试者为肾结石患者，观察尿液指标变化，属于临床医学研究，随访周期为三天。'.repeat(6),
  ),
  hit(
    `https://www.who.int/occupational/${tag}`,
    'Occupational exposure in industrial water treatment plants',
    '工业水处理车间中的化合物职业暴露评估。讨论冷却塔排污水车间的通风与职业健康监护，属于职业卫生范畴，涉及车间浓度限值与个体防护。'.repeat(6),
  ),
  hit(
    `https://www.fao.org/soil/${tag}`,
    'Soil fertilizer and crop nutrient management',
    '农田施肥与作物养分管理技术手册。讨论氮磷钾配比与土壤改良，其中鱼菜共生基质一节介绍基质栽培的养分补充方案。'.repeat(6),
  ),
];

// —— 食品相关资料（模拟 CFSA 条目 / WHO 指南类，可支撑身份与用途）——
const FOOD_MAIN = (tag, name) =>
  hit(
    `https://gb2760.cfsa.net.cn/node/${tag}`,
    `${name} GB 2760-2024 条目`,
    `${name}在 GB 2760-2024《食品添加剂使用标准》中登记为食品添加剂，功能类别为其他。允许在各类食品中按生产需要适量使用，使用时应符合良好生产规范：工艺上确有必要、在达到预期效果的前提下尽可能降低使用量。`.repeat(6),
  );
const FOOD_WHO = (tag, name) =>
  hit(
    `https://www.who.int/publications/${tag}`,
    `WHO guidance on food uses of ${name}`,
    `世界卫生组织发布的指导意见提到，${name}在某些食品（如特定盐类替代品）中存在使用情境。该文件同时强调适用范围与人群限制，不能外推为普遍建议，也不代表任何具体产品合规。`.repeat(6),
  );

const chatRes = (name) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          identity: { type: 'additive', label: '食品添加剂', note: '依据标准条目' },
          sections: [
            { id: 's1', section: 'what', text: `${name}是一种食品添加剂。`, sourceRefs: ['W1'], limitations: null },
            { id: 's2', section: 'why', text: `${name}在食品中按标准登记的功能使用。`, sourceRefs: ['W2'], limitations: null },
          ],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 60 },
});

/** 记录 search 调用（次数、查询词、need_content） */
function makeSearchRecorder() {
  return { calls: [], handler(prefix, results) {} };
}

function searchStub(rec, rounds) {
  // rounds: 按调用顺序返回的结果数组
  let i = 0;
  return {
    '/search': async (url, init) => {
      const body = JSON.parse(init?.body || '{}');
      rec.calls.push({ query: body.query, needContent: body.need_content, count: body.count });
      const r = rounds[Math.min(i, rounds.length - 1)];
      i += 1;
      return jsonRes(200, { results: typeof r === 'function' ? r() : r });
    },
  };
}

// ============================================================ A. 首轮充分

console.log('\n【A】首轮证据充分');

await t('A1', '首轮只有技术标准、没有健康评估 → 自动继续补健康，而不是停在标准上', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [FOOD_MAIN('a1', '测试成分甲'), FOOD_WHO('a2', '测试成分甲')]]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分甲')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分甲', force: true });
    // V2.4：GB 2760 技术标准不算健康评估，程序会按缺口继续查 normal / high；
    // 同一批结果重复返回时，连续两轮没有新增即停止。
    assert.ok(rec.calls.length >= 3 && rec.calls.length <= 5, `Search 次数应在 3–5，实际 ${rec.calls.length}`);
    eq(d.fallback.triggered, true, '应触发后续检索');
    eq(d.searchRounds, rec.calls.length, '轮次');
    assert.ok(
      d.researchRounds.map((r) => r.focus).slice(0, 3).join(',') === 'identity,normal,high',
      `检索目标应按缺口推进，实际 ${d.researchRounds.map((r) => r.focus).join(',')}`,
    );
    assert.ok(
      ['no_new_evidence', 'gaps_remain', 'evidence_sufficient'].includes(d.researchStopReason),
      `停止原因异常：${d.researchStopReason}`,
    );
    eq(d.status, 'ok', 'status');
    eq(d.fetchCount, 0, '不应 Fetch');
  } finally {
    restoreFetch();
  }
});

// ============================================================ B. 首轮跨领域 → 兜底成功

console.log('\n【B】首轮跨领域，兜底成功（模拟氯化钾场景）');

await t('B1', '首轮 5 条全无关 → 先补身份，再按健康缺口继续，查询互不相同且均 ≤128', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => AGRI('b1'), () => [FOOD_MAIN('b9', '测试成分乙'), FOOD_WHO('b8', '测试成分乙')]]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分乙')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分乙', aliases: ['test substance'], force: true });
    assert.ok(rec.calls.length >= 2 && rec.calls.length <= 5, `Search 应在 2–5 轮内，实际 ${rec.calls.length}`);
    eq(d.fallback.triggered, true, '应触发后续检索');
    eq(d.searchRounds, rec.calls.length, '轮次');
    assert.ok(rec.calls[0].query !== rec.calls[1].query, '第二次查询与第一次应有实际差别');
    for (const c of rec.calls) {
      assert.ok(c.query.length <= 128, `查询超长: ${c.query.length}`);
      eq(c.needContent, true, 'need_content 应始终开启');
    }
    assert.ok(
      /测试成分乙|test substance/i.test(rec.calls[1].query) &&
        /JECFA|EFSA|safety|evaluation|评估/i.test(rec.calls[1].query),
      `第二次查询应围绕成分 + 健康评估构造，实际：${rec.calls[1].query}`,
    );
    assert.ok(d.status === 'ok' || d.status === 'partial', `合并后应能生成解读，实际 ${d.status}`);
    assert.ok(d.sections.length >= 2, '应有两轮合并后的结论');
  } finally {
    restoreFetch();
  }
});

await t('B2', '多轮 URL 去重：重复来源不重复收录，W 编号连续不混淆', async () => {
  const rec = { calls: [] };
  const dupUrl = 'https://gb2760.cfsa.net.cn/node/b9';
  stubFetch({
    ...searchStub(rec, [
      () => AGRI('b2'),
      () => [FOOD_MAIN('b9', '测试成分丙'), FOOD_WHO('b7', '测试成分丙'), { ...FOOD_MAIN('b9', '测试成分丙') }],
    ]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分丙')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分丙', force: true });
    // 身份轮收到 3 条（其中 1 条重复 URL），去重后应只新增 2 条
    const identityRound = d.researchRounds.find((r) => r.resultCount === 3);
    eq(identityRound?.addedCount, 2, '重复 URL 应被去重（新增 2 条而非 3 条）');
    const urls = d.sources.filter((s) => s.sourceType !== 'verified_local').map((s) => s.url);
    eq(new Set(urls).size, urls.length, '来源 URL 应唯一');
    const wIds = d.sources.filter((s) => /^W\d+$/.test(s.id)).map((s) => s.id);
    eq(wIds.length, new Set(wIds).size, 'W 编号不应重复');
    // 编号应从 W1 连续分配
    const nums = wIds.map((w) => Number(w.slice(1))).sort((a, b) => a - b);
    nums.forEach((n, i) => eq(n, i + 1, '编号连续'));
  } finally {
    restoreFetch();
  }
});

await t('B3', '兜底不引入白名单之外的来源；被拦结果如实记录', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [
      () => AGRI('b3'),
      () => [
        FOOD_MAIN('b6', '测试成分丁'),
        hit('https://baike.baidu.com/item/x', '百度百科条目', '食品用途相关内容'.repeat(40)),
      ],
    ]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分丁')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分丁', force: true });
    assert.ok(
      d.sources.every((s) => s.sourceType === 'verified_local' || /cfsa|who|nhc|fao|pubmed|agris/.test(s.url || '')),
      '来源应全部在白名单域内',
    );
    assert.ok(d.blocked.length >= 1, '百科来源应被记录为拦截');
  } finally {
    restoreFetch();
  }
});

// ============================================================ C. 两轮均无食品资料

console.log('\n【C】兜底后仍无资料');

await t('C1', '多轮均无关 → no_source，措辞不声称「没有权威科学资料」', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => AGRI('c1'), () => AGRI('c2')]),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分戊', force: true });
    eq(d.status, 'no_source', 'status');
    assert.ok(rec.calls.length >= 2 && rec.calls.length <= 5, `检索应在 2–5 轮内，实际 ${rec.calls.length}`);
    eq(d.searchRounds, rec.calls.length, '轮次');
    const allNotes = (d.notes || []).join('；');
    assert.ok(!/没有权威科学资料|科学界没有研究/.test(allNotes), '不得声称「没有权威资料存在」');
    assert.ok(/轮检索/.test(allNotes), '应说明已经检索了几轮');
    assert.ok(!d.brief, '不应生成简明版');
    eq(d.sections.length, 0, '不应生成结论');
  } finally {
    restoreFetch();
  }
});

// ============================================================ D. 上游服务故障

console.log('\n【D】服务故障不触发兜底');

await t('D1', '首轮 429 → 抛 UPSTREAM_RATE_LIMITED，绝不发起第二次收费搜索', async () => {
  const rec = { calls: [] };
  stubFetch({
    '/search': async (url, init) => {
      const body = JSON.parse(init?.body || '{}');
      rec.calls.push(body.query);
      return jsonRes(429, { error: { message: 'rate' } });
    },
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    await researchIngredient({ name: '测试成分己', force: true });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_RATE_LIMITED', 'code');
    assert.ok(/限流/.test(e.message), e.message);
    eq(rec.calls.length, 1, '429 后不应再搜索');
  } finally {
    restoreFetch();
  }
});

await t('D2', '首轮 502 → 同样按服务故障处理', async () => {
  const rec = { calls: [] };
  stubFetch({
    '/search': (url, init) => {
      rec.calls.push(JSON.parse(init?.body || '{}').query);
      return jsonRes(502, { error: { message: 'bad gateway' } });
    },
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    await researchIngredient({ name: '测试成分庚', force: true });
    throw new Error('应当抛错');
  } catch (e) {
    eq(e.code, 'UPSTREAM_BAD_GATEWAY', 'code');
    eq(rec.calls.length, 1, '不应兜底');
  } finally {
    restoreFetch();
  }
});

// ============================================================ E. 本地资料 + 联网失败

console.log('\n【E】本地资料在网络失败后保留');

await t('E1', '本地有条目 + 联网 429 → 降级本地，不兜底，本地证据保留', async () => {
  const rec = { calls: [] };
  stubFetch({
    '/search': (url, init) => {
      rec.calls.push(JSON.parse(init?.body || '{}').query);
      return jsonRes(429, { error: { message: 'rate' } });
    },
    // 本地证据存在时走完整链路，chat 用空结论桩（不校验 K 编号）
    'chat/completions': () =>
      jsonRes(200, {
        choices: [{ message: { content: JSON.stringify({ identity: null, sections: [] }) }, finish_reason: 'stop' }],
        usage: {},
      }),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    // 柠檬酸钠在本地基础条目里（V5.2 收录）
    const d = await researchIngredient({ name: '柠檬酸钠', force: true });
    eq(rec.calls.length, 1, '失败后不应兜底');
    eq(d.fallback.triggered, false, '服务故障不触发兜底');
    const local = d.sources.filter((s) => s.sourceType === 'verified_local');
    assert.ok(local.length > 0, '本地证据应保留');
    assert.ok((d.notes || []).join('；').includes('搜索失败'), 'notes 应保留失败说明');
    const allNotes = (d.notes || []).join('；');
    assert.ok(!/没有权威科学资料/.test(allNotes), '不得声称成分没有权威资料');
  } finally {
    restoreFetch();
  }
});

// ============================================================ 通用性与缓存

console.log('\n【F】通用性与缓存');

await t('F1', '非氯化钾成分（亚硝酸钠主题）同样触发兜底，机制不是特例', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => AGRI('f1'), () => [FOOD_MAIN('f9', '测试成分辛'), FOOD_WHO('f8', '测试成分辛')]]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分辛')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    const d = await researchIngredient({ name: '测试成分辛', aliases: ['test item'], force: true });
    assert.ok(d.searchRounds >= 3 && d.searchRounds <= 5, `应继续检索到缺口收敛，实际 ${d.searchRounds}`);
    assert.ok(rec.calls[1].query.includes('测试成分辛'), '第二次查询应围绕当前成分构造，而非固定词');
    eq(d.status, 'ok', 'status');
  } finally {
    restoreFetch();
  }
});

await t('F2', '同一成分短时间重开 → 命中缓存，不再新增上游调用', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => [FOOD_MAIN('f7', '测试成分壬'), FOOD_WHO('f6', '测试成分壬')]]),
    'chat/completions': () => jsonRes(200, chatRes('测试成分壬')),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    await researchIngredient({ name: '测试成分壬' }); // 无 force：写缓存
    const afterFirst = rec.calls.length;
    await researchIngredient({ name: '测试成分壬' }); // 无 force：命中缓存
    eq(rec.calls.length, afterFirst, '缓存命中不应再调上游');
    assert(afterFirst <= 5, `单次分析最多 5 轮，实际 ${afterFirst}`);
  } finally {
    restoreFetch();
  }
});

await t('F3', 'no_source 结果不入缓存，避免把失败钉死 30 分钟', async () => {
  const rec = { calls: [] };
  stubFetch({
    ...searchStub(rec, [() => []]),
  });
  try {
    const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
    await researchIngredient({ name: '测试成分癸' });
    const afterFirst = rec.calls.length;
    await researchIngredient({ name: '测试成分癸' });
    // 关键断言：第二次 research 是真实重查，而不是命中缓存。
    // 空结果下仍会按缺口尝试若干轮（≤5），所以只比较两次运行的增量。
    assert.ok(afterFirst >= 1, '第一次应至少检索一次');
    assert.ok(rec.calls.length > afterFirst, `no_source 不应被缓存，第二次应重新搜索（第一次 ${afterFirst}，总计 ${rec.calls.length}）`);
  } finally {
    restoreFetch();
  }
});

console.log(`\n结果：${pass.length} 通过 / ${fail.length} 失败\n`);
for (const f of fail) console.log('  ✗', f);
process.exit(fail.length === 0 ? 0 : 1);
