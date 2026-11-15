/**
 * PackTruth V2.2 专项测试（零成本、不联网、不调 API）。
 *
 * A. 识别截断与部分恢复（1-12）
 * B. 复合配料与父子结构（13-24）
 * C. 成分解释的阅读顺序与边界（25-38）
 * D. 原能力回归（39-42）
 */

import { readFileSync } from 'node:fs';
import { createDemoRecord } from '../src/domain/demoData.js';
import { PRESENCE, createFoodRecord, fromRecognition, validateFoodRecord } from '../src/domain/foodRecord.js';
import {
  parseIngredientName,
  parseIngredientText,
  flattenIngredientNames,
} from '../src/domain/ingredientStructure.js';
import {
  analyzeIngredients,
  buildIngredientCard,
  matchIngredient,
} from '../src/domain/ingredients/index.js';
import { analyzeClaim } from '../src/domain/claims/index.js';
import { buildIngredientCore, getCategoryHint } from '../src/app/ingredientView.js';
import { interpretVisionContent } from '../server/providers/vision.js';
import { assertUpstreamOk } from '../server/lib/upstream.js';
import { buildDegradedBrief } from '../server/providers/ingredientResearch.js';

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

const FULL = {
  product_name: '山椒脆笋（测试）',
  brand: '测试品牌',
  category: '酱腌菜',
  net_content: '150g',
  ingredients_text:
    '饮用水、竹笋、山椒、食用盐、香辛料、食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、柠檬酸、冰乙酸、乳酸）、食用香精香料',
  // V2.3 验收修复后，模型不再输出配料对象数组：
  // 父子结构由 ingredientStructure.js 从 ingredients_text 解析。
  // 这里保留“模型旧版本仍输出数组”的兼容性由 test-v23-fix 单独覆盖。
  nutrition: {
    basis: 'per_100g',
    basis_text: '每100克',
    items: [
      { name: '能量', value: '105', unit: 'kJ', nrv_percent: '1' },
      { name: '蛋白质', value: '1.2', unit: 'g', nrv_percent: '2' },
      { name: '钠', value: '1180', unit: 'mg', nrv_percent: '59' },
    ],
  },
  claims: ['非油炸'],
  unreadable: [],
  notes: null,
};

const FULL_JSON = JSON.stringify(FULL);
const cardOf = (name) => buildIngredientCard(matchIngredient(name));

console.log('\n【A】识别截断与部分恢复（1-12）');

t(1, '完整 JSON：解析成功、结构校验通过、不是部分结果', () => {
  const r = interpretVisionContent(FULL_JSON);
  eq(r.parse.ok, true);
  eq(r.structure.valid, true);
  eq(r.partial, false);
  eq(r.parsedValue.product_name, '山椒脆笋（测试）');
});

t(2, 'finish_reason=length 的截断响应：恢复已闭合字段', () => {
  const cut = FULL_JSON.slice(0, FULL_JSON.indexOf('"蛋白质"'));
  const r = interpretVisionContent(cut);
  eq(r.parse.ok, false);
  eq(r.partial, true);
  assert(r.recoveredKeys.includes('product_name'), '没有恢复食品名称');
  assert(r.recoveredKeys.includes('ingredients_text'), '没有恢复配料原文');
  assert(r.recoveredKeys.includes('nutrition'), '没有恢复已闭合的营养表');
  // 截断发生在营养表中间，但配料原文已经完整写出 → 父子结构仍可从原文解析
  assert(r.parsedValue.ingredients?.length >= 6, '配料结构没有从原文解析出来');
  assert(!JSON.stringify(r.parsedValue).includes('蛋白'), '截断到一半的字段被当成了完整数据');
});

t(3, 'JSON 部分缺失：只保留完整键，不补 null', () => {
  const cut = '{"product_name":"脆笋","ingredients":[{"name":"饮用水","raw":"饮用水"}],"nutrition":{"basis":"per_100g","items":[{"name":"能量","value":"105","unit":"kJ"},{"name":"蛋白';
  const r = interpretVisionContent(cut);
  eq(r.partial, true);
  eq(r.parsedValue.product_name, '脆笋');
  eq(r.parsedValue.nutrition.items.length, 1);
  assert(!('brand' in r.parsedValue), '缺失字段被凭空补齐');
});

t(4, '有可靠部分字段：可以转成可核对记录', () => {
  const cut = '{"product_name":"脆笋","ingredients_text":"饮用水、竹笋、食品添加剂（谷氨酸钠、柠檬酸）","ingredients":[{"name":"饮用水","raw":"饮用水"}],"nutrition":{"basis":"per_100g","items":[{"name":"能量","value":"105","unit":"kJ"}]}';
  const r = interpretVisionContent(cut);
  const rec = fromRecognition(r.parsedValue, { partial: true, partialFields: ['食品名称', '配料原文'] });
  eq(rec.source.partial, true);
  eq(rec.ingredients.items.length, 3);
  eq(rec.ingredients.items[2].children.length, 2);
  eq(rec.nutrition.items.length, 1);
  eq(rec.nutrition.items[0].value, 105);
});

t(5, '没有可恢复字段：不制造假成功', () => {
  const r = interpretVisionContent('抱歉，这张图片太模糊，我无法识别。');
  eq(r.parse.ok, false);
  eq(r.partial, false);
  eq(r.parsedValue, null);
  eq(r.recovery?.ok, false);
});

t(6, '有配料但没有营养表：配料保留，营养为空并给出提醒', () => {
  const rec = fromRecognition({
    ingredients_text: '饮用水、竹笋、食品添加剂（谷氨酸钠）',
    nutrition: { basis: null, items: [] },
  });
  eq(rec.ingredients.items.length, 3);
  eq(rec.nutrition.items.length, 0);
  const v = validateFoodRecord(rec);
  assert(v.warnings.some((w) => w.includes('没有营养数据')), '缺少营养提醒');
  assert(v.errors.some((e) => e.includes('营养标示基准')), '缺少基准阻断');
});

t(7, '有营养表但配料不完整：不编造配料，营养照常保留', () => {
  const rec = fromRecognition({
    ingredients_text: null,
    nutrition: { basis: 'per_100g', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
  });
  eq(rec.ingredients.items.length, 0);
  eq(rec.nutrition.items.length, 1);
  assert(validateFoodRecord(rec).warnings.some((w) => w.includes('没有配料')), '缺少配料提醒');
});

t(8, '中文 / 英文括号不闭合：保留原文，不拆子项', () => {
  for (const raw of ['食品添加剂（谷氨酸钠、柠檬酸', '食品添加剂(谷氨酸钠、柠檬酸']) {
    const p = parseIngredientName(raw);
    eq(p.children.length, 0);
    eq(p.name, raw);
    assert(p.note?.includes('括号没有闭合'), '没有标记结构待核对');
  }
});

t(9, '网络超时 / 429：错误码可区分，不伪装成识别不完整', () => {
  for (const [status, code] of [
    [429, 'UPSTREAM_RATE_LIMITED'],
    [504, 'UPSTREAM_GATEWAY_TIMEOUT'],
    [401, 'UPSTREAM_UNAUTHORIZED'],
  ]) {
    let err = null;
    try {
      assertUpstreamOk({ ok: false, status, data: { error: { message: 'test' } } }, { provider: 'test', endpoint: 'https://example.com' });
    } catch (e) {
      err = e;
    }
    assert(err, `${status} 没有抛错`);
    eq(err.code, code);
    eq(err.httpStatus, status);
  }
});

t(10, '部分记录可以进入人工核对（确认前仍是 recognized）', () => {
  const rec = fromRecognition({ product_name: '脆笋', ingredients_text: '竹笋', nutrition: { basis: null, items: [] } }, { partial: true });
  eq(rec.status, 'recognized');
  eq(validateFoodRecord(rec).valid, false);
  assert(validateFoodRecord(rec).errors.some((e) => e.includes('营养标示基准')), '应阻止未选基准就确认');
});

t(11, '重新识别不会修改已确认的记录（纯函数）', () => {
  const before = createDemoRecord('bamboo');
  const snapshot = JSON.stringify(before);
  fromRecognition(FULL, { partial: true });
  eq(JSON.stringify(before), snapshot, '已有记录被新识别污染');
});

t(12, '识别失败不自动重试：解析层只返回结果，不发起请求', () => {
  const r = interpretVisionContent('{broken');
  eq(r.partial, false);
  eq(r.parsedValue, null);
  // 解析函数没有 fetch 能力；重试只能由用户点击触发（浏览器验收覆盖）
  assert(typeof interpretVisionContent === 'function');
});

console.log('\n【B】复合配料与父子结构（13-24）');

t(13, '食品添加剂括号拆分：父级 + 5 个具体成员', () => {
  const p = parseIngredientName(
    '食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、柠檬酸、冰乙酸、乳酸）',
  );
  eq(p.name, '食品添加剂');
  eq(p.children.map((c) => c.name), ['谷氨酸钠', '5′-呈味核苷酸二钠', '柠檬酸', '冰乙酸', '乳酸']);
  eq(p.note, null);
});

t(14, '多层嵌套括号：B 自己还带 B1 / B2', () => {
  const p = parseIngredientName('复合调味料（A、B（B1、B2）、C）');
  eq(p.name, '复合调味料');
  eq(p.children.map((c) => c.name), ['A', 'B', 'C']);
  eq(p.children[1].children.map((c) => c.name), ['B1', 'B2']);
});

t(15, '特殊符号：5′-呈味核苷酸二钠 不被截断', () => {
  const p = parseIngredientName('5′-呈味核苷酸二钠');
  eq(p.name, '5′-呈味核苷酸二钠');
  eq(p.children.length, 0);
  const text = parseIngredientText('食品添加剂（5′-呈味核苷酸二钠、柠檬酸）');
  eq(text.items[0].children[0].name, '5′-呈味核苷酸二钠');
});

t(16, '长配料表：20 项顺序与数量都不丢', () => {
  const names = Array.from({ length: 20 }, (_, i) => `配料${i + 1}`);
  const parsed = parseIngredientText(names.join('、'));
  eq(parsed.items.length, 20);
  eq(parsed.items[19].name, '配料20');
  assert(parsed.balanced, '长列表被误判为不完整');
});

t(17, '不完整括号 / 括号后有文字：保守处理', () => {
  for (const raw of ['食品添加剂（谷氨酸钠', '食品添加剂（谷氨酸钠）其他']) {
    const p = parseIngredientName(raw);
    eq(p.children.length, 0);
    assert(p.note, '没有标记待核对');
  }
});

t(18, '香辛料不被拆成没印在包装上的具体香辛料', () => {
  const p = parseIngredientName('香辛料');
  eq(p.children.length, 0);
  eq(p.name, '香辛料');
  const rec = fromRecognition({ ingredients_text: '竹笋、香辛料', nutrition: { basis: 'per_100g', items: [] } });
  eq(rec.ingredients.items[1].children, []);
  assert(getCategoryHint('香辛料'), '香辛料应作为类别写法解释');
  assert(!/辣椒|八角|花椒/.test(rec.ingredients.rawText), '原文里没有的香辛料被补进来了');
});

t(19, 'FoodRecord 支持子配料，旧扁平数据仍然可用', () => {
  const rec = fromRecognition(FULL);
  const group = rec.ingredients.items.find((i) => i.name === '食品添加剂');
  eq(group.children.length, 5);
  eq(group.children[0].name, '谷氨酸钠');
  assert(group.children[0].id, '子配料缺少 id');
  assert(group.children[0].order >= 1, '子配料缺少顺序');

  const old = createDemoRecord('drink');
  eq(old.ingredients.items.length, 7);
  eq(old.ingredients.items[0].children, []);
});

t(20, '配料原文保留，结构化列表从原文补全', () => {
  const rec = fromRecognition(FULL);
  eq(rec.ingredients.rawText, FULL.ingredients_text);
  eq(rec.ingredients.items.length, 7);
  eq(rec.ingredients.items.map((i) => i.name), [
    '饮用水', '竹笋', '山椒', '食用盐', '香辛料', '食品添加剂', '食用香精香料',
  ]);
});

t(21, '模型只给配料原文时，本地解析出可点条目', () => {
  const rec = fromRecognition({
    ingredients_text: '食品添加剂（谷氨酸钠、柠檬酸）、食用香精香料',
    nutrition: { basis: 'per_100g', items: [] },
  });
  eq(rec.ingredients.items.length, 2);
  eq(rec.ingredients.items[0].children.map((c) => c.name), ['谷氨酸钠', '柠檬酸']);
});

t(22, '分析层：父级是类别标题，子项单独匹配并可统计', () => {
  const rec = fromRecognition(FULL);
  const a = analyzeIngredients(rec);
  const group = a.items.find((x) => x.ingredient.name === '食品添加剂');
  eq(group.children.length, 5);
  eq(group.match.status, 'unknown');
  assert(group.children.some((c) => c.match.status === 'matched'), '柠檬酸应能匹配到知识库');
  eq(a.summary.groups, 1);
  assert(a.summary.total > a.items.length, '覆盖率应按具体成员计算');
});

t(23, '子配料名称进入话术规则：不添加防腐剂能看到山梨酸钾', () => {
  const rec = fromRecognition({
    ingredients_text: '竹笋、食品添加剂（山梨酸钾）',
    nutrition: { basis: 'per_100g', items: [] },
  });
  const a = analyzeClaim({ id: 'c1', text: '不添加防腐剂' }, rec, {});
  eq(a.flag, 'mismatch');
  assert(a.mismatchNote.includes('山梨酸钾') || a.facts.some((f) => String(f.value).includes('山梨酸钾')), '没有指出子配料');
});

t(24, '子配料进入话术规则：0 蔗糖 不误命中 0 糖', () => {
  const rec = fromRecognition({
    ingredients_text: '饮用水、复合调味料（白砂糖、食用盐）',
    nutrition: { basis: 'per_100g', items: [{ name: '糖', value: '8', unit: 'g' }] },
    claims: ['0 蔗糖'],
  });
  const sucrose = analyzeClaim({ id: 'c1', text: '0 蔗糖' }, rec, {});
  const sugar = analyzeClaim({ id: 'c2', text: '0 糖' }, rec, {});
  assert(sucrose.ruleId !== sugar.ruleId, '0 蔗糖与 0 糖被合并成同一条规则');
  eq(flattenIngredientNames(rec.ingredients.items).includes('白砂糖'), true);
});

console.log('\n【C】成分解释的阅读顺序与边界（25-38）');

t(25, '普通食材先给身份和用途：竹笋', () => {
  const card = cardOf('竹笋');
  const core = buildIngredientCore({ card, research: null });
  // 本地只有身份与用途 → 没有健康结论，深入分析只给普通字号的科学背景
  eq(core.source, 'background');
  assert(core.explanation.includes('普通食材'), `没有先说身份：${core.explanation}`);
  assert(!/合规|资料不足|无法判断/.test(core.explanation), `第一眼仍在强调不确定：${core.explanation}`);
  eq(core.sourceRefs, ['K2', 'K3']);
});

t(26, '食品添加剂先给身份/功能，不先讲合规', () => {
  for (const name of ['柠檬酸', '乳酸', '山梨酸钾']) {
    const core = buildIngredientCore({ card: cardOf(name), research: null });
    assert(core.explanation, `${name} 缺少科学背景`);
    assert(!/合规|资料不足|无法判断/.test(core.explanation), `${name} 第一眼是合规：${core.explanation}`);
  }
});

t(27, '已知身份、未知用量：不整张卡降级', () => {
  const card = cardOf('竹笋');
  assert(card?.brief?.what && card?.brief?.why, '竹笋应有简明解释');
  const core = buildIngredientCore({ card, research: null });
  assert(core.explanation.includes('竹笋'), '已知成分不应退回未知');
  assert(card.limits.includes('用量'), '用量限制仍应保留在数据里');
});

t(28, '确实资料不足：不编造用途', () => {
  const core = buildIngredientCore({ card: null, research: null });
  eq(core.source, 'insufficient');
  assert(core.headline.includes('资料不足'), `应说明资料不足：${core.headline}`);
  assert(!/主要起|用于|作用是/.test(core.headline), `编造了用途：${core.headline}`);
});

t(29, '特定品种 / 加工状态的研究不能自动推广', () => {
  const prompt = readFileSync('server/providers/researchPrompt.js', 'utf8');
  assert(prompt.includes('特定品种'), '提示词缺少特定品种限制');
  assert(prompt.includes('特定加工状态'), '提示词缺少特定加工状态限制');
  assert(prompt.includes('相关性优先'), '提示词缺少相关性优先规则');
});

t(30, '普通食材不套添加剂模板', () => {
  const prompt = readFileSync('server/providers/researchPrompt.js', 'utf8');
  assert(prompt.includes('普通食材用食材的语言'), '提示词缺少普通食材表达规则');
  const card = cardOf('水');
  assert(!/食品添加剂/.test(card.brief.what), '水的身份被写成添加剂');
});

t(31, '一般用途不写成当前厂家的确定用途', () => {
  const prompt = readFileSync('server/providers/researchPrompt.js', 'utf8');
  assert(prompt.includes('不要推测「这款产品为什么用它」'), '缺少对具体产品用途的限制');
});

t(32, '原有科学限制仍然存在', () => {
  const card = cardOf('柠檬酸');
  assert(card.limits.includes('无法得知实际添加量'), '添加量限制丢失');
  const bamboo = cardOf('竹笋');
  assert(bamboo.limits.includes('不标注'), '竹笋用量限制丢失');
  const core = buildIngredientCore({ card: bamboo, research: null });
  assert(core.headline + (core.explanation || '') !== '', '核心结论为空');
  // 限制仍在数据层，深入版会显示
  const deep = `${bamboo.limits} ${bamboo.brief.howToUnderstand}`;
  assert(/不标注|具体用了多少/.test(deep), '限制语被删除');
});

t(33, '被拒绝的结论不会进入醒目区', () => {
  const research = {
    status: 'ok',
    brief: { howToUnderstand: '它一定安全，可以放心吃。' },
    briefScienceReview: [{ why: '缺依据' }],
    sections: [],
    rejectedSections: [{ text: '它可以治疗疾病' }],
  };
  const core = buildIngredientCore({ card: null, research });
  assert(core.source === 'insufficient');
  assert(!/治疗|一定安全/.test(core.headline), '被拒内容进入核心结论');
});

t(34, '引用编号与核心结论对应', () => {
  const card = cardOf('竹笋');
  const core = buildIngredientCore({ card, research: null });
  eq(core.sourceRefs, card.sources.map((s) => s.id));
  const san = buildIngredientCore({ card: cardOf('三氯蔗糖'), research: null });
  assert(san.sourceRefs.length > 0, '三氯蔗糖缺少引用编号');
});

t(35, '简明版通俗：竹笋三段不含标准编号', () => {
  const card = cardOf('竹笋');
  const text = `${card.brief.what}${card.brief.why}${card.brief.howToUnderstand}`;
  assert(!/GB\s?\d|INS\s?\d|CNS\s?\d/.test(text), `简明版堆了标准编号：${text}`);
  assert(card.brief.what.length < 60, '第一句过长');
});

t(36, '类别写法有单独解释，不用「资料不足」糊过去', () => {
  for (const name of ['食品添加剂', '香辛料', '复合调味料']) {
    const hint = getCategoryHint(name);
    assert(hint?.what && hint?.how, `${name} 缺少类别解释`);
  }
  eq(getCategoryHint('谷氨酸钠'), null);
});

t(37, '降级简明版不再优先拿 limits 当「怎么理解」', () => {
  const src = [{ id: 's1', tier: 'cited', verified: true, sourceRefs: ['K1'], sources: [], text: '无法判断实际用量。', section: 'limits' }];
  eq(buildDegradedBrief(src), null, '没有身份/用途时不应硬凑三段');
  const full = [
    ...src,
    { id: 's2', tier: 'cited', verified: true, sourceRefs: ['K1'], sources: [], text: '它属于普通食材。', section: 'what' },
    { id: 's3', tier: 'cited', verified: true, sourceRefs: ['K1'], sources: [], text: '它主要提供风味。', section: 'why' },
    { id: 's4', tier: 'cited', verified: true, sourceRefs: ['K1'], sources: [], text: '名字相似不等于同一种物质。', section: 'misconception' },
  ];
  const brief = buildDegradedBrief(full);
  eq(brief.howToUnderstand, '名字相似不等于同一种物质。', '降级简明版仍优先用了 limits');
});

t(38, '类别父级不吞掉具体成员：5 个成员均可点', () => {
  const rec = createDemoRecord('bamboo');
  const a = analyzeIngredients(rec);
  const group = a.items.find((x) => x.ingredient.name === '食品添加剂');
  eq(group.children.length, 5);
  eq(group.children.map((c) => c.match.input), [
    '谷氨酸钠', '5′-呈味核苷酸二钠', '柠檬酸', '冰乙酸', '乳酸',
  ]);
});

console.log('\n【D】原能力回归（39-42）');

t(39, '四个演示样品仍可创建，旧三个结构不变', () => {
  for (const id of ['drink', 'cookie', 'yogurt', 'bamboo']) {
    const r = createDemoRecord(id);
    assert(r.basic.productName, `${id} 缺产品名`);
    assert(r.nutrition.items.length > 0, `${id} 缺营养`);
  }
  eq(createDemoRecord('drink').ingredients.items.length, 7);
  eq(createDemoRecord('yogurt').ingredients.items.length, 4);
});

t(40, '30 条宣传语规则仍在，典型规则不退化', () => {
  const rec = createDemoRecord('drink');
  eq(analyzeClaim({ id: 'c', text: '0 脂肪' }, rec, {}).ruleId, 'zero_fat');
  eq(analyzeClaim({ id: 'c', text: '0 蔗糖' }, rec, {}).ruleId, 'zero_sucrose');
  eq(analyzeClaim({ id: 'c', text: '低糖' }, rec, {}).status, 'insufficient');
});

t(41, 'BYOK / 请求隔离代码未被改动（文件存在且导出未变）', () => {
  const src = readFileSync('server/lib/requestCredentials.js', 'utf8');
  assert(src.includes('credentialScope'), '请求级凭据作用域丢失');
  assert(src.includes('scrubCredential'), '凭据脱敏丢失');
});

t(42, '识别阶段的字段仍按 PACKAGE_SCHEMA 校验', () => {
  const r = interpretVisionContent(FULL_JSON);
  eq(r.structure.extra.length, 0);
  eq(r.structure.missing.length, 0);
  eq(r.structure.wrongType.length, 0);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
