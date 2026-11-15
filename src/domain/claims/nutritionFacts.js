/**
 * 把 FoodRecord 里的一行营养数据，读成「每 100 g / 100 mL 的数值」。
 *
 * 这一层不产生任何结论，只负责三件事：
 * 1. 区分「没有这一行」「包装未标示」「有行但没数值」——三者不能都当 0。
 * 2. 统一单位（g / mg / μg、kJ / kcal），不混用。
 * 3. 把「每份」换算到每 100 g（mL），没有每份克重就拒绝换算，绝不猜。
 *
 * 所有换算都复用 domain/nutrition.js 的既有函数，不另写一套。
 */

import { PRESENCE } from '../foodRecord.js';
import { basisLabel, massToMg, roundTo } from '../nutrition.js';
import { KJ_PER_KCAL } from './thresholds.js';

export const READ_STATE = {
  OK: 'ok',
  ABSENT: 'absent', // 表里没有这一行
  NOT_LABELED: 'not_labeled', // 用户确认包装上没有
  UNREADABLE: 'unreadable', // 有这一行，数值没读到
  NO_UNIT: 'no_unit', // 有数值，单位没确认
  BAD_UNIT: 'bad_unit', // 单位与项目不匹配（例如钠写成 μg）
  NO_BASIS: 'no_basis', // 标示基准没确认
  NO_SERVING_SIZE: 'no_serving_size', // 按份标示，但没有每份克重
  UNCERTAIN_VALUE: 'uncertain_value', // 约数/界限值不能冒充精确量
};

const MASS_FACTOR_TO_G = { g: 1, mg: 0.001, μg: 0.000001 };

/** 食品形态：用户确认优先，其次按标示基准推断 */
export function resolvePhysicalForm(record) {
  const explicit = record?.basic?.physicalForm;
  if (explicit === 'solid' || explicit === 'liquid') return explicit;
  const basis = record?.nutrition?.basis;
  if (basis === 'per_100ml') return 'liquid';
  if (basis === 'per_100g') return 'solid';
  return null;
}

export function formLabel(form) {
  if (form === 'solid') return '固体';
  if (form === 'liquid') return '液体';
  return '未确认';
}

/** 找到某个营养素行。钙在 FoodRecord 里可能是 other，需要按名称兜底。 */
export function findNutrientItem(items, key) {
  const list = items || [];
  const direct = list.find((i) => i.key === key);
  if (direct) return direct;
  if (key === 'calcium') {
    return (
      list.find((i) => {
        const n = String(i.name || '').replace(/[\s　]/g, '');
        return n === '钙' || n === '钙含量' || n === '钙（mg）' || n === '钙(mg)';
      }) || null
    );
  }
  return null;
}

/**
 * @param {object} ctx buildContext 产生的上下文
 * @param {'energy'|'protein'|'fat'|'sugar'|'dietary_fiber'|'sodium'|'calcium'|'trans_fat'} key
 * @param {{unit:'g'|'mg'|'kJ'}} options 该项目的标准单位
 */
export function readNutrient(ctx, key, { unit } = {}) {
  const items = ctx?.record?.nutrition?.items || [];
  const item = findNutrientItem(items, key);
  const basis = ctx?.basis || null;

  const base = {
    key,
    item,
    state: READ_STATE.ABSENT,
    value: null,
    rawValue: null,
    unit: unit || null,
    basis,
    basisText: basis ? basisLabel(basis) : '基准未确认',
    form: ctx?.physicalForm || null,
    note: null,
    warnings: [],
    missing: [],
  };

  if (!item) {
    return { ...base, missing: ['营养成分表中的该项含量（表里没有这一行）'] };
  }

  if (item.presence === PRESENCE.NOT_LABELED) {
    return { ...base, state: READ_STATE.NOT_LABELED, missing: ['标签未标示的该项含量'] };
  }

  if (!Number.isFinite(item.value) || item.value < 0) {
    return { ...base, state: READ_STATE.UNREADABLE, missing: ['该项的具体数值'] };
  }

  if (item.status === 'APPROXIMATE' || /[<>≤≥＜＞~～约]/.test(String(item.rawText || ''))) {
    return { ...base, state: READ_STATE.UNCERTAIN_VALUE,
      missing: ['可核对的精确标示值（当前是界限值或约数）'],
      warnings: ['当前数值是界限值或约数，不能按精确等值判定声称；请核对包装原文。'] };
  }

  if (!item.unit) {
    return { ...base, state: READ_STATE.NO_UNIT, rawValue: item.value, missing: ['该项的标示单位'] };
  }

  if (!basis) {
    return { ...base, state: READ_STATE.NO_BASIS, rawValue: item.value, missing: ['营养标示基准'] };
  }

  // ---- 单位统一 ----
  let value = null;
  let unitNote = null;

  if (key === 'energy') {
    if (item.unit === 'kJ') value = item.value;
    else if (item.unit === 'kcal') {
      value = item.value * KJ_PER_KCAL;
      unitNote = `${item.value} kcal 按 1 kcal = 4.184 kJ 换算`;
    } else {
      return { ...base, state: READ_STATE.BAD_UNIT, rawValue: item.value, missing: ['可用的能量单位（kJ / kcal）'] };
    }
  } else if (unit === 'mg') {
    const mg = massToMg(item.value, item.unit);
    if (mg === null) {
      return { ...base, state: READ_STATE.BAD_UNIT, rawValue: item.value, missing: [`可用的质量单位（g / mg / μg）`] };
    }
    value = mg;
    if (item.unit !== 'mg') unitNote = `${item.value} ${item.unit} 已换算为 ${roundTo(mg, 4)} mg`;
  } else {
    const f = MASS_FACTOR_TO_G[item.unit];
    if (f === undefined) {
      return { ...base, state: READ_STATE.BAD_UNIT, rawValue: item.value, missing: ['可用的质量单位（g / mg / μg）'] };
    }
    value = item.value * f;
    if (item.unit !== 'g') unitNote = `${item.value} ${item.unit} 已换算为 ${roundTo(value, 4)} g`;
  }

  // ---- 基准统一 ----
  let per100 = value;
  let basisNote = null;

  if (basis === 'per_serving') {
    const serving = ctx?.servingSize?.value;
    if (!Number.isFinite(serving) || serving <= 0 || !['g', 'mL'].includes(ctx?.servingSize?.unit)) {
      return {
        ...base,
        state: READ_STATE.NO_SERVING_SIZE,
        rawValue: item.value,
        missing: ['每份食品的克重或体积及单位（仅支持 g / mL，用于换算到每 100）'],
      };
    }
    // 判定前不修约，否则边界外的数值可能被四舍五入进条件内。
    per100 = (value / serving) * 100;
    if (!Number.isFinite(per100)) {
      return {
        ...base,
        state: READ_STATE.NO_SERVING_SIZE,
        rawValue: item.value,
        missing: ['每份食品的克重或体积'],
      };
    }
    basisNote = `标签按每份标示，已用每份 ${serving} ${ctx?.servingSize?.unit || 'g'} 换算到每 100`;
  } else if (basis !== 'per_100g' && basis !== 'per_100ml') {
    return { ...base, state: READ_STATE.NO_BASIS, rawValue: item.value, missing: ['营养标示基准'] };
  }

  if (!Number.isFinite(per100)) {
    return { ...base, state: READ_STATE.UNREADABLE, missing: ['有限且可换算的营养数值'] };
  }
  const form = base.form;
  const warnings = [];
  const normalizedBasis = basis === 'per_serving'
    ? (ctx.servingSize.unit === 'mL' ? 'per_100ml' : 'per_100g') : basis;
  if (form === 'liquid' && normalizedBasis === 'per_100g') {
    warnings.push('这款食品按液体对待，但标签用「每 100 g」标示；与每 100 mL 的界限比较时，两者只有在密度接近 1 时才基本等价。');
  }
  if (form === 'solid' && normalizedBasis === 'per_100ml') {
    warnings.push('这款食品按固体对待，但标签用「每 100 mL」标示；与每 100 g 的界限比较时并不严格等价。');
  }

  return {
    ...base,
    state: READ_STATE.OK,
    value: per100,
    normalizedBasis,
    formBasisCompatible: !((form === 'liquid' && normalizedBasis === 'per_100g') ||
      (form === 'solid' && normalizedBasis === 'per_100ml')),
    rawValue: item.value,
    note: [unitNote, basisNote].filter(Boolean).join('；') || null,
    warnings,
  };
}

/** 每条声称卡片都要显示的「计量口径」 */
export function basisSentence(ctx) {
  const form = ctx?.physicalForm;
  const basis = ctx?.basis;
  if (!basis) return '计量口径未确认';
  if (basis === 'per_serving') {
    const s = ctx?.servingSize?.value;
    return s
      ? `标签按每份（${s} ${ctx?.servingSize?.unit || 'g'}）标示，判定前换算到每 100`
      : '标签按每份标示，但每份克重未知，无法换算到每 100';
  }
  return `${formLabel(form)} · 每 100 ${basis === 'per_100ml' ? 'mL' : 'g'}`;
}

/** 把「每 100」的数值换算成「每 420 kJ」 */
export function per420kJ(valuePer100, energyKJPer100) {
  if (!Number.isFinite(valuePer100) || !Number.isFinite(energyKJPer100) || energyKJPer100 <= 0) {
    return null;
  }
  const converted = (valuePer100 * 420) / energyKJPer100;
  return Number.isFinite(converted) ? converted : null;
}

/** 判定输出的分母单位；每份液体不能被写成每 100 g。 */
export function per100Unit(ctx) {
  return ctx?.basis === 'per_100ml' || (ctx?.basis === 'per_serving' && ctx?.servingSize?.unit === 'mL') ? 'mL' : 'g';
}

export function fmt(value, unit, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const v = roundTo(value, digits);
  return `${v} ${unit}`;
}
