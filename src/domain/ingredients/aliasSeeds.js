/**
 * 同物异名种子表（V2.3 验收修复，纯数据，不联网）。
 *
 * 为什么需要：Search 的查询词只有「配料表上写的中文名」时，
 * who.int / fao.org 上的 JECFA 评估文档根本不可能被匹配到 ——
 * 那些文档的标题和正文是英文（Acesulfame potassium / Acetic acid）。
 * 白名单里有国际机构，但查询词进不去，等于健康证据永远检索不到。
 *
 * 这张表只解决「同一个物质叫什么」，不携带任何健康结论、不限量值、不写 ADI。
 * 别名只用于检索与「这句话讲的是不是同一个物质」的匹配。
 *
 * 收录原则：
 * - 只收食品配料表里真实会出现的名称；
 * - 英文名必须是国际机构文档里使用的名称（JECFA / EFSA / Codex）；
 * - 名称有歧义时宁可少收，也不能把两个物质混成一个。
 */

/** @type {Record<string, {en: string[], ins?: string, note?: string}>} */
export const SUBSTANCE_ALIASES = {
  安赛蜜: { en: ['acesulfame potassium', 'acesulfame'], ins: 'INS 950' },
  乙酰磺胺酸钾: { en: ['acesulfame potassium', 'acesulfame'], ins: 'INS 950' },
  阿斯巴甜: { en: ['aspartame'], ins: 'INS 951' },
  天门冬酰苯丙氨酸甲酯: { en: ['aspartame'], ins: 'INS 951' },
  '天门冬酰苯丙氨酸甲酯乙酰磺胺酸': {
    en: ['aspartame-acesulfame salt', 'aspartame acesulfame'],
    ins: 'INS 962',
    note: '阿斯巴甜与安赛蜜的盐，是第三个物质，不能与两者中的任何一个混用结论',
  },
  三氯蔗糖: { en: ['sucralose'], ins: 'INS 955' },
  蔗糖素: { en: ['sucralose'], ins: 'INS 955' },
  糖精钠: { en: ['saccharin', 'sodium saccharin'], ins: 'INS 954' },
  甜蜜素: { en: ['cyclamic acid', 'sodium cyclamate'], ins: 'INS 952' },
  环己基氨基磺酸钠: { en: ['sodium cyclamate', 'cyclamic acid'], ins: 'INS 952' },
  纽甜: { en: ['neotame'], ins: 'INS 961' },
  甜菊糖苷: { en: ['steviol glycosides', 'stevia'], ins: 'INS 960' },
  赤藓糖醇: { en: ['erythritol'], ins: 'INS 968' },
  木糖醇: { en: ['xylitol'], ins: 'INS 967' },
  山梨糖醇: { en: ['sorbitol'], ins: 'INS 420' },
  麦芽糖醇: { en: ['maltitol'], ins: 'INS 965' },

  乙二胺四乙酸二钠: { en: ['disodium edta', 'disodium edetate', 'edta'], ins: 'INS 386' },
  EDTA二钠: { en: ['disodium edta', 'disodium edetate'], ins: 'INS 386' },
  乙二胺四乙酸二钠钙: { en: ['calcium disodium edta', 'calcium disodium edetate'], ins: 'INS 385' },

  冰乙酸: { en: ['acetic acid', 'glacial acetic acid'], ins: 'INS 260' },
  冰醋酸: { en: ['acetic acid', 'glacial acetic acid'], ins: 'INS 260' },
  乙酸: { en: ['acetic acid'], ins: 'INS 260' },
  柠檬酸: { en: ['citric acid'], ins: 'INS 330' },
  乳酸: { en: ['lactic acid'], ins: 'INS 270' },
  琥珀酸二钠: { en: ['disodium succinate', 'sodium succinate'], ins: 'INS 364(ii)' },
  丁二酸钠: { en: ['disodium succinate', 'sodium succinate'], ins: 'INS 364(ii)' },
  苹果酸: { en: ['malic acid'], ins: 'INS 296' },
  磷酸: { en: ['phosphoric acid'], ins: 'INS 338' },
  碳酸氢钠: { en: ['sodium bicarbonate', 'sodium hydrogen carbonate'], ins: 'INS 500(ii)' },
  柠檬酸钠: { en: ['sodium citrate'], ins: 'INS 331' },

  谷氨酸钠: {
    en: ['monosodium glutamate', 'glutamic acid', 'glutamate'],
    ins: 'INS 621',
    note: 'EFSA / JECFA 的评估常用 glutamates（复数、按组）表述，检索与来源匹配时按组处理',
  },
  味精: { en: ['monosodium glutamate'], ins: 'INS 621' },
  '5′-呈味核苷酸二钠': {
    en: ['ribonucleotide', 'disodium 5-ribonucleotides', 'sodium ribonucleotides'],
    ins: 'INS 635',
  },
  '5\'-呈味核苷酸二钠': { en: ['ribonucleotide', 'disodium 5-ribonucleotides'], ins: 'INS 635' },
  呈味核苷酸二钠: { en: ['ribonucleotide', 'disodium 5-ribonucleotides'], ins: 'INS 635' },
  肌苷酸二钠: { en: ['disodium inosinate', 'inosinate'], ins: 'INS 631' },
  鸟苷酸二钠: { en: ['disodium guanylate', 'guanylate'], ins: 'INS 627' },

  山梨酸钾: { en: ['potassium sorbate', 'sorbic acid'], ins: 'INS 202' },
  山梨酸: { en: ['sorbic acid'], ins: 'INS 200' },
  苯甲酸钠: { en: ['sodium benzoate', 'benzoic acid'], ins: 'INS 211' },
  苯甲酸: { en: ['benzoic acid'], ins: 'INS 210' },
  丙酸钙: { en: ['calcium propionate'], ins: 'INS 282' },
  亚硝酸钠: { en: ['sodium nitrite', 'nitrite'], ins: 'INS 250' },
  硝酸钠: { en: ['sodium nitrate'], ins: 'INS 251' },
  脱氢乙酸钠: { en: ['sodium dehydroacetate'], ins: 'INS 266' },
  乳酸链球菌素: { en: ['nisin'], ins: 'INS 234' },

  二氧化硫: { en: ['sulfur dioxide', 'sulphur dioxide'], ins: 'INS 220' },
  焦亚硫酸钠: {
    en: ['metabisulfite', 'sodium metabisulphite', 'sodium metabisulfite', 'sulfite'],
    ins: 'INS 223',
    note: '亚硫酸盐是一组共享「以二氧化硫计」组 ADI 的物质，检索与来源匹配时按组处理',
  },
  亚硫酸钠: { en: ['sodium sulphite', 'sodium sulfite'], ins: 'INS 221' },

  黄原胶: { en: ['xanthan gum'], ins: 'INS 415' },
  卡拉胶: { en: ['carrageenan'], ins: 'INS 407' },
  瓜尔胶: { en: ['guar gum'], ins: 'INS 412' },
  海藻酸钠: { en: ['sodium alginate'], ins: 'INS 401' },
  羧甲基纤维素钠: { en: ['sodium carboxymethyl cellulose'], ins: 'INS 466' },
  单硬脂酸甘油酯: { en: ['monoglycerides', 'glycerol monostearate'], ins: 'INS 471' },
  蔗糖脂肪酸酯: { en: ['sucrose esters of fatty acids'], ins: 'INS 473' },
  聚山梨酸酯80: { en: ['polysorbate 80'], ins: 'INS 433' },

  柠檬黄: { en: ['tartrazine'], ins: 'INS 102' },
  日落黄: { en: ['sunset yellow'], ins: 'INS 110' },
  胭脂红: { en: ['ponceau 4R'], ins: 'INS 124' },
  亮蓝: { en: ['brilliant blue'], ins: 'INS 133' },
  焦糖色: { en: ['caramel colour', 'caramel color'], ins: 'INS 150' },
  二氧化钛: { en: ['titanium dioxide'], ins: 'INS 171' },
  红曲红: { en: ['monascus red'], ins: 'INS 153' },

  抗坏血酸: { en: ['ascorbic acid'], ins: 'INS 300' },
  维生素C: { en: ['ascorbic acid', 'vitamin c'], ins: 'INS 300' },
  生育酚: { en: ['tocopherol'], ins: 'INS 307' },
  维生素E: { en: ['tocopherol', 'vitamin e'], ins: 'INS 307' },
  '特丁基对苯二酚': { en: ['tertiary butylhydroquinone', 'tbhq'], ins: 'INS 319' },
  丁基羟基茴香醚: { en: ['butylated hydroxyanisole', 'bha'], ins: 'INS 320' },
  二丁基羟基甲苯: { en: ['butylated hydroxytoluene', 'bht'], ins: 'INS 321' },

  碳酸钙: { en: ['calcium carbonate'], ins: 'INS 170' },
  氯化钾: { en: ['potassium chloride'], ins: 'INS 508' },
  硫酸钙: { en: ['calcium sulphate', 'calcium sulfate'], ins: 'INS 516' },
  氯化钙: { en: ['calcium chloride'], ins: 'INS 509' },
  磷酸氢二钠: { en: ['disodium phosphate'], ins: 'INS 339(ii)' },
  三聚磷酸钠: { en: ['sodium tripolyphosphate'], ins: 'INS 451' },

  果胶: { en: ['pectin'], ins: 'INS 440' },
  明胶: { en: ['gelatin'], ins: 'INS 428' },
  阿拉伯胶: { en: ['acacia gum', 'arabic gum'], ins: 'INS 414' },
  魔芋粉: { en: ['konjac flour', 'konjac glucomannan'] },
  菊粉: { en: ['inulin'] },

  食用香精: { en: ['flavouring', 'food flavouring'] },
  食用香精香料: { en: ['flavouring', 'food flavouring'] },
  食品用香精: { en: ['flavouring', 'food flavouring'] },
};

const NORMALIZE_RE = /[\s'"′’·]/g;

function norm(name) {
  return String(name || '').replace(NORMALIZE_RE, '');
}

const INDEX = new Map(Object.entries(SUBSTANCE_ALIASES).map(([k, v]) => [norm(k), v]));

/**
 * 取某个成分的检索用别名（英文名优先，按长度从短到长）。
 * 只返回名称字符串，不返回任何结论。
 *
 * @param {string} name 配料名
 * @returns {string[]}
 */
export function seededAliases(name) {
  const hit = INDEX.get(norm(name));
  if (!hit) return [];
  // 不排序：表里的顺序就是优先级（短名不一定更准，例如 edta 太泛，
  // 而 disodium edta 才是 JECFA 文档里的写法）。
  return [...hit.en];
}

/** INS 编号（仅用于展示与诊断，不参与查询构造） */
export function seededIns(name) {
  return INDEX.get(norm(name))?.ins || null;
}

/** 合并并去重：显式传入的别名在前，种子别名补充在后 */
export function mergeAliases(name, aliases = []) {
  const out = [];
  const seen = new Set();
  for (const a of [...(aliases || []), ...seededAliases(name)]) {
    const s = String(a || '').trim();
    if (!s || s.length < 2) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 6);
}
