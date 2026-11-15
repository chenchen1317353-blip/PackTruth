import { useEffect, useMemo, useState } from "react";
import {
  PRESENCE,
  PRESENCE_LABELS,
  addClaim,
  inferPhysicalForm,
  guessNutrientKey,
  markEdited,
  parseNetContent,
  removeClaim,
  validateFoodRecord,
} from "../../domain/foodRecord.js";
import {
  BASIS_LIST,
  basisLabel,
  parseNutrientValue,
  normalizeUnit,
} from "../../domain/nutrition.js";
import { CLAIM_PRESETS, CLAIM_PRESETS_MORE } from "../../domain/demoData.js";
import { REGISTERED_RULE_COUNT } from "../../domain/claims/index.js";
import "../detail-pages.css";

/**
 * 页面 2：食品数据确认。
 *
 * 第三阶段的核心变化：每个字段都能表达三种状态 ——
 *   有数值（含 0） / 待补录（识别失败） / 包装未标示
 * 这三种状态在结果页会被区别对待，「0」和「没识别」绝不能被当成一回事。
 */

export default function ConfirmPage({ record, onChange, onBack, onConfirm }) {
  const [showAddClaim, setShowAddClaim] = useState(false);
  const [showMoreClaims, setShowMoreClaims] = useState(false);
  const [newClaim, setNewClaim] = useState("");

  const check = useMemo(() => validateFoodRecord(record), [record]);
  const editedCount = Object.keys(record.review?.editedFields || {}).length;

  const pendingNutrients = record.nutrition.items.filter(
    (it) => it.presence !== PRESENCE.NOT_LABELED && it.value === null,
  );
  const notLabeledCount = record.nutrition.items.filter(
    (it) => it.presence === PRESENCE.NOT_LABELED,
  ).length;

  function patchBasic(field, value) {
    onChange(
      markEdited(
        { ...record, basic: { ...record.basic, [field]: value || null } },
        `basic.${field}`,
      ),
    );
  }

  function updateNetContent(text) {
    const parsed = parseNetContent(text);
    onChange(
      markEdited(
        {
          ...record,
          basic: {
            ...record.basic,
            netContent: {
              ...parsed,
              presence: text?.trim() ? PRESENCE.LABELED : PRESENCE.UNREADABLE,
            },
          },
        },
        "basic.netContent",
      ),
    );
  }

  function toggleNetLabeled() {
    const cur = record.basic.netContent;
    const next =
      cur.presence === PRESENCE.NOT_LABELED
        ? { value: null, unit: null, text: null, presence: PRESENCE.UNREADABLE }
        : {
            value: null,
            unit: null,
            text: null,
            presence: PRESENCE.NOT_LABELED,
          };
    onChange(
      markEdited(
        { ...record, basic: { ...record.basic, netContent: next } },
        "basic.netContent",
      ),
    );
  }

  function setPhysicalForm(form) {
    onChange(
      markEdited(
        { ...record, basic: { ...record.basic, physicalForm: form } },
        "basic.physicalForm",
      ),
    );
  }

  function setBasis(basisId) {
    onChange(
      markEdited(
        { ...record, nutrition: { ...record.nutrition, basis: basisId } },
        "nutrition.basis",
      ),
    );
  }

  // ---------- 配料 ----------
  function updateIngredient(id, name) {
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            presence: PRESENCE.LABELED,
            items: record.ingredients.items.map((it) =>
              it.id === id ? { ...it, name } : it,
            ),
          },
        },
        "ingredients.items",
      ),
    );
  }

  function updateChild(parentId, childId, name) {
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            items: record.ingredients.items.map((it) =>
              it.id === parentId
                ? {
                    ...it,
                    children: (it.children || []).map((c) =>
                      c.id === childId ? { ...c, name } : c,
                    ),
                  }
                : it,
            ),
          },
        },
        'ingredients.items',
      ),
    );
  }

  function addChild(parentId) {
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            items: record.ingredients.items.map((it) =>
              it.id === parentId
                ? {
                    ...it,
                    children: [
                      ...(it.children || []),
                      {
                        id: `ingc_new_${Date.now()}`,
                        order: (it.children || []).length + 1,
                        name: '',
                        raw: '',
                        children: [],
                      },
                    ],
                  }
                : it,
            ),
          },
        },
        'ingredients.items',
      ),
    );
  }

  function removeChild(parentId, childId) {
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            items: record.ingredients.items.map((it) =>
              it.id === parentId
                ? {
                    ...it,
                    children: (it.children || [])
                      .filter((c) => c.id !== childId)
                      .map((c, i) => ({ ...c, order: i + 1 })),
                  }
                : it,
            ),
          },
        },
        'ingredients.items',
      ),
    );
  }

  function removeIngredient(id) {
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            items: record.ingredients.items
              .filter((it) => it.id !== id)
              .map((it, i) => ({ ...it, order: i + 1 })),
          },
        },
        "ingredients.items",
      ),
    );
  }

  function addIngredient() {
    const items = [
      ...record.ingredients.items,
      {
        id: `ing_new_${Date.now()}`,
        order: record.ingredients.items.length + 1,
        name: "",
        raw: "",
        children: [],
      },
    ];
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            presence: PRESENCE.LABELED,
            items,
          },
        },
        "ingredients.items",
      ),
    );
  }

  function moveIngredient(id, dir) {
    const items = [...record.ingredients.items];
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            items: items.map((it, k) => ({ ...it, order: k + 1 })),
          },
        },
        "ingredients.items",
      ),
    );
  }

  function toggleIngredientsPresence() {
    const cur = record.ingredients.presence;
    onChange(
      markEdited(
        {
          ...record,
          ingredients: {
            ...record.ingredients,
            presence:
              cur === PRESENCE.NOT_LABELED
                ? PRESENCE.UNREADABLE
                : PRESENCE.NOT_LABELED,
          },
        },
        "ingredients.presence",
      ),
    );
  }

  // ---------- 营养 ----------
  function updateNutrient(id, patch) {
    onChange(
      markEdited(
        {
          ...record,
          nutrition: {
            ...record.nutrition,
            items: record.nutrition.items.map((it) => {
              if (it.id !== id) return it;
              if (!Object.hasOwn(patch, "name")) return { ...it, ...patch };
              const key = guessNutrientKey(patch.name);
              return {
                ...it,
                ...patch,
                key,
                parentKey: key === it.key ? it.parentKey : null,
                unit: normalizeUnit(it.unit, key === "energy" ? "energy" : "mass"),
              };
            }),
          },
        },
        "nutrition.items",
      ),
    );
  }

  function toggleNutrientPresence(id) {
    const it = record.nutrition.items.find((x) => x.id === id);
    if (!it) return;
    if (it.presence === PRESENCE.NOT_LABELED) {
      updateNutrient(id, { presence: PRESENCE.UNREADABLE, value: null });
    } else {
      updateNutrient(id, {
        presence: PRESENCE.NOT_LABELED,
        value: null,
        status: "NOT_LABELED",
      });
    }
  }

  function removeNutrient(id) {
    onChange(
      markEdited(
        {
          ...record,
          nutrition: {
            ...record.nutrition,
            items: record.nutrition.items.filter((it) => it.id !== id),
          },
        },
        "nutrition.items",
      ),
    );
  }

  function addNutrient() {
    onChange(
      markEdited(
        {
          ...record,
          nutrition: {
            ...record.nutrition,
            items: [
              ...record.nutrition.items,
              {
                id: `nut_new_${Date.now()}`,
                key: "other",
                name: "",
                value: null,
                unit: null,
                nrvPercent: null,
                parentKey: null,
                rawText: null,
                status: "UNKNOWN",
                presence: PRESENCE.UNREADABLE,
              },
            ],
          },
        },
        "nutrition.items",
      ),
    );
  }

  function handleAddClaim() {
    const t = newClaim.trim();
    if (!t) return;
    onChange(markEdited(addClaim(record, t, { source: "manual" }), "claims"));
    setNewClaim("");
    setShowAddClaim(false);
  }

  return (
    <div className="page confirm-page">
      <div className="detail-eyebrow">
        <span>02 / REVIEW</span>
        <span>由你确认，让分析更准确。</span>
      </div>
      <div className="page-head detail-page-head">
        <div>
          <h1>确认识别结果</h1>
          <p>
            模型一定会有错，请对照手里的包装逐项核对。
            <strong>
              看不清的可以留空，包装上没印的可以标「未标示」，都不要填 0。
            </strong>
          </p>
          {editedCount > 0 && (
            <div className="edited-badge">已修改 {editedCount} 处</div>
          )}
        </div>
        <div
          className="review-stamp"
          aria-label={`${record.ingredients.items.length} 项配料，${record.nutrition.items.length} 项营养数据待核对`}
        >
          <span className="review-stamp-label">YOUR LABEL, DECODED.</span>
          <strong>
            {String(
              record.ingredients.items.length + record.nutrition.items.length,
            ).padStart(2, "0")}
            <span>项</span>
          </strong>
          <span>配料与营养数据 · 等你核对</span>
        </div>
      </div>

      {record.source?.partial && (
        <div className="alert warn partial-notice" role="status">
          <div className="alert-title">
            已保留识别到的部分内容，请检查并补全。
          </div>
          <div>
            模型输出被长度上限截断。这次只恢复并保留了：
            {(record.source.partialFields || []).join("、") || "少量字段"}。
            {record.source.partialMissing?.length > 0 && (
              <>
                本次没有完成：{record.source.partialMissing.join("、")}
                ——这部分保持空白，需要你手动补。
              </>
            )}
            {!(record.source.partialMissing?.length > 0) &&
              "没有写完的配料和营养数值保持为空，不会自动补 0，也没有被当成完整数据。"}
          </div>
          <div className="partial-notice-counts">
            当前已填入：配料 {record.ingredients.items.length} 项
            {record.ingredients.items.some((it) => it.children?.length)
              ? `（含括号内 ${record.ingredients.items.reduce(
                  (n, it) => n + (it.children?.length || 0),
                  0,
                )} 个具体成分）`
              : ""}
            、营养成分 {record.nutrition.items.length} 项。原文里能完整读出的配料已按原文补全，
            模型没写完的部分保持空白。
          </div>
          <div className="partial-notice-hint">
            请重点核对空白项和配料括号里的具体成分，确认后再进入分析。
          </div>
        </div>
      )}

      {(pendingNutrients.length > 0 || notLabeledCount > 0) && (
        <div className="alert warn review-progress" role="status">
          <div className="alert-title">核对进度</div>
          <div>
            {pendingNutrients.length > 0 && (
              <>还有 {pendingNutrients.length} 项营养数据没有处理；</>
            )}
            {notLabeledCount > 0 && (
              <> 已有 {notLabeledCount} 项标为「包装未标示」</>
            )}
          </div>
          <div className="muted">
            留空的项在结果页会显示「未识别」，不会当成 0。
          </div>
          <button
            className="link-btn"
            onClick={() =>
              document
                .getElementById("sec-nutrition")
                ?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                  block: "start",
                })
            }
          >
            去处理营养数据 ↓
          </button>
        </div>
      )}

      <div className="confirm-grid">
        {/* ---------- 基本信息 ---------- */}
        <section className="block confirm-basic">
          <div className="block-head">
            <span className="detail-section-number">01</span>
            <h2>基本信息</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>食品名称</span>
              <input
                type="text"
                value={record.basic.productName ?? ""}
                onChange={(e) => patchBasic("productName", e.target.value)}
                placeholder="未识别，可留空"
              />
            </label>
            <label className="field">
              <span>品牌</span>
              <input
                type="text"
                value={record.basic.brand ?? ""}
                onChange={(e) => patchBasic("brand", e.target.value)}
                placeholder="未识别，可留空"
              />
            </label>
            <label className="field">
              <span>净含量</span>
              <input
                type="text"
                value={
                  record.basic.netContent?.presence === PRESENCE.NOT_LABELED
                    ? ""
                    : (record.basic.netContent?.text ?? "")
                }
                onChange={(e) => updateNetContent(e.target.value)}
                placeholder={
                  record.basic.netContent?.presence === PRESENCE.NOT_LABELED
                    ? "包装未标示"
                    : "例如 250g"
                }
                disabled={
                  record.basic.netContent?.presence === PRESENCE.NOT_LABELED
                }
              />
            </label>
          </div>
          <button className="micro-toggle" onClick={toggleNetLabeled}>
            {record.basic.netContent?.presence === PRESENCE.NOT_LABELED
              ? "✓ 已标为包装未标示（点击恢复）"
              : "包装上没有净含量？标为未标示"}
          </button>
        </section>

        {/* ---------- 标示基准 ---------- */}
        <section className="block confirm-basis">
          <div className="block-head">
            <span className="detail-section-number">02</span>
            <h2>营养标示基准</h2>
            <span className="block-hint">不同基准不能直接比较，必须确认</span>
          </div>
          <div className="basis-row">
            {BASIS_LIST.map((b) => (
              <button
                key={b.id}
                className={`basis-btn ${record.nutrition.basis === b.id ? "on" : ""}`}
                aria-pressed={record.nutrition.basis === b.id}
                onClick={() => setBasis(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          {!record.nutrition.basis && (
            <div className="inline-warn">
              还没确认基准。请对照包装上「每 100 克 / 每 100 毫升 /
              每份」的标注选择。
            </div>
          )}
          {record.nutrition.basisText && (
            <div className="basis-origin">
              包装原文：{record.nutrition.basisText}
            </div>
          )}

          <div className="basis-form-row">
            <span className="basis-form-label">食品形态</span>
            <div className="basis-row">
              {[
                { id: "solid", label: "固体" },
                { id: "liquid", label: "液体" },
              ].map((f) => {
                const current =
                  record.basic.physicalForm ||
                  inferPhysicalForm(record.nutrition.basis);
                return (
                  <button
                    key={f.id}
                    className={`basis-btn ${current === f.id ? "on" : ""}`}
                    aria-pressed={current === f.id}
                    onClick={() => setPhysicalForm(f.id)}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <span className="basis-form-hint">
              低脂、高蛋白、高钙、膳食纤维、低热量的固体 / 液体界限不同，请对照实物选择
            </span>
          </div>
        </section>

        {/* ---------- 配料 ---------- */}
        <section className="block confirm-ingredients">
          <div className="block-head">
            <span className="detail-section-number">03</span>
            <h2>配料表（{record.ingredients.items.length} 项）</h2>
            <span className="block-hint">顺序即含量递减顺序</span>
          </div>

          {record.ingredients.rawText && (
            <details className="raw-text">
              <summary>查看识别到的配料原文</summary>
              <p>{record.ingredients.rawText}</p>
            </details>
          )}

          {record.ingredients.presence === PRESENCE.NOT_LABELED ? (
            <div className="inline-warn">已标记为「包装未标示配料表」。</div>
          ) : (
            <>
              <ol className="ing-list">
                {record.ingredients.items.map((it) => (
                  <li
                    key={it.id}
                    className={`ing-item-wrap${it.children?.length ? " has-children" : ""}`}
                  >
                    <div className="ing-item">
                      <span className="ing-order">{it.order}</span>
                      <input
                        type="text"
                        value={it.name}
                        aria-label={`第 ${it.order} 项配料名称`}
                        onChange={(e) => updateIngredient(it.id, e.target.value)}
                        placeholder="配料名称"
                      />
                      <div className="ing-actions">
                        <button
                          onClick={() => moveIngredient(it.id, -1)}
                          title="上移"
                          aria-label={`上移${it.name || "配料"}`}
                          disabled={it.order === 1}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveIngredient(it.id, 1)}
                          title="下移"
                          aria-label={`下移${it.name || "配料"}`}
                          disabled={it.order === record.ingredients.items.length}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeIngredient(it.id)}
                          title="删除"
                          className="danger"
                          aria-label={`删除${it.name || "配料"}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {it.note && (
                      <div className="ing-structure-note">结构待核对：{it.note}</div>
                    )}

                    {it.children?.length > 0 && (
                      <div className="ing-children">
                        <div className="ing-children-head">
                          括号内的具体成分 · {it.children.length} 项
                        </div>
                        {it.children.map((c, ci) => (
                          <div className="ing-child-row" key={c.id}>
                            <input
                              type="text"
                              value={c.name}
                              aria-label={`${it.name || "配料"}的第 ${ci + 1} 个子配料`}
                              onChange={(e) => updateChild(it.id, c.id, e.target.value)}
                              placeholder="具体成分"
                            />
                            <button
                              onClick={() => removeChild(it.id, c.id)}
                              title="删除子配料"
                              className="danger"
                              aria-label={`删除${c.name || "子配料"}`}
                            >
                              ×
                            </button>
                            {c.children?.length > 0 && (
                              <span className="ing-child-note">
                                含 {c.children.map((x) => x.name).join("、")}
                              </span>
                            )}
                          </div>
                        ))}
                        <button className="ing-add-child" onClick={() => addChild(it.id)}>
                          ＋ 添加子配料
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <button className="btn-dashed" onClick={addIngredient}>
                ＋ 添加配料
              </button>
            </>
          )}

          <button className="micro-toggle" onClick={toggleIngredientsPresence}>
            {record.ingredients.presence === PRESENCE.NOT_LABELED
              ? "✓ 已标为包装未标示（点击恢复）"
              : "包装上没有配料表？标为未标示"}
          </button>
        </section>

        {/* ---------- 营养成分表 ---------- */}
        <section className="block confirm-nutrition" id="sec-nutrition">
          <div className="block-head">
            <span className="detail-section-number">04</span>
            <h2>营养成分表（{record.nutrition.items.length} 项）</h2>
            <span className="block-hint">留空 = 未识别，不是 0</span>
          </div>

          {record.nutrition.items.length === 0 && (
            <div className="inline-warn">
              没有营养数据，话术拆解页将无法给出数值依据。
            </div>
          )}

          <div className="nutrition-column-labels" aria-hidden="true">
            <span>营养素</span>
            <span>标示数值</span>
            <span>单位</span>
            <span>NRV %</span>
            <span />
          </div>
          <p className="nutrition-mobile-note">
            每项依次填写：标示数值 / 单位 / NRV %
          </p>
          <div className="nut-table">
            {record.nutrition.items.map((it) => (
              <NutrientRow
                key={it.id}
                item={it}
                isChild={Boolean(it.parentKey)}
                onChange={(patch) => updateNutrient(it.id, patch)}
                onTogglePresence={() => toggleNutrientPresence(it.id)}
                onRemove={() => removeNutrient(it.id)}
              />
            ))}
          </div>

          <button className="btn-dashed" onClick={addNutrient}>
            ＋ 添加营养素
          </button>
        </section>

        {/* ---------- 宣传语 ---------- */}
        <section className="block confirm-claims">
          <div className="block-head">
            <span className="detail-section-number">05</span>
            <h2>包装宣传语（{record.claims.length} 条）</h2>
            <span className="block-hint">
              已收录 {REGISTERED_RULE_COUNT} 类说法，没收录的会明说
            </span>
          </div>

          {record.claims.length ? (
            <div className="selected-claims">
              {record.claims.map((c) => (
                <span className="claim-tag" key={c.id}>
                  {c.text}
                  <button
                    onClick={() => onChange(removeClaim(record, c.id))}
                    aria-label={`移除宣传语${c.text}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="inline-warn">
              还没有宣传语，结果页会出现「没有可分析的宣传语」。
            </div>
          )}

          <div className="chip-grid" style={{ marginTop: 10 }}>
            {CLAIM_PRESETS.filter(
              (p) => !record.claims.some((c) => c.text === p.text),
            ).map((p) => (
              <button
                key={p.id}
                className="chip"
                onClick={() =>
                  onChange(
                    addClaim(record, p.text, {
                      source: "preset",
                      presetId: p.id,
                    }),
                  )
                }
              >
                ＋ {p.text}
              </button>
            ))}
          </div>

          {showMoreClaims && (
            <div className="chip-grid chip-grid-more">
              {CLAIM_PRESETS_MORE.filter(
                (p) => !record.claims.some((c) => c.text === p.text),
              ).map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() =>
                    onChange(
                      addClaim(record, p.text, {
                        source: "preset",
                        presetId: p.id,
                      }),
                    )
                  }
                >
                  ＋ {p.text}
                </button>
              ))}
            </div>
          )}

          <button
            className="link-btn more-claims-toggle"
            aria-expanded={showMoreClaims}
            onClick={() => setShowMoreClaims((v) => !v)}
          >
            {showMoreClaims
              ? "收起更多宣传语 ↑"
              : `更多宣传语（${CLAIM_PRESETS_MORE.length} 个）↓`}
          </button>

          {showAddClaim ? (
            <div className="manual-row">
              <input
                type="text"
                value={newClaim}
                aria-label="手动输入包装宣传语"
                onChange={(e) => setNewClaim(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleAddClaim()}
                placeholder="手动输入包装上的其他说法"
                autoFocus
              />
              <button className="btn-ghost" onClick={handleAddClaim}>
                添加
              </button>
            </div>
          ) : (
            <button className="link-btn" onClick={() => setShowAddClaim(true)}>
              ＋ 手动添加宣传语
            </button>
          )}
        </section>
      </div>

      {/* ---------- 校验 ---------- */}
      {(check.errors.length > 0 || check.warnings.length > 0) && (
        <div
          className={`alert ${check.errors.length ? "error" : "warn"}`}
          role="status"
        >
          {check.errors.map((e) => (
            <div key={e}>✗ {e}</div>
          ))}
          {check.warnings.map((w) => (
            <div key={w}>· {w}</div>
          ))}
        </div>
      )}

      <div className="action-bar">
        <button className="btn-ghost" onClick={onBack}>
          ← 返回
        </button>
        <button
          className="btn-primary"
          onClick={onConfirm}
          disabled={!check.valid}
        >
          确认无误，查看分析 →
        </button>
      </div>

      <p className="page-note">
        当前基准：
        {record.nutrition.basis ? basisLabel(record.nutrition.basis) : "未确认"}
        。 分析页只使用你确认后的数据，不会偷偷换回 AI 的原始识别值。
      </p>
    </div>
  );
}

/** 单行营养素编辑 */
function NutrientRow({ item, isChild, onChange, onTogglePresence, onRemove }) {
  const displayValue = () => item.presence === PRESENCE.NOT_LABELED
    ? ""
    : item.rawText && /[<>≤≥＜＞~～约]/.test(item.rawText)
      ? item.rawText
      : item.value === null ? (item.rawText || "") : String(item.value);
  const [draft, setDraft] = useState(displayValue);
  useEffect(() => {
    setDraft(displayValue());
  }, [item.value, item.rawText, item.presence]);
  const unitOptions =
    item.key === "energy" ? ["kJ", "kcal"] : ["g", "mg", "μg"];
  const notLabeled = item.presence === PRESENCE.NOT_LABELED;

  function commit(text) {
    if (text.trim() === "") {
      onChange({ value: null, rawText: null, status: "EMPTY", presence: PRESENCE.UNREADABLE });
      return;
    }
    const parsed = parseNutrientValue(text);
    onChange({
      value: parsed.value,
      unit: parsed.unit
        ? normalizeToOption(parsed.unit, unitOptions)
        : item.unit,
      status: parsed.status,
      rawText: text,
      presence: PRESENCE.LABELED,
    });
    // Preserve inequalities: focusing and blurring again must not turn >0.5 into 0.5.
    setDraft(text.trim());
  }

  return (
    <>
      <div
        className={`nut-row ${isChild ? "child" : ""} ${notLabeled ? "not-labeled" : ""}`}
      >
        <input
          className="nut-name"
          type="text"
          value={item.name}
          aria-label="营养素名称"
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="营养素名称"
        />
        <input
          className="nut-value"
          type="text"
          inputMode="decimal"
          value={notLabeled ? "" : draft}
          aria-label={`${item.name || "营养素"}标示数值`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          placeholder={notLabeled ? "未标示" : "未识别"}
          disabled={notLabeled}
        />
        <select
          className="nut-unit"
          value={item.unit ?? ""}
          aria-label={`${item.name || "营养素"}单位`}
          onChange={(e) => onChange({ unit: e.target.value || null })}
          disabled={notLabeled}
        >
          <option value="">单位</option>
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          className="nut-nrv"
          type="text"
          inputMode="numeric"
          value={item.nrvPercent ?? ""}
          aria-label={`${item.name || "营养素"}营养素参考值百分比`}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, "");
            onChange({ nrvPercent: v === "" ? null : Number(v) });
          }}
          placeholder="NRV%"
          disabled={notLabeled}
        />
        <button
          className="row-del danger"
          onClick={onRemove}
          title="删除这一行"
          aria-label={`删除${item.name || "营养素"}`}
        >
          ×
        </button>
      </div>

      {(item.value === null || notLabeled) && (
        <div className="nut-hint">
          <span className={`status-chip ${notLabeled ? "gray" : "amber"}`}>
            {notLabeled ? PRESENCE_LABELS.not_labeled : "没有数值"}
          </span>
          <button className="link-btn" onClick={onTogglePresence}>
            {notLabeled ? "改为填写数值" : "包装上没有这项？标为未标示"}
          </button>
        </div>
      )}
    </>
  );
}

function normalizeToOption(unit, options) {
  const map = {
    千焦: "kJ",
    千卡: "kcal",
    克: "g",
    毫克: "mg",
    微克: "μg",
    ug: "μg",
  };
  const u = map[unit] || unit;
  return options.includes(u) ? u : null;
}
