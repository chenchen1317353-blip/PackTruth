/**
 * 话术结果的统一形状与状态映射。
 *
 * 三态不变：
 *   supported    标签有直接依据
 *   expandable   容易被扩大理解（含「与标签数值不一致」这一子情形）
 *   insufficient 信息不足
 *
 * 「不一致疑点」不新增第四种状态：它仍然是 expandable，
 * 但会带上 flag = 'mismatch' 和独立的 statusLabel，
 * 让卡片能明确写出「不一致」，而不是混在一般的理解偏差里。
 */

export const ANALYSIS_STATUS = {
  SUPPORTED: 'supported',
  EXPANDABLE: 'expandable',
  INSUFFICIENT: 'insufficient',
  UNIMPLEMENTED: 'unimplemented',
};

export const STATUS_META = {
  supported: { label: '有直接标签依据', tone: 'green', hint: '标签数据能够支持这句话的字面含义' },
  expandable: { label: '容易被扩大理解', tone: 'amber', hint: '标签数据成立，但容易让人推出它证明不了的结论' },
  insufficient: { label: '信息不足，无法确认', tone: 'gray', hint: '缺少关键数据，暂时无法判断' },
  unimplemented: { label: '规则尚未支持', tone: 'gray', hint: '该宣传语的规则尚未收录，不会套用其他规则' },
};

export const MISMATCH_LABEL = '与标签数值不一致，需要核对';
export const INGREDIENT_MISMATCH_LABEL = '所选宣传语与配料信息存在不一致疑点';

/** 2025 版新规的固定提示：必须出现在用户可见的主卡片上，不能只藏在来源里 */
export const FUTURE_STANDARD_NOTE =
  '2025 版新规定将于 2027 年 3 月 16 日实施，当前仅作规则变化提示。';

export function makeResult(claim, ruleId, extra = {}) {
  return {
    claimId: claim?.id || null,
    claimText: claim?.text || '',
    ruleId: ruleId || null,
    ruleName: null,
    claimType: null,
    ruleVersion: 'GB28050-2011',
    status: ANALYSIS_STATUS.INSUFFICIENT,
    verdict: 'unknown',
    flag: null,
    summary: '',
    /** 卡片顶部的一句话结论，由规则根据已完成的判定生成，UI 不再推断 */
    takeaway: null,
    /** 不一致时给卡片用的具体说明（不写违法结论） */
    mismatchNote: null,
    /** 标准版本提示：未来标准或「无直接工艺依据」等，必须用户可见 */
    standardNote: null,
    standardNoteTone: null,
    facts: [],
    canConclude: [],
    cannotConclude: [],
    missing: [],
    warnings: [],
    calculation: null,
    pathways: [],
    basisNote: null,
    evidence: [],
    ...extra,
  };
}

/** 结论 -> 三态 */
export function statusOfVerdict(verdict) {
  if (verdict === 'pass') return ANALYSIS_STATUS.SUPPORTED;
  if (verdict === 'mismatch') return ANALYSIS_STATUS.EXPANDABLE;
  return ANALYSIS_STATUS.INSUFFICIENT;
}

/** 不一致时给卡片用的状态覆盖 */
export function mismatchMeta(label = MISMATCH_LABEL) {
  return { statusLabel: label, statusTone: 'amber' };
}

export function claimTypeLabel(type) {
  return (
    {
      content: '营养含量声称',
      comparison: '比较声称',
      ingredient: '配料相关宣传',
      process: '加工方式宣传',
      marketing: '泛营销用语',
    }[type] || '包装宣传语'
  );
}

export function roundTo(n, digits = 2) {
  if (!Number.isFinite(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
