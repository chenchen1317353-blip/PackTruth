/**
 * 规则来源库（Evidence）。
 *
 * 铁律：
 * 1. quoteType 为 'verbatim' 的条目，文本必须逐字来自原始材料，不得改写、不得补全。
 * 2. 只有在解释性改写时才用 'summary'，且界面上必须显示「摘要」标记。
 * 3. 未核实的内容一律不收录。宁可少一条，也不能编一条。
 * 4. 每条都要带版本号和适用条件 —— 不同版本的标准不能混用阈值。
 *
 * 核实方式（2026-10-31）：
 * - GB 28050-2011 全文 PDF 从国家卫生健康委官网下载后提取正文，
 *   表 1、附录 C 表 C.1、第 3.1 / 2.7.1 条均为逐字摘录。
 * - GB 28050-2025 只有官方问答，没有拿到标准正文，
 *   因此 2025 版的条文一律标记为来自「问答」，不作为数值依据。
 */

const NHC = 'https://www.nhc.gov.cn';
const GB2011_PDF = `${NHC}/sps/c100088/201111/714fdca49f15450580fc03a2ee3163f9/files/1732844863395_24655.pdf`;
const GB2011_QA = `${NHC}/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml`;
const GB2025_QA = `${NHC}/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml`;
const GB7718_2025_QA = `${NHC}/sps/c100087/202509/bc824a504ec34c27883da73f14c20d44.shtml`;
const GB7718_2025_PDF =
  'https://sppt.cfsa.net.cn:8086/db?type=2&guid=63F005D7-BA6F-428C-8098-826735B6C13E';
const SAMR_100 =
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_4edcff1e8d894890a012aac1e974c1ff.html';

export const STANDARDS = {
  'GB28050-2011': {
    code: 'GB 28050—2011',
    title: '食品安全国家标准 预包装食品营养标签通则',
    issuer: '中华人民共和国卫生部',
    publishedAt: '2011-10-12',
    effectiveAt: '2013-01-01',
    status: '现行（截至 2026-10 市售产品仍普遍适用）',
    note: 'GB 28050-2025 已发布，2027-03-16 起对新生产食品实施。',
    sourceUrl: GB2011_PDF,
  },
  'GB28050-2025': {
    code: 'GB 28050—2025',
    title: '食品安全国家标准 预包装食品营养标签通则',
    issuer: '国家卫生健康委员会',
    publishedAt: '2025-03-16',
    effectiveAt: '2027-03-16',
    status: '已发布，尚未实施',
    note: '2027-03-16 起对新生产食品实施。本阶段只把 2025 版用于解释与版本提示，不用于任何数值判定。',
    sourceUrl: GB2025_QA,
  },
  'GB7718-2025': {
    code: 'GB 7718—2025',
    title: '食品安全国家标准 预包装食品标签通则',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    publishedAt: '2025-03-16',
    effectiveAt: '2027-03-16',
    status: '已发布，尚未实施',
    note: '2027-03-16 起实施。第 4.4.2.2 条新增「不得使用『不添加』『不使用』及其同义语」的要求，A.5.3 把「零添加」「无添加」「未添加」列为同义语。',
    sourceUrl: GB7718_2025_PDF,
  },
  'GB2760-2024': {
    code: 'GB 2760—2024',
    title: '食品安全国家标准 食品添加剂使用标准',
    issuer: '国家卫生健康委员会、国家市场监督管理总局',
    effectiveAt: '2025-02-08',
    status: '现行',
    note: '只用于说明食品添加剂的功能类别定义，不作为产品合规判定依据。',
    sourceUrl: 'https://gb2760.cfsa.net.cn/func.html',
  },
  'SAMR-100': {
    code: '《食品标识监督管理办法》',
    title: '食品标识监督管理办法（国家市场监督管理总局令第 100 号）',
    issuer: '国家市场监督管理总局',
    publishedAt: '2025-03-14',
    effectiveAt: '2027-03-16',
    status: '已公布，尚未施行',
    note: '与 GB 7718—2025 同日施行。本条只用于解释「不得虚假、误导」，不作为任何阈值来源。',
    sourceUrl: SAMR_100,
  },
};

/** 所有证据条目 */
export const EVIDENCE = {
  // ---------------- GB 28050-2011 表 1 ----------------
  'gb2011-t1-fat-zero': {
    id: 'gb2011-t1-fat-zero',
    standard: 'GB28050-2011',
    clause: '表 1「能量和营养成分名称、顺序、表达单位、修约间隔和"0"界限值」',
    itemName: '脂肪',
    quoteType: 'verbatim',
    quote: '脂肪　克（g）　0.1　≤ 0.5 g',
    plain: '脂肪的"0"界限值为每 100 g 或 100 mL 不超过 0.5 g。',
    conditions: [
      '以每 100 g 或每 100 mL 计（表 1 表头即为该口径）',
      '以「份」标示时，仍须同时满足每 100 g 或 100 mL 的界限值（表 1 脚注 b）',
      '仅适用于按 GB 28050-2011 标示营养标签的预包装食品',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },
  'gb2011-t1-sugar-zero': {
    id: 'gb2011-t1-sugar-zero',
    standard: 'GB28050-2011',
    clause: '表 1「能量和营养成分名称、顺序、表达单位、修约间隔和"0"界限值」',
    itemName: '糖',
    quoteType: 'verbatim',
    quote: '糖（乳糖 c）　克（g）　0.1　≤ 0.5 g',
    plain: '糖的"0"界限值为每 100 g 或 100 mL 不超过 0.5 g。',
    conditions: ['以每 100 g 或每 100 mL 计', '仅适用于按 GB 28050-2011 标示营养标签的预包装食品'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },
  'gb2011-t1-footnote-b': {
    id: 'gb2011-t1-footnote-b',
    standard: 'GB28050-2011',
    clause: '表 1 脚注 b',
    quoteType: 'verbatim',
    quote:
      '当某营养成分含量数值≤“0”界限值时，其含量应标示为“0”；使用“份”的计量单位时，也要同时符合每 100 g 或 100 mL 的“0”界限值的规定。',
    plain:
      '标「0」的含义是：实际含量不高于该界限值，而不是精确等于零。这是标示规则，不是检测结论。',
    conditions: ['适用于 GB 28050-2011 覆盖的营养成分表'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },

  // ---------------- GB 28050-2011 附录 C ----------------
  'gb2011-c1-fat': {
    id: 'gb2011-c1-fat',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」',
    itemName: '脂肪',
    quoteType: 'verbatim',
    quote: '脂肪　无或不含脂肪　≤0.5 g/100 g（固体）或 100 mL（液体）',
    plain: '「无或不含脂肪」的含量要求是每 100 g（固体）或每 100 mL（液体）不超过 0.5 g。',
    conditions: ['属于含量声称，用语须使用表 C.1 规定的标准语或同义语', '固体与液体分别按 100 g / 100 mL 计'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },
  'gb2011-c1-sugar': {
    id: 'gb2011-c1-sugar',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」',
    itemName: '碳水化合物（糖）',
    quoteType: 'verbatim',
    quote: '碳水化合物（糖）　无或不含糖　≤ 0.5 g /100 g（固体）或 100 mL（液体）',
    plain: '与糖相关的含量声称用语是「无或不含糖」，要求 ≤0.5 g/100 g 或 100 mL。',
    conditions: ['该表中未列出「0 蔗糖」这一表述'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },
  'gb2011-c1-scope': {
    id: 'gb2011-c1-scope',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1 项目列（本次摘录范围内）',
    quoteType: 'summary',
    quote:
      '表 C.1 中就糖类列出的含量声称方式为「无或不含糖」「低糖」「低乳糖」「无乳糖」；未出现「0 蔗糖」「零蔗糖」等表述。',
    plain: '标准规定的糖类声称用语里没有「0 蔗糖」这一条。',
    conditions: [
      '这是对表 C.1 项目列的归纳，不是逐字原文',
      '「没有列出」不等于「一定违规」，还需结合标签整体表述与监管认定',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },

  // ---------------- GB 28050-2011 正文 ----------------
  'gb2011-2-7-1': {
    id: 'gb2011-2-7-1',
    standard: 'GB28050-2011',
    clause: '第 2.7.1 条「含量声称」',
    quoteType: 'verbatim',
    quote: '描述食品中能量或营养成分含量水平的声称。声称用语包括“含有”、“高”、“低”或“无”等。',
    plain: '含量声称的规范用语是「含有 / 高 / 低 / 无」这一类。',
    conditions: [],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },
  'gb2011-3-1': {
    id: 'gb2011-3-1',
    standard: 'GB28050-2011',
    clause: '第 3.1 条「基本要求」',
    quoteType: 'verbatim',
    quote: '预包装食品营养标签标示的任何营养信息，应真实、客观，不得标示虚假信息，不得夸大产品的营养作用或其他作用。',
    plain: '标准要求营养信息真实客观、不得夸大。',
    conditions: [],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-10-31',
  },

  // ---------------- GB 28050-2025 官方问答（非标准正文） ----------------
  'gb2025-qa-sugar-def': {
    id: 'gb2025-qa-sugar-def',
    standard: 'GB28050-2025',
    clause: '官方问答（八）关于糖及其含量',
    quoteType: 'verbatim',
    quote:
      '糖是指单糖和双糖之和，本标准从食品组成和糖的主要来源上看，明确用于营养标签标示的糖仅限定为葡萄糖、果糖、蔗糖、麦芽糖、乳糖之和。',
    plain: '营养标签上的「糖」指葡萄糖、果糖、蔗糖、麦芽糖、乳糖五种糖之和 —— 蔗糖只是其中之一。',
    conditions: [
      '这是 GB 28050-2025 的问答解释，不是 GB 28050-2011 的条文',
      'GB 28050-2011 正文未给出「糖」的同等定义（已核对全文）',
      '用于帮助理解「糖」包含哪些成分，不作为含量判定的数值依据',
    ],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-10-31',
  },
  'gb2025-qa-zero-limit': {
    id: 'gb2025-qa-zero-limit',
    standard: 'GB28050-2025',
    clause: '官方问答（十九）关于营养成分"0"界限值',
    quoteType: 'verbatim',
    quote:
      '“0”界限值是指当能量或某一营养成分含量小于该界限值时，基本不具有实际营养意义，因此应标示为“0”。标示方式可为“0”、“0.0”等，不致影响消费者正确理解。',
    plain: '「0」是标示规则的结果，表示含量低于界限值、基本无实际营养意义，不是精确的零。',
    conditions: ['出自 2025 版问答，与 2011 版表 1 的思路一致，但版本不同不可混用'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-10-31',
  },
  'gb2025-qa-effective': {
    id: 'gb2025-qa-effective',
    standard: 'GB28050-2025',
    clause: '官方问答（六十七）实施日期',
    quoteType: 'verbatim',
    quote:
      '营养标签标准将于2027年3月16日实施。在实施日期后生产的食品，应当按照标准要求标示营养标签。在实施日期前生产的食品，可在食品保质期内继续销售至保质期结束。',
    plain: '2025 版自 2027-03-16 起对新生产食品实施；此前生产的食品在保质期内仍可按 2011 版销售。',
    conditions: [],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-10-31',
  },

  // ================================================================
  // V2 新增：GB 28050—2011 附录 C 表 C.1（含量声称）
  // 全部逐字摘自标准 PDF（2026-11-01 重新提取核对），仅去掉版面换行。
  // ================================================================
  'gb2011-c1-low-fat': {
    id: 'gb2011-c1-low-fat',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」脂肪行',
    itemName: '脂肪',
    quoteType: 'verbatim',
    quote: '低脂肪 ≤3 g/100 g 固体；≤1.5 g/100 mL 液体',
    plain: '「低脂肪」的含量要求：固体 ≤3 g/100 g，液体 ≤1.5 g/100 mL。两个形态的界限值不同。',
    conditions: [
      '属于含量声称，用语须使用表 C.1 规定的标准语或表 C.2 的同义语',
      '固体按每 100 g 计，液体按每 100 mL 计，不能互换',
      '「少油」是「低脂肪」的同义语，仅用于低脂肪声称（表 C.2 脚注 a）',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-low-sugar': {
    id: 'gb2011-c1-low-sugar',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」碳水化合物（糖）行',
    itemName: '糖',
    quoteType: 'verbatim',
    quote: '低糖 ≤ 5 g /100 g（固体）或 100 mL（液体）',
    plain: '「低糖」的含量要求是糖 ≤5 g/100 g（固体）或 ≤5 g/100 mL（液体），两个形态的数值相同。',
    conditions: [
      '判定对象是营养标签中的「糖」，不是「碳水化合物」',
      '按 GB 28050—2011 第 4.2、4.5 条，对糖进行营养声称时应标示含量；糖未规定 NRV，无需标示其 NRV%',
      '「糖」在 2011 版正文中没有给出成分定义，不能把碳水化合物直接当作糖',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-low-sodium': {
    id: 'gb2011-c1-low-sodium',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」钠行',
    itemName: '钠',
    quoteType: 'verbatim',
    quote: '低钠 ≤120 mg /100 g 或 100 mL',
    plain: '「低钠」的含量要求是钠 ≤120 mg/100 g 或 ≤120 mg/100 mL。',
    conditions: [
      '判定对象是钠（mg），不是食盐的质量',
      '表 C.1 钠行限制性条件：符合「钠」声称时，也可用「盐」字代替「钠」字，如「低盐」「减少盐」等',
      '「低盐」不等于完全没有盐，也不等于没有使用食盐配料',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-zero-sodium': {
    id: 'gb2011-c1-zero-sodium',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」钠行',
    itemName: '钠',
    quoteType: 'verbatim',
    quote: '无或不含钠 ≤5 mg /100 g 或 100 mL',
    plain: '「无或不含钠」（同义语「无盐」）的要求是钠 ≤5 mg/100 g 或 100 mL，与「低钠」的 120 mg 不是同一个界限。',
    conditions: ['「无盐」按钠声称处理，不是指配料中没有食盐', '与「低钠」属于两个不同声称，不能互相替代'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-protein-source': {
    id: 'gb2011-c1-protein-source',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」蛋白质行',
    itemName: '蛋白质',
    quoteType: 'verbatim',
    quote:
      '蛋白质来源，或含有蛋白质 每 100 g 的含量≥10 % NRV 每 100 mL 的含量≥5 % NRV 或者 每 420 kJ 的含量≥5 % NRV',
    plain:
      '「蛋白质来源 / 含有蛋白质」按蛋白质 NRV（60 g）计算：固体 ≥6 g/100 g，液体 ≥3 g/100 mL，或 ≥3 g/420 kJ。',
    conditions: [
      'NRV 取 GB 28050—2011 附录 A 表 A.1：蛋白质 60 g',
      '三条途径并列，满足任一条即可，不能只因为其中一条不满足就判定不符合',
      '用「份」标示时仍需符合每 100 g（mL）的要求（表 C.1 脚注 a）',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-protein-high': {
    id: 'gb2011-c1-protein-high',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」蛋白质行',
    itemName: '蛋白质',
    quoteType: 'verbatim',
    quote:
      '高，或富含蛋白质 每 100 g 的含量≥20 % NRV 每 100 mL 的含量≥10 % NRV 或者 每 420 kJ 的含量≥10 % NRV',
    plain:
      '「高 / 富含蛋白质」按蛋白质 NRV（60 g）计算：固体 ≥12 g/100 g，液体 ≥6 g/100 mL，或 ≥6 g/420 kJ。',
    conditions: [
      '阈值是「蛋白质来源」的两倍，两条规则不能合并',
      'NRV 取 GB 28050—2011 附录 A 表 A.1：蛋白质 60 g',
      '三条途径并列，满足任一条即可',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-fiber-source': {
    id: 'gb2011-c1-fiber-source',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」膳食纤维行',
    itemName: '膳食纤维',
    quoteType: 'verbatim',
    quote:
      '膳食纤维来源或含有膳食纤维 ≥3 g/ 100 g（固体） ≥1.5 g/ 100 mL（液体）或 ≥1.5 g/ 420 kJ',
    plain: '「膳食纤维来源 / 含有膳食纤维」：固体 ≥3 g/100 g，液体 ≥1.5 g/100 mL，或 ≥1.5 g/420 kJ。',
    conditions: [
      '膳食纤维总量符合要求，或可溶性膳食纤维、不溶性膳食纤维、单体成分任一项符合要求',
      '配料表里的「燕麦」「全麦」名称不能用来推算纤维含量',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-fiber-high': {
    id: 'gb2011-c1-fiber-high',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」膳食纤维行',
    itemName: '膳食纤维',
    quoteType: 'verbatim',
    quote:
      '高或富含膳食纤维或良好来源 ≥6 g/ 100 g（固体） ≥3 g/ 100 mL（液体）或 ≥3 g/ 420 kJ',
    plain: '「高 / 富含膳食纤维」：固体 ≥6 g/100 g，液体 ≥3 g/100 mL，或 ≥3 g/420 kJ。',
    conditions: [
      '阈值是「膳食纤维来源」的两倍，两条规则不能合并',
      '膳食纤维总量符合要求，或可溶性、不溶性、单体成分任一项符合要求',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-mineral': {
    id: 'gb2011-c1-mineral',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」矿物质（不包括钠）行',
    itemName: '矿物质（不包括钠）',
    quoteType: 'verbatim',
    quote:
      '×来源，或含有× 每 100 g 中 ≥15 % NRV 每 100 mL 中 ≥7.5 % NRV 或 每 420 kJ 中 ≥5 % NRV',
    plain:
      '矿物质「来源 / 含有」：固体 ≥15% NRV，液体 ≥7.5% NRV，或 ≥5% NRV/420 kJ。以钙（NRV 800 mg）计，即 ≥120 mg/100 g、≥60 mg/100 mL、≥40 mg/420 kJ。',
    conditions: [
      'NRV 取 GB 28050—2011 附录 A 表 A.1：钙 800 mg',
      '「高，或富含×」是另一行，要求 ≥30% / ≥15% / ≥10% NRV，不能与「来源」混用',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-mineral-high': {
    id: 'gb2011-c1-mineral-high',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」矿物质（不包括钠）行',
    itemName: '矿物质（不包括钠）',
    quoteType: 'verbatim',
    quote:
      '高，或富含× 每 100 g 中 ≥30 % NRV 每 100 mL 中 ≥15 % NRV 或 每 420 kJ 中 ≥10 % NRV',
    plain:
      '矿物质「高 / 富含」：固体 ≥30% NRV，液体 ≥15% NRV，或 ≥10% NRV/420 kJ。以钙（NRV 800 mg）计，即 ≥240 mg/100 g、≥120 mg/100 mL、≥80 mg/420 kJ。',
    conditions: [
      'NRV 取 GB 28050—2011 附录 A 表 A.1：钙 800 mg',
      '配料表出现「碳酸钙」等强化剂名称，不能替代营养成分表的钙含量数值',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-low-energy': {
    id: 'gb2011-c1-low-energy',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」能量行',
    itemName: '能量',
    quoteType: 'verbatim',
    quote: '低能量 ≤170 kJ/100 g 固体 ≤80 kJ/100 mL 液体',
    plain: '「低能量」：固体 ≤170 kJ/100 g，液体 ≤80 kJ/100 mL。',
    conditions: ['判定使用营养成分表的能量值，不用脂肪或糖的单项数值推算', '固体与液体阈值不同，不能混用'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-zero-energy': {
    id: 'gb2011-c1-zero-energy',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」能量行',
    itemName: '能量',
    quoteType: 'verbatim',
    quote: '无能量 ≤17 kJ/100 g（固体）或 100 mL（液体） 其中脂肪提供的能量≤总能量的 50%。',
    plain: '「无能量」除了能量 ≤17 kJ/100 g（或 100 mL），还附带「脂肪提供的能量不超过总能量 50%」的限制性条件。',
    conditions: [
      '两个条件都要满足，只看能量数值不足以判定',
      '脂肪供能比需要能量与脂肪两项数据；缺一项就属于「部分条件无法确认」',
      '「无能量」是按界限值标示，不等于数学意义上的绝对零能量',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c1-trans-fat': {
    id: 'gb2011-c1-trans-fat',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.1「能量和营养成分含量声称的要求和条件」脂肪行',
    itemName: '反式脂肪（酸）',
    quoteType: 'verbatim',
    quote: '无或不含反式脂肪酸 ≤0.3 g/100 g（固体）或 100 mL（液体）',
    plain: '「无或不含反式脂肪酸」的要求是 ≤0.3 g/100 g（固体）或 100 mL（液体），不是检测值必须为绝对零。',
    conditions: [
      '按 GB 28050—2011 第 4.4 条，配料含氢化或部分氢化油脂时应标示反式脂肪（酸）含量',
      '配料表出现氢化油脂，与成品反式脂肪酸标示「0」可以同时成立',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c2-synonym': {
    id: 'gb2011-c2-synonym',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.2「含量声称的同义语」及脚注 a',
    quoteType: 'verbatim',
    quote: '低 少、少油 a',
    plain: '「低」的同义语是「少」；「少油」只能用于低脂肪声称（脚注 a）。',
    conditions: ['同义语只改变措辞，不改变含量要求', '「少油」描述的是脂肪含量水平，不能据此推断生产时没有使用油脂'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-c3-comparison': {
    id: 'gb2011-c3-comparison',
    standard: 'GB28050-2011',
    clause: '附录 C 表 C.3「能量和营养成分比较声称的要求和条件」',
    quoteType: 'verbatim',
    quote: '减少糖 与参考食品比较，糖含量减少 25%以上',
    plain: '比较声称的通用要求是：与参考食品比较，相应指标减少（或增加）25% 以上。',
    conditions: [
      '表 C.3 同时列出了减少能量、减少脂肪、减少钠、增加或减少蛋白质等，条件均为 25% 以上',
      '参考食品（基准食品）应为消费者熟知、容易理解的同类或同一属类食品',
      '只有一个产品的标签数据时，无法核实比较对象，也就无法计算变化幅度',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-4-2': {
    id: 'gb2011-4-2',
    standard: 'GB28050-2011',
    clause: '第 4.2 条「强制标示内容」',
    quoteType: 'verbatim',
    quote:
      '对除能量和核心营养素外的其他营养成分进行营养声称或营养成分功能声称时，在营养成分表中还应标示出该营养成分的含量及其占营养素参考值（NRV）的百分比。',
    plain: '对非核心营养素做声称时应标示含量及 NRV%；但须同时适用第 4.5 条：糖等未规定 NRV 的成分仅需标示含量。',
    conditions: ['适用于按 GB 28050—2011 标示营养标签的预包装食品', '结合第 4.5 条使用：糖无规定 NRV，不应要求填写糖的 NRV%', '这是「声称时应标示」的要求，不是「必须声称」的要求'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-4-4': {
    id: 'gb2011-4-4',
    standard: 'GB28050-2011',
    clause: '第 4.4 条「强制标示内容」',
    quoteType: 'verbatim',
    quote:
      '食品配料含有或生产过程中使用了氢化和（或）部分氢化油脂时，在营养成分表中还应标示出反式脂肪（酸）的含量。',
    plain: '使用氢化或部分氢化油脂时，必须标示反式脂肪（酸）含量。',
    conditions: ['这是标示义务，不等于「只要用了氢化油就一定有反式脂肪酸超标」'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-5-2': {
    id: 'gb2011-5-2',
    standard: 'GB28050-2011',
    clause: '第 5.2 条「可选择标示内容」',
    quoteType: 'verbatim',
    quote:
      '当某营养成分含量标示值符合表 C.1 的含量要求和限制性条件时，可对该成分进行含量声称，声称方式见表 C.1。当某营养成分含量满足表 C.3 的要求和条件时，可对该成分进行比较声称，声称方式见表 C.3。',
    plain: '含量声称看表 C.1，比较声称看表 C.3，两套条件不能互相套用。',
    conditions: ['判定以「含量标示值」为准，不是以检测值或消费者食用量为准'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-6-1': {
    id: 'gb2011-6-1',
    standard: 'GB28050-2011',
    clause: '第 6.1 条「营养成分的表达方式」',
    quoteType: 'verbatim',
    quote:
      '预包装食品中能量和营养成分的含量应以每 100 克（g）和（或）每 100 毫升（mL）和（或）每份食品可食部中的具体数值来标示。当用份标示时，应标明每份食品的量。',
    plain: '营养含量可以按每 100 g、每 100 mL 或每份标示；按份标示时必须标明每份的量。',
    conditions: ['声称判定要用每 100 g 或每 100 mL 的口径，不能直接用每份数值', '每份标示但没标每份克重时，无法换算到每 100 g'],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2011-a1-nrv': {
    id: 'gb2011-a1-nrv',
    standard: 'GB28050-2011',
    clause: '附录 A 表 A.1「营养素参考值（NRV）」',
    quoteType: 'summary',
    quote: '表 A.1 中与本工具相关的 NRV：蛋白质 60 g、膳食纤维 25 g、钙 800 mg、钠 2000 mg、能量 8400 kJ。',
    plain: 'NRV 是计算 NRV% 与「高 / 来源」类声称的分母：蛋白质 60 g、膳食纤维 25 g、钙 800 mg、钠 2000 mg。',
    conditions: [
      '这是对表 A.1 的归纳摘录，不是连续原文',
      '这是 GB 28050—2011 的 NRV，不能与 GB 28050—2025 或其他版本的数值混用',
    ],
    sourceUrl: GB2011_PDF,
    verifiedAt: '2026-11-01',
  },

  // ================================================================
  // V2 新增：GB 28050—2025（仅用于解释与版本提示）
  // ================================================================
  'gb2025-2-3-energy-coeff': {
    id: 'gb2025-2-3-energy-coeff',
    standard: 'GB28050-2025',
    clause: '第 2.3 条「能量」',
    quoteType: 'verbatim',
    quote: '供能成分的能量换算系数分别为(kJ/g):蛋白质17、脂肪37、碳水化合物17。',
    plain: '蛋白质、脂肪、碳水化合物的能量换算系数分别是 17、37、17 kJ/g。',
    conditions: [
      '本工具只用「脂肪 37 kJ/g」估算脂肪供能比，用于核对「无能量」的附带条件',
      '换算系数不是声称阈值，声称阈值仍取自 GB 28050—2011 表 C.1',
    ],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },
  'gb2025-qa-mandatory': {
    id: 'gb2025-qa-mandatory',
    standard: 'GB28050-2025',
    clause: '官方问答（二）关于强制标示的能量和营养成分',
    quoteType: 'verbatim',
    quote:
      '预包装食品营养成分表中强制标示的内容包括能量、蛋白质、脂肪、饱和脂肪（或饱和脂肪酸）、碳水化合物、糖和钠的含量及其占营养素参考值百分比。',
    plain: '2027-03-16 起，糖成为强制标示项；在此之前，糖通常只在做了相关声称时才必须标示。',
    conditions: ['这是 GB 28050—2025 的要求，2027-03-16 起对新生产食品实施', '不能据此认定当前市售产品「没标糖」就是违规'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },
  'gb2025-qa-salt': {
    id: 'gb2025-qa-salt',
    standard: 'GB28050-2025',
    clause: '官方问答（三十二）关于营养标签的其他补充信息',
    quoteType: 'verbatim',
    quote: '描述钠含量时，允许使用“盐”字进行说明，1g盐相当于400mg钠。',
    plain: '1 g 食盐约相当于 400 mg 钠。钠含量与食盐质量不是同一个单位，不能直接互换数值。',
    conditions: ['这是换算说明，不是声称阈值', '「低盐」按钠声称判定，看的是成品钠含量'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },
  'gb2025-qa-hydrogenated': {
    id: 'gb2025-qa-hydrogenated',
    standard: 'GB28050-2025',
    clause: '官方问答（十）配料含氢化油但反式脂肪酸标示为「0」',
    quoteType: 'verbatim',
    quote:
      '当食品或其配料中氢化油和/或部分氢化油所占比例很小，或者植物油氢化比较完全，产生的反式脂肪酸含量很低时，终产品中反式脂肪酸含量低于“0”界限值，此时反式脂肪酸应标示为“0”。',
    plain: '配料里有氢化油、成品反式脂肪酸标「0」，两者可以同时成立，不能把配料名称直接换算成含量。',
    conditions: ['这是 2025 版问答的解释，与 2011 版表 1 的「0」界限值思路一致', '不能据此推断所有含氢化油的产品都合格'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },
  'gb2025-qa-comparison-ref': {
    id: 'gb2025-qa-comparison-ref',
    standard: 'GB28050-2025',
    clause: '官方问答（四十八）关于比较声称的参考食品',
    quoteType: 'verbatim',
    quote:
      '参考食品是指消费者熟知的、容易理解的同类或同一属类食品，为方便确定参考食品，其可包括两个来源，一是同一企业自身产品，二是《中国食物成分表》中食品。',
    plain: '比较声称必须有明确的参考食品，不能凭空假设比较对象。',
    conditions: ['这是 2025 版问答，2011 版表 C.3 对参考食品的要求一致（同类或同一属类）', '本工具不预设任何参考食品'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },
  'gb2025-qa-per-serving': {
    id: 'gb2025-qa-per-serving',
    standard: 'GB28050-2025',
    clause: '官方问答（四十五）按「份」标示营养成分含量时，含量声称的要求',
    quoteType: 'verbatim',
    quote: '含量声称不可以按“份”进行声称。',
    plain: '声称不能按「份」判定，必须回到每 100 g 或每 100 mL 的口径。',
    conditions: ['2011 版表 C.1 脚注 a 表达的是同一原则：用份标示时也要符合每 100 g（mL）的要求'],
    sourceUrl: GB2025_QA,
    verifiedAt: '2026-11-01',
  },

  // ================================================================
  // V2 新增：GB 7718—2025 与《食品标识监督管理办法》
  // ================================================================
  'gb7718-2025-4-4-1-1': {
    id: 'gb7718-2025-4-4-1-1',
    standard: 'GB7718-2025',
    clause: '第 4.4.1.1 条「配料强调与定量标示」',
    quoteType: 'verbatim',
    quote: '食品中的配料或成分若在食品名称中提及,应标示其相关配料或成分的添加量或在成品中的含量。',
    plain: '食品名称里提到的配料或成分，应标示其添加量或成品中的含量。',
    conditions: ['2027-03-16 起实施', 'A.5.4 列出了不属于特别强调、可免于定量标示的情形'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb7718-2025-4-4-2': {
    id: 'gb7718-2025-4-4-2',
    standard: 'GB7718-2025',
    clause: '第 4.4.2 条「配料强调与定量标示」',
    quoteType: 'verbatim',
    quote: '在食品的标签上特别强调一种或多种配料或成分的含量较低或无时,应标示所强调配料或成分在成品中的含量。',
    plain: '强调某种配料或成分「含量低」或「没有」时，要标示它在成品中的实际含量。',
    conditions: ['2027-03-16 起实施', '「不添加」「零添加」属于此类强调，因此也受定量标示要求约束'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb7718-2025-4-4-2-1': {
    id: 'gb7718-2025-4-4-2-1',
    standard: 'GB7718-2025',
    clause: '第 4.4.2.1 条「配料强调与定量标示」',
    quoteType: 'verbatim',
    quote:
      '使用“无”“不含”等词汇时,其相应配料或成分含量应为“0”,其他法律、法规或国家标准、行业标准、地方标准中另有规定的应从其规定。食品添加剂、污染物,以及法律、法规和标准中规定的不允许添加到食品中或不应存在于食品中的物质,不得使用“无”“不含”等词汇及其同义语进行声称。',
    plain:
      '「无 / 不含」要求对应成分含量为 0；对食品添加剂、污染物等，禁止使用「无」「不含」这类声称。',
    conditions: ['2027-03-16 起实施', '对营养成分的「无糖」「无脂肪」等，GB 28050 另有规定的从其规定'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb7718-2025-4-4-2-2': {
    id: 'gb7718-2025-4-4-2-2',
    standard: 'GB7718-2025',
    clause: '第 4.4.2.2 条「配料强调与定量标示」',
    quoteType: 'verbatim',
    quote:
      '不得使用“不添加”“不使用”及其同义语等词汇;其他法律、法规或食品安全国家标准中另有规定的应从其规定。“不添加”相关同义语见 A.5。',
    plain: '2027-03-16 起，预包装食品标签不得再使用「不添加」「不使用」及其同义语。',
    conditions: ['2027-03-16 起实施', '同义语范围见 A.5.3，包含「零添加」「无添加」「未添加」等'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb7718-2025-a-5-3': {
    id: 'gb7718-2025-a-5-3',
    standard: 'GB7718-2025',
    clause: '附录 A 的 A.5.3「含量声称同义语」',
    quoteType: 'verbatim',
    quote:
      '等同于“不添加”“不使用”的同义语:“未添加”“零添加”“无添加”“未使用”“没加”“没用”“没使”“没使用”“未用”以及与上述内容本质相同的用语。',
    plain: '「零添加」「无添加」「未添加」都属于「不添加」的同义语。',
    conditions: ['2027-03-16 起与第 4.4.2.2 条配合适用', '这是标签用语规则，不是营养成分含量阈值'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb7718-2025-effective': {
    id: 'gb7718-2025-effective',
    standard: 'GB7718-2025',
    clause: '标准封面与发布信息',
    quoteType: 'verbatim',
    quote: '2025-03-16发布 2027-03-16实施',
    plain: 'GB 7718—2025 于 2025-03-16 发布，2027-03-16 实施。',
    conditions: ['截至 2026-11，市售产品仍普遍按 GB 7718—2011 标示', '实施日期后生产的食品才适用新版要求'],
    sourceUrl: GB7718_2025_PDF,
    verifiedAt: '2026-11-01',
  },
  'gb2760-2024-functions': {
    id: 'gb2760-2024-functions',
    standard: 'GB2760-2024',
    clause: '附录 D 食品添加剂功能类别（D.1–D.23）',
    quoteType: 'verbatim',
    quote: 'D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。',
    plain: '「防腐剂」是功能类别名称，描述它「防止食品腐败变质、延长储存期」，本身不含安全性判断。',
    conditions: [
      '功能类别是中性描述，同一物质可能同时属于多个功能类别',
      '本工具只用它核对配料的功能归属，不据此判定产品是否合规',
      '「登记功能含防腐剂」不等于「在这款产品中被当作防腐剂使用」',
    ],
    sourceUrl: 'https://gb2760.cfsa.net.cn/func.html',
    verifiedAt: '2026-10-31',
  },
  'samr-100-art-7': {
    id: 'samr-100-art-7',
    standard: 'SAMR-100',
    clause: '第七条「食品标识禁止标注的内容」',
    quoteType: 'verbatim',
    quote:
      '食品标识不得标注下列内容:（一）涉及疾病预防、治疗功能;（二）以欺骗、误导、夸大等方式作虚假描述;（三）违背科学常识、有违公序良俗、宣扬封建迷信;',
    plain: '食品标识不得作虚假、误导或夸大的描述。',
    conditions: ['《食品标识监督管理办法》自 2027-03-16 起施行', '是否构成「误导」需要结合整体标签与监管认定，本工具不做判定'],
    sourceUrl: SAMR_100,
    verifiedAt: '2026-11-01',
  },
  'samr-100-art-54': {
    id: 'samr-100-art-54',
    standard: 'SAMR-100',
    clause: '第五十四条「施行日期」',
    quoteType: 'verbatim',
    quote: '本办法自2027年3月16日起施行。',
    plain: '《食品标识监督管理办法》自 2027-03-16 起施行。',
    conditions: ['晚于该日期生产、销售的食品才适用本办法'],
    sourceUrl: SAMR_100,
    verifiedAt: '2026-11-01',
  },
};

/** 取一条证据，找不到就返回 null（页面据此决定是否显示来源卡） */
export function getEvidence(id) {
  return EVIDENCE[id] || null;
}

export function resolveEvidence(ids = []) {
  return ids.map(getEvidence).filter(Boolean);
}
