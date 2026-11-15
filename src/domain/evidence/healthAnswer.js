/**
 * 「这条健康信息到底回答了消费者的问题吗」（V2.3 返工，纯函数，不联网）。
 *
 * 背景：过去只要 healthInsights 里有字，就被当成「已回答」。
 * 结果是「ADI 是 0–15 mg/kg 体重」「GB 2760 规定了使用范围」「它和蔗糖不同」
 * 这类句子也被记成「摄入过多已回答」，页面上看起来健康区块有内容，
 * 实际没有回答「吃多了会怎样」。
 *
 * 这个模块只做一件事：给每条健康文字判定**回答类型**，
 * 并据此决定它能不能当消费者第一眼看到的核心结论。
 *
 * 回答类型（answerKind）：
 *   evaluation  机构在正常膳食摄入条件下得出的评估结论（未发现担忧／无安全关切／ADI 无需规定）
 *   effect      已经发现的健康影响或反应（血压升高、哮喘反应、龋齿……）
 *   reference   只有参考摄入值、ADI 定义、术语说明、暴露估计——有用，但不等于「后果」
 *   named_group 点名了某类人群及其原因
 *   none        连健康语义都没有（标准编号、技术用途、类别差异）
 *
 * 判定只看字面语义，不调用模型、不猜测。
 */

/**
 * 健康信息的结构版本。
 *
 * 预录资料（demo）与缓存里的结果是按某个版本整理出来的；
 * 版本对不上时不能假装它通过了当前检查，页面要说明「这是旧版整理」。
 */
export const HEALTH_SCHEMA_VERSION = 4;

export const ANSWER_KIND = {
  EVALUATION: 'evaluation',
  EFFECT: 'effect',
  REFERENCE: 'reference',
  NAMED_GROUP: 'named_group',
  NONE: 'none',
};

export const ANSWER_KIND_LABELS = {
  evaluation: '评估结论',
  effect: '已发现的影响',
  reference: '参考摄入值',
  named_group: '点名人群',
  none: '非健康信息',
};

// ---------------------------------------------------------------- 字面判定

/** 标准编号 / 使用规定 / 技术功能 / 类别差异 —— 出现这些多半不是健康结论 */
const TECHNICAL_PATTERNS = [
  /\b(?:GB|INS|CNS)\s?\/?\s?T?\s?\d/i,
  /最大使用量|最大残留量|残留量|使用范围|使用限量|食品分类号|食品类别|食品分类/,
  /按生产需要适量使用|按标准使用|符合标准|标准规定|标准允许|允许使用|批准使用|列入表/,
  /(?:功能|作用)(?:是|为)|用作|作为.{0,8}(?:甜味剂|防腐剂|酸度调节剂|护色剂|增稠剂|乳化剂|抗氧化剂|膨松剂|稳定剂|抗结剂|水分保持剂|漂白剂|着色剂)/,
  /(?:甜味剂|防腐剂|酸度调节剂|护色剂|增稠剂|乳化剂|抗氧化剂|膨松剂|稳定剂|抗结剂|着色剂|漂白剂)的?一种/,
  /(?:和|与).{1,12}(?:不是|并非).{0,8}(?:同一种|一回事|同一物质)|是两种不同|二者不同|两者不同/,
  /没有(?:实际)?添加量|无法(?:推算|判断|知道|确认).{0,10}(?:摄入|用量|添加量|吃了多少)/,
  /本标准|本文件|附录\s?[A-Z]|表\s?A\.\d/,
  /折算系数|换算系数|使用比例|以.{1,8}计(?:的)?(?:残留量|使用量)/,
];

/** 评估结论的说法（机构 + 结论动词），用于把「评估结论」与「报个数」分开 */
const ASSESSMENT_CONCLUSION =
  /(?:评估|评价|再评估|复核).{0,14}(?:认为|结论|显示|指出|确认|维持|得出)|(?:结论|结果)(?:是|为|显示)|未发现|没有发现|未观察到|没有观察到|不构成.{0,8}(?:危害|风险)|(?:没有|无).{0,6}(?:安全|健康).{0,4}(?:担忧|关切|风险)|未超出|低于.{0,10}(?:ADI|每日允许摄入量|参考值)/;

/** 已发现的健康影响 / 反应；这是「吃多了会怎样」唯一够格的证据形态 */
const EFFECT_SIGNAL =
  /(?:血压|血糖|血脂|尿酸).{0,6}(?:升高|上升|降低|下降)|升高.{0,6}(?:血压|血糖)|引起|导致|出现|发生|表现为|(?:过敏|不良|严重|不适|哮喘|皮肤|呼吸|全身|中毒)[^。；]{0,4}反应|反应(?:包括|有|为|是)|症状|过敏|哮喘|荨麻疹|头痛|恶心|呕吐|腹泻|腹痛|龋齿|贫血|结石|中毒|休克|不适|刺激|损伤|损害|缺乏|干扰.{0,8}吸收|降低.{0,8}(?:吸收|利用)|增加.{0,10}风险|风险(?:增加|升高)/;

/** 只有参考值 / 定义 / 术语时的说法 */
const REFERENCE_SIGNAL =
  /(?:每日允许摄入量|每日容许摄入量|ADI|耐受摄入量|TDI|参考摄入量|暴露量|摄入量|估计值|参考值)/i;
const DEFINITION_SIGNAL =
  /(?:是指|指的是|定义为|含义|意思是|即.{0,4}(?:终生|长期)|终生每天|长期每天).{0,40}(?:摄入|风险|量)/;
const ABSENCE_SIGNAL = /(?:没有|未|无法|不能|未能)[^。；，]{0,10}(?:给出|提供|提及|说明|确认|查到|找到|描述)/;
/**
 * 膳食建议 / 摄入上限的说法。
 *
 * 它回答的是「每天吃多少比较合适」，不是「吃多了会怎样」——
 * 所以归到参考值，可以展示，但不能当成健康核心结论。
 */
const RECOMMENDATION_SIGNAL =
  /建议|推荐|应(?:控制|限制|减少|少于)|限制在|不超过|上限|每日总能量/;

/** 点名人群。必须由来源点名，不能从「钠」「酸」这类字推断。 */
const NAMED_GROUP_TERMS = [
  '苯丙酮尿症',
  'PKU',
  '哮喘',
  '亚硫酸盐敏感',
  '亚硫酸盐过敏',
  '过敏体质',
  '过敏人群',
  '孕妇',
  '乳母',
  '婴幼儿',
  '婴儿',
  '儿童',
  '老年人',
  '肾功能',
  '肾病患者',
  '糖尿病',
  '高血压',
  '痛风',
  '偏头痛',
  '不耐受',
  '贫血',
  '矿物质缺乏',
];

/**
 * 这条结论是不是只建立在动物/体外证据上。
 *
 * 「大鼠高剂量喂养出现肝损伤」与「人吃了会肝损伤」是两件事。
 * 只有动物/体外证据时，它可以作为背景说明，但不能算「高摄入后果已回答」。
 */
export function isAnimalEvidence(text) {
  const t = String(text || '');
  const animal = /(大鼠|小鼠|豚鼠|动物实验|动物研究|体外实验|细胞实验|\brats?\b|\bmice\b|\bmouse\b|animal stud|in vitro)/i.test(t);
  const human = /(人体|人群|受试者|志愿者|临床试验|队列|\bhuman\b|volunteer|participants|subjects|cohort|trial)/i.test(t);
  return animal && !human;
}

/** 一句话是不是主要在报标准/用途/类别，而不是健康信息 */
export function isTechnicalOnly(text) {
  const t = String(text || '');
  if (!t) return true;
  // 「资料没有给出某项数据」是在讲证据边界，不是在讲标准条款
  if (/(?:没有|未|无法|不能|未能)[^。；，]{0,10}(?:给出|提供|提及|说明|确认|查到|找到|描述)/.test(t)) {
    return false;
  }
  const tech = TECHNICAL_PATTERNS.some((re) => re.test(t));
  const health = ASSESSMENT_CONCLUSION.test(t) || EFFECT_SIGNAL.test(t);
  return tech && !health;
}

/** 是否点名了某类人群 */
export function hasNamedGroup(text) {
  const t = String(text || '');
  return NAMED_GROUP_TERMS.some((g) => t.includes(g));
}

/**
 * 判定一条健康文字的回答类型。
 *
 * @param {{slot:string, text:string, absence?:boolean}} input
 * @returns {'evaluation'|'effect'|'reference'|'named_group'|'none'}
 */
export function judgeAnswerKind({ slot, text, absence = false } = {}) {
  const t = String(text || '').trim();
  if (!t) return ANSWER_KIND.NONE;
  if (isTechnicalOnly(t)) return ANSWER_KIND.NONE;

  if (slot === 'sensitiveGroups') {
    if (absence) return ANSWER_KIND.REFERENCE;
    return hasNamedGroup(t) ? ANSWER_KIND.NAMED_GROUP : ANSWER_KIND.NONE;
  }

  // 「资料没有给出 X」是在说边界，不是在报告 X。
  // 这类句子只能算参考信息，不能因为里面出现了「反应」「症状」就当成已发现的影响。
  if (absence) return ANSWER_KIND.REFERENCE;

  // 「ADI 无需规定 / not specified / not limited」是**术语状态**，
  // 它说明的是「不需要设定数值型 ADI」，不是「这个物质在任何摄入量下都无害」。
  // 这类句子一律按参考值处理，不能当大字结论。
  if (/(无需规定|无须规定|不需要规定|not\s*specified|not\s*limited)/i.test(t) && !/(无安全担忧|没有安全担忧|未发现|不构成.{0,8}(?:危害|风险)|尿酸.{0,6}升高)/.test(t)) {
    return ANSWER_KIND.REFERENCE;
  }

  const effect = EFFECT_SIGNAL.test(t);
  const conclusion = ASSESSMENT_CONCLUSION.test(t);
  const reference =
    REFERENCE_SIGNAL.test(t) ||
    DEFINITION_SIGNAL.test(t) ||
    RECOMMENDATION_SIGNAL.test(t) ||
    absence;

  // 「有证据的身体影响」优先：即使同时提到 ADI，也按 impact 归类。
  if (effect && !reference) return ANSWER_KIND.EFFECT;
  if (effect && reference) {
    // 两者都有：只有在给了具体影响时才按 effect；
    // 「ADI 是……不是中毒线」这类解释性否定不算影响。
    const explanatory =
      /(?:不是|不等于|并非|不代表)[^。；]{0,16}(?:中毒|有害|危险|不超过|安全线|界线)/.test(t);
    return explanatory ? ANSWER_KIND.REFERENCE : ANSWER_KIND.EFFECT;
  }
  if (conclusion && !reference) return ANSWER_KIND.EVALUATION;
  if (conclusion && reference) {
    // 「评估认为当前暴露低于 ADI，没有安全关切」是评估结论，
    // 但「把 ADI 定为 X」只是报数，下面这一句负责区分。
    return /(?:把|将|设定|定为|规定为)[^。；]{0,14}(?:ADI|每日允许摄入量|每日容许摄入量)/.test(t) &&
      !/(?:未发现|没有发现|未观察到|没有安全|无安全|不构成)/.test(t)
      ? ANSWER_KIND.REFERENCE
      : ANSWER_KIND.EVALUATION;
  }
  if (reference) return ANSWER_KIND.REFERENCE;
  return ANSWER_KIND.NONE;
}

/** 这个槽位的这类回答，算不算「回答了消费者的这个问题」 */
export function answersQuestion(kind, slot, { animalOnly = false } = {}) {
  if (slot === 'sensitiveGroups') return kind === ANSWER_KIND.NAMED_GROUP;
  // 动物/体外结果不能算「人吃多了会怎样」的答案
  if (slot === 'highIntake') return kind === ANSWER_KIND.EFFECT && !animalOnly;
  if (slot === 'normalIntake') {
    return kind === ANSWER_KIND.EVALUATION || kind === ANSWER_KIND.EFFECT;
  }
  if (slot === 'consumerTakeaway') {
    return (
      kind === ANSWER_KIND.EVALUATION ||
      kind === ANSWER_KIND.EFFECT ||
      kind === ANSWER_KIND.NAMED_GROUP
    );
  }
  return false;
}

/** 能不能放进「健康上最值得知道什么」那一行 */
export function isHeadlineEligible(entry) {
  if (!entry) return false;
  if (entry.answersQuestion === false) return false;
  if (entry.applicability?.generalizable === false || entry.populationNature === 'suitability') return false;
  const kind = entry.answerKind;
  return (
    kind === ANSWER_KIND.EVALUATION ||
    kind === ANSWER_KIND.EFFECT ||
    kind === ANSWER_KIND.NAMED_GROUP
  );
}

/**
 * 从已通过校验的 healthInsights 里挑出第一眼要显示的一句。
 *
 * 顺序固定：消费者结论 → 正常食用评估 → 已发现的高摄入影响 → 点名人群。
 * 参考值永远不参与：ADI 数字再准确，也没有回答「吃进去会怎样」。
 *
 * @returns {{slot:string, item:object}|null}
 */
export function pickConsumerHeadline(insights) {
  if (!insights || typeof insights !== 'object') return null;
  const order = ['consumerTakeaway', 'normalIntake', 'highIntake', 'sensitiveGroups'];
  for (const slot of order) {
    const item = insights[slot];
    if (item?.text && isHeadlineEligible(item)) return { slot, item };
  }
  return null;
}


// ---------------------------------------------------------------- 三问记账

const HEALTH_QUESTIONS = ['normalIntake', 'highIntake', 'sensitiveGroups'];

/**
 * 把已校验的健康条目汇总成「三个问题各自答到什么程度」（纯函数）。
 *
 * 关键区别：
 *   answered       真正回答了问题（评估结论 / 已发现影响 / 点名人群）
 *   reference_only 有文字，但只是参考摄入值或术语解释 —— 不算回答
 *   rejected       模型给了，但没过来源/科学检查
 *   no_evidence    资料里就没有这一项
 */
export function summarizeHealthAnswers({ insights, rejected = [], evidenceFacts = [] } = {}) {
  const answers = {};
  const takeaway = insights?.consumerTakeaway;
  for (const slot of HEALTH_QUESTIONS) {
    const item = insights?.[slot];
    // 消费者结论本身就是一句「正常吃会怎样」的评估时，也计入第一个问题
    if (slot === 'normalIntake' && takeaway?.answersQuestion && !item?.answersQuestion) {
      answers[slot] = {
        status: 'answered',
        kind: takeaway.answerKind,
        via: 'consumerTakeaway',
        supplementary: Boolean(item),
      };
      continue;
    }
    if (item?.answersQuestion) {
      answers[slot] = { status: 'answered', kind: item.answerKind };
      continue;
    }
    if (item) {
      answers[slot] = { status: 'reference_only', kind: item.answerKind };
      continue;
    }
    const retained = evidenceFacts.find(f=>!f.absence && (f.originSlot===slot || f.originSlots?.includes(slot)));
    if (retained) {
      answers[slot] = {status:'reference_only',kind:retained.answerKind,reason:'已保留在深入研究或适用信息中，未作一般人群结论'};
      continue;
    }
    const rej = rejected.find((r) => r.slot === slot);
    answers[slot] = rej
      ? { status: 'rejected', reason: rej.rejectReason }
      : { status: 'no_evidence' };
  }
  const count = (status) => HEALTH_QUESTIONS.filter((k) => answers[k].status === status).length;
  return {
    healthAnswers: answers,
    healthScore: {
      answered: count('answered'),
      referenceOnly: count('reference_only'),
      rejected: count('rejected'),
      none: count('no_evidence'),
    },
  };
}
