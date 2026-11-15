export function ResultBox({ status, title, children }) {
  if (!status) return null;
  const label = status === 'ok' ? '成功' : status === 'warn' ? '部分成功 / 需注意' : '失败';
  return (
    <div className={`result ${status}`}>
      <div className="result-head">
        <Pill tone={status === 'ok' ? 'green' : status === 'warn' ? 'amber' : 'red'}>{label}</Pill>
        <span>{title}</span>
      </div>
      <div className="result-body">{children}</div>
    </div>
  );
}

export function Pill({ tone = 'gray', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function JsonBlock({ value, maxHeight }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="pre" style={maxHeight ? { maxHeight } : undefined}>
      {text}
    </pre>
  );
}

export function KV({ rows }) {
  return (
    <div className="kv">
      {rows.filter(Boolean).map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="k">{k}</div>
          <div className="v">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function ErrorCard({ error, extra }) {
  if (!error) return null;
  return (
    <ResultBox status="err" title={error.message || '请求失败'}>
      <KV
        rows={[
          ['错误码', <span className="mono">{error.code || 'UNKNOWN'}</span>],
          ['HTTP 状态', error.httpStatus ?? '—'],
          extra,
        ]}
      />
      {error.detail ? (
        <details>
          <summary>查看脱敏后的错误详情</summary>
          <JsonBlock value={error.detail} maxHeight={240} />
        </details>
      ) : null}
    </ResultBox>
  );
}

export function Loading({ text }) {
  return (
    <div className="tips" style={{ marginTop: 14 }}>
      {text || '正在请求…'}（真实调用上游接口，可能需要几秒到几十秒）
    </div>
  );
}
