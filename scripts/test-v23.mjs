/**
 * PackTruth V2.3 专项测试（零成本、不联网、不调用付费 API）。
 *
 * A. 识别链路：内容形态归一化、截断恢复、结构校验、诊断脱敏、无自动重试
 * B. 健康证据：健康结论的准入规则与证据分层
 * C. 展示优先级：健康结论优先、资料不足不降级整卡
 */

import { readFileSync } from 'node:fs';
import {
  extractJson,
  normalizeContent,
  recoverPartialJson,
} from '../server/lib/jsonMaybe.js';
import { PACKAGE_SCHEMA } from '../server/lib/packagePrompt.js';
import {
  interpretVisionContent,
  buildVisionDiagnostics,
} from '../server/providers/vision.js';
import { fromRecognition } from '../src/domain/foodRecord.js';
import {
  HEALTH_STATUS,
  checkHealthClaim,
  validateHealthInsights,
} from '../src/domain/evidence/healthGuard.js';
import { buildIngredientCore, buildHealthView } from '../src/app/ingredientView.js';
import { buildIngredientCard, matchIngredient } from '../src/domain/ingredients/index.js';

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

const FULL_JSON = JSON.stringify({
  product_name: '山椒脆笋',
  brand: null,
  category: '酱腌菜',
  net_content: '150g',
  ingredients_text: '饮用水、竹笋、食品添加剂（谷氨酸钠、柠檬酸）',
  ingredients: [{ name: '饮用水', raw: '饮用水' }],
  nutrition: { basis: 'per_100g', items: [{ name: '能量', value: '105', unit: 'kJ' }] },
  claims: [],
  unreadable: [],
  notes: null,
});

const evidenceSet = [
  {
    id: 'K9',
    title: '拟征求意见的食品添加剂名单（含 JECFA 评估结论摘录）',
    organization: '国家食品安全风险评估中心（CFSA）',
    sourceType: 'verified_local',
    excerpt:
      '第六条 三氯蔗糖 根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量为 15 mg/kg bw。',
  },
  {
    id: 'W1',
    title: '安赛蜜（乙酰磺胺酸钾）风险评估摘要',
    organization: 'WHO / JECFA',
    sourceType: 'fetch_content',
    excerpt:
      '安赛蜜（乙酰磺胺酸钾，acesulfame potassium）的每日允许摄入量（ADI）为 0–15 mg/kg bw，由 JECFA 第 37 次会议（1990）确立。安赛蜜在人体内不被代谢。',
  },
  {
    id: 'W2',
    title: '含阿斯巴甜食品的标签要求',
    organization: 'Health Canada',
    sourceType: 'fetch_content',
    excerpt:
      'Aspartame contains phenylalanine. The label of a food sweetened with aspartame must include a statement warning individuals with phenylketonuria (PKU) that the food contains phenylalanine.',
  },
  {
    id: 'W3',
    title: 'JECFA 乙酸评估',
    organization: 'WHO / JECFA',
    sourceType: 'fetch_content',
    excerpt:
      'ACETIC ACID: the group ADI "not limited" for acetic acid and its potassium and sodium salts established in 1973 was maintained. 冰乙酸即无水乙酸，食品级产品按酸度调节剂使用。',
  },
];

const healthRaw = (slot, text, refs, status = HEALTH_STATUS.SUPPORTED, quote = null) => ({
  [slot]: {
    text,
    evidenceStatus: status,
    sourceRefs: refs,
    ...(quote ? { quote } : {}),
  },
});

console.log('\n【A】识别链路（1-12）');

t(1, 'content 是分段数组时也能正确解析', () => {
  const content = [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }];
  eq(normalizeContent(content), '{"a":1}');
  eq(extractJson(content).value, { a: 1 });
});

t(2, 'finish_reason=length 的截断响应能恢复已闭合字段', () => {
  const cut =
    '{"product_name":"脆笋","ingredients_text":"饮用水、竹笋","ingredients":[{"name":"饮用水","raw":"饮用水"}],"nutrition":{"basis":"per_100g","items":[{"name":"能量","value":"105","unit":"kJ"},{"name":"蛋白';
  const r = interpretVisionContent(cut);
  assert(r.partial, '应标记为部分结果');
  eq(r.parsedValue.product_name, '脆笋');
  eq(r.parsedValue.ingredients.length, 1);
});

t(3, 'finish_reason=stop 但 JSON 无效 → 判定不可用，不硬恢复', () => {
  const r = interpretVisionContent('抱歉，我无法识别这张图片。');
  eq(r.parsedValue, null);
  eq(r.parse.reason, 'INVALID_JSON');
  eq(r.partial, false);
});

t(4, '空内容有独立的原因码', () => {
  eq(interpretVisionContent('').parse.reason, 'EMPTY_CONTENT');
  eq(interpretVisionContent('   ').parse.reason, 'EMPTY_CONTENT');
});

t(5, 'JSON 合法但字段类型不符：结构校验能指出问题，数据仍可用于核对', () => {
  // V2.3 验收修复后 ingredients 数组已不再要求模型输出，
  // 因此这里改用仍在 schema 内的字段验证「类型错误能被指出」这一原始意图。
  const bad = JSON.stringify({ product_name: 123, claims: '0蔗糖', nutrition: null });
  const r = interpretVisionContent(bad);
  assert(r.parse.ok, 'JSON 本身应解析成功');
  eq(r.structure.valid, false);
  assert(r.structure.missing.includes('ingredients_text'), '应报出缺失字段');
  assert(r.structure.wrongType.some((w) => w.field === 'product_name'), '应报出类型错误');
  assert(r.parsedValue, '结构不完美不应直接丢弃数据');
});

t(6, '存在部分字段时按 JSON 边界恢复，不补引号', () => {
  const cut = '{"product_name":"脆笋","brand":null,"ingredients":[{"name":"竹笋","raw":"竹';
  const r = recoverPartialJson(cut);
  assert(r.ok, '应能恢复');
  eq(r.value.ingredients, undefined, '写到一半的数组元素不能进结果');
  eq(r.value.product_name, '脆笋');
});

t(7, '没有任何可恢复字段时如实失败', () => {
  const r = interpretVisionContent('{"produ');
  eq(r.parsedValue, null);
  assert(['INVALID_JSON', 'NO_RECOVERABLE_FIELDS'].includes(r.parse.reason) || r.recovery?.ok === false);
});

t(8, '截断的营养数值不会被补成 0', () => {
  const cut =
    '{"ingredients_text":"饮用水","nutrition":{"basis":"per_100g","items":[{"name":"能量","value":"105","unit":"kJ"},{"name":"钠","val';
  const parsed = recoverPartialJson(cut).value;
  const rec = fromRecognition(parsed, {});
  const sodium = rec.nutrition.items.find((i) => i.key === 'sodium');
  assert(!sodium, '写到一半的营养项不应出现');
  assert(
    rec.nutrition.items.every((i) => i.value !== 0 || i.presence === 'labeled'),
    '不得把缺失值补成 0',
  );
});

t(9, '已完整识别的括号子配料不会漏', () => {
  const rec = fromRecognition({
    ingredients_text: '饮用水、食品添加剂（谷氨酸钠、柠檬酸）',
    ingredients: [{ name: '食品添加剂', raw: '食品添加剂（谷氨酸钠、柠檬酸）' }],
    nutrition: { basis: 'per_100g', items: [] },
  });
  const group = rec.ingredients.items.find((i) => i.name === '食品添加剂');
  eq(group.children.map((c) => c.name), ['谷氨酸钠', '柠檬酸']);
});

t(10, '诊断信息不含 API Key、图片和模型原文', () => {
  const secret = 'sk-SECRET-KEY-1234567890';
  const rawImage = 'data:image/jpeg;base64,AAAABBBBCCCC';
  const content = `{"product_name":"脆笋","note":"${secret}","img":"${rawImage}"}`;
  const r = interpretVisionContent(content);
  const d = buildVisionDiagnostics({
    requestId: 'A1B2C3',
    provider: 'deepseek-vision',
    res: { status: 200 },
    choice: { finish_reason: 'stop' },
    rawContent: content,
    content,
    interpreted: r,
    durationMs: 1200,
  });
  const blob = JSON.stringify(d);
  assert(!blob.includes(secret), '诊断里出现了密钥');
  assert(!blob.includes('base64'), '诊断里出现了图片数据');
  assert(!blob.includes('脆笋'), '诊断里出现了模型原文');
  eq(d.requestId, 'A1B2C3');
  eq(d.branch, 'parsed_full');
  eq(d.contentLength, content.length);
});

t(11, '识别链路没有自动重试：一次调用只发一次上游请求', () => {
  const src = readFileSync('server/providers/vision.js', 'utf8');
  const calls = src.match(/postJson\(endpoint/g) || [];
  eq(calls.length, 1, `vision.js 里 postJson 调用了 ${calls.length} 次`);
  assert(!/for\s*\([^)]*retry|while\s*\([^)]*retry|RETRY_TIMES/i.test(src), '不应出现重试循环');
});

t(12, '每次识别都有独立的 6 位编号（可对上服务端日志）', () => {
  const src = readFileSync('server/providers/vision.js', 'utf8');
  assert(/randomBytes\(3\)\.toString\('hex'\)\.toUpperCase\(\)/.test(src), '编号生成方式变了');
  const d1 = buildVisionDiagnostics({ requestId: 'AAAAAA' });
  const d2 = buildVisionDiagnostics({ requestId: 'BBBBBB' });
  assert(d1.requestId !== d2.requestId, '两次请求的编号应不同');
});

console.log('\n【B】健康证据（13-27）');

t(13, '普通食材不会被无依据地写成有毒', () => {
  const r = validateHealthInsights({
    raw: healthRaw('normalIntake', '竹笋本身有毒，长期吃会致癌。', ['W3']),
    evidenceSet,
    ingredientName: '竹笋',
  });
  eq(r.insights, null);
  assert(r.rejected[0].rejectReason.includes('有毒'), r.rejected[0].rejectReason);
});

t(14, '有使用标准不能推出「绝对安全」', () => {
  const r = validateHealthInsights({
    raw: healthRaw('practicalTakeaway', '它有国家标准，所以绝对安全，可以放心吃。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
  assert(r.rejected[0].issues[0].why.includes('安全保证'), r.rejected[0].issues[0].why);
});

t(15, '权威的正常膳食暴露结论可以展示，并保留适用范围', () => {
  const text =
    'JECFA 给出的每日允许摄入量是 15 mg/kg 体重，指的是终生每天摄入也不产生可觉察风险的估计值。';
  const r = validateHealthInsights({
    raw: healthRaw(
      'normalIntake',
      text,
      ['K9'],
      HEALTH_STATUS.AUTHORITATIVE,
      '该物质的每日允许摄入量为 15 mg/kg bw',
    ),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  assert(r.insights?.normalIntake, '应接受这条结论');
  eq(r.insights.normalIntake.evidenceStatus, 'authoritative');
  eq(r.insights.normalIntake.sourceRefs, ['K9']);
});

t(16, '动物高剂量研究不能直接变成人体结论', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '大鼠高剂量实验发现肿瘤，因此正常人吃了会致癌。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
  assert(r.rejected[0].issues[0].why.includes('动物'), r.rejected[0].issues[0].why);
});

t(17, 'ADI 不会被解释成急性中毒阈值', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '超过 ADI 就会中毒，出现明显不适。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
});

t(18, '「ADI 无需规定」不会被解释成无限量', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '乙酸没有规定 ADI，说明可以无限量摄入。', ['W3']),
    evidenceSet,
    ingredientName: '冰乙酸',
  });
  eq(r.insights, null);
});

t(19, '不知道实际添加量时，不生成「每天最多吃几包」', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '按每包 150g 估算，每天最多吃 2 包就是安全的。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
  assert(r.rejected[0].issues[0].why.includes('每天最多'), r.rejected[0].issues[0].why);
});

t(20, '有来源点名的特殊人群可以提示', () => {
  const text =
    '含阿斯巴甜并因此含有苯丙氨酸的食品，标签上需要提醒苯丙酮尿症（PKU）患者注意。';
  const r = validateHealthInsights({
    raw: healthRaw(
      'sensitiveGroups',
      text,
      ['W2'],
      HEALTH_STATUS.AUTHORITATIVE,
      'The label of a food sweetened with aspartame must include a statement warning individuals with phenylketonuria (PKU)',
    ),
    evidenceSet,
    ingredientName: '阿斯巴甜',
  });
  assert(r.insights?.sensitiveGroups, '应接受有来源依据的人群提示');
  eq(r.insights.sensitiveGroups.sourceRefs, ['W2']);
});

t(21, '没有可靠依据时不编造疾病名单', () => {
  const r = validateHealthInsights({
    raw: healthRaw('sensitiveGroups', '肾病患者、孕妇和婴幼儿都应避免食用。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
  assert(r.rejected[0].rejectReason.includes('科学检查'), r.rejected[0].rejectReason);
});

t(22, '不同化学形式的证据不能互相套用', () => {
  // 引用的是安赛蜜的资料，却在讲三氯蔗糖
  const r = validateHealthInsights({
    raw: healthRaw('normalIntake', '它的每日允许摄入量是 0–15 mg/kg 体重。', ['W1']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  eq(r.insights, null);
  assert(r.rejected[0].issues.some((i) => i.why.includes('另一个物质')), '应识别为跨物质引用');
});

t(23, '浓原液的腐蚀性不能套到食品摄入情境', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '冰乙酸会腐蚀消化道，所以吃这包脆笋会灼伤。', ['W3']),
    evidenceSet,
    ingredientName: '冰乙酸',
  });
  eq(r.insights, null);
});

t(24, '整款食品的钠问题不能归因到某个添加剂', () => {
  const r = validateHealthInsights({
    raw: healthRaw('highIntake', '这款食品钠含量高，就是这个添加剂造成的。', ['W3']),
    evidenceSet,
    ingredientName: '柠檬酸',
  });
  eq(r.insights, null);
});

t(25, '被拒绝的健康结论不会进入核心区', () => {
  const r = validateHealthInsights({
    raw: healthRaw('practicalTakeaway', '它绝对安全，可以放心吃。', ['K9']),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  const core = buildIngredientCore({
    card: buildIngredientCard(matchIngredient('三氯蔗糖')),
    research: { healthInsights: r.insights, sections: [] },
  });
  assert(!core.headline?.includes('绝对安全'), '被拒内容进入了核心结论');
});

t(26, '健康资料不足时，仍保留可靠的身份与用途', () => {
  const card = buildIngredientCard(matchIngredient('竹笋'));
  const core = buildIngredientCore({
    card,
    research: { healthInsights: null, healthStatus: 'unavailable', sections: [] },
  });
  // 没有健康结论时，深入分析只保留普通字号的科学背景
  eq(core.source, 'background');
  assert(core.explanation.includes('竹笋'), `应退回身份解释：${core.explanation}`);
  assert(!/资料不足|无法确认/.test(core.explanation), '不应整卡降级');
});

t(27, '正常摄入 / 过量摄入 / 特殊人群的来源可分别追溯', () => {
  const localSet = [
    ...evidenceSet,
    {
      id: 'K10',
      title: '阿斯巴甜评估摘录',
      organization: 'JECFA',
      sourceType: 'verified_local',
      excerpt: '阿斯巴甜的每日允许摄入量（ADI）为 0–40 mg/kg bw，由 JECFA 第 25 次会议（1981）确立。',
    },
  ];
  const raw = {
    normalIntake: {
      text: 'JECFA 给出的阿斯巴甜 ADI 是 0–40 mg/kg 体重，属于长期摄入参考值。',
      evidenceStatus: 'authoritative',
      sourceRefs: ['K10'],
      quote: '阿斯巴甜的每日允许摄入量（ADI）为 0–40 mg/kg bw，由 JECFA 第 25 次会议（1981）确立',
    },
    highIntake: {
      text: '现有资料没有给出超过 ADI 后的人体急性反应阈值。',
      evidenceStatus: 'conditional',
      sourceRefs: ['K10'],
    },
    sensitiveGroups: {
      text: '含苯丙氨酸的阿斯巴甜产品需要在标签上提醒苯丙酮尿症患者。',
      evidenceStatus: 'authoritative',
      sourceRefs: ['W2'],
      quote:
        'The label of a food sweetened with aspartame must include a statement warning individuals with phenylketonuria (PKU)',
    },
  };
  const r = validateHealthInsights({ raw, evidenceSet: localSet, ingredientName: '阿斯巴甜' });
  eq(r.insights.normalIntake.sourceRefs, ['K10']);
  eq(r.insights.highIntake.sourceRefs, ['K10']);
  eq(r.insights.sensitiveGroups.sourceRefs, ['W2']);
  assert(r.insights.normalIntake.verified && r.insights.sensitiveGroups.verified, '每条都要标为已核对');
});

console.log('\n【C】展示优先级（28-35）');

t(28, '深入分析的核心结论不再与健康区块重复，也不把标准编号当标题', () => {
  const card = buildIngredientCard(matchIngredient('柠檬酸'));
  const research = {
    healthSchema: 2,
    healthInsights: {
      consumerTakeaway: {
        text: '作为酸度调节剂正常食用时，现有评估没有发现需要特别担心的问题。',
        answerKind: 'evaluation',
        answersQuestion: true,
        headlineEligible: true,
        evidenceStatus: 'supported',
        evidenceLabel: '可靠资料支持',
        sourceRefs: ['W1'],
      },
    },
    sections: [
      { section: 'what', text: '柠檬酸是 GB 2760-2024 中登记的酸度调节剂。', verified: true, sourceRefs: ['K2'], scientificCheck: { status: 'pass' } },
      { section: 'why', text: '它用来调节酸度，让饮料的酸味更稳定。', verified: true, sourceRefs: ['K2'], scientificCheck: { status: 'pass' } },
    ],
  };
  const core = buildIngredientCore({ card, research });
  // 有健康结论时不再重复一张「核心结论」卡片（页面顶部已有一句）
  eq(core.suppressed, true);
  eq(core.headline, null);
  assert(!/GB\s?\d/.test(core.text || ''), '不应把标准编号当标题');
});

t(29, '没有健康资料时不会用大段免责声明填充', () => {
  const view = buildHealthView({ healthInsights: null });
  eq(view, null, '没有健康信息时不渲染空区块');
});

t(30, '健康结论长度受控，适合手机阅读', () => {
  const r = validateHealthInsights({
    raw: healthRaw(
      'consumerTakeaway',
      'JECFA 的评估认为，当前摄入水平下三氯蔗糖没有安全关切。',
      ['K9'],
      'authoritative',
      '该物质的每日允许摄入量为 15 mg/kg bw',
    ),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  const view = buildHealthView({ healthInsights: r.insights, healthSchema: 2 });
  assert(view.headline.text.length <= 80, `健康结论过长：${view.headline.text.length}`);
});

t(31, '没有特殊人群信息时不出现空行或虚构警告', () => {
  const r = validateHealthInsights({
    raw: healthRaw('normalIntake', 'JECFA 给出的 ADI 是 15 mg/kg 体重。', ['K9'], 'authoritative', '该物质的每日允许摄入量为 15 mg/kg bw'),
    evidenceSet,
    ingredientName: '三氯蔗糖',
  });
  const view = buildHealthView({ healthInsights: r.insights });
  assert(!view.rows.some((x) => x.key === 'sensitiveGroups'), '不应出现空的特殊人群行');
});

t(32, '深入分析仍保留依据与限定', () => {
  const research = {
    healthInsights: {
      normalIntake: {
        text: 'JECFA 给出的 ADI 是 15 mg/kg 体重。',
        evidenceStatus: 'authoritative',
        evidenceLabel: '权威评估直接支持',
        sourceRefs: ['K9'],
      },
    },
    sections: [
      { section: 'limits', text: '配料表不标注实际添加量，无法据此推算摄入量。', verified: true, sourceRefs: ['K9'], scientificCheck: { status: 'pass' } },
    ],
  };
  const core = buildIngredientCore({ card: null, research });
  assert(core.sourceRefs.length > 0, '核心结论必须带来源');
  const limits = research.sections.find((s) => s.section === 'limits');
  assert(limits && /无法据此推算/.test(limits.text), '限定语不应被删除');
});

t(33, '健康信息的提示词要求食品语境', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  assert(src.includes('食品类别'), '提示词缺少食品类别语境');
  assert(src.includes('healthInsights'), '提示词缺少健康信息结构');
});

t(34, '包装括号子配料仍可独立分析', () => {
  const rec = fromRecognition({
    ingredients_text: '饮用水、食品添加剂（谷氨酸钠、柠檬酸）',
    nutrition: { basis: 'per_100g', items: [] },
  });
  const group = rec.ingredients.items.find((i) => i.name === '食品添加剂');
  eq(group.children.length, 2);
});

t(35, '诊断分支与实际处理一致', () => {
  const full = interpretVisionContent(FULL_JSON);
  const d1 = buildVisionDiagnostics({ interpreted: full });
  eq(d1.branch, 'parsed_full');

  const cut = interpretVisionContent('{"product_name":"脆笋","ingredients":[');
  const d2 = buildVisionDiagnostics({ interpreted: cut, content: '{"product_name":"脆笋","ingredients":[' });
  eq(d2.branch, 'recovered_partial');

  const bad = interpretVisionContent('not json');
  const d3 = buildVisionDiagnostics({ interpreted: bad });
  eq(d3.branch, 'unusable');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  for (const r of rows.filter((x) => !x.ok)) console.log(`  ✗ [${r.id}] ${r.name}\n      ${r.error}`);
  process.exit(1);
}
