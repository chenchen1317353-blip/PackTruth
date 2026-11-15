import assert from 'node:assert/strict';
import sharp from 'sharp';
process.env.DOTENV_CONFIG_PATH = '.no-byok-test-env';
process.env.DEEPSEEK_API_KEY = 'developer-sentinel-never-use';
process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const { createApp } = await import('../server/app.js');
const { credentialScope } = await import('../server/lib/requestCredentials.js');
const { postJson } = await import('../server/lib/upstream.js');
const { search } = await import('../server/providers/deepseekSearch.js');
const { fetchPage } = await import('../server/providers/deepseekFetch.js');
const { chatJson } = await import('../server/providers/deepseekChat.js');
const { extractPackage } = await import('../server/providers/vision.js');
const { researchIngredient } = await import('../server/providers/ingredientResearch.js');
const realFetch = globalThis.fetch;
const logs = [];
const originalLog = console.log;
console.log = (...args) => logs.push(args.join(' '));
const A = 'synthetic-user-alpha', B = 'synthetic-user-beta';
const scope = (key, fn, maxCalls = 18) => credentialScope.run({ key, controller: new AbortController(), calls: 0, maxCalls }, fn);
const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let calls = [], mode = 'ok';
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, init);
  const u = new URL(url);
  assert.equal(u.origin, 'https://api.deepseek.com');
  calls.push({ path: u.pathname, auth: init.headers.Authorization, body: JSON.parse(init.body), signal: init.signal, redirect: init.redirect });
  if (mode === 'timeout') throw new DOMException('synthetic-secret', 'TimeoutError');
  if (typeof mode === 'number') return reply(mode, { error: { message: init.headers.Authorization } });
  if (u.pathname.endsWith('/search')) return reply(200, { results: mode === 'empty' ? [] : [{ title: '食品原料用途', url: 'https://www.nhc.gov.cn/byok-test', content: '测试原料在食品中的用途需要结合食品类别核对。'.repeat(80) }] });
  if (u.pathname.endsWith('/fetch')) return reply(200, { title: '测试资料', content: '食品用途资料' });
  return reply(200, { choices: [{ message: { content: JSON.stringify({ product: { name: '合成测试' }, ingredients: ['水'], nutrition: { basis: 'per_100ml', items: [] }, sections: [{ id: 's1', section: 'what', text: '具体用途需要结合食品类别。', sourceRefs: ['W1'] }] }) } }] });
};
const servers = [];
async function server(options = {}) { const s = createApp({ rateLimit: 1000, ...options }).listen(0, '127.0.0.1'); await new Promise(r => s.once('listening', r)); servers.push(s); return `http://127.0.0.1:${s.address().port}`; }
const base = await server();
const request = (path, key, body = {}, extra = {}, target = base) => fetch(target + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra }, body: JSON.stringify(body) });
let pass = 0, fail = 0;
async function test(name, fn) { calls = []; mode = 'ok'; try { await fn(); pass++; originalLog(`PASS ${name}`); } catch(e) { fail++; originalLog(`FAIL ${name}: ${e.message}`); } }
try {
  await test('无Key不回退开发者Key', async () => { assert.equal((await request('/api/vision/extract')).status, 401); assert.equal((await request('/api/ingredient/research')).status, 401); assert.equal(calls.length, 0); });
  const imageBase64 = (await sharp({ create: { width: 300, height: 300, channels: 3, background: '#669966' } }).png().toBuffer()).toString('base64');
  await test('四Provider使用请求凭据；图片经真实预处理和data URL路径', async () => {
    await scope(A, async () => {
      await extractPackage({ provider: 'deepseek-vision', imageBase64, mimeType: 'image/png' });
      await search({ query: '测试' }); await fetchPage({ url: 'https://www.nhc.gov.cn/test' }); await chatJson({ system: 'JSON', user: 'test' });
    });
    assert.equal(calls.length, 4); assert.ok(calls.every(c => c.auth === `Bearer ${A}` && c.redirect === 'error'));
    assert.match(calls[0].body.messages[1].content[0].image_url.url, /^data:image\//);
  });
  await test('HTTP Vision仅使用用户Key且拒绝MiMo与模型覆盖', async () => {
    assert.equal((await request('/api/vision/extract', A, { imageBase64, mimeType: 'image/png', model: 'attacker-model' })).status, 200);
    assert.equal(calls[0].auth, `Bearer ${A}`); assert.notEqual(calls[0].body.model, 'attacker-model');
    assert.equal((await request('/api/vision/extract', A, { provider: 'mimo' })).status, 403);
  });
  await test('A/B并发与相同输入不共享结果缓存或in-flight', async () => {
    const input = { name: '测试原料', foodContext: { productName: '食品甲' } };
    await Promise.all([scope(A, () => researchIngredient(input)), scope(B, () => researchIngredient(input))]);
    // 每次研究 = 1 次研究规划 + 1 次最终整理（这次桩内容没有健康证据，规划只调用 1 次）
    const chats = calls.filter(c => c.path.endsWith('/chat/completions')).length;
    assert.ok(chats >= 2 && chats <= 12, `Chat 调用应受限（2–12），实际 ${chats}`);
    assert.ok(calls.some(c => c.auth === `Bearer ${A}`)); assert.ok(calls.some(c => c.auth === `Bearer ${B}`));
    const before = calls.length; const again = await scope(A, () => researchIngredient(input)); assert.equal(again.cached, false); assert.ok(calls.length > before);
  });
  await test('空结果完成交叉与人群检索后停止，同一失败原文不重复', async () => {
    mode = 'empty'; await scope(A, () => researchIngredient({ name: '测试未知原料' })); assert.equal(calls.filter(c => c.path.endsWith('/search')).length, 4); assert.equal(calls.filter(c => c.path.endsWith('/chat/completions')).length, 1);
    calls = []; mode = 'ok'; await scope(A, () => researchIngredient({ name: '测试原料' })); assert.ok(calls.filter(c => c.path.endsWith('/fetch')).length <= 1, '同一未提供健康全文的地址最多尝试一次');
  });
  for (const [status, code] of [[401,'UPSTREAM_UNAUTHORIZED'],[402,'UPSTREAM_PAYMENT_REQUIRED'],[429,'UPSTREAM_RATE_LIMITED'],[503,'UPSTREAM_UNAVAILABLE']]) await test(`官方错误${status}明确且无Key回显`, async () => {
    mode = status; const res = await request('/api/vision/extract', A, { imageBase64, mimeType:'image/png' }); const text = await res.text(); assert.equal(JSON.parse(text).error.code, code); assert.ok(!text.includes(A));
  });
  await test('超时与取消阻止后续调用', async () => {
    mode = 'timeout'; await assert.rejects(scope(A, () => search({ query:'测试' })), e => e.code === 'UPSTREAM_TIMEOUT' && !JSON.stringify(e).includes(A));
    const controller = new AbortController(); controller.abort(); calls = [];
    await assert.rejects(credentialScope.run({ key:A, controller, calls:0, maxCalls:5 }, () => search({query:'测试'})), e => e.code === 'REQUEST_CANCELLED'); assert.equal(calls.length,0);
  });
  await test('可信地址白名单与单次调用预算', async () => {
    await assert.rejects(scope(A, () => postJson('https://evil.invalid/chat/completions')), e => e.code === 'UNTRUSTED_UPSTREAM');
    assert.equal(calls.length,0);
    await assert.rejects(scope(A, async () => { await search({query:'测试'}); await search({query:'测试'}); }, 1), e => e.code === 'CALL_BUDGET_EXCEEDED'); assert.equal(calls.length,1);
  });
  await test('生产HTTPS、同源、实验接口及任意代理保护', async () => {
    const prod = await server({production:true}); assert.equal((await request('/api/vision/extract', A, {}, {}, prod)).status,400);
    assert.equal((await request('/api/vision/extract', A, {}, {Origin:'https://evil.invalid'})).status,403);
    for (const path of ['/api/deepseek/fetch','/api/deepseek/json','/api/mimo/analyze','/api/vision/compare']) assert.equal((await request(path,A,{url:'http://127.0.0.1/'})).status,403);
    assert.equal(calls.length,0);
  });
  await test('IP频率限制与请求大小', async () => {
    const limited = await server({rateLimit:1}); await request('/api/vision/extract',null,{}, {},limited); assert.equal((await request('/api/vision/extract',A,{}, {},limited)).status,429);
    assert.equal((await request('/api/ingredient/research',A,{name:'x'.repeat(70000)})).status,413); assert.equal(calls.length,0);
  });
  await test('全局并发超限且完成后释放', async () => {
    const limited = await server({maxConcurrent:1}); const mock = globalThis.fetch; let release, entered;
    const waiting = new Promise(r=>entered=r);
    globalThis.fetch = async (url,init) => { if(String(url).startsWith('http://127.0.0.1:')) return realFetch(url,init); entered(); await new Promise(r=>release=r); return reply(401,{error:{message:'invalid'}}); };
    try { const first=request('/api/vision/extract',A,{imageBase64,mimeType:'image/png'}, {},limited); await waiting; assert.equal((await request('/api/vision/extract',B,{}, {},limited)).status,429); release(); await first; } finally {globalThis.fetch=mock;}
    assert.equal((await request('/api/vision/extract',A,{imageBase64,mimeType:'image/png'}, {},limited)).status,200);
  });
  await test('客户端断开传递取消且释放请求作用域Key', async () => {
    const mock = globalThis.fetch; const { currentCredentials } = await import('../server/lib/requestCredentials.js');
    let state, entered, aborted;const ready=new Promise(r=>entered=r);const cancelled=new Promise(r=>aborted=r);
    globalThis.fetch=async(url,init)=>{if(String(url).startsWith('http://127.0.0.1:'))return realFetch(url,init);state=currentCredentials();entered();return new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>{aborted();reject(new DOMException('cancelled','AbortError'));},{once:true});});};
    try { const controller=new AbortController();const pending=realFetch(base+'/api/vision/extract',{method:'POST',headers:{Authorization:`Bearer ${A}`,'Content-Type':'application/json'},body:JSON.stringify({imageBase64,mimeType:'image/png'}),signal:controller.signal}).catch(()=>{});await ready;controller.abort();await pending;await Promise.race([cancelled,new Promise((_,reject)=>setTimeout(()=>reject(new Error('cancel not propagated')),2000))]);await new Promise(r=>setTimeout(r,10));assert.equal(state.key,''); } finally {globalThis.fetch=mock;}
  });
  await test('日志和开发者环境变量不含用户Key', () => { assert.ok(!logs.join('').includes(A)); assert.ok(!logs.join('').includes(B)); assert.equal(process.env.DEEPSEEK_API_KEY,'developer-sentinel-never-use'); });
} finally { globalThis.fetch=realFetch; console.log=originalLog; await Promise.all(servers.map(s=>new Promise(r=>s.close(r)))); }
console.log(`BYOK ${pass}/${pass+fail} passed; all upstream mocked`); process.exitCode=fail?1:0;
