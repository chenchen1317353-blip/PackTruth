/**
 * 配料、加工方式与泛营销类宣传语。
 *
 * 这些规则与营养含量声称不同：没有可以直接套用的数值阈值，
 * 所以它们只做三件事——说清这句话在描述什么、能核对到什么、不能推出什么。
 * 任何一条都不会凭空造阈值，也不会下「违法 / 欺诈」结论。
 *
 * V2.1 变化：
 * 1. 「不添加糖 / 蔗糖」遇到明确的添加糖配料时，给出「不一致疑点」；
 *    糖醇、低聚糖、甜味剂、天然含糖原料与复合配料线索分别处理，避免误报。
 * 2. 「不添加防腐剂 / 色素」只在配料身份和用途有充分依据时才提示冲突，
 *    二氧化碳这类「登记功能含防腐剂、实际另有主要用途」的成分只作弱提示。
 * 3. 非数值宣传语不再把 GB 28050 写成工艺或营销词的认定依据；
 *    涉及 GB 7718—2025 的卡片，主界面可见 2027-03-16 的版本提示。
 */

import { ALL_INGREDIENTS, matchIngredient } from '../../ingredients/index.js';
import { READ_STATE, basisSentence, readNutrient, per100Unit } from '../nutritionFacts.js';
import {
  ANALYSIS_STATUS,
  FUTURE_STANDARD_NOTE,
  INGREDIENT_MISMATCH_LABEL,
  makeResult,
  mismatchMeta,
  roundTo,
} from '../shared.js';

const num = (v) => (Number.isFinite(v) ? String(roundTo(v, 2)) : '—');

function sugarFact(reading, ctx) {
  const b = per100Unit(ctx);
  if (reading.state === READ_STATE.OK) {
    return { label: '标签糖标示值', value: `${num(reading.value)} g / 100 ${b}` };
  }
  if (reading.state === READ_STATE.NOT_LABELED || reading.state === READ_STATE.ABSENT) {
    return { label: '营养成分表「糖」', value: '包装未标示', tone: 'missing' };
  }
  return { label: '营养成分表「糖」', value: '数值待确认', tone: 'pending' };
}

function fiberFact(reading, ctx) {
  if (reading.state !== READ_STATE.OK) return null;
  const b = per100Unit(ctx);
  return { label: '标签膳食纤维', value: `${num(reading.value)} g / 100 ${b}`, tone: 'note' };
}

// ---------------------------------------------------------------- 糖线索分类

/**
 * 名字里有「糖」不等于就是添加糖。顺序很重要：
 * 先排除糖醇 / 低聚糖 / 甜味剂 / 糖酸盐，再判断是不是明确的添加糖。
 */
const NON_SUGAR_RULES = [
  { kind: 'polyol', label: '糖醇', re: /糖醇/ },
  {
    kind: 'fiber',
    label: '低聚糖或膳食纤维',
    re: /低聚(果糖|半乳糖|异麦芽糖|木糖|阿拉伯糖)|菊粉|聚葡萄糖|抗性糊精/,
  },
  { kind: 'additive', label: '甜味剂或乳化剂', re: /三氯蔗糖|蔗糖素|蔗糖脂肪酸酯|蔗糖酯/ },
  {
    kind: 'additive',
    label: '葡萄糖酸盐或酶制剂',
    re: /葡萄糖酸(钠|钙|锌|亚铁|内酯)|葡萄糖氧化酶/,
  },
  {
    kind: 'sweetener',
    label: '甜味剂',
    re: /甜菊糖苷|罗汉果甜苷|阿斯巴甜|安赛蜜|甜蜜素|糖精|纽甜|索马甜|甘草甜素/,
  },
  { kind: 'carrier', label: '糊精或淀粉类载体', re: /麦芽糊精|变性淀粉/ },
];

const ADDED_SUGAR_RE =
  /白砂糖|绵白糖|冰糖|红糖|黄糖|黑糖|砂糖|蔗糖|葡萄糖(?!酸)|果糖|果葡糖浆|葡萄糖浆|玉米糖浆|麦芽糖浆|大米糖浆|淀粉糖浆|转化糖浆|糖浆|糖粉|糖霜|海藻糖|麦芽糖(?!醇|浆)|结晶果糖|结晶葡萄糖/;

const AMBIGUOUS_SUGAR_RE =
  /蜂蜜|蜂王浆|浓缩果汁|浓缩果浆|果汁|果浆|果干|葡萄干|红枣|糖蜜|麦芽提取物|大麦芽/;

const SUCROSE_RE = /白砂糖|绵白糖|冰糖|红糖|黄糖|黑糖|砂糖|蔗糖|糖粉|糖霜/;

/**
 * @returns {{kind:'added_sugar'|'ambiguous'|'polyol'|'fiber'|'sweetener'|'additive'|'carrier', label:string}|null}
 */
export function classifySugarClue(rawName) {
  const name = String(rawName || '').replace(/[\s　]/g, '');
  if (!name) return null;

  // 复合配料括号里的糖：能看见，但看不出加入方式与比例 → 只作不确定线索
  const inner = name.match(/[（(]([^）)]*)[）)]/);
  if (inner && ADDED_SUGAR_RE.test(inner[1])) {
    return { kind: 'ambiguous', label: '复合配料内的含糖线索' };
  }

  for (const rule of NON_SUGAR_RULES) {
    if (rule.re.test(name)) return { kind: rule.kind, label: rule.label };
  }
  if (ADDED_SUGAR_RE.test(name)) return { kind: 'added_sugar', label: '明确的添加糖配料' };
  if (AMBIGUOUS_SUGAR_RE.test(name)) return { kind: 'ambiguous', label: '含糖但需要核实的配料' };
  return null;
}

export function isSucroseClue(rawName) {
  const name = String(rawName || '').replace(/[\s　]/g, '');
  if (!name) return false;
  const clue = classifySugarClue(name);
  if (!clue || clue.kind !== 'added_sugar') return false;
  return SUCROSE_RE.test(name);
}

/** 从配料表里找「功能类别被直接写出来」或「知识库登记了该功能」的成分 */
function additiveClues(ctx, functionName) {
  const out = [];
  for (const name of ctx.ingredientNames) {
    if (!name) continue;
    if (String(name).includes(functionName)) {
      out.push({ name, via: '配料表直接写出功能类别', entry: null, confidence: 'strong' });
      continue;
    }
    const m = matchIngredient(name);
    if (m.status === 'matched') {
      const fns = m.entry.functions || [];
      const cat = String(m.entry.categoryLabel || '');
      if (fns.includes(functionName) || cat.includes(functionName)) {
        // 二氧化碳在 GB 2760 中登记功能含防腐剂，但在饮料里主要是产气
        const weak = m.entry.id === 'carbon-dioxide';
        out.push({
          name,
          via: '知识库登记的功能类别',
          entry: m.entry,
          confidence: weak ? 'weak' : 'strong',
        });
      }
    }
  }
  return out;
}

function knowledgeHint() {
  return `本地知识库目前收录 ${ALL_INGREDIENTS.length} 个成分，覆盖范围有限。`;
}

function ingredientMismatchNote(claimText, names, extra = '') {
  return `你选择了「${claimText}」，但确认的配料表中出现了「${names.join(
    '、',
  )}」。${extra}建议先核对宣传语是否确实印在这款包装上，以及配料识别是否准确。`;
}

// ---------------------------------------------------------------- 不添加糖

export function analyzeNoAddedSugar(claim, ctx) {
  const claimText = claim?.text || '不添加糖';
  const base = makeResult(claim, 'no_added_sugar', {
    ruleName: '不添加糖 / 无添加糖',
    claimType: 'ingredient',
    ruleVersion: 'GB 28050—2011 + GB 7718—2025',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const sugar = readNutrient(ctx, 'sugar', { unit: 'g' });
  const classified = ctx.ingredientNames
    .map((name) => ({ name, clue: classifySugarClue(name) }))
    .filter((x) => x.clue);
  const added = classified.filter((x) => x.clue.kind === 'added_sugar');
  const ambiguous = classified.filter((x) => x.clue.kind === 'ambiguous');
  const nonSugar = classified.filter(
    (x) => x.clue.kind !== 'added_sugar' && x.clue.kind !== 'ambiguous',
  );

  const facts = [sugarFact(sugar, ctx)];
  if (added.length) {
    facts.push({
      label: '配料中的添加糖线索',
      value: added.map((x) => x.name).join('、'),
      tone: 'warn',
    });
  }
  if (ambiguous.length) {
    facts.push({
      label: '需要核实的含糖配料',
      value: ambiguous.map((x) => `${x.name}（${x.clue.label}）`).join('、'),
      tone: 'note',
    });
  }
  if (!added.length && !ambiguous.length && ctx.ingredientNames.length) {
    facts.push({ label: '配料表', value: '没有出现明确的添加糖配料', tone: 'note' });
  }
  if (nonSugar.length) {
    facts.push({
      label: '名字含「糖」但不是糖',
      value: nonSugar.map((x) => `${x.name}（${x.clue.label}）`).join('、'),
      tone: 'note',
    });
  }

  const cannot = [
    '不添加糖 ≠ 无糖：成品糖含量要另看营养成分表',
    '不能仅凭配料表没有出现「糖」字就证明没有添加糖：复合配料、原料带入与生产加工信息可能没有完整提供',
    '甜味剂不是糖，配料表里有甜味剂也不能反推「加了糖」',
  ];

  // ---- 明确添加糖：给不一致疑点，但仍不下违法结论 ----
  if (added.length) {
    const names = added.map((x) => x.name);
    return {
      ...base,
      ...mismatchMeta(INGREDIENT_MISMATCH_LABEL),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `配料表出现${names.join('、')}，与你选择的「${claimText}」说法存在疑点。`,
      mismatchNote: ingredientMismatchNote(claimText, names),
      summary:
        '配料表能说明用了哪些配料，但不能还原添加量与完整配方。先把宣传语来源与配料识别核对清楚，再判断这句话是否成立。',
      facts,
      canConclude: [
        `配料表中出现了 ${names.join('、')}，属于需要与「${claimText}」一起核对的配料`,
      ],
      cannotConclude: [
        ...cannot,
        '不能据此认定商家违法或欺诈：宣传语可能来自手动选择或输入，配料识别也可能有误',
      ],
      missing: ['宣传语是否确实印在这款包装上'],
      warnings: [
        '宣传语可能来自手动选择或输入，不一定与包装正面文字一致；请先确认它确实印在这款包装上。',
        '配料表只能说明用了哪些配料，不能还原添加量、加入顺序与完整配方。',
        ...(sugar.state === READ_STATE.OK && sugar.value > 0
          ? ['标签糖含量不为 0，说明成品里确实有糖。']
          : []),
      ],
      evidence: ['gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb7718-2025-4-4-2-2', 'gb7718-2025-a-5-3'],
    };
  }

  // ---- 只有天然含糖 / 复合配料线索：提示核实，不判冲突 ----
  if (ambiguous.length) {
    const names = ambiguous.map((x) => x.name);
    return {
      ...base,
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'explainer',
      takeaway: `配料含${names.join('、')}，是否算「添加糖」需要进一步核实。`,
      summary:
        '「不添加糖」描述的是配方里有没有额外加糖，不是成品糖含量。配料表中的这些成分本身含糖，但看不出加入方式与比例，因此不能直接判定为「添加了糖」。',
      facts,
      canConclude: [`配料表中存在含糖配料：${names.join('、')}`],
      cannotConclude: [
        ...cannot,
        '不能仅凭这些配料名称就认定「添加了糖」：天然含糖配料与复合配料的比例、加入方式都看不出来',
      ],
      missing: ['这些配料的加入量与实际糖贡献'],
      warnings: [
        '这些线索明确性不足，仅提示需要核实，不构成「不一致」结论。',
        ...(sugar.state !== READ_STATE.OK
          ? ['成品糖含量没有标示，只能用配料表做线索。']
          : []),
      ],
      evidence: ['gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb7718-2025-4-4-2-2', 'gb7718-2025-a-5-3'],
    };
  }

  // ---- 没有添加糖线索 ----
  const warnings = [];
  if (sugar.state === READ_STATE.OK && sugar.value > 0) {
    warnings.push('标签糖含量不为 0，说明成品里确实有糖；「不添加糖」描述的是有没有额外加糖，不是成品含不含糖。');
  }
  if (sugar.state !== READ_STATE.OK) {
    warnings.push('成品糖含量没有标示，只能用配料表做线索，不能据此得出「无糖」的结论。');
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '「不添加糖」说的是配方，不等于成品无糖。',
    summary:
      '「不添加糖」描述的是配方里有没有额外加糖，不是成品糖含量。原料本身可能天然带糖，所以它不能推出「无糖」。',
    facts,
    canConclude:
      sugar.state === READ_STATE.OK
        ? [
            sugar.value === 0
              ? '标签标示糖为 0：按界限值，成品糖含量不高于 0.5 g/100 g（或 100 mL）'
              : `标签标示成品糖含量为 ${num(sugar.value)} g/100 ${ctx.basis === 'per_100ml' ? 'mL' : 'g'}`,
          ]
        : [],
    cannotConclude: cannot,
    missing: sugar.state === READ_STATE.OK ? [] : ['成品糖含量（用于区分「没加糖」和「没有糖」）'],
    warnings,
    evidence: ['gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb7718-2025-4-4-2-2', 'gb7718-2025-a-5-3'],
  };
}

// ---------------------------------------------------------------- 不添加蔗糖

export function analyzeNoAddedSucrose(claim, ctx) {
  const claimText = claim?.text || '不添加蔗糖';
  const base = makeResult(claim, 'no_added_sucrose', {
    ruleName: '不添加蔗糖 / 无添加蔗糖',
    claimType: 'ingredient',
    ruleVersion: 'GB 28050—2011 + GB 7718—2025',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const sugar = readNutrient(ctx, 'sugar', { unit: 'g' });
  const sucroseHits = ctx.ingredientNames.filter((n) => isSucroseClue(n));
  const otherSugar = ctx.ingredientNames.filter((n) => {
    const clue = classifySugarClue(n);
    return clue?.kind === 'added_sugar' && !isSucroseClue(n);
  });

  const facts = [
    { label: '这句话的性质', value: '描述配方 / 添加行为，不是成品含量声称' },
    sugarFact(sugar, ctx),
  ];
  if (sucroseHits.length) {
    facts.push({ label: '配料中与蔗糖相关的项', value: sucroseHits.join('、'), tone: 'warn' });
  } else if (ctx.ingredientNames.length) {
    facts.push({ label: '配料表', value: '没有出现白砂糖、蔗糖等字样', tone: 'note' });
  }
  if (otherSugar.length) {
    facts.push({
      label: '其他糖类配料',
      value: `${otherSugar.join('、')} · 不是蔗糖，但仍是糖`,
      tone: 'note',
    });
  }

  const cannot = [
    '不添加蔗糖 ≠ 无糖：糖还包括葡萄糖、果糖、麦芽糖、乳糖等',
    '「不添加蔗糖」不能当作「0 蔗糖」的依据，两者一个讲添加行为、一个讲成品含量',
    '按 GB 7718—2025 第 4.4.2.2 条，2027-03-16 起生产的食品不得使用「不添加」及其同义语（含「无添加」「未添加」「零添加」）',
  ];

  if (sucroseHits.length) {
    return {
      ...base,
      ...mismatchMeta(INGREDIENT_MISMATCH_LABEL),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `配料表出现${sucroseHits.join('、')}，与「${claimText}」存在疑点。`,
      mismatchNote: ingredientMismatchNote(
        claimText,
        sucroseHits,
        '白砂糖、绵白糖等属于蔗糖类配料。',
      ),
      summary:
        '「不添加蔗糖」描述的是配方行为；配料表能说明用了哪些配料，但不能还原添加量与完整配方。先核对宣传语来源与识别结果。',
      facts,
      canConclude: ['配料表中出现了蔗糖类配料，需要与这句话一起核对'],
      cannotConclude: [
        ...cannot,
        '不能据此认定商家违法或欺诈：宣传语来源与配料识别都可能出错',
      ],
      missing: ['宣传语是否确实印在这款包装上'],
      warnings: [
        '宣传语可能来自手动选择或输入，不一定与包装正面文字一致；请先确认它确实印在这款包装上。',
      ],
      evidence: ['gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb7718-2025-4-4-2-2', 'gb7718-2025-a-5-3'],
    };
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '「不添加蔗糖」不等于无糖，也不能当作「0 蔗糖」。',
    summary:
      '「不添加蔗糖」说的是配方里没有额外加蔗糖；「0 蔗糖」说的是成品中蔗糖含量。两者不是同一件事，也都不能推出「无糖」。',
    facts,
    canConclude: [],
    cannotConclude: cannot,
    warnings: [
      '如果包装上同时出现「0 蔗糖」与「不添加蔗糖」，要分别核对：前者看成品蔗糖含量，后者看配方',
    ],
    evidence: ['gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb7718-2025-4-4-2-2', 'gb7718-2025-a-5-3'],
  };
}

// ---------------------------------------------------------------- 不添加防腐剂

export function analyzeNoPreservative(claim, ctx) {
  const claimText = claim?.text || '不添加防腐剂';
  const base = makeResult(claim, 'no_preservative', {
    ruleName: '不添加防腐剂 / 无防腐剂',
    claimType: 'ingredient',
    ruleVersion: 'GB 7718—2025（用语）+ 本地配料知识库',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const clues = additiveClues(ctx, '防腐剂');
  const strong = clues.filter((c) => c.confidence === 'strong');
  const weak = clues.filter((c) => c.confidence === 'weak');
  const facts = [{ label: '这句话的性质', value: '对配料的强调，不是营养成分含量声称' }];

  if (clues.length) {
    facts.push({
      label: '配料表中需要核对的成分',
      value: clues
        .map((c) => `${c.name}（${c.via}${c.confidence === 'weak' ? '，作用需核实' : ''}）`)
        .join('、'),
      tone: strong.length ? 'warn' : 'note',
    });
  } else {
    facts.push({ label: '配料表匹配结果', value: '没有匹配到登记功能为「防腐剂」的成分', tone: 'note' });
    facts.push({ label: '知识库覆盖', value: knowledgeHint(), tone: 'note' });
  }

  const warnings = [
    '没有匹配到防腐剂，不等于生产时没有使用防腐剂：本地知识库覆盖有限，复合配料也可能没有展开。',
    '不是所有食品添加剂都是防腐剂，配料表里出现添加剂也不等于出现了防腐剂。',
    '宣传语可能来自手动选择或输入，请先确认它确实印在这款包装上。',
  ];
  if (weak.length) {
    warnings.push(
      '「二氧化碳」在 GB 2760 中登记的功能包含防腐剂，但在碳酸饮料里主要作用是产生气泡；不能仅凭功能登记就认定它被当作防腐剂使用。',
    );
  }

  if (strong.length) {
    const names = strong.map((c) => c.name);
    return {
      ...base,
      ...mismatchMeta(INGREDIENT_MISMATCH_LABEL),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `配料表出现${names.join('、')}（登记功能含防腐剂），与「${claimText}」存在疑点。`,
      mismatchNote: ingredientMismatchNote(
        claimText,
        names,
        'GB 2760—2024 附录 D 把「防腐剂」定义为防止食品腐败变质、延长食品储存期的物质。',
      ),
      summary:
        '配料表能说明用了哪些配料，但不能还原添加量与完整配方。先把宣传语来源与配料识别核对清楚，再判断这句话是否成立。',
      facts,
      canConclude: ['配料表中存在与「防腐剂」功能相关的成分，值得与这句话一起核对'],
      cannotConclude: [
        '不能仅凭没有匹配到名称，就认定「不添加防腐剂」已经得到证实',
        '不能把「不添加防腐剂」理解为更安全：安全性取决于具体物质、用量与整体工艺',
        '不能仅凭一张包装图片认定商家违法或欺诈',
      ],
      missing: ['这些成分在成品中的实际用量与作用', '宣传语是否确实印在这款包装上'],
      warnings,
      evidence: [
        'gb2760-2024-functions',
        'gb7718-2025-4-4-2-1',
        'gb7718-2025-4-4-2-2',
        'samr-100-art-7',
      ],
    };
  }

  if (weak.length) {
    return {
      ...base,
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'explainer',
      takeaway: '二氧化碳登记功能含防腐剂，但在饮料里通常用于产气，需要核对。',
      summary:
        '配料表中出现了在 GB 2760 中登记功能包含「防腐剂」的成分，但它在饮料里的主要作用通常是产生气泡。不能仅凭功能登记就认定它被当作防腐剂使用。',
      facts,
      canConclude: ['配料表中有功能登记含「防腐剂」的成分，需要结合产品类型判断实际用途'],
      cannotConclude: [
        '不能仅凭功能登记，就认定它在这款食品中被当作防腐剂使用',
        '不能仅凭一张包装图片认定商家违法或欺诈',
      ],
      missing: ['该成分在成品中的实际作用与用量'],
      warnings,
      evidence: [
        'gb2760-2024-functions',
        'gb7718-2025-4-4-2-1',
        'gb7718-2025-4-4-2-2',
        'samr-100-art-7',
      ],
    };
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.INSUFFICIENT,
    verdict: 'explainer',
    takeaway: '没有匹配到防腐剂线索，但不能证明没有使用。',
    summary: `配料表里没有匹配到功能为「防腐剂」的成分。但这只能说明「没找到线索」，不能证明生产时没有使用防腐剂。${knowledgeHint()}`,
    facts,
    canConclude: ['配料表中没有出现我已收录的、功能登记为防腐剂的成分'],
    cannotConclude: [
      '不能仅凭没有匹配到名称，就认定「不添加防腐剂」已经得到证实',
      '不能把「不添加防腐剂」理解为更安全：安全性取决于具体物质、用量与整体工艺',
      '不能仅凭一张包装图片认定商家违法或欺诈',
    ],
    missing: ['完整的配料表与复合配料展开信息'],
    warnings,
    evidence: ['gb7718-2025-4-4-2-1', 'gb7718-2025-4-4-2-2', 'samr-100-art-7'],
  };
}

// ---------------------------------------------------------------- 不添加色素

export function analyzeNoColorant(claim, ctx) {
  const claimText = claim?.text || '不添加色素';
  const base = makeResult(claim, 'no_colorant', {
    ruleName: '不添加色素 / 无色素',
    claimType: 'ingredient',
    ruleVersion: 'GB 7718—2025（用语）+ 本地配料知识库',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const clues = additiveClues(ctx, '着色剂');
  const strong = clues.filter((c) => c.confidence === 'strong');
  const covered = ALL_INGREDIENTS.filter(
    (e) => (e.functions || []).includes('着色剂') || String(e.categoryLabel || '').includes('着色剂'),
  ).length;

  const facts = [{ label: '这句话的性质', value: '对配料的强调，不是营养成分含量声称' }];
  if (clues.length) {
    facts.push({
      label: '配料表中需要核对的成分',
      value: clues.map((c) => `${c.name}（${c.via}）`).join('、'),
      tone: 'warn',
    });
  } else {
    facts.push({ label: '配料表匹配结果', value: '没有看到「着色剂」「色素」字样，也没有匹配到相关条目', tone: 'note' });
    facts.push({ label: '知识库覆盖', value: `已收录的着色剂条目为 ${covered} 个；${knowledgeHint()}`, tone: 'note' });
  }

  const cannot = [
    '着色剂只是食品添加剂的一个功能类别，不等于所有食品添加剂',
    '不能仅凭配料表没有出现「色素」二字就认定没有使用着色剂',
    '不能仅凭一张包装图片认定商家违法或欺诈',
  ];

  if (strong.length) {
    const names = strong.map((c) => c.name);
    return {
      ...base,
      ...mismatchMeta(INGREDIENT_MISMATCH_LABEL),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `配料表出现${names.join('、')}（着色剂线索），与「${claimText}」存在疑点。`,
      mismatchNote: ingredientMismatchNote(claimText, names, '与「着色剂」功能相关。'),
      summary:
        '配料表能说明用了哪些配料，但不能还原添加量与完整配方。先把宣传语来源与配料识别核对清楚。',
      facts,
      canConclude: ['配料表中存在与着色剂功能相关的成分'],
      cannotConclude: cannot,
      missing: ['完整的配料表、复合配料展开信息与产品执行标准'],
      warnings: [
        '颜色深的原料（如可可粉、焦糖）本身不是着色剂，不能把带颜色的配料当作色素。',
        '宣传语可能来自手动选择或输入，请先确认它确实印在这款包装上。',
      ],
      evidence: [
        'gb2760-2024-functions',
        'gb7718-2025-4-4-2-1',
        'gb7718-2025-4-4-2-2',
        'samr-100-art-7',
      ],
    };
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.INSUFFICIENT,
    verdict: 'explainer',
    takeaway: '没有看到着色剂线索，但不能证明没有使用。',
    summary:
      '配料表里没有看到着色剂线索，但这不能证明生产过程没有使用色素：本地知识库的着色剂覆盖很少，复合配料与「着色剂（××）」这类写法也可能没有识别到。',
    facts,
    canConclude: [],
    cannotConclude: cannot,
    missing: ['完整的配料表、复合配料展开信息与产品执行标准'],
    warnings: [
      '颜色深的原料（如可可粉、焦糖）本身不是着色剂，不能把带颜色的配料当作色素。',
      '本页只做线索提示，不对这款产品是否合规下结论。',
    ],
    evidence: ['gb7718-2025-4-4-2-1', 'gb7718-2025-4-4-2-2', 'samr-100-art-7'],
  };
}

// ---------------------------------------------------------------- 非油炸

export function analyzeNonFried(claim, ctx) {
  const base = makeResult(claim, 'non_fried', {
    ruleName: '非油炸',
    claimType: 'process',
    ruleVersion: '加工方式解释 · 暂无直接工艺核验依据',
    standardNote:
      'GB 28050—2011 只用于说明「非油炸」不属于营养含量声称，不构成工艺认定依据。',
    standardNoteTone: 'neutral',
    basisNote: basisSentence(ctx),
  });

  const fat = readNutrient(ctx, 'fat', { unit: 'g' });
  const energy = readNutrient(ctx, 'energy', { unit: 'kJ' });
  const b = ctx.basis === 'per_100ml' ? 'mL' : 'g';

  const facts = [
    { label: '这句话的性质', value: '加工方式描述，不是营养成分含量声称' },
    { label: '生产工艺信息', value: '营养成分表不包含工艺信息，无法从标签验证是否油炸', tone: 'missing' },
  ];
  if (fat.state === READ_STATE.OK) {
    facts.push({ label: '标签脂肪', value: `${num(fat.value)} g / 100 ${b}`, tone: 'note' });
  }
  if (energy.state === READ_STATE.OK) {
    facts.push({ label: '标签能量', value: `${num(energy.value)} kJ / 100 ${b}`, tone: 'note' });
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '非油炸说的是加工方式，不代表一定低脂或低热量。',
    summary:
      '「非油炸」描述的是加工方式，不是营养成分含量。仅凭营养成分表无法证明生产时是否经过油炸；它也不能推出低脂、低热量或更健康。',
    facts,
    canConclude: [],
    cannotConclude: [
      '非油炸不等于低脂：脂肪含量要看营养成分表',
      '非油炸不等于低热量：能量高低与是否油炸没有必然关系',
      '非油炸不等于更健康，也不能用脂肪或能量数据反推工艺',
      '不能因为包装写了「非油炸」就认为可以多吃',
    ],
    missing: ['可核对的生产工艺信息（如产品执行标准、工艺说明）'],
    warnings: [
      fat.state === READ_STATE.OK || energy.state === READ_STATE.OK
        ? '上面列出的是标签上的脂肪与能量实际数值，它们不能用来验证或否定「非油炸」这个工艺说法。'
        : '标签没有提供脂肪或能量数据，连「非油炸是否低脂」都无法对照。',
    ],
    evidence: ['gb2011-2-7-1', 'gb2011-3-1'],
  };
}

// ---------------------------------------------------------------- 全麦 / 全谷物

export function analyzeWholeGrain(claim, ctx) {
  const base = makeResult(claim, 'whole_grain', {
    ruleName: '全麦 / 全谷物',
    claimType: 'ingredient',
    ruleVersion: 'GB 7718—2025（定量标示）',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const hits = ctx.searchIngredients(['全麦', '全谷物', '全谷', '燕麦', '黑麦', '糙米', '藜麦', '麸皮', '麦麸']);
  const fiber = readNutrient(ctx, 'dietary_fiber', { unit: 'g' });

  const facts = [];
  if (hits.length) {
    facts.push({ label: '配料中的相关原料', value: hits.join('、'), tone: 'note' });
  } else if (ctx.ingredientNames.length) {
    facts.push({ label: '配料表', value: '没有出现「全麦」「全谷物」等字样', tone: 'missing' });
  } else {
    facts.push({ label: '配料表', value: '没有可用的配料信息', tone: 'missing' });
  }
  const f = fiberFact(fiber, ctx);
  if (f) facts.push(f);
  facts.push({ label: '配方比例', value: '配料表只给顺序，不给百分比', tone: 'note' });

  return {
    ...base,
    status: hits.length ? ANALYSIS_STATUS.EXPANDABLE : ANALYSIS_STATUS.INSUFFICIENT,
    verdict: 'explainer',
    takeaway: hits.length
      ? `用了「${hits[0]}」，但配料表看不出占比，不能确定全麦比例。`
      : '配料表没有全麦字样，无法确认「全麦」。',
    summary: hits.length
      ? `配料表里出现了「${hits.join('、')}」，说明用了相关原料；但配料表只给顺序不给比例，无法确定全麦粉占多少，也不能据此推算膳食纤维含量。`
      : '配料表里没有看到「全麦」「全谷物」等字样。也可能用其他名称标示，需要核对配料表原文与产品标准，不能凭一个词确定比例。',
    facts,
    canConclude: hits.length ? ['配料表中使用了与全麦 / 全谷物相关的原料'] : [],
    cannotConclude: [
      '不能仅凭配料表出现「全麦」二字确定实际占比',
      '全麦 / 全谷物不等于高膳食纤维，纤维含量要看营养成分表',
      '不能凭一个配料名称推算产品符合某个「全麦含量」阈值',
    ],
    missing: hits.length ? ['全麦粉等原料在成品中的实际比例'] : ['配料表原文与产品执行标准'],
    warnings: [
      '本页不创造一个「全麦含量达到多少才算全麦」的通用法规阈值；比例需要看标签上的定量标示或产品标准。',
    ],
    evidence: ['gb7718-2025-4-4-1-1', 'gb2011-3-1'],
  };
}

// ---------------------------------------------------------------- 100% 果汁

export function analyzeJuice100(claim, ctx) {
  const base = makeResult(claim, 'juice_100', {
    ruleName: '100% 果汁 / 纯果汁',
    claimType: 'ingredient',
    ruleVersion: 'GB 7718—2025（定量标示）+ GB 28050—2011',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  const sugar = readNutrient(ctx, 'sugar', { unit: 'g' });
  const waterHits = ctx.searchIngredients(['水', '饮用水', '纯净水']);
  const sugarHits = ctx.searchIngredients(['白砂糖', '蔗糖', '果葡糖浆', '糖浆', '蜂蜜']);

  const facts = [
    { label: '这句话的性质', value: '果汁含量 / 配料声明，不是「0 糖」声称' },
    sugarFact(sugar, ctx),
  ];
  if (sugarHits.length) facts.push({ label: '配料中的糖相关项', value: sugarHits.join('、'), tone: 'warn' });
  if (waterHits.length) facts.push({ label: '配料中的水', value: waterHits.join('、'), tone: 'note' });
  facts.push({ label: '果汁含量标示', value: '当前记录没有果汁含量字段，无法核对', tone: 'missing' });

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '100% 果汁说的是果汁含量，不等于 0 糖。',
    summary:
      '「100% 果汁」说的是果汁含量或复原方式，不是「0 糖」。果汁天然含糖，这句话不能推出无糖，也不能说明有没有额外加糖。',
    facts,
    canConclude: sugar.state === READ_STATE.OK
      ? [`标签标示成品糖含量为 ${num(sugar.value)} g/100 ${ctx.basis === 'per_100ml' ? 'mL' : 'g'}`]
      : [],
    cannotConclude: [
      '100% 果汁 ≠ 0 糖：水果本身含葡萄糖、果糖、蔗糖',
      '不能从「100%」推出没有加水或没有加糖，需要看配料表与果汁含量标示',
      '不能从「100%」判断是复原果汁还是非复原（NFC）果汁，工艺信息不在营养表里',
      '不能把「纯果汁」当作可以替代饮水的理由',
    ],
    missing: ['果汁含量标示、配料表完整信息与产品执行标准'],
    warnings: [
      '如果「100% 果汁」出现在食品名称中，按 GB 7718—2025 第 4.4.1.1 条应标示果汁含量（2027-03-16 起实施，标准另有豁免情形）。',
    ],
    evidence: ['gb7718-2025-4-4-1-1', 'gb2011-c1-sugar', 'gb2025-qa-sugar-def', 'gb2011-3-1'],
  };
}

// ---------------------------------------------------------------- 纯天然

export function analyzeNatural(claim, ctx) {
  const base = makeResult(claim, 'natural', {
    ruleName: '纯天然 / 天然原料',
    claimType: 'marketing',
    ruleVersion: '泛营销解释 · 无直接判定标准',
    standardNote: '现行标准没有为「天然」设定统一定义或阈值；这里只引用标签不得虚假、误导的原则。',
    standardNoteTone: 'neutral',
    basisNote: basisSentence(ctx),
  });

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '「天然」不是营养或安全等级，无法用标签核对。',
    summary:
      '「天然」描述的是来源或加工印象，不是一个可以核对的营养数值。天然来源不等于营养更优，也不等于没有风险。',
    facts: [
      { label: '这句话的性质', value: '泛营销用语，不属于营养含量声称' },
      { label: '可核对的数值', value: '没有对应的标准阈值或营养成分', tone: 'note' },
    ],
    canConclude: [],
    cannotConclude: [
      '不能把「天然」当成营养更高的证据：营养高低要看营养成分表',
      '不能把「天然」当成更安全的证据：安全性取决于物质本身与摄入量',
      '不能用「天然」替代配料表、生产日期、保质期等可核对信息',
    ],
    missing: ['「天然」具体指什么（原料来源、加工方式还是其他）'],
    warnings: [
      '本页不会为「天然」创造一个数值阈值，也不对这款产品是否合规下结论。',
      '按《食品标识监督管理办法》第七条，食品标识不得以欺骗、误导、夸大等方式作虚假描述（2027-03-16 起施行）。',
    ],
    evidence: ['samr-100-art-7', 'gb2011-3-1'],
  };
}

// ---------------------------------------------------------------- 零添加

export function analyzeZeroAdditive(claim, ctx) {
  const base = makeResult(claim, 'zero_additive', {
    ruleName: '零添加 / 0 添加 / 无添加',
    claimType: 'marketing',
    ruleVersion: 'GB 7718—2025',
    standardNote: FUTURE_STANDARD_NOTE,
    standardNoteTone: 'future',
    basisNote: basisSentence(ctx),
  });

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'explainer',
    takeaway: '「零添加」没说零的是什么；2027-03-16 起不得再使用这类表述。',
    summary:
      '「零添加」没有说明「零」的是什么，也没有说明与谁比较。现行标准与 2027-03-16 起实施的新标准对这类表述的要求不同，需要结合生产日期看。',
    facts: [
      { label: '这句话的性质', value: '对配料的强调，不是营养含量声称' },
      { label: '现行适用版本（截至 2026-11）', value: 'GB 7718—2011 / GB 28050—2011（按生产时有效版本执行）' },
      {
        label: 'GB 7718—2025 第 4.4.2.2 条',
        value: '2027-03-16 起：不得使用「不添加」「不使用」及其同义语等词汇',
        tone: 'warn',
      },
      { label: '同义语范围（A.5.3）', value: '「未添加」「零添加」「无添加」「未使用」「没加」「未用」等', tone: 'note' },
      { label: '第 4.4.2 条的附加要求', value: '强调某种配料含量较低或无时，应标示它在成品中的含量' },
    ],
    canConclude: [
      '截至 2026-11，市售产品仍普遍按 GB 7718—2011 与 GB 28050—2011 标示',
      '2027-03-16 起生产的食品，标签不得再使用「不添加」「不使用」及其同义语（含「零添加」「无添加」「未添加」）',
    ],
    cannotConclude: [
      '不能仅凭一张包装图片认定商家违法或欺诈',
      '不能把「零添加」理解为更安全或更营养',
      '不能把「零添加」当成「0 糖」「0 脂肪」这类有界限值的营养声称',
      '不能用未来的标准去判断 2027-03-16 之前生产的食品',
    ],
    missing: ['这款食品的生产日期与实际执行的标准版本', '「零添加」具体指向的配料或成分'],
    warnings: [
      '如果这包食品的生产日期在 2027-03-16 之后，该表述与 GB 7718—2025 第 4.4.2.2 条存在冲突疑点，需要以实物标签和监管认定为准。',
      '本页只说明版本与日期关系，不对这张图里的产品作合规结论。',
    ],
    evidence: [
      'gb7718-2025-4-4-2-2',
      'gb7718-2025-a-5-3',
      'gb7718-2025-4-4-2',
      'gb7718-2025-effective',
      'samr-100-art-54',
    ],
  };
}
