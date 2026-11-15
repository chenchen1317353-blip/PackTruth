import { credentialScope } from './requestCredentials.js';

export function byokBoundary({ production = process.env.NODE_ENV === 'production', maxConcurrent = 4, rateLimit = 30, windowMs = 60000 } = {}) {
  const visits = new Map();
  let active = 0;
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const fail = (status, code, message) => res.status(status).json({ ok: false, error: { code, message } });
    const origin = req.get('origin');
    const expected = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site') return fail(403, 'ORIGIN_REJECTED', '仅允许同源访问');
    const now = Date.now();
    for (const [ip, entry] of visits) if (now - entry.at >= windowMs) visits.delete(ip);
    const ip = req.ip;
    const entry = visits.get(ip) || { at: now, count: 0 };
    if (visits.size >= 10000 && !visits.has(ip)) return fail(429, 'RATE_LIMITED', '访问繁忙，请稍后重试');
    visits.set(ip, entry);
    if (++entry.count > rateLimit) { res.setHeader('Retry-After', '60'); return fail(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试'); }
    const paid = req.method === 'POST' && ['/api/vision/extract', '/api/ingredient/research'].includes(req.path);
    // Debug routes never receive user credentials or spend server-owned keys.
    const free = req.method === 'GET' && ['/api/health', '/api/vision/providers', '/api/ingredient/whitelist'].includes(req.path);
    if (!paid && !free) {
      if (req.path.startsWith('/api/deepseek/') || req.path.startsWith('/api/mimo/') || req.path.startsWith('/api/vision/') || req.path.startsWith('/api/probe/')) return fail(403, 'DEBUG_API_DISABLED', '调试接口已禁用，请使用正式分析入口');
      return next();
    }
    let key = '';
    if (paid) {
      if (production && !req.secure) return fail(400, 'HTTPS_REQUIRED', '真实分析需要 HTTPS 安全连接');
      const auth = req.get('authorization') || '';
      if (!auth) return fail(401, 'USER_KEY_REQUIRED', '请先在「AI 功能设置」填写 DeepSeek API Key');
      if (!/^Bearer [A-Za-z0-9_-]{8,256}$/.test(auth)) return fail(401, 'USER_KEY_INVALID', 'API Key 格式不正确，请重新填写');
      key = auth.slice(7);
      if (active >= maxConcurrent) return fail(429, 'SERVICE_BUSY', '当前分析人数较多，请稍后重试');
      active++;
    }
    delete req.headers.authorization;
    // rawHeaders is also reachable by middleware; remove the credential there.
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === 'authorization') req.rawHeaders[i + 1] = '[REDACTED]';
    const controller = new AbortController();
    // 每次请求的调用上限必须覆盖研究预算的最坏情况：
    // 5 轮检索 + 5 次原文读取 + 2 次研究规划 + 1 次整理 = 13 次上游调用。
    // 这是硬保险丝：即使编排层出 bug，也不会无限烧用户的 Key。
    const state = { key, controller, calls: 0, maxCalls: req.path.endsWith('/extract') ? 1 : 18 };
    key = '';
    let finished = false;
    const finish = () => { if (finished) return; finished = true; if (paid) active--; controller.abort(); state.key = ''; clearTimeout(timer); };
    const timer = setTimeout(() => controller.abort(), 330000);
    timer.unref();
    res.once('finish', finish);
    res.once('close', finish);
    credentialScope.run(state, next);
  };
}
