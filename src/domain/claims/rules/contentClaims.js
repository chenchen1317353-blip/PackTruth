/**
 * 营养含量声称（数值型）—— 数据驱动的通用判定器。
 *
 * 每条声称只描述三样东西：
 *   1. 看哪个营养素、用什么单位、用「≤」还是「≥」；
 *   2. 固体 / 液体分别对应表 C.1 的哪个界限（可附带每 420 kJ 途径）；
 *   3. 通过、不一致、信息不足时分别怎么说。
 *
 * 判定逻辑只有一份。新增一条同类声称 = 新增一份配置，不写新的 if 分支。
 */

import { LIMITS_2011, OP } from '../thresholds.js';
import {
  READ_STATE,
  basisSentence,
  per100Unit,
  per420kJ,
  readNutrient,
} from '../nutritionFacts.js';
import {
  ANALYSIS_STATUS,
  makeResult,
  mismatchMeta,
  roundTo,
} from '../shared.js';

const num = (v) => (Number.isFinite(v) ? String(roundTo(v, 2)) : '—');

/** 三条途径的判定：任一满足即成立；只有全部已实现途径都不满足才算「不一致」 */
function decide(pathways) {
  if (pathways.some((p) => p.state === 'pass')) return 'pass';
  if (pathways.some((p) => p.state === 'unknown')) return 'unknown';
  return 'mismatch';
}

const STATE_TEXT = {
  pass: '满足',
  fail: '不满足',
  unknown: '无法计算',
};

function baseFacts(ctx, rule, reading) {
  const b = per100Unit(ctx);
  return [
    {
      label: `标签${rule.nutrientLabel}标示值`,
      value: `${num(reading.value)} ${rule.unit} / 100 ${b}`,
    },
    { label: '标示基准', value: basisSentence(ctx) },
  ];
}

function notEnough(base, ctx, rule, reading) {
  const reasons = {
    [READ_STATE.ABSENT]: `营养成分表里没有「${rule.nutrientLabel}」这一项，无法判断「${base.claimText}」是否成立。`,
    [READ_STATE.NOT_LABELED]: `你已确认包装上没有标示${rule.nutrientLabel}含量，因此无法判断「${base.claimText}」的依据。`,
    [READ_STATE.UNREADABLE]: `营养成分表里有「${rule.nutrientLabel}」这一行，但数值还没确认，补上数值后才能分析。`,
    [READ_STATE.NO_UNIT]: `「${rule.nutrientLabel}」有数值但单位没确认，单位不同会直接改变结论，先补上单位。`,
    [READ_STATE.BAD_UNIT]: `「${rule.nutrientLabel}」的单位无法用于这类声称，请核对包装上的标示单位。`,
    [READ_STATE.NO_BASIS]: '营养标示基准还没确认（每 100 克 / 每 100 毫升 / 每份），无法与标准的界限值比较。',
    [READ_STATE.NO_SERVING_SIZE]: '标签按「每份」标示，但没有每份的克重或体积，无法换算到每 100 g（mL）。',
    [READ_STATE.UNCERTAIN_VALUE]: '标签数值是界限值或约数，不能作为精确等值判断声称，请先核对原文。',
  };
  return {
    ...base,
    verdict: 'unknown',
    status: ANALYSIS_STATUS.INSUFFICIENT,
    summary: reasons[reading.state] || '缺少可用的营养数据，无法判断。',
    takeaway: `缺少可核对的${rule.nutrientLabel}数据，暂时无法确认「${rule.shortName}」。`,
    facts: [
      {
        label: rule.nutrientLabel,
        value:
          reading.state === READ_STATE.NOT_LABELED
            ? '包装未标示'
            : reading.state === READ_STATE.ABSENT
              ? '表里没有这一行'
              : '数值待确认',
        tone: reading.state === READ_STATE.UNREADABLE ? 'pending' : 'missing',
      },
      { label: '标示基准', value: basisSentence(ctx) },
    ],
    missing: [...new Set([...(reading.missing || []), `可核对的${rule.nutrientLabel}数据`])],
    cannotConclude: rule.cannot,
    warnings: [...(reading.warnings || []), ...(rule.extraWarnings?.(ctx, reading) || [])],
    evidence: rule.evidence,
  };
}

function genericEvaluate(claim, ctx, rule) {
  const base = makeResult(claim, rule.id, {
    ruleName: rule.name,
    claimType: 'content',
    ruleVersion: 'GB28050-2011',
    basisNote: basisSentence(ctx),
  });

  const reading = readNutrient(ctx, rule.nutrient, { unit: rule.unit });
  if (reading.state !== READ_STATE.OK) return notEnough(base, ctx, rule, reading);

  const form = ctx.physicalForm || reading.form;
  const needsForm = rule.limits.solid !== rule.limits.liquid;
  const b = per100Unit(ctx);
  const threshold = rule.limits[form] ?? (!needsForm ? rule.limits.solid : null);
  const per100Known = threshold != null && reading.formBasisCompatible;
  const pass100 =
    rule.op === OP.LTE ? reading.value <= threshold : reading.value >= threshold;

  const pathways = [
    {
      id: 'per100',
      label: `每 100 ${b} 途径`,
      state: !per100Known ? 'unknown' : pass100 ? 'pass' : 'fail',
      value: reading.value,
      threshold,
      text: !per100Known ? '食品形态未确认，或质量/体积口径不一致；缺少密度时不能直接比较' : `${num(reading.value)} ${rule.unit} · 界限 ${rule.op === OP.LTE ? '≤' : '≥'}${num(threshold)} · ${
        pass100 ? '满足' : '不满足'
      }`,
    },
  ];

  // ---- 每 420 kJ 途径（表 C.1 的并列判定方式）----
  let energyReading = null;
  if (rule.limits.per420kJ != null) {
    energyReading = readNutrient(ctx, 'energy', { unit: 'kJ' });
    if (energyReading.state !== READ_STATE.OK || energyReading.value <= 0) {
      pathways.push({
        id: 'per420',
        label: '每 420 kJ 途径',
        state: 'unknown',
        value: null,
        threshold: rule.limits.per420kJ,
        text: '缺少可用的能量数据，这条途径无法计算',
      });
    } else {
      const per = per420kJ(reading.value, energyReading.value);
      const pass420 =
        rule.op === OP.LTE ? per <= rule.limits.per420kJ : per >= rule.limits.per420kJ;
      pathways.push({
        id: 'per420',
        label: '每 420 kJ 途径',
        state: per === null ? 'unknown' : pass420 ? 'pass' : 'fail',
        value: per,
        threshold: rule.limits.per420kJ,
        text: per === null ? '数值超出可计算范围，无法核对这条途径' : `${num(per)} ${rule.unit} / 420 kJ · 界限 ${rule.op === OP.LTE ? '≤' : '≥'}${num(
          rule.limits.per420kJ,
        )} · ${pass420 ? '满足' : '不满足'}`,
      });
    }
  }

  const verdict = decide(pathways);
  const passing = pathways.filter((p) => p.state === 'pass');
  // 计量口径里已经包含「固体 / 液体 · 每 100 g」，这里不再重复一行
  const facts = baseFacts(ctx, rule, reading);

  for (const p of pathways) {
    facts.push({
      label: p.label,
      value: p.text,
      tone: p.state === 'fail' ? 'warn' : p.state === 'unknown' ? 'missing' : 'note',
    });
  }
  facts.push({ label: '适用界限', value: rule.conditionText });

  if (rule.extraFacts) facts.push(...rule.extraFacts(ctx, reading));

  const warnings = [...(reading.warnings || []), ...(rule.extraWarnings?.(ctx, reading) || [])];

  if (verdict === 'pass') {
    const main = passing[0];
    const via = main?.id === 'per420' && !passing.some((p) => p.id === 'per100')
      ? '每 420 kJ 途径'
      : `每 100 ${b} 途径`;
    const limitText =
      main?.id === 'per420'
        ? `${num(main.threshold)} ${rule.unit}/420 kJ`
        : `${num(threshold)} ${rule.unit}/100 ${b}`;
    return {
      ...base,
      verdict,
      status: rule.passStatus || ANALYSIS_STATUS.SUPPORTED,
      takeaway:
        rule.takeawayPass?.({
          value: reading.value,
          threshold,
          form,
          unit: rule.unit,
          basis: b,
        }) ||
        `标签${rule.nutrientLabel} ${num(reading.value)} ${rule.unit}/100 ${b}，达到「${rule.shortName}」条件。`,
      summary: rule.messages.pass({
        value: reading.value,
        threshold,
        form,
        unit: rule.unit,
        basis: b,
        via,
        limitText,
        claimText: claim?.text || '',
      }),
      facts,
      canConclude: rule.messages.can({
        value: reading.value,
        threshold,
        form,
        unit: rule.unit,
        basis: b,
        via,
        limitText,
        claimText: claim?.text || '',
      }),
      cannotConclude: rule.cannot,
      warnings,
      pathways,
      evidence: rule.evidence,
    };
  }

  if (verdict === 'mismatch') {
    return {
      ...base,
      ...mismatchMeta(),
      verdict,
      status: ANALYSIS_STATUS.EXPANDABLE,
      flag: 'mismatch',
      takeaway: `标签${rule.nutrientLabel} ${num(reading.value)} ${rule.unit}，与「${rule.shortName}」的界限 ${num(
        threshold,
      )} 不一致，建议核对。`,
      mismatchNote: `标签标示${rule.nutrientLabel} ${num(reading.value)} ${rule.unit}/100 ${b}，与「${rule.shortName}」所采用标准的含量条件不一致。建议先核对原始包装、食品形态与适用标准版本。`,
      summary: rule.messages.mismatch({
        value: reading.value,
        threshold,
        form,
        unit: rule.unit,
        basis: b,
        claimText: claim?.text || '',
      }),
      facts,
      canConclude: [],
      cannotConclude: [
        ...rule.cannot,
        '在不更换数据口径的前提下，标签数值与所采用标准的含量条件不能同时成立',
      ],
      warnings: [
        ...warnings,
        '这是「与标签数值不一致」的疑点，不等于商家违法或欺诈；需要核对原始包装、适用标准版本与食品形态',
      ],
      pathways,
      evidence: rule.evidence,
    };
  }

  return {
    ...base,
    verdict,
    status: ANALYSIS_STATUS.INSUFFICIENT,
    takeaway: `「${rule.shortName}」的判定依据还不完整，暂时不能下结论。`,
    summary:
      rule.messages.unknown?.({ value: reading.value, threshold, form, basis: b, unit: rule.unit }) ||
      '已实现的判定途径都不能确认这项声称，仍缺少可以核对的依据。',
    facts,
    canConclude: [],
    cannotConclude: rule.cannot,
    missing: [
      ...(!per100Known ? ['与食品形态一致的每 100 g / 100 mL 数据（质量与体积不能直接互换）'] : []),
      energyReading && energyReading.state !== READ_STATE.OK
        ? '用于「每 420 kJ」判定的能量数据'
        : '可完整核对的判定依据',
    ],
    warnings: [...warnings, '标准给出了多条并列途径，缺少其中一条时不能直接判定「不符合」'],
    pathways,
    evidence: rule.evidence,
  };
}

// ================================================================ 配置

const proteinCannotHigh = [
  '高蛋白不代表低脂：脂肪含量要看另一个数值',
  '高蛋白不代表低热量：能量高低与蛋白质多少是两件事',
  '不能因为配料表里有蛋白粉、乳清蛋白就认定成品高蛋白，判断依据是营养成分表的蛋白质含量',
];

const proteinCannotSource = [
  '「含有蛋白质 / 蛋白质来源」是较低一档的声称，不能当成「高蛋白」',
  '蛋白质来源不代表蛋白质数量多，也不代表氨基酸组成更好',
];

const fiberCannot = [
  '膳食纤维高不代表无糖、无脂：这是三个独立的数值',
  '不能根据配料表出现燕麦、全麦等名称推算纤维含量',
  '纤维含量高不代表可以替代蔬菜水果或解决全部膳食问题',
];

const calciumCannotHigh = [
  '高钙不代表钙一定被充分吸收，吸收还受维生素 D、膳食结构等因素影响',
  '不能因为配料表有碳酸钙等含钙配料就认定成品高钙，判断依据是营养成分表的钙含量',
  '钙高不代表其他营养素也高',
];

const calciumCannotSource = [
  '「含钙 / 钙来源」是较低一档的声称，不能当成「高钙」',
  '钙来源不代表钙含量高',
];

export const CONTENT_RULES = [
  {
    id: 'low_fat',
    name: '低脂肪 / 低脂 / 少油',
    shortName: '低脂肪',
    nutrient: 'fat',
    nutrientLabel: '脂肪',
    unit: 'g',
    op: OP.LTE,
    limits: LIMITS_2011.low_fat,
    conditionText: '固体 ≤3 g/100 g；液体 ≤1.5 g/100 mL（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-low-fat', 'gb2011-c2-synonym', 'gb2011-5-2'],
    cannot: [
      '低脂肪不等于无脂肪：界限值本身允许每 100 g（或 100 mL）含 3 g（1.5 g）脂肪',
      '不能因为「低脂」就认为可以无限量吃',
      '脂肪低不代表这款食品整体营养价值高，也不代表它低糖、低钠',
    ],
    extraFacts: () => [{ label: '脂肪与整体营养', value: '脂肪含量只是其中一项，不能代表整包食品的营养价值', tone: 'note' }],
    extraWarnings: (ctx, reading) => {
      const out = [];
      if (/少油/.test(ctx.claimText || '')) {
        out.push('「少油」是「低脂肪」的同义语，描述的是成品脂肪含量水平，不能据此推断生产时没有使用油脂。');
      }
      if (reading.value <= 1 && reading.value > 0) {
        out.push('数值虽然很低，但「低脂肪」的门槛是 3 g/100 g（固体）或 1.5 g/100 mL（液体），不是 0。');
      }
      return out;
    },
    messages: {
      pass: ({ value, threshold, form, basis }) =>
        `标签标示脂肪 ${num(value)} g/100 ${basis}，不高于「低脂肪」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g，符合 GB 28050—2011 表 C.1 的相应含量条件。`,
      can: ({ threshold, basis }) => [`按标签数值，脂肪含量不高于每 100 ${basis} ${num(threshold)} g`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示脂肪 ${num(value)} g/100 ${basis}，高于「低脂肪」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g/100 ${basis}。根据已确认的标签数值，这项声称与所采用标准的含量条件存在不一致，需要进一步核对原始包装、适用标准与相关条件。`,
      unknown: () => '脂肪数据不足以完成「低脂肪」判定。',
    },
  },

  {
    id: 'low_sugar',
    name: '低糖',
    shortName: '低糖',
    nutrient: 'sugar',
    nutrientLabel: '糖',
    unit: 'g',
    op: OP.LTE,
    limits: LIMITS_2011.low_sugar,
    conditionText: '≤5 g/100 g（固体）或 100 mL（液体）（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-low-sugar', 'gb2011-4-2', 'gb2011-6-1'],
    cannot: [
      '低糖不等于无糖：界限值是 5 g/100 g（或 100 mL）',
      '糖低不代表能量低，也不代表对血糖的影响就小',
      '不能把碳水化合物的数值当作糖含量',
    ],
    extraWarnings: (ctx) => {
      const sugar = ctx.find('sugar');
      if (!sugar || sugar.value === null) {
        return ['按 GB 28050—2011 第 4.2 条、第 4.5 条，对糖做营养声称时应标示糖含量；糖未规定 NRV，无需标示其 NRV%。'];
      }
      return [];
    },
    messages: {
      pass: ({ value, threshold, basis }) =>
        `标签标示糖 ${num(value)} g/100 ${basis}，不高于「低糖」的界限值 ${num(
          threshold,
        )} g，符合 GB 28050—2011 表 C.1 的相应含量条件。`,
      can: ({ threshold, basis }) => [`按标签数值，糖含量不高于每 100 ${basis} ${num(threshold)} g`],
      mismatch: ({ value, threshold, basis }) =>
        `标签标示糖 ${num(value)} g/100 ${basis}，高于「低糖」的界限值 ${num(
          threshold,
        )} g/100 ${basis}。根据已确认的标签数值，这项声称与所采用标准的含量条件存在不一致，需要进一步核对原始包装与适用标准。`,
      unknown: () => '糖数据不足以完成「低糖」判定。',
    },
  },

  {
    id: 'low_sodium',
    name: '低钠 / 低盐',
    shortName: '低钠',
    nutrient: 'sodium',
    nutrientLabel: '钠',
    unit: 'mg',
    op: OP.LTE,
    limits: LIMITS_2011.low_sodium,
    conditionText: '≤120 mg/100 g 或 100 mL（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-low-sodium', 'gb2011-c1-zero-sodium', 'gb2025-qa-salt'],
    cannot: [
      '低钠不等于无钠：「低钠」的界限值是 120 mg/100 g（或 100 mL）',
      '不能把钠的毫克数当成食盐的毫克数：1 g 食盐约相当于 400 mg 钠',
      '低钠不代表这款食品可以多吃',
    ],
    extraFacts: (ctx, reading) => {
      const saltHits = ctx.searchIngredients(['食用盐', '食盐', '盐']);
      const out = [];
      if (saltHits.length) {
        out.push({
          label: '配料中的盐',
          value: `${saltHits.join('、')} · 有盐不等于不符合低钠`,
          tone: 'note',
        });
      }
      out.push({
        label: '钠与食盐',
        value: `标签钠 ${num(reading.value)} mg ≈ 食盐 ${num(reading.value / 400)} g（按 1 g 盐 ≈ 400 mg 钠折算）`,
        tone: 'note',
      });
      return out;
    },
    extraWarnings: (ctx) => {
      const out = [];
      if (/低盐|少盐/.test(ctx.claimText || '')) {
        out.push('「低盐」按钠声称处理：判定看成品钠含量，不是看配料表有没有写食盐。');
      }
      return out;
    },
    messages: {
      pass: ({ value, threshold, basis }) =>
        `标签标示钠 ${num(value)} mg/100 ${basis}，不高于「低钠」的界限值 ${num(
          threshold,
        )} mg，符合 GB 28050—2011 表 C.1 的相应含量条件。`,
      can: ({ threshold, basis }) => [`按标签数值，钠含量不高于每 100 ${basis} ${num(threshold)} mg`],
      mismatch: ({ value, threshold, basis }) =>
        `标签标示钠 ${num(value)} mg/100 ${basis}，高于「低钠」的界限值 ${num(
          threshold,
        )} mg/100 ${basis}。根据已确认的标签数值，这项声称与所采用标准的含量条件存在不一致，需要进一步核对原始包装与适用标准。`,
      unknown: () => '钠数据不足以完成「低钠」判定。',
    },
  },

  {
    id: 'zero_sodium',
    name: '无钠 / 无盐',
    shortName: '无钠',
    nutrient: 'sodium',
    nutrientLabel: '钠',
    unit: 'mg',
    op: OP.LTE,
    limits: LIMITS_2011.zero_sodium,
    passStatus: ANALYSIS_STATUS.EXPANDABLE,
    takeawayPass: ({ value, unit, basis }) =>
      `标签钠 ${num(value)} ${unit}/100 ${basis}，符合「无钠」界限，但不等于绝对零。`,
    conditionText: '≤5 mg/100 g 或 100 mL（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-zero-sodium', 'gb2011-t1-footnote-b', 'gb2025-qa-salt'],
    cannot: [
      '「无盐」不等于配料里没有食盐，也不等于绝对零钠',
      '不能把「无钠」当成可以随意摄入的理由',
      '不能把「无钠」（≤5 mg）与「低钠」（≤120 mg）混为一谈',
    ],
    messages: {
      pass: ({ value, threshold, basis }) =>
        `标签标示钠 ${num(value)} mg/100 ${basis}，符合「无或不含钠」≤${num(
          threshold,
        )} mg 的条件；这个「0」仍是按界限值标示，不等于检测值为绝对零。`,
      can: ({ threshold, basis }) => [`按标签数值，钠含量不高于每 100 ${basis} ${num(threshold)} mg`],
      mismatch: ({ value, threshold, basis }) =>
        `标签标示钠 ${num(value)} mg/100 ${basis}，高于「无或不含钠」的界限值 ${num(
          threshold,
        )} mg/100 ${basis}，与这句话存在不一致疑点，需要核对原始包装。`,
      unknown: () => '钠数据不足以完成「无钠」判定。',
    },
  },

  {
    id: 'protein_high',
    name: '高蛋白 / 富含蛋白质',
    shortName: '高蛋白',
    nutrient: 'protein',
    nutrientLabel: '蛋白质',
    unit: 'g',
    op: OP.GTE,
    limits: LIMITS_2011.protein_high,
    conditionText:
      '固体 ≥12 g/100 g；液体 ≥6 g/100 mL；或 ≥6 g/420 kJ（蛋白质 NRV 60 g 的 20% / 10% / 10%）',
    evidence: ['gb2011-c1-protein-high', 'gb2011-a1-nrv', 'gb2011-c1-protein-source'],
    cannot: proteinCannotHigh,
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示蛋白质 ${num(value)} g/100 ${basis}，通过「${via}」达到「高蛋白」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，蛋白质含量达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示蛋白质 ${num(value)} g/100 ${basis}，低于「高蛋白」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g/100 ${basis}，已实现的判定途径都不满足。根据已确认的标签数值，这项声称与所采用标准的含量条件存在不一致，需要核对原始包装与适用标准。`,
      unknown: () => '蛋白质或能量数据不足，无法完成「高蛋白」的多途径判定。',
    },
  },

  {
    id: 'protein_source',
    name: '含蛋白质 / 蛋白质来源',
    shortName: '蛋白质来源',
    nutrient: 'protein',
    nutrientLabel: '蛋白质',
    unit: 'g',
    op: OP.GTE,
    limits: LIMITS_2011.protein_source,
    conditionText:
      '固体 ≥6 g/100 g；液体 ≥3 g/100 mL；或 ≥3 g/420 kJ（蛋白质 NRV 60 g 的 10% / 5% / 5%）',
    evidence: ['gb2011-c1-protein-source', 'gb2011-a1-nrv', 'gb2011-c1-protein-high'],
    cannot: proteinCannotSource,
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示蛋白质 ${num(value)} g/100 ${basis}，通过「${via}」达到「蛋白质来源」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，蛋白质含量达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示蛋白质 ${num(value)} g/100 ${basis}，低于「蛋白质来源」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g/100 ${basis}，已实现的判定途径都不满足。`,
      unknown: () => '蛋白质或能量数据不足，无法完成「蛋白质来源」的多途径判定。',
    },
  },

  {
    id: 'fiber_high',
    name: '高膳食纤维 / 富含膳食纤维',
    shortName: '高膳食纤维',
    nutrient: 'dietary_fiber',
    nutrientLabel: '膳食纤维',
    unit: 'g',
    op: OP.GTE,
    limits: LIMITS_2011.fiber_high,
    conditionText: '固体 ≥6 g/100 g；液体 ≥3 g/100 mL；或 ≥3 g/420 kJ（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-fiber-high', 'gb2011-c1-fiber-source'],
    cannot: fiberCannot,
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示膳食纤维 ${num(value)} g/100 ${basis}，通过「${via}」达到「高膳食纤维」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，膳食纤维达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示膳食纤维 ${num(value)} g/100 ${basis}，低于「高膳食纤维」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g/100 ${basis}，已实现的判定途径都不满足。`,
      unknown: () => '膳食纤维或能量数据不足，无法完成「高膳食纤维」的多途径判定。',
    },
  },

  {
    id: 'fiber_source',
    name: '含膳食纤维 / 膳食纤维来源',
    shortName: '膳食纤维来源',
    nutrient: 'dietary_fiber',
    nutrientLabel: '膳食纤维',
    unit: 'g',
    op: OP.GTE,
    limits: LIMITS_2011.fiber_source,
    conditionText: '固体 ≥3 g/100 g；液体 ≥1.5 g/100 mL；或 ≥1.5 g/420 kJ（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-fiber-source', 'gb2011-c1-fiber-high'],
    cannot: [...fiberCannot, '「含有膳食纤维」不能当成「高膳食纤维」'],
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示膳食纤维 ${num(value)} g/100 ${basis}，通过「${via}」达到「膳食纤维来源」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，膳食纤维达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示膳食纤维 ${num(value)} g/100 ${basis}，低于「膳食纤维来源」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} g/100 ${basis}，已实现的判定途径都不满足。`,
      unknown: () => '膳食纤维或能量数据不足，无法完成「膳食纤维来源」的多途径判定。',
    },
  },

  {
    id: 'calcium_high',
    name: '高钙 / 富含钙',
    shortName: '高钙',
    nutrient: 'calcium',
    nutrientLabel: '钙',
    unit: 'mg',
    op: OP.GTE,
    limits: LIMITS_2011.calcium_high,
    conditionText: '固体 ≥240 mg/100 g；液体 ≥120 mg/100 mL；或 ≥80 mg/420 kJ（钙 NRV 800 mg 的 30% / 15% / 10%）',
    evidence: ['gb2011-c1-mineral-high', 'gb2011-a1-nrv', 'gb2011-c1-mineral'],
    cannot: calciumCannotHigh,
    extraWarnings: (ctx) => {
      const hits = ctx.searchIngredients(['碳酸钙', '乳酸钙', '葡萄糖酸钙', '钙']);
      return hits.length
        ? [`配料表出现「${hits.join('、')}」，但成品是否高钙要看营养成分表的钙含量，不能由配料名称推算。`]
        : [];
    },
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示钙 ${num(value)} mg/100 ${basis}，通过「${via}」达到「高钙」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，钙含量达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示钙 ${num(value)} mg/100 ${basis}，低于「高钙」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} mg/100 ${basis}，已实现的判定途径都不满足。`,
      unknown: () => '钙或能量数据不足，无法完成「高钙」的多途径判定。',
    },
  },

  {
    id: 'calcium_source',
    name: '含钙 / 钙来源',
    shortName: '含钙',
    nutrient: 'calcium',
    nutrientLabel: '钙',
    unit: 'mg',
    op: OP.GTE,
    limits: LIMITS_2011.calcium_source,
    conditionText: '固体 ≥120 mg/100 g；液体 ≥60 mg/100 mL；或 ≥40 mg/420 kJ（钙 NRV 800 mg 的 15% / 7.5% / 5%）',
    evidence: ['gb2011-c1-mineral', 'gb2011-a1-nrv', 'gb2011-c1-mineral-high'],
    cannot: calciumCannotSource,
    messages: {
      pass: ({ value, basis, via, limitText }) =>
        `标签标示钙 ${num(value)} mg/100 ${basis}，通过「${via}」达到「钙来源」条件（该途径界限 ${limitText}）。`,
      can: ({ limitText }) => [`按标签数值，钙含量达到 ${limitText} 这一途径的要求`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示钙 ${num(value)} mg/100 ${basis}，低于「钙来源」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} mg/100 ${basis}，已实现的判定途径都不满足。`,
      unknown: () => '钙或能量数据不足，无法完成「钙来源」的多途径判定。',
    },
  },

  {
    id: 'low_energy',
    name: '低热量 / 低能量',
    shortName: '低热量',
    nutrient: 'energy',
    nutrientLabel: '能量',
    unit: 'kJ',
    op: OP.LTE,
    limits: LIMITS_2011.low_energy,
    conditionText: '固体 ≤170 kJ/100 g；液体 ≤80 kJ/100 mL（GB 28050—2011 表 C.1）',
    evidence: ['gb2011-c1-low-energy', 'gb2011-6-1'],
    cannot: [
      '低热量不等于零热量',
      '不能只根据脂肪或糖的单项数值推算能量；判定用的是营养成分表的能量值',
      '低热量不代表更健康，也不代表营养更均衡',
    ],
    extraFacts: (ctx, reading) => [
      {
        label: '折算成千卡',
        value: `约 ${num(reading.value / 4.184)} kcal / 100 ${per100Unit(ctx)}`,
        tone: 'note',
      },
    ],
    messages: {
      pass: ({ value, threshold, form, basis }) =>
        `标签标示能量 ${num(value)} kJ/100 ${basis}，不高于「低能量」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} kJ，符合 GB 28050—2011 表 C.1 的相应含量条件。`,
      can: ({ threshold, basis }) => [`按标签数值，能量不高于每 100 ${basis} ${num(threshold)} kJ`],
      mismatch: ({ value, threshold, form, basis }) =>
        `标签标示能量 ${num(value)} kJ/100 ${basis}，高于「低能量」在${form === 'liquid' ? '液体' : '固体'}食品上的界限值 ${num(
          threshold,
        )} kJ/100 ${basis}。根据已确认的标签数值，这项声称与所采用标准的含量条件存在不一致。`,
      unknown: () => '能量数据不足以完成「低能量」判定。',
    },
  },
];

// ================================================================ 特殊规则

/** 无能量：除 ≤17 kJ，还附带「脂肪供能比 ≤50%」的限制性条件 */
export function analyzeZeroEnergy(claim, ctx, rule) {
  const base = makeResult(claim, 'zero_energy', {
    ruleName: '零热量 / 无能量',
    claimType: 'content',
    ruleVersion: 'GB28050-2011',
    basisNote: basisSentence(ctx),
  });

  const energy = readNutrient(ctx, 'energy', { unit: 'kJ' });
  if (energy.state !== READ_STATE.OK || !energy.formBasisCompatible) {
    return {
      ...base,
      status: ANALYSIS_STATUS.INSUFFICIENT,
      verdict: 'unknown',
      takeaway: '缺少能量数据，暂时无法确认「零热量」。',
      summary: '能量数值、单位或质量/体积口径还不能用于比较，无法判断「零热量」是否成立。',
      facts: [{ label: '能量', value: energy.state === READ_STATE.NOT_LABELED ? '包装未标示' : '数值待确认', tone: 'missing' }],
      missing: [...energy.missing, '可比较的营养成分表能量值与标示基准'],
      warnings: energy.warnings,
      cannotConclude: rule.cannot,
      evidence: rule.evidence,
    };
  }

  const b = per100Unit(ctx);
  const energyLimit = 17;
  const energyPass = energy.value <= energyLimit;

  const fat = readNutrient(ctx, 'fat', { unit: 'g' });
  let ratioPass = null;
  let ratio = null;
  if (fat.state === READ_STATE.OK && energy.value > 0) {
    ratio = (fat.value * 37) / energy.value;
    ratioPass = ratio <= 0.5;
  }

  const facts = [
    { label: '标签能量标示值', value: `${num(energy.value)} kJ / 100 ${b}` },
    { label: '「无能量」界限', value: '≤17 kJ / 100 g（固体）或 100 mL（液体）' },
    {
      label: '能量条件',
      value: `${num(energy.value)} ${energyPass ? '≤' : '>'} 17 · ${energyPass ? '满足' : '不满足'}`,
      tone: energyPass ? 'note' : 'warn',
    },
  ];

  if (ratio === null) {
    facts.push({ label: '脂肪供能比', value: '脂肪或能量数据缺失，无法计算', tone: 'missing' });
  } else {
    facts.push({
      label: '脂肪供能比',
      value: `脂肪 ${num(fat.value)} g × 37 kJ/g ÷ 能量 ${num(energy.value)} kJ ≈ ${num(ratio * 100)}% · ${
        ratioPass ? '≤50%' : '>50%'
      }（按 37 kJ/g 折算）`,
      tone: ratioPass ? 'note' : 'warn',
    });
  }

  const evidence = ['gb2011-c1-zero-energy', 'gb2025-2-3-energy-coeff', 'gb2011-t1-footnote-b'];

  // 脂肪单独供能就已超过总能量，说明标签数据本身不自洽（常见于识别错误）
  if (ratio !== null && ratio > 1.05) {
    return {
      ...base,
      status: ANALYSIS_STATUS.INSUFFICIENT,
      verdict: 'unknown',
      takeaway: '标签能量与脂肪数据对不上，先核对数值再判断「零热量」。',
      summary:
        '标签上的能量与脂肪数值互不自洽：仅脂肪提供的能量就已经超过标示的总能量。这通常是识别或录入错误，先核对这两个数值，再判断「零热量」。',
      facts,
      missing: ['可核对的能量与脂肪数值'],
      cannotConclude: rule.cannot,
      warnings: ['数值不自洽时，本页不会据此判断声称成立或不成立'],
      evidence,
    };
  }

  if (!energyPass) {
    return {
      ...base,
      ...mismatchMeta(),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `标签能量 ${num(energy.value)} kJ，超过「无能量」的 17 kJ 界限。`,
      mismatchNote: `标签标示能量 ${num(energy.value)} kJ/100 ${b}，高于「无能量」≤17 kJ 的界限值。建议先核对原始包装与适用标准版本。`,
      summary: `标签标示能量 ${num(energy.value)} kJ/100 ${b}，高于「无能量」≤17 kJ 的界限值，与这句话存在不一致疑点，需要核对原始包装。`,
      facts,
      cannotConclude: rule.cannot,
      warnings: ['这是「与标签数值不一致」的疑点，不等于商家违法；还需核对适用标准版本与食品形态'],
      evidence,
    };
  }

  if (ratioPass === false) {
    return {
      ...base,
      ...mismatchMeta(),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `脂肪供能比约 ${num(ratio * 100)}%，不满足「无能量」的附加条件。`,
      mismatchNote: `能量虽然 ≤17 kJ，但按标签脂肪计算，脂肪供能比约 ${num(
        ratio * 100,
      )}%，超过「无能量」≤50% 的限制性条件。建议核对这些数值与食用形态。`,
      summary: `能量虽然 ≤17 kJ，但脂肪供能比约 ${num(ratio * 100)}%，超过「无能量」附带的 ≤50% 限制性条件，两个条件没有同时满足。`,
      facts,
      cannotConclude: rule.cannot,
      warnings: ['限制性条件与能量数值要同时满足，只看「17 kJ」不足以判定'],
      evidence,
    };
  }

  if (ratio === null) {
    return {
      ...base,
      status: ANALYSIS_STATUS.INSUFFICIENT,
      verdict: 'unknown',
      takeaway: '能量达标，但缺脂肪数据，「无能量」的附加条件无法确认。',
      summary:
        '能量数值满足 ≤17 kJ 的条件，但「脂肪提供的能量不超过总能量 50%」这一限制性条件缺少脂肪数据，部分条件尚无法确认。',
      facts,
      missing: ['用于计算脂肪供能比的脂肪含量'],
      cannotConclude: rule.cannot,
      warnings: ['部分条件尚无法确认，不能据此认定这句话成立，也不能认定不成立'],
      evidence,
    };
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'pass',
    takeaway: '能量与脂肪供能比都满足「无能量」，但仍不等于绝对零能量。',
    summary:
      '能量 ≤17 kJ 且脂肪供能比 ≤50%，两个条件都满足。但「无能量」仍是按界限值标示，不等于数学意义上的绝对零能量。',
    facts,
    canConclude: [
      `能量不高于每 100 ${b} 17 kJ`,
      `脂肪提供的能量约占总能量 ${num(ratio * 100)}%，不超过 50%`,
    ],
    cannotConclude: rule.cannot,
    evidence,
  };
}

/** 0 反式脂肪酸：数值判定 + 「0 不等于绝对零」+ 氢化油脂关系 */
export function analyzeZeroTransFat(claim, ctx, rule) {
  const base = makeResult(claim, 'zero_trans_fat', {
    ruleName: '0 反式脂肪酸 / 不含反式脂肪酸',
    claimType: 'content',
    ruleVersion: 'GB28050-2011',
    basisNote: basisSentence(ctx),
  });

  const reading = readNutrient(ctx, 'trans_fat', { unit: 'g' });
  const b = ctx.basis === 'per_100ml' ? 'mL' : 'g';
  const hydroHits = ctx.searchIngredients(['氢化', '起酥油', '人造奶油', '植脂末', '代可可脂']);

  if (reading.state !== READ_STATE.OK) {
    return {
      ...base,
      status: ANALYSIS_STATUS.INSUFFICIENT,
      verdict: 'unknown',
      takeaway: '没有反式脂肪酸数据，不能把「没标」当成 0。',
      summary: reading.state === READ_STATE.NOT_LABELED || reading.state === READ_STATE.ABSENT
        ? '营养成分表没有反式脂肪酸数据。没有标示不等于含量为 0，无法判断「0 反式脂肪酸」的依据。'
        : '反式脂肪酸的数据还没确认，补齐后才能判断这项声称。',
      facts: [
        { label: '反式脂肪酸', value: reading.state === READ_STATE.ABSENT ? '表里没有这一行' : '包装未标示或数值待确认', tone: 'missing' },
        { label: '标示基准', value: basisSentence(ctx) },
      ],
      missing: ['营养成分表中的反式脂肪酸含量'],
      cannotConclude: rule.cannot,
      warnings: [
        '按 GB 28050—2011 第 4.4 条，配料含氢化或部分氢化油脂时应标示反式脂肪（酸）含量；但「没标」本身不能反推出含量为 0。',
        ...(hydroHits.length ? [`配料表出现「${hydroHits.join('、')}」，值得与反式脂肪酸的标示情况放在一起核对。`] : []),
      ],
      evidence: ['gb2011-c1-trans-fat', 'gb2011-4-4'],
    };
  }

  const facts = [
    { label: '标签反式脂肪酸', value: `${num(reading.value)} g / 100 ${b}` },
    { label: '「无或不含」界限', value: '≤0.3 g / 100 g（固体）或 100 mL（液体）' },
  ];
  if (hydroHits.length) {
    facts.push({ label: '配料中的相关油脂', value: hydroHits.join('、'), tone: 'note' });
  }

  if (reading.value > 0.3) {
    return {
      ...base,
      ...mismatchMeta(),
      status: ANALYSIS_STATUS.EXPANDABLE,
      verdict: 'mismatch',
      flag: 'mismatch',
      takeaway: `反式脂肪酸 ${num(reading.value)} g，超过「0 反式脂肪」的 0.3 g 界限。`,
      mismatchNote: `标签标示反式脂肪酸 ${num(reading.value)} g/100 ${b}，高于「无或不含反式脂肪酸」≤0.3 g 的界限值。建议核对原始包装与配料。`,
      summary: `标签标示反式脂肪酸 ${num(reading.value)} g/100 ${b}，高于「无或不含反式脂肪酸」≤0.3 g 的界限值，与这句话存在不一致疑点。`,
      facts,
      cannotConclude: rule.cannot,
      warnings: ['需要核对原始包装与适用标准；本页不对产品是否合规下结论'],
      evidence: ['gb2011-c1-trans-fat', 'gb2011-4-4'],
    };
  }

  return {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    verdict: 'pass',
    takeaway: '反式脂肪酸不高于 0.3 g/100 g，不等于检测值为绝对零。',
    summary:
      '标签反式脂肪酸不高于 0.3 g/100 g（或 100 mL），符合「无或不含反式脂肪酸」的条件。这个「0」是有界限值的营养声称，不等于检测值必定为绝对零。',
    facts,
    canConclude: ['按标签数值，反式脂肪酸含量不高于每 100 g（或 100 mL）0.3 g'],
    cannotConclude: [
      ...rule.cannot,
      ...(hydroHits.length
        ? ['配料表出现氢化油脂，与成品反式脂肪酸标示「0」可以同时成立；不能把配料名称直接换算成含量']
        : []),
    ],
    warnings: reading.warnings,
    evidence: [
      'gb2011-c1-trans-fat',
      'gb2011-t1-footnote-b',
      'gb2011-4-4',
      'gb2025-qa-hydrogenated',
    ],
  };
}

export function makeContentRule(cfg) {
  return {
    ...cfg,
    claimType: 'content',
    analyze: (claim, ctx) => genericEvaluate(claim, ctx, cfg),
  };
}

export const ZERO_ENERGY_RULE = {
  id: 'zero_energy',
  name: '零热量 / 无能量',
  claimType: 'content',
  evidence: ['gb2011-c1-zero-energy', 'gb2025-2-3-energy-coeff', 'gb2011-t1-footnote-b'],
  cannot: [
    '「无能量」是按界限值（≤17 kJ/100 g 或 100 mL）标示，不等于数学意义上的绝对零能量',
    '不能因为标了「0 能量」就认为可以随意摄入',
    '不能忽略「脂肪提供的能量不超过总能量 50%」这一限制性条件',
  ],
};

export const ZERO_TRANS_RULE = {
  id: 'zero_trans_fat',
  name: '0 反式脂肪酸 / 不含反式脂肪酸',
  claimType: 'content',
  evidence: ['gb2011-c1-trans-fat', 'gb2011-t1-footnote-b', 'gb2011-4-4'],
  cannot: [
    '「0 反式脂肪酸」是有界限值（≤0.3 g/100 g 或 100 mL）的营养声称，不意味着检测值必定为绝对零',
    '配料表没有出现「氢化」字样，也不能反推反式脂肪酸一定为 0',
    '不能把反式脂肪酸为 0 理解为这款食品对心血管没有影响',
  ],
};
