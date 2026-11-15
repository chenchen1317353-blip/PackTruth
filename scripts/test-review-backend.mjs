/** Independent review regressions. All upstream calls are replaced; no real API or photos. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.DOTENV_CONFIG_PATH = '.missing-offline-review-env';
process.env.DEEPSEEK_API_KEY = 'offline-review-placeholder';
const targetRoot = process.env.REVIEW_BASELINE ? resolve(process.env.REVIEW_BASELINE) : fileURLToPath(new URL('../', import.meta.url));
const fromTarget = (path) => import(pathToFileURL(resolve(targetRoot, path)).href);
const { researchIngredient, clearResearchCache, deriveAliases, buildDegradedBrief } = await fromTarget('server/providers/ingredientResearch.js');
const { redact } = await fromTarget('server/lib/redact.js');
const { postJson } = await fromTarget('server/lib/upstream.js');
const { checkIdentityLabel, validateScientificClaims, partitionByScienceCheck } = await fromTarget('src/domain/evidence/scientificGuard.js');
const { verifyCitations } = await fromTarget('src/domain/evidence/citationGuard.js');
const originalFetch = globalThis.fetch;
const results = [];
const response = (status, data) => ({ ok: status === 200, status, headers: new Headers(), text: async () => JSON.stringify(data) });
const evidence = [{ id: 'W1', sourceType: 'search_content', excerpt: '中文名称 | 碳酸氢钠 | CNS | 06.001 | INS | 500 | 功能 | 膨松剂 | 食品添加剂标准' }];
const opts = (productName = '产品甲', aliases = []) => ({ name: '独立审查测试原料', aliases, foodContext: { category: '饮料', productName } });
function mockResearch() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    if (String(url).endsWith('/search')) return response(200, { results: [{
      title: '食品添加剂标准', url: 'https://www.nhc.gov.cn/offline-review',
      content: '独立审查测试原料属于食品添加剂，具体用途应结合食品类别。'.repeat(40),
    }] });
    if (String(url).endsWith('/chat/completions')) return response(200, { choices: [{ message: { content: JSON.stringify({
      identity: { type: 'uncertain', label: '暂无法确定' },
      brief: { what: '测试原料具有食品用途。', why: '具体用途应结合食品类别。', howToUnderstand: '不能据此判断具体食品合规性。', sourceRefs: ['W1'] },
      sections: [{ id: 's1', section: 'what', text: '测试原料具有食品用途。', sourceRefs: ['W1'] }],
    }) } }] });
    throw new Error('Unmocked upstream call');
  };
  return calls;
}
async function test(name, fn) {
  clearResearchCache();
  globalThis.fetch = async () => { throw new Error('Network disabled in review test'); };
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e.message }); }
}

await test('B1 different product names never share cached explanations', async () => {
  const calls = mockResearch();
  await researchIngredient(opts());
  const second = await researchIngredient(opts('产品乙'));
  assert.equal(second.cached, false);
  assert.ok(calls.filter(c => c.url.endsWith('/chat/completions')).length >= 4);
  assert.ok(calls.length <= 36);
});
await test('B1 changed aliases never share cached searches', async () => {
  mockResearch();
  await researchIngredient(opts('产品甲', ['first alias']));
  assert.equal((await researchIngredient(opts('产品甲', ['second alias']))).cached, false);
});
await test('B1 long product names remain distinct in flight', async () => {
  const calls = mockResearch();
  const prefix = '同类食品'.repeat(6);
  await Promise.all([researchIngredient(opts(prefix + '甲')), researchIngredient(opts(prefix + '乙'))]);
  assert.ok(calls.filter(c => c.url.endsWith('/chat/completions')).length >= 4);
  assert.ok(calls.length <= 36);
});
await test('B1 identical requests retain deduplication and cache', async () => {
  const calls = mockResearch();
  const [, second] = await Promise.all([researchIngredient(opts()), researchIngredient(opts())]);
  assert.equal(second.deduped, true);
  assert.equal((await researchIngredient(opts())).cached, true);
  const beforeReuse = calls.length;
  await researchIngredient(opts());
  assert.equal(calls.length, beforeReuse);
});
await test('B2 research response preserves shared source objects', async () => {
  mockResearch();
  const result = await researchIngredient(opts());
  const safe = redact(result);
  assert.equal(safe.brief.sources[0].id, 'W1');
  assert.equal(safe.sections[0].sources[0].id, 'W1');
});
await test('B2 true cycles remain blocked and secrets remain redacted', () => {
  const shared = { text: 'sk-FAKEONLY123456789' };
  const obj = { a: shared, b: shared }; obj.self = obj;
  const safe = redact(obj);
  assert.equal(safe.self, '[circular]');
  assert.deepEqual(safe.a, safe.b);
  assert.ok(!JSON.stringify(safe).includes('FAKEONLY'));
});
await test('B3 ingredient regex punctuation is literal', () => {
  for (const name of ['复配剂(', '维生素[', '配料.*', '成分\\']) {
    assert.ok(deriveAliases(name, [{ excerpt: `${name}（test ingredient）` }]).includes('test ingredient'));
  }
});
await test('B4 fallback 429 remains a service error when evidence is absent', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response(200, { results: [] }) : response(429, { error: { message: 'limited' } });
  await assert.rejects(researchIngredient(opts()), e => e.code === 'UPSTREAM_RATE_LIMITED');
  assert.equal(calls, 2);
});
await test('B4 bounded empty assessment and population searches remain no_source', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(200, { results: [] }); };
  assert.equal((await researchIngredient(opts())).status, 'no_source');
  assert.equal(calls, 5); // Unknown-name discovery + assessments and an explicit population search.
});
await test('B5 response-body timeout receives the upstream timeout code', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => { throw new DOMException('Aborted', 'AbortError'); } });
  await assert.rejects(postJson('https://offline.invalid', { timeoutMs: 1 }), e => e.code === 'UPSTREAM_TIMEOUT' && e.httpStatus === 502);
});
await test('B6 rejected function cannot survive in identity note', () => {
  const out = checkIdentityLabel({ identity: { type: 'additive', label: '食品添加剂 · 抗结剂', note: '碳酸氢钠是一种抗结剂。' }, ingredientName: '碳酸氢钠', evidenceSet: evidence });
  assert.ok(!out.label.includes('抗结剂'));
  assert.ok(!out.note || !out.note.includes('抗结剂'));
});
await test('B6 mismatched codes cannot survive label or note', () => {
  const out = checkIdentityLabel({ identity: { type: 'additive', label: '食品添加剂 CNS 99.999', note: '标准编号 CNS 99.999。' }, ingredientName: '碳酸氢钠', evidenceSet: evidence });
  assert.ok(!out.label.includes('99.999'));
  assert.ok(!out.note || !out.note.includes('99.999'));
  assert.equal(out.checked.status, 'review');
});
await test('B6 supported identity still retains original text', () => {
  const identity = { type: 'additive', label: '食品添加剂 · 膨松剂', note: 'CNS 06.001，INS 500。' };
  const out = checkIdentityLabel({ identity, ingredientName: '碳酸氢钠', evidenceSet: evidence });
  assert.equal(out.label, identity.label); assert.equal(out.note, identity.note);
});
await test('B8 unreferenced general text never becomes verified brief content', () => {
  const verified = verifyCitations({ aiOutput: { sections: [{ id: 'general', section: 'what', text: '这是用于改善食品质地的原料。', sourceRefs: [] }] }, evidenceSources: evidence });
  const { passed, review } = partitionByScienceCheck(validateScientificClaims({ claims: verified.sections, evidenceSet: evidence, ingredientName: '测试原料' }));
  assert.equal(verified.sections[0].verified, false);
  assert.equal(buildDegradedBrief([...passed, ...review]), null);
});
await test('B8 general text cannot displace a later cited statement', () => {
  const brief = buildDegradedBrief([
    { id: 'general', section: 'what', text: '没有来源的概括。', verified: false, tier: 'general', sourceRefs: [] },
    { id: 'cited', section: 'what', text: '引用支持的原句。', verified: true, tier: 'cited', sourceRefs: ['W1'], sources: evidence },
  ]);
  assert.equal(brief.what, '引用支持的原句。');
  assert.deepEqual(brief.derivedFrom, ['cited']);
});

globalThis.fetch = originalFetch;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`);
console.log(`${results.filter(r => r.ok).length}/${results.length} passed; upstream fully mocked`);
process.exitCode = results.every(r => r.ok) ? 0 : 1;
