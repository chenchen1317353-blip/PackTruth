/**
 * 比较声称（减糖 / 减脂 / 减盐 / 减少热量 / 增加蛋白质）。
 *
 * 标准要求：与参考食品比较，相应指标变化 ≥25%（GB 28050—2011 表 C.3）。
 * 本项目默认只有一个产品的标签，没有可核实的参照食品，
 * 因此默认结论是「信息不足」，不会假设比较对象，也不会推算一个百分比。
 *
 * 只有在记录里带有明确的 referenceFood（同一基准、同项目数值）时，
 * 才做确定性的百分比计算。当前界面没有录入参照食品的入口，
 * 这条分支只作为纯函数能力保留，并在测试里单独验证。
 */

import { COMPARISON_MIN_PERCENT_2011 } from '../thresholds.js';
import { READ_STATE, basisSentence, readNutrient, per100Unit } from '../nutritionFacts.js';
import { ANALYSIS_STATUS, makeResult, mismatchMeta, roundTo } from '../shared.js';

const num = (v) => (Number.isFinite(v) ? String(roundTo(v, 2)) : '—');

function readReference(ctx, rule) {
  const ref = ctx.referenceFood;
  if (!ref || !ref.nutrients) return { state: 'absent', reason: '没有提供参照食品的数据' };
  if (!['per_100g', 'per_100ml'].includes(ref.basis) || ref.basis !== ctx.basis) {
    return {
      state: 'incomparable',
      reason: '参照食品与本品必须明确采用相同的每 100 g 或每 100 mL 基准；每份量未分别确认时不能直接比较',
    };
  }
  const v = ref.nutrients[rule.nutrient];
  if (!Number.isFinite(v)) return { state: 'absent', reason: '参照食品缺少这一项的数值' };
  return { state: 'ok', value: v, name: ref.name || '参照食品' };
}

export function analyzeComparison(claim, ctx, rule) {
  const base = makeResult(claim, rule.id, {
    ruleName: rule.name,
    claimType: 'comparison',
    ruleVersion: 'GB28050-2011',
    basisNote: basisSentence(ctx),
  });

  const reading = readNutrient(ctx, rule.nutrient, { unit: rule.unit });
  const b = per100Unit(ctx);
  const ref = readReference(ctx, rule);

  const facts = [];
  if (reading.state === READ_STATE.OK) {
    facts.push({ label: `本产品${rule.nutrientLabel}`, value: `${num(reading.value)} ${rule.unit} / 100 ${b}` });
  } else {
    facts.push({ label: `本产品${rule.nutrientLabel}`, value: '标签未提供可核对数值', tone: 'missing' });
  }
  if (ref.state === 'ok') {
    facts.push({ label: `参照食品（${ref.name}）`, value: `${num(ref.value)} ${rule.unit} / 100 ${b}` });
  } else {
    facts.push({ label: '参照食品', value: ref.reason, tone: 'missing' });
  }
  facts.push({
    label: '比较声称的要求',
    value: `与参考食品比较，${rule.directionText} ${COMPARISON_MIN_PERCENT_2011}% 以上（GB 28050—2011 表 C.3）`,
  });

  const cannot = [
    '不能假设比较对象是「普通版」「同品牌另一款」或某个市场平均值',
    `${rule.directionText} 25% 是声称的门槛，不等于实际变化幅度就是 25%`,
    '比较声称还必须使用消费者熟知、容易理解的同类或同一属类食品作为参考食品',
  ];

  // ---- 有可核实参照食品：确定性计算 ----
  if (reading.state === READ_STATE.OK && ref.state === 'ok' && ref.value > 0) {
    const delta =
      rule.direction === 'reduce'
        ? ((ref.value - reading.value) / ref.value) * 100
        : ((reading.value - ref.value) / ref.value) * 100;
    const pass = delta >= COMPARISON_MIN_PERCENT_2011;
    const actualDirection = delta >= 0 ? rule.directionText : rule.direction === 'reduce' ? '增加' : '减少';
    const expression =
      rule.direction === 'reduce'
        ? `(${num(ref.value)} − ${num(reading.value)}) ÷ ${num(ref.value)} × 100`
        : `(${num(reading.value)} − ${num(ref.value)}) ÷ ${num(ref.value)} × 100`;

    return {
      ...base,
      ...(pass ? {} : mismatchMeta()),
      status: pass ? ANALYSIS_STATUS.SUPPORTED : ANALYSIS_STATUS.EXPANDABLE,
      verdict: pass ? 'pass' : 'mismatch',
      flag: pass ? null : 'mismatch',
      takeaway: pass
        ? `相对「${ref.name}」，${rule.nutrientLabel}${rule.directionText} ${num(Math.abs(delta))}%，达到 25% 门槛。`
        : `相对「${ref.name}」实际${actualDirection} ${num(Math.abs(delta))}%，未达到所选声称要求。`,
      mismatchNote: pass
        ? null
        : `以「${ref.name}」为参照食品，${rule.nutrientLabel}实际${actualDirection} ${num(
            Math.abs(delta),
          )}%，没有达到表 C.3 的 25% 门槛。建议核对参照食品是否属于同类食品，以及数值口径是否一致。`,
      summary: pass
        ? `以「${ref.name}」为参照食品，${rule.nutrientLabel}${rule.directionText} ${num(
            Math.abs(delta),
          )}%，达到表 C.3 的 25% 要求。这个结论只在上述参照食品下成立。`
        : `以「${ref.name}」为参照食品，${rule.nutrientLabel}实际${actualDirection} ${num(
            Math.abs(delta),
          )}%，没有达到表 C.3 的 25% 门槛，与这句话存在不一致疑点。`,
      facts,
      calculation: {
        expression: delta < 0 ? `|${expression}|` : expression,
        result: roundTo(Math.abs(delta), 1),
        unit: '%',
        label: `相对于「${ref.name}」的${actualDirection}幅度`,
        note: '这是按你提供的参照食品数值算出的百分比，不是标准或监管机构给出的结论。',
      },
      canConclude: pass ? [`相对于「${ref.name}」，${rule.nutrientLabel}${rule.directionText}约 ${num(Math.abs(delta))}%`] : [],
      cannotConclude: cannot,
      evidence: [...rule.evidence, 'gb2025-qa-comparison-ref'],
    };
  }

  // ---- 默认：没有参照食品 ----
  return {
    ...base,
    status: ANALYSIS_STATUS.INSUFFICIENT,
    verdict: 'unknown',
    takeaway: `没有参照食品，无法验证「${rule.name}」的变化幅度。`,
    summary:
      '这是与其他参考食品比较的宣传语。仅凭当前包装的营养表，无法验证降低或增加了多少，需要知道比较对象及其对应数据。',
    facts,
    missing: [
      ref.state === 'incomparable' ? '与本品同一基准的参照食品数据' : '参照食品的名称与对应营养成分数值',
      ...(reading.state !== READ_STATE.OK ? [`本产品的${rule.nutrientLabel}数值`] : []),
    ],
    canConclude: reading.state === READ_STATE.OK
      ? [`本产品${rule.nutrientLabel}为 ${num(reading.value)} ${rule.unit}/100 ${b}`]
      : [],
    cannotConclude: cannot,
    warnings: [
      '比较声称不能靠「减」「少」这类字眼本身成立，必须有可核实的参考食品',
      ...(reading.warnings || []),
    ],
    evidence: [...rule.evidence, 'gb2025-qa-comparison-ref'],
  };
}

export const COMPARISON_RULES = [
  {
    id: 'reduce_sugar',
    name: '减糖 / 减少糖',
    nutrient: 'sugar',
    nutrientLabel: '糖',
    unit: 'g',
    direction: 'reduce',
    directionText: '减少',
    evidence: ['gb2011-c3-comparison'],
  },
  {
    id: 'reduce_fat',
    name: '减脂 / 减少脂肪',
    nutrient: 'fat',
    nutrientLabel: '脂肪',
    unit: 'g',
    direction: 'reduce',
    directionText: '减少',
    evidence: ['gb2011-c3-comparison'],
  },
  {
    id: 'reduce_sodium',
    name: '减盐 / 减钠',
    nutrient: 'sodium',
    nutrientLabel: '钠',
    unit: 'mg',
    direction: 'reduce',
    directionText: '减少',
    evidence: ['gb2011-c3-comparison'],
  },
  {
    id: 'reduce_energy',
    name: '减少热量 / 减能量',
    nutrient: 'energy',
    nutrientLabel: '能量',
    unit: 'kJ',
    direction: 'reduce',
    directionText: '减少',
    evidence: ['gb2011-c3-comparison'],
  },
  {
    id: 'increase_protein',
    name: '增加蛋白质',
    nutrient: 'protein',
    nutrientLabel: '蛋白质',
    unit: 'g',
    direction: 'increase',
    directionText: '增加',
    evidence: ['gb2011-c3-comparison'],
  },
];
