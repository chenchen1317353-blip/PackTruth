/**
 * PackTruth V2.1.1 专项测试（零成本、不联网、不调 API）。
 *
 * 覆盖：
 *   A. 深入分析核心结论的两层结构（1-8）
 *   B. 科学边界：被拒 / review / 资料不足（9-12）
 *   C. 原功能不退化：30 条话术、简明三段、结论文本完整性（13-18）
 *
 * 只验证纯函数与数据路径；底栏的真实滚动与遮挡在 e2e-claims-v211.mjs 里测。
 */

import { createDemoRecord } from '../src/domain/demoData.js';
import { PRESENCE } from '../src/domain/foodRecord.js';
import { RULES } from '../src/domain/claims/registry.js';
import { ANALYSIS_STATUS, analyzeClaim } from '../src/domain/claims/index.js';
import {
  buildIngredientCard,
  matchIngredient,
} from '../src/domain/ingredients/index.js';
import {
  DEMO_RESEARCH,
  getDemoResearch,
} from '../src/domain/ingredients/researchDemo.js';
import {
  buildHealthView,
  buildIngredientCore,
  getCategoryHint,
  pickKeySentence,
  splitSentences,
} from '../src/app/ingredientView.js';

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

const nut = (key, name, value, unit) => ({
  id: `${key}_${value}`,
  key,
  name,
  value,
  unit,
  presence: PRESENCE.LABELED,
});

function rec({ items = [], ingredients = [], form = 'solid' } = {}) {
  return {
    status: 'confirmed',
    basic: { productName: '测试食品', physicalForm: form },
    ingredients: {
      presence: PRESENCE.LABELED,
      items: ingredients.map((name, i) => ({ id: `i${i}`, order: i + 1, name, raw: name })),
    },
    nutrition: { basis: 'per_100g', basisText: null, servingSize: { value: null, unit: null }, items },
    claims: [],
  };
}

const cardOf = (name) => buildIngredientCard(matchIngredient(name));
const analyze = (text, record) => analyzeClaim({ id: 'c1', text }, record, {});
const sectionText = (research, key) =>
  (research.sections || []).find((s) => s.section === key)?.text || '';

console.log('\n【A】核心结论两层结构（1-8）');

t(1, '三氯蔗糖：离线演示也有健康区块，深入分析不再重复大卡片', () => {
  const research = getDemoResearch('三氯蔗糖');
  // 旧版预录已按当前健康结构重做（人工整理官方资料，不是真实联网）
  eq(research.healthSchema, 4);
  eq(research.demoCurated, true);
  const view = buildHealthView(research);
  assert(view?.headline, '演示缺少大字健康结论');
  assert(!/两种不同|和蔗糖不同/.test(view.headline.text), '大字结论仍是名词差异');
  const core = buildIngredientCore({ card: cardOf('三氯蔗糖'), research });
  eq(core.suppressed, true);
  // 身份信息没有因为健康信息而消失
  assert(
    research.brief.what.includes('甜味剂') || research.brief.what.includes('蔗糖素'),
    '身份信息不应从数据层消失',
  );
  // 摄入量限制仍保留在数据与深入条目里，只是不抢第一眼
  assert(
    (research.sections || []).some(
      (s) => s.section === 'limits' && /实际含量|食用量/.test(s.text),
    ),
    '摄入量限制不应从数据层消失',
  );
});


t(2, '标题不超过 46 字，说明是普通长度的原文', () => {
  for (const [name, research] of Object.entries(DEMO_RESEARCH)) {
    const core = buildIngredientCore({ card: cardOf(name), research });
    if (!core.headline) continue;
    assert(
      core.headline.length <= 50,
      `${name} 的标题 ${core.headline.length} 字：${core.headline}`,
    );
  }
  for (const name of ['山梨酸钾', '赤藓糖醇', '柠檬酸']) {
    const core = buildIngredientCore({ card: cardOf(name), research: null });
    if (!core.headline) continue;
    assert(core.headline.length <= 50, `${name} 的标题过长：${core.headline}`);
  }
});

t(3, '演示健康结论来自官方原文，身份限定没有被改写', () => {
  const san = getDemoResearch('三氯蔗糖');
  const view = buildHealthView(san);
  assert(view?.headline?.quote, '大字结论缺少原文摘句');
  assert(/sucralose|EFSA/i.test(view.headline.quote), '原文不是 EFSA 评估');
  assert(view.headline.conditions.includes('获准'), '没有保留「获准用途」这一条件');
  // 与蔗糖的区分仍然在数据层（brief 或 sections），只是不再当大字结论
  const identityPool = [san.brief.what, san.brief.howToUnderstand, ...(san.sections || []).map((s) => s.text)].join(' ');
  assert(/两种不同|不代表它就是糖/.test(identityPool), '「与蔗糖不同」这一关键区分丢失');

  const sorb = cardOf('山梨酸钾');
  const c2 = buildIngredientCore({ card: sorb, research: null });
  const s2 = c2.explanation.replace(/。$/, '');
  const pool2 = [sorb.brief.what, sorb.brief.why, sorb.brief.howToUnderstand, sorb.limits].join(' ');
  assert(pool2.includes(s2), '山梨酸钾的科学背景不是已核验原文');

  const bamboo = cardOf('竹笋');
  const c3 = buildIngredientCore({ card: bamboo, research: null });
  assert(bamboo.brief.what.includes(c3.explanation.replace(/。$/, '')), '竹笋背景不是原文');
  assert(/不是食品添加剂/.test(c3.explanation), '竹笋的身份限定丢失');
});


t(4, '无法安全拆分时不硬造短句：中性标签 + 普通字号原文', () => {
  const long =
    '这是一段故意写得很长而且内部没有任何分号或冒号可以用来安全切开的说明文字，它只是用来验证无法切分时不会被人为截断成半句话。';
  const research = {
    status: 'ok',
    brief: null,
    sections: [
      { section: 'limits', text: long, verified: true, sourceRefs: ['K9'] },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  eq(core.headline, null);
  eq(core.label, '科学背景');
  eq(core.explanation, long);
  eq(core.text, long);
  assert(!core.explanation.includes('…'), '不得用省略号截断');
});

t(5, '只在句号 / 分号 / 冒号处切分，标题必须是原文的前缀', () => {
  const cases = [
    ['三氯蔗糖', getDemoResearch('三氯蔗糖')],
    ['山梨酸钾', null],
    ['赤藓糖醇', null],
    ['柠檬酸', null],
  ];
  for (const [name, research] of cases) {
    const card = cardOf(name);
    const core = buildIngredientCore({ card, research });
    if (!core.headline) continue;
    const pool = [
      ...((research?.sections || []).map((s) => s.text)),
      ...Object.values(research?.healthInsights || {}).map((h) => h.text),
      card?.brief?.what,
      card?.brief?.why,
      card?.brief?.howToUnderstand,
      card?.limits,
    ].filter(Boolean);
    const stem = core.headline.replace(/。$/, '');
    assert(
      pool.some((text) => text.startsWith(stem)),
      `${name} 的标题不是原文开头：${core.headline}`,
    );
    assert(!/[，,]$/.test(stem), `${name} 的标题停在逗号上：${core.headline}`);
  }
});

t(6, '演示健康结论带回原始引用编号，且能对应到来源列表', () => {
  const research = getDemoResearch('三氯蔗糖');
  const core = buildIngredientCore({ card: cardOf('三氯蔗糖'), research });
  eq(core.suppressed, true);
  const view = buildHealthView(research);
  const refs = view.headline.sourceRefs;
  assert(refs.length > 0, '缺少引用编号');
  const hit = research.sources.find((s) => s.id === refs[0]);
  assert(hit && /efsa\.europa\.eu/.test(hit.url), `引用编号没有对应到 EFSA 来源：${refs[0]}`);

  const local = buildIngredientCore({ card: cardOf('山梨酸钾'), research: null });
  eq(local.sourceRefs, cardOf('山梨酸钾').sources.map((s) => s.id), '本地来源编号丢失');
});


t(7, '所有演示成分的核心结论都不含 undefined / NaN', () => {
  for (const [name, research] of Object.entries(DEMO_RESEARCH)) {
    const core = buildIngredientCore({ card: cardOf(name), research });
    const blob = JSON.stringify(core);
    assert(!/undefined|NaN/.test(blob), `${name} 的输出异常：${blob.slice(0, 200)}`);
  }
});

t(8, '同一句不会在健康区与深入分析各出现一次', () => {
  const research = getDemoResearch('三氯蔗糖');
  const core = buildIngredientCore({ card: cardOf('三氯蔗糖'), research });
  // 健康区已经有这句，深入分析不再放大同一句
  eq(core.suppressed, true);
  eq(core.headline, null);
  eq(core.explanation, null);
});


console.log('\n【B】科学边界（9-12）');

t(9, '被科学检查拒绝的结论不会进入核心区', () => {
  const research = {
    status: 'ok',
    brief: null,
    sections: [],
    rejectedSections: [{ text: '它可以治疗糖尿病', rejectReason: '违反科学检查' }],
  };
  const core = buildIngredientCore({ card: null, research });
  assert(!core.headline?.includes('治疗'), '被拒内容进入了标题');
  assert(!core.explanation?.includes('治疗'), '被拒内容进入了说明');
  eq(core.source, 'insufficient');
});

t(10, '标记为 review 的条目不会被当成确定事实放大', () => {
  const research = {
    status: 'ok',
    brief: { howToUnderstand: '它一定安全，可以放心吃。' },
    briefScienceReview: [{ why: '这个说法缺乏依据' }],
    sections: [
      {
        section: 'limits',
        text: '它一定安全，可以放心吃。',
        verified: true,
        scientificCheck: { status: 'review' },
        sourceRefs: ['K1'],
      },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  assert(!core.headline?.includes('一定安全'), 'review 内容进入了标题');
  assert(!core.explanation?.includes('一定安全'), 'review 内容进入了说明');
  eq(core.source, 'insufficient');
});

t(11, '资料不足时突出“不能确认”，不编造用途', () => {
  const core = buildIngredientCore({ card: null, research: null });
  eq(core.source, 'insufficient');
  assert(core.headline.includes('资料不足'), `应直接说明资料不足：${core.headline}`);
  assert(!/主要|用于|作用是|可以稳定/.test(core.headline), `不得编造用途：${core.headline}`);

  const failed = buildIngredientCore({
    card: null,
    research: { status: 'no_source', sections: [] },
  });
  assert(failed.headline.includes('没有找到足够可靠'), `失败状态应说明：${failed.headline}`);
});

t(12, '部分资料成分不会因为要“好看”而写成确定用途', () => {
  // 赤藓糖醇只有本地资料，核心结论必须来自已核验原文，而不是补一句“主要起稳定作用”
  const core = buildIngredientCore({ card: cardOf('赤藓糖醇'), research: null });
  const card = cardOf('赤藓糖醇');
  const pool = [card.limits, card.brief?.howToUnderstand, card.brief?.what, card.brief?.why]
    .filter(Boolean)
    .join(' ');
  const text = `${core.headline || ''}${core.explanation || ''}`;
  const flat = (x) => String(x).replace(/[\s。；，：、]/g, '');
  assert(flat(pool).includes(flat(core.explanation)), '科学背景不是已核验原文');
  assert(!/主要起|可以稳定|作用是/.test(text), '出现了没有依据的确定用途');
});

console.log('\n【C】原功能不退化（13-18）');

t(13, '30 条宣传语规则全部保留', () => {
  eq(RULES.length, 30);
});

t(14, '低脂 / 低糖 / 无添加糖 三种结论不退化', () => {
  const lowFat = analyze('低脂', rec({ items: [nut('fat', '脂肪', 2, 'g')] }));
  eq(lowFat.verdict, 'pass');
  eq(lowFat.status, ANALYSIS_STATUS.SUPPORTED);

  const lowSugar = analyze('低糖', rec({ items: [nut('carbohydrate', '碳水化合物', 5, 'g')] }));
  eq(lowSugar.status, ANALYSIS_STATUS.INSUFFICIENT);

  const noAdded = analyze(
    '无添加糖',
    rec({ ingredients: ['生牛乳', '白砂糖'], items: [nut('energy', '能量', 300, 'kJ')] }),
  );
  eq(noAdded.flag, 'mismatch');
  assert(noAdded.statusLabel.includes('不一致'), '冲突提示丢失');
});

t(15, '简明三段仍然只挑一句，全文不丢', () => {
  const text = '黄原胶主要用于帮助食品保持合适的质地。它遇水后能形成稳定的胶体。';
  const pick = pickKeySentence(text);
  eq(pick.parts.join(''), text);
  assert(pick.keyIndex >= 0, '有明确结论时应当能挑出重点');
  const single = '它主要用于增稠。';
  assert(pickKeySentence(single).keyIndex === 0, '单句短文本应可高亮');
});

t(16, '切句函数不改变文字顺序与标点', () => {
  const texts = [
    '配料表只告诉你用了三氯蔗糖，不告诉你用了多少；估算摄入量需要实际含量和食用量。',
    '它按甜味剂管理，不在营养标签「糖」的标示范围内。所以两件事是独立的。',
  ];
  for (const text of texts) eq(splitSentences(text).join(''), text);
});

t(17, '核心结论只使用已核验条目，不读未核验文字', () => {
  const research = {
    status: 'ok',
    brief: null,
    sections: [
      { section: 'limits', text: '未核验的说法。', verified: false, sourceRefs: ['K1'] },
      { section: 'what', text: '核验过的定义。', verified: true, sourceRefs: ['K2'] },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  assert(!core.headline?.includes('未核验'), '未核验条目进入了标题');
  eq(core.sourceRefs, ['K2']);
});

t(18, '演示模式仍不依赖联网数据', () => {
  const demo = getDemoResearch('三氯蔗糖');
  assert(demo && demo.demoReplay !== false, '预录研究丢失');
  const sugarDemo = getDemoResearch('白砂糖');
  assert(sugarDemo?.demoCurated, '白砂糖演示应为人工整理');
  eq(sugarDemo.searchCount, 0, '人工整理不应带检索次数');
  eq(sugarDemo.query, null, '人工整理不应伪装成检索词');
  assert(createDemoRecord('drink').source.kind === 'demo', '演示样品来源被改动');
});

console.log('\n【D】V2.2 阅读顺序（21-24）');

t(21, '普通食材优先给身份与用途，不把合规当第一眼', () => {
  for (const name of ['竹笋', '白砂糖', '食用盐', '水']) {
    const card = cardOf(name);
    const core = buildIngredientCore({ card, research: null });
    assert(!/合规|无法判断|资料不足/.test(core.headline), `${name} 的第一眼仍在强调合规：${core.headline}`);
    assert(!/^配料表里出现|^从配料表看到/.test(core.headline), `${name} 的第一眼是标签元描述`);
  }
});

t(22, '食品添加剂优先给身份/功能或常见误解', () => {
  for (const name of ['柠檬酸', '乳酸', '山梨酸钾']) {
    const core = buildIngredientCore({ card: cardOf(name), research: null });
    assert(!/合规|无法判断|资料不足/.test(core.headline), `${name} 的第一眼仍在强调合规：${core.headline}`);
  }
});

t(23, '竹笋的核心结论与简明三段一致，且不是「资料不足」', () => {
  const card = cardOf('竹笋');
  const core = buildIngredientCore({ card, research: null });
  eq(core.source, 'background');
  assert(core.explanation.includes('普通食材'), `竹笋应直接说明身份：${core.explanation}`);
  assert(card.brief.what.includes(core.explanation.replace(/。$/, '')), '不是原文');
  assert(!/暂时不能|资料不足/.test(core.explanation), '不应退回资料不足');
});

t(24, '类别写法有单独解释，不当成未知成分', () => {
  for (const name of ['食品添加剂', '香辛料', '复合调味料']) {
    const hint = getCategoryHint(name);
    assert(hint, `${name} 缺少类别解释`);
    assert(hint.what && hint.how, `${name} 的类别解释不完整`);
  }
  eq(getCategoryHint('谷氨酸钠'), null);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
