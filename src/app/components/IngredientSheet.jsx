import { useEffect, useRef, useState } from "react";
import { callApi } from "../../lib/api.js";
import { subscribeCredentials, credentialRevision } from '../../lib/credentials.js';
import { buildIngredientCard } from "../../domain/ingredients/index.js";
import { getDemoResearch } from "../../domain/ingredients/researchDemo.js";
import { researchRequestKey } from "../../domain/ingredients/researchKey.js";
import {
  buildHealthGapView,
  buildHealthView,
  buildIngredientCore,
  getCategoryHint,
  pickKeySentence,
} from "../ingredientView.js";
import {
  COMPOSITION_LABELS,
  EVIDENCE_TYPE_LABELS,
  EXCERPT_KIND_LABELS,
  isLocalSource,
} from "../../domain/evidence/evidenceSet.js";

/**
 * 成分详情抽屉（V5.2）。
 *
 * 交互原则变了：**点击即分析**。
 *
 *   V5.1：点击成分 → 看本地卡 → 再点「获取综合分析」→ 才联网
 *   V5.2：点击成分 → 立刻开始分析 → 默认只给三段简明解释 → 想细看再点「深入了解」
 *
 * 三层结构：
 *   1. 简明版（默认）：它是什么 / 为什么会有它 / 应该怎样理解
 *   2. 深入版（点击展开）：身份与用途、标准与证据、常见误解、资料差异、无法确认、完整来源
 *   3. 来源详情（再点开每张来源卡）
 *
 * 关键工程约束：
 * - 真实模式下组件挂载即发起分析，不需要用户再点按钮；
 * - 会话内同一成分的结果缓存在模块级 Map，切回来不重复付费；
 * - ResultPage 用 key={成分名} 强制重建组件，切换成分时旧请求会被 abort，
 *   旧结果不会覆盖新卡片；
 * - 演示模式从不发请求。
 */

/** 会话内缓存：同一成分在本次页面会话中只查一次 */
const SESSION_CACHE = new Map();
subscribeCredentials(() => SESSION_CACHE.clear());

/**
 * 进度显示的是**真实阶段**（由服务端在每次上游调用前后写入），
 * 不是按时间切换的假文案。首帧在拿到服务端回应前只显示第一句。
 */
const INITIAL_STAGE = { label: "正在确认成分与食品语境…", round: 0, totalRounds: 5 };

export default function IngredientSheet({
  match,
  onClose,
  isDemo = false,
  foodContext = null,
}) {
  const card = buildIngredientCard(match);
  const name = card?.name || match.input || "";
  const categoryHint = !card ? getCategoryHint(match.input) : null;

  const requestKey = `${credentialRevision()}:${researchRequestKey({ name, aliases: (match.entry?.aliases || []).slice(0, 3), foodContext })}`;
  const cachedSession = isDemo ? null : SESSION_CACHE.get(requestKey) || null;
  const demoRecord = isDemo ? getDemoResearch(name) : null;

  const [research, setResearch] = useState(cachedSession);
  const [researching, setResearching] = useState(false);
  const [stageInfo, setStageInfo] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledNote, setCancelledNote] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => subscribeCredentials(() => {
    setResearch(null);
    setResearching(false);
    if (!isDemo) setError({ message: 'Key 已清除或更换；需要时请重新发起分析。' });
  }), [isDemo]);
  const [showDeep, setShowDeep] = useState(false);
  const [replayDemo, setReplayDemo] = useState(false);

  const abortRef = useRef(null);
  const deepRef = useRef(null);
  const pollRef = useRef(null);
  const requestIdRef = useRef(null);
  const runningRef = useRef(false);
  const sheetRef = useRef(null);

  // Keep keyboard navigation inside the open reading panel, then return to its trigger.
  useEffect(() => {
    const trigger = document.activeElement;
    const sheet = sheetRef.current;
    const focusable = () =>
      [
        ...(sheet?.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ) || []),
      ].filter((el) => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        sheet?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sheet?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sheet?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearInterval(pollRef.current);
      // 关掉抽屉时同时通知服务端停止后续付费调用（已发出的请求可能仍会计费）
      const rid = requestIdRef.current;
      if (rid) {
        fetch("/api/ingredient/research/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rid }),
          keepalive: true,
        }).catch(() => {});
      }
      // 离开时取消进行中的请求：用户已经切走了，别让结果再回来改界面
      abortRef.current?.abort();
    };
  }, [onClose]);

  // ---------- 挂载即分析（真实模式） ----------
  //
  // 用 setTimeout(0) 而不是直接调用，是为了兼容 React StrictMode：
  // 开发模式下 effect 会执行两次（执行 → 清理 → 再执行），
  // 直接调用会导致第一次请求刚发出就被 cleanup abort 掉，而第二次因为
  // 「已经在跑」不再启动，结果永远拿不到数据。
  // 延后一拍之后，第一次的定时器会被 cleanup 清掉，只有第二次真正跑起来。
  useEffect(() => {
    if (isDemo) return; // 演示模式永不发请求
    if (cachedSession) return; // 会话内已查过
    if (!name) return;

    const kick = setTimeout(() => startAnalysis(), 0);
    return () => clearTimeout(kick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startAnalysis({ force = false } = {}) {
    if (isDemo) return;
    if (runningRef.current) return; // 同一实例内不重复启动
    if (!force && SESSION_CACHE.has(requestKey)) {
      setResearch(SESSION_CACHE.get(requestKey));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId =
      globalThis.crypto?.randomUUID?.() ||
      `r-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    requestIdRef.current = requestId;

    runningRef.current = true;
    setResearching(true);
    setCancelling(false);
    setCancelledNote(null);
    setError(null);
    setStageInfo(INITIAL_STAGE);

    // 轮询真实阶段：只读服务端内存，不产生费用，也不参与结果
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const info = await callApi(
          `/api/ingredient/research/progress?id=${encodeURIComponent(requestId)}`,
          undefined,
        );
        if (!info || info.stage === "done") return;
        setStageInfo({
          label: info.label,
          round: info.round,
          totalRounds: info.totalRounds,
          detail: info.detail || null,
        });
      } catch {
        /* 进度读取失败不影响主请求；界面保持上一句真实阶段 */
      }
    }, 700);

    try {
      const data = await callApi(
        "/api/ingredient/research",
        {
          name,
          aliases: (match.entry?.aliases || []).slice(0, 3),
          foodContext: foodContext || undefined,
          requestId,
        },
        { timeoutMs: 340000, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      SESSION_CACHE.set(requestKey, data);
      setResearch(data);
    } catch (e) {
      if (e?.code === "ABORTED") return;
      setError({ message: e.message, code: e.code, httpStatus: e.httpStatus });
    } finally {
      runningRef.current = false;
      clearInterval(pollRef.current);
      setResearching(false);
      setStageInfo(null);
    }
  }

  /**
   * 取消研究：先让服务端打标记，再断开前端请求。
   *
   * 顺序很重要：如果只 abort 前端，服务端仍会跑完并继续调用；
   * 先打标记，编排层在下一个阶段边界就会停下，不再产生新的付费调用。
   */
  async function cancelAnalysis() {
    const id = requestIdRef.current;
    setCancelling(true);
    if (id) {
      await callApi("/api/ingredient/research/cancel", { id }).catch(() => {});
    }
    abortRef.current?.abort();
    clearInterval(pollRef.current);
    runningRef.current = false;
    setResearching(false);
    setStageInfo(null);
    setCancelling(false);
    setCancelledNote("已取消。已经发出的检索请求可能仍会计费，之后不会再发起新的调用。");
  }

  // 演示模式下，用户主动点开预录结果
  // 演示模式下，有「人工整理的健康资料」就直接展示：
  // 免费演示不应该比真实模式少一层健康信息。
  // 只有旧版预录（没有整理过健康部分）才需要用户点开。
  /**
   * 展开深入分析时滚到它的起点。
   * 深入版以健康结论开头；不滚过去的话，用户点完还停在简述里，
   * 会以为「深入」只是多了一段标准编号。
   */
  function toggleDeep() {
    const next = !showDeep;
    setShowDeep(next);
    if (!next) return;
    requestAnimationFrame(() => {
      const el = deepRef.current;
      const scroller = el?.closest(".sheet-body");
      if (!el || !scroller) return;
      const top =
        el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        18;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  const shownResearch = isDemo
    ? demoRecord?.demoCurated
      ? demoRecord
      : replayDemo
        ? demoRecord
        : null
    : research;

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name || "配料"}成分解读`}
        tabIndex={-1}
      >
        <div className="sheet-grab" />
        <button className="sheet-close" onClick={onClose} aria-label="关闭">
          ×
        </button>

        <div className="sheet-body">
          <SheetHeader
            name={
              shownResearch?.ingredient ||
              card?.name ||
              match.input ||
              "未命名配料"
            }
            enteredName={match.input}
            research={shownResearch}
            card={card}
          />

          {/* 分析进行中的状态条：显示服务端真实阶段，并提供取消 */}
          {researching && (
            <AnalyzingBar
              stage={stageInfo || INITIAL_STAGE}
              hasLocal={Boolean(card?.brief)}
              onCancel={cancelAnalysis}
              cancelling={cancelling}
            />
          )}

          {cancelledNote && !researching && (
            <div className="research-cancelled">{cancelledNote}</div>
          )}

          {error && !researching && (
            <div className="alert error" style={{ marginBottom: 12 }}>
              <div className="alert-title">联网补充失败</div>
              <div>{error.message}</div>
              {error.code && (
                <div className="alert-code">错误码：{error.code}</div>
              )}
              {(card?.brief || shownResearch) && (
                <div className="loading-sub" style={{ marginTop: 8 }}>
                  下面显示的内容来自本地知识库，仍然有效。
                </div>
              )}
              <div className="error-actions">
                <button
                  className="btn-ghost small"
                  onClick={() => startAnalysis({ force: true })}
                >
                  重试一次
                </button>
              </div>
            </div>
          )}

          {/* 简明版：默认视图 */}
          <BriefView
            card={card}
            research={shownResearch}
            demoRecord={isDemo ? demoRecord : null}
            onReplayDemo={() => setReplayDemo(true)}
            isDemo={isDemo}
            hasError={Boolean(error && !researching)}
            groupName={match.groupName || null}
            categoryHint={categoryHint}
            hideHealth={showDeep}
            foodContext={foodContext}
          />

          {/* 深入版入口 */}
          {(card || shownResearch) && (
            <div className="deep-entry">
              <button
                className={`deep-toggle ${showDeep ? "on" : ""}`}
                aria-expanded={showDeep}
                onClick={toggleDeep}
              >
                {showDeep ? "收起详细内容" : "深入了解这个成分"}
                <span className="deep-arrow">{showDeep ? "▴" : "▾"}</span>
              </button>
            </div>
          )}

          <div ref={deepRef}>
            {showDeep && (
              <DeepView
                card={card}
                research={shownResearch}
                foodContext={foodContext}
              />
            )}
          </div>

          <p className="research-foot">
            每次成分分析最多使用 7 轮联网检索、4 次原文读取、3 次研究规划及最多 3 次身份/整理/核验调用（证据够了会提前停），
            每次费用上界 0.80 元；按高峰价预留预算，达到上限即停止。费用由你的 DeepSeek 账户承担。
            <br />
            本页只做成分说明，不提供医学诊断或饮食处方。
            {shownResearch && (
              <>
                <br />
                <strong>引用对应关系已检查</strong>
                ：程序已核对来源编号和摘录对应关系，但不能保证对所有科学文献和标准的解读都完全正确。
              </>
            )}
          </p>
        </div>

        <div className="sheet-bottom-pad" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 头部

function SheetHeader({ name, enteredName, research, card }) {
  // V6.1 起 identity 已过科学检查：label 只含通过校验的分类与功能，
  // review 级功能被移入 pendingNote（待核实），reject 级被移除。
  const identity = research?.identity || null;
  const identityLabel = identity?.label || card?.categoryLabel || null;
  const tone = identityTone(identity?.type, card);
  const pendingNote = identity?.checked?.pendingNote || null;
  const rejectedNote = identity?.checked?.rejectedNote || null;

  return (
    <div className="sheet-head">
      <h2>{name}</h2>
      {identityLabel && (
        <span className={`cat-badge tone-${tone}`}>{identityLabel}</span>
      )}
      {(pendingNote || rejectedNote) && (
        <div className="sheet-alias" style={{ flexBasis: "100%" }}>
          {pendingNote || rejectedNote}
        </div>
      )}
      {enteredName && card?.name && enteredName !== card.name && (
        <div className="sheet-alias" style={{ flexBasis: "100%" }}>
          包装上写的是「{enteredName}」，对应标准名称「{card.name}」
        </div>
      )}
    </div>
  );
}

function identityTone(type, card) {
  if (type === "additive") return "blue";
  if (type === "food_ingredient") return "green";
  if (type === "fortifier") return "purple";
  return card?.categoryMeta?.tone || "gray";
}

function AnalyzingBar({ stage, hasLocal, onCancel, cancelling = false }) {
  const { label, round, totalRounds, detail } = stage || {};
  return (
    <div className="analyzing-bar">
      <div className="spinner" />
      <div className="analyzing-main">
        <div className="analyzing-text">{label || INITIAL_STAGE.label}</div>
        <div className="analyzing-sub">
          深度研究最多 {totalRounds || 7} 轮检索
          {round ? ` · 当前第 ${round} 轮` : ""}
          {detail ? ` · ${detail}` : ""}
        </div>
        <div className="analyzing-sub">
          {hasLocal
            ? "下面先显示本地知识库的解释，联网结果到了会自动更新。"
            : "优先权威评估，并查阅可靠学术文献；正在核对研究与适用条件。"}
        </div>
      </div>
      {onCancel && (
        <button className="btn-ghost small analyzing-cancel" onClick={onCancel} disabled={cancelling}>
          {cancelling ? "正在取消…" : "取消"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 简明版

/**
 * 简明三段。
 * 优先用联网综合结果里的 brief（已过引用校验），
 * 没有就用本地知识库条目的 brief（第四阶段 + V5.2 基础条目）。
 * 两者都没有，才显示「暂时不能可靠解读」。
 */
function BriefView({
  card,
  research,
  demoRecord,
  onReplayDemo,
  isDemo,
  hasError = false,
  groupName = null,
  categoryHint = null,
  hideHealth = false,
  foodContext = null,
}) {
  const brief = research?.brief || null;
  const localBrief = card?.brief || null;
  const basis = research ? research.composition : "local_only";
  const hasHealth = Boolean(research?.healthInsights || research?.consumerEvidence?.facts?.some(f => !f.absence && !f.categoryExcluded));
  if (categoryHint) {
    return <div className="brief-view">
      <CategoryBrief hint={categoryHint} includeGap={!research} />
      {research && !hideHealth && <HealthBlock research={research} foodContext={foodContext} name={card?.name || research?.ingredient || ""} />}
    </div>;
  }

  const data = brief
    ? {
        what: brief.what,
        why: brief.why,
        howToUnderstand: brief.howToUnderstand,
        sourceRefs: brief.sourceRefs || [],
        sources: brief.sources || [],
        tier: brief.tier,
      }
    : localBrief
      ? {
          what: localBrief.what,
          why: localBrief.why,
          howToUnderstand: localBrief.howToUnderstand,
          sourceRefs: (card.sources || []).map((s) => s.id),
          // 本地来源来自 sources.js，本身没有 sourceType 字段。
          // 这里补上 verified_local，RefChips 才会把它们渲染成绿色 K 芯片，
          // 否则会被当成联网来源显示成蓝色，用户就分不清哪条是本地已核实的。
          sources: (card.sources || []).map((s) => ({
            ...s,
            sourceType: "verified_local",
          })),
          tier: "local",
        }
      : null;

  if (!data) {
    // 本地没有条目，但可能已经有联网/演示的健康资料：
    // 先给健康区块，再说明身份暂时缺失，不能整块丢掉。
    if (hasHealth) {
      return (
        <div className="brief-view">
          <DemoNote research={research} />
          {!hideHealth && (
            <HealthBlock
              research={research}
              foodContext={foodContext}
              name={card?.name || research?.ingredient || ""}
            />
          )}
          <UnknownBrief
            card={card}
            isDemo={isDemo}
            hasError={hasError}
            groupName={groupName}
            hasHealth
          />
        </div>
      );
    }
    if (categoryHint) return <CategoryBrief hint={categoryHint} />;
    return (
      <UnknownBrief
        card={card}
        isDemo={isDemo}
        hasError={hasError}
        groupName={groupName}
      />
    );
  }

  return (
    <div className="brief-view">
      {/* 资料构成 + 状态 */}
      {research && (
        <div className={`composition-bar cb-${basis}`}>
          <span className="cb-label">
            {COMPOSITION_LABELS[basis] || COMPOSITION_LABELS.none}
          </span>
          <span className={`cb-status cs-${statusCls(research.status)}`}>
            {statusLabel(research.status)}
          </span>
          {research.cached && <span className="cb-tag">缓存结果</span>}
          {research.retrievedAt && !research.demoReplay && (
            <span className="cb-time">
              检索于{" "}
              {new Date(research.retrievedAt).toLocaleString("zh-CN", {
                hour12: false,
              })}
            </span>
          )}
        </div>
      )}

      <DemoNote research={research} />

      {!research && localBrief && (
        <div className="local-basis-tag">基于本地知识库</div>
      )}

      {/* V2.3 验收修复：有可靠健康结论时，健康区块排在身份与用途之前。
          用户点开一个添加剂，第一件想知道的是「吃进去要不要紧」，
          而不是先读一段「它是一种甜味剂」。没有健康结论时不占位。 */}
      {hasHealth && !hideHealth && (
        <HealthBlock
          research={research}
          foodContext={foodContext}
          name={card?.name || research?.ingredient || ""}
        />
      )}

      {/* 降级简明版可能缺段（如没有通过核对的「是什么」结论），空段不渲染。
          三段里最多只放大一句，优先「应该怎样理解」，避免整页都是粗体。 */}
      {(() => {
        const raw = [
          { title: "它是什么？", text: data.what, order: 0 },
          { title: "为什么食品里会有它？", text: data.why, order: 1 },
          { title: "应该怎样理解？", text: data.howToUnderstand, order: 2 },
        ];
        const present = raw
          .filter((b) => b.text)
          .map((b) => ({ ...b, pick: pickKeySentence(b.text) }));
        let highlightOrder = -1;
        for (const order of [2, 0, 1]) {
          const hit = present.find((b) => b.order === order && b.pick.keyIndex >= 0);
          if (hit) {
            highlightOrder = order;
            break;
          }
        }
        return present.map((b, idx) => (
          <BriefBlock
            key={b.title}
            n={idx + 1}
            title={b.title}
            text={b.text}
            highlight={false}
          />
        ));
      })()}

      {!hasHealth && !hideHealth && (
        <HealthBlock
          research={research}
          foodContext={foodContext}
          name={card?.name || research?.ingredient || ""}
        />
      )}

      {data.tier === "snippet_only" && (
        <div className="rs-snippet">
          仅依据搜索引擎摘要，未取得网页正文 —— 证据强度低于正文摘录
        </div>
      )}

      {research?.briefScienceReview?.length > 0 && (
        <div className="rs-review">
          这段解释里有需要进一步核对的地方：
          {research.briefScienceReview[0]?.why}
        </div>
      )}

      {research?.brief?.degraded && (
        <div className="rs-review">
          这段简明解释是从通过核对的逐条结论中提炼的（汇总版未通过核对），完整依据请点「深入了解这个成分」。
        </div>
      )}

      {data.sourceRefs.length > 0 && (
        <RefChips refs={data.sourceRefs} sources={data.sources} />
      )}

      {card?.briefNote && (
        <div className="brief-note">说明：{card.briefNote}。</div>
      )}

      {/* 演示模式：有预录就提供入口，但不是必须点 */}
      {isDemo && demoRecord && !demoRecord.demoCurated && !research && (
        <div className="demo-entry">
          <div className="demo-entry-title">这个成分有预录的联网综合分析</div>
          <p className="demo-entry-desc">
            此前对「{card?.name}
            」做过一次真实的联网查询，已与本地知识库整合保存。点开不会联网，也不产生费用。
          </p>
          <button className="btn-ghost small" onClick={onReplayDemo}>
            查看预录综合分析
          </button>
        </div>
      )}

      {isDemo && !demoRecord && !research && (
        <div className="demo-offline-note">
          离线演示模式不联网。上面显示的是本地知识库内容；真实模式下点击成分会自动查询权威资料。
        </div>
      )}
    </div>
  );
}

/**
 * 演示/预录说明。
 *
 * 区分两件事：某次真实联网的预录（带检索时间），
 * 与为了离线体验而人工整理官方资料的条目（带整理日期，不冒充查询结果）。
 */
function DemoNote({ research }) {
  if (!research?.demoReplay) return null;
  return (
    <div className="demo-replay-note">
      {research.demoCurated ? (
        <>
          离线演示 · 健康资料由公开官方资料人工整理
          {research.healthReviewedAt ? `（${formatDate(research.healthReviewedAt)}）` : ""}
          ，本次没有联网；不是某次 DeepSeek 查询结果。
          {research.retrievedAt
            ? ` 身份与用途部分来自原始检索（${formatDate(research.retrievedAt)}）。`
            : ""}
        </>
      ) : (
        <>
          预录资料 · 本次没有联网 · 原始检索时间 {formatDate(research.retrievedAt)}
        </>
      )}
    </div>
  );
}

/**
 * 健康上最值得知道什么（V2.3 全局整改）。
 *
 * 只渲染服务端「已通过来源校验 + 健康专项检查 + 原文锚点核对」的条目；
 * 每条都带上支撑它的原文摘句，用户可以自己看「这句话是从哪句原文来的」。
 *
 * 一条都没有时，只给**一句**说明（buildHealthGapView），
 * 不再在三个地方各说一遍「没有证据」。
 */
function HealthBlock({ research, foodContext = null, name = "" }) {
  const view = buildHealthView(research, { foodContext, name });

  if (view?.legacy) {
    // 旧版预录/旧缓存的健康段落没有经过当前标准的逐句核对，
    // 不拿来当健康结论；如实说明它是什么。
    return (
      <div className="health-empty">
        <p>
          这份预录资料的健康部分是旧版整理，没有经过当前的逐句原文核对，因此不作为健康结论展示；
          身份与用途不受影响。真实联网分析会按当前标准重新整理。
        </p>
      </div>
    );
  }

  if (!view) {
    if (research?.status !== "ok" && research?.status !== "partial") return null;
    const gap = buildHealthGapView(research);
    if (!gap) return null;
    return (
      <div className="health-empty">
        <p>{gap.text}</p>
      </div>
    );
  }

  return (
    <section
      className={`health-block${view.answered ? '' : ' is-reference'}`}
      aria-label={view.answered ? "健康上最值得知道什么" : "健康参考"}
    >
      <div className="health-head">
        <span className="health-label">
          {view.answered ? "健康上最值得知道什么" : "健康参考"}
        </span>
        {view.headline?.evidenceLabel && (
          <span className={`health-badge hs-${view.headline.evidenceStatus}`}>
            {view.headline.evidenceLabel}
          </span>
        )}
      </div>

      {view.headline && (
        <>
          <p className={view.headline.text.length > 140 ? "health-headline health-headline-long" : "health-headline"}>{view.headline.text}</p>
          <HealthMeta item={view.headline} />
        </>
      )}

      {view.rows.length > 0 && (
        <dl className="health-rows">
          {view.rows.map((row) => (
            <div className="health-row" key={row.key}>
              <dt>
                {row.title}
                {row.showBadge !== false && row.evidenceLabel && (
                  <span className={`health-badge hs-${row.evidenceStatus}`}>
                    {row.evidenceLabel}
                  </span>
                )}
              </dt>
              <dd>
                {row.text}
                {row.note && <span className="health-row-note">{row.note}</span>}
                <HealthMeta item={row} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {view.foodMeaning && (
        <div className="health-meaning">
          <h4>对这款食品有什么实际意义</h4>
          <p>{view.foodMeaning.text}</p>
          {view.foodMeaning.conditions && (
            <p className="health-meaning-cond">
              适用条件：{view.foodMeaning.conditions}
            </p>
          )}
          {view.foodMeaning.evidenceBasisLabel &&
            view.foodMeaning.evidenceBasis !== "direct" && (
              <p className="health-meaning-cond">
                依据：{view.foodMeaning.evidenceBasisLabel}
              </p>
            )}
        </div>
      )}

      {view.context?.length > 0 && (
        <div className="health-meaning" aria-label="人群与适用信息">
          <h4>人群与适用信息</h4>
          {view.context.map(item => <div key={item.id}><p>{item.populationNature === 'higher_exposure' ? '较高膳食暴露：' : '可能的适用性：'}{item.text}</p><HealthMeta item={item} /></div>)}
        </div>
      )}
      {view.gaps?.length > 0 && <div className="health-empty" aria-label="本次证据缺口">{view.gaps.map(gap => <p key={gap.code}>{gap.text}</p>)}</div>}
    </section>
  );
}

/**
 * 一条健康结论的「核对依据」：原文摘句、适用条件、评估年份。
 *
 * 默认折叠：主视图仍然只回答健康问题，愿意深究的人一按就能看到原文。
 * 这里展示的 quote 是服务端逐字比对过的，不是模型现编的一句。
 */
function HealthMeta({ item }) {
  const hasMeta = Boolean(
    item.quote ||
      item.conditions ||
      item.sourceYear ||
      item.studyTypeLabel ||
      item.studyContext ||
      item.basisNote,
  );
  if (!hasMeta) return null;
  return (
    <details className="health-meta">
      <summary>依据原文与研究条件</summary>
      {item.quote && (
        <blockquote className="health-quote">
          “{item.quote}”
          {item.quoteSourceId && (
            <span className="health-quote-src">{item.quoteSourceId}</span>
          )}
        </blockquote>
      )}
      {item.studyTypeLabel && (
        <p className="health-cond">证据类型：{item.studyTypeLabel}</p>
      )}
      {item.studyContext && (
        <p className="health-cond">研究条件：{item.studyContext}</p>
      )}
      {item.conditions && (
        <p className="health-cond">适用条件：{item.conditions}</p>
      )}
      {item.basisNote && (
        <p className="health-cond">证据基础：{item.basisNote}</p>
      )}
      {item.sourceYear && (
        <p className="health-cond">评估年份：{item.sourceYear}</p>
      )}
    </details>
  );
}


function BriefBlock({ n, title, text, highlight = false }) {
  // 只把同一段里的一句放大，全文仍然完整保留；挑不出来就不放大。
  const { parts, keyIndex } = pickKeySentence(text);
  const active = highlight ? keyIndex : -1;
  return (
    <section className="brief-block">
      <h3>
        <span className="brief-num">{n}</span>
        {title}
      </h3>
      <p className="brief-text">
        {parts.length === 0
          ? text
          : parts.map((sentence, i) =>
              i === active ? (
                <strong className="brief-key" key={i}>
                  {sentence}
                </strong>
              ) : (
                <span key={i}>{sentence}</span>
              ),
            )}
      </p>
    </section>
  );
}

function CategoryBrief({ hint, includeGap = true }) {
  return (
    <div className="brief-view">
      <div className="category-hint">
        <div className="category-hint-label">配料表里的类别写法</div>
        <p className="category-hint-what">{hint.what}</p>
        <p>{hint.why}</p>
        {includeGap && <p className="category-hint-how">{hint.how}</p>}
      </div>
    </div>
  );
}

function UnknownBrief({ card, isDemo, hasError = false, groupName = null, hasHealth = false }) {
  if (hasHealth) {
    // 有健康资料、只是本地没有身份条目：说清楚缺的是哪一块
    return (
      <div className="brief-view">
        <div className="unknown-box">
          {groupName && (
            <p className="unknown-group-line">
              配料表把它列在「{groupName}」的括号内。
            </p>
          )}
          <p>已核对的研究资料见上方；身份与用途资料可在「深入了解这个成分」中查看。</p>
        </div>
      </div>
    );
  }
  return (
    <div className="brief-view">
      <div className="unknown-box">
        {groupName && (
          <p className="unknown-group-line">
            配料表把它列在「{groupName}」的括号内。
          </p>
        )}
        <p className="muted-sm">
          {isDemo
            ? "离线演示没有这个成分的资料，暂时留空；这不表示它有问题。"
            : hasError
              ? "这次查询因网络或服务问题中断。可以点「重试一次」，或稍后再试。"
              : "本次取得的资料还不足以解释这个成分；这不表示它有问题。"}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 深入版

const DEEP_ORDER = ["what", "why", "evidence", "misconception", "limits"];
const DEEP_TITLES = {
  what: "这个成分是什么",
  why: "为什么食品中会使用它",
  evidence: "科学证据能告诉我们什么",
  misconception: "容易误解的地方",
  limits: "目前不能确认什么",
};

function DeepView({ card, research, foodContext = null }) {
  const hasResearch = Boolean(research?.sections?.length);
  const core = buildIngredientCore({ card, research, foodContext });
  const healthView = buildHealthView(research, {
    foodContext,
    name: card?.name || research?.ingredient || "",
  });

  return (
    <div className="deep-view">
      {/* 深入版先看健康，再看身份与依据：
          不能出现「顶部健康结论改善了，点开深入了解又回到标准编号」。
          这里复用同一份 research 数据，不重新生成、也不换一套说法。 */}
      {research && !healthView?.legacy && (
        <HealthBlock
          research={research}
          foodContext={foodContext}
          name={card?.name || research?.ingredient || ""}
        />
      )}

      <div className="deep-divider">进一步了解科学依据</div>
      {healthView?.deepFacts?.length > 0 && (
        <section className="health-block" aria-label="研究与原始证据">
          <div className="health-head"><span className="health-label">研究与原始证据</span></div>
          {healthView.deepFacts.map((study, i) => (
            <article className="health-row" key={i}>
              <h4>{study.title || (study.applicability?.generalizable === false ? "特定对象或条件下的研究" : "健康评估与研究")}</h4>
              {study.applicability?.generalizable === false && <p className="health-cond">特定研究对象或条件；不能直接推广到一般消费者。</p>}
              <p>{study.fullText || study.text}</p>
              <HealthMeta item={study} />
              <RefChips refs={study.sourceRefs || []} sources={research.sources || []} />
            </article>
          ))}
        </section>
      )}

      {/* V2.3 返工：有健康结论时，顶部已经有一句健康和三个问题，
          这里不再放一张同样醒目的「核心结论」卡片。
          没有健康结论时，只留普通字号的「科学背景」，
          不让标准编号和技术用途抢走健康结论的位置。 */}
      {!core.suppressed && (
        <div className={`deep-core ${core.source} tone-${core.tone || "normal"}`}>
          <span className="deep-core-label">{core.label}</span>
          {core.headline && (
            <p className="deep-core-headline">{core.headline}</p>
          )}
          {core.explanation && (
            <p
              className={`deep-core-explain ${
                core.headline ? "" : "is-primary"
              }`}
            >
              {core.explanation}
            </p>
          )}
          {core.sourceRefs?.length > 0 && (
            <div className="deep-core-refs">
              依据 {core.sourceRefs.join(" · ")}
            </div>
          )}
          {core.source === "insufficient" && (
            <div className="deep-core-note">
              这只说明我们的资料不足，不代表这个成分有问题。
            </div>
          )}
        </div>
      )}

      {hasResearch ? (
        <DeepFromResearch research={research} card={card} />
      ) : (
        <DeepFromLocal card={card} />
      )}
    </div>
  );
}

function DeepFromResearch({ research, card }) {
  const sections = research.sections || [];
  const grouped = DEEP_ORDER.map((key) => ({
    key,
    title: DEEP_TITLES[key],
    items: sections.filter((s) => s.section === key),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {research.identity?.note && (
        <div className="identity-note-line">
          分类依据：{research.identity.note}
        </div>
      )}

      {grouped.map((g, gi) => (
        <section className="sheet-section" key={g.key}>
          <h3>
            <span className="sec-num">{gi + 1}</span>
            {g.title}
          </h3>
          <div className="claim-list">
            {g.items.map((s, i) => (
              <div
                className={`claim-item ${s.verified ? "" : "unverified"}`}
                key={`${s.id || g.key}-${i}`}
              >
                <p className="claim-text">{s.text}</p>
                {s.limitations && (
                  <div className="claim-limit">局限：{s.limitations}</div>
                )}
                {s.tier === "snippet_only" && (
                  <div className="rs-snippet">
                    仅依据搜索引擎摘要，未取得网页正文 —— 证据强度低于正文摘录
                  </div>
                )}
                {s.scientificCheck?.status === "review" && (
                  <div className="rs-review">
                    这条依据需要进一步核对：
                    {s.scientificCheck.issues?.[0]?.why || "资料不足以确认"}
                  </div>
                )}
                {!s.verified && (
                  <div className="rs-unverified">
                    这条没有来源支撑，已降级显示，不能当作循证结论。
                  </div>
                )}
                {s.sourceRefs?.length > 0 && (
                  <RefChips
                    refs={s.sourceRefs}
                    sources={research.sources || []}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 资料之间的差异 */}
      {research.notes?.length > 0 && (
        <section className="sheet-section">
          <h3>
            <span className="sec-num">{grouped.length + 1}</span>
            关于资料的说明
          </h3>
          <ul className="deep-notes">
            {research.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 被拦下的结论 */}
      {research.rejectedSections?.length > 0 && (
        <details className="rejected-block">
          <summary>
            有 {research.rejectedSections.length} 条结论因引用校验未通过被拦下
          </summary>
          <ul>
            {research.rejectedSections.map((r, i) => (
              <li key={i}>
                <span className="rj-reason">{r.rejectReason}</span>
                <span className="rj-text">{r.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 完整来源 */}
      <section className="sheet-section">
        <h3>
          <span className="sec-num">{grouped.length + 2}</span>
          证据从哪里来？
        </h3>
        <SourceLegend />
        <div className="source-list">
          {(research.sources || []).map((s) => (
            <EvidenceCard
              key={s.id}
              source={s}
              cited={sections.some((x) => x.sourceRefs?.includes(s.id))}
            />
          ))}
        </div>
      </section>

      {/* 本地原始条目 */}
      {card && card.hasDeep && <LocalOriginalCard card={card} />}

      <ResearchDiag data={research} />
    </>
  );
}

function DeepFromLocal({ card }) {
  if (!card) return null;

  let n = 0;
  const next = () => (n += 1);

  return (
    <>
      <section className="sheet-section">
        <h3>
          <span className="sec-num">{next()}</span>
          这个成分是什么
        </h3>
        <p>{card.whatIsIt || card.brief?.what}</p>
        {card.codes.cns || card.codes.ins ? (
          <div className="sheet-codes">
            {card.codes.cns && <span>CNS {card.codes.cns}</span>}
            {card.codes.ins && <span>INS {card.codes.ins}</span>}
            {card.functions.length > 0 && (
              <span>功能：{card.functions.join("、")}</span>
            )}
          </div>
        ) : null}
      </section>

      <section className="sheet-section">
        <h3>
          <span className="sec-num">{next()}</span>
          为什么食品中会使用它
        </h3>
        <p>{card.whyUsed || card.brief?.why}</p>
      </section>

      {card.safetyPrinciples && (
        <section className="sheet-section">
          <h3>
            <span className="sec-num">{next()}</span>
            科学证据能告诉我们什么
          </h3>
          <p>{card.safetyPrinciples}</p>
        </section>
      )}

      <section className="sheet-section">
        <h3>
          <span className="sec-num">{next()}</span>
          容易误解的地方
        </h3>
        {card.misconceptions.length === 0 ? (
          <p className="muted-sm">
            本知识库没有为这个成分整理出有可靠来源的常见误解，因此不作补充。
          </p>
        ) : (
          <div className="misconception-list">
            {card.misconceptions.map((m, i) => (
              <div className="misconception" key={i}>
                <div className="mis-state">常见说法：{m.statement}</div>
                <div className="mis-fix">
                  <span className="mis-fix-label">实际情况</span>
                  {m.correction}
                </div>
                <RefChips
                  refs={m.sources.map((s) => s.id)}
                  sources={card.sources}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sheet-section">
        <h3>
          <span className="sec-num">{next()}</span>
          目前不能确认什么
        </h3>
        <p className="limits-text">
          {card.limits || "本条目暂未整理这方面内容。"}
        </p>
      </section>

      {card.verification === "partial" && (
        <div className="partial-note">
          <strong>部分内容待完善：</strong>
          {card.verificationNote ||
            "本条目的部分说明尚未取得可直接引用的来源，暂不展开。"}
        </div>
      )}

      <section className="sheet-section">
        <h3>
          <span className="sec-num">{next()}</span>
          证据从哪里来？
        </h3>
        <SourceLegend />
        <div className="source-list">
          {card.sources.map((s) => (
            <LocalSourceCard key={s.id} source={s} />
          ))}
        </div>
      </section>

      <div className="deep-offline-hint">
        以上为本地知识库内容。真实模式下点击成分会自动补充权威网络资料，届时这里会显示更完整的证据。
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 状态与来源

const STATUS_META = {
  ok: { label: "引用对应关系已检查", cls: "ok" },
  partial: { label: "部分结论有依据，部分无法确认", cls: "partial" },
  failed: { label: "未能生成可靠解释", cls: "failed" },
  no_source: { label: "没有找到足够可信的资料", cls: "failed" },
};

function statusLabel(status) {
  return (STATUS_META[status] || { label: "状态未知" }).label;
}

function statusCls(status) {
  return (STATUS_META[status] || { cls: "failed" }).cls;
}

function RefChips({ refs, sources }) {
  const byId = new Map((sources || []).map((s) => [s.id, s]));
  return (
    <div className="ref-chips">
      {refs.map((r) => {
        const src = byId.get(r);
        const local = isLocalSource(src);
        return (
          <span
            key={r}
            className={`ref-chip ${local ? "ref-local" : "ref-web"}`}
            title={
              src
                ? `${src.title}${local ? "（本地知识库）" : "（本次联网取得）"}`
                : r
            }
          >
            [{r}]
          </span>
        );
      })}
    </div>
  );
}

function SourceLegend() {
  return (
    <div className="src-legend">
      <span className="ref-chip ref-local">[K]</span>
      <span className="legend-text">本地知识库已核实</span>
      <span className="ref-chip ref-web">[W]</span>
      <span className="legend-text">本次联网取得</span>
    </div>
  );
}

function EvidenceCard({ source, cited }) {
  const local = isLocalSource(source);
  const isSummary =
    source.sourceType === "search_summary" ||
    source.sourceType === "search_only";

  return (
    <div
      className={`src-card ${local ? "local" : "web"} ${cited ? "cited" : ""}`}
    >
      <div className="src-head">
        <span className="src-id">[{source.id}]</span>
        <span className={`src-type ${isSummary ? "summary" : "verbatim"}`}>
          {EVIDENCE_TYPE_LABELS[source.sourceType] || source.sourceType}
        </span>
        {cited && <span className="src-cited">已被引用</span>}
      </div>

      <div className="src-title">{source.title}</div>

      <div className="src-clause">
        {source.organization}
        {source.version ? ` · ${source.version}` : ""}
        {source.retrievedAt
          ? ` · 抓取于 ${new Date(source.retrievedAt).toLocaleString("zh-CN", { hour12: false })}`
          : source.verifiedAt
            ? ` · 本地核实于 ${source.verifiedAt}`
            : ""}
      </div>

      <blockquote className="src-quote">{source.excerpt}</blockquote>

      <div className="src-excerpt-type">
        {EXCERPT_KIND_LABELS[source.excerptType] ||
          source.excerptType ||
          "内容摘录"}
      </div>

      {source.conditions?.length > 0 && (
        <div className="src-cond">
          <div className="src-cond-title">适用条件</div>
          <ul>
            {source.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {isSummary && (
        <div className="src-suspicion">
          这条只有搜索摘要，没有取得网页正文。它只能作为线索，不能当作已核实的原文。
        </div>
      )}

      {source.possibleMixedContent && (
        <div className="src-suspicion">
          该页面疑似把多个添加剂条目拼在一起，其中的数值可能属于相邻条目 ——
          引用数值时请谨慎。
        </div>
      )}

      {source.suspicion?.length > 0 && (
        <div className="src-suspicion">
          正文中出现疑似指令性文字（{source.suspicion[0]}
          ），已按普通资料处理，未执行。
        </div>
      )}

      {source.url && (
        <div className="src-foot">
          <a href={source.url} target="_blank" rel="noreferrer">
            打开原网页 ↗
          </a>
        </div>
      )}
    </div>
  );
}

function LocalSourceCard({ source }) {
  const typeLabel =
    source.type === "standard"
      ? "国家标准"
      : source.type === "database"
        ? "官方数据库"
        : "权威机构资料";

  return (
    <div className="src-card local">
      <div className="src-head">
        <span className="src-id">[{source.id}]</span>
        <span className="src-code">{source.code}</span>
        <span className={`src-type ${source.quoteType}`}>
          {source.quoteType === "verbatim"
            ? source.quoteLang === "en"
              ? "原文摘录（英文）"
              : "原文摘录"
            : "摘要（非逐字）"}
        </span>
        <span className="src-kind">{typeLabel}</span>
      </div>

      <div className="src-title">{source.title}</div>
      {source.clause && <div className="src-clause">{source.clause}</div>}

      <blockquote className="src-quote">{source.quote}</blockquote>

      {source.translation && (
        <div className="src-translation">
          <span className="trans-label">译文</span>
          {source.translation}
        </div>
      )}

      {source.plain && <div className="src-plain">{source.plain}</div>}

      {source.conditions?.length > 0 && (
        <div className="src-cond">
          <div className="src-cond-title">适用条件</div>
          <ul>
            {source.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="src-foot">
        <span>
          {source.issuer}
          {source.effectiveAt
            ? ` · 实施 ${source.effectiveAt}`
            : source.publishedAt
              ? ` · ${source.publishedAt}`
              : ""}
        </span>
        {source.url && (
          <a href={source.url} target="_blank" rel="noreferrer">
            查看原文 ↗
          </a>
        )}
      </div>
    </div>
  );
}

function LocalOriginalCard({ card }) {
  return (
    <details className="local-original">
      <summary>查看本地知识库原始条目（{card.sources.length} 条来源）</summary>
      <div className="lo-body">
        {card.verification === "partial" && (
          <div className="partial-note">
            <strong>部分内容待完善：</strong>
            {card.verificationNote ||
              "本条目的部分说明尚未取得可直接引用的来源，暂不展开。"}
          </div>
        )}
        <div className="lo-block">
          <div className="lo-k">这是什么</div>
          <p>{card.whatIsIt || card.brief?.what}</p>
        </div>
        <div className="lo-block">
          <div className="lo-k">为什么会用</div>
          <p>{card.whyUsed || card.brief?.why}</p>
        </div>
        {card.limits && (
          <div className="lo-block">
            <div className="lo-k">不能确认什么</div>
            <p className="limits-text">{card.limits}</p>
          </div>
        )}
      </div>
    </details>
  );
}

function ResearchDiag({ data }) {
  return (
    <details className="research-diag">
      <summary>检索过程与费用</summary>
      <div className="diag-grid">
        <span>查询词</span>
        <span className="mono-sm">{data.query}</span>
        <span>限定站点</span>
        <span>{(data.querySites || []).join(", ") || "（无）"}</span>
        <span>搜索结果</span>
        <span>
          {data.searchCount ?? 0} 条（其中 {data.searchContentCount ?? 0}{" "}
          条带正文）
          {data.searchBudget
            ? ` · 检索 ${data.searchBudget.usedRounds}/${data.searchBudget.maxRounds} 轮`
            : data.searchRounds > 1
              ? ` · 补充检索 ${data.searchRounds - 1} 次`
              : ""}
        </span>
        <span>实际抓取</span>
        <span>
          {data.fetchCount
            ? `${data.fetchCount} 页`
            : "0 页（搜索已带回正文，无需抓取）"}
          {data.fetchAttempts > data.fetchCount
            ? ` · 失败 ${data.fetchAttempts - data.fetchCount} 次`
            : ""}
        </span>
        <span>研究规划</span>
        <span>
          {data.searchBudget?.usedPlannerCalls ?? 0} 次
          {data.researchStopReason
            ? ` · 停止原因：${data.researchStopReason}`
            : ""}
        </span>
        <span>证据覆盖</span>
        <span>
          {data.researchCoverageLabels
            ? `身份 ${data.researchCoverageLabels.identity} · 正常 ${data.researchCoverageLabels.normal} · 高摄入 ${data.researchCoverageLabels.high} · 人群 ${data.researchCoverageLabels.sensitive}`
            : "—"}
        </span>
        <span>本地证据</span>
        <span>{data.evidenceStats?.local ?? 0} 条</span>
        <span>联网证据</span>
        <span>
          {(data.evidenceStats?.webBody ?? 0) +
            (data.evidenceStats?.webSummary ?? 0)}{" "}
          条
          {data.evidenceStats?.webSummary > 0
            ? `（其中仅摘要 ${data.evidenceStats.webSummary} 条）`
            : ""}
        </span>
        <span>通过校验的结论</span>
        <span>{data.verification?.stats?.accepted ?? 0} 条</span>
        <span>被拦下的结论</span>
        <span>{data.verification?.stats?.rejected ?? 0} 条</span>
        <span>总耗时</span>
        <span>{data.totalMs} ms</span>
        {data.chat?.usage && (
          <>
            <span>Tokens</span>
            <span>
              输入 {data.billing?.calls?.reduce((n,c) => n + (c.usage?.prompt_tokens || 0), 0) ?? data.chat.usage.prompt_tokens} / 输出{" "}
              {data.billing?.calls?.reduce((n,c) => n + (c.usage?.completion_tokens || 0), 0) ?? data.chat.usage.completion_tokens}
              {data.chat.reasoningTokens
                ? `（推理 ${data.chat.reasoningTokens}）`
                : ""}
            </span>
          </>
        )}
        {data.cost && (
          <>
            <span>费用上界估算</span>
            <span>¥{Number(data.cost.total).toFixed(4)}（按高峰价，非账单实扣）</span>
          </>
        )}
      </div>

      {data.completion?.items?.length > 0 && (
        <div className="diag-block">
          <div className="diag-title">
            研究完成度（{data.completion.done}/{data.completion.total} 项完成）
          </div>
          <ul>
            {data.completion.items.map((item, i) => (
              <li key={i}>
                <span className={`diag-status ds-${item.status}`}>
                  {item.status === "done"
                    ? "已完成"
                    : item.status === "partial"
                      ? "部分"
                      : item.status === "failed"
                        ? "失败"
                        : "缺口"}
                </span>
                {item.label}
                <span className="muted"> — {item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.researchActions?.length > 0 && (
        <div className="diag-block">
          <div className="diag-title">实际研究路径</div>
          <ul>
            {data.researchActions.map((a, i) => (
              <li key={i}>
                {a.type === "search"
                  ? `检索 · ${a.query}`
                  : `读取 · ${a.url}`}
                <span className="muted">
                  {a.ok === false ? ` — 失败：${a.error}` : a.why ? ` — ${a.why}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.blocked?.length > 0 && (
        <div className="diag-block">
          <div className="diag-title">被域名白名单拦下</div>
          <ul>
            {data.blocked.map((b, i) => (
              <li key={i}>
                {b.url}
                <span className="muted"> — {b.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.fetchFailures?.length > 0 && (
        <div className="diag-block">
          <div className="diag-title">抓取失败</div>
          <ul>
            {data.fetchFailures.map((f, i) => (
              <li key={i}>
                {f.url}
                <span className="muted"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function formatDate(iso) {
  if (!iso) return "未知";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}
