import { useEffect, useState } from 'react';
import { callApi } from '../lib/api.js';
import { ResultBox, JsonBlock, KV, ErrorCard, Loading, Pill } from './ui.jsx';

const SITE_LEVEL_CODES = ['SITE_BLOCKED', 'PAGE_NOT_EXTRACTABLE'];

export default function TestD({ searchResults }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 搜索一有结果，自动填入第一条，保证抓的是真实存在的链接
  useEffect(() => {
    if (searchResults?.length && !url) setUrl(searchResults[0].url);
  }, [searchResults]);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await callApi('/api/deepseek/fetch', { url });
      setResult(data);
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
    } finally {
      setLoading(false);
    }
  }

  const siteLevel = error && SITE_LEVEL_CODES.includes(error.code);

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge">D</span>
        <div>
          <h2>DeepSeek Fetch 网页正文提取</h2>
          <div className="sub">
            <code>POST /api/deepseek/fetch</code> → 上游 <code>/v1/tools/fetch</code>，返回标题与 Markdown 正文
          </div>
        </div>
      </div>

      <div className="card-body">
        {searchResults?.length ? (
          <div className="field">
            <label>从测试 C 的真实结果中选择（不会伪造链接）</label>
            <select value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading}>
              {searchResults.map((r, i) => (
                <option key={i} value={r.url}>
                  {i + 1}. {r.title} — {r.url}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="tips" style={{ marginTop: 0 }}>
            还没有搜索结果。先运行测试 C，这里会自动列出可抓取的真实网页，避免手输错误链接。
          </div>
        )}

        <div className="field">
          <label>目标 URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.who.int/..."
            disabled={loading}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={run} disabled={loading || !url.trim()}>
            {loading ? '抓取中…' : '抓取正文'}
          </button>
        </div>

        {loading && <Loading text="DeepSeek 正在抓取网页" />}

        {siteLevel ? (
          <ResultBox status="warn" title="网站侧限制：目标页面无法抓取">
            <KV
              rows={[
                ['错误码', <span className="mono">{error.code}</span>],
                ['判断结论', <Pill tone="amber">SITE_LEVEL_FAILURE（站点问题）</Pill>],
                ['上游状态码', error.detail?.upstreamStatus ?? '—'],
                ['说明', error.message],
              ]}
            />
            <div className="hint">
              这条记录说明「这个网站不允许抓」，不能据此判定 Fetch API 不可用 —— 换一个站点再试才能下结论。
            </div>
          </ResultBox>
        ) : (
          <ErrorCard error={error} />
        )}

        {result && (
          <>
            <ResultBox status="ok" title="正文抓取成功">
              <KV
                rows={[
                  ['上游端点', <span className="mono">{result.endpoint}</span>],
                  ['HTTP 状态', result.httpStatus],
                  ['耗时', `${result.durationMs} ms`],
                  ['页面标题', result.title || '（上游未返回标题）'],
                  ['正文字符数', result.contentLength.toLocaleString()],
                  ['是否计费', result.billed ? <Pill tone="amber">是</Pill> : <Pill tone="green">否</Pill>],
                ]}
              />
            </ResultBox>

            <div className="section-title">正文预览（前 3000 字，原样返回，未做改写）</div>
            <JsonBlock value={result.contentPreview || '(空)'} maxHeight={380} />

            <div className="hint">
              正式开发时，这段 Markdown 会作为「引用原文」切片，配合 Search 返回的 URL 一起生成可追溯的引用条目。
            </div>
          </>
        )}
      </div>
    </section>
  );
}
