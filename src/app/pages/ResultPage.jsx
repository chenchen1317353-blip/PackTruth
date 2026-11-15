import { useEffect, useMemo, useRef, useState } from "react";
import { basisLabel } from "../../domain/nutrition.js";
import {
  ANALYSIS_STATUS,
  STATUS_META,
  analyzeClaims,
} from "../../domain/claims/index.js";
import { resolveEvidence, STANDARDS } from "../../domain/claims/evidence.js";
import {
  analyzeIngredients,
  knowledgeStats,
} from "../../domain/ingredients/index.js";
import IngredientSheet from "../components/IngredientSheet.jsx";
import { flattenIngredientNames } from "../../domain/ingredientStructure.js";
import { getCategoryHint } from "../ingredientView.js";
import "../detail-pages.css";

/**
 * 页面 3：分析结果。
 *
 * 第三阶段只做「包装话术拆解」这一条创新，成分解剖保留入口。
 * 所有结论都来自 src/domain/claims 的规则引擎，React 里不含任何判定逻辑。
 */
export default function ResultPage({ record, onBack, onRestart }) {
  const basis = record.nutrition.basis;
  const unitLabel = basis === "per_100ml" ? "mL" : "g";
  const canScale = basis === "per_100g" || basis === "per_100ml";

  const initialServing = useMemo(() => {
    const net = record.basic?.netContent;
    const factors = basis === "per_100ml" ? { mL: 1, L: 1000 } : { g: 1, kg: 1000 };
    const factor = factors[net?.unit];
    if (canScale && Number.isFinite(net?.value) && net.value > 0 && factor)
      return Math.max(10, Math.min(1000, Math.round(net.value * factor / 10) * 10));
    return 100;
  }, []);

  const [servingAmount, setServingAmount] = useState(initialServing);
  const [activeMatch, setActiveMatch] = useState(null);
  const actionBarRef = useRef(null);

  /**
   * 底栏是 fixed 定位，不占文档流。它的高度会随字号缩放、按钮换行、
   * 安全区域变化，所以量出实际高度写进 CSS 变量，末尾留白才能刚好够用。
   */
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--result-action-bar-height", `${h}px`);
    };
    apply();
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--result-action-bar-height");
    };
  }, []);

  // 食用量一变，规则结果立即重算 —— 不留旧值
  const analyses = useMemo(
    () =>
      analyzeClaims(record, { servingAmount: canScale ? servingAmount : null }),
    [record, servingAmount, canScale],
  );

  // 配料一改（改名/删除/新增），成分匹配立即重算
  const ingredientAnalysis = useMemo(
    () => analyzeIngredients(record),
    [record],
  );

  const sourceLabel = useMemo(() => {
    if (record.source.kind === "demo") return "演示数据（虚构商品）";
    if (record.source.kind === "manual") return "手动填写";
    return `${record.source.model || "模型"} 识别 · ${record.source.durationMs ?? "—"} ms`;
  }, [record.source]);

  const editedCount = Object.keys(record.review?.editedFields || {}).length;

  return (
    <div className="page result-page">
      <div className="detail-eyebrow">
        <span>03 / THE FULL PICTURE</span>
        <span>每一个结论，都有来处。</span>
      </div>
      <div className="page-head detail-page-head">
        <div>
          <span className="result-kicker">这份包装，读懂了。</span>
          <h1>{record.basic.productName || "未命名食品"}</h1>
          <div className="result-sub">
            <span>{record.basic.brand || "品牌未填写"}</span>
            {record.basic.netContent?.presence === "not_labeled" ? (
              <span>净含量未标示</span>
            ) : record.basic.netContent?.value != null ? (
              <span>
                净含量 {record.basic.netContent.value}
                {record.basic.netContent.unit}
              </span>
            ) : null}
            <span>基准 {basis ? basisLabel(basis) : "未确认"}</span>
          </div>
          <div className="source-line">
            数据来源：{sourceLabel}
            {editedCount > 0 && (
              <span className="edited-inline">
                · 已人工修改 {editedCount} 处
              </span>
            )}
          </div>
        </div>
        <div className="result-seal" aria-hidden="true">
          <span>PACK</span>
          <span>
            TRUTH<span className="seal-asterisk">✳</span>
          </span>
          <small>READ BETWEEN THE LABELS</small>
        </div>
      </div>

      <div className="record-overview" aria-label="已确认的包装信息摘要">
        <div className="overview-cell overview-ingredients">
          <span className="overview-label">配料表 / INGREDIENTS</span>
          <div>
            <strong>{record.ingredients.items.length}</strong>
            <span>项配料</span>
          </div>
          <span className="overview-caption">按包装上的标示顺序排列</span>
        </div>
        <div className="overview-cell overview-nutrition">
          <span className="overview-label">营养表 / NUTRITION</span>
          <div>
            <strong>
              {
                record.nutrition.items.filter(
                  (item) =>
                    item.value !== null && item.presence !== "not_labeled",
                ).length
              }
            </strong>
            <span>项已填数值</span>
          </div>
          <span className="overview-caption">
            {basis ? basisLabel(basis) : "基准未确认"} · 以确认后的数据为准
          </span>
        </div>
        <div className="overview-cell overview-claims">
          <span className="overview-label">包装话术 / CLAIMS</span>
          <div>
            <strong>{record.claims.length}</strong>
            <span>条宣传语</span>
          </div>
          <span className="overview-caption">逐条查看解释与来源依据</span>
        </div>
      </div>

      {record.source.kind === "demo" && record.demoNote && (
        <div className="alert warn" style={{ marginBottom: 14 }}>
          <strong>虚构演示数据：</strong>
          {record.demoNote}
        </div>
      )}

      {/* ---------- 创新点一：包装话术拆解（最先看到） ---------- */}
      <section className="result-section claims-section">
        <div className="section-head">
          <span className="detail-section-number">01</span>
          <h2>包装话术拆解</h2>
          <span className="section-tag">规则 v2</span>
        </div>
        <p className="section-desc">
          不是判断「对错」，而是说明这句话
          <strong>能说明什么、不能推出什么</strong>。 数值门槛来自 GB 28050—2011
          的公开条文，每张卡片都写明使用的版本与计量口径，并可展开核对原文。
        </p>

        {analyses.length === 0 ? (
          <div className="empty-block">
            还没有选择任何宣传语。返回上一步可以添加。
          </div>
        ) : (
          <div className="claim-cards">
            {analyses.map((a, index) => (
              <ClaimCard
                key={a.claimId || a.claimText}
                analysis={a}
                index={index}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------- 食用量（影响上面的理论上限换算） ---------- */}
      <section className="result-section serving-section">
        <div className="section-head">
          <span className="detail-section-number">02</span>
          <h2>单品食用量</h2>
          <span className="section-tag">纯数值换算</span>
        </div>
        {!canScale ? (
          <div className="empty-block">
            当前基准是「{basis ? basisLabel(basis) : "未确认"}
            」，无法按重量或体积缩放。 回到上一步改成「每 100 克 / 每 100
            毫升」后才能使用。
          </div>
        ) : (
          <>
            <div className="slider-row">
              <input
                type="range"
                aria-label={`单品食用量，单位${unitLabel}`}
                aria-valuetext={`${servingAmount} ${unitLabel}`}
                min="10"
                max="1000"
                step="10"
                value={servingAmount}
                onChange={(e) => setServingAmount(Number(e.target.value))}
              />
              <div className="slider-value" aria-live="polite">
                {servingAmount} {unitLabel}
              </div>
            </div>
            <p className="page-note">
              上面的「理论上限」和换算会跟着这个数字变。它只做算术，不代表你真实摄入了多少。
            </p>
          </>
        )}
      </section>

      {/* ---------- 创新点二：配料表别慌 ---------- */}
      <section className="result-section ingredients-section">
        <div className="section-head">
          <span className="detail-section-number">03</span>
          <h2>配料表别慌</h2>
          <span className="section-tag">
            已收录 {ingredientAnalysis.summary.matched}/
            {ingredientAnalysis.summary.total}
          </span>
        </div>
        <p className="section-desc">
          点任意一个配料，看它是什么、为什么用、常见误解、证据能支持什么。
          <strong>看不懂不等于有问题</strong>，没收录也不代表有风险。
        </p>

        {record.ingredients.presence === "not_labeled" ? (
          <div className="empty-block">包装未标示配料表。</div>
        ) : record.ingredients.items.length === 0 ? (
          <div className="empty-block">没有配料信息。返回上一步可以补录。</div>
        ) : (
          <ol className="ingredient-cards">
            {ingredientAnalysis.items.map(({ ingredient: it, match, children }) => {
              const hasChildren = children.length > 0;
              const groupIsKnown = hasChildren && match.status === "matched";
              return (
                <li key={it.id} className={hasChildren ? "ing-group" : ""}>
                  {hasChildren && !groupIsKnown ? (
                    <div className="ing-card-btn ing-group-head">
                      <span className="ing-idx">{it.order}</span>
                      <span className="ing-name">{it.name || "（空）"}</span>
                      <span className="ing-tag ing-count-tag">
                        包含 {children.length} 项
                      </span>
                    </div>
                  ) : (
                    <button
                      className={`ing-card-btn status-${match.status}`}
                      onClick={() => setActiveMatch(match)}
                    >
                      <span className="ing-idx">{it.order}</span>
                      <span className="ing-name">{it.name || "（空）"}</span>
                      <span className={`ing-tag tag-${tagOf(match)}`}>
                        {tagLabelOf(match)}
                      </span>
                      {hasChildren ? (
                        <span className="ing-group-count">
                          {children.length} 项
                        </span>
                      ) : (
                        <span className="ing-chevron">›</span>
                      )}
                    </button>
                  )}

                  {hasChildren && (
                    <details className="ing-child-block">
                      <summary>{children.length} 项具体成分</summary>
                      <div className="ing-child-list">
                        {children.map(({ ingredient: child, match: childMatch }) => (
                          <button
                            key={child.id}
                            className={`ing-child-btn status-${childMatch.status}`}
                            onClick={() => setActiveMatch(childMatch)}
                            aria-label={`查看${child.name || "子配料"}的解释`}
                          >
                            <span className="ing-child-name">
                              {child.name || "（空）"}
                            </span>
                            <span className={`ing-child-tag tag-${tagOf(childMatch)}`}>
                              {tagLabelOf(childMatch)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <p className="page-note">
          知识库目前收录 {knowledgeCount()}{" "}
          个成分，覆盖范围有限。点击配料查看详情，未收录的会明确说明。
        </p>
      </section>

      <p className="page-note">
        本页不提供医学诊断、用药建议或疾病治疗方案。所有数值结论均基于你确认后的标签数据，识别与计算错误可能仍然存在。
      </p>

      <div className="action-bar" ref={actionBarRef}>
        <div className="action-bar-inner">
          <button className="btn-ghost" onClick={onBack}>
            ← 返回修改
          </button>
          <button className="btn-primary" onClick={onRestart}>
            分析另一件商品
          </button>
        </div>
      </div>

      {activeMatch && (
        <IngredientSheet
          // key 用成分名：切换成分时强制重建组件。
          // 这样旧组件的请求会被 abort，旧结果不可能覆盖新卡片。
          key={activeMatch.input}
          match={activeMatch}
          onClose={() => setActiveMatch(null)}
          isDemo={record.source.kind === "demo"}
          foodContext={{
            productName: record.basic.productName || null,
            category: record.basic.category || null,
            nutrition: record.nutrition,
            ingredientsText: flattenIngredientNames(
              record.ingredients.items || [],
            ).join("、"),
          }}
        />
      )}
    </div>
  );
}

function tagOf(match) {
  if (match.status === "matched") return match.entry.categoryType;
  return match.status === "composite" ? "composite" : "unknown";
}

function tagLabelOf(match) {
  if (match.status === "matched") {
    const e = match.entry;
    if (e.categoryType === "additive")
      return (e.functions && e.functions[0]) || "食品添加剂";
    return e.categoryLabel.replace("普通", "");
  }
  if (match.status === "composite") return "复合配料";
  // 「香辛料」「复合调味料」这类是标签的类别写法，不是我们没查到的成分
  if (getCategoryHint(match.input)) return "类别写法";
  return "未收录";
}

function knowledgeCount() {
  // 用合并后的统计（本地 9 条 + 基础条目），不要只数核心条目
  return knowledgeStats().total;
}

// ---------------------------------------------------------------- 话术卡

function ClaimCard({ analysis, index }) {
  const meta = analysis.statusLabel
    ? { label: analysis.statusLabel, tone: analysis.statusTone || "amber" }
    : STATUS_META[analysis.status] || STATUS_META.insufficient;
  const isUnimplemented = analysis.status === ANALYSIS_STATUS.UNIMPLEMENTED;

  return (
    <article className={`claim-card status-${analysis.status}`}>
      <div className="claim-card-eyebrow">
        <span>CLAIM {String(index + 1).padStart(2, "0")}</span>
        <span>包装说了什么，事实说明什么。</span>
      </div>
      <div className="claim-card-head">
        <div className="claim-quote">「{analysis.claimText}」</div>
        <span className={`status-badge tone-${meta.tone}`}>{meta.label}</span>
      </div>

      {analysis.takeaway && (
        <p className={`claim-takeaway tone-${meta.tone}`}>{analysis.takeaway}</p>
      )}

      {analysis.summary && (
        <p className={`claim-summary ${analysis.takeaway ? "is-secondary" : ""}`}>
          {analysis.summary}
        </p>
      )}

      {!isUnimplemented &&
        (analysis.ruleName || analysis.claimTypeLabel || analysis.basisNote) && (
          <div className="claim-meta-row">
            {analysis.ruleName && (
              <span className="claim-meta-rule">{analysis.ruleName}</span>
            )}
            {analysis.claimTypeLabel && (
              <span className="claim-meta-type">{analysis.claimTypeLabel}</span>
            )}
            {analysis.basisNote && (
              <span className="claim-meta-basis">{analysis.basisNote}</span>
            )}
          </div>
        )}

      {analysis.standardNote && (
        <div
          className={`claim-version-note tone-${analysis.standardNoteTone || "neutral"}`}
        >
          <span>
            {analysis.standardNoteTone === "future" ? "版本提示" : "标准说明"}
          </span>
          {analysis.standardNote}
        </div>
      )}

      {analysis.flag === "mismatch" && (
        <div className="claim-mismatch" role="note">
          <strong>不一致疑点</strong>
          <span>
            {analysis.mismatchNote ||
              "这不是一般的「理解偏差」，而是已确认的标签数值与所采用标准的含量条件对不上。先核对原始包装、食品形态与适用标准版本，再判断这句话是否成立。"}
          </span>
        </div>
      )}

      {!isUnimplemented && (
        <div className="claim-grid">
          {/* 左：包装实际提供的信息 */}
          <div className="claim-panel">
            <div className="panel-title">包装提供的信息</div>
            {analysis.facts.length ? (
              <ul className="fact-list">
                {analysis.facts.map((f, i) => (
                  <li key={i} className={`fact-row tone-${f.tone || "normal"}`}>
                    <span className="fact-k">{f.label}</span>
                    <span className="fact-v">{f.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted-sm">没有可展示的标签数据</div>
            )}

            {analysis.missing?.length > 0 && (
              <div className="missing-box">
                <div className="missing-title">缺少的数据</div>
                <ul>
                  {analysis.missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 右：PackTruth 的解释 */}
          <div className="claim-panel">
            <div className="panel-title">PackTruth 的解释</div>

            {analysis.canConclude?.length > 0 && (
              <div className="conclude-block can">
                <div className="conclude-title">能说明</div>
                <ul>
                  {analysis.canConclude.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.cannotConclude?.length > 0 && (
              <div className="conclude-block cannot">
                <div className="conclude-title">不能推出</div>
                <ul>
                  {analysis.cannotConclude.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.calculation && (
              <div className="calc-box">
                <div className="calc-label">{analysis.calculation.label}</div>
                <div className="calc-expression">
                  {analysis.calculation.expression}
                </div>
                <div className="calc-result">
                  = {analysis.calculation.result} {analysis.calculation.unit}
                  {analysis.calculation.isUpperBound && (
                    <span className="upper-tag">理论上限</span>
                  )}
                </div>
                <div className="calc-note">{analysis.calculation.note}</div>
              </div>
            )}

            {!analysis.canConclude?.length &&
              !analysis.cannotConclude?.length &&
              !analysis.calculation && (
                <div className="muted-sm">这条宣传语暂时没有可展开的解释。</div>
              )}
          </div>
        </div>
      )}

      {analysis.warnings?.length > 0 && (
        <div className="claim-warnings">
          {analysis.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      <EvidenceList
        ids={analysis.evidence}
        ruleVersion={analysis.ruleVersion}
      />
    </article>
  );
}

// ---------------------------------------------------------------- 来源

function EvidenceList({ ids, ruleVersion }) {
  const items = resolveEvidence(ids);
  if (!items.length) return null;
  return (
    <details className="evidence-block">
      <summary>
        查看来源依据（{items.length} 条 · 规则版本 {ruleVersion}）
      </summary>
      <div className="evidence-items">
        {items.map((e) => {
          const std = STANDARDS[e.standard];
          return (
            <div className="evidence-card" key={e.id}>
              <div className="ev-head">
                <span className="ev-standard">{std?.code}</span>
                <span className={`ev-type ${e.quoteType}`}>
                  {e.quoteType === "verbatim" ? "原文摘录" : "摘要（非逐字）"}
                </span>
              </div>
              <div className="ev-clause">{e.clause}</div>
              <blockquote className="ev-quote">{e.quote}</blockquote>
              {e.plain && <div className="ev-plain">{e.plain}</div>}
              {e.conditions?.length > 0 && (
                <div className="ev-cond">
                  <div className="ev-cond-title">适用条件</div>
                  <ul>
                    {e.conditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="ev-foot">
                <span>
                  {std?.title} · {std?.issuer} · 实施 {std?.effectiveAt}
                </span>
                {e.sourceUrl && (
                  <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                    官方原文 ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
