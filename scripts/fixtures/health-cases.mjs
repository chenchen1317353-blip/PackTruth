/**
 * 12 种食品添加剂的健康科普验收集（官方资料回放，不联网、不调用付费 API）。
 *
 * 每条证据都逐字取自下列官方页面（抓取日期 2026-11-03），
 * 关键句可在对应 URL 上复核：
 *
 *  WHO JECFA 评估数据库（apps.who.int/food-additives-contaminants-jecfa-database）
 *   - 谷氨酸钠（INS 621）        /Home/Chemical/2267   1987  ADI NOT SPECIFIED
 *   - 5′-呈味核苷酸二钠（INS 635）/chemical.aspx?chemID=4140  1974  ADI NOT SPECIFIED
 *   - 柠檬酸（INS 330）          /Home/Chemical/3594   1973  group ADI NOT LIMITED
 *   - 冰乙酸（INS 260）          /Home/Chemical/1461   2004 / 1973 group NOT LIMITED
 *   - 乳酸（INS 270）            /chemical.aspx?chemID=3367  2001 / 1973 NOT LIMITED
 *   - 二氧化硫/亚硫酸盐（INS 220） /Home/Chemical/985   1998  group ADI 0-0.7 mg/kg bw
 *   - 乙二胺四乙酸二钠（INS 386） /Home/Chemical/385    1973  0-2.5 mg/kg bw as calcium disodium EDTA
 *   - 安赛蜜（INS 950）          /chemical.aspx?chemID=926   1990  0-15 mg/kg bw
 *   - 三氯蔗糖（INS 955）        /Home/Chemical/2340    1990  0-15 mg/kg bw
 *   - 山梨酸钾（INS 202）        /Home/Chemical/2724    1973  group ADI 0-25 mg/kg bw
 *   - 阿斯巴甜（INS 951）        /Home/Chemical/62      2023  reaffirmed 0-40 mg/kg bw
 *
 *  FAO/WHO 术语表（fao.org/docrep/012/i1357e/i1357e02.pdf）：ADI / not limited / not specified
 *  EFSA 阿斯巴甜专题（efsa.europa.eu/en/topics/topic/aspartame）：PKU 人群说明
 *  EFSA 饲料添加剂意见（efsa.europa.eu/en/efsajournal/pub/4472）：EDTA 与钙二钠 EDTA 的折算
 *  FDA 亚硫酸盐召回公告（fda.gov）：部分哮喘患者 / 亚硫酸盐敏感人群
 *
 * 模型输出（healthInsights / brief / sections）是模拟的，但每一条 healthInsights
 * 都经过真实的 validateHealthInsights：quote 必须能在 excerpt 里逐字找到，
 * 数字必须出现在来源里，人群必须被来源点名。
 */

import { ACETIC_ACID, ACESULFAME_K, STANDARD_ONLY } from './v23-health.mjs';

const GLOSSARY = {
  id: 'W2',
  title: 'FAO/WHO 联合文件 · 术语表（ANNEX 4: GLOSSARY）',
  organization: '联合国粮食及农业组织（FAO）',
  sourceType: 'fetch_content',
  url: 'https://www.fao.org/docrep/012/i1357e/i1357e02.pdf',
  excerpt:
    'Acceptable daily intake (ADI): An estimate of the amount of a substance in food or drinking-water, expressed on a body weight basis (usually milligrams per kilogram body weight), that can be ingested daily over a lifetime by humans without appreciable health risks. Acceptable daily intake "not limited": A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives, which has the same meaning as acceptable daily intake "not specified". Acceptable daily intake "not specified": A term applicable to a food substance of very low toxicity that, on the basis of the available chemical, biochemical and toxicological data as well as the total dietary intake of the substance, does not, in the opinion of the Joint FAO/WHO Expert Committee on Food Additives, represent a hazard to health. For that reason, the establishment of an acceptable daily intake expressed in numerical form is not deemed necessary.',
  excerptType: 'fetched_excerpt',
  publishedAt: null,
  tier: 'web_body',
};

const NOT_SPECIFIED_QUOTE =
  'A term applicable to a food substance of very low toxicity that, on the basis of the available chemical, biochemical and toxicological data as well as the total dietary intake of the substance, does not, in the opinion of the Joint FAO/WHO Expert Committee on Food Additives, represent a hazard to health';

const NOT_LIMITED_QUOTE =
  'A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives, which has the same meaning as acceptable daily intake "not specified"';

/** 简化的“身份 + 用途”简明版，只用于回放；健康部分另行校验 */
const briefOf = (what, why, how, ref) => ({ what, why, howToUnderstand: how, sourceRefs: [ref] });
const sectionOf = (section, text, ref) => ({ id: `${section}-1`, section, text, sourceRefs: [ref], limitations: null });

const MSG = {
  key: 'msg',
  name: '谷氨酸钠',
  aliases: ['glutamic acid', 'glutamate'],
  ins: 'INS 621',
  identity: { type: 'additive', label: '食品添加剂 · 增味剂', note: '谷氨酸钠（MSG）' },
  sources: [
    {
      id: 'W1',
      title: 'SODIUM GLUTAMATE（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/2267',
      excerpt:
        'SODIUM GLUTAMATE. Synonyms SODIUM GLUTAMATE; MSG. INS 621. Functional Class Food Additives FLAVOUR_ENHANCER. Evaluations. Evaluation year: 1987. ADI: NOT SPECIFIED. Comments: Group ADI for L-glutamic acid and its ammonium, calcium, monosodium, magnesium and potassium salts. Report: TRS 759-JECFA 31/29.',
      excerptType: 'fetched_excerpt',
      publishedAt: '1987',
      tier: 'web_body',
    },
    GLOSSARY,
    {
      id: 'W3',
      title: 'EFSA reviews safety of glutamates added to food（2017 年再评估新闻稿）',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/en/press/news/170712',
      excerpt:
        'EFSA re-assessed the safety of glutamates used as food additives and derived a group acceptable daily intake (ADI) of 30 mg/kg body weight per day for all six of these additives. This safe level of intake is based on the highest dose at which scientists observed no adverse effects on test animals in toxicity studies. In a refined exposure assessment, EFSA estimated that exposure to glutamates added to food may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives, as well as for toddlers and children with medium exposure. Exposure may also exceed doses associated with some adverse effects in humans (e.g. headache) for highly exposed infants, children and adolescents. The Panel noted doses that have been associated with certain effects in humans, such as headache, raised blood pressure and increased insulin levels.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2017-07-12',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '谷氨酸钠就是味精的主要成分，学名 L-谷氨酸一钠，国际编号 INS 621。',
      '它提供鲜味，常和食盐一起用来提味，也能减少一部分用盐量。',
      '它是谷氨酸的钠盐，而谷氨酸本身就是食物蛋白里常见的氨基酸。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把谷氨酸钠列在增味剂类别下，INS 621，和谷氨酸的其他盐类作为一组评估。', 'W1'),
      sectionOf('limits', '配料表不标注实际添加量，无法据此推算这款食品里有多少谷氨酸钠。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'EFSA 的再评估认为，饮食中这类添加剂较多的人，谷氨酸盐摄入量可能超过 30 mg/kg 体重的组 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote:
          'exposure to glutamates added to food may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives',
        conditions: '针对高消费人群；不是指偶尔吃一次就会超过',
        sourceYear: '2017',
      },
      normalIntake: {
        text: 'EFSA 的评估结论是：部分高消费人群以及中等暴露的幼儿、儿童，谷氨酸盐摄入量可能超过 30 mg/kg 体重的组 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote:
          'may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives, as well as for toddlers and children with medium exposure',
        conditions: '欧盟膳食暴露评估；组 ADI 以谷氨酸计',
        sourceYear: '2017',
      },
      highIntake: {
        text: 'EFSA 指出，高暴露的婴幼儿、儿童和青少年，摄入量可能超过与头痛等不良反应相关的剂量。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote:
          'Exposure may also exceed doses associated with some adverse effects in humans (e.g. headache) for highly exposed infants, children and adolescents',
        conditions: '人体不良反应包括头痛、血压升高和胰岛素水平升高；针对高暴露人群',
        sourceYear: '2017',
      },
      sensitiveGroups: {
        text: '饮食中谷氨酸盐较多的人，以及中等暴露的幼儿和儿童，摄入量可能超过 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'as well as for toddlers and children with medium exposure',
        conditions: '幼儿与儿童（中等及以上暴露）',
        sourceYear: '2017',
      },
    },
  },
};

const RIBONUCLEOTIDE = {
  key: 'ribonucleotide',
  name: '5′-呈味核苷酸二钠',
  aliases: ['ribonucleotide'],
  ins: 'INS 635',
  identity: { type: 'additive', label: '食品添加剂 · 增味剂', note: '5′-呈味核苷酸二钠（I+G）' },
  sources: [
    {
      id: 'W1',
      title: "DISODIUM 5'-RIBONUCLEOTIDES（JECFA 评估数据库）",
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/chemical.aspx?chemID=4140',
      excerpt:
        "DISODIUM 5'-RIBONUCLEOTIDES. Chemical Names MIXTURE OF DISODIUM INOSINE-5'-MONOPHOSPHATE AND DISODIUM GUANOSINE-5'-MONOPHOSPHATE. INS 635. Functional Class Food Additives FLAVOUR_ENHANCER. Evaluations. Evaluation year: 1974. ADI: NOT SPECIFIED. Report: NMRS 54/TRS 557-JECFA 18/14.",
      excerptType: 'fetched_excerpt',
      publishedAt: '1974',
      tier: 'web_body',
    },
    GLOSSARY,
  ],
  model: {
    brief: briefOf(
      '5′-呈味核苷酸二钠是肌苷酸二钠和鸟苷酸二钠的混合物，国际编号 INS 635。',
      '它本身鲜味不强，但和谷氨酸钠一起用会把鲜味放大，所以常成对出现。',
      '它是两种核苷酸钠盐的混合物，不是单一物质。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 记录的化学名称是肌苷酸二钠与鸟苷酸二钠的混合物，功能类别为增味剂。', 'W1'),
      sectionOf('limits', '配料表只写名称，不标注实际添加量。', 'W1'),
    ],
    healthInsights: {
      normalIntake: {
        text: 'JECFA 在 1974 年评估 5′-呈味核苷酸二钠，把组 ADI 定为「无需规定」。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: NOT SPECIFIED',
        conditions: '针对 5′-呈味核苷酸二钠；不等于可以无限量使用',
        sourceYear: '1974',
      },
      highIntake: {
        text: '「无需规定」是不需要设定数值型 ADI 的意思，不是「没有使用边界」。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1', 'W2'],
        quote: NOT_SPECIFIED_QUOTE,
        conditions: '术语解释；使用仍须符合使用范围',
        sourceYear: null,
      },
    },
  },
};

const CITRIC = {
  key: 'citric',
  name: '柠檬酸',
  aliases: ['citric acid'],
  ins: 'INS 330',
  identity: { type: 'additive', label: '食品添加剂 · 酸度调节剂', note: '柠檬酸' },
  sources: [
    {
      id: 'W1',
      title: 'CITRIC ACID（FAO JECFA  monograph 16）',
      organization: '联合国粮食及农业组织（FAO）',
      sourceType: 'fetch_content',
      url: 'https://www.fao.org/fileadmin/user_upload/jecfa_additives/docs/monograph16/additive-135-m16.pdf',
      excerpt:
        'CITRIC ACID. Group ADI "Not limited" for citric acid and its calcium, potassium, sodium and ammonium salts established at the 17th JECFA in 1973. SYNONYMS INS No. 330. FUNCTIONAL USES Acidifier; sequestrant; antioxidant synergist; flavouring agent.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2014',
      tier: 'web_body',
    },
    GLOSSARY,
  ],
  model: {
    brief: briefOf(
      '柠檬酸是食品里最常见的酸味剂之一，国际编号 INS 330。',
      '用来调酸、增强风味，也能防止某些成分被金属离子催化氧化。',
      '它本身就是人体代谢中间产物，也天然存在于柠檬、柑橘等水果里。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 规格把柠檬酸的功能列为酸化剂、螯合剂、抗氧化增效剂和调味剂。', 'W1'),
      sectionOf('limits', '配料表不标注酸的浓度和添加量。', 'W1'),
    ],
    healthInsights: {
      normalIntake: {
        text: 'JECFA 给柠檬酸及其钙、钾、钠、铵盐定的组 ADI 是「not limited」，不设数值上限。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'Group ADI "Not limited" for citric acid and its calcium, potassium, sodium and ammonium salts',
        conditions: '针对柠檬酸及其四种盐',
        sourceYear: '1973',
      },
      highIntake: {
        text: '「not limited」是 JECFA 已不再使用的旧术语，含义等同于「not specified」：不设数值型 ADI，也不表示没有上限。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1', 'W2'],
        quote: NOT_LIMITED_QUOTE,
        conditions: '术语解释；仍须符合使用范围与良好生产规范',
        sourceYear: null,
      },
    },
  },
};

const LACTIC = {
  key: 'lactic',
  name: '乳酸',
  aliases: ['lactic acid'],
  ins: 'INS 270',
  identity: { type: 'additive', label: '食品添加剂 · 酸度调节剂', note: '乳酸' },
  sources: [
    {
      id: 'W1',
      title: 'LACTIC ACID（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/chemical.aspx?chemID=3367',
      excerpt:
        'LACTIC ACID. INS 270. Functional Class Flavouring Agent, Food Additives, ACID, ACIDITY_REGULATOR. Evaluations. Evaluation year: 2001. ADI: NOT LIMITED (1973). Comments: No safety concern at current levels of intake when used as a flavouring agent. Previous Years: 1973, NMRS 53/TRS 539-JECFA 17/23. ADI NOT LIMITED. (NEITHER D(-)-LACTIC ACID NOR DL-LACTIC ACID SHOULD BE USED IN INFANT FOODS.)',
      excerptType: 'fetched_excerpt',
      publishedAt: '2001',
      tier: 'web_body',
    },
    GLOSSARY,
  ],
  model: {
    brief: briefOf(
      '乳酸是食品里常见的酸度调节剂，国际编号 INS 270。',
      '用来调酸、抑菌，也是酸奶等发酵食品天然产生的酸。',
      '它有两种旋光异构体（L(+) 和 D(-)），食品标签通常不会区分。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把乳酸列在酸、酸度调节剂和调味剂类别下。', 'W1'),
      sectionOf('limits', '配料表不区分乳酸的具体异构体，也不标注添加量。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'JECFA 在 2001 年的评估认为，乳酸作为调味剂在当前摄入水平下没有安全关切。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'No safety concern at current levels of intake when used as a flavouring agent',
        conditions: '作为调味剂使用时的当前摄入水平',
        sourceYear: '2001',
      },
      sensitiveGroups: {
        text: '婴儿食品不应使用 D(-)-乳酸或 DL-乳酸。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'NEITHER D(-)-LACTIC ACID NOR DL-LACTIC ACID SHOULD BE USED IN INFANT FOODS',
        conditions: '针对婴儿食品',
        sourceYear: '1973',
      },
    },
  },
};

const SULFITE = {
  key: 'sulfite',
  name: '焦亚硫酸钠',
  aliases: ['metabisulfite'],
  ins: 'INS 223',
  // 该组 ADI 记录在二氧化硫（INS 220）名下，来源页只出现 220
  sourceIns: '220',
  identity: { type: 'additive', label: '食品添加剂 · 防腐剂/抗氧化剂', note: '焦亚硫酸钠' },
  sources: [
    {
      id: 'W1',
      title: 'SULFUR DIOXIDE（JECFA 评估数据库，含亚硫酸盐组）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/985',
      excerpt:
        'SULFUR DIOXIDE. INS 220. Functional Class Food Additives ANTIOXIDANT FLOUR_TREATMENT_AGENT PRESERVATIVE. Evaluations. Evaluation year: 1998. ADI: 0-0.7 mg/kg bw. Comments: Group ADI, expressed as sulfur dioxide, for calcium hydrogen sulfite, calcium metabisulfite, calcium sulfite, potassium hydrogen sulfite, potassium metabisulfite, potassium sulfite, sodium hydrogen sulfite, sodium metabisulfite, sodium sulfite, sodium thiosulfate, and sulfur dioxide.',
      excerptType: 'fetched_excerpt',
      publishedAt: '1998',
      tier: 'web_body',
    },
    {
      id: 'W2',
      title: 'FDA 召回公告：未标示亚硫酸盐的金葡萄干',
      organization: '美国食品药品监督管理局（FDA）',
      sourceType: 'fetch_content',
      url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/apna-wholesale-issues-alert-undeclared-sulfites-paras-premium-golden-raisins',
      excerpt:
        'The consumption of 10 milligrams of sulfites per serving has been reported to elicit severe reactions in some asthmatics. Anaphylactic shock could occur in certain sulfite sensitive individuals upon ingesting 10 milligrams or more of sulfites.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2025',
      tier: 'web_body',
    },
    {
      id: 'W3',
      title: 'EFSA 2022：二氧化硫—亚硫酸盐（E 220–228）再评估后续意见',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/sites/default/files/2022-11/EFS2_7594.pdf',
      excerpt:
        'Sulfur dioxide–sulfites (E 220–228) were re-evaluated in 2016, resulting in the setting of a temporary ADI of 0.7 mg SO2 equivalents/kg bw per day. ... the Panel considered that the available toxicity database was inadequate to derive an ADI and withdrew the current temporary group acceptable daily intake (ADI). A lower confidence limit of the benchmark dose of 38 mg SO2 equivalents/kg bw per day was estimated based on prolonged visual evoked potential latency. An assessment factor of 80 was applied for the assessment of the MoE. At the estimated dietary exposures, MOEs at the maximum of 95th percentile ranges were below 80 for all population groups except for adolescents. The Panel concluded that this raises a safety concern for both dietary exposure scenarios.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2022',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '焦亚硫酸钠是能释放二氧化硫的亚硫酸盐，国际编号 INS 223。',
      '用来防腐、抗氧化、防止褐变，蜜饯和干果里常见。',
      '它的健康讨论通常按「二氧化硫」来计量，而不是按盐本身的重量。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把二氧化硫和包括焦亚硫酸钠在内的多种亚硫酸盐放在同一个组里评估。', 'W1'),
      sectionOf('limits', '配料表不标注亚硫酸盐的残留量，无法据此推算摄入量。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'EFSA 在 2022 年的再评估认为，亚硫酸盐的临时 ADI 应被撤回，高消费人群的暴露量已越过安全边界，构成安全关切。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'the Panel considered that the available toxicity database was inadequate to derive an ADI and withdrew the current temporary group acceptable daily intake (ADI)',
        conditions: '高消费人群（青少年除外）；依据动物神经毒性终点的 MOE 评估',
        sourceYear: '2022',
      },
      normalIntake: {
        text: '亚硫酸盐此前的组 ADI 是 0–0.7 mg/kg 体重（以二氧化硫计），EFSA 在 2022 年以数据不足为由撤回了这个临时值。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'temporary ADI of 0.7 mg SO2 equivalents/kg bw per day',
        conditions: '组 ADI，以二氧化硫计',
        sourceYear: '2022',
      },
      highIntake: {
        text: '每份 10 mg 亚硫酸盐已有报告在部分哮喘患者中引起严重反应，敏感个体摄入 10 mg 以上可能出现过敏性休克。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W2'],
        quote: 'The consumption of 10 milligrams of sulfites per serving has been reported to elicit severe reactions',
        conditions: '部分哮喘患者与亚硫酸盐敏感个体',
        sourceYear: null,
      },
      sensitiveGroups: {
        text: '部分哮喘患者和已知对亚硫酸盐敏感的人需要特别注意。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W2'],
        quote: 'certain sulfite sensitive individuals',
        conditions: '部分哮喘患者，不是所有哮喘患者',
        sourceYear: null,
      },
    },
  },
};

const EDTA = {
  key: 'edta',
  name: '乙二胺四乙酸二钠',
  aliases: ['disodium edta', 'edta'],
  ins: 'INS 386',
  identity: { type: 'additive', label: '食品添加剂 · 稳定剂/防腐剂', note: 'EDTA 二钠（INS 386）' },
  sources: [
    {
      id: 'W1',
      title: 'DISODIUM EDTA（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/385',
      excerpt:
        'DISODIUM EDTA. Chemical Names Disodium dihydrogen ethylenediaminetetraacetate. Synonyms Disodium edta; Disodium edetate. INS 386. Functional Class Food Additives ANTIOXIDANT_SYNERGIST PRESERVATIVE SEQUESTRANT SYNERGIST. Evaluations. Evaluation year: 1973. ADI: 0-2.5 mg/kg bw. Comments: As calcium disodium EDTA; no excess disodium EDTA to remain in foods. Report: NMRS 53/TRS 539-JECFA 17/18.',
      excerptType: 'fetched_excerpt',
      publishedAt: '1973',
      tier: 'web_body',
    },
    {
      id: 'W2',
      title: 'EFSA：Diarr-Stop S Plus 饲料添加剂安全性与功效意见',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/en/efsajournal/pub/4472',
      excerpt:
        'Calcium disodium EDTA is an authorised food additive in the EU (E 385) with an acceptable daily intake (ADI) set by the Joint Food and Agriculture Organization of the United nations (FAO)/World Health Organization (WHO) Expert Committee on Food Additives (JECFA) of 2.5 mg/kg body weight (bw) per day (WHO, 1966, 1974). No ADI for EDTA or its sodium salts has been established. However, from the ADI established for calcium disodium EDTA, a value of 1.9 mg/kg bw per day can be calculated for EDTA itself.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2016',
      tier: 'web_body',
    },
    {
      id: 'W3',
      title: 'EFSA 2024：钙二钠 EDTA（E 385）再评估的数据征集',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/sites/default/files/2024-06/call-for-data-edta.pdf',
      excerpt:
        'The food additive calcium disodium EDTA (E 385) has been previously evaluated by the Scientific Committee for Food (SCF). The Committee established an ADI of 2.5 mg/kg bw/day in 1977. The ADI set by the SCF reconfirmed the one previously established by the Joint FAO/WHO Expert Committee on Food Additives (JECFA) in 1974. E 385 was later re-evaluated in 1990. In that re-evaluation, the Committee confirmed the previously established ADI, on condition that intakes remain within the ADI and the substance is not used in food supplying the major part of dietary minerals, the mineral binding properties of this substance have no significance for health.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2024',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '乙二胺四乙酸二钠（EDTA 二钠）是一种螯合剂，国际编号 INS 386。',
      '它把金属离子「抓住」，防止食品因微量金属而变色、变味或氧化。',
      '它和「乙二胺四乙酸二钠钙」是两种不同的盐，ADI 的计量基准也不同。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把 EDTA 二钠列在抗氧化增效剂、防腐剂、螯合剂等类别下。', 'W1'),
      sectionOf('limits', '配料表不标注添加量，也不说明用的是哪一种 EDTA 盐。', 'W1'),
      sectionOf('misconception', '资料里关于「腌渍的食用菌和藻类」的规定属于另一个食品类别，不能套到腌渍蔬菜上。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'SCF 在 1990 年的再评估中确认：摄入量在 ADI 以内、且不用于提供主要膳食矿物质的食品时，EDTA 结合矿物质对健康没有影响。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'intakes remain within the ADI and the substance is not used in food supplying the major part of dietary minerals, the mineral binding properties of this substance have no significance for health',
        conditions: '适用于钙二钠 EDTA（E 385）',
        sourceYear: '1990',
      },
      normalIntake: {
        text: '钙二钠 EDTA 的 ADI 是 2.5 mg/kg 体重，1977 年由 SCF 设定、1974 年由 JECFA 确认，计量基准是钙二钠 EDTA。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'The Committee established an ADI of 2.5 mg/kg bw/day in 1977',
        conditions: '以钙二钠 EDTA 计，不能直接套到其他 EDTA 形式上',
        sourceYear: '1977',
      },
      highIntake: {
        text: '长期摄入超过 ADI 后的人体反应，现有资料没有给出；SCF 只把矿物质结合列为限制使用范围的理由。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'the mineral binding properties of this substance have no significance for health',
        conditions: '基于 SCF 1990 年的限定条件',
        sourceYear: '1990',
      },
    },
  },
};

const SUCRALOSE = {
  key: 'sucralose',
  name: '三氯蔗糖',
  aliases: ['sucralose'],
  ins: 'INS 955',
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '三氯蔗糖' },
  sources: [
    {
      id: 'W1',
      title: 'SUCRALOSE（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/2340',
      excerpt:
        'SUCRALOSE. INS 955. Functional Class Food Additives SWEETENER. Evaluations. Evaluation year: 1990. ADI: 0-15 mg/kg bw. Report: TRS 806-JECFA 37/21. Previous Years: 2001; 1993; 1990; 1988, TRS 776-JECFA 33/20, 0-3.5 (TEMPORARY).',
      excerptType: 'fetched_excerpt',
      publishedAt: '1990',
      tier: 'web_body',
    },
    GLOSSARY,
    {
      id: 'W3',
      title: 'EFSA：三氯蔗糖（E 955）再评估新闻稿',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/en/news/efsa-finds-sucralose-safe-when-used-currently-authorised-cannot-confirm-safety-extending-its',
      excerpt:
        'EFSA’s experts concluded that the sweetener sucralose (E 955) continues to be safe for consumers for its currently authorised uses as a food additive. Following a comprehensive review of all available scientific data, they confirmed the Acceptable Daily Intake (ADI) of 15 mg/kg body weight per day and indicated that current consumer exposure remains below this level. However, EFSA could not confirm the safety of additional uses of sucralose. A recent study found that when E 955 is exposed to high temperatures for long periods, chlorine can migrate from sucralose and potentially form chlorinated compounds, the health effects of which are unknown.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2026',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '三氯蔗糖是一种高倍甜味剂，国际编号 INS 955，甜度约为蔗糖的 600 倍。',
      '它提供甜味但不产生能量，饮料、烘焙食品里常见。',
      '它和蔗糖是两种物质，名字里有「蔗糖」不代表它就是糖。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把三氯蔗糖登记在甜味剂类别下。', 'W1'),
      sectionOf('limits', '配料表不标注实际添加量。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'EFSA 的再评估确认，三氯蔗糖在目前获准的用途下对消费者是安全的，消费者暴露量低于 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'EFSA’s experts concluded that the sweetener sucralose (E 955) continues to be safe for consumers for its currently authorised uses as a food additive',
        conditions: '仅限目前获准的食品用途；长时间高温烘焙等新用途不在这个结论内',
        sourceYear: '2026',
      },
      normalIntake: {
        text: 'EFSA 的再评估确认 ADI 仍为 15 mg/kg 体重，并认为当前各人群的暴露量低于这个水平，因此对获准用途没有安全担忧。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W3'],
        quote: 'they confirmed the Acceptable Daily Intake (ADI) of 15 mg/kg body weight per day and indicated that current consumer exposure remains below this level',
        conditions: '目前获准的用途',
        sourceYear: '2026',
      },
    },
  },
};

const SORBATE = {
  key: 'sorbate',
  name: '山梨酸钾',
  aliases: ['sorbic acid'],
  ins: 'INS 202',
  identity: { type: 'additive', label: '食品添加剂 · 防腐剂', note: '山梨酸钾' },
  sources: [
    {
      id: 'W1',
      title: 'POTASSIUM SORBATE（JECFA 评估数据库）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/2724',
      excerpt:
        'POTASSIUM SORBATE. INS 202. Functional Class Food Additives PRESERVATIVE. Evaluations. Evaluation year: 1973. ADI: 0-25 mg/kg bw. Comments: Group ADI as the sum of sorbic acid and calcium, potassium and sodium sorbates (expressed as sorbic acid). Report: NMRS 53/TRS 539-JECFA 17/18.',
      excerptType: 'fetched_excerpt',
      publishedAt: '1973',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '山梨酸钾是山梨酸的钾盐，国际编号 INS 202，用来抑制霉菌和酵母。',
      '它在酸性环境里效果最好，所以常见于饮料、酱菜、糕点。',
      '它的 ADI 是按「山梨酸」折算的，不是按盐本身的重量。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把山梨酸钾登记在防腐剂类别下。', 'W1'),
      sectionOf('limits', '配料表不标注添加量。', 'W1'),
    ],
    healthInsights: {
      normalIntake: {
        text: 'JECFA 在 1973 年给山梨酸及其钙、钾、钠盐定了组 ADI，为 0–25 mg/kg 体重，以山梨酸计。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'Group ADI as the sum of sorbic acid and calcium, potassium and sodium sorbates (expressed as sorbic acid)',
        conditions: '以山梨酸计',
        sourceYear: '1973',
      },
      highIntake: {
        text: '这个 0–25 mg/kg 体重是长期每日摄入的参考值，不是一次摄入的上限；资料没有给出超过后的具体人体反应。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'ADI: 0-25 mg/kg bw',
        conditions: '长期每日摄入',
        sourceYear: '1973',
      },
    },
  },
};

const ASPARTAME = {
  key: 'aspartame',
  name: '阿斯巴甜',
  aliases: ['aspartame'],
  ins: 'INS 951',
  identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: '阿斯巴甜' },
  sources: [
    {
      id: 'W1',
      title: 'ASPARTAME（JECFA 评估数据库，2023 年重申）',
      organization: '世界卫生组织（WHO）',
      sourceType: 'fetch_content',
      url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/62',
      excerpt:
        'ASPARTAME. INS 951. Functional Class Food Additives SWEETENER. Evaluations. Evaluation year: 2023. ADI: 0–40 mg/kg bw. Comments: Overall, JECFA concluded that there was no convincing evidence from experimental animal or human data that aspartame has adverse effects after ingestion. JECFA therefore reaffirmed the ADI of 0–40 mg/kg bw for aspartame at the present meeting. Intake: JECFA determined that dietary exposure estimates to aspartame at the mean of up to 10 mg/kg bw per day for children and 5 mg/kg bw per day for adults, and for high dietary exposures up to 20 mg/kg bw per day for children and 12 mg/kg bw per day for adults, were appropriate for the present assessment.',
      excerptType: 'fetched_excerpt',
      publishedAt: '2023',
      tier: 'web_body',
    },
    {
      id: 'W2',
      title: 'EFSA · Aspartame 专题（2013 年再评估）',
      organization: '欧洲食品安全局（EFSA）',
      sourceType: 'fetch_content',
      url: 'https://www.efsa.europa.eu/en/topics/topic/aspartame',
      excerpt:
        'The Acceptable Daily Intake (ADI) of 40 milligrams per kilogram of body weight per day (mg/kg bw/day) is considered protective for the general population. For patients suffering from the medical condition phenylketonuria, the ADI is not applicable, as they require strict adherence to a diet low in phenylalanine (an amino acid making up proteins found in many foods).',
      excerptType: 'fetched_excerpt',
      publishedAt: '2013',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '阿斯巴甜是一种高倍甜味剂，国际编号 INS 951，由两种氨基酸组成。',
      '它提供甜味但能量很低，无糖饮料里常见。',
      '它在体内会分解成包括苯丙氨酸在内的成分，这一点对苯丙酮尿症患者很重要。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'JECFA 把阿斯巴甜登记在甜味剂类别下，2023 年再次评估后维持原有 ADI。', 'W1'),
      sectionOf('limits', '配料表不标注添加量，无法据此推算摄入量。', 'W1'),
    ],
    healthInsights: {
      consumerTakeaway: {
        text: 'JECFA 在 2023 年的评估认为，现有动物和人体数据都没有令人信服的证据表明摄入阿斯巴甜会产生不良影响。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'there was no convincing evidence from experimental animal or human data that aspartame has adverse effects after ingestion',
        conditions: '一般人群；苯丙酮尿症患者另见人群提示',
        sourceYear: '2023',
      },
      highIntake: {
        text: 'JECFA 估计儿童平均膳食暴露可达 10 mg/kg 体重每天、高暴露可达 20 mg/kg 体重每天，均低于 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'dietary exposure estimates to aspartame',
        conditions: '儿童膳食暴露估计',
        sourceYear: '2023',
      },
      sensitiveGroups: {
        text: '苯丙酮尿症患者不适用这个 ADI，需要严格控制苯丙氨酸摄入。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W2'],
        quote: 'For patients suffering from the medical condition phenylketonuria, the ADI is not applicable',
        conditions: '苯丙酮尿症患者',
        sourceYear: '2013',
      },
    },
  },
};

const LIMITED = {
  key: 'flavouring',
  name: '食用香精',
  aliases: ['flavouring'],
  ins: null,
  identity: { type: 'additive', label: '食品添加剂 · 食用香料', note: '类别型配料' },
  sources: [
    {
      id: 'W1',
      title: 'GB 2760-2024 食品用香料使用规定（查询结果）',
      organization: '国家食品安全风险评估中心（CFSA）',
      sourceType: 'fetch_content',
      url: 'https://gb2760.cfsa.net.cn/',
      excerpt:
        '食品用香料、香精的使用应符合 GB 2760-2024 附录 B 的规定。食品用香料品种繁多，允许使用的品种列于表 B.2、B.3；食品用香精由食品用香料与辅料调配而成，其使用范围按相应食品类别执行。',
      excerptType: 'fetched_excerpt',
      publishedAt: '2024',
      tier: 'web_body',
    },
  ],
  model: {
    brief: briefOf(
      '「食用香精」是配料表里的类别写法，指由多种食品用香料调配而成的增香配料。',
      '用来补充或还原食品的香气；具体用了哪些香料，标签通常不展开。',
      '类别名本身不说明具体成分，也没有针对「食用香精」整体的 ADI。',
      'W1',
    ),
    sections: [
      sectionOf('what', 'GB 2760-2024 把食品用香料、香精的使用规定放在附录 B。', 'W1'),
      sectionOf('limits', '标签只写类别时不展开具体香料，无法据此判断里面有哪些物质。', 'W1'),
    ],
    // 只有技术标准、没有健康评估 → 整块省略，程序会说明资料缺口
    healthInsights: null,
  },
};

/** 12 种成分的验收集（顺序与验收清单一致） */
export const HEALTH_CASES = [
  MSG,
  RIBONUCLEOTIDE,
  CITRIC,
  ACETIC_ACID,
  LACTIC,
  SULFITE,
  EDTA,
  ACESULFAME_K,
  SUCRALOSE,
  SORBATE,
  ASPARTAME,
  LIMITED,
];

/** 只有技术标准的降级样例（安赛蜜，但资料只有 GB 2760） */
export { STANDARD_ONLY };
