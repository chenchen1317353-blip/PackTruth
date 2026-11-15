/**
 * V1 已有的三条规则：0 脂肪、0 蔗糖、0 糖。
 *
 * V2 只把它们搬进规则目录，判定逻辑、文案、计算方式保持原样，
 * 避免历史行为发生静默变化（第三阶段的测试仍逐条校验这些输出）。
 */

import { PRESENCE } from '../../foodRecord.js';
import { basisLabel } from '../../nutrition.js';
import { ANALYSIS_STATUS, makeResult, roundTo } from '../shared.js';
import { ZERO_LIMITS_2011 } from '../thresholds.js';
import { READ_STATE, readNutrient, per100Unit } from '../nutritionFacts.js';
import { isSucroseClue } from './marketingClaims.js';

/** V1 的零声称也必须经过与其他数值声称相同的读数校验。 */
function checkedZeroReading(ctx, key, base) {
  const reading = readNutrient(ctx, key, { unit: 'g' });
  if (reading.state === READ_STATE.OK && reading.formBasisCompatible) return { reading };
  const reasons = [...reading.missing, ...reading.warnings];
  if (reading.state === READ_STATE.OK) reasons.push('食品形态与每 100 g / 100 mL 的口径不一致，不能假设密度为 1');
  return { problem: {
    ...base, verdict: 'unknown', status: ANALYSIS_STATUS.INSUFFICIENT,
    summary: `当前数据不足以确认「${base.claimText}」：${reasons.join('；')}。`,
    takeaway: '请先核对数值、单位与标示基准，再判断这项声称。',
    missing: reasons, warnings: reasons, calculation: null,
  } };
}

function nonzeroWithinLimit(base, value, label, ctx) {
  const b = per100Unit(ctx);
  return {
    ...base, verdict: 'pass', status: ANALYSIS_STATUS.EXPANDABLE,
    takeaway: `标签${label} ${value} g/100 ${b}，数值不高于 0.5 g 的含量声称界限。`,
    summary: `按已确认数值，${label} ${value} g/100 ${b} 不高于「无或不含${label}」的 0.5 g 界限；不等于绝对零。`,
    facts: [{ label: `标签${label}标示值`, value: `${value} g / 100 ${b}` }],
    canConclude: ['该数值满足含量声称条件；标签的零值修约方式仍需另行核对'],
    cannotConclude: ['不能认为实际含量精确为零，也不能把界限值当作实际摄入量'],
    warnings: ['表 1 对不高于零界限值的标示另有修约要求，请核对包装原始数值和单位'],
    evidence: [label === '脂肪' ? 'gb2011-c1-fat' : 'gb2011-c1-sugar', 'gb2011-t1-footnote-b'],
  };
}

// ---------------------------------------------------------------- 0 脂肪

export function analyzeZeroFat(claim, ctx) {
  let fat = ctx.find('fat');
  const base = makeResult(claim, 'zero_fat', {
    ruleName: '0 脂肪 / 无脂肪',
    claimType: 'content',
  });

  // 1) 根本没有脂肪这一行
  if (!fat) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '没有脂肪数据，无法确认「0 脂肪」。',
      summary: '营养成分表里没有找到「脂肪」这一项，无法判断这句话是否成立。',
      facts: [{ label: '脂肪', value: '未在营养成分表中找到', tone: 'missing' }],
      missing: ['营养成分表中的脂肪含量'],
      cannotConclude: ['不能因为没找到就认为脂肪为 0'],
      evidence: [],
    };
  }

  // 2) 包装上确实没标脂肪
  if (fat.presence === PRESENCE.NOT_LABELED) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '包装未标示脂肪，无法确认「0 脂肪」。',
      summary: '你已确认包装上没有标示脂肪含量，因此无法判断「0 脂肪」的依据。',
      facts: [{ label: '脂肪', value: '包装未标示', tone: 'missing' }],
      missing: ['营养成分表中的脂肪含量'],
      evidence: [],
    };
  }

  // 3) 有这一行但没读出数值
  if (fat.value === null) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '脂肪数值待补录，暂时无法确认「0 脂肪」。',
      summary: '营养成分表里有「脂肪」这一行，但数值还没确认，先补上数值才能分析。',
      facts: [{ label: '脂肪', value: '有该行，数值待补录', tone: 'pending' }],
      missing: ['脂肪的具体数值'],
      evidence: [],
    };
  }

  const checked = checkedZeroReading(ctx, 'fat', base);
  if (checked.problem) return checked.problem;
  const originalBasis = ctx.basis;
  fat = { ...fat, value: checked.reading.value, unit: 'g' };
  ctx = { ...ctx, basis: checked.reading.normalizedBasis, servingUnit: per100Unit(ctx) };
  if (fat.value > 0 && fat.value <= ZERO_LIMITS_2011.fat.value) return nonzeroWithinLimit(base, fat.value, '脂肪', ctx);
  const basisOk = originalBasis === 'per_100g' || originalBasis === 'per_100ml';
  const basisNote = ctx.basis ? basisLabel(ctx.basis) : '基准未确认';

  // 4) 标签值不是 0 —— 和「0 脂肪」这句话冲突，最可能是识别或选择有误
  if (fat.value > 0) {
    const overLimit = basisOk ? fat.value > ZERO_LIMITS_2011.fat.value : false;
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '标签脂肪不是 0，与「0 脂肪」对不上。',
      summary: overLimit
        ? `标签标示脂肪为 ${fat.value} ${fat.unit || 'g'}（${basisNote}），已经超过「0」界限值，和你选的「0 脂肪」对不上。请先核对是不是识别错了，或者包装上写的是别的说法。`
        : `标签标示脂肪为 ${fat.value} ${fat.unit || 'g'}（${basisNote}），不是 0，和「0 脂肪」这句话对不上。请先核对数值是否识别正确。`,
      facts: [
        { label: '标签脂肪标示值', value: `${fat.value} ${fat.unit || 'g'}` },
        { label: '标示基准', value: basisNote },
        { label: '「0」界限值', value: `${ZERO_LIMITS_2011.fat.value} g / 100 ${ctx.basis === 'per_100ml' ? 'mL' : 'g'}` },
      ],
      cannotConclude: ['不能在同一份标签数据下同时认定「脂肪为 0」和「标了非零脂肪值」'],
      warnings: ['标签数值与所选宣传语矛盾，优先怀疑识别错误或选错宣传语'],
      evidence: ['gb2011-t1-fat-zero'],
    };
  }

  // 5) 标签值 = 0 —— 主场景
  const facts = [
    { label: '标签脂肪标示值', value: `0 ${fat.unit || 'g'}` },
    { label: '标示基准', value: basisNote },
  ];

  const limitInfo = ZERO_LIMITS_2011.fat;
  facts.push({
    label: 'GB 28050-2011 表 1「0」界限值',
    value: `≤ ${limitInfo.value} ${limitInfo.unit} / 100 ${ctx.basis === 'per_100ml' ? 'mL' : 'g'}`,
  });

  const baseResult = {
    ...base,
    verdict: 'pass',
    status: ANALYSIS_STATUS.EXPANDABLE,
    takeaway: `标签脂肪标「0」，按标签规则不高于 0.5 g/100 ${per100Unit(ctx)}，不等于绝对零。`,
    summary:
      '标签上的「0」是按「0」界限值标出来的：脂肪含量不高于界限值，而不是检测结果精确等于零。',
    facts,
    canConclude: [
      `按 GB 28050-2011 表 1，这款食品的脂肪含量不高于每 100 ${
        ctx.basis === 'per_100ml' ? 'mL' : 'g'
      } ${limitInfo.value} ${limitInfo.unit}`,
    ],
    cannotConclude: [
      '不能认为脂肪含量精确为 0 —— 标示「0」表示低于界限值，实际含量未知',
      '不能据此认为吃多少都不会摄入脂肪',
    ],
    evidence: ['gb2011-t1-fat-zero', 'gb2011-t1-footnote-b', 'gb2011-c1-fat'],
  };

  // 计算理论上限
  if (!basisOk) {
    return {
      ...baseResult,
      calculation: null,
      missing: ['可用的标示基准（每 100 克 / 每 100 毫升）'],
      warnings: originalBasis === 'per_serving' ? ['当前按「每份」标示，食用量滑块的单位需另行确认；本页暂不换算该份的理论上限'] : ['标示基准未确认，无法计算'],
    };
  }

  const amount = ctx.servingAmount;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ...baseResult, calculation: null, warnings: ['还没有设置食用量'] };
  }

  const factor = amount / 100;
  const upper = roundTo(factor * limitInfo.value, 3);

  return {
    ...baseResult,
    facts: [...facts, { label: '你设置的食用量', value: `${amount} ${ctx.servingUnit}` }],
    calculation: {
      expression: `${amount} ÷ 100 × ${limitInfo.value}`,
      result: upper,
      unit: limitInfo.unit,
      isUpperBound: true,
      label: '按这个食用量推算的脂肪理论上限',
      note: `这不是实测值，也不是你实际摄入的脂肪量。按标签规则，实际含量可能低于 ${upper} ${limitInfo.unit}，具体数值无从得知。`,
    },
    evidence: ['gb2011-t1-fat-zero', 'gb2011-t1-footnote-b', 'gb2011-c1-fat'],
  };
}

// ---------------------------------------------------------------- 0 蔗糖

export function analyzeZeroSucrose(claim, ctx) {
  let sugar = ctx.find('sugar');
  const base = makeResult(claim, 'zero_sucrose', {
    ruleName: '0 蔗糖',
    claimType: 'content',
  });

  const facts = [];
  const missing = [];

  if (sugar && sugar.value !== null && sugar.presence !== PRESENCE.NOT_LABELED) {
    const checked = checkedZeroReading(ctx, 'sugar', base);
    if (checked.problem) return checked.problem;
    sugar = { ...sugar, value: checked.reading.value, unit: 'g' };
    ctx = { ...ctx, basis: checked.reading.normalizedBasis };
  }

  // 糖的状态
  let sugarState = 'unknown';
  if (!sugar) {
    sugarState = 'absent';
    facts.push({ label: '营养成分表「糖」', value: '表里没有这一行', tone: 'missing' });
    missing.push('营养成分表中的糖含量');
  } else if (sugar.presence === PRESENCE.NOT_LABELED) {
    sugarState = 'not_labeled';
    facts.push({ label: '营养成分表「糖」', value: '包装未标示', tone: 'missing' });
    missing.push('营养成分表中的糖含量');
  } else if (sugar.value === null) {
    sugarState = 'unreadable';
    facts.push({ label: '营养成分表「糖」', value: '有该行，数值待补录', tone: 'pending' });
    missing.push('糖的具体数值');
  } else {
    sugarState = 'value';
    facts.push({
      label: '标签糖标示值',
      value: `${sugar.value} ${sugar.unit || 'g'}（${ctx.basis ? basisLabel(ctx.basis) : '基准未确认'}）`,
    });
  }

  // 碳水化合物不等于糖，明确写出来
  const carb = ctx.find('carbohydrate');
  if (carb && carb.value !== null) {
    facts.push({
      label: '标签碳水化合物',
      value: `${carb.value} ${carb.unit || 'g'} · 碳水化合物 ≠ 糖`,
      tone: 'note',
    });
  }

  // 配料线索
  const sucroseHits = ctx.ingredientNames.filter(isSucroseClue);
  const sweetenerHits = ctx.searchIngredients([
    '三氯蔗糖',
    '安赛蜜',
    '阿斯巴甜',
    '甜菊糖苷',
    '赤藓糖醇',
    '木糖醇',
    '山梨糖醇',
    '麦芽糖醇',
  ]);

  if (sucroseHits.length) {
    facts.push({
      label: '配料中与蔗糖相关的项',
      value: sucroseHits.join('、'),
      tone: 'warn',
    });
  }
  if (sweetenerHits.length) {
    facts.push({
      label: '配料中的甜味剂',
      value: sweetenerHits.join('、'),
      tone: 'note',
    });
  }
  if (!sucroseHits.length && ctx.ingredientNames.length) {
    facts.push({ label: '配料表', value: '未见白砂糖、蔗糖等字样', tone: 'note' });
  }

  const baseResult = {
    ...base,
    status: ANALYSIS_STATUS.EXPANDABLE,
    facts,
    canConclude: [],
    cannotConclude: [
      '「0 蔗糖」不等于「0 糖」—— 蔗糖只是糖的一种，不能把蔗糖含量当作总糖含量',
      '不能把配料表里没有白砂糖，直接当成产品不含任何糖',
      '不能把配料中的甜味剂（如三氯蔗糖）当作糖，也不能因为名字里有「蔗糖」就误会它',
    ],
    evidence: ['gb2011-c1-sugar', 'gb2011-c1-scope', 'gb2025-qa-sugar-def'],
  };

  // 根据糖的数据状态给不同结论
  if (sugarState === 'value') {
    const isZero = sugar.value === 0;
    return {
      ...baseResult,
      verdict: isZero ? 'pass' : 'unknown',
      takeaway: isZero
        ? '标签糖标 0，但「0 蔗糖」仍只说明蔗糖。'
        : `标签糖 ${sugar.value} ${sugar.unit || 'g'}，说明总糖不为零。`,
      summary: isZero
        ? '标签标示糖为 0，这比「0 蔗糖」说法更强；但「糖 0」同样是按界限值标示的，不等于绝对无糖。'
        : `标签标示糖为 ${sugar.value} ${sugar.unit || 'g'}，你选择了「0 蔗糖」。蔗糖是糖的一种，这句话并不能说明总糖为零，也不能证明生产时未添加蔗糖。`,
      canConclude: isZero
        ? [`按标签，糖含量不高于每 100 ${ctx.basis === 'per_100ml' ? 'mL' : 'g'} 0.5 g`]
        : [`按标签，这款食品的糖含量为 ${sugar.value} ${sugar.unit || 'g'}`],
      warnings: isZero
        ? []
        : ['所选宣传语不等于已核实的包装原文；是否添加蔗糖需要配料和生产信息，不能由总糖数值反推'],
      missing: [],
    };
  }

  // 糖未标示 —— 核心的信息不足场景
  const reason =
    sugarState === 'unreadable'
      ? '标签上有「糖」这一行，但数值还没确认。'
      : sugarState === 'not_labeled'
        ? '你已确认包装上没有标示糖含量。'
        : '营养成分表里没有「糖」这一项。';

  return {
    ...baseResult,
    verdict: 'unknown',
    status: ANALYSIS_STATUS.INSUFFICIENT,
    takeaway: '没有糖含量数据，无法确认「0 蔗糖」背后的总糖。',
    summary: `${reason}因此无法确认这款食品的总糖含量；你选择的「0 蔗糖」不能推出总糖为零，也不能证明包装确实这样写。`,
    canConclude: sucroseHits.length
      ? ['配料表中出现了含蔗糖的配料，值得与「0 蔗糖」的说法放在一起核对']
      : ['本次选择了「0 蔗糖」供分析；仍需核对包装原文'],
    missing: [...new Set([...missing, '营养成分表中的糖含量'])],
    warnings: [
      '碳水化合物的数值不能直接当作糖含量',
      'GB 28050-2011 附录 C 表 C.1 中，糖相关的声称用语是「无或不含糖」，未列出「0 蔗糖」这一表述',
    ],
  };
}

// ---------------------------------------------------------------- 0 糖

export function analyzeZeroSugar(claim, ctx) {
  let sugar = ctx.find('sugar');
  const base = makeResult(claim, 'zero_sugar', {
    ruleName: '0 糖 / 无糖',
    claimType: 'content',
  });
  const facts = [];

  if (!sugar) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '没有糖数据，无法确认「0 糖」。',
      summary: '营养成分表里没有找到「糖」这一项，无法判断「0 糖」是否成立。',
      facts: [{ label: '营养成分表「糖」', value: '表里没有这一行', tone: 'missing' }],
      missing: ['营养成分表中的糖含量'],
      cannotConclude: ['不能用碳水化合物的数值代替糖含量'],
      evidence: ['gb2011-t1-sugar-zero'],
    };
  }

  if (sugar.presence === PRESENCE.NOT_LABELED) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '包装未标示糖，无法确认「0 糖」。',
      summary: '你已确认包装上没有标示糖含量，因此无法判断「0 糖」的依据。',
      facts: [{ label: '营养成分表「糖」', value: '包装未标示', tone: 'missing' }],
      missing: ['营养成分表中的糖含量'],
      evidence: [],
    };
  }

  if (sugar.value === null) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: '糖数值待补录，暂时无法确认「0 糖」。',
      summary: '包装上有「糖」这一行，但数值还没确认，补上数值后才能分析。',
      facts: [{ label: '营养成分表「糖」', value: '有该行，数值待补录', tone: 'pending' }],
      missing: ['糖的具体数值'],
      evidence: [],
    };
  }

  const checked = checkedZeroReading(ctx, 'sugar', base);
  if (checked.problem) return checked.problem;
  const originalBasis = ctx.basis;
  sugar = { ...sugar, value: checked.reading.value, unit: 'g' };
  ctx = { ...ctx, basis: checked.reading.normalizedBasis, servingUnit: per100Unit(ctx) };
  if (sugar.value > 0 && sugar.value <= ZERO_LIMITS_2011.sugar.value) return nonzeroWithinLimit(base, sugar.value, '糖', ctx);
  const basisOk = originalBasis === 'per_100g' || originalBasis === 'per_100ml';
  facts.push(
    { label: '标签糖标示值', value: `${sugar.value} ${sugar.unit || 'g'}` },
    { label: '标示基准', value: ctx.basis ? basisLabel(ctx.basis) : '基准未确认' },
  );

  if (sugar.value > 0) {
    return {
      ...base,
      verdict: 'unknown',
      status: ANALYSIS_STATUS.INSUFFICIENT,
      takeaway: `标签糖 ${sugar.value} ${sugar.unit || 'g'}，与「0 糖」对不上。`,
      summary: `标签标示糖为 ${sugar.value} ${sugar.unit || 'g'}，不是 0，和「0 糖」这句话对不上。请先核对数值是否识别正确。`,
      facts,
      warnings: ['标签数值与所选宣传语矛盾，优先怀疑识别错误或选错宣传语'],
      evidence: ['gb2011-t1-sugar-zero'],
    };
  }

  const result = {
    ...base,
    verdict: 'pass',
    status: ANALYSIS_STATUS.EXPANDABLE,
    facts: [...facts, { label: 'GB 28050-2011 表 1「0」界限值', value: '≤ 0.5 g / 100 g（或 100 mL）' }],
    takeaway: `标签糖标「0」，按标签规则不高于 0.5 g/100 ${per100Unit(ctx)}，不等于绝对无糖。`,
    summary: `标签糖标「0」，按标签规则表示糖含量不高于界限值 0.5 g/100 ${per100Unit(ctx)}，不等于绝对无糖。`,
    canConclude: ['按 GB 28050-2011 表 1，糖含量不高于每 100 g（或 100 mL）0.5 g'],
    cannotConclude: ['不能认为含糖量精确为零', '不能把「无糖」理解为对血糖没有影响'],
    evidence: ['gb2011-t1-sugar-zero', 'gb2011-t1-footnote-b', 'gb2011-c1-sugar'],
  };

  if (!basisOk) {
    return { ...result, calculation: null, warnings: ['标示基准未确认，无法换算你这一份的上限'] };
  }

  const amount = ctx.servingAmount;
  if (!Number.isFinite(amount) || amount <= 0) return { ...result, calculation: null };

  const upper = roundTo((amount / 100) * 0.5, 3);
  return {
    ...result,
    calculation: {
      expression: `${amount} ÷ 100 × 0.5`,
      result: upper,
      unit: 'g',
      isUpperBound: true,
      label: '按这个食用量推算的糖理论上限',
      note: '这是标签规则允许的上限，不是实测值。',
    },
  };
}
