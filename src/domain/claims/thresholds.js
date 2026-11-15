/**
 * 话术规则用到的数值常量。
 *
 * 这里只放「已核对原文」的数字，不放任何推断值：
 * - 声称阈值来自 GB 28050—2011 附录 C 表 C.1（2026-11-01 重新提取标准 PDF 核对）。
 * - NRV 来自 GB 28050—2011 附录 A 表 A.1。
 * - 能量换算系数来自 GB 28050—2025 第 2.3 条，只用于折算脂肪供能比，不参与声称阈值。
 *
 * 为什么把版本写进常量名：2011 与 2025 的数值目前在本项目覆盖范围内一致，
 * 但两版对「糖」的定义、强制标示项和限制性条件的归属并不完全相同。
 * 混用会在下次标准切换时变成静默错误，所以每个数字都带版本。
 */

/** GB 28050—2011 附录 A 表 A.1 的 NRV */
export const NRV_2011 = {
  protein: 60, // g
  dietary_fiber: 25, // g
  calcium: 800, // mg
  sodium: 2000, // mg
  energy: 8400, // kJ
};

/** 每 1 g 供能成分的能量（kJ）。来源：GB 28050—2025 第 2.3 条 */
export const ENERGY_KJ_PER_G = {
  protein: 17,
  fat: 37,
  carbohydrate: 17,
  dietary_fiber: 8,
};

/** 1 kcal = 4.184 kJ（单位换算常数，不是法规阈值） */
export const KJ_PER_KCAL = 4.184;

/** GB 28050—2011 表 1 的「0」界限值（每 100 g 或 100 mL） */
export const ZERO_LIMITS_2011 = {
  energy: { value: 17, unit: 'kJ', evidence: 'gb2011-c1-zero-energy' },
  protein: { value: 0.5, unit: 'g', evidence: null },
  fat: { value: 0.5, unit: 'g', evidence: 'gb2011-t1-fat-zero' },
  trans_fat: { value: 0.3, unit: 'g', evidence: 'gb2011-c1-trans-fat' },
  carbohydrate: { value: 0.5, unit: 'g', evidence: null },
  sugar: { value: 0.5, unit: 'g', evidence: 'gb2011-t1-sugar-zero' },
  dietary_fiber: { value: 0.5, unit: 'g', evidence: null },
  sodium: { value: 5, unit: 'mg', evidence: 'gb2011-c1-zero-sodium' },
};

/** 百分比 -> 绝对量，避免 0.075 * 800 这类浮点尾数 */
export function pctOfNrv(nrv, percent) {
  return (nrv * percent) / 100;
}

/**
 * 含量声称阈值（每 100 g / 100 mL）。
 * solid / liquid 分别对应表 C.1 的两列，不能互相套用。
 */
export const LIMITS_2011 = {
  low_fat: { solid: 3, liquid: 1.5, unit: 'g' },
  low_sugar: { solid: 5, liquid: 5, unit: 'g' },
  low_sodium: { solid: 120, liquid: 120, unit: 'mg' },
  zero_sodium: { solid: 5, liquid: 5, unit: 'mg' },
  low_energy: { solid: 170, liquid: 80, unit: 'kJ' },
  zero_energy: { solid: 17, liquid: 17, unit: 'kJ' },
  zero_trans_fat: { solid: 0.3, liquid: 0.3, unit: 'g' },
  protein_source: {
    solid: pctOfNrv(NRV_2011.protein, 10),
    liquid: pctOfNrv(NRV_2011.protein, 5),
    per420kJ: pctOfNrv(NRV_2011.protein, 5),
    unit: 'g',
  },
  protein_high: {
    solid: pctOfNrv(NRV_2011.protein, 20),
    liquid: pctOfNrv(NRV_2011.protein, 10),
    per420kJ: pctOfNrv(NRV_2011.protein, 10),
    unit: 'g',
  },
  fiber_source: { solid: 3, liquid: 1.5, per420kJ: 1.5, unit: 'g' },
  fiber_high: { solid: 6, liquid: 3, per420kJ: 3, unit: 'g' },
  calcium_source: {
    solid: pctOfNrv(NRV_2011.calcium, 15),
    liquid: pctOfNrv(NRV_2011.calcium, 7.5),
    per420kJ: pctOfNrv(NRV_2011.calcium, 5),
    unit: 'mg',
  },
  calcium_high: {
    solid: pctOfNrv(NRV_2011.calcium, 30),
    liquid: pctOfNrv(NRV_2011.calcium, 15),
    per420kJ: pctOfNrv(NRV_2011.calcium, 10),
    unit: 'mg',
  },
};

/** 比较声称的最小变化幅度（GB 28050—2011 表 C.3） */
export const COMPARISON_MIN_PERCENT_2011 = 25;

/** 每 420 kJ 的换算基准（表 C.1 的多条途径都用它） */
export const PER_420KJ = 420;

/** 单条声称的判定口径：低于/等于 or 高于/等于 */
export const OP = {
  LTE: 'lte',
  GTE: 'gte',
};

/** 每个项目的中文名，用于拼句子 */
export const NUTRIENT_TEXT = {
  fat: '脂肪',
  sugar: '糖',
  sodium: '钠',
  protein: '蛋白质',
  dietary_fiber: '膳食纤维',
  calcium: '钙',
  energy: '能量',
  trans_fat: '反式脂肪酸',
};
