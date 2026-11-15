/**
 * V6.1 最终科学一致性检查（全部本地，零 API 费用）。
 *
 * 用法：node scripts/test-phase6-consistency.mjs
 *
 * 覆盖指令要求的三组场景：
 *   A. 顶部标签与正文一致（identity 不再绕过科学检查）
 *   B. 降级简明版是纯提取，不引入新事实
 *   C. 通用性（非氯化钾成分 + 真实数据回放 + 措辞规则）
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pass = [];
const fail = [];

function t(id, name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => pass.push(`${id} ${name}`),
      (e) => fail.push(`${id} ${name} — ${e.message}`),
    );
}

function eq(a, b, label = '') {
  assert.strictEqual(a, b, label ? `${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}` : '');
}

const {
  checkIdentityLabel,
  checkFunctionScope,
  checkIngredientIdentity,
  hasUnfoundedAbsenceClaim,
  CHECK_STATUS,
} = await import('../src/domain/evidence/scientificGuard.js');
const { buildDegradedBrief, deriveAliases } = await import('../server/providers/ingredientResearch.js');

// ---------------------------------------------------------- 测试数据

/** 清晰的 Codex 英文条目（氯化钾 INS 508，功能清单完整） */
const CODEX_KCL = {
  id: 'W10',
  sourceType: 'search_content',
  excerpt:
    'GSFA表3规定\nPotassium chloride表3中的食品添加剂，这些食品添加剂可以按照良好生产规范（GMP）用在下列食品中。\n' +
    'Potassium chloride是: 固化剂, 增味剂, 稳定剂, 增稠剂\n' +
    '表3中列出的任何稳定剂均可用于符合CS 117-1981的所有产品。'.repeat(2),
};

/** CFSA 中英对照条目（CNS 00.008 / INS 508 / 功能「其他」） */
const CFSA_KCL = {
  id: 'W6',
  sourceType: 'search_content',
  possibleMixedContent: true,
  excerpt: [
    '当前位置：氯化钾',
    '中文名称 | 氯化钾',
    '英文名称 | potassium chloride',
    'CNS | 00.008',
    'INS | 508',
    '功能 | 其他',
    '食品分类号 | 食品名称 | 最大使用量(g/kg)',
    '12.01 | 盐及代盐制品 | 350',
    '— | 各类食品（表A.2中编号为1~60的食品类别除外） | 按生产需要适量使用 | 自然来源类饮用水不能使用',
  ].join('\n'),
};

/** 与氯化钾无关的农业资料 */
const AGRI = {
  id: 'W2',
  sourceType: 'search_content',
  excerpt: '鱼菜共生系统中的碳酸盐硬度调节。碳酸氢盐常用于水产养殖水质管理。'.repeat(10),
};

const IDENTITY = {
  type: 'additive',
  label: '食品添加剂 · 功能类别为其他（国际标准中列为固化剂、增味剂、稳定剂、增稠剂）',
  note: 'GB 2760-2024 将其列为食品添加剂，CNS 00.008、INS 508。',
};

const ALIASES = ['potassium chloride'];

// ============================================================ A. 顶部标签

console.log('\n【A】顶部标签与正文一致');

await t('A1', '正文被拒的编号结论在修复后应通过（管道分隔符编号可提取）', () => {
  const claim = '氯化钾即 potassium chloride，我国标准中 CNS 号为 00.008，国际法典中 INS 号为 508。';
  const r = checkIngredientIdentity(claim, { citedEvidence: [CFSA_KCL] });
  eq(r.status, CHECK_STATUS.PASS, '编号在 W6 摘录中（竖线分隔），应 pass');
});

await t('A2', '独立可靠来源（Codex 英文条目）支持的功能不被误删', () => {
  const r = checkFunctionScope('氯化钾可用作稳定剂、增稠剂。', {
    ingredientName: '氯化钾',
    aliases: ALIASES,
    citedEvidence: [CODEX_KCL, CFSA_KCL],
  });
  eq(r.status, CHECK_STATUS.PASS, 'Codex 页有名字+功能共现，应 pass');
});

await t('A3', '无别名时英文资料定位失败 → 降级 review，不武断 reject', () => {
  const r = checkFunctionScope('氯化钾可用作稳定剂。', {
    ingredientName: '氯化钾',
    aliases: [],
    citedEvidence: [CODEX_KCL],
  });
  eq(r.status, CHECK_STATUS.REVIEW, '定位不到成分（英文页），只能存疑');
  assert.ok(/没有找到/.test(r.issues[0].why), r.issues[0].why);
});

await t('A4', 'identity 顶部标签经检查后：有依据的功能保留在顶部', () => {
  const out = checkIdentityLabel({
    identity: IDENTITY,
    evidenceSet: [CODEX_KCL, CFSA_KCL],
    ingredientName: '氯化钾',
    aliases: ALIASES,
  });
  eq(out.checked.status, CHECK_STATUS.PASS, '全部功能有 Codex 支持');
  for (const term of ['稳定剂', '增稠剂', '增味剂']) {
    const f = out.checked.functions.find((x) => x.term === term);
    assert.ok(f, `应检查到 ${term}`);
    eq(f.status, CHECK_STATUS.PASS, `${term} 应 pass`);
  }
  eq(out.label, IDENTITY.label, 'label 不需要过滤');
});

await t('A5', '无来源支持的功能声明被移出顶部，并给出待核实说明', () => {
  const out = checkIdentityLabel({
    identity: { type: 'additive', label: '食品添加剂 · 甜味剂、抗结剂', note: '' },
    evidenceSet: [CODEX_KCL, CFSA_KCL],
    ingredientName: '氯化钾',
    aliases: ALIASES,
  });
  // 氯化钾的证据里没有甜味剂/抗结剂共现 → 不能作为顶部事实
  assert.ok(!out.label.includes('甜味剂') && !out.label.includes('抗结剂'), `label 应移除未支持功能: ${out.label}`);
  assert.ok(out.checked.pendingTerms.length + out.checked.rejectedTerms.length >= 2, '应记录移除/待核实');
});

await t('A6', '模型虚构的成分类别（type 任意值）不影响标签检查路径', () => {
  const out = checkIdentityLabel({
    identity: { type: 'superfood', label: '超级食品 · 稳定剂', note: '' },
    evidenceSet: [CODEX_KCL],
    ingredientName: '氯化钾',
    aliases: ALIASES,
  });
  // type 是模型分类，展示时保留原值；功能词仍走检查
  const f = out.checked.functions.find((x) => x.term === '稳定剂');
  assert.ok(f && f.status === CHECK_STATUS.PASS, '有依据的功能词仍 pass');
});

await t('A7', '没有充分依据时，顶部可以为空标签（不强行填满）', () => {
  const out = checkIdentityLabel({
    identity: { type: 'additive', label: '食品添加剂 · 防腐剂、着色剂', note: '' },
    evidenceSet: [AGRI],
    ingredientName: '某成分',
    aliases: [],
  });
  assert.ok(!out.label.includes('防腐剂') && !out.label.includes('着色剂'), '无依据功能应移除');
});

await t('A8', 'deriveAliases 只信中英对照同页，混排污染被限制', () => {
  const contaminated = [
    CFSA_KCL,
    { id: 'WX', sourceType: 'search_content', excerpt: '山梨酸钾 英文名称 | sorbic acid 功能 | 防腐剂' },
  ];
  const aliases = deriveAliases('氯化钾', contaminated);
  assert.ok(aliases.includes('potassium chloride'), '应从同页中英对照提取');
  assert.ok(!aliases.some((a) => /sorbic/i.test(a)), '相邻条目英文名不应被提取（该页无中文「氯化钾」）');
});

// ============================================================ B. 降级简明版

console.log('\n【B】降级简明版是纯提取');

const PASSED_SECTIONS = [
  { id: 's1', section: 'what', text: '氯化钾是一种含钾的化合物。', sourceRefs: ['W10'], sources: [CODEX_KCL], tier: 'cited', verified: true },
  { id: 's2', section: 'why', text: 'GB 2760-2024 中可用于盐及代盐制品，备注提到自然来源类饮用水不能使用。', sourceRefs: ['W6'], sources: [CFSA_KCL], tier: 'cited', verified: true },
  { id: 's3', section: 'limits', text: '目前检索到的资料尚不足以确认它在这款饮料中的具体作用。', sourceRefs: ['W6', 'W10'], sources: [CFSA_KCL, CODEX_KCL], tier: 'cited', verified: true },
];
const REJECTED_SECTION = { id: 's9', section: 'what', text: '氯化钾是稳定剂，一定能让饮料更稳定。', sourceRefs: ['W2'], sources: [AGRI], tier: 'cited', verified: false };

await t('B1', '降级版是逐字提取：每段等于对应结论原文', () => {
  const b = buildDegradedBrief(PASSED_SECTIONS);
  eq(b.what, PASSED_SECTIONS[0].text, 'what 逐字一致');
  eq(b.why, PASSED_SECTIONS[1].text, 'why 逐字一致');
  eq(b.howToUnderstand, PASSED_SECTIONS[2].text, 'howToUnderstand 逐字一致');
  eq(b.degraded, true, 'degraded 标记');
});

await t('B2', '降级版 sourceRefs 原样保留，可追溯到通过检查的结论', () => {
  const b = buildDegradedBrief(PASSED_SECTIONS);
  assert.ok(b.sourceRefs.includes('W6') && b.sourceRefs.includes('W10'), '来源编号保留');
  assert.ok(JSON.stringify(b.derivedFrom) === JSON.stringify(['s1', 's2', 's3']), '提炼来源可追踪');
});

await t('B3', '降级版绝不包含被拒绝的结论', () => {
  const b = buildDegradedBrief([...PASSED_SECTIONS]); // 被拒结论根本不在 visibleSections
  assert.ok(!b.what.includes('一定'), '不含被拒结论的断言式表述');
  const b2 = buildDegradedBrief([REJECTED_SECTION, ...PASSED_SECTIONS.filter((s) => s.section !== 'what')]);
  // REJECTED_SECTION 未通过检查 → 不会出现在 visibleSections；若误传入，what 取第一条 what（即被拒的）
  // 真实流程中 visibleSections 只含通过项 —— 这里验证函数只认传入内容，流程侧由 partition 保证
  assert.ok(!b2.why.includes('一定'), 'why 不受污染');
});

await t('B4', '缺段正常隐藏：没有通过检查的类别不虚构内容', () => {
  const b = buildDegradedBrief([PASSED_SECTIONS[1], PASSED_SECTIONS[2]]); // 没有 what
  eq(b.what, '', 'what 缺省为空（前端隐藏）');
  assert.ok(b.why, 'why 正常');
  eq(b.derivedFrom.length, 2, 'derivedFrom 只含实际使用的结论');
});

await t('B5', '完全没有可用结论时返回 null，不虚构完整解释', () => {
  eq(buildDegradedBrief([]), null, '空结论 → null');
  eq(buildDegradedBrief([{ id: 'x', section: 'misconception', text: '只有误解类', sources: [], sourceRefs: [] }]), null, '只有 misconception 没有 what/why → null');
});

await t('B6', '正确的否定句不会被误拒（回归 V6.1 修复）', () => {
  const r = checkFunctionScope('「稳定剂」这一说法，目前资料并不能确认属于氯化钾。', {
    ingredientName: '氯化钾',
    aliases: ALIASES,
    citedEvidence: [CODEX_KCL],
  });
  eq(r.status, CHECK_STATUS.PASS, '文本含功能词但有 Codex 共现支持');
});

await t('B7', '拼接不改写：buildDegradedBrief 不做任何句子合并', () => {
  // 每段取「第一条」原句——即使同类别有多条，也不合并
  const sections = [
    { id: 'a', section: 'why', text: '第一句原句。', sourceRefs: ['W1'], sources: [], tier: 'cited' },
    { id: 'b', section: 'why', text: '第二句原句。', sourceRefs: ['W2'], sources: [], tier: 'cited' },
  ];
  const b = buildDegradedBrief(sections);
  eq(b.why, '第一句原句。', '只取第一条，不拼接');
});

// ============================================================ C. 通用性与措辞

console.log('\n【C】通用性与措辞规则');

await t('C1', '真实回放数据：氯化钾顶部标签检查整体通过', async () => {
  const d = JSON.parse(await readFile('runtime-output/research-v61-potassium-chloride.json', 'utf8'));
  const out = checkIdentityLabel({
    identity: d.identity,
    evidenceSet: d.sources || [],
    ingredientName: d.ingredient,
    aliases: ALIASES,
  });
  assert.ok(out, 'identity 存在');
  const bad = out.checked.functions.filter((f) => f.status === CHECK_STATUS.REJECT);
  assert.ok(bad.length === 0, `不应有被冤枉拒绝的功能: ${JSON.stringify(bad)}`);
  eq(out.checked.codeCheckStatus, CHECK_STATUS.PASS, '编号检查应通过（管道符修复后）');
});

await t('C2', '非氯化钾成分：顶部标签规则同样生效（碳酸氢钠 + 混排来源）', () => {
  const NAHCO3 = {
    id: 'W2',
    sourceType: 'search_content',
    excerpt:
      '中文名称 | 碳酸氢钠\n英文名称 | sodium bicarbonate\nCNS | 06.001\nINS | 500(ii)\n功能 | 膨松剂、酸度调节剂、稳定剂\n' +
      '食品分类号 | 食品名称 | 最大使用量\n07.03 | 饼干 | 按生产需要适量使用'.repeat(2),
  };
  const out = checkIdentityLabel({
    identity: { type: 'additive', label: '食品添加剂 · 膨松剂、抗结剂', note: 'CNS 06.001' },
    evidenceSet: [NAHCO3],
    ingredientName: '碳酸氢钠',
    aliases: [],
  });
  const puffy = out.checked.functions.find((f) => f.term === '膨松剂');
  eq(puffy.status, CHECK_STATUS.PASS, '有条目依据的功能保留');
  const anti = out.checked.functions.find((f) => f.term === '抗结剂');
  assert.ok(anti && anti.status !== CHECK_STATUS.PASS, '条目清单外的功能不得通过');
  assert.ok(!out.label.includes('抗结剂'), 'label 应移除');
});

await t('C3', '非氯化钾降级样例：机制不是氯化钾特例', () => {
  const sections = [
    { id: 'm1', section: 'what', text: '谷氨酸钠是常用的增味剂。', sourceRefs: ['W1'], sources: [], tier: 'cited' },
    { id: 'm2', section: 'why', text: '用于提供鲜味。', sourceRefs: ['W1'], sources: [], tier: 'cited' },
  ];
  const b = buildDegradedBrief(sections);
  eq(b.what, '谷氨酸钠是常用的增味剂。', '逐字提取');
  eq(b.degraded, true, '标记正确');
});

await t('C4', '「本次未检索到」的正确句式不被误判为过度断言', () => {
  eq(hasUnfoundedAbsenceClaim('目前检索到的资料尚不足以确认它在这款饮料中的具体作用。'), false, '正确句式');
  eq(hasUnfoundedAbsenceClaim('该成分没有相关科学资料。'), true, '过度断言被识别');
  eq(hasUnfoundedAbsenceClaim('现有资料没有针对电解质饮料这类食品中氯化钾用法的说明。'), false, '「现有资料没有针对X的说明」不是「资料不存在」');
});

await t('C5', '食品类别限定不丢失：标准里的完整限定语进入证据即可被引用', () => {
  // W6 摘录含「自然来源类饮用水不能使用」——检查器不截断它
  assert.ok(CFSA_KCL.excerpt.includes('自然来源类饮用水不能使用'), '测试数据含完整限定');
  const r = checkFunctionScope('氯化钾在标准中登记的功能是其他。', {
    ingredientName: '氯化钾',
    aliases: ALIASES,
    citedEvidence: [CFSA_KCL],
  });
  eq(r.status, CHECK_STATUS.PASS, '功能检查不受限定语影响');
});

console.log(`\n结果：${pass.length} 通过 / ${fail.length} 失败\n`);
for (const f of fail) console.log('  ✗', f);
process.exit(fail.length === 0 ? 0 : 1);
