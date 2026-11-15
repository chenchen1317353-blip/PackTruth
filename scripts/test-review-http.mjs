/** 离线 HTTP 隐私回归；REVIEW_BASELINE=1 对修改前备份运行同一断言。 */
import assert from 'node:assert/strict';
const root = process.env.REVIEW_BASELINE ? '../.workbuddy/codex-review-baseline-20261102/' : '../';
const { createApp } = await import(`${root}server/app.js`);
const savedLog = console.log;
const savedError = console.error;
const logs = [];
console.log = (...args) => logs.push(args.join(' '));
console.error = (...args) => logs.push(args.join(' '));
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let failed = 0;
async function test(name, fn) {
  try { await fn(); savedLog(`PASS ${name}`); }
  catch (error) { failed++; savedLog(`FAIL ${name}: ${error.message}`); }
}
try {
  await test('损坏JSON返回400且不记录/回显输入片段', async () => {
    const marker = 'private-photo-fragment-123456';
    const response = await fetch(`${base}/api/ingredient/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer offline-http-fixture' }, body: marker,
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(body).error.code, 'INVALID_JSON');
    assert.ok(!body.includes(marker));
    assert.ok(!logs.join('\n').includes(marker));
  });
  await test('请求日志不记录查询参数中的凭据', async () => {
    const marker = 'synthetic-private-token-123456';
    await fetch(`${base}/api/not-found?api_key=${marker}`);
    assert.ok(!logs.join('\n').includes(marker));
    assert.ok(logs.some((line) => line.includes('/api/not-found')));
  });
} finally {
  console.log = savedLog;
  console.error = savedError;
  await new Promise((resolve) => server.close(resolve));
}
console.log(`HTTP privacy: ${2 - failed}/2 passed`);
process.exitCode = failed ? 1 : 0;
