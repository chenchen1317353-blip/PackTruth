import { useState } from 'react';
import { callApi } from '../lib/api.js';
import { ResultBox, KV, Loading, Pill } from './ui.jsx';

/**
 * CORS 双路验证：
 * 1) 服务端预检探测：看上游是否返回 Access-Control-Allow-Origin（零成本、带解释）
 * 2) 浏览器真实探测：由浏览器直接 fetch 上游（不带任何密钥），
 *    拿到任何 HTTP 响应都说明 CORS 放行；抛 TypeError 说明被拦截或不可达。
 * 两条结论互相印证，避免只凭猜测下判断。
 */

function verdictTone(p) {
  return p.browserDirectCallAllowed ? 'green' : 'red';
}

export default function CorsPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [browser, setBrowser] = useState(null);
  const [browserLoading, setBrowserLoading] = useState(false);

  async function runServerProbe() {
    setLoading(true);
    setError(null);
    try {
      setData(await callApi('/api/probe/cors'));
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
    } finally {
      setLoading(false);
    }
  }

  async function runBrowserProbe() {
    setBrowserLoading(true);
    const targets = [
      { name: 'MiMo', url: 'https://api.xiaomimimo.com/v1/chat/completions' },
      { name: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions' },
    ];

    const out = [];
    for (const t of targets) {
      const started = performance.now();
      try {
        // 刻意不带 Authorization：只验证跨域是否放行，绝不把密钥送进浏览器
        const res = await fetch(t.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ probe: true }),
          signal: AbortSignal.timeout(15000),
        });
        out.push({
          name: t.name,
          url: t.url,
          reached: true,
          status: res.status,
          durationMs: Math.round(performance.now() - started),
          note: `浏览器拿到了 HTTP ${res.status} 响应，说明跨域没有被拦（无密钥，必然鉴权失败，属正常）`,
        });
      } catch (e) {
        out.push({
          name: t.name,
          url: t.url,
          reached: false,
          status: null,
          durationMs: Math.round(performance.now() - started),
          note: '浏览器抛出 TypeError（Failed to fetch）：被 CORS 策略拦截，或网络不可达',
          error: String(e?.message || e),
        });
      }
    }
    setBrowser(out);
    setBrowserLoading(false);
  }

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge">◎</span>
        <div>
          <h2>跨域（CORS）与密钥暴露检查</h2>
          <div className="sub">
            判断浏览器能否直接调用上游接口，以及为什么本项目仍然选择走本地中转
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="row">
          <button onClick={runServerProbe} disabled={loading}>
            {loading ? '探测中…' : '① 服务端预检探测（零成本）'}
          </button>
          <button onClick={runBrowserProbe} disabled={browserLoading}>
            {browserLoading ? '浏览器请求中…' : '② 浏览器直连探测（不带密钥）'}
          </button>
        </div>

        <div className="hint">
          两个探测都不会携带 API Key，也不会消耗模型或搜索额度。浏览器直连探测如果拿到任意 HTTP 状态码，说明跨域放行；
          如果报 <span className="mono">Failed to fetch</span>，说明被 CORS 拦截或网络不通。
        </div>

        {loading && <Loading text="正在向上游发送 OPTIONS 预检" />}

        {error && (
          <ResultBox status="err" title="预检探测失败">
            <KV rows={[['错误码', error.code], ['说明', error.message]]} />
          </ResultBox>
        )}

        {data && (
          <>
            <div className="section-title">① 服务端预检结果（Origin: {data.pageOrigin}）</div>
            <div className="cors-grid">
              {Object.entries(data.probes).map(([k, p]) => (
                <div className="cors-card" key={k}>
                  <div className="name">
                    {k}{' '}
                    {p.browserDirectCallAllowed ? (
                      <Pill tone="green">可能允许直连</Pill>
                    ) : (
                      <Pill tone="red">不允许直连</Pill>
                    )}
                  </div>
                  <div className="line">OPTIONS 状态：{p.optionsStatus ?? '—'}</div>
                  <div className="line">Allow-Origin：{p.accessControlAllowOrigin || '（响应中不存在）'}</div>
                  <div className="line">Allow-Headers：{p.accessControlAllowHeaders || '（无）'}</div>
                  <div className="line">Allow-Methods：{p.accessControlAllowMethods || '（无）'}</div>
                  <div className="line" style={{ marginTop: 5, color: 'var(--text)' }}>
                    {p.verdict}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {browser && (
          <>
            <div className="section-title">② 浏览器真实请求结果</div>
            <div className="cors-grid">
              {browser.map((b, i) => (
                <div className="cors-card" key={i}>
                  <div className="name">
                    {b.name}{' '}
                    {b.reached ? <Pill tone="green">跨域可达</Pill> : <Pill tone="red">被拦截 / 不可达</Pill>}
                  </div>
                  <div className="line">URL：{b.url}</div>
                  <div className="line">状态码：{b.status ?? '—'}</div>
                  <div className="line">耗时：{b.durationMs} ms</div>
                  <div className="line" style={{ marginTop: 5, color: 'var(--text)' }}>
                    {b.note}
                  </div>
                  {b.error && <div className="line">错误：{b.error}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="tips">
          即使上游允许跨域，本项目也<strong>不</strong>做浏览器直连：密钥一旦进入前端代码或网络请求头，任何人打开开发者工具就能抄走并盗刷额度。
          因此所有请求统一走本地 Node 中转，浏览器只认识 <span className="mono">/api/*</span>。
        </div>
      </div>
    </section>
  );
}
