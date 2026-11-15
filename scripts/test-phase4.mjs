/**
 * 第四阶段逻辑测试（零成本、不联网）。
 * 覆盖：成分匹配、别名、防误匹配、分类、来源一致性、与 FoodRecord 的联动。
 * 编号与 PHASE4_REPORT.md 的测试表一一对应。
 */

import { createDemoRecord } from '../src/domain/demoData.js';
import { PRESENCE } from '../src/domain/foodRecord.js';
import { analyzeClaims } from '../src/domain/claims/index.js';
import {
  INGREDIENT_KNOWLEDGE,
  ALL_INGREDIENTS,
  analyzeIngredients,
  buildIngredientCard,
  knowledgeStats,
  matchIngredient,
  normalizeName,
} from '../src/domain/ingredients/index.js';
import { INGREDIENT_SOURCES, resolveSources } from '../src/domain/ingredients/sources.js';

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

function assert(c, m) {
  if (!c) throw new Error(m);
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}

console.log('\n【一】成分匹配与别名（1-5）');

t(1, '山梨酸钾匹配到正确条目', () => {
  const m = matchIngredient('山梨酸钾');
  eq(m.status, 'matched');
  eq(m.entry.id, 'potassium-sorbate');
  eq(m.entry.canonicalName, '山梨酸钾');
});

t(2, '山梨酸钾的合法别名可以匹配', () => {
  for (const alias of ['山梨酸', '山梨酸及其钾盐', 'E202', 'INS 202', '防腐剂（山梨酸钾）', '食品添加剂（山梨酸钾）']) {
    const m = matchIngredient(alias);
    eq(m.status, 'matched', `别名「${alias}」未匹配`);
    eq(m.entry.id, 'potassium-sorbate', `别名「${alias}」匹配错误`);
  }
});

t(3, '三氯蔗糖不会被错误匹配为蔗糖', () => {
  const suc = matchIngredient('三氯蔗糖');
  eq(suc.entry.id, 'sucralose');
  assert(!normalizeName(suc.entry.canonicalName).includes('蔗糖') || suc.entry.canonicalName === '三氯蔗糖', '标准名异常');

  // 「蔗糖」本身不在知识库，必须是 unknown，绝不能落到三氯蔗糖
  const sugar = matchIngredient('蔗糖');
  eq(sugar.status, 'unknown', '「蔗糖」被错误匹配了');
  assert(sugar.entry === null, '「蔗糖」不应命中任何条目');

  // V5.2 起白砂糖已被收录，但它是普通食品配料，不能与「蔗糖」混为一谈
  const white = matchIngredient('白砂糖');
  eq(white.entry.id, 'white-sugar', '白砂糖应命中自己的条目');
  eq(white.entry.categoryType, 'food_ingredient', '白砂糖是普通食品配料');
  // 「蔗糖素」是三氯蔗糖的别名，应命中三氯蔗糖而不是白砂糖
  eq(matchIngredient('蔗糖素').entry.id, 'sucralose');
});

t(4, '普通原料不会被统一分类为食品添加剂', () => {
  for (const name of ['麦芽糊精', '果葡糖浆', '浓缩乳清蛋白粉']) {
    const m = matchIngredient(name);
    eq(m.status, 'matched', `${name} 未匹配`);
    eq(m.entry.categoryType, 'food_ingredient', `${name} 被错误归类`);
  }
  // 至少有一个真正的添加剂，用来证明不是"全都当配料"
  eq(matchIngredient('柠檬酸').entry.categoryType, 'additive');
});

t(5, '未收录成分返回 unknown，不编造', () => {
  // V5.2 起「食用香精」已收录，这里改用仍未收录的品种
  for (const name of ['亚硝酸钠', '卡拉胶', '谷氨酸钠', '某种不存在的配料']) {
    const m = matchIngredient(name);
    eq(m.status, 'unknown', `${name} 不应匹配`);
    eq(m.entry, null);
    eq(buildIngredientCard(m), null, '未匹配时不应产出卡片');
  }
});

console.log('\n【二】与 FoodRecord 联动（6-7）');

t(6, '修改配料后，成分卡同步变化', () => {
  const r = createDemoRecord('drink');
  const before = analyzeIngredients(r);
  assert(before.items.some((x) => x.match.entry?.id === 'sucralose'), '初始应有三氯蔗糖');

  // 模拟用户在确认页把「三氯蔗糖」改成「柠檬酸」
  const edited = {
    ...r,
    ingredients: {
      ...r.ingredients,
      items: r.ingredients.items.map((i) => (i.name === '三氯蔗糖' ? { ...i, name: '柠檬酸' } : i)),
    },
  };
  const after = analyzeIngredients(edited);
  assert(!after.items.some((x) => x.match.entry?.id === 'sucralose'), '三氯蔗糖的卡片应消失');
  assert(after.items.some((x) => x.match.entry?.id === 'citric-acid'), '柠檬酸的卡片应出现');
});

t(7, '删除配料后，旧成分卡不再显示', () => {
  const r = createDemoRecord('drink');
  const before = analyzeIngredients(r).items.length;
  const removed = {
    ...r,
    ingredients: { ...r.ingredients, items: r.ingredients.items.filter((i) => i.name !== '赤藓糖醇') },
  };
  const after = analyzeIngredients(removed);
  eq(after.items.length, before - 1);
  assert(!after.items.some((x) => x.ingredient.name === '赤藓糖醇'), '已删除的配料仍在列表里');
});

t(8, '新增未收录配料进入 unknown 状态', () => {
  const r = createDemoRecord('drink');
  const added = {
    ...r,
    ingredients: {
      ...r.ingredients,
      items: [...r.ingredients.items, { id: 'x', order: 99, name: '某种新配料', raw: '某种新配料' }],
    },
  };
  const res = analyzeIngredients(added);
  const last = res.items[res.items.length - 1];
  eq(last.match.status, 'unknown');
});

console.log('\n【三】来源一致性（8-11）');

t(8.1, '所有引用编号都能解析到真实来源', () => {
  for (const entry of INGREDIENT_KNOWLEDGE) {
    for (const id of entry.sourceIds) {
      assert(resolveSources([id]).length === 1, `${entry.id} 引用了不存在的来源 ${id}`);
    }
  }
  assert(Object.keys(INGREDIENT_SOURCES).length >= 8, '来源条目过少');
});

t(9, '原文摘录与摘要的标记不会混淆', () => {
  for (const s of Object.values(INGREDIENT_SOURCES)) {
    assert(['verbatim', 'summary'].includes(s.quoteType), `${s.id} 缺少 quoteType`);
    if (s.quoteType === 'verbatim') {
      assert(s.quote && s.quote.length > 10, `${s.id} 标为逐字但引文过短`);
    }
  }
  // WHO 英文原文必须带译文标记，不能把中文直接当原文
  const who = INGREDIENT_SOURCES.K5;
  eq(who.quoteLang, 'en');
  assert(who.translation && who.translation.length > 10, 'WHO 条目缺少译文');
  assert(who.quote !== who.translation, '原文与译文不能相同');
});

t(10, '没有来源的健康结论不能伪装成循证结论', () => {
  for (const entry of INGREDIENT_KNOWLEDGE) {
    for (const m of entry.misconceptions || []) {
      assert(Array.isArray(m.sourceIds) && m.sourceIds.length > 0, `${entry.id} 有一条误解没有来源`);
      for (const id of m.sourceIds) {
        assert(INGREDIENT_SOURCES[id], `${entry.id} 的误解引用了不存在的来源 ${id}`);
      }
    }
    assert(entry.sourceIds.length > 0, `${entry.id} 整条没有来源`);
  }
});

t(11, '不出现默认的危险评分或风险等级', () => {
  const banned = ['riskScore', 'dangerLevel', 'riskLevel', 'safetyScore', '危险等级', '风险指数', '安全分'];
  const text = JSON.stringify(INGREDIENT_KNOWLEDGE);
  for (const b of banned) {
    assert(!text.includes(b), `知识库出现了被禁止的字段/文案：${b}`);
  }
  for (const entry of INGREDIENT_KNOWLEDGE) {
    assert(entry.categoryType !== 'hazard', '出现了危险分类');
  }
});

t(11.1, '分类依赖情境的成分为双身份（维生素E）', () => {
  const ve = INGREDIENT_KNOWLEDGE.find((e) => e.id === 'vitamin-e');
  assert(ve, '缺少维生素E 条目');
  assert(ve.categoryLabel.includes('营养强化剂'), '维生素E 应保留营养强化剂的第二种身份');
  eq(ve.verification, 'partial', '未核实 GB 14880 时应标 partial');
});

t(11.2, '知识库统计与条目数一致', () => {
  const s = knowledgeStats();
  eq(s.total, ALL_INGREDIENTS.length);
  eq(s.verified + s.partial + s.basics, s.total);
  assert(s.byType.additive >= 4, '添加剂条目过少');
  assert(s.byType.food_ingredient >= 2, '普通配料条目过少');
});

console.log('\n【四】回归：原有功能不受影响（12-14）');

t(12, '演示模式数据全部标记为虚构且无需网络', () => {
  for (const id of ['drink', 'cookie', 'yogurt']) {
    const r = createDemoRecord(id);
    eq(r.source.kind, 'demo');
    eq(r.source.provider, 'demo');
    assert(r.demoNote && r.demoNote.includes('虚构'), `${id} 缺少虚构声明`);
  }
});

t(13, '原有包装话术分析仍然正常', () => {
  const r = createDemoRecord('drink');
  const a = analyzeClaims(r, { servingAmount: 500 });
  const fat = a.find((x) => x.claimText === '0 脂肪');
  eq(fat.calculation.result, 2.5);
  const suc = a.find((x) => x.claimText === '0 蔗糖');
  eq(suc.status, 'insufficient');
});

t(14, '原有食用量换算仍然正常', () => {
  const r = createDemoRecord('drink');
  const a100 = analyzeClaims(r, { servingAmount: 100 }).find((x) => x.claimText === '0 脂肪');
  const a1000 = analyzeClaims(r, { servingAmount: 1000 }).find((x) => x.claimText === '0 脂肪');
  eq(a100.calculation.result, 0.5);
  eq(a1000.calculation.result, 5);
});

t(15, '三个演示样品的配料全部被知识库覆盖（V5.2 起不再有死路）', () => {
  for (const id of ['drink', 'cookie', 'yogurt']) {
    const r = createDemoRecord(id);
    const s = analyzeIngredients(r).summary;
    assert(s.matched >= 1, `${id} 没有任何配料命中知识库`);
    // V5.2：演示配料全部收录，点开不再出现「未收录」
    eq(s.total, s.matched, `${id} 仍有未收录配料：${s.unknown} 个`);
  }
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail) {
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
