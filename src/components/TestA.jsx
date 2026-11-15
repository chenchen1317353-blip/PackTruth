import { useRef, useState } from 'react';
import { callApi, fileToBase64, urlToBase64 } from '../lib/api.js';
import { ResultBox, JsonBlock, KV, ErrorCard, Loading, Pill } from './ui.jsx';

const MAX_MB = 8;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
const MODELS = ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed'];

const dash = (v) => (v === null || v === undefined || v === '' ? <span className="muted">—（未识别）</span> : String(v));

export default function TestA({ defaultModel }) {
  const [img, setImg] = useState(null);
  const [model, setModel] = useState(defaultModel || MODELS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  async function acceptFile(file) {
    setError(null);
    setResult(null);
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setError({ code: 'UNSUPPORTED_IMAGE_TYPE', message: `不支持的格式：${file.type || '未知'}，请使用 JPG 或 PNG`, httpStatus: null });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError({ code: 'IMAGE_TOO_LARGE', message: `图片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_MB}MB 限制`, httpStatus: null });
      return;
    }
    const base64 = await fileToBase64(file);
    setImg({
      base64,
      mime: file.type,
      name: file.name,
      size: file.size,
      preview: URL.createObjectURL(file),
    });
  }

  async function useSample() {
    setError(null);
    setResult(null);
    try {
      const base64 = await urlToBase64('/test-label.png');
      setImg({
        base64,
        mime: 'image/png',
        name: 'test-label.png（内置虚构样例）',
        size: Math.round((base64.length * 3) / 4),
        preview: '/test-label.png',
      });
    } catch (e) {
      setError({ code: 'SAMPLE_LOAD_FAILED', message: '内置样例图加载失败，请先执行 npm run make:label', httpStatus: null });
    }
  }

  async function run() {
    if (!img) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await callApi('/api/mimo/analyze', {
        imageBase64: img.base64,
        mimeType: img.mime,
        model,
      });
      setResult(data);
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
    } finally {
      setLoading(false);
    }
  }

  const p = result?.parsed;
  const nutrition = p?.nutrition;
  const items = Array.isArray(nutrition?.items) ? nutrition.items : [];
  const ingredients = Array.isArray(p?.ingredients) ? p.ingredients : [];
  const claims = Array.isArray(p?.claims) ? p.claims : [];
  const unreadable = Array.isArray(p?.unreadable) ? p.unreadable : [];

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge">A</span>
        <div>
          <h2>小米 MiMo 图片理解</h2>
          <div className="sub">
            识别食品包装的配料表与营养成分表。<code>POST /api/mimo/analyze</code> → 上游 <code>/chat/completions</code>
          </div>
        </div>
      </div>

      <div className="card-body">
        <div
          className={`drop ${over ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
        >
          点击选择或拖拽图片到此处 · 支持 JPG / PNG · 单张不超过 {MAX_MB}MB
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            hidden
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="small" onClick={useSample} disabled={loading}>
            使用内置虚构标签图
          </button>
          <span className="hint" style={{ marginTop: 0 }}>
            内置样例由代码绘制，文字精确可控，适合验证「不编造」
          </span>
        </div>

        {img && (
          <div className="preview">
            <img src={img.preview} alt="待识别图片" />
            <div className="meta">
              <div>文件：{img.name}</div>
              <div>类型：{img.mime}</div>
              <div>大小：{(img.size / 1024).toFixed(0)} KB</div>
              <div>Base64 长度：{img.base64.length.toLocaleString()} 字符</div>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>视觉模型</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 240 }}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="primary" onClick={run} disabled={!img || loading}>
            {loading ? '识别中…' : '开始识别'}
          </button>
        </div>

        {loading && <Loading text="MiMo 正在读图" />}
        <ErrorCard error={error} />

        {result && (
          <>
            <ResultBox status="ok" title="接口调用成功">
              <KV
                rows={[
                  ['模型', <span className="mono">{result.model}</span>],
                  ['上游端点', <span className="mono">{result.endpoint}</span>],
                  ['HTTP 状态', result.httpStatus],
                  ['耗时', `${result.durationMs} ms`],
                  ['finish_reason', result.finishReason ?? '—'],
                  [
                    'Token 用量',
                    result.usage
                      ? `输入 ${result.usage.prompt_tokens} / 输出 ${result.usage.completion_tokens} / 合计 ${result.usage.total_tokens}`
                      : '—',
                  ],
                  [
                    'JSON 解析',
                    result.jsonParse.ok ? (
                      <Pill tone="green">成功{result.jsonParse.reason === 'TRIMMED' ? '（已裁掉前后多余字符）' : ''}</Pill>
                    ) : (
                      <Pill tone="red">失败 · {result.jsonParse.reason}</Pill>
                    ),
                  ],
                ]}
              />
            </ResultBox>

            {p && (
              <>
                <div className="section-title">结构化提取结果</div>
                <KV
                  rows={[
                    ['食品名称', dash(p.product_name)],
                    ['品牌', dash(p.brand)],
                    ['净含量', dash(p.net_content)],
                    ['标示基准', dash(nutrition?.basis_text)],
                    ['基准类型', dash(nutrition?.basis)],
                  ]}
                />

                <div className="section-title">配料表原文</div>
                <div style={{ fontSize: 13, background: 'var(--code-bg)', padding: '10px 12px', borderRadius: 8 }}>
                  {p.ingredients_text ? p.ingredients_text : <span className="muted">—（未识别到配料表）</span>}
                </div>

                <div className="section-title">配料拆分（{ingredients.length} 项）</div>
                {ingredients.length ? (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>配料名</th>
                        <th>原文写法</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map((it, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{dash(it?.name)}</td>
                          <td>{dash(it?.raw)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    —（未识别到配料）
                  </div>
                )}

                <div className="section-title">营养成分表（{items.length} 项）</div>
                {items.length ? (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>项目</th>
                        <th>数值</th>
                        <th>单位</th>
                        <th>NRV%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td>{dash(it?.name)}</td>
                          <td>{dash(it?.value)}</td>
                          <td>{dash(it?.unit)}</td>
                          <td>{dash(it?.nrv_percent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    —（未识别到营养成分表）
                  </div>
                )}

                <div className="section-title">包装宣传语</div>
                {claims.length ? (
                  <div className="row">
                    {claims.map((c, i) => (
                      <span key={i} className="pill">
                        {typeof c === 'string' ? c : JSON.stringify(c)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    —（未识别到宣传语）
                  </div>
                )}

                {unreadable.length > 0 && (
                  <>
                    <div className="section-title">模型标记为无法辨认的内容</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: 'var(--text-dim)' }}>
                      {unreadable.map((u, i) => (
                        <li key={i}>{typeof u === 'string' ? u : JSON.stringify(u)}</li>
                      ))}
                    </ul>
                  </>
                )}

                {result.structure && !result.structure.valid && (
                  <div className="tips" style={{ borderLeftColor: 'var(--warn)' }}>
                    结构校验提示 —— 缺失字段：{result.structure.missing.join('、') || '无'}；类型异常：
                    {result.structure.wrongType.map((w) => `${w.field}(期望 ${w.expected}，实际 ${w.actual})`).join('、') || '无'}
                  </div>
                )}
              </>
            )}

            <div className="section-title">模型原始文本（content）</div>
            <JsonBlock value={result.content || '(空)'} maxHeight={260} />

            {result.reasoningContent && (
              <details>
                <summary>查看模型推理过程（reasoning_content）</summary>
                <JsonBlock value={result.reasoningContent} maxHeight={300} />
              </details>
            )}

            <details>
              <summary>查看完整原始响应（已脱敏）</summary>
              <JsonBlock value={result.raw} maxHeight={340} />
            </details>
          </>
        )}
      </div>
    </section>
  );
}
