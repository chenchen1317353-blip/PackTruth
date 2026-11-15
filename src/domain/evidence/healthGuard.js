/**
 * 健康信息的证据分层与科学检查（V2.3，纯函数，不联网）。
 *
 * 解决的问题：
 * 成分卡过去只解释「它是什么、为什么在食品里」，用户最关心的
 * 「正常吃要不要担心 / 吃多了会怎样 / 谁需要特别注意」没有被单独结构化，
 * 于是模型容易把这些混在一段话里，或者干脆用「有国家标准」代替健康结论。
 *
 * 这个模块只做两件事：
 *   1. 把模型给出的 healthInsights 逐条对齐到「真实存在的来源编号」；
 *   2. 用确定性规则拦住健康类结论里最常见的越界写法。
 *
 * ============ 能力边界（必须保留）============
 * - 未触发规则 ≠ 医学上正确，只等于「没有命中已知错误模式」。
 * - 本模块不提供诊断、治疗或个体化饮食建议。
 * - 结论仍然要求用户能追溯到具体来源。
 * ============================================
 */

import { CHECK_STATUS } from './scientificGuard.js';
import { SUBSTANCE_ALIASES } from '../ingredients/aliasSeeds.js';
import {
  ANSWER_KIND,
  ANSWER_KIND_LABELS,
  answersQuestion,
  isAnimalEvidence,
  isHeadlineEligible,
  judgeAnswerKind,
  isTechnicalOnly,
} from './healthAnswer.js';

/** 证据状态：从强到弱 */
export const HEALTH_STATUS = {
  AUTHORITATIVE: 'authoritative', // 权威风险评估直接支持
  SUPPORTED: 'supported', // 可靠资料支持的一般结论
  CONDITIONAL: 'conditional', // 只在特定条件下成立
  INSUFFICIENT: 'insufficient', // 资料不足，不下结论
};

export const HEALTH_STATUS_LABELS = {
  authoritative: '权威评估直接支持',
  supported: '可靠资料支持',
  conditional: '仅在特定条件下成立',
  insufficient: '资料不足',
};

/**
 * 健康槽位（V2.3 返工）。
 *
 * practicalTakeaway 更名为 consumerTakeaway：它必须回答「消费者读完最该知道什么」，
 * 而不是「最值得知道的健康结论」这种可以被 ADI 数字填满的占位。
 * 旧字段仍然接受（仅作为输入别名），输出统一用新名字。
 */
export const HEALTH_SLOTS = [
  'consumerTakeaway',
  'normalIntake',
  'highIntake',
  'sensitiveGroups',
];

/** 证据类型：只允许这几种，避免模型写「大概算人体研究」 */
export const STUDY_TYPES = ['human', 'animal', 'in_vitro', 'assessment', 'reference', 'none'];
export const EVIDENCE_BASES = ['direct', 'constituent', 'group', 'analog'];

/** 产品评测式判断：不能出现在健康结论或「对这款食品」里 */
const PRODUCT_JUDGMENT =
  /(?:这款(?:食品|产品)?|这包(?:食品)?|本产品|该产品|这个产品)(?:是|很|非常|肯定|一定|绝对|属于)?(?:健康|不健康|有害|无害|安全|放心|值得买|不值得)/;

/** 用产品语境 + 含量数字推算实际含量；不能误伤「每天少于 5 g 食盐」这类膳食建议 */
const PRODUCT_AMOUNT_GUESS =
  /(?:这款|这包|本产品|该产品|这个产品|配料表)[^。；]{0,24}(?:含|添加|用了|相当于)[^。；]{0,12}\d+(?:\.\d+)?\s*(?:mg|g|克|毫克|%|毫升|ml)/i;

export const HEALTH_SLOT_LABELS = {
  consumerTakeaway: '最值得知道的一句',
  normalIntake: '正常食用',
  highIntake: '摄入过多',
  sensitiveGroups: '需要特别注意的人',
};

const VALID_STATUS = new Set(Object.values(HEALTH_STATUS));

// ---------------------------------------------------------------- 规则表

/** 无条件安全保证 */
const ABSOLUTE_SAFE =
  /(绝对安全|完全安全|百分之百安全|100%\s*安全|绝对无害|完全无害|可以放心吃|不会有任何(风险|危害|问题)|没有任何(健康)?风险|不可能有害)/;

/** 把 ADI 当成中毒阈值 */
const ADI_AS_POISON =
  /(超过|超出|高于|突破)[^。；，]{0,14}(ADI|每日允许摄入量)[^。；，]{0,18}(中毒|有害|致病|死亡|伤身|危险)/;

/** 把「ADI 无需规定」当成可以无限量 */
const ADI_NOT_SPECIFIED =
  /(无需规定|无须规定|不需要规定|未规定|没有规定|未限定|not specified|not limited)/i;
const UNLIMITED_CLAIM = /(无限量|任意添加|随便吃|不受限制|想吃多少|想加多少|多多益善)/;

/** 动物 / 体外实验 */
const ANIMAL_STUDY = /(大鼠|小鼠|豚鼠|动物实验|动物研究|体外实验|细胞实验|高剂量灌胃)/;
/** 人 / 日常摄入情境 */
const HUMAN_CONTEXT = /(人体|人群|普通人|正常人|正常人|人们|消费者|正常食用|日常摄入|日常食用)/;
/** 危害动词 */
const RISK_CLAIM = /(会|可能|容易|导致)[^。；，]{0,8}(致癌|中毒|损伤|损害|致病|肝损伤|肾损伤|不孕)/;

/** 浓原液的危险描述 */
const CORROSIVE = /(腐蚀|灼伤|烧伤|强酸灼)/;
/** 摄入语境 */
const INGEST_CONTEXT = /(吃|食用|摄入|喝|这款|这包|本产品)/;

/** 需要来源点名的特殊人群 / 疾病 */
const GROUP_TERMS = [
  '苯丙酮尿症',
  '孕妇',
  '乳母',
  '婴幼儿',
  '婴儿',
  '儿童',
  '老年人',
  '肾病',
  '肾功能',
  '糖尿病',
  '高血压',
  '痛风',
  '过敏',
  '不耐受',
];

/** 标准里的折算系数 / 使用比例被当成健康风险指标 */
const COEFFICIENT_AS_RISK =
  /(折算系数|换算系数|使用比例|配比)[^。；，]{0,16}(风险|危害|安全|毒性|致癌)/;

/** 无来源支持的毒性/致癌断言（「毒理学」是学科名，不是毒性断言） */
const TOXIC_CLAIM = /(有毒(?!理学)|剧毒|致癌|致畸|致突变|伤肝|伤肾)/;
/** 用配料表推出「每天最多吃几包」 */
const PACK_LIMIT =
  /每天(最多|不要超过|不能超过|别超过)[^。；，]{0,8}(包|袋|瓶|罐|根|片|克|毫升)/;

/** 把整款食品的问题算到某个成分头上 */
const WHOLE_FOOD_ATTRIBUTION =
  /(这款|这包|本产品|该产品|这个产品)[^。；，]{0,12}(钠|盐|糖|脂肪)[^。；，]{0,8}(高|超标|过多|偏低)/;

/** 用法规事实（有标准 / 符合标准）冒充健康结论 */
const REGULATION_AS_HEALTH =
  /(国家标准|国标|GB\s?\d[\d.]*|标准规定|按标准|符合标准|2760|允许使用)[^。；]{0,18}(所以|因此|说明|意味着|可见|就)[^。；]{0,14}(安全|没问题|放心|无害|可以吃|不必担心|不用怕)/;

/**
 * 找出「没有被否定的」命中。
 * 「不能保证绝对安全」「不等于可以无限量」这类正确写法必须放行，
 * 否则检查器会把科普否定句当成错误结论。
 */
const NEGATION_BEFORE = /(不能|不可|不应|不等于|不代表|并非|并没有|不要|别|勿|不)/;

function hasAffirmedMatch(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const g = new RegExp(re.source, flags);
  let m;
  while ((m = g.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 10), m.index);
    if (!NEGATION_BEFORE.test(before)) return true;
    if (m.index === g.lastIndex) g.lastIndex += 1;
  }
  return false;
}

/**
 * 常见添加剂的同物异名（中英对照）。
 *
 * 只用于「这句话说的到底是不是同一个物质」的匹配，不携带任何健康结论。
 * 没有收录的名称不影响使用：匹配不上时按「证据没提到它」处理。
 *
 * V2.3 验收修复：表体移到 `src/domain/ingredients/aliasSeeds.js`，
 * 由检索层与检查层共用同一份数据 —— 否则「检索用一套名字、校验用另一套」，
 * 会出现检索到了英文资料、却被校验判成「资料里没有提到这个成分」。
 */
const MATCH_ONLY_ALIASES = {
  谷氨酸钠: ['msg'],
  '天门冬酰苯丙氨酸甲酯乙酰磺胺酸': ['e962'],
  安赛蜜: ['乙酰磺胺酸钾'],
  三氯蔗糖: ['蔗糖素'],
};

const BILINGUAL_ALIASES = {
  ...Object.fromEntries(Object.entries(SUBSTANCE_ALIASES).map(([zh, v]) => [zh, [...v.en]])),
  ...MATCH_ONLY_ALIASES,
};

/** 所有已知名称（用于判断「证据其实在讲另一个物质」） */
const ALL_SUBSTANCE_TOKENS = Object.entries(BILINGUAL_ALIASES).flatMap(([zh, en]) => [
  zh,
  ...en,
]);

function namesOf(ingredientName, aliases = []) {
  const extra = BILINGUAL_ALIASES[String(ingredientName || '').trim()] || [];
  return [ingredientName, ...aliases, ...extra]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 2);
}

function evidenceText(ev) {
  return `${ev?.title || ''}\n${ev?.excerpt || ''}`;
}

function mentionsIngredient(citedEvidence, names) {
  const pool = citedEvidence.map(evidenceText).join('\n').toLowerCase();
  return names.some((n) => pool.includes(n.toLowerCase()));
}

/**
 * 人群/疾病的同义写法（中英对照）。
 * 判定标准不变：来源里必须明确出现这个人群，只是允许英文表述。
 */
const GROUP_ALIASES = {
  苯丙酮尿症: ['phenylketonuria', 'pku', 'phenylalanine'],
  孕妇: ['pregnan', 'pregnancy'],
  乳母: ['breastfeeding', 'lactating'],
  婴幼儿: ['infant', 'baby', 'babies'],
  婴儿: ['infant', 'baby'],
  儿童: ['children', 'child'],
  老年人: ['elderly', 'older adults'],
  肾病: ['kidney disease', 'renal disease', 'renal failure'],
  肾功能: ['renal function', 'kidney function'],
  糖尿病: ['diabet'],
  高血压: ['hypertension', 'high blood pressure'],
  痛风: ['gout'],
  过敏: ['allerg', 'anaphyla', 'hypersensitiv'],
  不耐受: ['intoleran'],
};

function evidenceMentionsGroup(citedEvidence, group) {
  const pool = citedEvidence.map(evidenceText).join('\n').toLowerCase();
  if (pool.includes(group.toLowerCase())) return true;
  const aliases = GROUP_ALIASES[group] || [];
  return aliases.some((a) => pool.includes(a));
}

/**
 * 检查一条健康结论是否越界。
 *
 * @param {string} text
 * @param {{ ingredientName?:string, aliases?:string[], citedEvidence?:Array }} ctx
 * @returns {{ status: string, issues: Array<{level:string, rule:string, why:string}> }}
 */
export function checkHealthClaim(
  text,
  { ingredientName = '', aliases = [], citedEvidence = [], conditions = '', semanticChecked = false } = {},
) {
  const t = String(text || '');
  const issues = [];
  const names = namesOf(ingredientName, aliases);

  const push = (why, rule = 'H', level = CHECK_STATUS.REJECT) =>
    issues.push({ level, rule, why });

  // H1 无条件安全保证
  if (hasAffirmedMatch(t, ABSOLUTE_SAFE)) {
    push('把「有资料支持」写成了无条件安全保证');
  }

  // H2 ADI 当成中毒阈值
  if (hasAffirmedMatch(t, ADI_AS_POISON)) {
    push('把 ADI 描述成超过就会中毒的阈值；ADI 是长期摄入参考值，不是急性中毒线');
  }

  // H3 ADI 未规定当成无限量（两半句都成立才算，顺序不限）
  if (ADI_NOT_SPECIFIED.test(t) && hasAffirmedMatch(t, UNLIMITED_CLAIM)) {
    push('把「ADI 无需规定」解释成可以无限量摄入');
  }

  // H4 动物 / 体外结果直接推到人
  if (ANIMAL_STUDY.test(t) && HUMAN_CONTEXT.test(t) && hasAffirmedMatch(t, RISK_CLAIM)) {
    push('把动物或体外高剂量结果直接写成人体正常食用后的后果');
  }

  // H5 浓原液的腐蚀性套到食品摄入情境
  if (hasAffirmedMatch(t, CORROSIVE) && INGEST_CONTEXT.test(t)) {
    push('把浓原液的腐蚀性写成食用这款食品的后果');
  }

  // H6 特殊人群必须有来源点名
  for (const g of GROUP_TERMS) {
    if (!t.includes(g) || /(?:未|没有|尚无)[^。；]{0,30}(?:证据|资料|研究)/.test(t) && !/(?:患者|人群).{0,8}(?:应|需要|避免)/.test(t)) continue;
    if (!evidenceMentionsGroup(citedEvidence, g)) {
      push(`结论提到「${g}」，但引用的资料里没有出现这个人群/疾病`);
    }
  }

  // H10 毒性/致癌断言必须有资料直接支持
  if (hasAffirmedMatch(t, TOXIC_CLAIM)) {
    const pool = citedEvidence.map(evidenceText).join('\n');
    if (!TOXIC_CLAIM.test(pool) && !/carcinogen|genotoxic|mutagen|toxic/i.test(pool)) {
      push('结论写了有毒/致癌一类的判断，但引用的资料里没有这样的结论');
    }
  }

  // H11 不能只凭配料表算出「每天最多吃几包」
  if (PACK_LIMIT.test(t)) {
    push('用配料表推算「每天最多吃多少」，而标签没有给出实际含量');
  }

  // H9 标准里的折算系数不是健康风险指标
  if (hasAffirmedMatch(t, COEFFICIENT_AS_RISK)) {
    push('把标准里的折算系数/使用比例说成健康风险指标');
  }

  // H7 整款食品的问题不能归因到单一成分
  if (WHOLE_FOOD_ATTRIBUTION.test(t)) {
    const isSodiumLike = /钠|盐/.test(ingredientName);
    if (!isSodiumLike) {
      push('把整款食品的钠/糖/脂肪问题归因到当前这个成分');
    }
  }

  // H12 法规事实 ≠ 健康结论
  //
  // 「GB 2760 允许使用」只说明使用范围，不能推出「所以吃进去没问题」。
  // 这是本版用户最常看到的一类偷换，必须单独拦。
  if (hasAffirmedMatch(t, REGULATION_AS_HEALTH)) {
    push('用「有国家标准 / 符合标准」推出健康上的安全结论；法规允许使用不等于健康风险评估结论');
  }

  // H13 「无危害」必须有作用域，不能写成任何摄入量都成立
  //
  // ADI「无需规定」只说明不必设数值型 ADI，不等于「无论吃多少都没事」。
  // 允许的写法必须带条件（在××用途/摄入水平下、所评估的范围内……）。
  if (hasAffirmedMatch(t, NO_HAZARD_CLAIM) && !SCOPE_QUALIFIER.test(`${t} ${conditions || ''}`)) {
    push('下了「没有危害」的结论，但没有写明适用范围或摄入条件');
  }

  if (hasAffirmedMatch(t, UNCONDITIONAL_SAFE)) {
    push('把结论扩大成「无论摄入多少都成立」');
  }

  // H14 健康结论不能变成产品评测
  if (PRODUCT_JUDGMENT.test(t)) {
    push('把健康证据写成了对这款具体产品的判断；资料没有检测这款产品，不能下这种结论');
  }

  // H15 不能从资料里的含量数字反推这款产品
  if (PRODUCT_AMOUNT_GUESS.test(t) && !/(?:研究|试验|受试者|剂量|染毒|饲料|饮水)/.test(t)) {
    push('把研究/资料里的含量数字写成了这款产品的实际含量');
  }

  // H8 引用的资料必须真的提到这个成分
  //
  // 两种拒绝情形：
  //   a) 资料里出现了另一个已知物质（说明引错了条目）；
  //   b) 资料里既没有这个成分，也没有任何已知物质名（无法确认在讲它）。
  // 用同物异名表兜住中英对照（如 阿斯巴甜 / aspartame），避免把正确结论误杀。
  if (!semanticChecked && citedEvidence.length > 0 && names.length > 0 && !mentionsIngredient(citedEvidence, names) && !citedEvidence.some(e => e.substanceMatch?.allowsDirectClaim)) {
    const pool = citedEvidence.map(evidenceText).join('\n').toLowerCase();
    const lowerNames = names.map((n) => n.toLowerCase());
    const otherHit = ALL_SUBSTANCE_TOKENS.some(
      (tok) =>
        tok.length >= 3 &&
        pool.includes(tok.toLowerCase()) &&
        !lowerNames.some((n) => tok.toLowerCase().includes(n) || n.includes(tok.toLowerCase())),
    );
    push(
      otherHit
        ? '引用的资料讲的是另一个物质，不能套用到当前成分'
        : '引用的资料里没有提到这个成分，无法确认结论针对它',
    );
  }

  const status = issues.some((i) => i.level === CHECK_STATUS.REJECT)
    ? CHECK_STATUS.REJECT
    : CHECK_STATUS.PASS;
  return { status, issues };
}

/**
 * 原文摘句的归一化：只抹掉排版差异，不改字。
 * 全角/半角标点、空格、引号差异不该导致「摘句找不到」，
 * 但同义词替换、语序调整必须被判定为「找不到」。
 */
export function normalizeQuote(text) {
  return String(text || '')
    .replace(/[\s\u00a0\u3000]+/g, '')
    .replace(/[，,。.；;：:、·—–\-_/\\()（）【】\[\]“”‘’"'']/g, '')
    .toLowerCase();
}

/** INS / CNS / GB / E 编号里的数字不参与「数值是否有依据」的核对 */
const IDENTIFIER_RE = /\b(?:INS|CNS|GB\s?\/?\s?T?|E)\s?\d[\w()./\-]*/gi;

/** 把 2 000 / 2,000 这类千位分隔统一成 2000，避免「原文有、系统说找不到」 */
function normalizeThousands(text) {
  let s = String(text || '');
  for (let i = 0; i < 3; i += 1) {
    s = s.replace(/(\d)[ \u00a0,](\d{3})(?!\d)/g, '$1$2');
  }
  return s;
}

/** 抽出结论里出现的数值（去掉标准编号后） */
export function extractNumbers(text) {
  const cleaned = normalizeThousands(String(text || '').replace(IDENTIFIER_RE, ' '));
  const out = [];
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) out.push(m[0]);
  return [...new Set(out)];
}

function containsNumber(haystack, num) {
  const hay = normalizeThousands(haystack);
  const re = new RegExp(`(?<![0-9.])${String(num).replace('.', '\\.')}(?![0-9])`);
  return re.test(hay);
}

/**
 * 核对「这条结论引用的原文摘句，是否真的出现在它引用的来源里」。
 *
 * 这是本版最重要的一条闸门：模型说「JECFA 在 1983 年把 ADI 定为 0–15 mg/kg 体重」，
 * 必须能在它引用的 W1 正文里逐字找到对应的一句。找不到就说明这句话
 * 可能来自模型记忆、另一篇文献，或者干脆是编的 —— 一律不进卡片。
 *
 * 只做字面核对，不做语义推断：字面找不到 ≠ 结论一定错，
 * 但程序无法确认，就按「不能确认」处理（保守降级/拒绝，而不是假装核对过）。
 *
 * @returns {{ ok: boolean, evidenceId?: string, evidence?: object, reason?: string }}
 */
export function verifyQuoteSupport(quote, citedEvidence = []) {
  const q = normalizeQuote(quote);
  if (q.length < 8) {
    return { ok: false, reason: '原文摘句太短，无法核对是否真的支持这句结论' };
  }
  for (const ev of citedEvidence) {
    const hay = normalizeQuote(`${ev?.title || ''}\n${ev?.excerpt || ''}`);
    if (hay.includes(q)) return { ok: true, evidenceId: ev.id, evidence: ev };
  }
  return { ok: false, reason: '引用的原文摘句没有出现在所引来源里' };
}

/** 机构是否为「正式风险评估机构」——决定能不能标 authoritative */
/**
 * 通用术语表 / 定义页：只能解释术语，不能单独证明某个物质的安全结论。
 *
 * 典型：FAO/WHO 术语表（ANNEX 4 GLOSSARY）、WHO 风险评估方法附件。
 * 这些页面会出现 "ADI not specified" 的定义，但定义里的 "very low toxicity"
 * 描述的是**这一类物质的判定标准**，不是对当前物质的评估结论。
 */
const TERMINOLOGY_SOURCE_RE =
  /(术语|glossary|definitions?|annex\s*4|fos\/annex1|x1791e|方法学|methodolog)/i;

export function isTerminologySource(source) {
  if (!source) return false;
  const hay = `${source.title || ''} ${source.url || ''}`;
  return TERMINOLOGY_SOURCE_RE.test(hay);
}

/** 「没有危害 / 没有风险」这类绝对化表述 */
const NO_HAZARD_CLAIM =
  /(不构成|没有|无|不会有|不存在)[^。；，]{0,8}(健康)?(危害|风险|安全(担忧|关切))|绝对安全|完全无害|一定安全/;

/** 允许的作用域限定：没有它就不许下「无危害」结论 */
const SCOPE_QUALIFIER =
  /(在|于)[^。；]{0,18}(条件|范围|水平|用途|情况下|情境|以内)|所评估|本次评估|当前|现有资料|按照|符合|低于|不超过|摄入量|暴露量|这一组|按[^。；]{0,24}(ADI|每日允许摄入量|每日容许摄入量|摄入量|使用)/;

/** 超出原评估范围的无条件推广 */
const UNCONDITIONAL_SAFE =
  /(无论|不管|随便|任意)[^。；]{0,10}(摄入|吃|用|添加)[^。；]{0,12}(都|均)/;

const AUTHORITY_ORG_RE =
  /(WHO|世界卫生组织|FAO|粮农组织|JECFA|EFSA|欧洲食品安全局|Codex|国际食品法典|CFSA|国家食品安全风险评估中心|国家卫生健康委员会|美国食品药品监督管理局|FDA|Health Canada|加拿大卫生部)/i;

/**
 * 「资料里没有给出 X」这类缺省陈述。
 *
 * 它不可能有「支持它的原文」——本来就是在说资料里没有。
 * 这类话可以保留（用户需要知道边界），但必须：
 *   1) 不夹带任何安全/有害判断；
 *   2) 证据状态强制降到「资料不足」，不能借缺省陈述冒充权威结论。
 */
const ABSENCE_STATEMENT =
  /(没有|未|无法|不能|未能)[^。；，]{0,10}(给出|提供|提及|说明|确认|查到|找到)/;
const SAFETY_WORDS = /(安全|有害|危险|风险|无毒|致癌)/;

export function isAbsenceStatement(text) {
  const t = String(text || '');
  return ABSENCE_STATEMENT.test(t) && !SAFETY_WORDS.test(t);
}

/**
 * 校验并规范化 healthInsights。
 *
 * 逐条要求：文本非空、证据状态合法、至少 1 个真实来源、通过健康规则检查，
 * 并且**提供一段能在所引来源里逐字找到的原文摘句**。
 * 任何一条不过 → 放进 rejected（带原因），不会进入卡片。
 *
 * @returns {{
 *   insights: object|null,
 *   rejected: Array,
 *   stats: { offered:number, accepted:number, rejected:number },
 *   reason: string|null
 * }}
 */
export function validateHealthInsights({
  raw,
  evidenceSet = [],
  ingredientName = '',
  aliases = [],
} = {}) {
  const allowedById = new Map();
  for (const s of evidenceSet) {
    if (s?.id) allowedById.set(String(s.id).toUpperCase(), s);
  }

  const rejected = [];
  const accepted = {};
  // 兼容旧字段名：practicalTakeaway 仍可作为输入，输出统一叫 consumerTakeaway
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...raw, consumerTakeaway: raw.consumerTakeaway ?? raw.practicalTakeaway }
      : raw;
  const offered =
    input && typeof input === 'object' && !Array.isArray(input)
      ? HEALTH_SLOTS.filter((k) => input[k])
      : [];

  for (const slot of HEALTH_SLOTS) {
    const item = input?.[slot];
    if (!item) continue;

    if (typeof item !== 'object' || Array.isArray(item)) {
      rejected.push({ slot, text: String(item).slice(0, 120), rejectReason: '健康结论必须是结构化对象' });
      continue;
    }

    const text = String(item.text || '').trim().replaceAll('出生前三个月婴儿', '出生后前三个月的婴儿');
    if (!text || text.length < 4) continue;
    // 适用条件在「作用域」判定里也要用，所以先解析
    const conditions = String(item.conditions || '').trim().slice(0, 120) || null;

    let refs = (Array.isArray(item.sourceRefs) ? item.sourceRefs : [])
      .map((r) => String(r || '').replace(/[\[\]【】\s]/g, '').toUpperCase())
      .filter(Boolean);

    if (item.absence === true && refs.length === 0 && slot !== 'consumerTakeaway') {
      // A retrieval gap is process information, not a scientific assertion needing a fabricated citation.
      accepted[slot] = { slot, text: slot === 'sensitiveGroups' ? '本次检索未取得针对特定人群的明确健康提示。' : '本次检索未取得可直接回答这一问题的研究证据。',
        sourceRefs: [], sources: [], evidenceStatus: HEALTH_STATUS.INSUFFICIENT, evidenceLabel: '本次证据缺口',
        absence: true, verified: true, answerKind: ANSWER_KIND.REFERENCE, answersQuestion: false, studyType: 'none', headlineEligible: false };
      continue;
    }

    if (refs.length === 0) {
      rejected.push({ slot, text, rejectReason: '健康结论没有引用任何来源' });
      continue;
    }

    const missing = refs.filter((r) => !allowedById.has(r));
    if (missing.length) {
      rejected.push({ slot, text, rejectReason: `引用了不存在的来源：${missing.join(', ')}` });
      continue;
    }

    let refCorrected = false;
    let citedEvidence = refs.map((r) => allowedById.get(r));
    let check = checkHealthClaim(text, {
      ingredientName,
      aliases,
      citedEvidence,
      conditions: conditions || '',
      semanticChecked: item.semanticChecked === true,
    });

    // 模型可能只是把来源编号标错了：结论本身有原文支撑，但标到了另一份资料上。
    // 这时先按原文找一次真正的来源，改正后再跑一遍同样的检查 ——
    // 不是放行，是换成正确的那份证据重新审。
    if (check.status === CHECK_STATUS.REJECT && item.quote) {
      const onlySubstanceIssue = check.issues.every((i) =>
        /引用的资料(讲的是另一个物质|里没有提到这个成分)/.test(i.why),
      );
      if (onlySubstanceIssue) {
        const alt = verifyQuoteSupport(String(item.quote).trim(), evidenceSet);
        if (alt.ok && !refs.includes(alt.evidenceId)) {
          refs = [alt.evidenceId, ...refs];
          citedEvidence = refs.map((r) => allowedById.get(r)).filter(Boolean);
          refCorrected = true;
          check = checkHealthClaim(text, {
            ingredientName,
            aliases,
            citedEvidence,
            conditions: conditions || '',
          });
        }
      }
    }

    if (check.status === CHECK_STATUS.REJECT) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason: '健康结论未通过科学检查：' + (check.issues[0]?.why || '与资料不符'),
        issues: check.issues,
      });
      continue;
    }

    // ---- 原文锚点：没有可核对的原句，就不承认这条结论 ----
    // A limitation at the end must not erase the supported finding before it.
    const absence = item.semanticChecked ? item.absence === true : isAbsenceStatement(text);
    const quote = String(item.quote || '').trim();
    if (!quote && !absence) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason: '健康结论没有提供可核对的原文摘句，无法确认来源是否直接支持它',
      });
      continue;
    }

    let support = quote ? verifyQuoteSupport(quote, citedEvidence) : { ok: false, reason: null };
    if (quote && !support.ok) {
      // 模型可能只是把编号标错了。给它一次机会：在同一批证据里找这句原文。
      // 找到 → 以原文所在的来源为准改正引用；找不到 → 拒绝。
      const alt = verifyQuoteSupport(quote, evidenceSet);
      if (alt.ok) {
        support = { ...alt, corrected: true };
        refCorrected = true;
        refs = [alt.evidenceId, ...refs.filter((r) => r !== alt.evidenceId)];
        citedEvidence = refs.map((r) => allowedById.get(r)).filter(Boolean);
      }
    }

    if (quote && !support.ok) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason: '健康结论引用的原文摘句在所引来源里找不到，不能确认来源支持这句话',
      });
      continue;
    }

    // ---- 通用术语表不能单独证明某个物质的健康结论 ----
    //
    // 「ADI not specified」的定义解释的是术语含义，不是对当前物质做出的评估。
    // 用它推出「该物质不构成健康危害」属于超出证据范围：
    //   · 文本本身只是术语解释 → 降为参考值（可展示，不当大字结论、不计为已回答）
    //   · 文本是健康结论 → 拒绝
    const supportSource = support?.evidenceId ? allowedById.get(support.evidenceId) : null;
    if (quote && isTerminologySource(supportSource)) {
      const termOnly = /(无需规定|无须规定|not\s*specified|not\s*limited|术语|含义|定义为)/i.test(text);
      if (!termOnly) {
        rejected.push({
          slot,
          text,
          sourceRefs: refs,
          rejectReason:
            '这句话的依据是通用术语定义，不是针对该物质的评估，不能当作它的健康结论',
        });
        continue;
      }
      // 术语解释：强制按参考值处理
      check = { status: CHECK_STATUS.PASS, issues: [] };
    }

    // ---- 数值与年份：写出来的每个数字都必须能在来源里找到 ----
    const rawPool = `${citedEvidence.map(evidenceText).join('\n')}\n${quote}`;
    const numbers = extractNumbers(`${text}${conditions ? `\n${conditions}` : ''}`);
    const unsupportedNumbers = numbers.filter((n) => !containsNumber(rawPool, n));
    if (unsupportedNumbers.length > 0 && !item.semanticChecked) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason: `结论里的数值 ${unsupportedNumbers.join('、')} 在引用的资料里找不到`,
      });
      continue;
    }

    const yearMatch = String(item.sourceYear || '').match(/\b(?:19|20)\d{2}\b/);
    const yearClaimed = Boolean(yearMatch);
    let sourceYear = yearMatch ? yearMatch[0] : null;
    let yearVerified = false;
    if (yearClaimed) {
      yearVerified =
        containsNumber(rawPool, sourceYear) ||
        citedEvidence.some((s) => String(s.publishedAt || '').includes(sourceYear));
      // 年份核对不上：不展示这个年份（展示本身就是一种未经核对的说法）
      if (!yearVerified) sourceYear = null;
    }

    const requested = String(item.evidenceStatus || '').trim();
    let evidenceStatus = VALID_STATUS.has(requested) ? requested : HEALTH_STATUS.CONDITIONAL;
    // 引用的全部是「只有搜索摘要」时，不能标成权威评估
    const allSnippet = citedEvidence.every((s) =>
      ['search_summary', 'search_only'].includes(s.sourceType),
    );
    if (allSnippet && evidenceStatus === HEALTH_STATUS.AUTHORITATIVE) {
      evidenceStatus = HEALTH_STATUS.SUPPORTED;
    }
    // 权威评估必须来自正式风险评估机构，否则最多算「可靠资料支持」
    const fromAuthority = citedEvidence.some((s) =>
      AUTHORITY_ORG_RE.test(`${s.organization || ''} ${s.title || ''}`),
    );
    if (evidenceStatus === HEALTH_STATUS.AUTHORITATIVE && !fromAuthority) {
      evidenceStatus = HEALTH_STATUS.SUPPORTED;
    }
    if (evidenceStatus === HEALTH_STATUS.AUTHORITATIVE && yearClaimed && !yearVerified) {
      // 声称了评估年份却核对不上 → 不能再说「权威评估直接支持」
      evidenceStatus = HEALTH_STATUS.SUPPORTED;
    }
    // 缺省陈述永远只是「资料不足」，不能借它冒充结论
    if (absence) evidenceStatus = HEALTH_STATUS.INSUFFICIENT;

    // ---- 资格判定（本轮返工的核心）----
    // 有字 ≠ 回答了问题。这里先判定这句话属于哪种回答，
    // 再决定它能不能被当成「正常食用 / 摄入过多 / 谁要注意」的答案。
    const semanticKind = !absence && item.semanticChecked && ['evaluation','effect','reference','named_group'].includes(item.semanticAnswerKind) ? item.semanticAnswerKind : null;
    const lexicalKind = judgeAnswerKind({ slot, text, absence });
    const answerKind = absence ? ANSWER_KIND.REFERENCE : isTechnicalOnly(text) ? ANSWER_KIND.NONE : slot === 'highIntake' && semanticKind === 'effect' && !['effect','evaluation'].includes(lexicalKind) ? ANSWER_KIND.REFERENCE : lexicalKind === 'effect' && semanticKind === 'reference' ? lexicalKind : semanticKind || lexicalKind;

    // ---- 研究类型 / 研究条件 / 证据基础（V2.5）----
    // 先判定，后面的 consumerTakeaway 与 accepted 对象共用同一份结论。
    const requestedStudyType = String(item.studyType || '').trim().toLowerCase();
    let studyType = STUDY_TYPES.includes(requestedStudyType) ? requestedStudyType : null;
    if (!studyType) {
      studyType = isAnimalEvidence(`${text} ${conditions || ''}`)
        ? 'animal'
        : /人体|人群|受试者|volunteer|human|participants?|subjects?/i.test(`${text} ${item.studyContext || ''}`)
          ? 'human'
          : 'assessment';
    }
    const requestedBasis = String(item.evidenceBasis || '').trim().toLowerCase();
    const evidenceBasis = EVIDENCE_BASES.includes(requestedBasis) ? requestedBasis : 'direct';
    const animalOnly = isAnimalEvidence(`${text} ${conditions || ''}`) ||
      ['animal', 'in_vitro'].includes(studyType);

    if (answerKind === ANSWER_KIND.NONE) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason:
          '这不是健康结论：讲的是标准编号、技术用途、食品类别或名词差异，没有涉及人体健康影响',
      });
      continue;
    }

    if (slot === 'consumerTakeaway' && !answersQuestion(answerKind, slot, { animalOnly })) {
      rejected.push({
        slot,
        text,
        sourceRefs: refs,
        rejectReason:
          '「最值得知道的一句」必须是评估结论或已发现的健康影响；只有参考摄入值或术语解释不能占这一行',
      });
      continue;
    }

    // 研究条件里的数字也必须能在来源里找到；找不到就丢掉这段条件，
    // 但不能因此把整条结论当成已核对。
    let studyContext = String(item.studyContext || '').trim().slice(0, 240) || null;
    if (studyContext) {
      const ctxNumbers = extractNumbers(studyContext);
      const ctxPool = `${citedEvidence.map(evidenceText).join('\n')}\n${quote || ''}`;
      const bad = ctxNumbers.filter((n) => !containsNumber(ctxPool, n));
      if (bad.length) studyContext = null;
    }

    accepted[slot] = {
      text,
      evidenceStatus,
      evidenceLabel: HEALTH_STATUS_LABELS[evidenceStatus],
      sourceRefs: refs,
      sources: citedEvidence,
      slot,
      verified: true,
      /** 支撑这句话的原文（逐字取自来源，已核对存在） */
      quote: quote || null,
      quotes: item.quotes || [],
      semanticChecked: Boolean(item.semanticChecked),
      applicability: item.semanticChecked ? item.applicability || null : null,
      populationInfo: item.semanticChecked ? item.populationInfo || null : null,
      consumerSummary: item.semanticChecked ? String(item.consumerSummary || '').trim() || null : null,
      quoteSourceId: support.evidenceId || null,
      /** 适用条件：只在特定摄入情境/食品类别下成立时由模型给出，数值同样要能核对 */
      conditions,
      sourceYear,
      yearVerified,
      /** 缺省陈述：这次资料里没有写，而不是「写了某个数值」 */
      absence,
      /** 引用编号被程序改正过（模型标错来源时） */
      refCorrected,
      /**
       * 这条文字的回答类型：evaluation / effect / reference / named_group。
       * UI 与统计都按它判断「是否真的回答了问题」，而不是看字段非空。
       */
      answerKind,
      answerKindLabel: ANSWER_KIND_LABELS[answerKind],
      /** 是否真正回答了对应槽位的问题（ADI 数字、术语解释 = false） */
      answersQuestion: answersQuestion(answerKind, slot, { animalOnly }),
      /** 只有动物/体外证据（不算「人体高摄入后果」） */
      animalOnly,
      /** 研究类型：human / animal / in_vitro / assessment / reference / none */
      studyType,
      /** 研究条件：受试人数、剂量、时长、观察指标（数字已核对） */
      studyContext,
      /** 证据基础：direct / constituent / group / analog */
      evidenceBasis,
      /** 非直接证据的限定说明，由程序生成，不交给模型自由发挥 */
      basisNote:
        evidenceBasis === 'constituent'
          ? '依据是对其组成物质的联合评估，不是对单一物质的独立研究'
          : evidenceBasis === 'group'
            ? '依据是同一评估组的组级结论，不等于对这个具体物质单独下结论'
            : evidenceBasis === 'analog'
              ? '依据来自相关但不同的化学形式，不能直接套用'
              : null,
      /** 能否成为第一眼看到的健康核心结论 */
      headlineEligible: isHeadlineEligible({
        answerKind,
        answersQuestion: answersQuestion(answerKind, slot, { animalOnly }),
      }),
    };
  }

  const stats = {
    offered: offered.length,
    accepted: Object.keys(accepted).length,
    rejected: rejected.length,
    /** 真正回答了问题的条数（参考值不算） */
    answered: Object.values(accepted).filter((x) => x.answersQuestion).length,
  };

  if (stats.accepted === 0) {
    return {
      insights: null,
      rejected,
      stats,
      reason: offered.length
        ? '提供的健康信息没有一条通过来源与科学检查'
        : '本次资料没有给出可核查的健康结论',
    };
  }

  return { insights: accepted, rejected, stats, reason: null };
}

/**
 * 校验「对这款食品有什么实际意义」（V2.5）。
 *
 * 这一块最容易越界：模型没有产品检测数据，却容易写成
 * 「这款食品含糖较高，建议少吃」「每天最多吃两包」。
 * 这里只允许两类内容：
 *   1. 适用性说明：这些证据针对什么用途/摄入情境，当前食品是否在范围内；
 *   2. 边界说明：还缺哪些产品层面的数据，所以不能推算实际含量。
 *
 * 任何产品好坏判断、实际含量推算、吃几包的换算，一律拒绝。
 */
export function validateFoodMeaning({
  raw,
  evidenceSet = [],
  ingredientName = '',
  aliases = [],
  foodContext = null,
} = {}) {
  if (!raw) return { value: null, rejectedReason: null };
  const obj = typeof raw === 'string' ? { text: raw } : raw;
  const text = String(obj?.text || '').trim();
  if (!text || text.length < 8) {
    return { value: null, rejectedReason: '「对这款食品」说明为空或过短' };
  }
  if (text.length > 600) {
    return { value: null, rejectedReason: '「对这款食品」说明过长，超过 600 字' };
  }
  if (PRODUCT_JUDGMENT.test(text)) {
    return {
      value: null,
      rejectedReason: '把健康证据写成了对这款具体产品的健康/安全判断',
    };
  }
  const labelPool = JSON.stringify(foodContext?.nutrition || {});
  const labelNumbers = extractNumbers(text).every(n => containsNumber(labelPool, n));
  const labelContext = /营养(?:表|信息|成分)|标签|标示|标注/.test(text) && labelNumbers;
  if (PRODUCT_AMOUNT_GUESS.test(text) && !labelContext && !/(?:研究|试验|受试者|剂量|资料|证据)/.test(text)) {
    return {
      value: null,
      rejectedReason: '用研究/资料里的含量数字推算这款产品的实际含量',
    };
  }
  if (PACK_LIMIT.test(text)) {
    return { value: null, rejectedReason: '用配料表推算「每天最多吃多少」' };
  }
  if (WHOLE_FOOD_ATTRIBUTION.test(text) && !labelContext) {
    return { value: null, rejectedReason: '把整款食品的钠/糖/脂肪问题归因到单一成分' };
  }

  const allowedById = new Map(evidenceSet.map((s) => [String(s.id).toUpperCase(), s]));
  const refs = (Array.isArray(obj.sourceRefs) ? obj.sourceRefs : [])
    .map((r) => String(r || '').replace(/[\[\]【】\s]/g, '').toUpperCase())
    .filter(Boolean);
  const missing = refs.filter((r) => !allowedById.has(r));
  if (missing.length) {
    return { value: null, rejectedReason: `引用了不存在的来源：${missing.join(', ')}` };
  }

  const hasHealthFact =
    /(未发现|发现|风险|影响|评估|ADI|每日允许摄入量|研究|人群|症状|尿酸|血压|过敏|哮喘|龋齿|肝|肾|血糖)/.test(
      text,
    );
  const numbers = extractNumbers(text);
  if ((hasHealthFact || numbers.length) && refs.length === 0) {
    return {
      value: null,
      rejectedReason: '提到了健康事实或数字，但没有引用任何来源',
    };
  }

  const cited = refs.map((r) => allowedById.get(r)).filter(Boolean);
  if (numbers.length && cited.length) {
    const pool = cited.map(evidenceText).join('\n') + '\n' + labelPool;
    const bad = numbers.filter((n) => !containsNumber(pool, n));
    if (bad.length) {
      return {
        value: null,
        rejectedReason: `「对这款食品」里的数字 ${bad.join('、')} 在引用资料里找不到`,
      };
    }
  }

  const requestedStudyType = String(obj.studyType || '').trim().toLowerCase();
  const studyType = STUDY_TYPES.includes(requestedStudyType) ? requestedStudyType : 'assessment';
  const requestedBasis = String(obj.evidenceBasis || '').trim().toLowerCase();
  const evidenceBasis = EVIDENCE_BASES.includes(requestedBasis) ? requestedBasis : 'direct';

  return {
    value: {
      text,
      sourceRefs: refs,
      sources: cited,
      conditions: String(obj.conditions || '').trim().slice(0, 200) || null,
      studyType,
      evidenceBasis,
      verified: true,
      productContext: foodContext
        ? {
            productName: String(foodContext.productName || '').slice(0, 40) || null,
            category: String(foodContext.category || '').slice(0, 30) || null,
          }
        : null,
    },
    rejectedReason: null,
  };
}

/**
 * 卡片顶部的一句话健康结论。
 * 只有「正常食用 / 摄入过多 / 特别注意」之一时，用最贴近的那条。
 * 没有 practicalTakeaway 就不要硬凑一句。
 */
export function pickHealthHeadline(insights) {
  if (!insights) return null;
  // 只认「回答了问题」的条目：ADI 数字/术语解释不再自动成为标题
  for (const slot of ['consumerTakeaway', 'normalIntake', 'highIntake', 'sensitiveGroups']) {
    const item = insights[slot];
    if (item?.text && isHeadlineEligible(item)) return item;
  }
  return null;
}
