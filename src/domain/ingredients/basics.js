/**
 * 基础配料知识层（V5.2 新增）。
 *
 * 为什么单独建一层：
 * 第四阶段的 9 个条目是为「成分解剖」写的，每条都有完整的误解、安全原则、
 * 局限分析。但真实配料表里出现最多的其实是水、小麦粉、白砂糖、植物油
 * 这类普通原料，以及二氧化碳、柠檬酸钠、食用香精这类高频添加剂。
 * 它们不需要那么重的分析，但**必须有解释**——否则用户点开就是「未收录」。
 *
 * 收录原则（比第四阶段更严格，因为这里更容易凭常识写）：
 * 1. 凡涉及「是不是食品添加剂」，必须有 GB 2760 的依据（K2/K3/K10/K11/K12）。
 * 2. 凡涉及具体功能类别，必须来自 CFSA 官方数据库条目，不凭印象。
 * 3. 「用途」类描述只在常识范围内表述（例如"水是饮料的主要成分"），
 *    并在 briefNote 里明确标注这是常识说明而非标准条文。
 * 4. 拿不到依据的内容宁可不写，也不补。
 *
 * verification 取值：
 *   'basics' —— 身份与分类有标准依据，用途描述为常识性说明。
 *   'partial' —— 部分内容待完善。
 */

import { CATEGORY_TYPES } from './knowledge.js';

/** 普通原料共用的两条依据：GB 2760 只规定添加剂，不在其列的就不是添加剂 */
const NOT_ADDITIVE_SOURCES = ['K2', 'K3'];

export const BASIC_INGREDIENTS = [
  // ============================================================ 水
  {
    id: 'water',
    canonicalName: '水',
    aliases: ['水', '饮用水', '纯净水', '水（饮用水）'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '水是最基础的食品原料之一，也是配料表里最常见的成分。',
      why: '在饮料里它占绝大部分体积，同时充当溶解糖、酸味剂、香精等成分的介质；在固体食品里它影响口感和保质期。',
      howToUnderstand:
        '配料表写着「水」不需要特别解读——它不属于食品添加剂，是食品本身的组成。你在家做饭也会加水，区别只是工厂会控制水质和用量。',
    },
    limits: '配料表不标注水的用量，也无法据此推算任何健康影响。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明，非标准条文原文。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 二氧化碳
  {
    id: 'carbon-dioxide',
    canonicalName: '二氧化碳',
    aliases: ['二氧化碳', '二氧化碳（充气）', '液体二氧化碳', 'carbon dioxide', 'E290', 'INS 290'],
    categoryType: 'additive',
    categoryLabel: '食品添加剂 · 防腐剂、其他',
    functions: ['防腐剂', '其他'],
    codes: { cns: '17.008', ins: '290' },
    brief: {
      what: '二氧化碳是 GB 2760-2024 中登记的食品添加剂，功能栏写的是「防腐剂、其他」。在碳酸饮料里，它的主要作用是产生气泡。',
      why: '溶解在饮料里形成气泡和刺激口感；同时它会把氧气挤走，抑制需要氧气的微生物生长——这就是它被登记为防腐剂的原因。',
      howToUnderstand:
        '它不是人为添加的「化学污染物」，而是发酵、燃烧都会产生的常见气体，你呼出的气里就有。开盖后气泡跑掉，是它从溶解状态逸出，属于物理现象。安全评价上，它属于毒性很低、无需规定具体数值上限的一类，但「无需规定数值」不等于「可以无限添加」——仍要按工艺需要控制用量。',
    },
    whatIsIt:
      'GB 2760-2024 中二氧化碳登记的功能是「防腐剂、其他」。JECFA 数据库中它的功能分类包括防腐剂、推进剂、冷冻剂、萃取溶剂（INS 290）。',
    whyUsed:
      '碳酸饮料靠它产生气泡和清凉的刺激感；同时它排挤氧气，抑制需氧微生物，这也是它被归入防腐剂的原因。在包装上，它也可能作为推进剂用于奶油喷罐等产品。',
    misconceptions: [
      {
        statement: 'JECFA 说二氧化碳「不需要规定摄入量」，说明可以随便喝、随便加。',
        correction:
          'JECFA 的原始结论是「ADI not specified」，指的是基于现有资料，无须为它规定一个以 mg/kg 体重表示的具体数值。JECFA 在定义这个术语时特别说明：采用「ADI not specified」正是为了替代更早的「ADI not limited（不限定摄入量）」；而且标注这一项的添加剂仍必须符合良好生产规范——工艺上确有效果、按最低有效量使用。所以它不是「没有限制」。',
        sourceIds: ['K13', 'K15'],
      },
      {
        statement: '既然功能栏写「防腐剂」，说明这瓶饮料里有防腐剂，不健康。',
        correction:
          '「防腐剂」是 GB 2760-2024 附录 D 的功能类别名称，描述的是「防止食品腐败变质、延长储存期」这个技术作用，本身不含安全性判断。二氧化碳在这里的实际角色主要是产生气泡，防腐是它同时具备的客观效果。',
        sourceIds: ['K2'],
      },
    ],
    safetyPrinciples:
      'JECFA 对二氧化碳的评价结论是 ADI not specified（未规定具体数值型 ADI），依据是其毒性很低。JECFA 同时明确：标有这一结论的添加剂仍须符合良好生产规范，包括使用应具有工艺必要性、按最低有效量使用、不得掩盖食品劣质或掺假。中国的具体使用范围按 GB 2760-2024 执行。',
    limits:
      '配料表只写「二氧化碳」，不写充气量。气足不足是口感问题，和安全性是两件事。本条不对任何具体产品做评价，也不推算任何摄入量。',
    sourceIds: ['K11', 'K13', 'K15', 'K2', 'K3'],
    verification: 'basics',
  },

  // ============================================================ 碳酸氢钠
  {
    id: 'sodium-bicarbonate',
    canonicalName: '碳酸氢钠',
    aliases: ['碳酸氢钠', '小苏打', '重碳酸钠', 'sodium bicarbonate', 'sodium hydrogen carbonate', 'E500(ii)', 'INS 500(ii)'],
    categoryType: 'additive',
    categoryLabel: '食品添加剂 · 膨松剂、酸度调节剂、稳定剂',
    functions: ['膨松剂', '酸度调节剂', '稳定剂'],
    codes: { cns: '06.001', ins: '500(ii)' },
    brief: {
      what: '碳酸氢钠就是日常说的小苏打。GB 2760-2024 登记的功能是「膨松剂、酸度调节剂、稳定剂」，CNS 06.001 / INS 500(ii)。',
      why: '在饼干、糕点这类焙烤食品里，它受热或遇酸会产生气体，让面团膨胀起来——这就是「膨松剂」的作用；它同时也能调节酸碱度。',
      howToUnderstand:
        '它被允许在饼干（07.03）、糕点（07.02）等多类食品中「按生产需要适量使用」，配料表不写用量，所以无法据此推算你吃了多少。「按生产需要适量使用」不等于可以无限添加，仍要按工艺需要、用最低有效量。',
    },
    whatIsIt:
      'GB 2760-2024 中，碳酸氢钠（sodium hydrogen carbonate）的 CNS 号是 06.001，INS 号 500(ii)，登记功能为「膨松剂、酸度调节剂、稳定剂」三项。它不在「抗结剂」的功能类别下。',
    whyUsed:
      '作为膨松剂，它在加热或与酸反应时释放二氧化碳，使面团膨胀、形成疏松结构，这是饼干、糕点、发酵面制品中最常见的用途。作为酸度调节剂，它可以中和过酸的体系。作为稳定剂，它有助于维持体系的稳定。具体到某一款产品实际起哪种作用，取决于配方和工艺。',
    misconceptions: [
      {
        statement: '碳酸氢钠也可以当抗结剂用。',
        correction:
          'GB 2760-2024 里碳酸氢钠登记的功能只有膨松剂、酸度调节剂、稳定剂三项，没有抗结剂。抗结剂是另一个功能类别，被登记为抗结剂的是另外一些物质（例如微晶纤维素、二氧化硅）。「某种物质在某处能起类似作用」和「标准给它登记了这个功能」是两件事，不能混着说。',
        sourceIds: ['K14', 'K2'],
      },
      {
        statement: '既然饼干里加了小苏打，那它一定只是用来膨松的。',
        correction:
          '标准列出的是这个物质允许使用的功能范围，不等于每一款产品都用上了全部功能。要看它在具体产品里实际起什么作用，需要配方和工艺信息，而这不在配料表上。',
        sourceIds: ['K14'],
      },
    ],
    safetyPrinciples:
      'GB 2760-2024 要求食品添加剂使用不得危害人体健康、不得掩盖食品腐败变质、在达到预期效果的前提下尽可能降低用量。碳酸氢钠在饼干（07.03）、糕点（07.02）等类别中按生产需要适量使用——属于不设统一数值上限的品种，但仍受这些基本要求约束，并非可以无限添加。',
    limits:
      '配料表只写「碳酸氢钠」，不写用量，也不说明它在配方里实际承担哪种作用。因此无法据此推算摄入量，也无法判断某款产品的具体用法。本条不对任何具体产品做评价。',
    sourceIds: ['K14', 'K2', 'K3'],
    verification: 'basics',
  },

  // ============================================================ 柠檬酸钠
  {
    id: 'sodium-citrate',
    canonicalName: '柠檬酸钠',
    aliases: ['柠檬酸钠', '枸橼酸钠', 'sodium citrate', 'E331', 'INS 331'],
    categoryType: 'additive',
    categoryLabel: '食品添加剂 · 酸度调节剂、稳定剂',
    functions: ['酸度调节剂', '稳定剂'],
    codes: { cns: '01.303', ins: '331(iii)' },
    brief: {
      what: 'GB 2760-2024 中柠檬酸钠登记的功能是「酸度调节剂、稳定剂」，CNS 01.303 / INS 331(iii)。',
      why: '用来把食品的酸碱度调到合适范围，也能让体系更稳定。在饮料里它常和柠檬酸搭配，起缓冲作用，让酸味不那么刺口。',
      howToUnderstand:
        '它属于「按生产需要适量使用」的品种——标准没有给它设统一的数值上限，但仍然受 GB 2760 第 1.1 条约束（不得危害健康、尽可能降低用量）。名字里的「钠」不等于食盐，用量和食盐不在一个量级。',
    },
    limits: '配料表不提供实际添加量，也无法据此推算钠的摄入贡献。',
    sourceIds: ['K12', 'K2', 'K3'],
    verification: 'basics',
  },

  // ============================================================ 食用香精
  {
    id: 'flavoring',
    canonicalName: '食用香精',
    aliases: ['食用香精', '食品用香精', '食用香料', '食品用香料', '香精', '食用香精香料'],
    categoryType: 'additive',
    categoryLabel: '食品添加剂 · 食品用香料',
    functions: ['食品用香料'],
    codes: {},
    brief: {
      what: '食品用香料、香精在 GB 2760-2024 里单独管理（附录 B），标准写明其目的是「使食品产生、改变或提高食品的风味」。',
      why: '补充或还原食品的香气。配料表通常直接写「食用香精」，不会展开具体用了哪些香料品种。',
      howToUnderstand:
        '标准允许「按生产需要适量使用」，但同时规定：没有加香必要的食品不得添加。因为配料表只写「食用香精」而不列具体香料，所以从标签上无法得知用了哪些香料——这是标签规则允许的简化，不代表有问题。',
    },
    limits:
      '具体香料品种和用量都不在配料表上，因此无法据此判断这款产品用了什么、用了多少。',
    sourceIds: ['K10', 'K2', 'K3'],
    verification: 'basics',
  },

  // ============================================================ 小麦粉
  {
    id: 'wheat-flour',
    canonicalName: '小麦粉',
    aliases: ['小麦粉', '面粉', '小麦面粉', 'wheat flour'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '小麦粉是小麦磨成的粉，属于普通食品原料，不是食品添加剂。',
      why: '它是饼干、面包、面条这类食品的主体原料，提供结构、口感和大部分碳水化合物。',
      howToUnderstand:
        '它在配料表里排第一位通常意味着用量最多——配料表按加入量递减排序。名字里没有「添加剂」字样，它也确实不在 GB 2760 的管理范围内。',
    },
    limits: '配料表只给顺序不给用量，无法推算具体摄入了多少。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 燕麦片
  {
    id: 'oats',
    canonicalName: '燕麦片',
    aliases: ['燕麦片', '燕麦', 'oat', 'oats', 'rolled oats'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '燕麦片是燕麦经过清理、压片等处理得到的谷物制品，属于普通食品原料。',
      why: '在饼干、麦片、代餐里提供谷物口感、膳食纤维和部分蛋白质。',
      howToUnderstand:
        '它是谷物本身，不是添加剂。配料表里出现「燕麦片」和出现「燕麦纤维」不是一回事——后者是提取出来的成分，前者是整粒谷物加工品。',
    },
    limits: '配料表不标注用量，也不提供膳食纤维的具体数值（那要看营养成分表）。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 白砂糖
  {
    id: 'white-sugar',
    canonicalName: '白砂糖',
    aliases: ['白砂糖', '砂糖', '绵白糖', '白糖', 'white sugar'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '白砂糖是以甘蔗或甜菜为原料制得的糖，属于普通食品原料，不是食品添加剂。',
      why: '提供甜味，同时在烘焙里影响上色、口感和保质期。',
      howToUnderstand:
        '它属于「糖」——营养标签上「糖」这一项就包含它。所以看到配料表有白砂糖，可以去看营养成分表的「糖」是多少。注意：白砂糖不是食品添加剂，把它和甜味剂混为一谈是常见误读。',
    },
    limits:
      '配料表不标注加了多少糖。具体含量要看营养成分表的「糖」，如果标签没标糖，就无法确认总糖含量。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 植物油
  {
    id: 'vegetable-oil',
    canonicalName: '植物油',
    aliases: ['植物油', '食用植物油', '精炼植物油', '大豆油', '菜籽油', '棕榈油', 'vegetable oil'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '植物油是从油料作物中提取的油脂，属于普通食品原料，不是食品添加剂。',
      why: '在饼干、糕点里提供酥脆口感，在饮料里可能作为脂溶性成分的载体。',
      howToUnderstand:
        '它贡献的是营养成分表里的「脂肪」。配料表写「植物油」而不写具体品种是允许的简化写法，所以从标签上看不出用的是大豆油还是棕榈油。',
    },
    limits: '具体油种和用量都不在标签上，无法据此判断脂肪酸构成。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 鸡蛋
  {
    id: 'egg',
    canonicalName: '鸡蛋',
    aliases: ['鸡蛋', '鲜鸡蛋', '全蛋液', '鸡蛋液', '蛋液', 'egg'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '鸡蛋是禽蛋类食品原料，属于普通食品原料，不是食品添加剂。',
      why: '在饼干、糕点里提供结构、水分和风味，蛋黄中的卵磷脂还有乳化作用。',
      howToUnderstand:
        '它同时是常见的过敏原。如果包装上有过敏原提示，通常会把蛋类列进去——这是给敏感人群看的，不是安全警告。',
    },
    limits: '配料表不标注用量。对蛋类过敏的人应看包装上的过敏原提示。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 食用盐
  {
    id: 'salt',
    canonicalName: '食用盐',
    aliases: ['食用盐', '食盐', '精盐', '盐', 'table salt'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '食用盐主要成分是氯化钠，属于普通食品原料和调味料，不是食品添加剂。',
      why: '提供咸味、增强风味，在烘焙里还能强化面筋结构。',
      howToUnderstand:
        '它对应营养成分表里的「钠」。想控制钠摄入，看营养标签的钠含量比看配料表有用得多——配料表只给顺序不给数值。',
    },
    limits: '配料表不标注用量。钠的具体数值在营养成分表里，不在配料表里。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 生牛乳
  {
    id: 'raw-milk',
    canonicalName: '生牛乳',
    aliases: ['生牛乳', '生鲜乳', '牛乳', '鲜牛奶', '牛奶', 'raw milk'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '生牛乳是奶牛分泌的乳汁，是乳制品的主要原料，属于普通食品原料。',
      why: '提供蛋白质、脂肪和乳糖，也是酸奶发酵的基质。',
      howToUnderstand:
        '它对应营养成分表里的蛋白质和脂肪。配料表写「生牛乳」通常说明这是以乳为原料的产品，而不是用乳粉复原的——但这一点要以产品标示为准。',
    },
    limits: '配料表不标注用量，也不说明是否为复原乳。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 乳酸菌
  {
    id: 'lactic-culture',
    canonicalName: '乳酸菌',
    aliases: [
      '乳酸菌',
      '乳酸菌（保加利亚乳杆菌、嗜热链球菌）',
      '保加利亚乳杆菌',
      '嗜热链球菌',
      '乳酸菌培养物',
      'lactic acid bacteria',
    ],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料 · 发酵菌种',
    functions: [],
    codes: {},
    brief: {
      what: '这里列出的保加利亚乳杆菌、嗜热链球菌是酸奶发酵常用的乳酸菌菌种，属于食品用菌种，不是食品添加剂。',
      why: '它们把牛奶里的乳糖发酵成乳酸，让牛奶凝固变稠、产生酸味——这就是酸奶形成的基本过程。',
      howToUnderstand:
        '配料表列出菌种名称，不等于标注了活菌数量。想知道活菌多少，要看包装上是否单独标注了活菌数（通常以 CFU 计）。发酵完成后菌还在不在、有多少，标签不一定告诉你。',
    },
    limits:
      '配料表只列菌种名称，不提供活菌数量，也不说明发酵后是否经过杀菌处理。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },

  // ============================================================ 竹笋
  {
    id: 'bamboo-shoot',
    canonicalName: '竹笋',
    aliases: ['竹笋', '笋', '春笋', '冬笋', '毛笋', '竹笋（鲜）', 'bamboo shoot'],
    categoryType: 'food_ingredient',
    categoryLabel: '普通食品配料',
    functions: [],
    codes: {},
    brief: {
      what: '竹笋是竹类植物可食用的嫩芽，属于普通食材，不是食品添加剂。',
      why: '这类食品通常直接用竹笋本身的脆嫩质地和清淡风味，经过腌制、调味后做成即食产品。',
      howToUnderstand:
        '配料表写「竹笋」，说明它是这款食品的主要原料之一。它和「食品添加剂」是两类不同的东西；具体用了多少、怎么加工，要看包装上的其他信息。',
    },
    limits: '配料表不标注竹笋的用量，也不说明品种、产地或腌制工艺。',
    sourceIds: NOT_ADDITIVE_SOURCES,
    verification: 'basics',
    verificationNote: '身份判断有标准依据；用途描述属于常识性说明。',
    briefNote: '用途为常识说明',
  },
];

export { CATEGORY_TYPES };
