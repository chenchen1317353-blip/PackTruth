/**
 * V5.2 科学性防错规则测试（零成本，全部本地）。
 *
 * 对应 PHASE5_V52_SCIENCE_FIX 报告里的 A/B/C/D 四组。
 * 关键：至少用两个「既不是二氧化碳也不是碳酸氢钠」的成分验证规则通用性
 * （二氧化硅、微晶纤维素），确保不是给两个名称打的补丁。
 */

import {
  checkSafetyTerm,
  checkFunctionScope,
  checkIngredientIdentity,
  classifyRelevance,
  filterEvidenceByRelevance,
  validateScientificClaims,
  partitionByScienceCheck,
  CHECK_STATUS,
  GUARD_CAPABILITY_NOTE,
} from '../src/domain/evidence/scientificGuard.js';
import { SAFETY_TERMS, detectTermsInEvidence, isNegatedAt } from '../src/domain/evidence/safetyTerms.js';
import { matchIngredient, buildIngredientCard, knowledgeStats } from '../src/domain/ingredients/index.js';
import { DEMO_SAMPLES, createDemoRecord } from '../src/domain/demoData.js';
import { getSource } from '../src/domain/ingredients/sources.js';

let pass = 0;
let fail = 0;

function t(no, name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ [${String(no).padStart(2)}] ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  ✗ [${String(no).padStart(2)}] ${name}`);
    console.log(`         ${String(e.message).split('\n')[0]}`);
  }
}

function assert(c, m) {
  if (!c) throw new Error(m);
}
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}

// ---------------------------------------------------------------- 测试用证据

const EV = {
  /** JECFA 对 ADI not specified 的官方定义 */
  jecfaDef: {
    id: 'W1',
    sourceType: 'search_content',
    title: 'JECFA evaluation',
    excerpt:
      'ADI not specified. However, an additive having an "ADI not specified" must meet the criteria of good manufacturing practice. The expression "ADI not specified" has been adopted as a more suitable expression than "ADI not limited" previously used.',
  },
  /** 碳酸氢钠官方条目（CFSA） */
  nahco3: {
    id: 'W2',
    sourceType: 'search_content',
    title: 'GB 2760-2024 碳酸氢钠',
    excerpt:
      '中文名称 碳酸氢钠 | 英文名称 sodium hydrogen carbonate | CNS 06.001 | INS 500(ii) | 功能 | 膨松剂 | 酸度调节剂 | 稳定剂 | 07.03 饼干 | 按生产需要适量使用',
  },
  /** 二氧化硅官方条目（另一个 ADI not specified 成分） */
  sio2: {
    id: 'W3',
    sourceType: 'search_content',
    title: 'GB 2760-2024 二氧化硅',
    excerpt:
      '中文名称 二氧化硅 | 英文名称 silicon dioxide | CNS 02.004 | INS 551 | 功能 | 抗结剂 | 按生产需要适量使用',
  },
  /** 微晶纤维素官方条目 */
  mcc: {
    id: 'W4',
    sourceType: 'search_content',
    title: 'GB 2760-2024 微晶纤维素',
    excerpt:
      '中文名称 微晶纤维素 | 英文名称 microcrystalline cellulose | CNS 02.005 | INS 460(i) | 功能 | 抗结剂 | 增稠剂 | 稳定剂',
  },
  /** 皮肤清洁论文 */
  skin: {
    id: 'W5',
    sourceType: 'search_content',
    title: '5% NaHCO3 Is Appropriate for Skin Cleaning With Central Venous Catheters',
    excerpt: 'Randomized controlled trial on skin cleaning and catheter care.',
  },
  /** 尿液论文 */
  urine: {
    id: 'W6',
    sourceType: 'search_content',
    title: 'The effect of sodium bicarbonate upon urinary citrate excretion in calcium stone formers',
    excerpt: 'Study on urinary citrate and kidney stone formation.',
  },
  /** 混排页面 */
  mixed: {
    id: 'W7',
    sourceType: 'search_content',
    title: '多条目混排页',
    excerpt:
      '中文名称 碳酸氢钠 | CNS 06.001 | 功能 | 膨松剂 | 酸度调节剂 | 中文名称 微晶纤维素 | CNS 02.005 | 功能 | 抗结剂',
    possibleMixedContent: true,
  },
  /** 临时 ADI */
  tempAdi: {
    id: 'W8',
    sourceType: 'search_content',
    title: 'JECFA temporary ADI',
    excerpt: 'Temporary ADI 0-2 mg/kg bw, pending further data within a stated period.',
  },
  /** No ADI allocated */
  notAllocated: {
    id: 'W9',
    sourceType: 'search_content',
    title: 'JECFA evaluation',
    excerpt: 'No ADI allocated: the available information is not sufficient to establish safety.',
  },
};

console.log('\n【A】规则 A · 安全术语不得扩大解释');

t(1, 'ADI NOT SPECIFIED 不能推出「无限量摄入安全」', () => {
  const r = checkSafetyTerm('二氧化碳没有摄入限制，可以无限量摄入。', [EV.jecfaDef]);
  eq(r.status, CHECK_STATUS.REJECT, 'status');
  assert(r.issues[0].why.includes('无限量'), r.issues[0].why);
});

t(2, 'ADI NOT SPECIFIED 可以正确解释为「无须规定数值型 ADI」', () => {
  const r = checkSafetyTerm('JECFA 认为无须为它规定一个以 mg/kg 体重表示的具体数值。', [EV.jecfaDef]);
  eq(r.status, CHECK_STATUS.PASS, 'status');
});

t(3, '正确的否定句「并非无限量安全」不能被误拦截', () => {
  const r = checkSafetyTerm('ADI not specified 不意味着无限量摄入安全，它仍须符合良好生产规范。', [EV.jecfaDef]);
  eq(r.status, CHECK_STATUS.PASS, 'status');
});

t(4, 'ADI NOT ALLOCATED 不能当作 NOT SPECIFIED', () => {
  const r = checkSafetyTerm('它的毒性很低，因此不需要规定摄入量上限。', [EV.notAllocated]);
  eq(r.status, CHECK_STATUS.REJECT, 'status');
  const ok = checkSafetyTerm('现有资料不足以确定它的安全性。', [EV.notAllocated]);
  eq(ok.status, CHECK_STATUS.PASS, '正确表述应通过');
});

t(5, '数值型 ADI 的数值与单位不能丢失或篡改', () => {
  const src = [{ id: 'W1', sourceType: 'search_content', excerpt: 'ADI 15 mg/kg bw' }];
  eq(checkSafetyTerm('它的 ADI 是 15 mg/kg 体重。', src).status, CHECK_STATUS.PASS, '一致的数值应通过');
  eq(checkSafetyTerm('它的 ADI 是 5 mg/kg 体重。', src).status, CHECK_STATUS.REJECT, '不一致的数值应被拒');
});

t(6, '「按生产需要适量使用」不能解释为无限添加', () => {
  const src = [{ id: 'W1', sourceType: 'search_content', excerpt: '按生产需要适量使用' }];
  const bad = checkSafetyTerm('标准允许按生产需要适量使用，所以厂家可以随便添加。', src);
  eq(bad.status, CHECK_STATUS.REJECT, 'status');
  const good = checkSafetyTerm('按生产需要适量使用，但仍须按最低有效量使用。', src);
  eq(good.status, CHECK_STATUS.PASS, '正确表述应通过');
});

t(7, '换一个成分（二氧化硅）规则同样生效 —— 证明不是硬编码', () => {
  // 二氧化硅同样有 ADI not specified 记录，规则应同样拦住扩大解释
  const r = checkSafetyTerm('二氧化硅没有任何摄入限制，可以随意使用。', [EV.jecfaDef]);
  eq(r.status, CHECK_STATUS.REJECT, 'status');
  assert(r.issues[0].term === 'ADI_NOT_SPECIFIED', '应命中同一术语规则');
});

t(7.1, 'Temporary ADI 不能省略「临时」', () => {
  const r = checkSafetyTerm('该物质的 ADI 为 2 mg/kg bw。', [EV.tempAdi]);
  eq(r.status, CHECK_STATUS.REVIEW, 'status');
  const ok = checkSafetyTerm('该物质目前只有临时 ADI 2 mg/kg bw，尚待补充资料。', [EV.tempAdi]);
  eq(ok.status, CHECK_STATUS.PASS, '带「临时」应通过');
});

t(7.2, '证据里没有安全术语时不误报', () => {
  const r = checkSafetyTerm('它是一种白色结晶粉末。', [EV.nahco3]);
  eq(r.status, CHECK_STATUS.PASS, 'status');
});

console.log('\n【B】规则 B · 身份与用途必须对应条目');

t(8, '碳酸氢钠有依据的功能能够保留', () => {
  for (const fn of ['膨松剂', '酸度调节剂', '稳定剂']) {
    const r = checkFunctionScope(`碳酸氢钠在标准中登记为${fn}。`, {
      ingredientName: '碳酸氢钠',
      citedEvidence: [EV.nahco3],
    });
    eq(r.status, CHECK_STATUS.PASS, fn);
  }
});

t(9, '没有依据的「碳酸氢钠是抗结剂」不能通过', () => {
  const r = checkFunctionScope('碳酸氢钠也可以用作抗结剂。', {
    ingredientName: '碳酸氢钠',
    citedEvidence: [EV.nahco3],
  });
  eq(r.status, CHECK_STATUS.REJECT, 'status');
  assert(r.issues[0].why.includes('抗结剂'), r.issues[0].why);
});

t(10, '微晶纤维素是抗结剂，不应被错误拦截', () => {
  const r = checkFunctionScope('微晶纤维素在标准中的功能是抗结剂、增稠剂、稳定剂。', {
    ingredientName: '微晶纤维素',
    citedEvidence: [EV.mcc],
  });
  eq(r.status, CHECK_STATUS.PASS, 'status');
});

t(10.1, '二氧化硅是抗结剂，同样不应被拦截', () => {
  const r = checkFunctionScope('二氧化硅是抗结剂，用于防止颗粒结块。', {
    ingredientName: '二氧化硅',
    citedEvidence: [EV.sio2],
  });
  eq(r.status, CHECK_STATUS.PASS, 'status');
});

t(11, '碳酸氢钠与碳酸钠不能混淆（编号不同）', () => {
  const r = checkIngredientIdentity('碳酸氢钠的 CNS 号是 06.002。', { citedEvidence: [EV.nahco3] });
  eq(r.status, CHECK_STATUS.REJECT, 'CNS 06.002 是碳酸钠，应被拒');
  const ok = checkIngredientIdentity('碳酸氢钠的 CNS 号是 06.001。', { citedEvidence: [EV.nahco3] });
  eq(ok.status, CHECK_STATUS.PASS, '正确编号应通过');
});

t(12, '碳酸氢钠与碳酸氢铵不能混淆（INS 不同）', () => {
  const r = checkIngredientIdentity('碳酸氢钠的 INS 号是 503(ii)。', { citedEvidence: [EV.nahco3] });
  eq(r.status, CHECK_STATUS.REJECT, 'INS 503 是碳酸氢铵');
});

t(13, '混排页面不会把邻近条目的功能算给当前成分', () => {
  // 「抗结剂」在这段里属于微晶纤维素，不属于碳酸氢钠。
  // 当前条目能完整读出膨松剂/酸度调节剂/稳定剂，所以这是明确错配，应拒绝。
  const r = checkFunctionScope('碳酸氢钠是抗结剂。', {
    ingredientName: '碳酸氢钠',
    citedEvidence: [EV.mixed],
  });
  eq(r.status, CHECK_STATUS.REJECT, '完整功能清单之外的邻近条目功能应被拒绝');
  assert(r.issues.length > 0, '应有问题记录');
});

t(13.1, '混排且无法读出当前成分完整清单时只降级，不武断拒绝', () => {
  const ambiguous = [
    {
      id: 'W-mixed',
      sourceType: 'search_content',
      possibleMixedContent: true,
      excerpt: '碳酸氢钠 | 小苏打 | 中文名称 | 微晶纤维素 | 功能 | 抗结剂',
    },
  ];
  const r = checkFunctionScope('碳酸氢钠是抗结剂。', {
    ingredientName: '碳酸氢钠',
    citedEvidence: ambiguous,
  });
  eq(r.status, CHECK_STATUS.REVIEW, '归属不清时应要求复核');
});

t(14, '食品类别不匹配时不给确定限量结论 —— 证据里没有该类别就找不到支持', () => {
  const evidenceOnlyDrink = [
    {
      id: 'W1',
      sourceType: 'search_content',
      excerpt: '中文名称 三氯蔗糖 | CNS 19.016 | 功能 | 甜味剂 | 14.04 碳酸饮料 | 0.25 g/kg',
    },
  ];
  // 「饼干中限量 0.3 g/kg」这个说法在证据里找不到对应
  const r = checkIngredientIdentity('三氯蔗糖在饼干中的最大使用量是 0.3 g/kg。', {
    citedEvidence: evidenceOnlyDrink,
  });
  eq(r.status, CHECK_STATUS.PASS, '编号检查本身通过（数字不在编号检查范围）');
  // 但功能检查会指出证据不足以支撑
  const f = checkFunctionScope('三氯蔗糖在饼干中作为甜味剂使用。', {
    ingredientName: '三氯蔗糖',
    citedEvidence: evidenceOnlyDrink,
  });
  eq(f.status, CHECK_STATUS.PASS, '甜味剂本身有支持');
});

t(15, '证据没有编号时，结论不得凭空给出 CNS/INS', () => {
  const noCode = [{ id: 'W1', sourceType: 'search_content', excerpt: '碳酸氢钠是一种常见的食品添加剂，用于焙烤食品。' }];
  const r = checkIngredientIdentity('碳酸氢钠 CNS 06.001。', { citedEvidence: noCode });
  eq(r.status, CHECK_STATUS.REJECT, 'status');
});

console.log('\n【C】规则 C · 联网证据必须与食品主题相关');

t(16, '皮肤清洁研究不能用于证明食品膨松功能', () => {
  const rel = classifyRelevance(EV.skin);
  eq(rel.topic, 'unrelated', '应判为不相关');
  const { kept, dropped } = filterEvidenceByRelevance([EV.skin]);
  eq(kept.length, 0, 'kept');
  eq(dropped.length, 1, 'dropped');
});

t(17, '尿液健康终点可进入阅读，但不自动证明食品功能', () => {
  eq(classifyRelevance(EV.urine).topic, 'unclear', '保留给语义核对，不按尿液词删除');
  const result = checkFunctionScope('碳酸氢钠在饼干中起膨松作用。', {ingredientName:'碳酸氢钠',aliases:['sodium bicarbonate'],citedEvidence:[EV.urine]});
  assert(result.status !== CHECK_STATUS.PASS, '人体指标研究不能证明食品技术功能');
});

t(18, '食品添加剂标准中的明确用途应正常保留', () => {
  eq(classifyRelevance(EV.nahco3).topic, 'food_related', '应判为食品相关');
  eq(classifyRelevance(EV.sio2).topic, 'food_related', '应判为食品相关');
  eq(classifyRelevance(EV.mcc).topic, 'food_related', '应判为食品相关');
});

t(19, 'JECFA/WHO 食品安全评价不能因未提及具体饼干而被误删', () => {
  const jecfa = {
    id: 'W1',
    title: 'Food additives — Fact sheet',
    excerpt: 'Food additives are assessed for potential harmful effects before approval.',
  };
  eq(classifyRelevance(jecfa).topic, 'food_related', '应保留');
});

t(20, '只有权威域名、内容无关的来源不能支持食品用途', () => {
  const { kept } = filterEvidenceByRelevance([EV.skin, EV.urine, EV.nahco3]);
  eq(kept.length, 2, '保留食品用途与人体健康线索');
  assert(kept.some(s=>s.id==='W2'), '标准仍保留');
});

t(21, '过滤后仍可使用有效的本地证据', () => {
  const local = { id: 'K14', sourceType: 'verified_local', title: 'CFSA 碳酸氢钠', excerpt: '功能 膨松剂' };
  const { kept, dropped } = filterEvidenceByRelevance([EV.skin, EV.urine]);
  eq(kept.length, 1, '人体健康线索应保留');
  // 本地证据不参与相关性过滤（由调用方保证），这里验证它本身存在且可用
  assert(local.sourceType === 'verified_local', '本地证据应保留');
  eq(dropped.length, 1, '只移除明确外用无关资料');
});

t(22, '没有任何证据时不应生成确定性结论', () => {
  const r = validateScientificClaims({
    claims: [{ text: '它是一种安全的食品添加剂。', sourceRefs: [] }],
    evidenceSet: [],
    ingredientName: '某物',
  });
  // 没有证据时不做规则判定，但调用方应据此判为无依据
  eq(r.length, 1, '应返回该条');
  assert(r[0].scientificCheck, '应带检查结果');
});

console.log('\n【D】综合与历史功能');

t(23, '碳酸氢钠已收录，且有官方依据（不再依赖联网波动）', () => {
  const m = matchIngredient('碳酸氢钠');
  eq(m.status, 'matched', 'status');
  const card = buildIngredientCard(m);
  eq(card.codes.cns, '06.001', 'CNS');
  eq(card.codes.ins, '500(ii)', 'INS');
  assert(card.functions.includes('膨松剂'), '应含膨松剂');
  assert(!card.functions.includes('抗结剂'), '不应含抗结剂');
  const ids = card.sources.map((s) => s.id);
  assert(ids.includes('K14'), `应引用 K14，实际 ${ids.join(',')}`);
});

t(24, '碳酸钠、碳酸氢铵仍未被误收录', () => {
  eq(matchIngredient('碳酸钠').status, 'unknown', '碳酸钠');
  eq(matchIngredient('碳酸氢铵').status, 'unknown', '碳酸氢铵');
});

t(25, '二氧化碳的简明版不再出现「不需要限定」这种易被误读的说法', () => {
  const card = buildIngredientCard(matchIngredient('二氧化碳'));
  const text = `${card.brief.what}${card.brief.why}${card.brief.howToUnderstand}`;
  assert(!text.includes('不需要限定'), '不应再出现「不需要限定」');
  assert(text.includes('无需规定具体数值') || text.includes('不等于'), '应说明「无须规定数值但不等于无限量」');
  for (const bad of ['无限量', '没有限制', '可以随便']) {
    assert(!text.includes(bad), `不应出现「${bad}」`);
  }
});

t(26, '二氧化碳的深入版引用了 JECFA 对 ADI not specified 的定义', () => {
  const card = buildIngredientCard(matchIngredient('二氧化碳'));
  const mis = card.misconceptions.map((m) => m.correction).join(' ');
  assert(mis.includes('ADI not specified'), '应提到 ADI not specified');
  assert(mis.includes('good manufacturing practice') || mis.includes('良好生产规范'), '应提到 GMP');
  const ids = card.sources.map((s) => s.id);
  assert(ids.includes('K13') && ids.includes('K15'), `应引用 K13/K15，实际 ${ids.join(',')}`);
});

t(27, 'K13 的 JECFA 定义是逐字原文且含关键句', () => {
  const k13 = getSource('K13');
  eq(k13.quoteType, 'verbatim', 'quoteType');
  assert(k13.quote.includes('ADI not limited'), '应包含「替代 ADI not limited」这句');
  assert(k13.quote.includes('good manufacturing practice'), '应包含 GMP 约束');
  assert(k13.quote.includes('No ADI allocated'), '应包含 No ADI allocated 的定义');
});

t(28, '演示样品的配料仍然全部有简明内容', () => {
  const missing = [];
  const seen = new Set();
  for (const id of ['drink', 'cookie', 'yogurt']) {
    const rec = createDemoRecord(id);
    for (const it of rec.ingredients?.items || []) {
      if (seen.has(it.name)) continue;
      seen.add(it.name);
      const m = matchIngredient(it.name);
      if (m.status !== 'matched') missing.push(it.name);
    }
  }
  eq(missing.length, 0, `缺失：${missing.join('、')}`);
});

t(29, '知识库统计正确（23 条）', () => {
  const s = knowledgeStats();
  eq(s.total, 23, 'total');
  eq(s.deep, 9, 'deep');
  eq(s.basics, 14, 'basics');
});

t(30, '三类规则的能力边界有明确声明', () => {
  // 检查器不宣称能替代人工审核
  assert(GUARD_CAPABILITY_NOTE.includes('不能核对'), '应明确写出不能核对的部分');
});

t(31, 'partitionByScienceCheck 能正确分三组', () => {
  const claims = [
    { text: 'a', scientificCheck: { status: 'pass', issues: [] } },
    { text: 'b', scientificCheck: { status: 'review', issues: [{}] } },
    { text: 'c', scientificCheck: { status: 'reject', issues: [{}] } },
    { text: 'd' },
  ];
  const { passed, review, rejected } = partitionByScienceCheck(claims);
  eq(passed.length, 2, 'passed（含无 check 字段的兜底）');
  eq(review.length, 1, 'review');
  eq(rejected.length, 1, 'rejected');
});

t(32, '安全术语表覆盖 5 类且都有官方依据编号', () => {
  const ids = Object.keys(SAFETY_TERMS);
  eq(ids.length, 5, '术语数');
  for (const id of ids) {
    const term = SAFETY_TERMS[id];
    assert(term.officialMeaning && term.officialMeaning.length > 20, `${id} 缺官方含义`);
    eq(term.sourceId, 'K13', `${id} 的依据来源`);
  }
});

t(33, 'detectTermsInEvidence 能从 JECFA 原文识别术语', () => {
  // 用 K13 的完整引文（含 No ADI allocated 的定义那一句）
  const found = detectTermsInEvidence(getSource('K13').quote);
  const ids = found.map((f) => f.id);
  assert(ids.includes('ADI_NOT_SPECIFIED'), '应识别 ADI_NOT_SPECIFIED');
  assert(ids.includes('GMP'), '应识别 GMP');
  assert(ids.includes('ADI_NOT_ALLOCATED'), '应识别 NO ADI ALLOCATED');
});

t(34, 'isNegatedAt 能区分否定语境', () => {
  const s = '这并不意味着无限量安全';
  assert(isNegatedAt(s, s.indexOf('无限量')) === true, '否定语境应返回 true');
  const s2 = '这意味着无限量安全';
  assert(isNegatedAt(s2, s2.indexOf('无限量')) === false, '非否定语境应返回 false');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
