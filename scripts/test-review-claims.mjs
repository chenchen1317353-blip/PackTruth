/** Independent review regressions. Offline only; optional argv[2] selects a source backup. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] || '.');
const mod = (file) => import(pathToFileURL(path.join(root, file)).href);
const { fromRecognition, guessNutrientKey, validateFoodRecord } = await mod('src/domain/foodRecord.js');
const { analyzeClaim, matchRule, REGISTERED_RULE_COUNT } = await mod('src/domain/claims/index.js');
const { EVIDENCE } = await mod('src/domain/claims/evidence.js');
const { per420kJ } = await mod('src/domain/claims/nutritionFacts.js');
const { CLAIM_PRESETS } = await mod('src/domain/demoData.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } }
function rec(items, basis = 'per_100g', form) {
  const r = fromRecognition({ nutrition: { basis, items }, ingredients: ['三氯蔗糖'] });
  if (form !== undefined) r.basic.physicalForm = form;
  return r;
}
const n = (name, value, unit = 'g') => ({ name, value, unit });
const analyze = (text, r, opts) => analyzeClaim({ text, source: 'manual' }, r, opts);
const textOf = (a) => JSON.stringify([a.takeaway, a.summary, a.canConclude, a.warnings]);

test('single sugars and sugar alcohols never become total sugar', () => {
  for (const name of ['蔗糖', '乳糖', '赤藓糖醇', '糖醇', '低聚果糖', '葡萄糖', '糖（乳糖）']) {
    assert.notEqual(guessNutrientKey(name), 'sugar', name);
    assert.equal(analyze('无糖', rec([n(name, 0)])).verdict, 'unknown', name);
  }
  for (const name of ['糖', '总糖', '—糖', '糖（g）']) assert.equal(guessNutrientKey(name), 'sugar');
});
test('unrecognized and negated phrases are not substring claims', () => {
  for (const phrase of ['不含钙', '不是低脂', '10糖', '10脂肪', '不添加糖精', '零添加咖啡因', '非高蛋白', '低糖醇']) {
    assert.equal(matchRule(phrase), null, phrase);
  }
});
test('all 30 rules and existing preset aliases survive strict matching', () => {
  assert.equal(REGISTERED_RULE_COUNT, 30);
  for (const item of CLAIM_PRESETS) assert.ok(matchRule(item.text), item.text);
  for (const name of ['低脂肪', '高蛋白质', '零反式脂肪酸', '无糖', '0 脂肪']) assert.ok(matchRule(name), name);
});
test('inequality sugar is never promoted to exact zero', () => {
  assert.equal(analyze('无糖', rec([n('糖', '>0')])).verdict, 'unknown');
});
test('inequality fat is not a false mismatch', () => {
  const a = analyze('低脂', rec([n('脂肪', '≤5')]));
  assert.equal(a.verdict, 'unknown'); assert.ok(/界限|精确/.test(textOf(a)));
});
test('approximate quantities cannot cross a precise threshold', () => {
  for (const input of ['约3', '~3']) assert.equal(analyze('低脂', rec([n('脂肪', input)])).verdict, 'unknown');
});
test('zero claims require a known mass unit', () => {
  for (const [name, claim] of [['脂肪', '0脂肪'], ['糖', '0糖']]) {
    for (const unit of [null, 'kJ']) assert.equal(analyze(claim, rec([n(name, 0, unit)])).verdict, 'unknown');
  }
});
test('negative or non-finite values cannot support claims', () => {
  for (const value of [-1, NaN, Infinity]) {
    const r = rec([n('脂肪', 0)]); r.nutrition.items[0].value = value;
    assert.equal(analyze('低脂', r).verdict, 'unknown');
    assert.equal(analyze('0脂肪', r).verdict, 'unknown');
    assert.equal(validateFoodRecord(r).valid, false);
  }
});
test('liquid mass basis cannot use a volume threshold without density', () => {
  const a = analyze('低脂', rec([n('脂肪', 1.4)], 'per_100g', 'liquid'));
  assert.equal(a.verdict, 'unknown'); assert.ok(a.warnings.some((s) => s.includes('每 100 g')));
});
test('solid volume basis also remains uncertain', () => {
  assert.equal(analyze('低糖', rec([n('糖', 4)], 'per_100ml', 'solid')).verdict, 'unknown');
});
test('energy pathway remains usable with a mass/volume mismatch', () => {
  const a = analyze('高蛋白', rec([n('蛋白质', 10), n('能量', 420, 'kJ')], 'per_100g', 'liquid'));
  assert.equal(a.verdict, 'pass'); assert.equal(a.pathways.find((p) => p.id === 'per100').state, 'unknown');
  assert.equal(a.pathways.find((p) => p.id === 'per420').state, 'pass');
});
test('serving size requires a known unit rather than assuming grams', () => {
  for (const unit of [null, 'kg', '勺']) {
    const r = rec([n('脂肪', 1)], 'per_serving', 'solid'); r.nutrition.servingSize = { value: 100, unit };
    assert.equal(analyze('低脂', r).verdict, 'unknown', String(unit));
  }
});
test('liquid servings retain mL in result facts', () => {
  const r = rec([n('脂肪', 1)], 'per_serving', 'liquid'); r.nutrition.servingSize = { value: 200, unit: 'mL' };
  const a = analyze('低脂', r); assert.equal(a.verdict, 'pass');
  assert.ok(a.facts[0].value.includes('100 mL')); assert.ok(!a.facts[0].value.includes('100 g'));
});
test('unknown form cannot produce undefined thresholds or false mismatch', () => {
  const r = rec([n('糖', 4)], 'per_serving'); r.nutrition.servingSize = { value: 100, unit: 'g' };
  const a = analyze('低糖', r); assert.notEqual(a.verdict, 'mismatch');
  assert.ok(!textOf(a).includes('界限值 —'));
});
test('unknown form does not block independent 420kJ pathway', () => {
  const r = rec([n('蛋白质', 10), n('能量', 420, 'kJ')], 'per_serving'); r.nutrition.servingSize = { value: 100, unit: 'g' };
  const a = analyze('高蛋白', r); assert.equal(a.verdict, 'pass'); assert.ok(a.summary.includes('420 kJ'));
});
test('comparisons use unrounded values at per100 boundary', () => {
  assert.equal(analyze('低脂', rec([n('脂肪', 3.00001)])).verdict, 'mismatch');
  const r = rec([n('脂肪', 0.300001)], 'per_serving', 'solid'); r.nutrition.servingSize = { value: 10, unit: 'g' };
  assert.equal(analyze('低脂', r).verdict, 'mismatch');
});
test('comparisons use unrounded values at per420 boundary', () => {
  assert.equal(analyze('高蛋白', rec([n('蛋白质', 5.99999), n('能量', 420, 'kJ')])).verdict, 'mismatch');
});
test('sucralose never creates a sucrose ingredient conflict', () => {
  const a = analyze('0蔗糖', rec([]));
  assert.ok(!a.facts.some((f) => f.label.includes('与蔗糖相关')));
  assert.ok(!a.canConclude.some((s) => s.includes('含蔗糖的配料')));
});
test('manual zero-sucrose selection is not evidence of manufacturing or packaging', () => {
  for (const r of [rec([]), rec([n('糖', 2)])]) {
    const a = analyze('0蔗糖', r);
    assert.ok(!/说明未添加蔗糖|包装上使用了|而包装只说/.test(textOf(a)), textOf(a));
  }
});
test('zero-sucrose rule also rejects approximate and unitless sugar evidence', () => {
  for (const item of [n('糖', '>0'), n('糖', 0, null)]) assert.equal(analyze('0蔗糖', rec([item])).verdict, 'unknown');
});
test('sugar NRV explanation respects GB28050-2011 clause4.5', () => {
  assert.ok(/4\.5|未规定/.test(EVIDENCE['gb2011-4-2'].plain));
  assert.ok(!/糖、膳食纤维、钙.*应同时.*NRV/.test(EVIDENCE['gb2011-4-2'].plain));
  const a = analyze('低糖', rec([]));
  assert.ok(!a.warnings.some((s) => /糖的含量及 NRV/.test(s)));
});
test('nonzero values below zero-claim threshold do not contradict content condition', () => {
  for (const [name, claim] of [['糖', '无糖'], ['脂肪', '无脂肪']]) {
    const a = analyze(claim, rec([n(name, 0.4)]));
    assert.equal(a.verdict, 'pass'); assert.ok(!/对不上|矛盾/.test(a.summary));
  }
});
test('liquid zero-fat summary uses correct units and preserves theoretical bound', () => {
  const a = analyze('0脂肪', rec([n('脂肪', 0)], 'per_100ml'), { servingAmount: 500 });
  assert.ok(a.takeaway.includes('100 mL')); assert.equal(a.calculation.result, 2.5);
  assert.equal(a.calculation.isUpperBound, true); assert.ok(a.calculation.note.includes('不是实测'));
});
test('zero labels with unknown serving amount do not assert a calculated content', () => {
  const r = rec([n('脂肪', 0)], 'per_serving', 'solid');
  const a = analyze('0脂肪', r); assert.equal(a.verdict, 'unknown'); assert.equal(a.calculation, null);
});
test('reference comparison requires an explicit comparable basis', () => {
  const r = rec([n('糖', 6)]); r.referenceFood = { name: '参考', nutrients: { sugar: 10 } };
  assert.equal(analyze('减糖', r).verdict, 'unknown');
});
test('opposite change direction is not called a reduction', () => {
  const r = rec([n('糖', 12)]); r.referenceFood = { name: '参考', basis: 'per_100g', nutrients: { sugar: 10 } };
  const a = analyze('减糖', r); assert.ok(!/减少 20%/.test(a.summary)); assert.ok(a.summary.includes('增加'));
});
test('overflowed conversions never become confident verdicts or Infinity', () => {
  const r = rec([n('脂肪', 1)], 'per_serving', 'solid');
  r.nutrition.servingSize = { value: Number.MIN_VALUE, unit: 'g' };
  assert.equal(analyze('低脂', r).verdict, 'unknown');
  assert.equal(per420kJ(1, Number.MIN_VALUE), null);
  const high = rec([n('蛋白质', 1), n('能量', 1, 'kJ')]); high.nutrition.items[1].value = Number.MIN_VALUE;
  const a = analyze('高蛋白', high); assert.equal(a.verdict, 'unknown');
  assert.ok(!JSON.stringify(a).includes('Infinity'));
});
console.log(`REVIEW_CLAIMS ${passed} passed, ${failed} failed (${root})`);
process.exitCode = failed ? 1 : 0;
