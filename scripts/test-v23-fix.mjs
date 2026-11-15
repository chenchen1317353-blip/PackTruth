/**
 * PackTruth V2.3 验收修复 · 逻辑测试（零成本、不联网、不调用付费 API）。
 *
 * A 识别输出体积与截断（输出长度前后对比、字段完整率、恢复边界）
 * B 检索：为什么健康资料没被找到、补别名后查询词变成什么
 * C 健康结论：原文锚点、数值核对、年份核对、跨物质、法规冒充
 * D 展示：健康区块顺序、不重复、补充检索的费用与预算
 * E 回归：BYOK、演示样品、30 条宣传语、复合配料
 */

import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractJson,
  recoverPartialJson,
  validateStructure,
} from '../server/lib/jsonMaybe.js';
import { PACKAGE_SCHEMA, SYSTEM_PROMPT } from '../server/lib/packagePrompt.js';
import {
  interpretVisionContent,
  buildVisionDiagnostics,
  deriveIngredients,
  VISION_MAX_TOKENS,
} from '../server/providers/vision.js';
import { appendVisionDiagnostic } from '../server/lib/visionLog.js';
import { buildSearchQuery, buildHealthQuery, buildFallbackQuery } from '../server/lib/searchQuery.js';
import { getHealthSitePriority } from '../server/lib/sourceWhitelist.js';
import { mergeAliases, seededAliases } from '../src/domain/ingredients/aliasSeeds.js';
import {
  findHealthEvidence,
  classifyEvidenceKind,
  EVIDENCE_KIND,
} from '../src/domain/evidence/healthEvidence.js';
import {
  validateHealthInsights,
  verifyQuoteSupport,
  extractNumbers,
  normalizeQuote,
  isAbsenceStatement,
  checkHealthClaim,
  HEALTH_STATUS,
} from '../src/domain/evidence/healthGuard.js';
import { buildHealthView, buildHealthGapView, buildIngredientCore } from '../src/app/ingredientView.js';
import { parseIngredientText } from '../src/domain/ingredientStructure.js';
import {
  LONG_ITEMS,
  LONG_TEXT,
  NUTRITION,
  buildOldOutput,
  buildNewOutput,
} from './fixtures/v23-vision.mjs';
import { fromRecognition } from '../src/domain/foodRecord.js';
import { buildIngredientCard, matchIngredient } from '../src/domain/ingredients/index.js';
import { DEMO_SAMPLES } from '../src/domain/demoData.js';
import { RULE_COUNT } from '../src/domain/claims/registry.js';
import { chooseSecondRoundGap } from '../server/providers/ingredientResearch.js';
import {
  ACESULFAME_K,
  ACETIC_ACID,
  STANDARD_ONLY,
  HEALTH_FIXTURES,
  buildReplayResearch,
} from './fixtures/v23-health.mjs';

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

// ---------------------------------------------------------------- 素材

// 长配料素材放在 fixtures/v23-vision.mjs，报告与测试共用同一份
/**
 * token 估算刻意取最保守的口径：1 个字符 ≈ 1 个 token。
 * 中文分词通常更省（约 0.6），但开发阶段不能调用付费接口实测，
 * 所以用「上界」来判断预算是否安全 —— 上界够用，实际一定够用。
 */
const estTokens = (chars) => Math.round(chars);

const OLD = buildOldOutput();
const NEW = buildNewOutput();

console.log('\n【A】识别输出体积与截断（1-14）');

t(1, '同一份 63 项配料，新结构的输出字符数明显更少', () => {
  const saved = OLD.length - NEW.length;
  const ratio = saved / OLD.length;
  console.log(`         旧 ${OLD.length} 字符 / 新 ${NEW.length} 字符（减少 ${(ratio * 100).toFixed(1)}%，最保守口径约 ${estTokens(saved)} token）`);
  assert(ratio >= 0.4, `压缩比例不足：${(ratio * 100).toFixed(1)}%`);
});

t(2, '压缩后仍然完整保留配料原文（逐字相同）', () => {
  const p = JSON.parse(NEW);
  eq(p.ingredients_text, LONG_TEXT);
});

t(3, '压缩后营养数值精度不变（18 项逐项相同）', () => {
  const a = JSON.parse(OLD).nutrition.items;
  const b = JSON.parse(NEW).nutrition.items;
  eq(b.length, 18);
  eq(a, b);
});

t(4, '压缩后的输出仍在 4096 token 预算内，并留出余量', () => {
  const tokens = estTokens(NEW.length);
  console.log(`         最保守估算 ${tokens} token / 上限 ${VISION_MAX_TOKENS}`);
  assert(tokens < VISION_MAX_TOKENS * 0.75, `余量不足：${tokens}`);
});

t(5, '提示词明确要求只写一次配料原文，不再输出配料对象数组', () => {
  assert(/不要输出 ingredients 数组/.test(SYSTEM_PROMPT), '提示词缺少禁止数组的指令');
  assert(/完整写入 ingredients_text/.test(SYSTEM_PROMPT), '提示词没有强调原文完整性');
  assert(!/"ingredients":\s*\[/.test(SYSTEM_PROMPT), '提示词仍给出 ingredients 数组示例');
});

t(6, 'schema 不再要求 ingredients，结构校验不会因为缺它而失败', () => {
  assert(!('ingredients' in PACKAGE_SCHEMA), 'ingredients 仍在 schema 中');
  const r = validateStructure(JSON.parse(NEW), PACKAGE_SCHEMA);
  eq(r.missing, []);
  eq(r.wrongType, []);
  eq(r.valid, true);
});

t(7, '服务端从原文解析出全部配料项，不需要模型给数组', () => {
  const r = interpretVisionContent(NEW);
  eq(r.structure.valid, true);
  eq(r.derivedIngredients, LONG_ITEMS.length);
  eq(r.parsedValue.ingredients.length, LONG_ITEMS.length);
});

t(8, '多层括号的子配料被完整保留（含嵌套的鸡骨提取物）', () => {
  const r = interpretVisionContent(NEW);
  const group = r.parsedValue.ingredients.find((i) => i.name === '复合调味料');
  assert(group, '没有解析出复合调味料');
  const rec = fromRecognition(r.parsedValue);
  const item = rec.ingredients.items.find((i) => i.name === '复合调味料');
  assert(item.children.length === 8, `子项数量不对：${item.children.length}`);
  const chicken = item.children.find((c) => c.name === '鸡肉粉');
  assert(chicken?.children?.length === 2, '第二层括号没有保留');
});

t(9, '旧结构（模型仍然返回数组）不会重复计数，也不会被判为结构错误', () => {
  const r = interpretVisionContent(OLD);
  eq(r.structure.valid, true);
  assert(r.structure.extra.includes('ingredients'), '应把多出来的 ingredients 记为 extra');
  eq(r.derivedIngredients, LONG_ITEMS.length, '已经给出数组时不应再重复解析');
});

t(10, '截断在配料原文中途：不把半截配料当成完整项', () => {
  const cut = NEW.slice(0, NEW.indexOf('复合调味料') + 6);
  const r = interpretVisionContent(cut);
  // 前面的短字段可以恢复，但被截断的配料原文一个字都不能留下
  assert(!r.parsedValue?.ingredients_text, '半截配料原文被当成完整内容');
  eq(r.parsedValue?.ingredients, undefined, '不应从半截原文解析配料结构');
  eq(r.recovery.truncatedKey, 'ingredients_text');
});

t(11, '截断在营养表中途：配料原文仍完整，营养只保留已闭合项', () => {
  const cut = NEW.slice(0, NEW.indexOf('"维生素 B1"'));
  const r = interpretVisionContent(cut);
  eq(r.partial, true);
  eq(r.parsedValue.ingredients_text, LONG_TEXT);
  const n = r.parsedValue.nutrition.items.length;
  assert(n >= 10 && n < 18, `应保留部分营养项，实际 ${n}`);
  assert(
    !r.parsedValue.nutrition.items.some((it) => it.name === '维生素 B1'),
    '截断处的半截营养项被保留',
  );
  assert(r.missingFields.includes('claims'), '应报出未完成字段');
});

t(12, '截断后仍缺哪些字段是可计算的（供界面标注「本次没有完成」）', () => {
  const cut = NEW.slice(0, NEW.indexOf('"维生素 B1"'));
  const r = interpretVisionContent(cut);
  const essential = r.missingFields.filter((k) => ['ingredients_text', 'nutrition', 'product_name'].includes(k));
  eq(essential, [], '核心字段其实已经写完了');
  assert(r.missingFields.includes('unreadable'), '缺失字段列表不完整');
});

t(13, 'finish_reason=length 时，拿不到任何字段就如实判为不可用', () => {
  const r = interpretVisionContent('{"product_name":"长配料');
  eq(r.parsedValue, null);
  const d = buildVisionDiagnostics({
    requestId: '007942',
    res: { status: 200, data: { usage: { prompt_tokens: 1800, completion_tokens: 4096 } } },
    choice: { finish_reason: 'length' },
    rawContent: '{"product_name":"长配料',
    content: '{"product_name":"长配料',
    interpreted: r,
    maxTokens: VISION_MAX_TOKENS,
  });
  eq(d.requestId, '007942');
  eq(d.finishReason, 'length');
  eq(d.maxTokens, 4096);
  eq(d.branch, 'unusable');
  eq(d.usage.completionTokens, 4096);
});

t(14, '诊断记录里有编号、max_tokens、恢复情况，且不含原文与密钥', () => {
  const content = `{"product_name":"脆笋","ingredients_text":"饮用水、竹笋"}`;
  const r = interpretVisionContent(`${content}sk-abcdef123456 data:image/jpeg;base64,AAAA`);
  const d = buildVisionDiagnostics({
    requestId: 'A1B2C3',
    res: { status: 200 },
    choice: { finish_reason: 'stop' },
    rawContent: 'x',
    content: `${content}sk-abcdef123456 data:image/jpeg;base64,AAAA`,
    interpreted: r,
    maxTokens: 4096,
  });
  const line = JSON.stringify(d);
  assert(line.includes('A1B2C3'), '缺少编号');
  assert(line.includes('"maxTokens":4096'), '缺少 max_tokens');
  assert(!line.includes('sk-'), '诊断里出现了密钥');
  assert(!line.includes('base64'), '诊断里出现了图片数据');
  assert(!line.includes('饮用水'), '诊断里出现了配料原文');
});

console.log('\n【B】检索：健康资料为什么没被找到（15-24）');

t(15, '旧行为复现：只传中文名时，查询词里没有任何英文名', () => {
  const q = buildSearchQuery('安赛蜜', []);
  eq(q.head, '安赛蜜');
  assert(!/acesulfame/i.test(q.query), '不应出现英文名');
  assert(q.length <= 128);
});

t(16, '补上同物异名后，who.int / fao.org 才有机会命中英文评估文档', () => {
  const aliases = mergeAliases('安赛蜜', []);
  const q = buildSearchQuery('安赛蜜', aliases);
  assert(/acesulfame/i.test(q.query), `查询词仍没有英文名：${q.query}`);
  assert(q.query.includes('site:who.int'), '缺少 who.int');
  assert(q.query.includes('site:fao.org'), '缺少 fao.org');
  assert(q.length <= 128, `超长：${q.length}`);
});

t(17, '五个常见物质都能在 128 字符内带入英文名', () => {
  for (const name of ['安赛蜜', '冰乙酸', '三氯蔗糖', '阿斯巴甜', '山梨酸钾']) {
    const q = buildSearchQuery(name, mergeAliases(name, []));
    assert(q.length <= 128, `${name} 查询超长：${q.length}`);
    assert(/[a-z]{4,}/i.test(q.head), `${name} 没有英文名：${q.head}`);
  }
});

t(18, '健康专项查询带上 ADI 与评估机构，且不超过 128 字符', () => {
  const q = buildHealthQuery({ name: '安赛蜜', aliases: mergeAliases('安赛蜜', []) });
  assert(/\bADI\b/.test(q.query), '缺少 ADI');
  eq(q.sites.slice(0, 2), ['who.int', 'fao.org']);
  assert(q.length <= 128, `超长：${q.length}`);
  eq(getHealthSitePriority()[0], 'who.int');
});

t(19, '只有 GB 2760 技术资料时，判定「没有健康评估资料」', () => {
  const cov = findHealthEvidence(STANDARD_ONLY.sources, { names: ['安赛蜜', 'acesulfame'] });
  eq(cov.available, false);
  eq(cov.evidenceIds, []);
});

t(20, '有 JECFA 评估资料时，判定「有健康评估资料」', () => {
  const cov = findHealthEvidence(ACETIC_ACID.sources, { names: ['冰乙酸', 'acetic acid'] });
  eq(cov.available, true);
  assert(cov.evidenceIds.includes('W1'), '应命中 W1');
  assert(cov.markers.length > 0, '应记下识别到的术语');
});

t(21, '资料里提到的不是这个物质，不算该物质的健康资料', () => {
  const cov = findHealthEvidence(ACETIC_ACID.sources, { names: ['安赛蜜'] });
  eq(cov.available, false);
});

t(22, '第二轮预算的用途：身份缺口优先，其次健康缺口，都有就不补', () => {
  eq(chooseSecondRoundGap({ foodEvidenceOk: false, healthAvailable: false, hasLocalEntry: false }), 'identity');
  eq(chooseSecondRoundGap({ foodEvidenceOk: false, healthAvailable: true, hasLocalEntry: true }), 'food_use');
  eq(chooseSecondRoundGap({ foodEvidenceOk: true, healthAvailable: false }), 'health');
  eq(chooseSecondRoundGap({ foodEvidenceOk: true, healthAvailable: true }), null);
});

t(23, '证据分类：GB 2760 使用标准不算健康评估，JECFA 评估页才算', () => {
  const standard = {
    id: 'W1',
    title: 'GB 2760-2024 食品添加剂使用标准',
    excerpt: '安赛蜜 功能：甜味剂。最大使用量按表 A.1 执行，食品分类号 14.04。',
  };
  const risk = {
    id: 'W2',
    title: 'ACESULFAME POTASSIUM（JECFA）',
    excerpt: 'Evaluation year: 1990. ADI: 0-15 mg/kg bw.',
  };
  eq(classifyEvidenceKind(standard).kind, EVIDENCE_KIND.STANDARD);
  eq(classifyEvidenceKind(risk).kind, EVIDENCE_KIND.RISK);
  eq(findHealthEvidence([standard], { names: ['安赛蜜'] }).available, false);
  eq(findHealthEvidence([risk], { names: ['acesulfame'] }).available, true);
});

t(24, '服务端不再接受浏览器回传的证据正文（无 priorSources 通道）', () => {
  const server = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  const app = readFileSync('server/app.js', 'utf8');
  const ui = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  assert(!/priorSources/.test(server), '服务端仍有 priorSources');
  assert(!/priorSources/.test(app), '接口仍接收 priorSources');
  assert(!/priorSources/.test(ui), '前端仍回传 priorSources');
  assert(!/sanitizeCarriedSources/.test(server), '仍有来源清洗函数（说明通道还在）');
});

console.log('\n【C】健康结论的证据核对（25-40）');

const check = (text, refs, extra = {}, fx = ACESULFAME_K) =>
  validateHealthInsights({
    raw: { normalIntake: { text, evidenceStatus: 'authoritative', sourceRefs: refs, ...extra } },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });

t(25, '没有原文摘句的健康结论一律拒绝', () => {
  const r = check('JECFA 给安赛蜜设了 0–15 mg/kg 体重的 ADI。', ['W1']);
  eq(r.insights, null);
  assert(/原文摘句/.test(r.rejected[0].rejectReason), r.rejected[0].rejectReason);
});

t(26, '摘句在来源里找不到 → 拒绝（不能假装核对过）', () => {
  const r = check('安赛蜜会导致肝损伤。', ['W1'], { quote: 'acesulfame causes liver damage' });
  eq(r.insights, null);
  assert(/找不到/.test(r.rejected[0].rejectReason), r.rejected[0].rejectReason);
});

t(27, '摘句与标点/空格差异不影响核对（PDF 换行、全半角）', () => {
  const q = 'ADI： 0–15  mg/kg  bw';
  const r = check('JECFA 的 ADI 是 0–15 mg/kg 体重。', ['W1'], { quote: q });
  assert(r.insights, `应通过：${r.rejected[0]?.rejectReason}`);
});

t(28, '编号标错但原文确实在另一份来源里 → 程序改正引用后接受', () => {
  const r = check('ADI 是按体重计、终生每日摄入的估计量。', ['W2'], {
    quote: 'ADI: 0-15 mg/kg bw',
  });
  // 摘句其实来自 W1，但只引用了 W2（不含这句）→ 程序在全部证据里找到 W1 并改正
  assert(r.insights, r.rejected[0]?.rejectReason);
  assert(r.insights.normalIntake.sourceRefs.includes('W1'), '引用没有被改正');
  eq(r.insights.normalIntake.refCorrected, true);
});

t(29, '结论里的数值在来源中找不到 → 拒绝', () => {
  const r = check('JECFA 把安赛蜜的 ADI 定为 0–40 mg/kg 体重。', ['W1'], {
    quote: 'ADI: 0-15 mg/kg bw',
  });
  eq(r.insights, null);
  assert(/40/.test(r.rejected[0].rejectReason), r.rejected[0].rejectReason);
});

t(30, '结论里的数值确实在来源中 → 接受，并保留原文', () => {
  const r = check('JECFA 的评估把安赛蜜的 ADI 定为 0–15 mg/kg 体重。', ['W1'], {
    quote: 'ADI: 0-15 mg/kg bw',
    sourceYear: '1990',
  });
  assert(r.insights, r.rejected[0]?.rejectReason);
  eq(r.insights.normalIntake.quoteSourceId, 'W1');
  eq(r.insights.normalIntake.sourceYear, '1990');
  eq(r.insights.normalIntake.yearVerified, true);
});

t(31, '年份写了却核对不上 → 不展示年份，并降级为「可靠资料支持」', () => {
  const r = check('JECFA 的评估把安赛蜜的 ADI 定为 0–15 mg/kg 体重。', ['W1'], {
    quote: 'ADI: 0-15 mg/kg bw',
    sourceYear: '2016',
  });
  assert(r.insights, '结论本身应保留');
  eq(r.insights.normalIntake.sourceYear, null);
  eq(r.insights.normalIntake.evidenceStatus, 'supported');
});

t(32, '缺省陈述（资料没有给出…）允许保留，但强制标为「资料不足」', () => {
  const r = check('本次资料没有给出超过 ADI 后的人体反应描述。', ['W1']);
  assert(r.insights, r.rejected[0]?.rejectReason);
  eq(r.insights.normalIntake.evidenceStatus, 'insufficient');
  eq(r.insights.normalIntake.absence, true);
});

t(33, '夹带安全判断的缺省陈述不算缺省，仍要求原文', () => {
  eq(isAbsenceStatement('现有资料没有给出任何有害证据'), false);
  const r = check('现有资料没有给出任何有害证据。', ['W1']);
  eq(r.insights, null);
});

t(34, '用「有国家标准」推出健康结论 → 拒绝', () => {
  const claim = 'GB 2760 允许使用安赛蜜，所以正常吃没问题。';
  const res = checkHealthClaim(claim, {
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
    citedEvidence: [{ id: 'W1', title: 't', excerpt: ACESULFAME_K.sources[0].excerpt }],
  });
  assert(res.issues.some((i) => i.rule === 'H' && /法规/.test(i.why)), JSON.stringify(res.issues));
});

t(35, '「not limited」不会被写成无限量（冰乙酸）', () => {
  const fx = ACETIC_ACID;
  const r = validateHealthInsights({
    raw: {
      highIntake: {
        text: '乙酸是 not limited，说明可以无限量摄入。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1', 'W2'],
        quote: 'A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives',
      },
    },
    evidenceSet: fx.sources,
    ingredientName: fx.name,
    aliases: fx.aliases,
  });
  eq(r.insights, null);
  assert(/无限量/.test(r.rejected[0].rejectReason) || /科学检查/.test(r.rejected[0].rejectReason), r.rejected[0].rejectReason);
});

t(36, '冰乙酸的正式样本：ADI「not limited」按术语原义解释，且不点名人群', () => {
  const r = validateHealthInsights({
    raw: ACETIC_ACID.model.healthInsights,
    evidenceSet: ACETIC_ACID.sources,
    ingredientName: '冰乙酸',
    aliases: ['acetic acid'],
  });
  eq(r.stats.rejected, 0);
  eq(r.stats.accepted, 3);
  const text = Object.values(r.insights).map((x) => x.text).join('');
  assert(!/孕妇|婴幼儿|肾病|苯丙酮尿症/.test(text), '无依据点名了人群');
  assert(!/无限量/.test(text), '把 not limited 说成无限量');
  assert(text.includes('not limited'), '没有解释原术语');
});

t(37, '安赛蜜的正式样本：ADI 可追溯，且不含阿斯巴甜的 PKU 提醒', () => {
  const r = validateHealthInsights({
    raw: ACESULFAME_K.model.healthInsights,
    evidenceSet: ACESULFAME_K.sources,
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
  });
  eq(r.stats.rejected, 0);
  const text = Object.values(r.insights).map((x) => x.text).join('');
  assert(!/苯丙酮尿症|PKU/.test(text), '把阿斯巴甜的人群提醒转移到了安赛蜜');
  assert(/15 mg\/kg/.test(text), '缺少 ADI 数值');
});

t(38, '把阿斯巴甜的 PKU 提醒硬塞给安赛蜜 → 拒绝', () => {
  const r = validateHealthInsights({
    raw: {
      sensitiveGroups: {
        text: '苯丙酮尿症患者需要限制安赛蜜的摄入。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-15 mg/kg bw',
      },
    },
    evidenceSet: ACESULFAME_K.sources,
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
  });
  eq(r.insights, null);
  assert(/没有出现这个人群/.test(r.rejected[0].rejectReason), r.rejected[0].rejectReason);
});

t(39, '权威状态只在「正式评估机构 + 原文可核对」时才给', () => {
  const weak = [
    {
      id: 'W1',
      title: '某科普网站转载',
      organization: '未知机构',
      sourceType: 'fetch_content',
      excerpt: '安赛蜜的 ADI 为 0-15 mg/kg bw。',
    },
  ];
  const r = validateHealthInsights({
    raw: {
      normalIntake: {
        text: '安赛蜜的 ADI 为 0–15 mg/kg 体重。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI 为 0-15 mg/kg bw',
      },
    },
    evidenceSet: weak,
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
  });
  assert(r.insights, r.rejected[0]?.rejectReason);
  eq(r.insights.normalIntake.evidenceStatus, 'supported');
});

t(40, '只有搜索摘要时不能标成权威评估', () => {
  const snippet = [
    {
      id: 'W1',
      title: 'JECFA acesulfame',
      organization: 'WHO',
      sourceType: 'search_summary',
      excerpt: 'ADI: 0-15 mg/kg bw for acesulfame potassium.',
    },
  ];
  const r = validateHealthInsights({
    raw: {
      normalIntake: {
        text: '安赛蜜的 ADI 为 0–15 mg/kg 体重。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-15 mg/kg bw',
      },
    },
    evidenceSet: snippet,
    ingredientName: '安赛蜜',
    aliases: ['acesulfame'],
  });
  eq(r.insights.normalIntake.evidenceStatus, 'supported');
});

console.log('\n【D】展示与钱（41-50）');

t(41, '健康视图带上原文、适用条件、评估年份，界面才可能展示依据', () => {
  const view = buildHealthView(buildReplayResearch(ACETIC_ACID));
  assert(view.headline, '缺少大字结论');
  assert(view.headline.quote, '缺少原文摘句');
  assert(view.headline.sourceYear, '缺少评估年份');
  assert(view.rows.some((r) => r.quote), '行内缺少原文');
});

t(42, '健康区块与深入分析不再重复同一句', () => {
  const research = buildReplayResearch(ACESULFAME_K, {
    identity: { type: 'additive', label: '食品添加剂 · 甜味剂' },
  });
  const core = buildIngredientCore({
    card: buildIngredientCard(matchIngredient('安赛蜜')),
    research,
  });
  // 页面顶部已有健康结论 → 深入分析不再放一张同样醒目的卡片
  eq(core.suppressed, true);
  eq(core.headline, null);
});

t(43, '只有技术标准时，健康区块为空，但身份与用途仍在', () => {
  const research = buildReplayResearch(STANDARD_ONLY);
  eq(research.healthInsights, null);
  eq(buildHealthView(research), null);
  const core = buildIngredientCore({
    card: buildIngredientCard(matchIngredient('安赛蜜')),
    research,
  });
  eq(core.label, '科学背景');
  assert(core.explanation && !/资料不足/.test(core.explanation), `身份解释丢了：${core.explanation}`);
});

t(44, '只有技术标准时，健康缺口说明是「本次没取得」，不是「这个成分没资料」', () => {
  const research = buildReplayResearch(STANDARD_ONLY);
  eq(research.healthInsights, null);
  const gap = buildHealthGapView({ ...research, healthRoundUsed: true });
  assert(/检索都没有取得/.test(gap.text), gap.text);
  assert(!gap.text.includes('不存在'), '不应暗示成分没有资料');
  assert(gap.missing.length === 3, '应记下三个问题都没答');
});

t(45, '费用提示写明检索/读取/规划预算，并由用户账户承担', () => {
  const src = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  assert(src.includes('最多使用 5 轮联网检索'), '缺少五轮预算说明');
  assert(/2 次研究规划/.test(src), '缺少规划调用说明');
  assert(/DeepSeek 账户[^\n]{0,12}承担/.test(src), '缺少费用承担说明');
  assert(!src.includes('补充查找健康评估资料'), '旧的补查按钮仍在');
});

t(46, '基础分析不再需要用户额外点击才能拿到健康资料', () => {
  const src = readFileSync('src/app/components/IngredientSheet.jsx', 'utf8');
  assert(!/onSupplement|supplementHealth/.test(src), '仍存在补查交互');
  const srv = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  assert(/planNextStep/.test(srv), '服务端没有研究规划');
  assert(/buildAssessmentQuery/.test(srv), '服务端没有按健康问题构造查询');
});

t(47, '服务端把检索/读取/规划都限制在硬预算内，且不是无限循环', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  const searchCalls = (src.match(/await search\(/g) || []).length;
  eq(searchCalls, 1, `搜索调用点应为 1 处（在预算循环里），实际 ${searchCalls}`);
  assert(/MAX_SEARCH_ROUNDS = 5/.test(src), '轮次上限不是 5');
  assert(/MAX_RESEARCH_FETCH_PAGES = 5/.test(src), '抓取上限不是 5');
  assert(/MAX_PLANNER_CALLS = 2/.test(src), '规划上限不是 2');
  assert(/while \(!stopReason && loopGuard < 12\)/.test(src), '没有带守卫的规划循环');
  assert(/budget\.searchesLeft -= 1/.test(src), '搜索没有扣减预算');
  assert(/budget\.fetchesLeft -= 1/.test(src), '抓取没有扣减预算');
});

t(48, '自动补搜的结果照常进缓存，但缓存键只由「成分 + 语境 + 知识库版本」决定', () => {
  const src = readFileSync('server/providers/ingredientResearch.js', 'utf8');
  assert(!/health-supplement/.test(src), '缓存键里还留着补查分支');
  assert(/RESEARCH_SCHEMA_VERSION,/.test(src), '缓存键没有带结构版本');
  assert(/LOCAL_KB_VERSION,\s*\n\s*RESEARCH_SCHEMA_VERSION,/.test(src), '缓存键结构变了');
});

t(49, '识别失败不会自动再发一次付费请求', () => {
  const src = readFileSync('server/providers/vision.js', 'utf8');
  const calls = (src.match(/postJson\(/g) || []).length;
  eq(calls, 1, 'vision.js 里应只有一处上游调用');
  const ui = readFileSync('src/app/pages/UploadPage.jsx', 'utf8');
  assert(!/setTimeout\([^)]*recognize\(/.test(ui), '前端出现了自动重试');
  assert(!/autoRetry|retryCount/.test(ui), '前端出现了重试计数');
});

t(50, '诊断日志会落盘，重启后仍能按编号回溯', () => {
  const dir = join(tmpdir(), `packtruth-visionlog-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const res = appendVisionDiagnostic({ requestId: '007942', stage: 'interpreted', maxTokens: 4096 }, { dir });
  eq(res.written, true);
  const line = readFileSync(join(dir, 'vision-diagnostics.jsonl'), 'utf8').trim();
  assert(line.includes('007942'), line);
  assert(line.includes('"ts"'), '缺少时间戳');
  rmSync(dir, { recursive: true, force: true });
});

console.log('\n【E】回归（51-56）');

t(51, 'BYOK 边界与凭据模块没有被改坏', () => {
  for (const f of ['server/lib/byokBoundary.js', 'server/lib/requestCredentials.js', 'src/lib/credentials.js']) {
    assert(existsSync(f), `${f} 丢失`);
  }
  const src = readFileSync('server/lib/byokBoundary.js', 'utf8');
  assert(/req\.get\('authorization'\)/.test(src), 'BYOK 读取 Authorization 头的逻辑变了');
  assert(/maxCalls/.test(src), '调用次数上限的逻辑变了');
});

t(52, '四个离线演示样品仍在', () => {
  eq(DEMO_SAMPLES.length, 4);
});

t(53, '30 条包装宣传语规则仍在', () => {
  eq(RULE_COUNT, 30);
});

t(54, '复合配料父子结构仍可点击分析', () => {
  const rec = fromRecognition({
    ingredients_text: '饮用水、食品添加剂（谷氨酸钠、柠檬酸）',
    nutrition: { basis: 'per_100g', items: [] },
  });
  const group = rec.ingredients.items.find((i) => i.name === '食品添加剂');
  eq(group.children.length, 2);
});

t(55, '三个回放样本都能被真实校验器接受（或按预期为空）', () => {
  for (const fx of HEALTH_FIXTURES) {
    const r = validateHealthInsights({
      raw: fx.model.healthInsights,
      evidenceSet: fx.sources,
      ingredientName: fx.name,
      aliases: fx.aliases,
    });
    const offered = fx.model.healthInsights ? Object.keys(fx.model.healthInsights).length : 0;
    eq(r.stats.accepted, offered, `${fx.key} 有健康条目被拒：${r.rejected.map((x) => x.rejectReason).join('; ')}`);
  }
});

t(56, '摘句归一化不会把两个不同的物质混成一句', () => {
  assert(normalizeQuote('ADI：0–15 mg/kg') === normalizeQuote('ADI: 0-15 mg/kg'));
  assert(verifyQuoteSupport('phenyllalanine', ACESULFAME_K.sources).ok === false);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail > 0) {
  console.log('失败项：');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  [${r.id}] ${r.name} — ${r.error}`);
}
process.exit(fail === 0 ? 0 : 1);
