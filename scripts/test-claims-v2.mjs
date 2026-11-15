/**
 * 包装宣传语拆解 V2 —— 纯函数测试（零成本、不联网、不调 API）。
 *
 * 覆盖四组：
 *   A. 数值声称的阈值、单位、形态与边界（1-11）
 *   B. 配料 / 工艺 / 营销类宣传语的「不能推出什么」（12-20）
 *   C. 数据正确性与多途径判定（21-28）
 *   D. 注册表自身的一致性（29-36）
 *
 * 编号与 CLAIMS_V2_REPORT.md 的测试表一一对应。
 */

import { createDemoRecord } from '../src/domain/demoData.js';
import { PRESENCE } from '../src/domain/foodRecord.js';
import { EVIDENCE, resolveEvidence } from '../src/domain/claims/evidence.js';
import {
  ANALYSIS_STATUS,
  REGISTERED_RULE_COUNT,
  analyzeClaim,
  analyzeClaims,
  matchRule,
} from '../src/domain/claims/index.js';
import { RULES } from '../src/domain/claims/registry.js';
import { LIMITS_2011, NRV_2011 } from '../src/domain/claims/thresholds.js';

let pass = 0;
let fail = 0;
const rows = [];

function t(id, name, fn) {
  try {
    fn();
    pass += 1;
    rows.push({ id, name, ok: true });
    console.log(`  ✓ [${String(id).padStart(2)}] ${name}`);
  } catch (e) {
    fail += 1;
    rows.push({ id, name, ok: false, error: e.message });
    console.log(`  ✗ [${String(id).padStart(2)}] ${name}\n         ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
  }
}

const nut = (key, name, value, unit, extra = {}) => ({
  id: `${key}_${value}`,
  key,
  name,
  value,
  unit,
  presence: PRESENCE.LABELED,
  ...extra,
});

/** 造一条已确认的记录 */
function rec({
  items = [],
  basis = 'per_100g',
  form = 'solid',
  ingredients = [],
  claims = [],
  servingSize = { value: null, unit: null },
  referenceFood = null,
} = {}) {
  return {
    status: 'confirmed',
    basic: { productName: '测试食品', physicalForm: form, netContent: { value: 100, unit: 'g' } },
    ingredients: {
      presence: PRESENCE.LABELED,
      items: ingredients.map((name, i) => ({ id: `i${i}`, order: i + 1, name, raw: name })),
    },
    nutrition: { basis, basisText: null, servingSize, items },
    claims,
    referenceFood,
  };
}

const claim = (text, id = 'c1') => ({ id, text, source: 'manual' });
const analyze = (text, record, options = {}) => analyzeClaim(claim(text), record, options);
const basisUnit = (record) => (record.nutrition.basis === 'per_100ml' ? 'mL' : 'g');

console.log('\n【A】数值声称：阈值、单位、形态与边界（1-11）');

t(1, '低脂肪：固体 ≤3 g/100 g、液体 ≤1.5 g/100 mL，不互相套用', () => {
  const solidPass = analyze('低脂', rec({ items: [nut('fat', '脂肪', 3, 'g')], form: 'solid' }));
  const solidFail = analyze('低脂', rec({ items: [nut('fat', '脂肪', 3.1, 'g')], form: 'solid' }));
  const liquidPass = analyze(
    '低脂',
    rec({ items: [nut('fat', '脂肪', 1.5, 'g')], basis: 'per_100ml', form: 'liquid' }),
  );
  const liquidFail = analyze(
    '低脂',
    rec({ items: [nut('fat', '脂肪', 1.6, 'g')], basis: 'per_100ml', form: 'liquid' }),
  );
  eq(solidPass.status, ANALYSIS_STATUS.SUPPORTED);
  eq(solidFail.flag, 'mismatch');
  eq(liquidPass.status, ANALYSIS_STATUS.SUPPORTED);
  eq(liquidFail.flag, 'mismatch');
  // 同一数值 3 g：固体满足，液体（按每 100 mL）不满足
  const threeLiquid = analyze(
    '低脂',
    rec({ items: [nut('fat', '脂肪', 3, 'g')], basis: 'per_100ml', form: 'liquid' }),
  );
  eq(threeLiquid.flag, 'mismatch', '3 g 在液体上应超过 1.5 g 的界限');
});

t(2, '低糖：5 g/100 mL 边界值（含等于）', () => {
  const at = analyze('低糖', rec({ items: [nut('sugar', '糖', 5, 'g')], basis: 'per_100ml', form: 'liquid' }));
  const over = analyze('低糖', rec({ items: [nut('sugar', '糖', 5.1, 'g')], basis: 'per_100ml', form: 'liquid' }));
  eq(at.status, ANALYSIS_STATUS.SUPPORTED, '等于 5 g 应满足（≤）');
  eq(over.flag, 'mismatch');
});

t(3, '低糖：只有碳水化合物、没有糖含量时结果未知', () => {
  const r = rec({ items: [nut('carbohydrate', '碳水化合物', 4.4, 'g')], basis: 'per_100ml', form: 'liquid' });
  const a = analyze('低糖', r);
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(a.missing.some((m) => m.includes('糖')), '应列出缺少糖数据');
  assert(
    a.cannotConclude.some((s) => s.includes('碳水化合物')),
    '应说明碳水化合物不能代替糖',
  );
  assert(!a.facts.some((f) => String(f.value).startsWith('0 ')), '不得把未知当成 0');
});

t(4, '低钠：以 mg 判定，g 单位先换算，不把 0.12 g 当成 0.12 mg', () => {
  const mgPass = analyze('低钠', rec({ items: [nut('sodium', '钠', 120, 'mg')], form: 'solid' }));
  const mgFail = analyze('低钠', rec({ items: [nut('sodium', '钠', 121, 'mg')], form: 'solid' }));
  const gPass = analyze('低钠', rec({ items: [nut('sodium', '钠', 0.12, 'g')], form: 'solid' }));
  eq(mgPass.status, ANALYSIS_STATUS.SUPPORTED);
  eq(mgFail.flag, 'mismatch');
  eq(gPass.status, ANALYSIS_STATUS.SUPPORTED, '0.12 g = 120 mg，应满足');
  assert(gPass.facts.some((f) => String(f.value).includes('120')), '事实里应出现换算后的 mg 数值');
});

t(5, '高蛋白：固体 20% NRV（12 g）、液体 10% NRV（6 g）', () => {
  eq(LIMITS_2011.protein_high.solid, 12);
  eq(LIMITS_2011.protein_high.liquid, 6);
  const solid = analyze('高蛋白', rec({ items: [nut('protein', '蛋白质', 12, 'g')], form: 'solid' }));
  const liquid = analyze(
    '高蛋白',
    rec({ items: [nut('protein', '蛋白质', 6, 'g')], basis: 'per_100ml', form: 'liquid' }),
  );
  eq(solid.status, ANALYSIS_STATUS.SUPPORTED);
  eq(liquid.status, ANALYSIS_STATUS.SUPPORTED);
  assert(solid.summary.includes(String(NRV_2011.protein)) || solid.facts.some((f) => String(f.value).includes('12')),
    '应能追到 12 g 这个界限');
});

t(6, '蛋白质来源与高蛋白阈值不同，不能共用一套条件', () => {
  eq(LIMITS_2011.protein_source.solid, 6);
  eq(LIMITS_2011.protein_high.solid, 12);
  // 能量给足，让「每 420 kJ」途径也能算出来，才能验证它同样不满足
  const r = rec({
    items: [nut('protein', '蛋白质', 6.5, 'g'), nut('energy', '能量', 2000, 'kJ')],
    form: 'solid',
  });
  const source = analyze('含蛋白质', r);
  const high = analyze('高蛋白', r);
  eq(source.status, ANALYSIS_STATUS.SUPPORTED, '6.5 g 应满足「来源」');
  eq(high.flag, 'mismatch', '6.5 g 不满足「高蛋白」');
});

t(7, '高膳食纤维与膳食纤维来源阈值不同', () => {
  eq(LIMITS_2011.fiber_source.solid, 3);
  eq(LIMITS_2011.fiber_high.solid, 6);
  const r = rec({
    items: [nut('dietary_fiber', '膳食纤维', 3.2, 'g'), nut('energy', '能量', 2000, 'kJ')],
    form: 'solid',
  });
  eq(analyze('含膳食纤维', r).status, ANALYSIS_STATUS.SUPPORTED);
  eq(analyze('高膳食纤维', r).flag, 'mismatch');
});

t(8, '高钙与含钙阈值不同（NRV 800 mg）', () => {
  eq(LIMITS_2011.calcium_source.solid, 120);
  eq(LIMITS_2011.calcium_high.solid, 240);
  const r = rec({
    items: [nut('other', '钙', 130, 'mg'), nut('energy', '能量', 2000, 'kJ')],
    form: 'solid',
  });
  eq(analyze('含钙', r).status, ANALYSIS_STATUS.SUPPORTED);
  eq(analyze('高钙', r).flag, 'mismatch');
  const high = rec({
    items: [nut('other', '钙', 240, 'mg'), nut('energy', '能量', 2000, 'kJ')],
    form: 'solid',
  });
  eq(analyze('高钙', high).status, ANALYSIS_STATUS.SUPPORTED);
});

t(9, '低热量：固体 ≤170 kJ、液体 ≤80 kJ，分别判断', () => {
  const s1 = analyze('低热量', rec({ items: [nut('energy', '能量', 170, 'kJ')], form: 'solid' }));
  const s2 = analyze('低热量', rec({ items: [nut('energy', '能量', 171, 'kJ')], form: 'solid' }));
  const l1 = analyze(
    '低热量',
    rec({ items: [nut('energy', '能量', 80, 'kJ')], basis: 'per_100ml', form: 'liquid' }),
  );
  const l2 = analyze(
    '低热量',
    rec({ items: [nut('energy', '能量', 81, 'kJ')], basis: 'per_100ml', form: 'liquid' }),
  );
  eq(s1.status, ANALYSIS_STATUS.SUPPORTED);
  eq(s2.flag, 'mismatch');
  eq(l1.status, ANALYSIS_STATUS.SUPPORTED);
  eq(l2.flag, 'mismatch');
});

t(10, '零热量：脂肪供能比的附加条件不能省略', () => {
  const onlyEnergy = analyze('零热量', rec({ items: [nut('energy', '能量', 10, 'kJ')], form: 'solid' }));
  eq(onlyEnergy.status, ANALYSIS_STATUS.INSUFFICIENT, '缺脂肪数据时应为「部分条件无法确认」');
  assert(onlyEnergy.summary.includes('部分条件'), `应提示部分条件：${onlyEnergy.summary}`);

  const ratioFail = analyze(
    '零热量',
    rec({ items: [nut('energy', '能量', 10, 'kJ'), nut('fat', '脂肪', 1, 'g')], form: 'solid' }),
  );
  eq(ratioFail.status, ANALYSIS_STATUS.INSUFFICIENT, '能量与脂肪不自洽时不做判定');
  assert(ratioFail.summary.includes('不自洽'), `应提示数据不自洽：${ratioFail.summary}`);

  const ok = analyze(
    '零热量',
    rec({ items: [nut('energy', '能量', 10, 'kJ'), nut('fat', '脂肪', 0, 'g')], form: 'solid' }),
  );
  eq(ok.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(ok.cannotConclude.some((s) => s.includes('绝对零')), '必须说明不等于绝对零能量');
});

t(11, '零反式脂肪酸：0 不等于绝对零，缺数据不认定', () => {
  const zero = analyze('0 反式脂肪', rec({ items: [nut('trans_fat', '反式脂肪', 0, 'g')], form: 'solid' }));
  eq(zero.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(zero.cannotConclude.some((s) => s.includes('绝对零')), '应说明不等于绝对零');
  assert(zero.evidence.includes('gb2011-c1-trans-fat'), '应引用表 C.1');

  const missing = analyze('0 反式脂肪', rec({ items: [] }));
  eq(missing.status, ANALYSIS_STATUS.INSUFFICIENT, '没有数据时不能认定为 0');

  const over = analyze('0 反式脂肪', rec({ items: [nut('trans_fat', '反式脂肪', 0.4, 'g')] }));
  eq(over.flag, 'mismatch');
});

console.log('\n【B】配料 / 工艺 / 营销：不能推出什么（12-20）');

t(12, '无添加糖 + 白砂糖：给出不一致疑点，同时保留「≠ 无糖」的科普', () => {
  const r = createDemoRecord('yogurt'); // 配料含白砂糖，糖未标示
  const a = analyze('无添加糖', r);
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  eq(a.verdict, 'mismatch');
  eq(a.flag, 'mismatch');
  assert(a.statusLabel.includes('不一致疑点'), `状态标签应写明不一致：${a.statusLabel}`);
  assert(
    a.cannotConclude.some((s) => s.includes('不添加糖') && s.includes('无糖')),
    '必须写明「不添加糖 ≠ 无糖」',
  );
  assert(a.facts.some((f) => String(f.value).includes('白砂糖')), '应提示配料中的白砂糖');
  assert(a.mismatchNote.includes('你选择了') && a.mismatchNote.includes('白砂糖'), '冲突说明必须点出选择与配料');
  assert(
    a.warnings.some((w) => w.includes('确实印在这款包装上')),
    '必须提示宣传语来源需要核对',
  );
  assert(!/违法|欺诈/.test(a.summary), '摘要里不得直接下违法结论');
});

t(13, '无防腐剂：没匹配到 ≠ 已证实', () => {
  const none = analyze('不添加防腐剂', rec({ ingredients: ['小麦粉', '水', '食用盐'] }));
  eq(none.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(
    none.summary.includes('不能证明') || none.summary.includes('不等于'),
    `应说明未匹配不等于没有：${none.summary}`,
  );
  assert(none.cannotConclude.some((s) => s.includes('违法')), '应明确不做违法判定');

  const hit = analyze('不添加防腐剂', rec({ ingredients: ['水', '山梨酸钾'] }));
  eq(hit.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(hit.facts.some((f) => String(f.value).includes('山梨酸钾')), '应列出匹配到的成分');
});

t(14, '非油炸不能直接推出低脂', () => {
  const r = rec({
    items: [nut('fat', '脂肪', 22, 'g'), nut('energy', '能量', 2100, 'kJ')],
    form: 'solid',
    ingredients: ['小麦粉', '植物油'],
  });
  const a = analyze('非油炸', r);
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(a.cannotConclude.some((s) => s.includes('低脂')), '必须写明非油炸 ≠ 低脂');
  assert(!/≤|≥|mg\/100/.test(a.summary), '工艺说明里不应出现营养阈值');
});

t(15, '100% 果汁不能直接推出零糖', () => {
  const r = rec({
    items: [nut('sugar', '糖', 10.5, 'g'), nut('carbohydrate', '碳水化合物', 11, 'g')],
    basis: 'per_100ml',
    form: 'liquid',
    ingredients: ['水', '浓缩苹果汁'],
  });
  const a = analyze('100% 果汁', r);
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(a.cannotConclude.some((s) => s.includes('0 糖')), '必须写明 ≠ 0 糖');
  assert(a.facts.some((f) => String(f.value).includes('10.5')), '应展示已确认的糖含量');
});

t(16, '减糖没有参照食品时不能自动计算减少比例', () => {
  const r = rec({ items: [nut('sugar', '糖', 6, 'g')], form: 'solid' });
  const a = analyze('减糖', r);
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  eq(a.calculation, null);
  assert(a.summary.includes('参考食品') || a.summary.includes('比较对象'), '应说明缺参照食品');
  // 有可核实参照食品时才允许确定性计算
  const withRef = analyze('减糖', rec({
    items: [nut('sugar', '糖', 6, 'g')],
    form: 'solid',
    referenceFood: { name: '原味款', basis: 'per_100g', nutrients: { sugar: 10 } },
  }));
  eq(withRef.calculation.result, 40);
  eq(withRef.status, ANALYSIS_STATUS.SUPPORTED);
});

t(17, '全麦：不能仅凭一个配料名称确定比例', () => {
  const r = rec({ items: [nut('dietary_fiber', '膳食纤维', 4, 'g')], ingredients: ['全麦粉', '小麦粉'] });
  const a = analyze('全麦', r);
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(a.cannotConclude.some((s) => s.includes('占比') || s.includes('比例')), '应说明无法确定比例');
  assert(a.warnings.some((w) => w.includes('阈值')), '应说明没有可套用的通用阈值');
});

t(18, '零添加：不把 2027 才实施的要求写成现行法律判断', () => {
  const a = analyze('零添加', rec({ items: [] }));
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  const text = a.facts.map((f) => `${f.label}${f.value}`).join(' ');
  assert(text.includes('2027-03-16'), '必须写明实施日期');
  assert(text.includes('现行'), '必须区分现行版本');
  assert(
    a.cannotConclude.some((s) => s.includes('违法')),
    '必须明确不能凭图认定违法',
  );
  assert(
    a.warnings.some((w) => w.includes('2027-03-16') && w.includes('生产日期')),
    '应提示按生产日期核对',
  );
});

t(19, '零蔗糖不会错误命中零糖规则', () => {
  eq(matchRule('0 蔗糖').id, 'zero_sucrose');
  eq(matchRule('0 糖').id, 'zero_sugar');
  eq(matchRule('无添加蔗糖').id, 'no_added_sucrose');
  const r = rec({ items: [nut('sugar', '糖', 8, 'g')] });
  const a = analyze('0 蔗糖', r);
  eq(a.ruleId, 'zero_sucrose');
  assert(a.cannotConclude.some((s) => s.includes('不等于')), '应保留 0 蔗糖 ≠ 0 糖');
});

t(20, '高蛋白不会命中较低的蛋白质来源规则', () => {
  eq(matchRule('高蛋白').id, 'protein_high');
  eq(matchRule('富含蛋白质').id, 'protein_high');
  eq(matchRule('含蛋白质').id, 'protein_source');
  eq(matchRule('蛋白质来源').id, 'protein_source');
  const r = rec({
    items: [nut('protein', '蛋白质', 7, 'g'), nut('energy', '能量', 2000, 'kJ')],
    form: 'solid',
  });
  eq(analyze('蛋白质来源', r).status, ANALYSIS_STATUS.SUPPORTED);
  eq(analyze('高蛋白', r).flag, 'mismatch');
});

console.log('\n【C】数据正确性与多途径判定（21-28）');

t(21, '每 100 g 与每 100 mL 不混用', () => {
  const solid = rec({ items: [nut('fat', '脂肪', 2, 'g')], basis: 'per_100g', form: 'solid' });
  const liquid = rec({ items: [nut('fat', '脂肪', 2, 'g')], basis: 'per_100ml', form: 'liquid' });
  eq(analyze('低脂', solid).status, ANALYSIS_STATUS.SUPPORTED);
  eq(analyze('低脂', liquid).flag, 'mismatch');
  // 形态与基准不一致时要给出提示，而不是静默比较
  const odd = rec({ items: [nut('fat', '脂肪', 2, 'g')], basis: 'per_100g', form: 'liquid' });
  assert(analyze('低脂', odd).warnings.some((w) => w.includes('每 100 g')), '应提示口径差异');
});

t(22, '每份克重未知时不编造换算', () => {
  const r = rec({
    items: [nut('protein', '蛋白质', 8, 'g')],
    basis: 'per_serving',
    form: 'solid',
    servingSize: { value: null, unit: null },
  });
  const a = analyze('高蛋白', r);
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(a.summary.includes('每份'), `应说明缺每份克重：${a.summary}`);
  eq(a.calculation, null);
});

t(23, '用户改动营养数值后规则重新分析', () => {
  const before = analyze('低糖', rec({ items: [nut('sugar', '糖', 4, 'g')] }));
  const after = analyze('低糖', rec({ items: [nut('sugar', '糖', 9, 'g')] }));
  eq(before.status, ANALYSIS_STATUS.SUPPORTED);
  eq(after.flag, 'mismatch');
});

t(24, '糖、钠、蛋白质数据未知时不当成 0', () => {
  const unknown = (key, name, unit, text) =>
    analyze(text, rec({ items: [{ id: key, key, name, value: null, unit, presence: PRESENCE.UNREADABLE }] }));
  for (const a of [
    unknown('sugar', '糖', 'g', '低糖'),
    unknown('sodium', '钠', 'mg', '低钠'),
    unknown('protein', '蛋白质', 'g', '高蛋白'),
  ]) {
    eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
    assert(!a.calculation, '未知时不得给出计算');
    assert(a.facts.every((f) => !String(f.value).startsWith('0 ')), '不得把未知写成 0');
  }
});

t(25, '选择食用量不会改变声称阈值判定', () => {
  const r = rec({ items: [nut('fat', '脂肪', 1.4, 'g')], basis: 'per_100ml', form: 'liquid' });
  const a1 = analyze('低脂', r, { servingAmount: 100 });
  const a2 = analyze('低脂', r, { servingAmount: 1000 });
  eq(a1.status, a2.status);
  eq(a1.verdict, a2.verdict);
  eq(a1.pathways[0].value, a2.pathways[0].value);
  // 0 脂肪的上限换算仍应随食用量变化（旧功能保留）
  const drink = createDemoRecord('drink');
  const z100 = analyze('0 脂肪', drink, { servingAmount: 100 });
  const z1000 = analyze('0 脂肪', drink, { servingAmount: 1000 });
  eq(z100.calculation.result, 0.5);
  eq(z1000.calculation.result, 5);
});

t(26, '未实现的判定途径不能造成虚假的「不符合」', () => {
  // 每 100 g 只有 6.1 g，低于 12 g；但每 420 kJ 达到 6.74 g，应判为满足
  const r = rec({
    items: [nut('protein', '蛋白质', 6.1, 'g'), nut('energy', '能量', 380, 'kJ')],
    form: 'solid',
  });
  const a = analyze('高蛋白', r);
  eq(a.status, ANALYSIS_STATUS.SUPPORTED);
  assert(a.summary.includes('420 kJ'), '应说明是通过哪条途径满足的');
  // 能量缺失时，不能因为 100 g 途径不满足就判「不符合」
  const noEnergy = analyze('高蛋白', rec({ items: [nut('protein', '蛋白质', 6.1, 'g')], form: 'solid' }));
  eq(noEnergy.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(noEnergy.warnings.some((w) => w.includes('多条')), '应说明多条途径不能只查一条');
});

t(27, '数据超出条件时提示核对，而非直接认定违法', () => {
  const a = analyze('低糖', rec({ items: [nut('sugar', '糖', 9, 'g')], form: 'solid' }));
  eq(a.flag, 'mismatch');
  assert(a.summary.includes('需要') , '应提示需要核对');
  assert(a.warnings.some((w) => w.includes('不等于商家违法')), '必须写明不等于违法');
  assert(!/违法|欺诈/.test(a.summary), '摘要里不得直接下违法结论');
});

t(28, '所有新规则引用的来源编号都真实存在', () => {
  const records = [
    rec({ items: [], ingredients: [] }),
    rec({ items: [nut('fat', '脂肪', 2, 'g')], ingredients: ['白砂糖'] }),
    createDemoRecord('cookie'),
    createDemoRecord('yogurt'),
  ];
  for (const rule of RULES) {
    for (const r of records) {
      const a = analyzeClaim(claim(rule.name), r, {});
      for (const id of a.evidence) {
        assert(Boolean(EVIDENCE[id]), `规则 ${rule.id} 引用了不存在的来源 ${id}`);
        eq(resolveEvidence([id]).length, 1);
      }
    }
  }
  assert(Object.keys(EVIDENCE).length >= 30, '来源条目数量异常');
});

console.log('\n【D】注册表与兼容性（29-36）');

t(29, '规则注册表无重复 ID，且每条都有名称与类型', () => {
  const ids = RULES.map((r) => r.id);
  eq(new Set(ids).size, ids.length, '规则 ID 不能重复');
  for (const r of RULES) {
    assert(r.name, `${r.id} 缺名称`);
    assert(r.claimType, `${r.id} 缺声称类型`);
    assert(typeof r.analyze === 'function', `${r.id} 缺判定函数`);
  }
  eq(REGISTERED_RULE_COUNT, RULES.length);
  assert(REGISTERED_RULE_COUNT >= 28, `收录数量过少：${REGISTERED_RULE_COUNT}`);
});

t(30, '易混说法全部指向正确规则', () => {
  const cases = {
    '零蔗糖': 'zero_sucrose',
    '不添加蔗糖': 'no_added_sucrose',
    '不添加糖': 'no_added_sugar',
    '0 糖': 'zero_sugar',
    '无防腐剂': 'no_preservative',
    '零添加': 'zero_additive',
    '低盐': 'low_sodium',
    '无盐': 'zero_sodium',
    '低脂': 'low_fat',
    '低饱和脂肪': null,
    '低乳糖': null,
    '0 反式脂肪': 'zero_trans_fat',
    '高钙': 'calcium_high',
    '含钙': 'calcium_source',
    '非油炸': 'non_fried',
    '纯天然': 'natural',
    '祖传秘制': null,
  };
  for (const [text, expect] of Object.entries(cases)) {
    const rule = matchRule(text);
    eq(rule?.id ?? null, expect, `「${text}」匹配错误`);
  }
});

t(31, '未收录说法不生成判定，也不借用别的来源', () => {
  const a = analyze('妈妈的味道', rec({ items: [nut('fat', '脂肪', 20, 'g')] }));
  eq(a.status, ANALYSIS_STATUS.UNIMPLEMENTED);
  eq(a.evidence.length, 0);
  eq(a.calculation, null);
  assert(!a.summary.includes('≤'), '不得出现阈值');
});

t(32, '原有 0 脂肪 / 0 蔗糖 / 0 糖 行为不退化', () => {
  const drink = createDemoRecord('drink');
  const list = analyzeClaims(drink, { servingAmount: 500 });
  const fat = list.find((x) => x.claimText === '0 脂肪');
  eq(fat.calculation.result, 2.5);
  eq(fat.calculation.expression, '500 ÷ 100 × 0.5');
  eq(list.find((x) => x.claimText === '0 蔗糖').status, ANALYSIS_STATUS.INSUFFICIENT);
  const sugar = analyze('0 糖', rec({ items: [nut('sugar', '糖', 0, 'g')] }), { servingAmount: 200 });
  eq(sugar.status, ANALYSIS_STATUS.EXPANDABLE);
  eq(sugar.calculation.result, 1);
});

t(33, '营销类规则不创造数值阈值', () => {
  const marketing = ['非油炸', '纯天然', '100% 果汁', '全麦', '零添加', '不添加防腐剂', '不添加色素', '无添加糖'];
  const r = rec({
    items: [nut('fat', '脂肪', 12, 'g'), nut('energy', '能量', 1500, 'kJ')],
    ingredients: ['小麦粉', '植物油', '全麦粉'],
  });
  for (const text of marketing) {
    const a = analyze(text, r);
    // 只检查结论性文字；canConclude 里展示的标签实测值不算「创造的阈值」
    const blob = [a.summary, ...a.cannotConclude].join(' ');
    assert(!/≤\s*\d|≥\s*\d|\d+\s*g\/100/.test(blob), `「${text}」不应出现数值阈值：${blob}`);
  }
});

t(34, 'kcal 能量先换算成 kJ 再判定', () => {
  const a = analyze('低热量', rec({ items: [nut('energy', '能量', 40, 'kcal')], basis: 'per_100ml', form: 'liquid' }));
  // 40 kcal = 167.36 kJ > 80 kJ
  eq(a.flag, 'mismatch');
  assert(a.facts.some((f) => String(f.value).includes('167')), '应出现换算后的 kJ');
});

t(35, '比较声称有参照食品时按 25% 门槛判定', () => {
  const pass20 = analyze('减脂', rec({
    items: [nut('fat', '脂肪', 8, 'g')],
    referenceFood: { name: '常规款', basis: 'per_100g', nutrients: { fat: 10 } },
  }));
  eq(pass20.calculation.result, 20);
  eq(pass20.flag, 'mismatch');
  const pass30 = analyze('减脂', rec({
    items: [nut('fat', '脂肪', 7, 'g')],
    referenceFood: { name: '常规款', basis: 'per_100g', nutrients: { fat: 10 } },
  }));
  eq(pass30.status, ANALYSIS_STATUS.SUPPORTED);
  // 基准不同的参照食品拒绝比较
  const incomparable = analyze('减脂', rec({
    items: [nut('fat', '脂肪', 7, 'g')],
    referenceFood: { name: '饮料', basis: 'per_100ml', nutrients: { fat: 10 } },
  }));
  eq(incomparable.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(incomparable.missing.some((m) => m.includes('基准')), '应提示基准不同');
});

t(36, '每条分析都带规则名、声称类型与计量口径', () => {
  const r = createDemoRecord('cookie');
  for (const a of analyzeClaims(r, { servingAmount: 100 })) {
    assert(a.ruleName, `${a.claimText} 缺规则名`);
    assert(a.claimTypeLabel, `${a.claimText} 缺声称类型`);
    assert(a.basisNote, `${a.claimText} 缺计量口径`);
    assert(a.ruleVersion, `${a.claimText} 缺标准版本`);
  }
});

t(37, '任何规则都不会把 undefined / NaN 拼进用户看到的文字', () => {
  const rich = rec({
    items: [
      nut('energy', '能量', 1500, 'kJ'),
      nut('protein', '蛋白质', 8, 'g'),
      nut('fat', '脂肪', 10, 'g'),
      nut('trans_fat', '反式脂肪', 0, 'g'),
      nut('carbohydrate', '碳水化合物', 60, 'g'),
      nut('sugar', '糖', 6, 'g'),
      nut('dietary_fiber', '膳食纤维', 5, 'g'),
      nut('sodium', '钠', 200, 'mg'),
      nut('other', '钙', 150, 'mg'),
    ],
    ingredients: ['小麦粉', '全麦粉', '白砂糖', '植物油', '山梨酸钾', '水'],
  });
  for (const rule of RULES) {
    const a = analyzeClaim(claim(rule.name), rich, { servingAmount: 100 });
    const blob = JSON.stringify({
      summary: a.summary,
      takeaway: a.takeaway,
      note: a.mismatchNote,
      standard: a.standardNote,
      can: a.canConclude,
      cannot: a.cannotConclude,
      facts: a.facts,
      warnings: a.warnings,
      calc: a.calculation,
    });
    assert(!/undefined|NaN/.test(blob), `规则 ${rule.id} 的输出里出现了 undefined / NaN：${blob.slice(0, 300)}`);
  }
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
