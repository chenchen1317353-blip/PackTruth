/**
 * PackTruth V2.1 专项测试（零成本、不联网、不调 API）。
 *
 * 覆盖四组：
 *   A. 「不添加糖 / 蔗糖」与配料冲突、以及天然糖 / 糖醇 / 复合配料的误报边界（1-7）
 *   B. 非数值宣传语的标准标注与未来标准日期（8-11）
 *   C. 一句话结论、成分核心结论、科学检查边界（12-19）
 *   D. 原功能回归（20-26）
 */

import { createDemoRecord } from '../src/domain/demoData.js';
import { PRESENCE } from '../src/domain/foodRecord.js';
import {
  ANALYSIS_STATUS,
  analyzeClaim,
  matchRule,
} from '../src/domain/claims/index.js';
import { RULES } from '../src/domain/claims/registry.js';
import {
  classifySugarClue,
  isSucroseClue,
} from '../src/domain/claims/rules/marketingClaims.js';
import {
  buildIngredientCard,
  analyzeIngredients,
  matchIngredient,
} from '../src/domain/ingredients/index.js';
import { getDemoResearch } from '../src/domain/ingredients/researchDemo.js';
import {
  buildHealthView,
  buildIngredientCore,
  pickKeySentence,
  splitSentences,
} from '../src/app/ingredientView.js';
import { DEFAULT_PRODUCT_PROVIDER } from '../server/providers/vision.js';

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

function rec({ items = [], ingredients = [], form = 'solid', basis = 'per_100g' } = {}) {
  return {
    status: 'confirmed',
    basic: { productName: '测试食品', physicalForm: form, netContent: { value: 100, unit: 'g' } },
    ingredients: {
      presence: PRESENCE.LABELED,
      items: ingredients.map((name, i) => ({ id: `i${i}`, order: i + 1, name, raw: name })),
    },
    nutrition: { basis, basisText: null, servingSize: { value: null, unit: null }, items },
    claims: [],
  };
}

const analyze = (text, record) => analyzeClaim({ id: 'c1', text }, record, {});
const claimText = (record, index = 0) => record.claims?.[index]?.text;

console.log('\n【A】「不添加糖 / 蔗糖」与配料冲突（1-7）');

t(1, '无添加糖 + 白砂糖 → 不一致疑点，并给出具体核对说明', () => {
  const r = rec({ ingredients: ['生牛乳', '白砂糖', '乳酸菌'] });
  const a = analyze('无添加糖', r);
  eq(a.status, ANALYSIS_STATUS.EXPANDABLE);
  eq(a.flag, 'mismatch');
  eq(a.verdict, 'mismatch');
  assert(a.statusLabel.includes('不一致疑点'), `状态标签：${a.statusLabel}`);
  assert(a.takeaway.includes('白砂糖'), `结论句应点名配料：${a.takeaway}`);
  assert(a.mismatchNote.includes('你选择了「无添加糖」'), '说明应点出用户选择的说法');
  assert(a.mismatchNote.includes('配料表中出现了「白砂糖」'), '说明应点出配料');
  assert(a.mismatchNote.includes('确实印在这款包装上'), '必须提示核对宣传语来源');
  assert(a.mismatchNote.includes('配料识别是否准确'), '必须提示核对识别结果');
  assert(a.cannotConclude.some((s) => s.includes('违法')), '必须保留「不认定违法」的边界');
  assert(!/违法|欺诈/.test(a.summary), '摘要不得直接下违法结论');
});

t(2, '无添加糖 + 天然含糖原料 → 不触发添加糖冲突', () => {
  const r = rec({ ingredients: ['生牛乳', '苹果', '草莓'] });
  const a = analyze('无添加糖', r);
  eq(a.flag, null);
  eq(a.verdict, 'explainer');
  assert(a.takeaway.includes('不等于成品无糖'), `结论应回到字面含义：${a.takeaway}`);
  assert(!a.facts.some((f) => f.label.includes('添加糖线索')), '不应出现添加糖线索');
});

t(3, '无添加糖 + 糖醇 / 低聚糖 / 甜味剂 → 不因名字含「糖」误报', () => {
  const r = rec({
    ingredients: ['水', '赤藓糖醇', '低聚果糖', '三氯蔗糖', '葡萄糖酸钠', '蔗糖脂肪酸酯'],
  });
  const a = analyze('无添加糖', r);
  eq(a.flag, null);
  assert(a.status === ANALYSIS_STATUS.EXPANDABLE);
  const fact = a.facts.find((f) => f.label.includes('名字含「糖」'));
  assert(fact, '应把「名字含糖但不是糖」的配料单独列出');
  for (const name of ['赤藓糖醇', '低聚果糖', '三氯蔗糖', '葡萄糖酸钠', '蔗糖脂肪酸酯']) {
    assert(fact.value.includes(name), `${name} 应出现在非糖说明里`);
  }
  for (const c of ['赤藓糖醇', '低聚果糖', '三氯蔗糖', '葡萄糖酸钠', '蔗糖脂肪酸酯']) {
    eq(classifySugarClue(c).kind !== 'added_sugar', true, `${c} 不应被当成添加糖`);
  }
});

t(4, '无添加糖 + 复合配料内的糖 → 保留不确定性，不判冲突', () => {
  const r = rec({ ingredients: ['小麦粉', '复合调味料（白砂糖）'] });
  const a = analyze('无添加糖', r);
  eq(a.flag, null);
  eq(a.verdict, 'explainer');
  assert(a.takeaway.includes('进一步核实'), `应提示核实：${a.takeaway}`);
  assert(
    a.facts.some((f) => f.label.includes('需要核实') && String(f.value).includes('复合')),
    '应把复合配料线索单列',
  );
  assert(a.cannotConclude.some((s) => s.includes('加入方式')), '应说明看不出加入方式');
});

t(5, '宣传语可能来自手动输入 → 冲突卡也提示核对来源', () => {
  const a = analyze('无添加糖', rec({ ingredients: ['白砂糖'] }));
  assert(
    a.warnings.some((w) => w.includes('手动选择或输入') && w.includes('确实印在这款包装上')),
    `缺少来源提示：${JSON.stringify(a.warnings)}`,
  );
  assert(a.missing.some((m) => m.includes('确实印在这款包装上')), '缺少的数据应包含来源核对');
});

t(6, '不添加蔗糖与 0 蔗糖不混淆，且都能各自判断', () => {
  eq(matchRule('不添加蔗糖').id, 'no_added_sucrose');
  eq(matchRule('0 蔗糖').id, 'zero_sucrose');
  eq(isSucroseClue('白砂糖'), true);
  eq(isSucroseClue('果葡糖浆'), false, '果葡糖浆是糖，但不是蔗糖');

  const r = rec({ ingredients: ['白砂糖'], items: [nut('sugar', '糖', 8, 'g')] });
  const added = analyze('不添加蔗糖', r);
  const zero = analyze('0 蔗糖', r);
  eq(added.flag, 'mismatch', '不添加蔗糖 + 白砂糖应提示冲突');
  eq(zero.ruleId, 'zero_sucrose');
  eq(zero.flag, null, '0 蔗糖是成品含量声称，不应套用配方冲突逻辑');
});

t(7, '其他配料规则不误报：CO₂ / 甜味剂 / 防腐剂 / 色素', () => {
  const co2 = analyze('不添加防腐剂', rec({ ingredients: ['水', '二氧化碳'] }));
  eq(co2.flag, null, '二氧化碳只作弱提示');
  assert(co2.takeaway.includes('产气'), `弱提示应说明实际用途：${co2.takeaway}`);

  const sucralose = analyze('不添加防腐剂', rec({ ingredients: ['水', '三氯蔗糖'] }));
  eq(sucralose.flag, null);
  eq(sucralose.status, ANALYSIS_STATUS.INSUFFICIENT);

  const citric = analyze('不添加防腐剂', rec({ ingredients: ['水', '柠檬酸'] }));
  eq(citric.flag, null, '柠檬酸不是防腐剂');

  const sorbate = analyze('不添加防腐剂', rec({ ingredients: ['水', '山梨酸钾'] }));
  eq(sorbate.flag, 'mismatch', '山梨酸钾是明确防腐剂，应提示冲突');

  const color = analyze('不添加色素', rec({ ingredients: ['水', '着色剂（焦糖色）'] }));
  eq(color.flag, 'mismatch', '配料表直接写着色剂，应提示冲突');

  const noColor = analyze('不添加色素', rec({ ingredients: ['水', '焦糖色'] }));
  eq(noColor.flag, null, '未收录的色素名称不能凭空判冲突');
});

console.log('\n【B】标准标注与未来标准（8-11）');

t(8, '非油炸不再标成 GB 28050 的工艺认定', () => {
  const a = analyze('非油炸', createDemoRecord('cookie'));
  eq(a.ruleVersion, '加工方式解释 · 暂无直接工艺核验依据');
  assert(!a.ruleVersion.includes('GB28050'), '规则版本不应写成 GB 28050');
  assert(a.standardNote.includes('不构成工艺认定依据'), `缺少工艺限定：${a.standardNote}`);
  assert(a.takeaway.includes('加工方式'), '结论应说明这是加工方式');
  assert(!/≤|≥/.test(a.takeaway), '结论不应出现营养阈值');
});

t(9, '使用 2025 版标准的卡片，主界面可见实施日期', () => {
  const targets = ['零添加', '无添加糖', '不添加蔗糖', '不添加防腐剂', '不添加色素', '全麦', '100% 果汁'];
  const r = rec({ ingredients: ['小麦粉', '白砂糖', '全麦粉'] });
  for (const text of targets) {
    const a = analyze(text, r);
    assert(a.standardNote, `${text} 缺少对用户可见的版本提示`);
    assert(
      a.standardNote.includes('2027 年 3 月 16 日') &&
        a.standardNote.includes('当前仅作规则变化提示'),
      `${text} 的版本提示不完整：${a.standardNote}`,
    );
    eq(a.standardNoteTone, 'future');
  }
  // 非油炸、纯天然不涉及未来标准，使用中性说明
  eq(analyze('纯天然', r).standardNoteTone, 'neutral');
  eq(analyze('非油炸', r).standardNoteTone, 'neutral');
});

t(10, 'GB 28050—2011 的现行数值规则不变', () => {
  const fat3 = analyze('低脂', rec({ items: [nut('fat', '脂肪', 3, 'g')] }));
  const fat31 = analyze('低脂', rec({ items: [nut('fat', '脂肪', 3.1, 'g')] }));
  eq(fat3.status, ANALYSIS_STATUS.SUPPORTED);
  eq(fat31.flag, 'mismatch');

  const sugar5 = analyze('低糖', rec({ items: [nut('sugar', '糖', 5, 'g')] }));
  eq(sugar5.status, ANALYSIS_STATUS.SUPPORTED);

  const protein = analyze('高蛋白', rec({ items: [nut('protein', '蛋白质', 12, 'g')] }));
  eq(protein.status, ANALYSIS_STATUS.SUPPORTED);

  const calcium = analyze(
    '高钙',
    rec({
      items: [nut('other', '钙', 240, 'mg'), nut('energy', '能量', 2000, 'kJ')],
    }),
  );
  eq(calcium.status, ANALYSIS_STATUS.SUPPORTED);
});

t(11, '解释型卡片不伪造数值阈值', () => {
  const r = rec({
    items: [nut('fat', '脂肪', 12, 'g'), nut('energy', '能量', 1500, 'kJ'), nut('sugar', '糖', 8, 'g')],
    ingredients: ['小麦粉', '全麦粉', '白砂糖'],
  });
  for (const text of ['非油炸', '纯天然', '零添加', '全麦', '100% 果汁', '不添加防腐剂']) {
    const a = analyze(text, r);
    const blob = [a.takeaway, a.summary, ...a.cannotConclude, a.standardNote].join(' ');
    assert(!/≤\s*\d|≥\s*\d|\d+\s*g\/100/.test(blob), `${text} 出现了数值阈值：${blob}`);
  }
});

console.log('\n【C】视觉层级 / 核心结论 / 科学检查边界（12-19）');

t(12, '30 条规则都有一句话结论，长度合理且无 undefined', () => {
  const r = rec({
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
    const a = analyzeClaim({ id: rule.id, text: rule.name }, r, {});
    assert(a.takeaway && a.takeaway.length >= 8, `${rule.id} 缺少一句话结论`);
    assert(a.takeaway.length <= 90, `${rule.id} 结论过长：${a.takeaway.length}`);
    assert(!/undefined|NaN/.test(a.takeaway), `${rule.id} 结论含 undefined/NaN`);
  }
});

t(13, '满足 / 不一致 / 信息不足的结论句含义不互相误导', () => {
  const pass = analyze('低脂', rec({ items: [nut('fat', '脂肪', 2, 'g')] }));
  const unknown = analyze('低糖', rec({ items: [nut('carbohydrate', '碳水化合物', 60, 'g')] }));
  const mismatch = analyze('无添加糖', rec({ ingredients: ['白砂糖'] }));

  eq(pass.verdict, 'pass');
  eq(unknown.verdict, 'unknown');
  eq(mismatch.verdict, 'mismatch');

  assert(pass.takeaway.includes('达到'), `满足时结论：${pass.takeaway}`);
  assert(unknown.takeaway.includes('无法确认'), `信息不足时结论：${unknown.takeaway}`);
  assert(mismatch.takeaway.includes('疑点'), `不一致时结论：${mismatch.takeaway}`);

  assert(!/安全|符合|已证实|健康/.test(unknown.takeaway), '信息不足不得写成已验证安全');
  eq(new Set([pass.takeaway, unknown.takeaway, mismatch.takeaway]).size, 3);
});

t(14, '重点句选择：保留全文、只挑一句、挑不出就不放大', () => {
  const text = '它是帮助食品保持质地的配料。出现乳化剂不代表食品一定不安全。仅凭配料表无法判断实际用量。';
  const { parts, keyIndex } = pickKeySentence(text);
  eq(parts.join(''), text, '切句后拼接必须还原原文');
  assert(keyIndex >= 0, '应能挑出一句重点');
  assert(parts[keyIndex].includes('不代表'), `应优先选结论句：${parts[keyIndex]}`);

  const flat = '它常用于调节酸度。它也用于稳定体系。';
  const flatPick = pickKeySentence(flat);
  eq(flatPick.parts.join(''), flat);
  assert(flatPick.keyIndex === -1, '没有结论标记时不应硬挑');

  const one = '黄原胶主要用于帮助食品保持合适的质地。';
  const onePick = pickKeySentence(one);
  eq(onePick.keyIndex, 0, '单句短文本可整体放大');
  eq(onePick.parts.join(''), one);
});

t(15, '成分大字结论来自已校验的健康原文，不是新写的', () => {
  const card = buildIngredientCard(matchIngredient('三氯蔗糖'));
  const research = getDemoResearch('三氯蔗糖');
  // 演示资料已按当前健康结构重做：有合格健康结论时，深入分析不再重复
  eq(research.healthSchema, 2);
  const core = buildIngredientCore({ card, research });
  eq(core.suppressed, true);
  eq(core.headline, null);

  const view = buildHealthView(research);
  assert(view?.headline, '缺少大字结论');
  const flat = (x) => String(x).replace(/[\s。；，：、]/g, '');
  const pool = [
    ...Object.values(research.healthInsights || {}).map((h) => h.text),
    ...(research.sections || []).filter((s) => s.verified).map((s) => s.text),
  ].filter(Boolean);
  assert(
    pool.some((text) => flat(text).includes(flat(view.headline.text.replace(/。$/, '')))),
    '大字结论必须是已校验原文中的一段，不能是新写的',
  );
});


t(16, '被科学检查标记或拒绝的内容不会进入醒目结论', () => {
  const flagged = {
    status: 'ok',
    brief: { howToUnderstand: '它一定安全，可以放心吃。' },
    briefScienceReview: [{ why: '这个说法缺乏依据' }],
    sections: [],
    rejectedSections: [{ text: '它一定安全', rejectReason: '引用不成立' }],
  };
  const core1 = buildIngredientCore({ card: null, research: flagged });
  assert(!core1.text.includes('一定安全'), `被标记内容进入了结论：${core1.text}`);
  assert(core1.source === 'insufficient');

  const rejectedOnly = {
    status: 'ok',
    brief: null,
    sections: [],
    rejectedSections: [{ text: '它可以治疗疾病', rejectReason: '违反科学检查' }],
  };
  const core2 = buildIngredientCore({ card: null, research: rejectedOnly });
  assert(!core2.text.includes('治疗'), `被拒内容进入了结论：${core2.text}`);
  eq(core2.source, 'insufficient');
});

t(17, '证据不足的成分不会被写成确定用途', () => {
  const core = buildIngredientCore({ card: null, research: null });
  eq(core.source, 'insufficient');
  assert(core.text.includes('资料不足'), `应直接说明资料不足：${core.text}`);
  assert(!/主要|用于|作用是/.test(core.text), `不得编造用途：${core.text}`);

  const failed = buildIngredientCore({ card: null, research: { status: 'no_source', sections: [] } });
  assert(failed.text.includes('没有找到足够可靠'), `失败状态应说明：${failed.text}`);
});

t(18, '重要限定语在数据层保留，不被展示逻辑删除', () => {
  const card = buildIngredientCard(matchIngredient('山梨酸钾'));
  assert(card.limits && card.limits.includes('看不出来'), '限定语丢失');
  assert(card.brief?.howToUnderstand, '简明结论丢失');
  const core = buildIngredientCore({ card, research: null });
  eq(core.source, 'background');
  eq(core.label, '科学背景');
  // 核心结论只做挑选，不改写、不删除原字段
  assert(card.limits.length > 20);
  assert(card.misconceptions.length > 0, '误解条目不应被删除');
});

t(19, '成分切句不改变文字顺序与标点', () => {
  const texts = [
    '山梨酸钾是 GB 2760-2024 登记的食品添加剂，功能栏写的是「防腐剂、抗氧化剂」两个功能。主要用来抑制霉菌和酵母菌生长，让食品坏得慢一点。',
    '它是独立登记的一种食品添加剂品种，与蔗糖是两种不同物质；营养标签上「蔗糖」属于「糖」的组成成分。',
  ];
  for (const text of texts) {
    eq(splitSentences(text).join(''), text, '切句后必须还原原文');
  }
});

console.log('\n【D】原功能回归（20-26）');

t(20, '30 条宣传语规则全部保留', () => {
  eq(RULES.length, 30);
  const ids = RULES.map((r) => r.id);
  for (const id of [
    'zero_fat',
    'zero_sugar',
    'zero_sucrose',
    'low_fat',
    'low_sugar',
    'low_sodium',
    'protein_high',
    'fiber_high',
    'calcium_high',
    'non_fried',
    'zero_additive',
    'no_added_sugar',
  ]) {
    assert(ids.includes(id), `规则 ${id} 丢失`);
  }
});

t(21, '0 脂肪 / 0 糖 / 0 蔗糖 行为不变', () => {
  const drink = createDemoRecord('drink');
  const list = analyzeClaim({ id: 'x', text: '0 脂肪' }, drink, { servingAmount: 500 });
  eq(list.calculation.result, 2.5);
  eq(list.calculation.expression, '500 ÷ 100 × 0.5');

  const sucrose = analyzeClaim({ id: 'y', text: '0 蔗糖' }, drink, {});
  eq(sucrose.status, ANALYSIS_STATUS.INSUFFICIENT);
  eq(sucrose.ruleId, 'zero_sucrose');

  const sugar = analyze('0 糖', rec({ items: [nut('sugar', '糖', 0, 'g')] }));
  eq(sugar.status, ANALYSIS_STATUS.EXPANDABLE);
});

t(22, '高蛋白 / 低脂 / 高钙 的阈值仍按 GB 28050—2011', () => {
  eq(analyze('高蛋白', rec({ items: [nut('protein', '蛋白质', 12, 'g')] })).verdict, 'pass');
  eq(analyze('低脂', rec({ items: [nut('fat', '脂肪', 3, 'g')] })).verdict, 'pass');
  eq(analyze('低脂', rec({ items: [nut('fat', '脂肪', 3.1, 'g')] })).verdict, 'mismatch');
  eq(analyze('低糖', rec({ items: [nut('sugar', '糖', 5, 'g')] })).verdict, 'pass');
  eq(analyze('低糖', rec({ items: [nut('sugar', '糖', 5.1, 'g')] })).verdict, 'mismatch');
});

t(23, 'DeepSeek Vision 仍是正式识别通道', () => {
  eq(DEFAULT_PRODUCT_PROVIDER, 'deepseek-vision');
});

t(24, '成分分析与本地知识库未被改动', () => {
  const r = createDemoRecord('drink');
  const res = analyzeIngredients(r);
  assert(res.summary.matched >= 1, '本地匹配失效');
  const suc = res.items.find((x) => x.ingredient.name === '三氯蔗糖');
  eq(suc.match.status, 'matched');
  assert(suc.match.entry.whatIsIt, '本地深化内容丢失');
});

t(25, '演示模式只用预录研究，不依赖联网', () => {
  const demo = getDemoResearch('三氯蔗糖');
  assert(demo && demo.demoReplay !== false, '预录研究丢失');
  // 演示可以有人工整理的离线健康资料，但必须标明，且不带检索轮次
  const sugar = getDemoResearch('白砂糖');
  assert(sugar?.demoCurated, '白砂糖演示应为人工整理');
  eq(sugar.searchCount, 0, '人工整理不应带检索次数');
});

t(26, '结论句不包含未通过检查的绝对化措辞', () => {
  const r = createDemoRecord('yogurt');
  for (const text of ['无添加糖', '不添加防腐剂', '不添加色素', '非油炸', '纯天然']) {
    const a = analyze(text, r);
    assert(!/绝对安全|一定健康|没有风险|完全无害/.test(a.takeaway), `${text} 结论越界：${a.takeaway}`);
  }
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
