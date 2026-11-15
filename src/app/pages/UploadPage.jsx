import { useEffect, useRef, useState } from "react";
import { callApi, fileToBase64 } from "../../lib/api.js";
import {
  CLAIM_PRESETS,
  DEMO_SAMPLES,
  createDemoRecord,
} from "../../domain/demoData.js";
import {
  addClaim,
  createFoodRecord,
  fromRecognition,
} from "../../domain/foodRecord.js";
import BrandIcon from "../components/BrandIcon.jsx";

const MAX_MB = 10;

/**
 * 页面 1：食品上传。
 *
 * 第三阶段变化：
 * - 不再指定 provider，由服务端决定（当前是 DeepSeek Vision）
 * - 加载时给分阶段文字提示，但不显示任何百分比 —— 模型没有提供进度，编一个就是假信息
 * - 失败给「重试」和「手动填写」两个出口，不自动重试、不自动换模型
 */
export default function UploadPage({ onRecognized }) {
  const [img, setImg] = useState(null);
  const [claims, setClaims] = useState([]);
  const [manual, setManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const timerRef = useRef(null);
  const previewRef = useRef(null);
  const mountedRef = useRef(false);
  const fileReadRef = useRef(0);
  const requestRef = useRef(null);

  // 卸载时：停掉加载提示计时器，释放预览图的 objectURL
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fileReadRef.current += 1;
      requestRef.current?.abort();
      clearInterval(timerRef.current);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const PHASES = [
    "正在读取包装上的文字…",
    "正在识别配料表与营养成分表…",
    "正在整理成可核对的数据…",
    "这张图信息较多，仍在处理中…",
  ];

  function startPhaseTicker() {
    setPhase(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPhase((p) => (p < PHASES.length - 1 ? p + 1 : p));
    }, 4500);
  }

  function stopPhaseTicker() {
    clearInterval(timerRef.current);
  }

  async function acceptFile(file) {
    setError(null);
    if (!file) return;
    const readId = ++fileReadRef.current;
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) {
      setError({
        message: `不支持的格式：${file.type || "未知"}，请用 JPG 或 PNG`,
      });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError({
        message: `图片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${MAX_MB}MB`,
      });
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      if (!mountedRef.current || readId !== fileReadRef.current) return;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const preview = URL.createObjectURL(file);
      previewRef.current = preview;
      setImg({
        base64,
        mimeType: file.type,
        name: file.name,
        size: file.size,
        preview,
      });
    } catch {
      if (!mountedRef.current || readId !== fileReadRef.current) return;
      setError({ kind: "file", message: "图片读取失败，请重新选择一张图片。" });
    }
  }

  function togglePreset(p) {
    setClaims((prev) =>
      prev.some((c) => c.text === p.text)
        ? prev.filter((c) => c.text !== p.text)
        : [
            ...prev,
            { id: `c_${p.id}`, text: p.text, source: "preset", presetId: p.id },
          ],
    );
  }

  function addManual() {
    const t = manual.trim();
    if (!t) return;
    if (!claims.some((c) => c.text === t)) {
      setClaims((prev) => [
        ...prev,
        { id: `c_m_${Date.now()}`, text: t, source: "manual", presetId: null },
      ]);
    }
    setManual("");
  }

  function attachClaims(record) {
    return claims.reduce(
      (acc, c) =>
        addClaim(acc, c.text, { source: c.source, presetId: c.presetId }),
      record,
    );
  }

  async function recognize() {
    if (!img || loading) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    startPhaseTicker();
    try {
      // 不传 provider —— 用哪个模型由服务端配置决定
      const data = await callApi(
        "/api/vision/extract",
        { imageBase64: img.base64, mimeType: img.mimeType },
        { timeoutMs: 200000, signal: controller.signal },
      );

      if (!mountedRef.current || controller.signal.aborted) return;

      if (!data.parsed) {
        setError({
          kind: "parse",
          // 一个字段都没拿到时，「不完整」会让人以为还剩了一半，标题要说实话
          title: "这次没能读出内容",
          message: `这次没有拿到可核对的内容，也没有可安全恢复的字段（${describeParseFailure(data)}）。照片还在，可以直接重试，或者跳过识别手动填写。`,
          code: data.jsonParse?.reason,
          requestId: data.requestId || null,
        });
        return;
      }

      // 部分恢复：只保留已经闭合的字段；写了一半的内容不会被当成完整数据。
      const partialFields = data.partial ? describeRecoveredFields(data.parsed) : [];
      const partialMissing = data.partial ? describeMissingFields(data.partialMissing) : [];
      if (data.partial && partialFields.length === 0) {
        setError({
          kind: "parse",
          message: `模型输出被截断，只恢复了少量说明性内容，不足以核对（${describeParseFailure(data)}）。照片还在，可以重试或手动填写。`,
          code: data.jsonParse?.reason,
          requestId: data.requestId || null,
        });
        return;
      }

      const record = fromRecognition(data.parsed, {
        kind: "photo",
        image: {
          name: img.name,
          mimeType: data.image?.mimeType || img.mimeType,
          size: img.size,
          width: data.image?.width ?? null,
          height: data.image?.height ?? null,
        },
        provider: data.provider,
        model: data.model,
        durationMs: data.durationMs,
        usage: data.usage,
        partial: Boolean(data.partial),
        partialFields,
        partialMissing,
      });

      onRecognized(attachClaims(record));
    } catch (e) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setError({
        kind: "api",
        message: e.message,
        code: e.code,
        httpStatus: e.httpStatus,
        requestId: e.requestId || null,
      });
    } finally {
      stopPhaseTicker();
      setLoading(false);
    }
  }

  function startDemo(sampleId) {
    onRecognized(attachClaims(createDemoRecord(sampleId)));
  }

  function skipRecognition() {
    const empty = createFoodRecord();
    empty.source.kind = "manual";
    onRecognized(attachClaims(empty));
  }

  return (
    <div className="page upload-page">
      <section className="intro" aria-labelledby="intro-title">
        <div className="intro-copy">
          <div className="eyebrow">
            <span className="live-dot" /> THE TRUTH, UNPACKED.
          </div>
          <h1 id="intro-title">
            看懂包装。
            <br />
            <span>选择，心里有数。</span>
            <span className="title-asterisk" aria-hidden="true">
              ✳
            </span>
          </h1>
        </div>
        <div className="intro-aside">
          <span className="editorial-line">
            A little clarity.
            <br />
            <em>A better choice.</em>
          </span>
          <p>
            从配料表到营养成分，
            <br />
            把复杂的标签，变成看得懂的信息。
          </p>
          <div className="intro-index">
            <span>食物真相，从翻到背面开始</span>
            <BrandIcon name="diagonal" size={19} />
          </div>
        </div>
      </section>

      <section
        className="how-section"
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className="how-intro">
          <div className="eyebrow">LESS GUESSWORK. MORE CLARITY.</div>
          <h2 id="how-title">
            三步，
            <br />
            离真相更近一点。
          </h2>
          <BrandIcon name="spark" size={38} />
        </div>
        <div className="how-steps">
          {[
            {
              icon: "scan",
              title: "拍下背面",
              text: "一张清晰的包装照片，让配料与营养信息完整入镜。",
            },
            {
              icon: "check",
              title: "确认信息",
              text: "逐项核对识别结果。缺失、未标示与零值，清楚区分。",
            },
            {
              icon: "book",
              title: "看懂标签",
              text: "拆解宣传语，了解配料，按实际食用量进行数值换算。",
            },
          ].map((s, i) => (
            <div className="how-step" key={s.title}>
              <div className="how-step-top">
                <span>0{i + 1}</span>
                <BrandIcon name={s.icon} size={25} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="workspace"
        id="workspace"
        aria-labelledby="workspace-title"
      >
        <div className="workspace-topline">
          <div>
            <span className="section-number">02 /</span>
            <h2 id="workspace-title">你的食物，值得了解。</h2>
          </div>
          <span className="workspace-status">
            <span className="live-dot" /> AI 标签识别
          </span>
        </div>
        <div className="workspace-grid">
          <section className="scan-card">
            <div className="scan-heading">
              <span className="scan-heading-icon">
                <BrandIcon name="scan" size={21} />
              </span>
              <div>
                <h3>拍下包装背面</h3>
                <p>让配料表与营养成分表清晰入镜</p>
              </div>
              <span className="tiny-label">SCAN / 01</span>
            </div>
            <div
              className={`dropzone ${over ? "over" : ""} ${img ? "has-image" : ""} ${loading ? "is-scanning" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!loading) setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (!loading) acceptFile(e.dataTransfer.files?.[0]);
              }}
            >
              <button
                className="scan-upload"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                aria-label={img ? "更换包装图片" : "点击拍照或选择图片"}
              >
                {img ? (
                  <img
                    src={img.preview}
                    alt="待识别包装"
                    className="drop-preview"
                  />
                ) : (
                  <>
                    <div className="scan-art" aria-hidden="true">
                      <span className="scan-corner corner-tl" />
                      <span className="scan-corner corner-tr" />
                      <span className="scan-corner corner-bl" />
                      <span className="scan-corner corner-br" />
                      <div className="label-paper">
                        <div className="paper-brand">
                          THE DAILY GOOD<span>®</span>
                        </div>
                        <div className="paper-title">
                          好好吃，
                          <br />
                          好好了解。
                        </div>
                        <div className="paper-rule" />
                        <div className="paper-small">NUTRITION FACTS</div>
                        <div className="paper-lines">
                          <i />
                          <i />
                          <i />
                        </div>
                        <div className="paper-bottom">
                          <span className="paper-barcode" />
                          <BrandIcon name="leaf" size={22} />
                        </div>
                      </div>
                      <span className="scan-line" />
                      <span className="scan-float">
                        <BrandIcon name="plus" size={18} />
                      </span>
                    </div>
                    <span className="drop-title">
                      点击拍照或选择图片 <BrandIcon name="diagonal" size={17} />
                    </span>
                    <span className="drop-sub">也可以将图片拖到这里</span>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                aria-label="上传食品包装"
                accept="image/jpeg,image/png,image/webp,image/bmp"
                hidden
                disabled={loading}
                onChange={(e) => {
                  acceptFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="upload-formats">
                JPG · PNG · WEBP · BMP <span>最大 {MAX_MB} MB</span>
              </div>
            </div>
            {img && !loading && (
              <div className="file-meta">
                <span>
                  {img.name} · {(img.size / 1024).toFixed(0)} KB
                </span>
                <button
                  className="link-btn"
                  onClick={() => {
                    fileReadRef.current += 1;
                    URL.revokeObjectURL(img.preview);
                    previewRef.current = null;
                    setImg(null);
                  }}
                >
                  移除图片 ×
                </button>
              </div>
            )}
            <div className="scan-actions">
              <span>
                <BrandIcon name="image" size={16} /> 拍清文字，避开反光
              </span>
              <button
                className="btn-primary recognize-btn"
                onClick={recognize}
                disabled={!img || loading}
              >
                {loading ? "正在识别" : "开始识别"}
                <BrandIcon name="arrow" size={18} />
              </button>
            </div>
            <p className="page-note">
              图片先在本机预览；点击「开始识别」后，会经本地服务发送至 DeepSeek 进行识别。请避免上传含人脸、联系方式等个人信息的照片。
            </p>
            {loading && (
              <div className="loading-block" role="status" aria-live="polite">
                <div className="spinner" />
                <div>
                  <div className="loading-text">{PHASES[phase]}</div>
                  <div className="loading-sub">通常需要 5–20 秒，请稍候。</div>
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="alert error" role="alert">
                <div className="alert-title">
                  {error.title ||
                    (error.kind === "parse"
                      ? "识别结果不完整"
                      : error.kind === "api"
                        ? "识别失败"
                        : "请检查图片")}
                </div>
                <div>{error.message}</div>
                {error.requestId && (
                  <div className="error-ref">识别编号 {error.requestId}（反馈问题时提供这 6 位即可）</div>
                )}
                <div className="error-actions">
                  {img && (
                    <button className="btn-ghost small" onClick={recognize}>
                      重试一次
                    </button>
                  )}
                  <button className="link-btn" onClick={skipRecognition}>
                    跳过识别，直接手动填写 →
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="workspace-aside">
            <div className="insight-card">
              <div className="insight-top">
                <span>BEYOND THE LABEL</span>
                <BrandIcon name="spark" size={24} />
              </div>
              <h3>
                大字是承诺，
                <br />
                <span>小字有答案。</span>
              </h3>
              <div className="zero-graphic" aria-hidden="true">
                <span>0</span>
                <div className="zero-orbit" />
                <span className="zero-tag">蔗糖？脂肪？</span>
              </div>
              <p>
                同样一个「0」，含义可能不同。
                <br />
                从标签出发，了解它能说明什么。
              </p>
              <button
                className="insight-link"
                disabled={loading}
                onClick={() => startDemo("drink")}
              >
                拆解一瓶气泡水{" "}
                <span>
                  <BrandIcon name="diagonal" size={20} />
                </span>
              </button>
            </div>
            <div className="clarity-card">
              <span className="clarity-icon">
                <BrandIcon name="shield" size={23} />
              </span>
              <div>
                <strong>先核对，再下结论。</strong>
                <p>识别只是起点，信息始终由你确认。</p>
              </div>
            </div>
          </aside>
        </div>

        <section className="claims-section" aria-labelledby="claims-title">
          <div className="claims-heading">
            <div>
              <span className="tiny-label">A LITTLE MORE CONTEXT</span>
              <h2 id="claims-title">包装上，还写了什么？</h2>
              <p>选中你看到的宣传语，我们一起拆解。</p>
            </div>
            <span className="optional-tag">可选 · 支持多选</span>
          </div>
          <div className="claims-content">
            <div className="chip-grid">
              {CLAIM_PRESETS.map((p) => {
                const on = claims.some((c) => c.text === p.text);
                return (
                  <button
                    key={p.id}
                    className={`chip ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => togglePreset(p)}
                    disabled={loading}
                  >
                    {p.text}
                    <span aria-hidden="true">{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
            <div className="manual-row">
              <input
                aria-label="其他包装宣传语"
                type="text"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    addManual();
                }}
                placeholder="还有别的说法？在这里补充"
                disabled={loading}
              />
              <button
                className="btn-ghost"
                onClick={addManual}
                disabled={loading || !manual.trim()}
              >
                添加 <span aria-hidden="true">↗</span>
              </button>
            </div>
            {claims.length > 0 && (
              <div className="selected-claims" aria-live="polite">
                {claims.map((c) => (
                  <span className="claim-tag" key={c.id}>
                    {c.text}
                    <button
                      aria-label={`移除宣传语 ${c.text}`}
                      onClick={() =>
                        setClaims((prev) => prev.filter((x) => x.id !== c.id))
                      }
                      disabled={loading}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      <section
        className="samples-section"
        id="samples"
        aria-labelledby="samples-title"
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">TRY A LITTLE TRUTH</div>
            <h2 id="samples-title">没有照片？先尝一口真相。</h2>
          </div>
          <span className="samples-note">
            虚构样品 · 无需上传 <BrandIcon name="diagonal" size={18} />
          </span>
        </div>
        <div className="demo-list">
          {DEMO_SAMPLES.map((s, i) => (
            <button
              key={s.id}
              className={`demo-item demo-${s.id}`}
              onClick={() => startDemo(s.id)}
              disabled={loading}
            >
              <span className="sample-topline">
                <span>样品 / 0{i + 1}</span>
                <BrandIcon name="diagonal" size={20} />
              </span>
              <span
                className={`sample-visual sample-${s.id}`}
                aria-hidden="true"
              >
                <span className="sample-object">
                  <span className="sample-brand">p/t.</span>
                  <span className="sample-flavor">
                    {["LIME", "OAT", "MILK"][i]}
                  </span>
                  <span className="sample-detail">
                    {["清柠气泡", "燕麦纤维", "原味发酵"][i]}
                  </span>
                </span>
                <span className="sample-shadow" />
              </span>
              <span className="demo-name">{s.label}</span>
              <span className="demo-desc">
                {
                  [
                    "读懂「0 蔗糖」与「0 脂肪」",
                    "看看配料，算算每一份营养",
                    "分清「未标示」和「标示为 0」",
                  ][i]
                }
              </span>
              <span className="sample-bottom">
                开始体验 <BrandIcon name="arrow" size={17} />
              </span>
            </button>
          ))}
        </div>
        <p className="page-note sample-disclaimer">
          演示样品与包装插画均为虚构，仅用于体验完整分析流程，不代表真实商品。
        </p>
      </section>

      <div className="brand-endnote" aria-hidden="true">
        PackTruth<span>®</span>
      </div>
    </div>
  );
}

const RECOVERED_LABELS = {
  product_name: '食品名称',
  brand: '品牌',
  category: '产品类别',
  net_content: '净含量',
  ingredients_text: '配料原文',
  ingredients: '配料列表',
  nutrition: '营养成分表',
  claims: '包装宣传语',
  notes: '识别说明',
};

/**
 * 「未完成」用与「已恢复」不同的字段名，避免用户把两者混为一谈。
 * 只列真正影响核对的核心字段，说明性字段缺了不提示，避免噪音。
 */
const ESSENTIAL_LABELS = {
  product_name: '食品名称',
  net_content: '净含量',
  ingredients_text: '配料原文',
  nutrition: '营养成分表',
};

/** 只把真正能用于核对的内容算作「恢复成功」 */
function describeRecoveredFields(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const out = [];
  for (const key of ['product_name', 'net_content', 'ingredients_text', 'brand', 'category']) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) out.push(RECOVERED_LABELS[key]);
  }
  if (parsed.nutrition && typeof parsed.nutrition === 'object') {
    const n = Array.isArray(parsed.nutrition.items) ? parsed.nutrition.items.length : 0;
    if (parsed.nutrition.basis || n) {
      out.push(`${RECOVERED_LABELS.nutrition}（${n} 项）`);
    }
  }
  if (Array.isArray(parsed.claims) && parsed.claims.length) out.push(RECOVERED_LABELS.claims);
  return out;
}

/** 截断时还缺哪些核心字段（由服务端按 schema 计算，前端只做文案映射） */
function describeMissingFields(keys) {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => ESSENTIAL_LABELS[k]).map((k) => ESSENTIAL_LABELS[k]);
}

function describeParseFailure(data) {
  if (data?.finishReason === "length") return "模型输出被长度上限截断";
  if (data?.jsonParse?.reason === "EMPTY_CONTENT") return "模型这次没有返回可读内容";
  if (data?.jsonParse?.reason === "NO_OBJECT") return "返回内容里没有可解析的数据块";
  if (data?.jsonParse?.reason === "INVALID_JSON") return "返回内容不是完整的 JSON";
  return data?.jsonParse?.reason || "未知原因";
}
