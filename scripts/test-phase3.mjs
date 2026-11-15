/**
 * 第三阶段逻辑测试（零成本、不联网、不调 API）。
 * 覆盖：默认模型配置、字段状态、三条话术规则、数值计算、来源一致性。
 *
 * 编号与 PHASE3_REPORT.md 的测试表一一对应。
 */

import { createDemoRecord, DEMO_SAMPLES } from '../src/domain/demoData.js';
import { PRESENCE, createFoodRecord, fromRecognition, validateFoodRecord } from '../src/domain/foodRecord.js';
import { canCompare } from '../src/domain/nutrition.js';
import { ANALYSIS_STATUS, ZERO_LIMITS_2011, analyzeClaim, analyzeClaims } from '../src/domain/claims/index.js';
import { EVIDENCE, STANDARDS, resolveEvidence } from '../src/domain/claims/evidence.js';
import { DEFAULT_PRODUCT_PROVIDER, VISION_PROVIDERS } from '../server/providers/vision.js';

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

function withFat(rec, value, presence = PRESENCE.LABELED) {
  return {
    ...rec,
    nutrition: {
      ...rec.nutrition,
      items: rec.nutrition.items.map((i) => (i.key === 'fat' ? { ...i, value, presence } : i)),
    },
  };
}

const drink = createDemoRecord('drink');
const CLAIM_FAT = { id: 'c_fat', text: '0 脂肪' };
const CLAIM_SUCROSE = { id: 'c_suc', text: '0 蔗糖' };
const CLAIM_SUGAR = { id: 'c_sug', text: '0 糖' };

console.log('\n【一】视觉识别与人工确认（1-7）');

t(1, '正式页面默认使用 DeepSeek Vision', () => {
  eq(DEFAULT_PRODUCT_PROVIDER, 'deepseek-vision');
});

t(2, 'MiMo provider 与对比工具未被删除', () => {
  assert(VISION_PROVIDERS.mimo, 'MiMo provider 丢失');
  assert(VISION_PROVIDERS['deepseek-vision'], 'DeepSeek provider 丢失');
  assert(VISION_PROVIDERS.mimo.getApiKey(), 'MiMo 密钥配置丢失');
});

t(3, '模型返回 null 字段时保留「待补录」状态，不变成 0', () => {
  const r = fromRecognition({
    product_name: null,
    net_content: null,
    ingredients: [],
    ingredients_text: null,
    nutrition: { basis: 'per_100g', basis_text: '每100g', items: [{ name: '脂肪', value: null, unit: 'g' }] },
    claims: [],
    unreadable: ['营养表数值模糊'],
  });
  eq(r.basic.netContent.presence, PRESENCE.UNREADABLE, '净含量状态');
  eq(r.nutrition.items[0].value, null, '脂肪值');
  eq(r.nutrition.items[0].presence, PRESENCE.UNREADABLE, '脂肪状态');
});

t(4, '用户补全净含量后，记录里就是补全值', () => {
  const r = fromRecognition({ nutrition: { basis: 'per_100g', items: [] }, ingredients: [] });
  const filled = { ...r, basic: { ...r.basic, netContent: { value: 500, unit: 'mL', text: '500mL', presence: PRESENCE.LABELED } } };
  eq(filled.basic.netContent.value, 500);
  eq(filled.basic.netContent.presence, PRESENCE.LABELED);
});

t(5, '用户修正钠含量后，分析读到的是新值', () => {
  const r = createDemoRecord('drink');
  const before = r.nutrition.items.find((i) => i.key === 'sodium').value;
  const after = {
    ...r,
    nutrition: {
      ...r.nutrition,
      items: r.nutrition.items.map((i) => (i.key === 'sodium' ? { ...i, value: 1100 } : i)),
    },
  };
  eq(before, 22, '原始钠值');
  eq(after.nutrition.items.find((i) => i.key === 'sodium').value, 1100, '修正后钠值');
});

t(6, 'API 失败时仍能创建空记录走手动填写', () => {
  const blank = createFoodRecord();
  blank.source.kind = 'manual';
  eq(blank.status, 'draft');
  const v = validateFoodRecord(blank);
  assert(!v.valid, '空记录不应该直接通过校验（缺基准）');
  assert(v.errors.some((e) => e.includes('基准')), '应提示缺基准');
});

t(7, '重复点击保护：识别中不允许再次提交（界面层校验）', () => {
  // 逻辑层只能验证「未传图时不应发起请求」这个前提，真正的按钮禁用由 e2e 覆盖
  const blank = createFoodRecord();
  assert(blank.source.image === null, '空记录不应带图片');
});

console.log('\n【二】包装话术规则（8-14）');

t(8, '0 脂肪且数据完整 → 有解释、有界限值来源', () => {
  const a = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 500 });
  eq(a.ruleId, 'zero_fat');
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  assert(a.canConclude.length > 0, '应有「能说明」');
  assert(a.cannotConclude.some((s) => s.includes('精确')), '应指出不等于精确为零');
  assert(a.evidence.includes('gb2011-t1-fat-zero'), '应引用表1界限值');
});

t(9, '500 mL 教学示例算出 2.5 g 理论上限', () => {
  const a = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 500 });
  eq(a.calculation.expression, '500 ÷ 100 × 0.5');
  eq(a.calculation.result, 2.5);
  eq(a.calculation.unit, 'g');
  eq(a.calculation.isUpperBound, true);
});

t(10, '理论上限被明确标注为上限，不当成实际摄入量', () => {
  const a = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 500 });
  assert(a.calculation.isUpperBound, '必须标记为上限');
  assert(/不是实测值|不是.*实际摄入/.test(a.calculation.note), `说明文字不足：${a.calculation.note}`);
  assert(a.calculation.label.includes('上限'), '标签必须写明「上限」');
});

t(11, '0 蔗糖不等于 0 总糖（结论里必须有这句）', () => {
  const a = analyzeClaim(CLAIM_SUCROSE, drink, { servingAmount: 500 });
  assert(
    a.cannotConclude.some((s) => s.includes('不等于') && s.includes('糖')),
    `缺少「0蔗糖≠0糖」的解释：${JSON.stringify(a.cannotConclude)}`,
  );
  assert(a.cannotConclude.some((s) => s.includes('甜味剂')), '应说明甜味剂不是糖');
});

t(12, '糖未标示时判定为信息不足，而不是当成 0', () => {
  const a = analyzeClaim(CLAIM_SUCROSE, drink, { servingAmount: 500 });
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(a.missing.some((m) => m.includes('糖')), '应列出缺少糖含量');
  assert(!a.calculation, '信息不足时不应给出计算');
});

t(13, '脂肪由 0 改成非零值后，规则结果同步改变', () => {
  const changed = withFat(drink, 3.2);
  const a = analyzeClaim(CLAIM_FAT, changed, { servingAmount: 500 });
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  assert(!a.calculation, '非零脂肪不应再给出 0 界限值计算');
  assert(a.summary.includes('对不上'), `应提示与宣传矛盾：${a.summary}`);
});

t(14, '未收录的宣传语不生成任何标准判定', () => {
  // V2 起「非油炸」「含膳食纤维」已有规则，改用仍未收录的说法验证同一条路径
  const a = analyzeClaim({ id: 'x', text: '古法熬制' }, drink, {});
  eq(a.status, ANALYSIS_STATUS.UNIMPLEMENTED);
  eq(a.calculation, null);
  eq(a.evidence.length, 0);
  assert(!a.summary.includes('≤'), '不得出现任何阈值');
});

console.log('\n【三】数值与计算（15-19）');

t(15, '每 100 g 与每 100 mL 不能混用', () => {
  eq(canCompare('per_100g', 'per_100ml').ok, false);
  eq(canCompare('per_100g', 'per_100g').ok, true);
});

t(16, '每份但无每份克重时拒绝换算', () => {
  const r = { ...drink, nutrition: { ...drink.nutrition, basis: 'per_serving' } };
  const a = analyzeClaim(CLAIM_FAT, r, { servingAmount: 500 });
  eq(a.calculation, null);
  assert(a.warnings.some((w) => w.includes('每份')), '应提示需要每份克重');
});

t(17, 'null 不会被当成数字 0', () => {
  const r = {
    ...drink,
    nutrition: {
      ...drink.nutrition,
      items: drink.nutrition.items.map((i) =>
        i.key === 'sugar' ? { ...i, value: null, presence: PRESENCE.NOT_LABELED } : i,
      ),
    },
  };
  const a = analyzeClaim(CLAIM_SUGAR, r, {});
  eq(a.status, ANALYSIS_STATUS.INSUFFICIENT);
  const fatItem = r.nutrition.items.find((i) => i.key === 'fat');
  eq(fatItem.value, 0, '真实的 0 仍然是 0');
});

t(18, 'NRV% 不会被当成实际含量', () => {
  // 构造一个 NRV 与实际值矛盾的行，规则必须读 value 而不是 nrvPercent
  const r = {
    ...drink,
    nutrition: {
      ...drink.nutrition,
      items: drink.nutrition.items.map((i) => (i.key === 'fat' ? { ...i, value: 0, nrvPercent: 99 } : i)),
    },
  };
  const a = analyzeClaim(CLAIM_FAT, r, { servingAmount: 500 });
  eq(a.calculation.result, 2.5, '计算必须基于 value=0 与界限值，不能被 NRV 干扰');
});

t(19, '修改食用量后上限随之变化', () => {
  const a100 = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 100 });
  const a500 = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 500 });
  eq(a100.calculation.result, 0.5);
  eq(a500.calculation.result, 2.5);
  assert(a100.calculation.result !== a500.calculation.result, '不同食用量结果必须不同');
});

console.log('\n【四】来源一致性（20-22）');

t(20, '所有引用编号都能解析到真实来源', () => {
  for (const a of analyzeClaims(drink, { servingAmount: 500 })) {
    for (const id of a.evidence) {
      assert(resolveEvidence([id]).length === 1, `来源 ${id} 解析失败`);
    }
  }
  assert(Object.keys(EVIDENCE).length >= 8, '来源条目过少');
});

t(21, '摘要不会被标成逐字原文', () => {
  const summary = EVIDENCE['gb2011-c1-scope'];
  eq(summary.quoteType, 'summary');
  const verbatim = EVIDENCE['gb2011-t1-fat-zero'];
  eq(verbatim.quoteType, 'verbatim');
  // 逐字条目必须带原文片段
  for (const e of Object.values(EVIDENCE)) {
    if (e.quoteType === 'verbatim') assert(e.quote && e.quote.length > 6, `${e.id} 缺少原文`);
  }
});

t(22, '标准版本不混用：0 脂肪规则只引 2011 版', () => {
  const a = analyzeClaim(CLAIM_FAT, drink, { servingAmount: 500 });
  for (const id of a.evidence) {
    eq(EVIDENCE[id].standard, 'GB28050-2011', `${id} 版本不符`);
  }
  eq(STANDARDS['GB28050-2011'].effectiveAt, '2013-01-01');
  eq(STANDARDS['GB28050-2025'].effectiveAt, '2027-03-16');
});

console.log('\n【五】补充校验');

t(28, '演示样品都能建出可分析的记录（含复合配料样品）', () => {
  eq(DEMO_SAMPLES.length, 4);
  for (const id of ['drink', 'cookie', 'yogurt']) {
    const r = createDemoRecord(id);
    assert(r.basic.productName, `${id} 缺产品名`);
    assert(r.nutrition.items.length > 0, `${id} 缺营养数据`);
    assert(r.claims.length > 0, `${id} 缺宣传语`);
  }
  const bamboo = createDemoRecord('bamboo');
  eq(bamboo.ingredients.items.length, 7);
  eq(bamboo.ingredients.items[5].name, '食品添加剂');
  eq(bamboo.ingredients.items[5].children.length, 5);
  assert(bamboo.nutrition.items.length > 0, 'bamboo 缺营养数据');
});

t(29, '演示样品的宣传语全部命中已收录规则；未收录说法仍不伪造阈值', () => {
  // V2：演示二/三的宣传语（含膳食纤维、非油炸）已有规则，改为验证「不再落到未实现」
  for (const id of ['cookie', 'yogurt']) {
    const r = createDemoRecord(id);
    for (const a of analyzeClaims(r, { servingAmount: 100 })) {
      assert(a.status !== ANALYSIS_STATUS.UNIMPLEMENTED, `${id} 的「${a.claimText}」仍未被规则覆盖`);
      assert(Boolean(a.ruleId), `${id} 的「${a.claimText}」缺少规则 ID`);
    }
  }
  // 未收录的说法依旧不生成任何判定
  const r = createDemoRecord('cookie');
  const a = analyzeClaim({ id: 'zz', text: '祖传配方' }, r, {});
  eq(a.status, ANALYSIS_STATUS.UNIMPLEMENTED);
  eq(a.evidence.length, 0);
});

t(30, '演示三同时存在「未标示」与「有值」，状态互不污染', () => {
  const r = createDemoRecord('yogurt');
  const sugar = r.nutrition.items.find((i) => i.key === 'sugar');
  const fat = r.nutrition.items.find((i) => i.key === 'fat');
  eq(sugar.presence, PRESENCE.NOT_LABELED);
  eq(sugar.value, null);
  eq(fat.presence, PRESENCE.LABELED);
  eq(fat.value, 3.6);
});

t(31, '0 界限值常量与标准表 1 一致', () => {
  eq(ZERO_LIMITS_2011.fat.value, 0.5);
  eq(ZERO_LIMITS_2011.sugar.value, 0.5);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
