/**
 * 话术规则注册表。
 *
 * 只有这一份「宣传语文字 -> 规则」的映射。组件里不允许再写 if/else 判断宣传语。
 *
 * 匹配规则：
 * 1. 先规范化（全角转半角、去空格与标点、小写）。
 * 2. 按数组顺序逐条尝试，先匹配到的赢——顺序就是「具体优先于笼统」。
 * 3. 每条规则可以带排除条件，用来挡住最容易混的那几种：
 *    零蔗糖 ≠ 零糖、不添加糖 ≠ 零糖、高蛋白 ≠ 蛋白质来源、
 *    无防腐剂 ≠ 零添加、低盐 ≠ 无盐、低脂 ≠ 低饱和脂肪。
 * 4. 没匹配到就返回 null，由调用方给出「尚未收录」，绝不套用别的规则。
 */

import { analyzeZeroFat, analyzeZeroSucrose, analyzeZeroSugar } from './rules/zeroClaims.js';
import {
  CONTENT_RULES,
  ZERO_ENERGY_RULE,
  ZERO_TRANS_RULE,
  analyzeZeroEnergy,
  analyzeZeroTransFat,
  makeContentRule,
} from './rules/contentClaims.js';
import { COMPARISON_RULES, analyzeComparison } from './rules/comparisonClaims.js';
import {
  analyzeJuice100,
  analyzeNatural,
  analyzeNoAddedSucrose,
  analyzeNoAddedSugar,
  analyzeNoColorant,
  analyzeNoPreservative,
  analyzeNonFried,
  analyzeWholeGrain,
  analyzeZeroAdditive,
} from './rules/marketingClaims.js';

/** 规范化：只做写法归一，不改词序、不删实词 */
export function normalizeClaimText(input) {
  let s = String(input || '');
  // 全角 -> 半角
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/\u3000/g, ' ');
  s = s.replace(/百分之百|百分百/g, '100%');
  // 去掉空白与常见标点、引号、括号
  s = s.replace(/[\s·・,，。.;；:：、"'"'“”‘’「」『』()（）[\]【】]/g, '');
  return s.toLowerCase();
}

const contentById = Object.fromEntries(CONTENT_RULES.map((r) => [r.id, r]));

const contentRule = (id, patterns, excludes = []) => ({
  ...makeContentRule(contentById[id]),
  patterns,
  excludes,
});

const RULE_TABLE = [
  // ---------------- 配料强调（必须先于「0 糖」「零添加」） ----------------
  {
    id: 'no_added_sucrose',
    name: '不添加蔗糖 / 无添加蔗糖',
    claimType: 'ingredient',
    patterns: [/不添加蔗糖|未添加蔗糖|无添加蔗糖|零添加蔗糖|0添加蔗糖|没有添加蔗糖|不加蔗糖/],
    analyze: analyzeNoAddedSucrose,
  },
  {
    id: 'no_added_sugar',
    name: '不添加糖 / 无添加糖',
    claimType: 'ingredient',
    patterns: [/不添加糖|未添加糖|无添加糖|零添加糖|0添加糖|没有添加糖|不加糖/],
    analyze: analyzeNoAddedSugar,
  },
  {
    id: 'no_preservative',
    name: '不添加防腐剂 / 无防腐剂',
    claimType: 'ingredient',
    patterns: [/不添加防腐剂|未添加防腐剂|无添加防腐剂|零添加防腐剂|0添加防腐剂|无防腐剂|不含防腐剂|0防腐剂|没有防腐剂/],
    analyze: analyzeNoPreservative,
  },
  {
    id: 'no_colorant',
    name: '不添加色素 / 无色素',
    claimType: 'ingredient',
    patterns: [/不添加色素|不添加着色剂|未添加色素|无添加色素|0添加色素|0添加着色剂|无色素|不含色素|0色素|无着色剂|不含着色剂/],
    analyze: analyzeNoColorant,
  },
  {
    id: 'zero_additive',
    name: '零添加 / 0 添加 / 无添加',
    claimType: 'marketing',
    patterns: [/(零|0)添加/, /^(无|没有|未)添加$/],
    excludes: [/(零|0|无|未|没有)添加(糖|蔗糖|防腐剂|色素|着色剂|香精|香料|甜味剂|增味剂)/],
    analyze: analyzeZeroAdditive,
  },

  // ---------------- 糖（顺序：蔗糖 -> 糖） ----------------
  {
    id: 'zero_sucrose',
    name: '0 蔗糖',
    claimType: 'content',
    patterns: [/0蔗糖|零蔗糖|无蔗糖|不含蔗糖|0%蔗糖/],
    excludes: [/添加/],
    analyze: analyzeZeroSucrose,
  },
  {
    id: 'zero_sugar',
    name: '0 糖 / 无糖',
    claimType: 'content',
    patterns: [/0糖|零糖|无糖|不含糖|0%糖/],
    excludes: [/蔗糖|乳糖|糖浆|添加/],
    analyze: analyzeZeroSugar,
  },

  // ---------------- 脂肪 ----------------
  {
    id: 'zero_trans_fat',
    name: '0 反式脂肪酸',
    claimType: 'content',
    patterns: [/(0|零|无|不含)反式脂肪酸?/],
    analyze: (claim, ctx) => analyzeZeroTransFat(claim, ctx, ZERO_TRANS_RULE),
  },
  {
    id: 'zero_fat',
    name: '0 脂肪 / 无脂肪',
    claimType: 'content',
    patterns: [/0脂肪|零脂肪|无脂肪|不含脂肪|0%脂肪|无脂/],
    excludes: [/反式|饱和/],
    analyze: analyzeZeroFat,
  },

  // ---------------- 钠 / 盐 ----------------
  contentRule('zero_sodium', [/0钠|零钠|无钠|不含钠|0盐|零盐|无盐|不含盐/]),
  contentRule('low_sodium', [/低钠|低盐|少盐/]),

  // ---------------- 能量 ----------------
  {
    id: 'zero_energy',
    name: '零热量 / 无能量',
    claimType: 'content',
    patterns: [/0热量|零热量|无热量|0能量|零能量|无能量|0卡|零卡|0千卡|无卡路里|零卡路里|0卡路里/],
    excludes: [/低/],
    analyze: (claim, ctx) => analyzeZeroEnergy(claim, ctx, ZERO_ENERGY_RULE),
  },
  contentRule('low_energy', [/低热量|低能量|低卡|低千卡|低卡路里/]),

  // ---------------- 蛋白质（高 -> 来源） ----------------
  contentRule('protein_high', [/高蛋白|高蛋白质|富含蛋白质|蛋白质含量高|蛋白质丰富/]),
  contentRule('protein_source', [/蛋白质来源|含蛋白质|含有蛋白质|提供蛋白质/]),

  // ---------------- 膳食纤维（高 -> 来源） ----------------
  contentRule('fiber_high', [/高膳食纤维|富含膳食纤维|高纤维|膳食纤维含量高|纤维丰富/]),
  contentRule('fiber_source', [/含膳食纤维|含有膳食纤维|膳食纤维来源|提供膳食纤维/]),

  // ---------------- 钙（高 -> 来源） ----------------
  contentRule('calcium_high', [/高钙|富含钙|钙含量高|钙丰富/]),
  contentRule('calcium_source', [/含钙|含有钙|钙来源|提供钙/]),

  // ---------------- 脂肪（低） ----------------
  contentRule('low_fat', [/低脂肪?|少油/], [/饱和|反式/]),

  // ---------------- 糖（低，必须在乳糖之前排除） ----------------
  contentRule('low_sugar', [/低糖/], [/乳糖/]),

  // ---------------- 比较声称 ----------------
  ...COMPARISON_RULES.map((rule) => ({
    ...rule,
    claimType: 'comparison',
    patterns: [
      rule.direction === 'reduce'
        ? {
            reduce_sugar: /减糖|减少糖|降低糖|糖减少|糖降低了?/,
            reduce_fat: /减脂|减少脂肪|降低脂肪|脂肪减少/,
            reduce_sodium: /减盐|减钠|减少盐|减少钠|降低钠|降低盐/,
            reduce_energy: /减少热量|减热量|减少能量|减能量|降低能量|降低热量/,
          }[rule.id]
        : /增加蛋白质|增加蛋白|提高蛋白质|蛋白质增加/,
    ],
    analyze: (claim, ctx) => analyzeComparison(claim, ctx, rule),
  })),

  // ---------------- 配料 / 工艺 / 泛营销 ----------------
  {
    id: 'non_fried',
    name: '非油炸',
    claimType: 'process',
    patterns: [/非油炸|不是油炸|无油炸/],
    analyze: analyzeNonFried,
  },
  {
    id: 'whole_grain',
    name: '全麦 / 全谷物',
    claimType: 'ingredient',
    patterns: [/全麦|全谷物|全谷|纯全麦/],
    analyze: analyzeWholeGrain,
  },
  {
    id: 'juice_100',
    name: '100% 果汁 / 纯果汁',
    claimType: 'ingredient',
    patterns: [/100%果汁|100%纯果汁|纯果汁|100果汁/],
    analyze: analyzeJuice100,
  },
  {
    id: 'natural',
    name: '纯天然 / 天然原料',
    claimType: 'marketing',
    patterns: [/纯天然|天然原料|天然成分|全天然|天然/],
    excludes: [/色素|香精|香料/],
    analyze: analyzeNatural,
  },
];

export const RULES = RULE_TABLE;
export const RULE_COUNT = RULES.length;

export function matchRule(text) {
  const norm = normalizeClaimText(text);
  if (!norm) return null;
  for (const rule of RULES) {
    if (norm === normalizeClaimText(rule.name)) return rule;
    if (rule.excludes?.some((re) => re.test(norm))) continue;
    // 宣传语由用户任意输入；子串命中会把“不含钙”当成“含钙”、糖精当成糖。
    // 仅对已收录的完整用语判定，复杂语句请拆成独立宣传语核对。
    if (rule.patterns?.some((re) => new RegExp(`^(?:${re.source})$`, re.flags).test(norm))) return rule;
  }
  return null;
}

/** 供界面展示「已收录哪些说法」 */
export function listRuleNames() {
  return RULES.map((r) => r.name);
}
