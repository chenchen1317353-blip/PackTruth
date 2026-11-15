import { byokBoundary } from './lib/byokBoundary.js';
import express from 'express';
import { keyStatus, config } from './config.js';
import { ApiError } from './lib/upstream.js';
import { redact } from './lib/redact.js';
import { analyzePackageImage } from './providers/mimo.js';
import { generateJson, simulateEmptyContent, simulateMissingField } from './providers/deepseekChat.js';
import { search } from './providers/deepseekSearch.js';
import { fetchPage } from './providers/deepseekFetch.js';
import { probeCors, CORS_PROBE_TARGETS } from './lib/corsProbe.js';
import { extractPackage, VISION_PROVIDERS, VISION_PROVIDER_IDS, DEFAULT_PRODUCT_PROVIDER } from './providers/vision.js';
import { researchIngredient, estimateResearchCost } from './providers/ingredientResearch.js';
import { getProgress, requestCancel } from './lib/researchProgress.js';
import { listAllowedDomains } from './lib/sourceWhitelist.js';

/**
 * PackTruth 本地中转服务。
 * 为什么需要它：真实密钥只能在服务端使用；同时它顺手解决了浏览器 CORS 问题。
 * 这个 app 既能被 server/index.js 独立启动，也能被 Vite dev server 直接挂载（单端口）。
 */
export function createApp(options = {}) {
  const app = express();
  if (process.env.TRUST_PROXY === 'loopback') app.set('trust proxy', 'loopback');
  app.use(byokBoundary(options));

  // 客户端限制单图 10MB，base64 后约 13.4MB；16mb 留出余量并挡住滥用
  const imageJson = express.json({ limit: '16mb' });
  const smallJson = express.json({ limit: '64kb' });
  app.use((req, res, next) => (req.path === '/api/vision/extract' ? imageJson : smallJson)(req, res, next));

  // 简单请求日志（脱敏，不打印 body）
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${redact(req.path)}`);
    }
    next();
  });

  const ok = (res, data) => res.json({ ok: true, data: redact(data) });

  // ---------- 环境 / 密钥状态 ----------
  // 注意：这里只能暴露「是否配置 + 脱敏指纹」，绝不能暴露密钥本身。
  // 之前的版本把 configured 硬编码成 false，导致前端一直认为服务端没有密钥。
  app.get('/api/health', (_req, res) => {
    const ks = keyStatus();
    ok(res, {
      service: 'PackTruth Phase1 API Relay',
      time: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      keys: ks,
      ready: {
        mimo: ks.mimo.configured,
        deepseek: ks.deepseek.configured,
      },
      envFile: '项目根目录 .env（已被 .gitignore 排除）',
    });
  });

  // ---------- 测试 A：MiMo 图片理解 ----------
  app.post('/api/mimo/analyze', async (req, res, next) => {
    try {
      const { imageBase64, mimeType, model } = req.body || {};
      const data = await analyzePackageImage({ imageBase64, mimeType, model });
      ok(res, { test: 'A', ...data });
    } catch (err) {
      next(err);
    }
  });

  // ---------- 测试 B：DeepSeek JSON 输出 ----------
  app.post('/api/deepseek/json', async (req, res, next) => {
    try {
      const { mode = 'normal', sample } = req.body || {};
      let data;
      if (mode === 'sim-empty') data = simulateEmptyContent();
      else if (mode === 'sim-missing') data = simulateMissingField();
      else data = await generateJson({ mode, sample });
      ok(res, { test: 'B', ...data });
    } catch (err) {
      next(err);
    }
  });

  // ---------- 测试 C：DeepSeek Search ----------
  app.post('/api/deepseek/search', async (req, res, next) => {
    try {
      const { query, count } = req.body || {};
      const data = await search({ query, count });
      ok(res, { test: 'C', ...data });
    } catch (err) {
      next(err);
    }
  });

  // ---------- 测试 D：DeepSeek Fetch ----------
  app.post('/api/deepseek/fetch', async (req, res, next) => {
    try {
      const { url } = req.body || {};
      const data = await fetchPage({ url });
      ok(res, { test: 'D', ...data });
    } catch (err) {
      next(err);
    }
  });

  // ---------- CORS 预检探测（零成本） ----------
  app.get('/api/probe/cors', async (_req, res, next) => {    try {
      const entries = await Promise.all(
        Object.entries(CORS_PROBE_TARGETS).map(async ([k, url]) => [k, await probeCors(url)]),
      );
      ok(res, { pageOrigin: 'http://localhost:5173', probes: Object.fromEntries(entries) });
    } catch (err) {
      next(err);
    }
  });

  // ---------- 第二阶段：统一视觉识别人（正式产品 + 模型对比共用） ----------
  app.get('/api/vision/providers', (_req, res) => {
    ok(res, {
      // 正式产品用哪个模型由服务端决定，前端不参与选择
      defaultProvider: DEFAULT_PRODUCT_PROVIDER,
      providers: VISION_PROVIDER_IDS.map((id) => ({
        id,
        label: VISION_PROVIDERS[id].label,
        model: VISION_PROVIDERS[id].getModel(),
        configured: Boolean(VISION_PROVIDERS[id].getApiKey()),
        pricing: VISION_PROVIDERS[id].pricing,
      })),
    });
  });

  app.post('/api/vision/extract', async (req, res, next) => {
    try {
      // provider 不传就永远走服务端默认值（DeepSeek Vision）
      const { provider = DEFAULT_PRODUCT_PROVIDER, imageBase64, mimeType } = req.body || {};
      if (provider !== 'deepseek-vision') throw new ApiError({ code: 'PROVIDER_DISABLED', httpStatus: 403, message: '此入口仅支持 DeepSeek Vision' });
      const data = await extractPackage({ provider, imageBase64, mimeType });
      ok(res, data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * 双模型对比：同一张图跑两个模型。
   * 单个模型失败不影响另一个 —— 失败方返回 error，成功方照常返回，
   * 这样「一个模型不通」不会被误判成「图片有问题」。
   */
  app.post('/api/vision/compare', async (req, res, next) => {
    try {
      const { imageBase64, mimeType } = req.body || {};
      const targets = VISION_PROVIDER_IDS;

      const settled = await Promise.all(
        targets.map(async (id) => {
          try {
            const data = await extractPackage({ provider: id, imageBase64, mimeType });
            return [id, { ok: true, ...data }];
          } catch (err) {
            return [
              id,
              {
                ok: false,
                provider: id,
                providerLabel: VISION_PROVIDERS[id].label,
                error: err instanceof ApiError ? err.toJSON() : { message: String(err?.message || err) },
              },
            ];
          }
        }),
      );

      ok(res, { results: Object.fromEntries(settled), comparedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // ---------- 第五阶段：成分联网循证 ----------
  app.get('/api/ingredient/whitelist', (_req, res) => {
    ok(res, { domains: listAllowedDomains() });
  });

  /**
   * 只有前端用户显式点击「联网查找」才会进来。
   * 这是本阶段唯一会产生费用的成分接口，路由层不做任何自动调用。
   */
  app.post('/api/ingredient/research', async (req, res, next) => {
    try {
      // 只接受「查什么」的最小参数集。服务端不再接受任何由浏览器回传的
      // 证据正文（浏览器回传来源的通道已移除）——外部内容只能由服务端自己检索取得，
      // 否则任何人都能把任意文本伪装成权威来源。
      const { name, aliases = [], foodContext = null, force = false, requestId = null } = req.body || {};
      // requestId 只用于进度轮询与取消，不参与缓存键，也不含任何用户信息
      const rid = typeof requestId === 'string' ? requestId.slice(0, 64) : null;
      const data = await researchIngredient({ name, aliases, foodContext, force, requestId: rid });
      ok(res, {
        ...data,
        // 编排层已经把规划调用与最终整理合并计价；这里只兜底旧结构。
        cost:
          data.cost ||
          estimateResearchCost({
            searchCount: data.searchCount || 0,
            searchRounds: data.searchRounds || 0,
            fetchCount: data.fetchCount ?? 0,
            plannerCalls: data.searchBudget?.usedPlannerCalls || 0,
            usage: data.chat?.usage,
          }),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * 研究进度：只读内存，不发任何上游请求，也不收费。
   * 前端按 requestId 轮询；没有百分比，只有真实阶段。
   */
  app.get('/api/ingredient/research/progress', (req, res) => {
    const id = String(req.query.id || '').slice(0, 64);
    ok(res, getProgress(id));
  });

  /**
   * 取消研究：只打标记。编排层在下一个阶段边界检查到标记后停止，
   * 不再发起新的付费调用；已经发出的请求可能仍会计费。
   */
  app.post('/api/ingredient/research/cancel', (req, res) => {
    const id = String(req.body?.id || '').slice(0, 64);
    ok(res, requestCancel(id));
  });

  // ---------- 404 ----------
  app.use('/api', (_req, res) => {
    res.status(404).json({
      ok: false,
      error: { code: 'ROUTE_NOT_FOUND', message: '接口路径不存在' },
    });
  });

  // ---------- 统一错误出口 ----------
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.httpStatus).json({ ok: false, error: err.toJSON() });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: '上传内容过大，请压缩图片后重试' },
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_JSON', message: '请求内容不是合法 JSON，请检查后重试' },
      });
    }
    // 未知异常可能包含请求正文或上游原文，只记录类型，不回显输入片段。
    console.error('[unhandled]', err instanceof TypeError ? 'TypeError' : 'Error');
    res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '中转服务内部错误',
      },
    });
  });

  return app;
}

export { config };
