/**
 * 中转服务的 HTTP 层自检：只打本地端口，不触发任何上游付费调用。
 * 覆盖：健康检查、CORS 探测、本地模拟分支、参数校验、404、错误码映射。
 */

const BASE = process.env.BASE || 'http://localhost:5173';

let pass = 0;
let fail = 0;

function report(name, ok, detail) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json };
}

console.log(`\n中转服务自检 @ ${BASE}\n`);

// 1. 页面
{
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  report('GET / 返回 HTML 页面', res.status === 200 && html.includes('<div id="root">'), `HTTP ${res.status}`);
}

// 2. 健康检查
{
  const { status, json } = await req('GET', '/api/health');
  const d = json?.data;
  report('GET /api/health 正常', status === 200 && d?.service, `Node ${d?.node}`);
  report('  └ 密钥已脱敏（不含完整 sk- 串）', !JSON.stringify(json).match(/sk-[A-Za-z0-9]{20,}/), d?.keys?.mimo?.keyPreview ? `MiMo ${d.keys.mimo.keyPreview}` : '');
  report('  └ MiMo / DeepSeek 均已配置', d?.ready?.mimo && d?.ready?.deepseek);
}

// 3. CORS 探测
{
  const { status, json } = await req('GET', '/api/probe/cors');
  const probes = json?.data?.probes || {};
  report('GET /api/probe/cors 正常', status === 200 && Object.keys(probes).length === 3);
  for (const [k, p] of Object.entries(probes)) {
    console.log(`      ${k}: OPTIONS ${p.optionsStatus} · ACAO=${p.accessControlAllowOrigin ?? '(无)'}`);
  }
}

// 4. 本地模拟：字段缺失
{
  const { status, json } = await req('POST', '/api/deepseek/json', { mode: 'sim-missing' });
  const d = json?.data;
  report('POST /api/deepseek/json (sim-missing) 触发校验拦截', status === 200 && d?.structure?.valid === false, `缺失 ${JSON.stringify(d?.structure?.missing)}`);
}

// 5. 本地模拟：空内容
{
  const { status, json } = await req('POST', '/api/deepseek/json', { mode: 'sim-empty' });
  const d = json?.data;
  report('POST /api/deepseek/json (sim-empty) 识别空内容', status === 200 && d?.jsonParse?.ok === false, `reason=${d?.jsonParse?.reason}`);
}

// 6. 参数校验（不触达上游）
{
  const { status, json } = await req('POST', '/api/mimo/analyze', { imageBase64: '', mimeType: 'application/pdf' });
  report('MiMo 拒绝不支持的格式', status === 400 && json?.error?.code === 'UNSUPPORTED_IMAGE_TYPE', `HTTP ${status} ${json?.error?.code}`);
}

{
  const { status, json } = await req('POST', '/api/deepseek/search', { query: '   ' });
  report('Search 拒绝空关键词', status === 400 && json?.error?.code === 'EMPTY_QUERY', `HTTP ${status} ${json?.error?.code}`);
}

{
  const { status, json } = await req('POST', '/api/deepseek/fetch', { url: 'not-a-url' });
  report('Fetch 拒绝非法 URL', status === 400 && json?.error?.code === 'INVALID_URL', `HTTP ${status} ${json?.error?.code}`);
}

// 7. 404
{
  const { status, json } = await req('POST', '/api/not-exist', {});
  report('未知接口返回 404', status === 404 && json?.error?.code === 'ROUTE_NOT_FOUND');
}

// 8. 第二阶段：视觉识别路由
{
  const { status, json } = await req('GET', '/api/vision/providers');
  const list = json?.data?.providers || [];
  report(
    'GET /api/vision/providers 返回两个模型',
    status === 200 && list.length === 2 && list.every((p) => p.configured),
    list.map((p) => `${p.label}(${p.model})`).join(' / '),
  );
}

{
  const { status, json } = await req('POST', '/api/vision/extract', {
    provider: 'no-such-model',
    imageBase64: 'x',
    mimeType: 'image/jpeg',
  });
  report(
    '视觉识别拒绝未知模型',
    status === 400 && json?.error?.code === 'UNKNOWN_VISION_PROVIDER',
    `HTTP ${status} ${json?.error?.code}`,
  );
}

{
  const { status, json } = await req('POST', '/api/vision/extract', {
    provider: 'mimo',
    imageBase64: '',
    mimeType: 'image/jpeg',
  });
  report(
    '视觉识别对空图片返回 400（不是 500）',
    status === 400 && ['EMPTY_IMAGE', 'IMAGE_ERROR'].includes(json?.error?.code),
    `HTTP ${status} ${json?.error?.code}`,
  );
}

{
  // 造一个超过 1KB、但绝不是图片的字节串，才能走到 sharp 解析这一步
  const fakeBytes = Buffer.from('this is definitely not an image file. '.repeat(80));
  const { status, json } = await req('POST', '/api/vision/extract', {
    provider: 'mimo',
    imageBase64: fakeBytes.toString('base64'),
    mimeType: 'image/jpeg',
  });
  report(
    '视觉识别对坏图片返回 400（不是 500）',
    status === 400 && json?.error?.code === 'UNREADABLE_IMAGE',
    `HTTP ${status} ${json?.error?.code}`,
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
