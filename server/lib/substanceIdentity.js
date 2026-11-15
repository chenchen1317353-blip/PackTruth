/**
 * 成分身份关系（纯数据 + 纯函数，不联网）。
 *
 * 为什么需要这一层：
 *   INS 635 的 JECFA 正式评估标题是
 *   "Disodium 5'-guanylate and disodium 5'-inosinate"，
 *   通篇没有出现配料表上的「5′-呈味核苷酸二钠」。
 *   旧流程只用配料名做「这份资料是不是在讲它」的判断，于是：
 *     1. 搜到了也会被白名单/相关性过滤掉；
 *     2. 就算抓回来，也会被判成「资料里没有提到这个成分」。
 *
 * 这个模块只回答「谁和谁是同一个物质 / 谁是谁的组成 / 谁只是同一组」，
 * 不携带任何健康结论、ADI 数值或安全性判断。
 *
 * 关系类型（严格区分，不能互相冒充）：
 *   direct       同一物质（正式名、别名、中英文名）
 *   constituent  混合物的组成物质（只有在联合评估/混合物研究里才能用于混合物）
 *   group        同一评估组（例如亚硫酸盐按组设 ADI；只能用于组级结论）
 *   analog       同一母体的不同盐/不同化学形式（不能直接套用危害结论）
 *
 * 规则来源：JECFA / EFSA / Codex 的命名习惯；每条关系都写明依据。
 */

const STRIP_RE = /[\s\u00a0\u3000'"'`´′’‘\-‐‑‒–—−·,，.。;；:：、/\\()（）[\]【】]/g;

/** 归一化：只抹掉排版与标点差异，不改字、不翻译 */
export function normalizeName(value) {
  return String(value || '').toLowerCase().replace(STRIP_RE, '');
}

/**
 * 身份图谱。
 *
 * 收录原则：
 * - 只收「配料表真实会出现、且权威评估确实按这个身份写过」的物质；
 * - 组成物质必须来自官方定义或评估标题，不凭化学名猜；
 * - 不同盐/不同化学形式单独列出，绝不合并成一条。
 */
export const IDENTITY_GRAPH = {
  '5′-呈味核苷酸二钠': {
    canonical: '5′-呈味核苷酸二钠',
    aliases: ['呈味核苷酸二钠', '5-呈味核苷酸二钠', '核苷酸二钠', 'I+G', 'IMP+GMP'],
    en: [
      "disodium 5'-ribonucleotide",
      "disodium 5'-ribonucleotides",
      'disodium 5-ribonucleotides',
      'sodium 5-ribonucleotide',
      'ribonucleotide',
    ],
    ins: 'INS 635',
    eNumber: 'E635',
    /** 只用于检索，不作为「这份资料在讲它」的直接证据 */
    genericTerms: ['ribonucleotide', 'ribonucleotides'],
    mixture: true,
    constituents: [
      {
        name: '肌苷酸二钠',
        en: ["disodium 5'-inosinate", 'disodium inosinate', 'sodium inosinate', 'inosinate', 'IMP'],
        ins: 'INS 631',
      },
      {
        name: '鸟苷酸二钠',
        en: ["disodium 5'-guanylate", 'disodium guanylate', 'sodium guanylate', 'guanylate', 'GMP'],
        ins: 'INS 627',
      },
    ],
    /** JECFA 对这两个组成物质做过联合评估，标题同时列出两者 */
    jointEvaluation: "disodium 5'-guanylate and disodium 5'-inosinate",
    /** 仅用于检索，不是结论：高摄入/人群最可能出现在哪些研究主题里 */
    highTerms: 'uric acid high intake',
    sensitiveTerms: 'uric acid gout',
    note:
      '商业品通常是肌苷酸二钠与鸟苷酸二钠的混合物（常见 50:50）。' +
      '权威评估可能只写组成物质名，不写「呈味核苷酸二钠」这个商品名。',
  },

  谷氨酸钠: {
    canonical: '谷氨酸钠',
    aliases: ['味精', 'L-谷氨酸钠', '谷氨酸一钠'],
    en: ['monosodium glutamate', 'monosodium L-glutamate', 'glutamic acid', 'glutamate', 'MSG'],
    ins: 'INS 621',
    eNumber: 'E621',
    /** glutamate / glutamates 是组名，单独按组处理 */
    genericTerms: ['glutamate', 'glutamates'],
    group: 'glutamates',
    groupNames: ['glutamates', 'glutamic acid and glutamates', 'glutamic acid-glutamates', '谷氨酸及其盐'],
    groupEvaluation: 'glutamic acid and glutamates (E 620–E 625)',
    highTerms: 'MSG symptom complex headache blood pressure',
    sensitiveTerms: 'MSG symptom complex headache',
    note:
      'EFSA 2017 按「谷氨酸及其盐」整组评估，组 ADI 以谷氨酸计。' +
      '组评估可以用于谷氨酸钠，但引用时必须写明是组级结论。',
  },
  味精: { canonical: '谷氨酸钠', aliasOf: '谷氨酸钠' },

  三氯蔗糖: {
    canonical: '三氯蔗糖',
    aliases: ['蔗糖素'],
    en: ['sucralose', 'trichlorosucrose', 'sucralose E955'],
    ins: 'INS 955',
    eNumber: 'E955',
    highTerms: 'high intake adverse effects chlorinated compounds',
    sensitiveTerms: 'children pregnancy',
    note: '单一物质，不是混合物；高温加工下的降解产物是另一个需要单独说明的问题。',
  },
  蔗糖素: { canonical: '三氯蔗糖', aliasOf: '三氯蔗糖' },

  焦亚硫酸钠: {
    canonical: '焦亚硫酸钠',
    aliases: ['偏亚硫酸钠', '焦亚硫酸钠（以二氧化硫计）'],
    en: ['sodium metabisulfite', 'sodium metabisulphite', 'metabisulfite', 'metabisulphite'],
    ins: 'INS 223',
    eNumber: 'E223',
    group: 'sulfites',
    groupNames: ['sulfites', 'sulphites', 'sulfiting agents', 'sulphiting agents', '亚硫酸盐'],
    groupEvaluation: 'sulfites (as sulfur dioxide)',
    highTerms: 'asthma adverse reactions sulfite',
    sensitiveTerms: 'asthma sulfite sensitivity',
    note:
      '亚硫酸盐是一组共享「以二氧化硫计」组 ADI 的物质。' +
      '组内其他盐的资料只能用于组级结论；具体到焦亚硫酸钠时必须写明是按组评估。',
  },
  二氧化硫: {
    canonical: '二氧化硫',
    aliases: ['亚硫酸酐'],
    en: ['sulfur dioxide', 'sulphur dioxide'],
    ins: 'INS 220',
    eNumber: 'E220',
    group: 'sulfites',
    groupNames: ['sulfites', 'sulphites', 'sulfiting agents', 'sulphiting agents', '亚硫酸盐'],
    groupEvaluation: 'sulfites (as sulfur dioxide)',
  },
  亚硫酸钠: {
    canonical: '亚硫酸钠',
    en: ['sodium sulfite', 'sodium sulphite'],
    ins: 'INS 221',
    eNumber: 'E221',
    group: 'sulfites',
    groupNames: ['sulfites', 'sulphites', 'sulfiting agents', 'sulphiting agents', '亚硫酸盐'],
    groupEvaluation: 'sulfites (as sulfur dioxide)',
  },

  阿斯巴甜: {
    canonical: '阿斯巴甜',
    aliases: ['天门冬酰苯丙氨酸甲酯', '天冬酰苯丙氨酸甲酯'],
    en: ['aspartame', 'aspartyl-phenylalanine methyl ester', 'L-aspartyl-L-phenylalanine methyl ester'],
    ins: 'INS 951',
    eNumber: 'E951',
    highTerms: 'high intake adverse effects',
    sensitiveTerms: 'phenylketonuria PKU phenylalanine',
    metabolite: ['苯丙氨酸', 'phenylalanine'],
    note:
      '阿斯巴甜在体内水解为苯丙氨酸、天冬氨酸和甲醇。' +
      '苯丙酮尿症（PKU）提示来自「苯丙氨酸来源」，不是来自「甜味剂」这个类别。',
    analogs: [
      {
        name: '天门冬酰苯丙氨酸甲酯乙酰磺胺酸',
        en: ['aspartame-acesulfame salt', 'aspartame acesulfame salt', 'aspartame-acesulfame'],
        ins: 'INS 962',
        reason: '阿斯巴甜与安赛蜜形成的盐，是第三个物质，不能与阿斯巴甜共用结论。',
      },
    ],
  },
  天门冬酰苯丙氨酸甲酯: { canonical: '阿斯巴甜', aliasOf: '阿斯巴甜' },
  天门冬酰苯丙氨酸甲酯乙酰磺胺酸: {
    canonical: '天门冬酰苯丙氨酸甲酯乙酰磺胺酸',
    aliases: ['阿斯巴甜-安赛蜜盐', '阿斯巴甜安赛蜜盐'],
    en: ['aspartame-acesulfame salt', 'aspartame acesulfame salt'],
    ins: 'INS 962',
    eNumber: 'E962',
    note: '由阿斯巴甜与安赛蜜形成的盐，是独立物质，不是两者的混合物。',
    analogs: [
      {
        name: '阿斯巴甜',
        en: ['aspartame'],
        ins: 'INS 951',
        reason: '阿斯巴甜是组成该盐的独立物质，结论不能反向套用到盐上。',
      },
    ],
  },

  乙二胺四乙酸二钠: {
    canonical: '乙二胺四乙酸二钠',
    aliases: [
      'EDTA二钠',
      'EDTA-二钠',
      '依地酸二钠',
      '乙二胺四乙酸二钠盐',
      // JECFA 原文常写 "for disodium and Ca-disodium salts"，
      // 不写完整的 "disodium EDTA"；这是同一段评估里的指称。
      'disodium and Ca-disodium salts',
    ],
    en: ['disodium EDTA', 'disodium edetate', 'disodium ethylenediaminetetraacetate', 'EDTA disodium salt'],
    ins: 'INS 386',
    eNumber: 'E386',
    group: 'EDTA',
    groupNames: ['EDTA compounds', 'edetates', 'EDTA'],
    groupEvaluation: 'EDTA compounds (expressed as calcium disodium EDTA)',
    highTerms: 'high intake mineral absorption',
    sensitiveTerms: 'infants children',
    note:
      'EDTA 二钠与 EDTA 二钠钙是两种不同物质，各有独立编号（INS 386 / INS 385）。' +
      'JECFA 1974 对两者设过同一组 ADI，因此组 ADI 可以共用；' +
      '但具体用途、适用范围和危害结论不能互相套用。',
    analogs: [
      {
        name: '乙二胺四乙酸二钠钙',
        en: [
          'calcium disodium EDTA',
          'calcium disodium edetate',
          'calcium disodium ethylenediaminetetraacetate',
          'calcium EDTA',
          'CaNa2EDTA',
        ],
        ins: 'INS 385',
        reason: '钙二钠盐是不同物质；只有组 ADI 是共用的，具体结论不能直接搬。',
        sharesGroupAdi: true,
      },
    ],
  },
  EDTA二钠: { canonical: '乙二胺四乙酸二钠', aliasOf: '乙二胺四乙酸二钠' },
  'EDTA-二钠': { canonical: '乙二胺四乙酸二钠', aliasOf: '乙二胺四乙酸二钠' },
  乙二胺四乙酸二钠钙: {
    canonical: '乙二胺四乙酸二钠钙',
    aliases: ['EDTA二钠钙', '依地酸钙钠'],
    en: ['calcium disodium EDTA', 'calcium disodium edetate'],
    ins: 'INS 385',
    eNumber: 'E385',
    group: 'EDTA',
    groupNames: ['EDTA compounds', 'edetates', 'EDTA'],
    groupEvaluation: 'EDTA compounds (expressed as calcium disodium EDTA)',
    analogs: [
      {
        name: '乙二胺四乙酸二钠',
        en: ['disodium EDTA', 'disodium edetate'],
        ins: 'INS 386',
        reason: '二钠盐是不同物质；只有组 ADI 是共用的。',
        sharesGroupAdi: true,
      },
    ],
  },

  苯甲酸钠: {
    canonical: '苯甲酸钠',
    en: ['sodium benzoate', 'benzoate'],
    ins: 'INS 211',
    eNumber: 'E211',
    group: 'benzoates',
    groupNames: ['benzoates', 'benzoic acid and benzoates', '苯甲酸及其盐'],
    groupEvaluation: 'benzoic acid and benzoates',
    analogs: [
      {
        name: '苯甲酸',
        en: ['benzoic acid'],
        ins: 'INS 210',
        reason: '苯甲酸是母体酸，与钠盐是不同物质；组评估可以共用组级结论。',
        sharesGroupAdi: true,
      },
    ],
  },
  苯甲酸: {
    canonical: '苯甲酸',
    en: ['benzoic acid'],
    ins: 'INS 210',
    eNumber: 'E210',
    group: 'benzoates',
    groupNames: ['benzoates', 'benzoic acid and benzoates', '苯甲酸及其盐'],
    groupEvaluation: 'benzoic acid and benzoates',
  },

  山梨酸钾: {
    canonical: '山梨酸钾',
    en: ['potassium sorbate', 'sorbate'],
    ins: 'INS 202',
    eNumber: 'E202',
    group: 'sorbates',
    groupNames: ['sorbates', 'sorbic acid and sorbates', '山梨酸及其盐'],
    groupEvaluation: 'sorbic acid and sorbates',
    analogs: [
      {
        name: '山梨酸',
        en: ['sorbic acid'],
        ins: 'INS 200',
        reason: '山梨酸是母体酸，与钾盐是不同物质；组评估可以共用组级结论。',
        sharesGroupAdi: true,
      },
    ],
  },
  山梨酸: {
    canonical: '山梨酸',
    en: ['sorbic acid'],
    ins: 'INS 200',
    eNumber: 'E200',
    group: 'sorbates',
    groupNames: ['sorbates', 'sorbic acid and sorbates', '山梨酸及其盐'],
    groupEvaluation: 'sorbic acid and sorbates',
  },

  亚硝酸钠: {
    canonical: '亚硝酸钠',
    en: ['sodium nitrite', 'nitrite'],
    ins: 'INS 250',
    eNumber: 'E250',
    analogs: [
      {
        name: '硝酸钠',
        en: ['sodium nitrate', 'nitrate'],
        ins: 'INS 251',
        reason: '硝酸钠与亚硝酸钠是不同物质；硝酸盐在体内可转化为亚硝酸盐，但不能把两者的结论直接互换。',
      },
    ],
  },
  硝酸钠: {
    canonical: '硝酸钠',
    en: ['sodium nitrate', 'nitrate'],
    ins: 'INS 251',
    eNumber: 'E251',
  },

  安赛蜜: {
    canonical: '安赛蜜',
    aliases: ['乙酰磺胺酸钾', 'AK糖'],
    en: ['acesulfame potassium', 'acesulfame K', 'acesulfame'],
    ins: 'INS 950',
    eNumber: 'E950',
    analogs: [
      {
        name: '天门冬酰苯丙氨酸甲酯乙酰磺胺酸',
        en: ['aspartame-acesulfame salt', 'aspartame acesulfame salt'],
        ins: 'INS 962',
        reason: '阿斯巴甜-安赛蜜盐是独立物质，不能把安赛蜜的 ADI 直接套到盐上。',
      },
    ],
  },
  乙酰磺胺酸钾: { canonical: '安赛蜜', aliasOf: '安赛蜜' },

  碳酸氢钠: {
    canonical: '碳酸氢钠',
    aliases: ['小苏打', '重碳酸钠'],
    en: ['sodium bicarbonate', 'sodium hydrogen carbonate', 'bicarbonate of soda'],
    ins: 'INS 500(ii)',
    eNumber: 'E500(ii)',
  },

  柠檬酸: {
    canonical: '柠檬酸',
    en: ['citric acid'],
    ins: 'INS 330',
    eNumber: 'E330',
    group: 'citrates',
    groupNames: ['citrates', 'citric acid and citrates', '柠檬酸及其盐'],
    groupEvaluation: 'citric acid and citrates',
  },
  柠檬酸钠: {
    canonical: '柠檬酸钠',
    en: ['sodium citrate', 'trisodium citrate'],
    ins: 'INS 331',
    eNumber: 'E331',
    group: 'citrates',
    groupNames: ['citrates', 'citric acid and citrates', '柠檬酸及其盐'],
    groupEvaluation: 'citric acid and citrates',
  },

  乳酸: {
    canonical: '乳酸',
    en: ['lactic acid'],
    ins: 'INS 270',
    eNumber: 'E270',
  },
  琥珀酸二钠: {
    canonical: '琥珀酸二钠',
    aliases: ['丁二酸钠'],
    en: ['disodium succinate', 'sodium succinate'],
    ins: 'INS 364(ii)',
    eNumber: 'E364(ii)',
    group: 'succinates',
    groupNames: ['succinates', 'succinic acid and succinates', 'succinic acid', '琥珀酸及其盐'],
    groupEvaluation: 'succinic acid and succinates',
    note:
      'EFSA 曾把它作为香料物质评估；JECFA 2024 对母体酸琥珀酸维持 ADI「无需规定」。' +
      '母体酸/组级结论可以用于解释，但不能写成对琥珀酸二钠所有食品用途的单独评估。',
  },
  丁二酸钠: { canonical: '琥珀酸二钠', aliasOf: '琥珀酸二钠' },
  磷酸氢二钠: {
    canonical: '磷酸氢二钠',
    en: ['disodium phosphate', 'disodium hydrogen phosphate'],
    ins: 'INS 339(ii)',
    group: 'phosphates',
    groupNames: ['phosphates', 'orthophosphates', '磷酸盐'],
    groupEvaluation: 'phosphates',
  },
  三聚磷酸钠: {
    canonical: '三聚磷酸钠',
    en: ['sodium tripolyphosphate', 'STPP'],
    ins: 'INS 451',
    group: 'phosphates',
    groupNames: ['phosphates', 'polyphosphates', '磷酸盐'],
    groupEvaluation: 'phosphates',
  },
};

/** 用别名反查图谱条目（例如前端传英文名、或配料表写「味精」） */
const LOOKUP = new Map();
for (const [key, value] of Object.entries(IDENTITY_GRAPH)) {
  LOOKUP.set(normalizeName(key), key);
  for (const a of value.aliases || []) LOOKUP.set(normalizeName(a), key);
  for (const e of value.en || []) LOOKUP.set(normalizeName(e), key);
}
// canonical 值也可能指向另一条（aliasOf），统一解析
for (const [key, value] of Object.entries(IDENTITY_GRAPH)) {
  if (value.aliasOf) LOOKUP.set(normalizeName(key), value.aliasOf);
}

function graphEntry(key) {
  return key ? IDENTITY_GRAPH[key] || null : null;
}

function uniqueStrings(list, { min = 2 } = {}) {
  const out = [];
  const seen = new Set();
  for (const v of list || []) {
    const s = String(v || '').trim();
    if (!s || s.length < min) continue;
    const k = normalizeName(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** 一条关系在引用时该怎么标 */
export const BASIS_LABELS = {
  direct: '同一物质',
  constituent: '组成物质（联合评估）',
  group: '同一评估组',
  analog: '相关但不同的化学形式',
  none: '未确认对象',
};

/**
 * 解析成分身份。
 *
 * @param {object} p
 * @param {string} p.name 配料名
 * @param {string[]} [p.aliases] 前端/种子表提供的别名
 * @param {object|null} [p.entry] 本地知识库条目
 * @returns {object}
 */
export function resolveSubstanceIdentity({ name = '', aliases = [], entry = null } = {}) {
  const input = String(name || '').trim();
  const directKey = LOOKUP.get(normalizeName(input));
  const entryKey = entry ? LOOKUP.get(normalizeName(entry.canonicalName)) : null;

  // 先按主名找，找不到再按别名找（别名可能正是图谱里的英文名）
  let key = directKey || entryKey || null;
  if (!key) {
    for (const a of aliases || []) {
      const k = LOOKUP.get(normalizeName(a));
      if (k) {
        key = k;
        break;
      }
    }
  }

  const g = graphEntry(key);
  const canonical = g?.canonical || entry?.canonicalName || input;
  const baseAliases = uniqueStrings([
    ...(entry?.aliases || []),
    ...(g?.aliases || []),
    ...(aliases || []),
  ]);
  const en = uniqueStrings([
    ...(entry?.aliases || []).filter((a) => /^[\x20-\x7E]+$/.test(a)),
    ...(g?.en || []),
  ]);
  const ins =
    g?.ins ||
    (entry?.codes?.ins ? `INS ${entry.codes.ins}` : null) ||
    null;
  const eNumber = g?.eNumber || null;

  const constituents = (g?.constituents || []).map((c) => ({
    name: c.name,
    en: uniqueStrings(c.en || []),
    ins: c.ins || null,
    relation: 'constituent',
  }));
  const analogs = (g?.analogs || []).map((a) => ({
    name: a.name,
    en: uniqueStrings(a.en || []),
    ins: a.ins || null,
    reason: a.reason || null,
    sharesGroupAdi: Boolean(a.sharesGroupAdi),
    relation: 'analog',
  }));

  const names = uniqueStrings([
    canonical,
    ...baseAliases,
    ...en,
  ]);
  const genericTerms = uniqueStrings(g?.genericTerms || []);
  const genericKeys = new Set(genericTerms.map(normalizeName));
  // 判断「资料在讲谁」时排除泛称：ribonucleotide / glutamate 这类词
  // 只能说明它在讲这一组，不能说明它在讲当前这个具体物质。
  const matchNames = names.filter((n) => !genericKeys.has(normalizeName(n)));

  return {
    input,
    canonical,
    displayName: canonical,
    graphKey: key || null,
    aliases: baseAliases,
    en,
    names,
    matchNames,
    genericTerms,
    ins,
    eNumber,
    mixture: Boolean(g?.mixture),
    constituents,
    analogs,
    group: g?.group || null,
    groupNames: uniqueStrings(g?.groupNames || []),
    groupEvaluation: g?.groupEvaluation || null,
    jointEvaluation: g?.jointEvaluation || null,
    highTerms: g?.highTerms || null,
    sensitiveTerms: g?.sensitiveTerms || null,
    metabolite: uniqueStrings(g?.metabolite || []),
    note: g?.note || null,
    hasGraph: Boolean(g),
    localEntryId: entry?.id || null,
  };
}

/** 这个身份是否足够具体，能用来构造查询 */
export function isIdentitySearchable(identity) {
  return Boolean(identity?.canonical || identity?.input);
}

/**
 * 用于检索的名称（按优先级）。
 * 混合物的组成物质排在后面：先查商品名/组名，再查组成物质。
 */
export function identitySearchNames(identity, { includeConstituents = true } = {}) {
  const out = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (!s || s.length < 2) return;
    if (!out.some((x) => normalizeName(x) === normalizeName(s))) out.push(s);
  };
  // 英文名优先：who.int / fao.org / inchem.org 的评估标题是英文
  for (const e of identity?.en || []) push(e);
  push(identity?.canonical);
  for (const a of identity?.aliases || []) push(a);
  if (includeConstituents) {
    for (const c of identity?.constituents || []) {
      for (const e of c.en || []) push(e);
      push(c.name);
    }
  }
  return out;
}

/**
 * 判断一段证据到底在讲谁。
 *
 * 关键顺序：先扣除「更长的不同形式名」，再匹配直接名。
 * 否则 "calcium disodium EDTA" 会被 "disodium EDTA" 命中，
 * 把钙二钠的资料错当成二钠的资料。
 *
 * @param {string} text 证据标题 + 正文
 * @param {object} identity resolveSubstanceIdentity 的返回值
 * @returns {{match:'direct'|'constituent'|'group'|'analog'|'none', terms:string[],
 *   joint:boolean, allowsDirectClaim:boolean, basis:string, basisLabel:string,
 *   analogs:Array, constituents:Array, groupShared:boolean}}
 */
export function matchEvidenceToIdentity(text, identity) {
  const raw = String(text || '');
  let scan = normalizeName(raw);
  const analogHits = [];
  const constituentHits = [];
  const directHits = [];
  const groupHits = [];

  // 1) 先扣掉更长的「不同化学形式」名称
  for (const a of identity?.analogs || []) {
    const terms = uniqueStrings([a.name, ...(a.en || [])], { min: 3 });
    const hit = terms.find((t) => scan.includes(normalizeName(t)));
    if (hit) {
      analogHits.push({ ...a, matched: hit });
      // 只从扫描串里移除该名称，保留其余上下文
      scan = scan.split(normalizeName(hit)).join(' ');
    }
  }

  // 2) 直接名（含中英文别名；泛称不参与）
  for (const n of identity?.matchNames || identity?.names || []) {
    const k = normalizeName(n);
    if (!k || k.length < 2) continue;
    if (scan.includes(k)) directHits.push(n);
  }

  // 3) 组成物质
  for (const c of identity?.constituents || []) {
    const terms = uniqueStrings([c.name, ...(c.en || [])], { min: 2 });
    const hit = terms.find((t) => scan.includes(normalizeName(t)));
    if (hit) constituentHits.push({ ...c, matched: hit });
  }

  // 4) 组名
  for (const gname of identity?.groupNames || []) {
    const k = normalizeName(gname);
    if (!k || k.length < 3) continue;
    if (scan.includes(k)) groupHits.push(gname);
  }

  // 联合评估：标题/正文同时出现两个组成物质，或明确写 mixture / combined / 50:50
  const constituentNames = constituentHits.map((c) => c.name);
  const jointByNames = constituentNames.length >= 2;
  const jointByWording =
    /(mixture|mixed|combined|combination|50\s*[:：]\s*50|50\s*%\s*(?:of\s*)?(?:each|disodium)|with\s+(?:disodium|the\s+other)|联合评估|混合物)/i.test(
      raw,
    );
  const joint = identity?.mixture ? jointByNames || jointByWording : false;

  // 混合物：如果标题/开头讲的是组成物质，而商品名只出现在参考文献里，
  // 不能标成「同一物质」——应按「组成物质联合评估」处理，保留限定。
  const opening = normalizeName(raw.slice(0, 320));
  const directInOpening = directHits.some((h) => opening.includes(normalizeName(h)));

  let match = 'none';
  if (directHits.length > 0) match = 'direct';
  else if (constituentHits.length > 0) match = 'constituent';
  else if (groupHits.length > 0) match = 'group';
  else if (analogHits.length > 0) match = 'analog';

  if (identity?.mixture && joint && !directInOpening && constituentHits.length > 0) {
    match = 'constituent';
  }

  // 组评估是否明确按组写：group ADI / group evaluation / these substances / 按组，
  // 或者正文本身就是一次评估（ADI / safety evaluation / not specified）——
  // 母体酸的 ADI 通常就是这么写的，允许作为组级参考，但 basis 仍标 group。
  const groupExplicit =
    /(group\s+adi|group\s+evaluation|group\s+of|these\s+substances|the\s+group|按组|组\s*ADI|整组)/i.test(raw) ||
    /(\bADIs?\b|acceptable daily intake|safety evaluation|not specified|not limited|risk assessment|每日允许摄入量)/i.test(raw);
  const groupShared = analogHits.some((a) => a.sharesGroupAdi) || match === 'group';

  const allowsDirectClaim =
    match === 'direct' ||
    (match === 'constituent' && joint) ||
    (match === 'group' && Boolean(identity?.group) && groupExplicit);

  return {
    match,
    terms: [
      ...directHits,
      ...constituentHits.map((c) => c.matched),
      ...groupHits,
      ...analogHits.map((a) => a.matched),
    ],
    joint,
    allowsDirectClaim,
    basis: match,
    basisLabel: BASIS_LABELS[match] || BASIS_LABELS.none,
    analogs: analogHits,
    constituents: constituentHits,
    groupShared,
    /** 组评估可以用于组级结论，但不能自动变成「这个具体盐也安全」 */
    groupOnly: match === 'group' || (match === 'analog' && groupShared),
  };
}

/**
 * 给最终提示词/诊断用的身份说明（纯文本，无健康结论）。
 */
export function describeIdentity(identity) {
  const lines = [];
  lines.push(`研究对象：${identity?.canonical || identity?.input || '未知'}`);
  if (identity?.ins || identity?.eNumber) {
    lines.push(`编号：${[identity.ins, identity.eNumber].filter(Boolean).join(' / ')}`);
  }
  if (identity?.en?.length) lines.push(`英文名：${identity.en.slice(0, 4).join('；')}`);
  if (identity?.mixture && identity?.constituents?.length) {
    lines.push(
      `混合物组成：${identity.constituents
        .map((c) => `${c.name}${c.ins ? `（${c.ins}）` : ''}`)
        .join(' + ')}`,
    );
    lines.push('注意：组成物质的联合评估可以用于解释该混合物，但必须写明是联合评估，并保留研究剂量与适用条件。');
  }
  if (identity?.group) {
    lines.push(`评估组：${identity.group}${identity.groupEvaluation ? `（${identity.groupEvaluation}）` : ''}`);
    lines.push('注意：组评估只能支持组级结论；不能把组内其他物质的危害或用途直接安到这个物质上。');
  }
  if (identity?.analogs?.length) {
    lines.push(
      `不同化学形式（不可直接套用）：${identity.analogs.map((a) => a.name).join('、')}`,
    );
  }
  if (identity?.note) lines.push(`身份说明：${identity.note}`);
  return lines.join('\n');
}

/** 测试/报告用：列出图谱覆盖的物质数 */
export function identityGraphSize() {
  return Object.keys(IDENTITY_GRAPH).length;
}
