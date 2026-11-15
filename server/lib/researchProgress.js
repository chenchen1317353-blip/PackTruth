/**
 * 研究进度与取消（进程内，纯内存，不落盘）。
 *
 * 为什么不用假进度条：界面上的每一句话都必须对应真实执行阶段。
 * 编排层在每次上游调用前后写入阶段，前端按 requestId 轮询；
 * 没有百分比，只有「正在做什么」。
 *
 * 取消的语义：
 *   - 取消后，编排层在每个阶段边界检查一次，**不再发起新的付费调用**；
 *   - 已经发给上游的请求无法撤回，可能仍会计费 —— 界面必须如实说明；
 *   - 进度记录保留 5 分钟，便于前端读到最终状态。
 */

const TTL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 12;

/** @type {Map<string, object>} */
const store = new Map();

export const STAGE_LABELS = {
  queued: '正在确认成分与食品语境…',
  search_identity: '正在确认成分身份与权威资料…',
  search_constituent: '正在查组成物质的联合评估…',
  search_food_use: '正在确认它在食品里的用途…',
  search_normal: '正在查找正常食用的健康评估…',
  search_high: '正在核对高摄入与长期暴露证据…',
  search_sensitive: '正在核对特殊人群注意事项…',
  search_recent: '正在查找较新的官方再评估…',
  plan: '正在根据已取得的证据决定下一步…',
  fetch: '正在读取健康评估原文…',
  chat: '正在把证据整理成解释…',
  verify: '正在核对引用与适用范围…',
  done: '研究完成',
  cancelled: '已取消',
  failed: '研究中断',
};

const SEARCH_STAGE = {
  identity: 'search_identity',
  constituent: 'search_constituent',
  food_use: 'search_food_use',
  normal: 'search_normal',
  high: 'search_high',
  sensitive: 'search_sensitive',
  recent: 'search_recent',
};

export function stageForFocus(focus) {
  return SEARCH_STAGE[focus] || 'search_normal';
}

function prune(now = Date.now()) {
  for (const [id, rec] of store) {
    if (now - rec.updatedAt > TTL_MS) store.delete(id);
  }
}

export function ensureProgress(id) {
  if (!id) return null;
  prune();
  if (!store.has(id)) {
    store.set(id, {
      id,
      stage: 'queued',
      label: STAGE_LABELS.queued,
      round: 0,
      totalRounds: 7,
      history: [],
      cancelled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return store.get(id);
}

/**
 * 写入阶段。同一阶段重复写入不会产生重复历史（只更新时间）。
 */
export function setStage(id, stage, extra = {}) {
  if (!id) return null;
  const rec = ensureProgress(id);
  if (!rec) return null;
  if (rec.cancelled && !['cancelled', 'done', 'failed'].includes(stage)) return rec;

  const label = extra.label || STAGE_LABELS[stage] || STAGE_LABELS.queued;
  if (rec.stage !== stage || extra.round !== rec.round) {
    rec.history.push({ stage, label, round: extra.round ?? rec.round, at: Date.now() });
    if (rec.history.length > MAX_HISTORY) rec.history.shift();
  }
  rec.stage = stage;
  rec.label = label;
  if (extra.round != null) rec.round = extra.round;
  if (extra.detail) rec.detail = String(extra.detail).slice(0, 200);
  rec.updatedAt = Date.now();
  return rec;
}

export function getProgress(id) {
  if (!id) return null;
  prune();
  const rec = store.get(id);
  if (!rec) return null;
  return {
    id: rec.id,
    stage: rec.stage,
    label: rec.label,
    round: rec.round,
    totalRounds: rec.totalRounds,
    detail: rec.detail || null,
    cancelled: rec.cancelled,
    history: rec.history.slice(-6),
    updatedAt: rec.updatedAt,
  };
}

/** 用户点了取消：只打标记，由编排层在阶段边界停止发新请求 */
export function requestCancel(id) {
  const rec = ensureProgress(id);
  if (!rec) return null;
  rec.cancelled = true;
  rec.stage = 'cancelled';
  rec.label = STAGE_LABELS.cancelled;
  rec.updatedAt = Date.now();
  return getProgress(id);
}

export function isCancelled(id) {
  return Boolean(id && store.get(id)?.cancelled);
}

export function finishProgress(id, stage = 'done', extra = {}) {
  if (!id) return null;
  const rec = store.get(id);
  if (rec?.cancelled && stage !== 'done') return getProgress(id);
  if (rec?.cancelled) return getProgress(id);
  return setStage(id, stage, extra);
}

/** 测试用 */
export function clearProgressStore() {
  store.clear();
}
