/**
 * 食品安全评价术语规则表（V5.2 科学性修复 · 规则 A 的数据层）。
 *
 * 为什么需要单独一张表：
 * 「ADI not specified」「No ADI allocated」「临时 ADI」这些词在食品毒理学里各有精确含义，
 * 但翻译成中文时常被压成同一句「没有限制/不需要限定」，于是一个本来很谨慎的结论
 * 就变成了「可以随便吃」。
 *
 * 这张表的每一条都对应 JECFA 官方定义（见 sources.js 的 K13）。
 * 检查器（scientificGuard.js）只做机械比对，判断依据全部来自这里，不在代码里散落规则。
 *
 * 重要边界：
 * 这张表能识别「术语被怎样误用」，但识别不了「整段论述在科学上是否成立」。
 * 所以未命中的结论不等于已核实，只等于「没有触发已知的错误模式」。
 */

/**
 * 术语定义。
 *
 * 字段说明：
 *   detect            —— 在**证据原文**里识别该术语的正则
 *   officialMeaning   —— 官方定义的白话版，用于生成提示与报告
 *   allowed           —— 与该术语相容的解释方向（关键词，用于正面提示）
 *   forbidden         —— 不相容的推论。每条含 pattern 与 why
 *   gmpRequired       —— 该术语下是否仍受良好生产规范约束
 *   sourceId          —— 依据来源编号
 */
export const SAFETY_TERMS = {
  ADI_NOT_SPECIFIED: {
    id: 'ADI_NOT_SPECIFIED',
    label: 'ADI not specified（未规定具体数值）',
    detect: [
      /ADI[^.\n]{0,40}not\s+specified/i,
      /ADI\s*not\s+specified/i,
      /每日允许摄入量[^。；\n]{0,30}(不需要|无须|无需)[^。；\n]{0,10}(规定|限定|设定)/,
      /(不需要|无须|无需)规定[^。；\n]{0,10}每日允许摄入量/,
    ],
    officialMeaning:
      '基于现有毒理学、生化及其他资料，该物质按达到预期效果所需用量、加上食品中可接受的本底所构成的总日摄入量，委员会认为不构成健康危害，因此不认为有必要规定一个以 mg/kg 体重表示的数值。该表述是 JECFA 第 18 次会议专门用来替代早先的「ADI not limited（不限定摄入量）」的。',
    allowed: ['无须规定数值型 ADI', '不认为有必要设定数值', '毒性很低', '仍须符合良好生产规范'],
    forbidden: [
      {
        pattern: /(无限量|任意量|随意|随便|想加多少|无上限|任何摄入量)[^。；\n]{0,20}(安全|摄入|添加|使用)/,
        why: 'ADI not specified 不能被解释为「无限量摄入安全」',
      },
      {
        pattern: /(安全|可以|允许)[^。；\n]{0,12}(无限量|任意量|随便|无上限)/,
        why: 'ADI not specified 不能被解释为「可以任意添加」',
      },
      {
        pattern: /(完全没有限制|没有任何限制|不受任何限制|不受限制|无需遵守|无需限量)/,
        why: 'ADI not specified 不等于「没有限制」——它仍受良好生产规范约束',
      },
      {
        pattern: /(绝对安全|完全安全|百分百安全|一定安全|一定无害)/,
        why: '任何评估结论都不支持「绝对安全」这种表述',
      },
    ],
    gmpRequired: true,
    sourceId: 'K13',
  },

  ADI_NOT_ALLOCATED: {
    id: 'ADI_NOT_ALLOCATED',
    label: 'No ADI allocated（未分配 ADI）',
    detect: [
      /no\s+ADI\s+allocated/i,
      /ADI\s+not\s+allocated/i,
      /未分配[^。；\n]{0,8}ADI/,
      /(未|没有)制定[^。；\n]{0,8}每日允许摄入量/,
    ],
    officialMeaning:
      '适用于现有资料不足以确定其安全性、或规格不足以确定其身份的物质。与 ADI not specified 完全不同：后者是毒性极低因而无须设数值，前者是资料不够所以定不了。',
    allowed: ['资料不足', '无法确定安全性', '尚不能确定'],
    forbidden: [
      {
        pattern: /(毒性(很)?低|低毒|安全性(很)?高|已被证明安全)/,
        why: 'No ADI allocated 不代表毒性低，而是资料不足',
      },
      {
        pattern: /(不需要|无须|无需)(规定|限定|设定)/,
        why: 'No ADI allocated 不能与 ADI not specified 混为一谈',
      },
    ],
    gmpRequired: false,
    sourceId: 'K13',
  },

  TEMPORARY_ADI: {
    id: 'TEMPORARY_ADI',
    label: 'Temporary ADI（临时 ADI）',
    detect: [/temporary\s+ADI/i, /临时[^。；\n]{0,6}ADI/, /暂定[^。；\n]{0,6}(ADI|每日允许摄入量)/],
    officialMeaning:
      '在指定期限内等待补充资料期间临时给出的 ADI。它意味着现有毒理学资料足以保证该期限内的使用安全；若到期未提供补充资料，该临时 ADI 可能在后续会议上被撤销。',
    allowed: ['临时', '尚待补充资料', '有期限'],
    // 这一条不用正则误用模式，而是由检查器判断「提到 ADI 却漏掉临时性」
    forbidden: [],
    requiresMarkerInClaim: ['临时', '暂定', 'temporary'],
    gmpRequired: false,
    sourceId: 'K13',
  },

  NUMERIC_ADI: {
    id: 'NUMERIC_ADI',
    label: '数值型 ADI',
    detect: [/(\d+(?:\.\d+)?)\s*mg\s*\/\s*kg\s*(?:bw|体重)/i, /每日允许摄入量[^。；\n]{0,12}(\d+(?:\.\d+)?)\s*mg/i],
    officialMeaning:
      '以 mg/kg 体重表示的每日允许摄入量。JECFA 说明它只是指导值：偶尔超过、而长期平均摄入不超过时，不必过度担心；但也不构成「低于它就绝对安全、高于它就立即有害」的分界线。',
    allowed: ['指导值', '估计值', '风险评估工具'],
    forbidden: [
      {
        pattern: /(低于|不超过)[^。；\n]{0,16}(就|即|则)[^。；\n]{0,8}(绝对安全|一定安全|完全无害)/,
        why: '数值型 ADI 不是安全与不安全的截然分界线',
      },
      {
        pattern: /(超过|高于)[^。；\n]{0,16}(就|即|则)[^。；\n]{0,8}(中毒|有害|危险)/,
        why: '超过 ADI 不等于立即产生健康危害',
      },
      {
        pattern: /(根据|按照|从)[^。；\n]{0,8}配料表[^。；\n]{0,16}(推算|计算|算出)[^。；\n]{0,10}(摄入量|吃了多少)/,
        why: '配料表不提供添加量，无法据此推算摄入量',
      },
    ],
    gmpRequired: false,
    sourceId: 'K13',
  },

  GMP: {
    id: 'GMP',
    label: 'GMP / 按生产需要适量使用',
    detect: [
      /good\s+manufacturing\s+practice/i,
      /按生产需要适量使用/,
      /按实际生产需要适量使用/,
      /\bGMP\b/,
    ],
    officialMeaning:
      '「按生产需要适量使用」是一种限量表达方式：标准不设统一的数值上限，但仍要求符合良好生产规范——工艺上确有效果、按最低有效量使用、不掩盖食品劣质或掺假、不造成营养失衡。',
    allowed: ['按工艺需要', '最低有效量', '不设统一数值上限但仍受约束'],
    forbidden: [
      {
        pattern: /(可以|能够|允许)[^。；\n]{0,10}(无限|任意|随便|随意)[^。；\n]{0,6}(添加|使用)/,
        why: '「按生产需要适量使用」不等于可以无限添加',
      },
      {
        pattern: /(没有|不存在|无需)[^。；\n]{0,8}(用量|使用量|添加量)[^。；\n]{0,6}(要求|限制|约束)/,
        why: '「按生产需要适量使用」仍有工艺必要性和最低有效量的要求',
      },
    ],
    gmpRequired: true,
    sourceId: 'K13',
  },
};

/** 否定语境词。出现在误用表述之前时，说明这是一句正确的否定句，不应拦截。 */
export const NEGATION_MARKERS = [
  '不意味着',
  '不代表',
  '不等于',
  '并非',
  '并不是',
  '而不是',
  '不能',
  '不可',
  '不应',
  '不得',
  '绝不',
  '绝非',
  '不能据此',
  '不表示',
  '并不意味着',
];

/** 在给定位置之前的一个窗口内是否出现否定词 */
export function isNegatedAt(text, index, windowSize = 18) {
  const start = Math.max(0, index - windowSize);
  const window = String(text || '').slice(start, index);
  return NEGATION_MARKERS.some((m) => window.includes(m));
}

/**
 * 在证据原文里识别出现了哪些安全术语。
 * @returns {Array<{ id: string, label: string, matched: string }>}
 */
export function detectTermsInEvidence(text) {
  const s = String(text || '');
  const found = [];
  for (const term of Object.values(SAFETY_TERMS)) {
    for (const re of term.detect) {
      const m = s.match(re);
      if (m) {
        found.push({ id: term.id, label: term.label, matched: m[0].slice(0, 80) });
        break;
      }
    }
  }
  return found;
}

/** 该术语的官方定义（给提示词和报告用） */
export function getTermMeaning(id) {
  return SAFETY_TERMS[id]?.officialMeaning || null;
}
