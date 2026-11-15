import { useState } from 'react';
import { callApi } from '../lib/api.js';
import { ResultBox, JsonBlock, KV, ErrorCard, Loading, Pill } from './ui.jsx';

const SAMPLE = `【测试样例 · 完全虚构，仅用于接口测试，请勿当作真实产品】
产品名称：阳光谷物脆（虚构）
配料表：小麦粉、白砂糖、植物油、麦芽糊精、食用盐、柠檬酸、黄原胶、维生素E
营养声称：0 蔗糖、0 反式脂肪
已知来源：
[1] 某国际组织食品添加剂联合评估报告（虚构占位来源）
[2] 某国家标准中关于食品添加剂的定义条款（虚构占位来源）
请针对配料表中的柠檬酸、黄原胶、维生素E 三项给出成分类别、用途、安全性说明和来源编号。`;

const MODES = [
  { id: 'normal', label: '正常调用', desc: '真实请求，检查 JSON 是否合法、字段是否齐全', real: true },
  {
    id: 'badshape',
    label: '诱导不合规（真实调用）',
    desc: '在 user prompt 里诱导模型少输出字段。多数情况下 system prompt 约束更强，模型不会照做，因此这个用例可能"打不中"',
    real: true,
  },
  {
    id: 'sim-missing',
    label: '模拟字段缺失（不调 API）',
    desc: '本地注入一段合法但缺 ingredients 的 JSON，确定性地验证字段校验器',
    real: false,
  },
  {
    id: 'sim-empty',
    label: '模拟空 content（不调 API）',
    desc: '本地注入空白内容，验证官方文档提到的「JSON mode 可能返回只剩空格」这一异常分支',
    real: false,
  },
];

/** 每个模式的结论文案都不同，不能共用一句「模拟空 content」 */
function headline(r) {
  if (!r) return '';
  if (r.mode === 'sim-empty') return '本地模拟：上游返回纯空格 content — 应被识别为空内容';
  if (r.mode === 'sim-missing') return '本地模拟：JSON 合法但缺少 ingredients — 应被字段校验拦截';
  if (r.mode === 'badshape')
    return r.overallValid ? '诱导未命中：模型仍返回了完整结构' : '模型按要求输出缺字段 JSON，校验器已拦截';
  return r.overallValid ? 'JSON 合法且必需字段齐全' : 'JSON 校验未通过（这正是错误处理要覆盖的场景）';
}

function statusOf(r) {
  if (!r) return 'warn';
  if (r.mode === 'sim-empty' || r.mode === 'sim-missing') return 'warn';
  if (r.mode === 'badshape') return r.overallValid ? 'warn' : 'ok';
  return r.overallValid ? 'ok' : 'err';
}

export default function TestB({ defaultModel }) {
  const [mode, setMode] = useState('normal');
  const [sample, setSample] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await callApi('/api/deepseek/json', { mode, sample });
      setResult(data);
    } catch (e) {
      setError({ code: e.code, message: e.message, httpStatus: e.httpStatus, detail: e.detail });
    } finally {
      setLoading(false);
    }
  }

  const list = Array.isArray(result?.parsed?.ingredients) ? result.parsed.ingredients : [];

  return (
    <section className="card">
      <div className="card-head">
        <span className="badge">B</span>
        <div>
          <h2>DeepSeek JSON 结构化输出</h2>
          <div className="sub">
            <code>response_format: {'{type:"json_object"}'}</code> + 程序侧 <code>JSON.parse</code> 与字段校验
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="field">
          <label>测试模式</label>
          <div className="row" style={{ gap: 8 }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={mode === m.id ? 'primary' : ''}
                onClick={() => setMode(m.id)}
                disabled={loading}
                title={m.desc}
                style={{ fontSize: 12.5 }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="hint">{MODES.find((m) => m.id === mode)?.desc}</div>
        </div>

        <div className="field">
          <label>测试材料（可编辑，默认内容已明确标注为虚构）</label>
          <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={7} disabled={loading} />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? '请求中…' : '调用 DeepSeek JSON'}
          </button>
          <span className="hint" style={{ marginTop: 0 }}>
            模型：<span className="mono">{defaultModel || 'deepseek-flash'}</span>
          </span>
        </div>

        {loading && <Loading text="DeepSeek 正在生成 JSON" />}
        <ErrorCard error={error} />

        {result && (
          <>
            <ResultBox status={statusOf(result)} title={headline(result)}>
              <KV
                rows={[
                  ['模式', result.mode],
                  ['模型', <span className="mono">{result.model}</span>],
                  ['上游端点', <span className="mono">{result.endpoint}</span>],
                  ['HTTP 状态', result.httpStatus ?? '未发起真实请求'],
                  ['耗时', result.durationMs ? `${result.durationMs} ms` : '—'],
                  ['finish_reason', result.finishReason ?? '—'],
                  [
                    'Token 用量',
                    result.usage
                      ? `输入 ${result.usage.prompt_tokens} / 输出 ${result.usage.completion_tokens} / 合计 ${result.usage.total_tokens}`
                      : '—',
                  ],
                  [
                    'JSON.parse',
                    result.jsonParse.ok ? (
                      <Pill tone="green">通过</Pill>
                    ) : (
                      <Pill tone="red">失败 · {result.jsonParse.reason}</Pill>
                    ),
                  ],
                  [
                    'content 是否为空',
                    result.isEmptyContent ? <Pill tone="amber">是（空字符串或纯空格）</Pill> : '否',
                  ],
                  [
                    '必需字段 ingredients',
                    result.structure?.valid ? (
                      <Pill tone="green">存在且为数组</Pill>
                    ) : (
                      <Pill tone="red">
                        不通过 · 缺失 {result.structure?.missing?.join('、') || '—'}
                      </Pill>
                    ),
                  ],
                  [
                    '数组元素字段校验',
                    result.itemErrors?.length
                      ? <Pill tone="red">{result.itemErrors.length} 项不合格</Pill>
                      : <Pill tone="green">全部合格</Pill>,
                  ],
                ]}
              />
            </ResultBox>

            {result.mode === 'badshape' && result.overallValid && (
              <div className="tips" style={{ borderLeftColor: 'var(--warn)' }}>
                <strong>诱导未命中（这是真实结论，不是 bug）：</strong>模型没有服从 user prompt 里"少输出字段"的指令，
                仍按 system 要求返回了完整结构。这反过来说明结构约束相当稳定；但这个用例没覆盖到校验失败分支，
                请再点一次「模拟字段缺失」，那里是确定性注入，必然触发校验拦截。
              </div>
            )}

            {result.simulated && (
              <div className="tips" style={{ borderLeftColor: 'var(--accent)' }}>
                本条为本地注入用例：没有发起真实网络请求，也没有消耗任何额度。它验证的是程序侧的错误处理代码，
                与上游返回异常时的表现一致。
              </div>
            )}

            {list.length > 0 && (
              <>
                <div className="section-title">解析出的成分（{list.length} 项）</div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>成分</th>
                      <th>类别</th>
                      <th>用途</th>
                      <th>安全性说明</th>
                      <th style={{ width: 66 }}>来源编号</th>
                      <th style={{ width: 70 }}>置信度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((it, i) => (
                      <tr key={i}>
                        <td>{it?.name ?? '—'}</td>
                        <td>{it?.category ?? '—'}</td>
                        <td>{it?.purpose ?? '—'}</td>
                        <td>{it?.safety_note ?? '—'}</td>
                        <td>{Array.isArray(it?.evidence_refs) ? it.evidence_refs.join(', ') || '—' : '—'}</td>
                        <td>{it?.confidence ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {result.itemErrors?.length > 0 && (
              <div className="tips" style={{ borderLeftColor: 'var(--err)' }}>
                元素级校验失败详情：
                {result.itemErrors
                  .map(
                    (e) =>
                      `#${e.index} 缺失[${e.missing.join('、') || '无'}] 类型错误[${e.wrongType.map((w) => w.field).join('、') || '无'}]`,
                  )
                  .join('；')}
              </div>
            )}

            <details open={!result.jsonParse.ok}>
              <summary>模型原始文本（content）</summary>
              <JsonBlock value={result.content || '(空字符串)'} maxHeight={260} />
            </details>

            {result.parsed && (
              <details>
                <summary>解析后的完整 JSON</summary>
                <JsonBlock value={result.parsed} maxHeight={320} />
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
