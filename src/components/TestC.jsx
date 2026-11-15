import { useState } from 'react';
import { callApi } from '../lib/api.js';
import { ResultBox, JsonBlock, KV, ErrorCard, Loading, Pill } from './ui.jsx';

const PRESETS = [
  'WHO food additives safety evaluation',
  'WHO 食品添加剂 安全性 评估',
  'EFSA food additive risk assessment titanium dioxide',
];

export default function TestC({ onResults }) {
  const [query, setQuery] = useState(PRESETS[0]);
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await callApi('/api/deepseek/search', { query, count });
      setResult(data);
      onResults?.(data.results || []);
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
      onResults?.([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge">C</span>
        <div>
          <h2>DeepSeek Search 网页搜索</h2>
          <div className="sub">
            <code>POST /api/deepseek/search</code> → 上游 <code>/v1/tools/search</code> · 默认只取 3 条，控制费用
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="field">
          <label>搜索关键词</label>
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} disabled={loading} />
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            {PRESETS.map((p) => (
              <button key={p} className="small" onClick={() => setQuery(p)} disabled={loading}>
                {p.length > 26 ? `${p.slice(0, 26)}…` : p}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>返回条数</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 90 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button className="primary" onClick={run} disabled={loading || !query.trim()}>
            {loading ? '搜索中…' : '执行搜索'}
          </button>
        </div>

        <div className="hint">
          计费说明：按成功请求计费（$0.75 / 1000 次），返回空结果不计费。本页单次最多请求 5 条，避免不必要开销。
        </div>

        {loading && <Loading text="DeepSeek 正在搜索" />}
        <ErrorCard error={error} />

        {result && (
          <>
            <ResultBox
              status={result.resultCount > 0 ? 'ok' : 'warn'}
              title={result.resultCount > 0 ? `返回 ${result.resultCount} 条真实结果` : '搜索成功但结果为空'}
            >
              <KV
                rows={[
                  ['上游端点', <span className="mono">{result.endpoint}</span>],
                  ['HTTP 状态', result.httpStatus],
                  ['耗时', `${result.durationMs} ms`],
                  ['请求条数 / 实际返回', `${result.requestedCount} / ${result.resultCount}`],
                  ['是否计费', result.billed ? <Pill tone="amber">是（成功且非空）</Pill> : <Pill tone="green">否</Pill>],
                ]}
              />
            </ResultBox>

            <div className="section-title">搜索结果</div>
            {result.results.length ? (
              <div className="results-list">
                {result.results.map((r, i) => (
                  <div className="res-item" key={i}>
                    <div className="t">
                      {i + 1}. {r.title}
                    </div>
                    <div className="u">{r.url}</div>
                    <div className="s">{r.snippet || r.summary || '（无摘要）'}</div>
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      {r.siteName && <span className="pill gray">{r.siteName}</span>}
                      {r.authority !== null && (
                        <span className={`pill ${r.authority >= 3 ? 'green' : 'gray'}`}>权威度 {r.authority}</span>
                      )}
                      {r.rerankScore !== null && <span className="pill gray">相关度 {r.rerankScore}</span>}
                      {r.date && <span className="pill gray">{String(r.date).slice(0, 10)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12.5 }}>
                —（没有返回结果，可换个关键词再试）
              </div>
            )}

            <div className="hint">
              提示：测试 D 会直接使用这里返回的真实 URL 去抓取正文，不会凭空构造地址。
            </div>

            <details>
              <summary>查看原始响应（已脱敏）</summary>
              <JsonBlock value={result.raw} maxHeight={320} />
            </details>
          </>
        )}
      </div>
    </section>
  );
}
