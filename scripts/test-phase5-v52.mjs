/**
 * 第五阶段 V5.2 领域层测试（零成本）。
 *
 * 聚焦本次修订新增的三件事：
 *   1. 简明三段（brief）的引用校验
 *   2. 混合表格检测（防止把相邻添加剂的数值当成自己的）
 *   3. 通用性：任意成分都能走流程，且所有演示配料都有简明内容
 *
 * 不调用任何真实 API。
 */

import { verifyCitations } from '../src/domain/evidence/citationGuard.js';
import { detectMixedTable } from '../server/providers/ingredientResearch.js';
import {
  matchIngredient,
  buildIngredientCard,
  knowledgeStats,
  ALL_INGREDIENTS,
} from '../src/domain/ingredients/index.js';
import { DEMO_SAMPLES, createDemoRecord } from '../src/domain/demoData.js';
import { getSource } from '../src/domain/ingredients/sources.js';

let pass = 0;
let fail = 0;

function t(no, name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${no}. ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  ✗ ${no}. ${name}`);
    console.log(`      ${String(e.message).split('\n')[0]}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(a, b, label) {
  if (a !== b) throw new Error(`${label}：期望 ${b}，实际 ${a}`);
}

const SR = (id, sourceType, excerpt, extra = {}) => ({
  id,
  title: `来源 ${id}`,
  organization: '测试机构',
  sourceType,
  url: `https://who.int/${id.toLowerCase()}`,
  excerpt,
  excerptType: sourceType === 'search_summary' ? 'search_snippet' : 'search_body_excerpt',
  ...extra,
});

const SOURCES = [
  SR('K8', 'verified_local', '三氯蔗糖（又名蔗糖素）　功能：甜味剂', { excerptType: 'verbatim_local' }),
  SR('W1', 'search_content', '三氯蔗糖在 GB 2760-2024 中登记为甜味剂，CNS 19.016。'),
  SR('W2', 'search_summary', '搜索摘要：三氯蔗糖是一种甜味剂。'),
];

// ============================================================ A. 简明三段校验
console.log('\n【A】简明三段校验');

t('A1', '合规的 brief 能通过并保留来源', () => {
  const r = verifyCitations({
    aiOutput: {
      brief: {
        what: '三氯蔗糖是一种甜味剂。',
        why: '它用来给食品提供甜味。',
        howToUnderstand: '它和蔗糖不是同一种物质。',
        sourceRefs: ['K8', 'W1'],
      },
      sections: [{ section: 'what', text: '三氯蔗糖是甜味剂。', sourceRefs: ['K8'] }],
    },
    evidenceSources: SOURCES,
  });
  assert(r.brief, `brief 不应为空：${r.briefRejectReason}`);
  eq(r.brief.sourceRefs.join(','), 'K8,W1', 'sourceRefs');
  eq(r.brief.verified, true, 'verified');
  eq(r.brief.tier, 'cited', 'tier');
  assert(r.brief.charCount > 0, 'charCount');
});

t('A2', '三段缺一段 → 不通过，返回原因', () => {
  const r = verifyCitations({
    aiOutput: {
      brief: { what: '有内容', why: '', howToUnderstand: '有内容', sourceRefs: ['K8'] },
      sections: [{ section: 'what', text: 'x', sourceRefs: ['K8'] }],
    },
    evidenceSources: SOURCES,
  });
  eq(r.brief, null, 'brief 应为 null');
  assert(r.briefRejectReason.includes('不完整'), r.briefRejectReason);
});

t('A3', 'brief 没有来源 → 不通过', () => {
  const r = verifyCitations({
    aiOutput: {
      brief: { what: 'a', why: 'b', howToUnderstand: 'c', sourceRefs: [] },
      sections: [{ section: 'what', text: 'x', sourceRefs: ['K8'] }],
    },
    evidenceSources: SOURCES,
  });
  eq(r.brief, null, 'brief');
  assert(r.briefRejectReason.includes('没有引用'), r.briefRejectReason);
});

t('A4', 'brief 引用不存在的编号 → 不通过', () => {
  const r = verifyCitations({
    aiOutput: {
      brief: { what: 'a', why: 'b', howToUnderstand: 'c', sourceRefs: ['W99'] },
      sections: [{ section: 'what', text: 'x', sourceRefs: ['K8'] }],
    },
    evidenceSources: SOURCES,
  });
  eq(r.brief, null, 'brief');
  assert(r.briefRejectReason.includes('不存在'), r.briefRejectReason);
});

t('A5', 'brief 只引摘要级来源 → 标为 snippet_only', () => {
  const r = verifyCitations({
    aiOutput: {
      brief: { what: 'a', why: 'b', howToUnderstand: 'c', sourceRefs: ['W2'] },
      sections: [{ section: 'what', text: 'x', sourceRefs: ['W2'] }],
    },
    evidenceSources: SOURCES,
  });
  assert(r.brief, 'brief 应存在');
  eq(r.brief.tier, 'snippet_only', 'tier');
});

t('A6', '完全没有 brief 时给出明确原因，不影响 sections 校验', () => {
  const r = verifyCitations({
    aiOutput: { sections: [{ section: 'what', text: 'x', sourceRefs: ['K8'] }] },
    evidenceSources: SOURCES,
  });
  eq(r.brief, null, 'brief');
  eq(r.briefRejectReason, '没有提供简明版', 'reason');
  eq(r.sections.length, 1, 'sections 仍应正常校验');
});

// ============================================================ B. 混合表格检测
console.log('\n【B】混合表格检测（防止数值串行）');

t('B1', '一页里出现多个 CNS 号 → 判定为混排', () => {
  const text = `
    三氯蔗糖（蔗糖素） CNS号19.016 INS号955 功能甜味剂
    03.01 冰淇淋类 3.0
    山梨酸钾 CNS号17.003 INS号202 功能防腐剂
    07.01 面包 0.1
  `;
  eq(detectMixedTable(text), true, 'should detect');
});

t('B2', '单一条目页面不误判', () => {
  const text = '三氯蔗糖（又名蔗糖素） 中文名称 | 三氯蔗糖 英文名称 | sucralose CNS | 19.016 INS | 955 功能 | 甜味剂 最大使用量 0.3';
  eq(detectMixedTable(text), false, 'should not detect');
});

t('B3', '同一页出现两个限量表头 → 判定为混排', () => {
  const text = '食品分类号 | 食品名称 | 最大使用量 03.01 冰淇淋类 3.0 食品分类号 | 食品名称 | 最大使用量 07.01 面包 0.1';
  eq(detectMixedTable(text), true, 'should detect');
});

t('B4', '空内容不误判', () => {
  eq(detectMixedTable(''), false, 'empty');
  eq(detectMixedTable(null), false, 'null');
});

// ============================================================ C. 通用性：任意成分都能进入流程
console.log('\n【C】通用性与覆盖检查');

t('C1', '本地未收录的成分仍能被识别为「需要联网」而不是报错', () => {
  for (const name of ['亚硝酸钠', '卡拉胶', '谷氨酸钠', '黄原胶']) {
    const m = matchIngredient(name);
    eq(m.status, 'unknown', `${name} 目前应为未收录`);
    assert(m.input === name, '输入应保留');
  }
});

t('C2', '知识库统计能区分「深度条目」与「基础条目」', () => {
  const s = knowledgeStats();
  eq(s.deep, 9, '深度条目数');
  eq(s.basics, 14, '基础条目数');
  eq(s.total, 23, '总条目数');
  assert(s.byType.additive > 0 && s.byType.food_ingredient > 0, '应同时有添加剂与普通原料');
});

t('C3', '三个演示样品的全部配料都有简要解释（不出现「未收录」）', () => {
  const seen = new Set();
  const missing = [];
  // 演示四有意包含未收录的具体添加剂，用它验证「不编造」而不是覆盖率
  for (const id of ['drink', 'cookie', 'yogurt']) {
    const rec = createDemoRecord(id);
    for (const it of rec.ingredients?.items || []) {
      if (seen.has(it.name)) continue;
      seen.add(it.name);
      const m = matchIngredient(it.name);
      if (m.status !== 'matched') {
        missing.push(it.name);
        continue;
      }
      const card = buildIngredientCard(m);
      if (!card?.brief?.what || !card?.brief?.why || !card?.brief?.howToUnderstand) {
        missing.push(`${it.name}（缺 brief）`);
      }
    }
  }
  eq(missing.length, 0, `以下配料缺简明解释：${missing.join('、')}`);
  assert(seen.size >= 17, `演示配料应不少于 17 个，实际 ${seen.size}`);
});

t('C4', '二氧化碳的简明卡不暗示有害，且说明「不需要限定」的评估结论', () => {
  const m = matchIngredient('二氧化碳');
  eq(m.status, 'matched', '二氧化碳应已收录');
  const card = buildIngredientCard(m);
  const text = `${card.brief.what}${card.brief.why}${card.brief.howToUnderstand}`;

  eq(card.categoryType, 'additive', '应标为食品添加剂');
  assert(text.includes('气泡'), '应说明气泡作用');
  // V5.2 科学性修复后，表述改为「无须规定具体数值 + 不等于无限量」
  assert(
    text.includes('无需规定具体数值') || text.includes('无须规定'),
    '应说明无须规定具体数值型摄入上限',
  );
  assert(text.includes('不等于'), '应说明「无须规定数值」不等于「可以无限添加」');

  for (const bad of ['有害', '危险', '毒素', '不建议', '避免食用']) {
    assert(!text.includes(bad), `不应出现「${bad}」`);
  }
});

t('C5', '普通原料不会被标成食品添加剂', () => {
  for (const name of ['水', '小麦粉', '白砂糖', '植物油', '鸡蛋', '食用盐', '生牛乳']) {
    const m = matchIngredient(name);
    eq(m.status, 'matched', `${name} 应已收录`);
    eq(m.entry.categoryType, 'food_ingredient', `${name} 应为普通食品配料`);
  }
});

t('C6', '柠檬酸钠的功能与 CNS 号来自官方条目', () => {
  const m = matchIngredient('柠檬酸钠');
  const card = buildIngredientCard(m);
  eq(card.categoryType, 'additive', 'categoryType');
  assert(card.functions.includes('酸度调节剂'), '应含酸度调节剂');
  assert(card.functions.includes('稳定剂'), '应含稳定剂');
  eq(card.codes.cns, '01.303', 'CNS');
});

t('C7', '食用香精引用的是附录 B 的香料条款', () => {
  const m = matchIngredient('食用香精');
  const card = buildIngredientCard(m);
  const ids = card.sources.map((s) => s.id);
  assert(ids.includes('K10'), `应引用 K10，实际 ${ids.join(',')}`);
  const k10 = getSource('K10');
  assert(k10.quote.includes('使食品产生、改变或提高食品的风味'), 'K10 应为逐字原文');
  eq(k10.quoteType, 'verbatim', 'quoteType');
});

t('C8', '简明三段长度都在合理区间（不是一段长文）', () => {
  const tooLong = [];
  for (const entry of ALL_INGREDIENTS) {
    const b = entry.brief;
    if (!b) {
      tooLong.push(`${entry.canonicalName}（无 brief）`);
      continue;
    }
    const total = b.what.length + b.why.length + b.howToUnderstand.length;
    if (total > 420) tooLong.push(`${entry.canonicalName}(${total}字)`);
  }
  eq(tooLong.length, 0, `以下条目简明版过长：${tooLong.join('、')}`);
});

t('C9', '所有条目的来源编号都真实存在', () => {
  const bad = [];
  for (const entry of ALL_INGREDIENTS) {
    for (const id of entry.sourceIds || []) {
      if (!getSource(id)) bad.push(`${entry.canonicalName}→${id}`);
    }
  }
  eq(bad.length, 0, `引用了不存在的来源：${bad.join('、')}`);
});

t('C10', 'V5.2 新增来源 K10–K12 都是逐字摘录且有真实链接', () => {
  for (const id of ['K10', 'K11', 'K12']) {
    const s = getSource(id);
    assert(s, `${id} 不存在`);
    eq(s.quoteType, 'verbatim', `${id} quoteType`);
    assert(s.quote && s.quote.length > 20, `${id} 摘录过短`);
    assert(/^https?:\/\//.test(s.url), `${id} 链接不合法`);
    assert(s.verifiedAt, `${id} 缺核实时间`);
  }
});

t('C11', '简明版与深入版引用的是同一套来源（不各说各话）', () => {
  const m = matchIngredient('三氯蔗糖');
  const card = buildIngredientCard(m);
  // 本地条目的 brief 与 misconceptions 都用 card.sources 这一套
  const srcIds = new Set(card.sources.map((s) => s.id));
  assert(srcIds.size > 0, '应有来源');
  for (const mis of card.misconceptions) {
    for (const s of mis.sources) {
      assert(srcIds.has(s.id), `误解引用了不在来源列表里的 ${s.id}`);
    }
  }
});

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
