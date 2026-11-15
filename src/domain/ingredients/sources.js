/**
 * 成分知识库的来源片段（K1–K7）。
 *
 * 规则与第三阶段一致，且更严格：
 * 1. quoteType 为 'verbatim' 的内容必须逐字来自原文，一个字都不能改。
 * 2. WHO 英文原文标 'verbatim'，中文翻译标 'translation'，不能混为一谈。
 * 3. 只用机构自己的话，不用二手解读。第三方转载一律不作为来源。
 * 4. 拿不到原文就不收录 —— 宁可条目少，不能编。
 *
 * 核实时间：2026-10-31
 */

export const SOURCE_TYPES = {
  standard: '国家标准',
  authority: '权威机构资料',
  database: '官方数据库条目',
};

export const INGREDIENT_SOURCES = {
  // ---------------------------------------------------------------- GB 2760-2024
  K1: {
    id: 'K1',
    label: 'GB 2760-2024 使用原则',
    title: '《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    type: 'standard',
    code: 'GB 2760-2024',
    effectiveAt: '2025-02-08',
    clause: '第 1.1 条 食品添加剂使用时应符合的基本要求',
    quoteType: 'verbatim',
    quote:
      'a) 不应对人体产生任何健康危害；b) 不应掩盖食品腐败变质；c) 不应掩盖食品本身或加工过程中的质量缺陷或以掺杂、掺假、伪造为目的而使用食品添加剂；d) 不应降低食品本身的营养价值；e) 在达到预期效果的前提下尽可能降低在食品中的使用量。',
    plain: '标准对添加剂使用提出了五条基本要求，第一条就是不得对健康产生危害，最后一条要求"尽可能少用"。',
    supports: ['添加剂的使用是有前置约束的，不是想加就加', '标准本身要求"尽可能降低使用量"'],
    url: 'https://gb2760.cfsa.net.cn/index.php',
    verifiedAt: '2026-10-31',
  },

  K2: {
    id: 'K2',
    label: 'GB 2760-2024 功能类别定义',
    title: '《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    type: 'standard',
    code: 'GB 2760-2024',
    effectiveAt: '2025-02-08',
    clause: '附录 D 食品添加剂功能类别（D.1–D.23）',
    quoteType: 'verbatim',
    quote:
      'D.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。',
    plain: '中国标准把食品添加剂按功能分成 23 类，每类都有明确定义。类别描述的是"它干什么"，不是"它有多危险"。',
    supports: ['功能类别是中性描述，与安全性无关', '同一物质可能同时属于多个功能类别'],
    url: 'https://gb2760.cfsa.net.cn/func.html',
    verifiedAt: '2026-10-31',
  },

  K3: {
    id: 'K3',
    label: 'GB 2760-2024 使用规定',
    title: '《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    type: 'standard',
    code: 'GB 2760-2024',
    effectiveAt: '2025-02-08',
    clause: '第 2.1 条、第 1.4 条（带入原则）',
    quoteType: 'verbatim',
    quote:
      '2.1 表 A.1 规定了食品添加剂的允许使用品种、使用范围以及最大使用量或残留量。1.4.1 在下列情况下食品添加剂可以通过食品配料（含食品添加剂）带入食品中：a) 根据本标准，食品配料中允许使用该食品添加剂；b) 食品配料中该添加剂的用量不应超过允许的最大使用量……',
    plain: '每种添加剂能用在哪类食品、最多用多少，是逐项列在表 A.1 里的，不是统一一个数。另外还有"带入原则"——配料里带进来的也算。',
    supports: ['使用范围和限量与食品类别绑定', '配料表上的某种添加剂可能是从配料带进来的'],
    url: 'https://gb2760.cfsa.net.cn/index.php',
    verifiedAt: '2026-10-31',
  },

  // ---------------------------------------------------------------- CFSA 官方问答
  K4: {
    id: 'K4',
    label: 'CFSA 官方问答：最大使用量 ≠ 实际含量',
    title: '《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）常见问题解答',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'authority',
    code: 'CFSA 问答（2024-10-18）',
    clause: '第 1 问',
    quoteType: 'verbatim',
    quote:
      '本标准规定的是食品添加剂在食品中的最大使用量，由于本底、带入原则等情况的存在，最大使用量并不必然等同于该物质在最终食品中的含量。本标准中某种食品添加剂的使用范围中没有某个食品类别，仅表明在该食品生产加工过程中不允许使用该食品添加剂，并不表明在该食品中不得检出该物质。',
    plain:
      '标准写的是"最多能用多少"，不是"实际有多少"。所以只看配料表，既推不出用了多少，也推不出这个产品一定合规或不合规。',
    supports: [
      '不能仅凭配料表推算实际添加剂摄入量',
      '不能仅凭配料表判定某款产品是否合规',
      '检出了某种添加剂，也不必然等于违规使用',
    ],
    url: 'https://www.cfsa.net.cn:8899/site2/spaqbz/cjwtjd/spaqgjbzcjwtjd/sptjjbz/sptjjbz/2024/14332.shtml',
    verifiedAt: '2026-10-31',
  },

  // ---------------------------------------------------------------- WHO
  K5: {
    id: 'K5',
    label: 'WHO：食品添加剂的事实清单',
    title: 'Food additives — Fact sheet',
    issuer: 'World Health Organization（世界卫生组织）',
    type: 'authority',
    code: 'WHO Fact sheet',
    publishedAt: '2023-11-16',
    clause: 'Key facts / Safety assessments',
    quoteType: 'verbatim',
    quote:
      'Food additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.',
    quoteLang: 'en',
    translation:
      '食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。',
    plain: '添加剂不是"先用了再说"，而是先评估再批准。ADI 是一个"终生每天吃也不会产生可觉察风险"的估计量。',
    supports: [
      '添加剂在上市前需要经过安全性评估',
      'ADI 是风险评估工具，不是一个"安全线"',
    ],
    url: 'https://www.who.int/news-room/fact-sheets/detail/food-additives',
    verifiedAt: '2026-10-31',
  },

  K6: {
    id: 'K6',
    label: 'WHO：关于非糖甜味剂的建议',
    title: 'WHO advises not to use non-sugar sweeteners for weight control',
    issuer: 'World Health Organization（世界卫生组织）',
    type: 'authority',
    code: 'WHO News release',
    publishedAt: '2023-05-15',
    clause: 'Guideline recommendation',
    quoteType: 'verbatim',
    quote:
      'WHO has issued a recommendation against the use of non-sugar sweeteners in general, based on evidence that they don’t seem to benefit long term weight loss or maintenance and may increase risk of noncommunicable diseases.',
    quoteLang: 'en',
    translation:
      'WHO 发布建议，不推荐使用非糖甜味剂来控制体重，依据是现有证据显示它们对长期减重或体重维持似乎没有帮助，并且可能与非传染性疾病风险升高有关。',
    plain:
      '注意这条建议的适用范围：说的是"用非糖甜味剂来控制体重"这件事，不是说"含有非糖甜味剂的食品有毒"。这是两回事。',
    supports: [
      '非糖甜味剂在体重管理上的证据不支持"喝了就能瘦"',
      '该建议针对体重控制目的，不等于食品安全性结论',
    ],
    url: 'https://www.who.int/news-room/fact-sheets/detail/food-additives',
    verifiedAt: '2026-10-31',
  },

  // ---------------------------------------------------------------- 官方数据库条目
  K7: {
    id: 'K7',
    label: 'CFSA 数据库：山梨酸及其钾盐',
    title: 'GB 2760-2024 食品添加剂使用标准查询系统 — 山梨酸及其钾盐',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'database',
    code: 'CNS 17.003, 17.004 / INS 200, 202',
    clause: '品种条目',
    quoteType: 'verbatim',
    quote: '中文名称：山梨酸及其钾盐（包括山梨酸，山梨酸钾）；功能：防腐剂、抗氧化剂；CNS：17.003, 17.004；INS：200, 202',
    plain: '在官方数据库里，山梨酸及其钾盐登记的功能是"防腐剂、抗氧化剂"两个，不是一个。',
    supports: ['山梨酸钾的功能类别', '同一物质可以同时具备多个功能'],
    url: 'https://gb2760.cfsa.net.cn/addtives/faid/201.html',
    verifiedAt: '2026-10-31',
  },

  K8: {
    id: 'K8',
    label: 'CFSA 数据库：三氯蔗糖甜味剂条目',
    title: 'GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'database',
    code: 'CNS 19.016',
    clause: '品种条目',
    quoteType: 'verbatim',
    quote: '三氯蔗糖（又名蔗糖素）　功能：甜味剂',
    plain: '标准里的正式名称是"三氯蔗糖"，括号里注明"又名蔗糖素"。它是一种甜味剂，不是蔗糖。',
    supports: ['三氯蔗糖的功能类别是甜味剂', '它的别名是"蔗糖素"，与蔗糖是两种不同物质'],
    url: 'https://gb2760.cfsa.net.cn/category/limit/329.html',
    verifiedAt: '2026-10-31',
  },

  K9: {
    id: 'K9',
    label: 'CFSA：三氯蔗糖 ADI 15 mg/kg bw',
    title: '拟征求意见的食品添加剂名单（含 JECFA 评估结论摘录）',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'authority',
    code: 'CFSA 公开文件',
    publishedAt: '2020-06',
    clause: '第六条 三氯蔗糖',
    quoteType: 'verbatim',
    quote: '根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量为 15 mg/kg bw。',
    plain: '三氯蔗糖的 ADI 是每公斤体重每天 15 毫克，这个数值来自 JECFA 的评估。',
    supports: ['三氯蔗糖有明确的 ADI 数值', 'ADI 由国际专家委员会评估得出'],
    conditions: ['该数值引自 CFSA 公开的征求意见文件，属于对 JECFA 结论的转述'],
    url: 'https://cfsa.net.cn:8899/site2/UpLoadFiles/news/upload/2020/2020-06/903fc4b4-5836-475c-ad1f-67542f3b2400.pdf',
    verifiedAt: '2026-10-31',
  },
  // ---------------------------------------------------------------- V5.2 补录（基础配料覆盖）
  K10: {
    id: 'K10',
    label: 'GB 2760-2024 附录 B：食品用香料、香精的使用原则',
    title: '《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 B',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    type: 'standard',
    code: 'GB 2760-2024',
    effectiveAt: '2025-02-08',
    clause: '附录 B 第 B.1.1、B.1.2 条',
    quoteType: 'verbatim',
    quote:
      'B.1.1 在食品中使用食品用香料、香精的目的是使食品产生、改变或提高食品的风味。食品用香料一般配制成食品用香精后用于食品加香，部分也可直接用于食品加香。食品用香料、香精不包括只产生甜味、酸味或咸味的物质，也不包括增味剂。B.1.2 食品用香料、香精在各类食品中按生产需要适量使用，表 B.1 中所列食品没有加香的必要，不得添加食品用香料、香精。',
    plain:
      '香料香精的目的是「加香」——产生、改变或提高风味。它们在各类食品里按生产需要适量使用，但标准也明确：没有加香必要的食品不得添加。',
    supports: [
      '食品用香料、香精的功能是提供或改变风味',
      '食品用香料属于「按生产需要适量使用」的类别',
      '并非所有食品都可以加香，没有加香必要的不允许添加',
    ],
    url: 'https://gb2760.cfsa.net.cn/index.php',
    verifiedAt: '2026-11-01',
  },

  K11: {
    id: 'K11',
    label: 'CFSA：二氧化碳的功能与 JECFA 评估',
    title: '拟征求意见的食品添加剂名单 — 二氧化碳（GB 2760-2024 相关条目）',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'authority',
    code: 'CFSA 公开征求意见文件',
    publishedAt: '2021-08',
    clause: '第六条 二氧化碳',
    quoteType: 'verbatim',
    quote:
      '二氧化碳作为防腐剂已列入《食品安全国家标准 食品添加剂使用标准》（GB 2760），允许用于饮料类、配制酒等食品类别……该物质作为口感调节剂用于风味发酵乳，调节口感。根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量不需要限定。',
    plain:
      '二氧化碳在标准里登记的功能是「防腐剂」，实际在饮料里主要起两个作用：产生气泡口感，以及排挤氧气抑制需氧微生物。JECFA 的结论是它的每日允许摄入量不需要限定。',
    supports: [
      '二氧化碳是 GB 2760 登记的食品添加剂',
      '它的功能包括防腐剂，同时在饮料中用于产生气泡口感',
      'JECFA 评估认为其每日允许摄入量不需要限定',
    ],
    conditions: ['「每日允许摄入量不需要限定」是 JECFA 的安全性评估结论，不等于可以脱离工艺需要无限量使用'],
    url: 'https://cfsa.net.cn:8899/site2/UpLoadFiles/news/upload/2021/2021-08/4f8e0f64-0339-43c1-a7ea-0d81054e0e3e.pdf',
    verifiedAt: '2026-11-01',
  },

  K12: {
    id: 'K12',
    label: 'CFSA 数据库：柠檬酸钠',
    title: 'GB 2760-2024 食品添加剂使用标准查询系统 — 柠檬酸钠',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'database',
    code: 'CNS 01.303 / INS 331(iii)',
    clause: '品种条目',
    quoteType: 'verbatim',
    quote: '柠檬酸钠　功能：酸度调节剂、稳定剂　CNS：01.303　INS：331(iii)　按生产需要适量使用',
    plain: '柠檬酸钠在标准里登记了两个功能：酸度调节剂和稳定剂，属于按生产需要适量使用的品种。',
    supports: ['柠檬酸钠的功能类别', '它属于按生产需要适量使用的品种，没有统一的数值上限'],
    url: 'https://gb2760.cfsa.net.cn/index.php',
    verifiedAt: '2026-11-01',
  },
  // ---------------------------------------------------------------- V5.2 科学性修复
  K13: {
    id: 'K13',
    label: 'JECFA：ADI 各术语的官方定义',
    title: 'Toxicological Evaluation of Certain Food Additives — WHO Food Additives Series 10, Introduction',
    issuer: 'Joint FAO/WHO Expert Committee on Food Additives（JECFA）',
    type: 'authority',
    code: 'WHO Food Additives Series 10（第 20 次会议，1976）',
    publishedAt: '1976',
    clause: 'ALLOCATION OF ACCEPTABLE DAILY INTAKES (ADI)',
    quoteType: 'verbatim',
    quote:
      'An ADI without an explicit indication of the upper limit of intake ("ADI not specified") may be assigned to substances of very low toxicity, especially those that are food constituents or that may be considered as foods or normal metabolites in man. The expression "ADI not specified" has been adopted by the Joint FAO/WHO Expert Committee on Food Additives at its Eighteenth session as a more suitable expression than "ADI not limited" previously used. However, an additive having an "ADI not specified" must meet the criteria of good manufacturing practice — for example it should have proven technological efficacy and be used at the minimum level of efficacy, it should not conceal inferior food quality or adulteration, and it should not create a nutritional imbalance. The expression "No ADI allocated" is applicable to substances for which the available information is not sufficient to establish their safety or when the specifications are not adequate to establish their identity.',
    quoteLang: 'en',
    translation:
      '对于毒性极低的物质（尤其是本身是食品成分、可视为食品或在人体内属正常代谢物的物质），可以给出一个不标明摄入量上限的 ADI，即「ADI not specified」。JECFA 自第 18 次会议起采用「ADI not specified」这一表述，因为它比此前使用的「ADI not limited」更合适。**但标注「ADI not specified」的添加剂仍必须符合良好生产规范（GMP）的要求**——例如应证明工艺有效性、按最低有效量使用、不得掩盖食品劣质或掺假、不得造成营养失衡。「No ADI allocated」则适用于现有资料不足以确定其安全性、或规格不足以确定其身份的物质。',
    plain:
      '这是「ADI not specified」最权威的解释之一。两个关键点：① 它替代的正是「不限定摄入量」这个说法，说明两者不是一回事；② 即便标了这一项，仍必须符合 GMP、按最低有效量使用。另外「No ADI allocated」是完全不同的意思——资料不足，不是毒性低。',
    supports: [
      'ADI not specified 不等于「不限定摄入量」',
      'ADI not specified 的物质仍须符合良好生产规范',
      'ADI not allocated 与 ADI not specified 含义完全不同',
    ],
    url: 'https://www.inchem.org/documents/jecfa/jecmono/v10je01.htm',
    verifiedAt: '2026-11-01',
  },

  K14: {
    id: 'K14',
    label: 'CFSA 数据库：碳酸氢钠',
    title: 'GB 2760-2024 食品添加剂使用标准查询系统 — 碳酸氢钠',
    issuer: '国家食品安全风险评估中心（CFSA）',
    type: 'database',
    code: 'CNS 06.001 / INS 500(ii)',
    clause: '品种条目',
    quoteType: 'verbatim',
    quote:
      '中文名称 碳酸氢钠　英文名称 sodium hydrogen carbonate　CNS 06.001　INS 500(ii)　功能 膨松剂、酸度调节剂、稳定剂。07.03 饼干 按生产需要适量使用。',
    plain:
      '官方数据库里，碳酸氢钠登记的功能只有三个：膨松剂、酸度调节剂、稳定剂。没有「抗结剂」。它在饼干类里按生产需要适量使用。',
    supports: [
      '碳酸氢钠的功能是膨松剂、酸度调节剂、稳定剂',
      '碳酸氢钠在饼干中可按生产需要适量使用',
      '「抗结剂」不在碳酸氢钠的官方功能列表中',
    ],
    url: 'https://gb2760.cfsa.net.cn/index.php/addtives/faid/218.html',
    verifiedAt: '2026-11-01',
  },

  K15: {
    id: 'K15',
    label: 'JECFA 数据库：二氧化碳',
    title: 'JECFA Food Additives Database — Carbon dioxide（INS 290）',
    issuer: 'Joint FAO/WHO Expert Committee on Food Additives（JECFA）',
    type: 'database',
    code: 'CAS 124-38-9 / INS 290',
    clause: 'Evaluations（1985）',
    quoteType: 'verbatim',
    quote:
      'CARBON DIOXIDE. CAS number 124-38-9. INS 290. Functional Class: EXTRACTION_SOLVENT, FOOD_ADDITIVE, FREEZING_AGENT, PRESERVATIVE, PROPELLANT. Evaluation year: 1985. ADI: NOT SPECIFIED.',
    plain:
      'JECFA 数据库里，二氧化碳的评价结论是「ADI NOT SPECIFIED」——不是给了一个数值，也不是说没有限制。它的功能分类包括防腐剂、推进剂、冷冻剂、萃取溶剂。',
    supports: [
      '二氧化碳的 JECFA 评价结论是 ADI NOT SPECIFIED',
      '该结论不等于「任何摄入量都不受限制」',
    ],
    url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/592',
    verifiedAt: '2026-11-01',
  },
};

export function getSource(id) {
  return INGREDIENT_SOURCES[id] || null;
}

export function resolveSources(ids = []) {
  return ids.map(getSource).filter(Boolean);
}
