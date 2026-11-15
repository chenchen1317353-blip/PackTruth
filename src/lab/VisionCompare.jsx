import { useEffect, useMemo, useState } from 'react';
import { callApi, urlToBase64 } from '../lib/api.js';
import {
  MARK_OPTIONS,
  exportMarks,
  getMark,
  loadMarks,
  markTone,
  saveMarks,
  setMark,
  summarize,
} from './compareMarks.js';
import './lab.css';

/**
 * 真实包装双模型对比工具。
 *
 * 设计取舍：
 * - 不做「准确率自动评分」。模型自评不可信，程序也无法判断中文配料名对不对，
 *   所以只提供人工标记，统计结果只反映「你标了多少、其中多少算对」。
 * - 同一张图识别过一次就缓存，重复点击不会再次扣费；要重跑必须点「重新识别」。
 */

const PROVIDERS = [
  { id: 'mimo', label: '小米 MiMo', model: 'mimo-v2.6-flash' },
  { id: 'deepseek-vision', label: 'DeepSeek Vision', model: 'deepseek-flash' },
];

const FIELD_ROWS = [
  { key: 'product_name', label: '食品名称' },
  { key: 'brand', label: '品牌' },
  { key: 'category', label: '类别' },
  { key: 'net_content', label: '净含量' },
  { key: 'basis', label: '标示基准' },
  { key: 'ingredient_count', label: '配料条数' },
  { key: 'ingredients_text', label: '配料表原文' },
  { key: 'unreadable', label: '标注「看不清」的内容' },
];

const ALL_FIELD_KEYS = [...FIELD_ROWS.map((r) => r.key), 'nutrients'];

export default function VisionCompare() {
  const [manifest, setManifest] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marks, setMarks] = useState(loadMarks);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    fetch('/test-images/manifest.json')
      .then((r) => r.json())
      .then((m) => {
        setManifest(m);
        setActiveFile(m.images?.[0]?.file ?? null);
      })
      .catch(() => setError({ message: '无法加载图片清单 public/test-images/manifest.json' }));
  }, []);

  const active = useMemo(
    () => manifest?.images?.find((i) => i.file === activeFile) || null,
    [manifest, activeFile],
  );

  const current = activeFile ? results[activeFile] : null;

  async function runCompare(force = false) {
    if (!active) return;
    if (current && !force) return;

    setLoading(true);
    setError(null);
    try {
      const base64 = await urlToBase64(`/test-images/real/${active.file}`);
      const data = await callApi('/api/vision/compare', { imageBase64: base64, mimeType: 'image/jpeg' }, { timeoutMs: 300000 });
      setResults((prev) => ({ ...prev, [active.file]: data }));
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
    } finally {
      setLoading(false);
    }
  }

  function updateMark(fieldKey, provider, markId) {
    const next = setMark(marks, activeFile, fieldKey, provider, markId);
    setMarks(next);
    saveMarks(next);
  }

  const stats = useMemo(() => {
    if (!activeFile) return null;
    return {
      mimo: summarize(marks, activeFile, 'mimo', ALL_FIELD_KEYS),
      deepseek: summarize(marks, activeFile, 'deepseek-vision', ALL_FIELD_KEYS),
    };
  }, [marks, activeFile]);

  return (
    <div className="lab-wrap">
      <nav className="lab-nav">
        <a href="#/">← 返回 PackTruth</a>
        <a href="#/lab">接口测试台</a>
        <span className="lab-nav-current">视觉模型对比</span>
      </nav>

      <header className="lab-head">
        <h1>真实包装 · 双模型识别对比</h1>
        <p>
          同一张照片、同一份 prompt、同一套输出结构，分别交给 MiMo 与 DeepSeek Vision。
          页面只负责并排展示原始结果，<strong>准确率必须由你人工标记后得出</strong>，程序不做自动评分。
        </p>
      </header>

      <div className="lab-warn">
        每点击一次「识别」会用掉 <strong>2 次</strong>付费调用。同一张图识别过会缓存，不会重复扣费；
        要重跑请点「重新识别」。
      </div>

      {manifest && (
        <>
          <div className="thumb-grid">
            {manifest.images.map((img) => (
              <button
                key={img.file}
                className={`thumb ${img.file === activeFile ? 'active' : ''} ${results[img.file] ? 'done' : ''}`}
                onClick={() => {
                  setActiveFile(img.file);
                  setError(null);
                  setShowOriginal(false);
                }}
              >
                <img src={`/test-images/real/${img.file}`} alt={img.label} />
                <span className="thumb-label">{img.shortLabel}</span>
                {results[img.file] && <span className="thumb-done">已识别</span>}
              </button>
            ))}
          </div>

          {active && (
            <div className="compare-layout">
              <div className="compare-photo">
                <img src={`/test-images/real/${active.file}`} alt={active.label} />
                <div className="photo-meta">
                  <div>
                    <strong>{active.label}</strong>
                  </div>
                  <div>拍摄难点：{active.challenge}</div>
                  <div className="muted">原始尺寸 {active.size} · 保留原图未做压缩</div>
                </div>
                <div className="row-gap">
                  <button className="btn primary" onClick={() => runCompare(false)} disabled={loading || Boolean(current)}>
                    {loading ? '识别中…（约 15–40 秒）' : current ? '已识别（结果见右侧）' : '用两个模型识别'}
                  </button>
                  {current && (
                    <button className="btn ghost" onClick={() => runCompare(true)} disabled={loading}>
                      重新识别
                    </button>
                  )}
                </div>
                {loading && (
                  <div className="lab-note">两个模型并行识别中，MiMo 通常较慢，请耐心等待，不要刷新页面。</div>
                )}
              </div>

              <div className="compare-results">
                {error && (
                  <div className="lab-error">
                    <strong>调用失败：</strong>
                    {error.message}
                    {error.code && <span className="mono"> ({error.code})</span>}
                  </div>
                )}

                {!current && !loading && !error && (
                  <div className="lab-empty">点击左侧「用两个模型识别」开始。第一次识别会真实调用两个 API。</div>
                )}

                {current && (
                  <>
                    <ProviderSummary current={current} />
                    <FieldTable
                      current={current}
                      imageFile={activeFile}
                      marks={marks}
                      onMark={updateMark}
                    />
                    <NutrientTable
                      current={current}
                      imageFile={activeFile}
                      marks={marks}
                      onMark={updateMark}
                    />

                    {stats && <MarkStats stats={stats} fieldCount={ALL_FIELD_KEYS.length} />}

                    <div className="row-gap" style={{ marginTop: 14 }}>
                      <button className="btn ghost small" onClick={() => exportMarks(marks)}>
                        导出全部人工标记 JSON
                      </button>
                      <button className="btn ghost small" onClick={() => setShowOriginal((v) => !v)}>
                        {showOriginal ? '收起原始响应' : '查看两个模型的原始响应'}
                      </button>
                    </div>

                    {showOriginal && (
                      <div className="original-grid">
                        {PROVIDERS.map((p) => {
                          const r = current.results?.[p.id];
                          return (
                            <div key={p.id}>
                              <div className="mini-title">{p.label} · 原始 content</div>
                              <pre className="code-block">{r?.content || '(空)'}</pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <footer className="lab-foot">
        PackTruth · Lab · 第二阶段视觉模型验证 · 结果仅用于人工评估，不构成任何产品结论
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- 子组件

function ProviderSummary({ current }) {
  return (
    <div className="provider-cards">
      {PROVIDERS.map((p) => {
        const r = current.results?.[p.id];
        if (!r) return null;
        if (!r.ok) {
          return (
            <div className="provider-card bad" key={p.id}>
              <div className="pc-head">
                {p.label} <span className="pill red">失败</span>
              </div>
              <div className="pc-row">错误：{r.error?.message || '未知错误'}</div>
              <div className="pc-row muted">{r.error?.code || ''}</div>
            </div>
          );
        }
        return (
          <div className="provider-card" key={p.id}>
            <div className="pc-head">
              {p.label} <span className="pill gray">{r.model}</span>
            </div>
            <div className="pc-row">
              耗时 <strong>{r.durationMs} ms</strong>
            </div>
            <div className="pc-row">
              Tokens 输入 {r.usage?.prompt_tokens ?? '—'} / 输出 {r.usage?.completion_tokens ?? '—'}
            </div>
            <div className="pc-row">
              估算费用{' '}
              {r.costEstimate
                ? `${r.costEstimate.currency === 'CNY' ? '¥' : '$'}${r.costEstimate.amount.toFixed(6)}`
                : '—'}
            </div>
            <div className="pc-row muted">
              JSON {r.jsonParse?.ok ? '解析成功' : `解析失败(${r.jsonParse?.reason})`}
              {r.structure && !r.structure.valid ? ` · 缺字段 ${r.structure.missing.join('/')}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldTable({ current, imageFile, marks, onMark }) {
  return (
    <div className="cmp-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            <th className="col-field">字段</th>
            <th>小米 MiMo</th>
            <th>DeepSeek Vision</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_ROWS.map((row) => (
            <tr key={row.key}>
              <td className="col-field">{row.label}</td>
              {PROVIDERS.map((p) => {
                const r = current.results?.[p.id];
                const value = r?.ok ? renderFieldValue(r.parsed, row.key, r) : null;
                return (
                  <td key={p.id} className="cmp-cell">
                    <div className="cmp-value">{value ?? <span className="muted">—</span>}</div>
                    <MarkSelect
                      imageFile={imageFile}
                      fieldKey={row.key}
                      provider={p.id}
                      marks={marks}
                      onMark={onMark}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NutrientTable({ current, imageFile, marks, onMark }) {
  const rows = useMemo(() => buildNutrientRows(current), [current]);
  if (!rows.length) {
    return <div className="lab-empty" style={{ marginTop: 14 }}>两个模型都没有返回可解析的营养成分表。</div>;
  }
  return (
    <div className="cmp-wrap" style={{ marginTop: 16 }}>
      <div className="mini-title" style={{ marginBottom: 6 }}>
        营养成分逐项对比（按营养素名称对齐，空表示该模型没识别出这一项）
      </div>
      <table className="cmp-table">
        <thead>
          <tr>
            <th className="col-field">营养素</th>
            <th>小米 MiMo</th>
            <th>DeepSeek Vision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="col-field">{row.name}</td>
              {PROVIDERS.map((p) => (
                <td key={p.id} className="cmp-cell">
                  <div className="cmp-value">
                    {row[p.id] ? row[p.id] : <span className="muted">（未识别）</span>}
                  </div>
                  <MarkSelect
                    imageFile={imageFile}
                    fieldKey={`nutrients.${row.id}`}
                    provider={p.id}
                    marks={marks}
                    onMark={onMark}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkSelect({ imageFile, fieldKey, provider, marks, onMark }) {
  const value = getMark(marks, imageFile, fieldKey, provider);
  return (
    <select
      className={`mark-select tone-${markTone(value)}`}
      value={value}
      onChange={(e) => onMark(fieldKey, provider, e.target.value)}
      title="人工标记这一格的对错"
    >
      {MARK_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MarkStats({ stats, fieldCount }) {
  return (
    <div className="mark-stats">
      <div className="mini-title">人工标记统计（只统计你已检查的格子）</div>
      <div className="stats-row">
        {[
          { key: 'mimo', label: '小米 MiMo' },
          { key: 'deepseek', label: 'DeepSeek Vision' },
        ].map((p) => {
          const s = stats[p.key];
          const rate = s.checked ? Math.round((s.correct / s.checked) * 100) : null;
          return (
            <div className="stat-card" key={p.key}>
              <div className="sc-name">{p.label}</div>
              <div className="sc-row">
                已检查 {s.checked} / {fieldCount} 格
              </div>
              <div className="sc-row">
                正确 {s.correct} · 有问题 {s.problems}
              </div>
              <div className="sc-row muted">
                {rate === null ? '尚无人工标记，无法给出准确率' : `人工核对后正确率 ${rate}%（样本 ${s.checked} 项）`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 数据整形

function renderFieldValue(parsed, key, raw) {
  if (!parsed) return null;
  switch (key) {
    case 'product_name':
      return parsed.product_name ?? null;
    case 'brand':
      return parsed.brand ?? null;
    case 'category':
      return parsed.category ?? null;
    case 'net_content':
      return parsed.net_content ?? null;
    case 'basis':
      return (
        <span>
          {parsed.nutrition?.basis_text ?? 'null'}
          {parsed.nutrition?.basis ? <span className="muted"> · {parsed.nutrition.basis}</span> : null}
        </span>
      );
    case 'ingredient_count':
      return Array.isArray(parsed.ingredients) ? `${parsed.ingredients.length} 条` : 'null';
    case 'ingredients_text':
      return parsed.ingredients_text ? (
        <span className="long-text">{parsed.ingredients_text}</span>
      ) : null;
    case 'unreadable':
      return Array.isArray(parsed.unreadable) && parsed.unreadable.length
        ? parsed.unreadable.join('；')
        : '（无）';
    default:
      return null;
  }
}

function buildNutrientRows(current) {
  const map = new Map();
  const order = [];

  for (const p of PROVIDERS) {
    const r = current.results?.[p.id];
    const items = r?.ok ? r.parsed?.nutrition?.items || [] : [];
    for (const it of items) {
      const name = String(it?.name || '').replace(/^[—\-–－一]+/, '').trim();
      if (!name) continue;
      const key = name;
      if (!map.has(key)) {
        map.set(key, { id: key, name });
        order.push(key);
      }
      const cell = map.get(key);
      const value = it?.value === null || it?.value === undefined ? null : it.value;
      const unit = it?.unit || '';
      const nrv = it?.nrv_percent;
      cell[p.id] =
        value === null
          ? it?.value === '' || it?.value === null
            ? '（识别为 null）'
            : String(it?.value ?? '')
          : `${value} ${unit}${nrv ? ` · NRV ${nrv}` : ''}`.trim();
    }
  }
  return order.map((k) => map.get(k));
}
