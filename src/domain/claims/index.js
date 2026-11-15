/**
 * 包装话术拆解规则引擎 V2。
 *
 * 设计原则（与 V1 一致，只是范围扩大）：
 * 1. 规则是纯函数，不碰 React、不碰网络，可以单独测。
 * 2. 只输出「信息支持程度」，不输出「食品安全等级」，更不做违规判定。
 * 3. 所有数值结论必须能追到一条已核实的来源（evidence id）。
 * 4. 数据不够就明说不够，绝不用别的数值推一个出来。
 *
 * V2 的变化：
 * - 文字 -> 规则的匹配统一走 registry.js，组件里不再有 if/else。
 * - 数值声称按 GB 28050—2011 表 C.1 判定，包含固体 / 液体与每 420 kJ 多条途径。
 * - 比较声称默认「信息不足」，没有参照食品就不算百分比。
 * - 配料 / 工艺 / 泛营销类只做循证解释，不造阈值。
 */

import { PRESENCE } from '../foodRecord.js';
import { flattenIngredientNames } from '../ingredientStructure.js';
import { resolvePhysicalForm } from './nutritionFacts.js';
import { matchRule, RULE_COUNT } from './registry.js';
import { ANALYSIS_STATUS, STATUS_META, claimTypeLabel, makeResult } from './shared.js';
import { ZERO_LIMITS_2011 } from './thresholds.js';

export { ANALYSIS_STATUS, STATUS_META, ZERO_LIMITS_2011 };
export { matchRule, RULE_COUNT as REGISTERED_RULE_COUNT, normalizeClaimText } from './registry.js';

// ---------------------------------------------------------------- 对外入口

/**
 * @param {object} record FoodRecord（必须是用户确认后的）
 * @param {{servingAmount?:number}} [options] 单品实际食用量
 * @returns {Array} 每条宣传语一个分析结果
 */
export function analyzeClaims(record, options = {}) {
  if (!record) return [];
  return (record.claims || []).map((c) => analyzeClaim(c, record, options));
}

export function analyzeClaim(claim, record, options = {}) {
  const text = String(claim?.text || '').trim();
  const ctx = buildContext(record, options);
  ctx.claimText = text;

  const rule = matchRule(text);
  if (!rule) return analyzeUnimplemented(claim, ctx);

  const result = rule.analyze(claim, ctx, rule);
  return {
    ...result,
    ruleId: rule.id,
    ruleName: rule.name,
    claimType: rule.claimType,
    claimTypeLabel: claimTypeLabel(rule.claimType),
    ruleVersion: result.ruleVersion || (rule.claimType === 'content' ? 'GB28050-2011' : 'GB7718-2025'),
  };
}

// ---------------------------------------------------------------- 未收录

function analyzeUnimplemented(claim, ctx) {
  return {
    ...makeResult(claim, null),
    status: ANALYSIS_STATUS.UNIMPLEMENTED,
    verdict: 'unknown',
    summary: `「${claim?.text || ''}」还没有收录进规则库。本页不会把它套用到「0 糖」「低脂」等别的规则上，因此不给判定，也不给阈值。`,
    facts: [],
    canConclude: [],
    cannotConclude: ['在规则收录之前，这个页面不会对这句话给出任何判定或数值门槛'],
    missing: ['可核对的规则与标准条款'],
    warnings: ['可以换一种更接近包装原文的说法重新输入，或先看看包装上是否使用了标准里的声称用语'],
    evidence: [],
  };
}

// ---------------------------------------------------------------- 上下文

function buildContext(record, options) {
  const items = record?.nutrition?.items || [];
  const basis = record?.nutrition?.basis || null;
  return {
    record,
    basis,
    basisText: record?.nutrition?.basisText || null,
    physicalForm: resolvePhysicalForm(record),
    servingUnit: basis === 'per_100ml' ? 'mL' : 'g',
    servingAmount: Number(options?.servingAmount ?? 100),
    servingSize: record?.nutrition?.servingSize || null,
    referenceFood: record?.referenceFood || null,
    claimText: '',
    ingredientNames: flattenIngredientNames(record?.ingredients?.items || []),
    find: (key) => items.find((i) => i.key === key) || null,
    searchIngredients: (keywords) =>
      (record?.ingredients?.items || [])
        .map((i) => i.name)
        .filter((n) => n && keywords.some((k) => String(n).includes(k))),
  };
}

/** 供测试与界面统计 */
export function countSupportedClaims() {
  return RULE_COUNT;
}
