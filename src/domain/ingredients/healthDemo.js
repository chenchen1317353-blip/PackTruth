import { HEALTH_SCHEMA_VERSION } from '../evidence/healthAnswer.js';
import { organizeConsumerEvidence } from '../evidence/consumerEvidence.js';
/**
 * 离线演示用的健康资料（人工整理，不是某次 DeepSeek 查询结果）。
 *
 * 为什么单独放一个模块：
 *  - 演示模式过去只有「三氯蔗糖」一份预录分析，且是旧版健康结构；
 *  - 其余演示配料只有本地知识库，点开看不到健康信息；
 *  - 演示体验不能因为免费就退回旧版。
 *
 * 这里保存的是**原始结论 + 逐字原文**，展示前仍然要经过
 * 真实的 validateHealthInsights()：原文对不上、数字对不上、
 * 人群没被点名、术语来源冒充物质评估，都会被拦下来。
 *
 * 所有 excerpt 均逐字取自公开官方页面，来源、年份写在条目里。
 * 整理日期：2026-11-04。
 */

import { validateHealthInsights } from '../evidence/healthGuard.js';
import { summarizeHealthAnswers } from '../evidence/healthAnswer.js';
import { findHealthEvidence } from '../evidence/healthEvidence.js';

const WHO_SUGAR_CARIES = {
  id: 'W1',
  title: 'WHO Fact sheet：Sugars and dental caries（糖与龋齿）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'verified_local',
  url: 'https://www.who.int/news-room/fact-sheets/detail/sugars-and-dental-caries',
  excerpt:
    'The consumption of free sugars in foods and beverages is the most common risk factor for dental caries and is a shared risk factor across several NCDs. Limiting the intake of free sugars to less than 10% of total energy intake – and ideally to less than 5% – minimizes the risk of dental caries throughout the life course. Consumption of free sugars is a major risk factor for overweight, obesity and dental caries. A continued high intake of free sugars, inadequate exposure to fluoride and a lack of removal of plaque by toothbrushing with fluoride toothpaste containing 1000-1500 ppm concentration can lead to dental caries. Free sugars include all monosaccharides and disaccharides added to foods and beverages by the manufacturer, cook or consumer, as well as sugars naturally present in honey, syrups, fruit juices and fruit juice concentrates.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2025',
  tier: 'local',
};

const WHO_SODIUM = {
  id: 'W1',
  title: 'WHO Fact sheet：Sodium reduction（减钠）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'verified_local',
  url: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction',
  excerpt:
    'The primary health effect associated with diets high in sodium is raised blood pressure which increases the risk of cardiovascular diseases, gastric cancer, obesity, osteoporosis, Meniere’s disease, and kidney disease. For adults, WHO recommends less than 2000 mg/day of sodium (equivalent to less than 5 g/day salt), or just under a teaspoon. For children aged 2–15 years, WHO recommends adjusting the adult dose downward based on their energy requirements.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2026',
  tier: 'local',
};

const EFSA_SUCRALOSE = {
  id: 'W1',
  title: 'EFSA：三氯蔗糖（E 955）再评估新闻稿',
  organization: '欧洲食品安全局（EFSA）',
  sourceType: 'verified_local',
  url: 'https://www.efsa.europa.eu/en/news/efsa-finds-sucralose-safe-when-used-currently-authorised-cannot-confirm-safety-extending-its',
  excerpt:
    'EFSA’s experts concluded that the sweetener sucralose (E 955) continues to be safe for consumers for its currently authorised uses as a food additive. Following a comprehensive review of all available scientific data, they confirmed the Acceptable Daily Intake (ADI) of 15 mg/kg body weight per day and indicated that current consumer exposure remains below this level. However, EFSA could not confirm the safety of additional uses of sucralose. A recent study found that when E 955 is exposed to high temperatures for long periods, chlorine can migrate from sucralose and potentially form chlorinated compounds, the health effects of which are unknown.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2026',
  tier: 'local',
};

const EFSA_MSG_2017 = {
  id: 'W1',
  title: 'EFSA：谷氨酸盐（E 620–625）再评估新闻稿（2017）',
  organization: '欧洲食品安全局（EFSA）',
  sourceType: 'verified_local',
  url: 'https://www.efsa.europa.eu/en/press/news/170712',
  excerpt:
    'EFSA re-assessed the safety of glutamates used as food additives and derived a group acceptable daily intake (ADI) of 30 mg/kg body weight per day for all six of these additives. This safe level of intake is based on the highest dose at which scientists observed no adverse effects on test animals in toxicity studies. In a refined exposure assessment, EFSA estimated that exposure to glutamates added to food may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives, as well as for toddlers and children with medium exposure. Exposure may also exceed doses associated with some adverse effects in humans (e.g. headache) for highly exposed infants, children and adolescents. The Panel noted doses that have been associated with certain effects in humans, such as headache, raised blood pressure and increased insulin levels.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2017-07-12',
  tier: 'local',
};

const JECFA_MSG = {
  id: 'W1',
  title: 'SODIUM GLUTAMATE（JECFA 评估数据库）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'verified_local',
  url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/2267',
  excerpt:
    'SODIUM GLUTAMATE. Synonyms SODIUM GLUTAMATE; MSG. INS 621. Functional Class Food Additives FLAVOUR_ENHANCER. Evaluations. Evaluation year: 1987. ADI: NOT SPECIFIED. Comments: Group ADI for L-glutamic acid and its ammonium, calcium, monosodium, magnesium and potassium salts. Report: TRS 759-JECFA 31/29.',
  excerptType: 'fetched_excerpt',
  publishedAt: '1987',
  tier: 'local',
};

const GLOSSARY = {
  id: 'W2',
  title: 'FAO/WHO 联合文件 · 术语表（ANNEX 4: GLOSSARY）',
  organization: '联合国粮食及农业组织（FAO）',
  sourceType: 'verified_local',
  url: 'https://www.fao.org/docrep/012/i1357e/i1357e02.pdf',
  excerpt:
    'Acceptable daily intake (ADI): An estimate of the amount of a substance in food or drinking-water, expressed on a body weight basis (usually milligrams per kilogram body weight), that can be ingested daily over a lifetime by humans without appreciable health risks. Acceptable daily intake "not limited": A term no longer used by the Joint FAO/WHO Expert Committee on Food Additives, which has the same meaning as acceptable daily intake "not specified". Acceptable daily intake "not specified": A term applicable to a food substance of very low toxicity that, on the basis of the available chemical, biochemical and toxicological data as well as the total dietary intake of the substance, does not, in the opinion of the Joint FAO/WHO Expert Committee on Food Additives, represent a hazard to health.',
  excerptType: 'fetched_excerpt',
  publishedAt: null,
  tier: 'local',
};

const JECFA_ACETIC = {
  id: 'W1',
  title: 'GLACIAL ACETIC ACID（JECFA 评估数据库）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'verified_local',
  url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/1461',
  excerpt:
    'GLACIAL ACETIC ACID. Chemical Names: Acetic acid. INS 260. Functional Class: Food Additives, ACIDITY_REGULATOR, FLAVOURING_AGENT. Evaluations. Evaluation year: 2004. ADI: No safety concern at current levels of intake when used as a flavouring agent. Comments: The group ADI "not limited" for acetic acid and its potassium and sodium salts, established in 1973, was maintained.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2004',
  tier: 'local',
};

const JECFA_LACTIC = {
  id: 'W1',
  title: 'LACTIC ACID（JECFA 评估数据库）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'verified_local',
  url: 'https://apps.who.int/food-additives-contaminants-jecfa-database/chemical.aspx?chemID=3367',
  excerpt:
    'LACTIC ACID. INS 270. Functional Class: Food Additives, ACIDITY_REGULATOR, FLAVOURING_AGENT. Evaluations. Evaluation year: 2001. ADI: No safety concern at current levels of intake when used as a flavouring agent. Previous Years: 1973, ADI: NOT LIMITED. Comments: NEITHER D(-)-LACTIC ACID NOR DL-LACTIC ACID SHOULD BE USED IN INFANT FOODS.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2001',
  tier: 'local',
};

/**
 * 每个条目只保存「原始输出」，展示前统一跑校验器。
 * name / aliases 用于 H8「资料有没有提到这个物质」的核对。
 */
export const DEMO_HEALTH_CASES = [
  {
    name: '白砂糖',
    aliases: ['white sugar', 'sugar', 'free sugars'],
    basis: 'WHO《Sugars and dental caries》fact sheet（2025-08-14）',
    sources: [WHO_SUGAR_CARIES],
    raw: {
      consumerTakeaway: {
        text: '长期摄入过多游离糖会增加龋齿风险，也是超重和肥胖的主要风险因素之一。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'Consumption of free sugars is a major risk factor for overweight, obesity and dental caries.',
        conditions: '针对长期膳食模式；白砂糖作为添加糖属于游离糖；不是指吃一次就会致病',
        sourceYear: '2025',
      },
      normalIntake: {
        text: 'WHO 建议把游离糖控制在每日总能量的 10% 以内，最好低于 5%。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'Limiting the intake of free sugars to less than 10% of total energy intake – and ideally to less than 5% – minimizes the risk of dental caries throughout the life course.',
        conditions: '针对游离糖（包括添加的白砂糖）',
        sourceYear: '2025',
      },
      highIntake: {
        text: '长期高摄入游离糖、同时缺少氟化物暴露和有效刷牙时，会促进龋齿发生。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'A continued high intake of free sugars, inadequate exposure to fluoride and a lack of removal of plaque by toothbrushing with fluoride toothpaste containing 1000-1500 ppm concentration can lead to dental caries.',
        conditions: '需要同时存在其他风险因素；不是单次食用的后果',
        sourceYear: '2025',
      },
    },
  },
  {
    name: '食用盐',
    aliases: ['salt', 'sodium', 'table salt', 'sodium chloride'],
    basis: 'WHO《Sodium reduction》fact sheet（2026-05-11）',
    sources: [WHO_SODIUM],
    raw: {
      consumerTakeaway: {
        text: 'WHO 指出，膳食钠过高的主要健康影响是血压升高，并增加心血管疾病等风险。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'The primary health effect associated with diets high in sodium is raised blood pressure which increases the risk of cardiovascular diseases',
        conditions: '针对膳食钠整体摄入，不是单指这一包食品',
        sourceYear: '2026',
      },
      normalIntake: {
        text: 'WHO 建议成年人每天钠摄入少于 2000 mg，相当于每天少于 5 g 食盐。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'For adults, WHO recommends less than 2000 mg/day of sodium (equivalent to less than 5 g/day salt)',
        conditions: '成年人',
        sourceYear: '2026',
      },
      highIntake: {
        text: '长期钠摄入过高与血压升高相关，并因此增加心血管疾病等风险。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'The primary health effect associated with diets high in sodium is raised blood pressure which increases the risk of cardiovascular diseases',
        conditions: '长期膳食摄入过高',
        sourceYear: '2026',
      },
      sensitiveGroups: {
        text: '2–15 岁儿童应按能量需要量把成年人的建议量向下调整。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'For children aged 2–15 years, WHO recommends adjusting the adult dose downward based on their energy requirements',
        conditions: '2–15 岁儿童',
        sourceYear: '2026',
      },
    },
  },
  {
    name: '三氯蔗糖',
    aliases: ['sucralose'],
    basis: 'EFSA 三氯蔗糖（E 955）再评估新闻稿（2026-02-17）',
    sources: [EFSA_SUCRALOSE],
    raw: {
      consumerTakeaway: {
        text: 'EFSA 的再评估确认，三氯蔗糖在目前获准的用途下对消费者是安全的，消费者暴露量低于 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'EFSA’s experts concluded that the sweetener sucralose (E 955) continues to be safe for consumers for its currently authorised uses as a food additive',
        conditions: '仅限目前获准的食品用途；长时间高温烘焙等新用途不在这个结论内',
        sourceYear: '2026',
      },
      normalIntake: {
        text: 'EFSA 的再评估确认 ADI 仍为 15 mg/kg 体重，并认为当前各人群的暴露量低于这个水平。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'they confirmed the Acceptable Daily Intake (ADI) of 15 mg/kg body weight per day and indicated that current consumer exposure remains below this level',
        conditions: '目前获准的用途',
        sourceYear: '2026',
      },
    },
  },
  {
    name: '谷氨酸钠',
    aliases: ['glutamic acid', 'glutamate', 'msg'],
    basis: 'EFSA 谷氨酸盐（E 620–625）再评估新闻稿（2017-07-12）',
    sources: [EFSA_MSG_2017],
    raw: {
      consumerTakeaway: {
        text: 'EFSA 的再评估认为，饮食中这类添加剂较多的人，谷氨酸盐摄入量可能超过 30 mg/kg 体重的组 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'exposure to glutamates added to food may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives',
        conditions: '针对高消费人群；不是指偶尔吃一次就会超过',
        sourceYear: '2017',
      },
      normalIntake: {
        text: 'EFSA 的评估结论是：部分高消费人群以及中等暴露的幼儿、儿童，谷氨酸盐摄入量可能超过 30 mg/kg 体重的组 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'may exceed the proposed ADI for individuals of all population groups whose diet is high in foods containing these additives, as well as for toddlers and children with medium exposure',
        conditions: '欧盟膳食暴露评估；组 ADI 以谷氨酸计',
        sourceYear: '2017',
      },
      highIntake: {
        text: 'EFSA 指出，高暴露的婴幼儿、儿童和青少年，摄入量可能超过与头痛等不良反应相关的剂量。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'Exposure may also exceed doses associated with some adverse effects in humans (e.g. headache) for highly exposed infants, children and adolescents',
        conditions: '人体不良反应包括头痛、血压升高和胰岛素水平升高；针对高暴露人群',
        sourceYear: '2017',
      },
      sensitiveGroups: {
        text: '饮食中谷氨酸盐较多的人，以及中等暴露的幼儿和儿童，摄入量可能超过 ADI。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote: 'as well as for toddlers and children with medium exposure',
        conditions: '幼儿与儿童（中等及以上暴露）',
        sourceYear: '2017',
      },
    },
  },
  {
    name: '冰乙酸',
    aliases: ['acetic acid'],
    basis: 'JECFA 冰乙酸条目（2004）',
    sources: [JECFA_ACETIC, GLOSSARY],
    raw: {
      consumerTakeaway: {
        text: 'JECFA 在 2004 年的评估认为，乙酸作为调味剂在当前摄入水平下没有安全关切。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'ADI: No safety concern at current levels of intake when used as a flavouring agent',
        conditions: '作为调味剂（flavouring agent）使用时的当前摄入水平',
        sourceYear: '2004',
      },
      normalIntake: {
        text: 'JECFA 对乙酸及其钾盐、钠盐维持了 1973 年确立的组 ADI「not limited」。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'THE GROUP ADI "NOT LIMITED" FOR ACETIC ACID AND ITS POTASSIUM AND SODIUM SALTS ESTABLISHED AT THE SEVENTEENTH MEETING IN 1973 WAS MAINTAINED',
        conditions: '乙酸及其钾盐、钠盐的组 ADI',
        sourceYear: '1973',
      },
    },
  },
  {
    name: '乳酸',
    aliases: ['lactic acid'],
    basis: 'JECFA 乳酸条目（2001 / 1973）',
    sources: [JECFA_LACTIC],
    raw: {
      consumerTakeaway: {
        text: 'JECFA 在 2001 年的评估认为，乳酸作为调味剂在当前摄入水平下没有安全关切。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'No safety concern at current levels of intake when used as a flavouring agent',
        conditions: '作为调味剂使用时的当前摄入水平',
        sourceYear: '2001',
      },
      sensitiveGroups: {
        text: '婴儿食品不应使用 D(-)-乳酸或 DL-乳酸。',
        evidenceStatus: 'authoritative',
        sourceRefs: ['W1'],
        quote:
          'NEITHER D(-)-LACTIC ACID NOR DL-LACTIC ACID SHOULD BE USED IN INFANT FOODS',
        conditions: '针对婴儿食品',
        sourceYear: '1973',
      },
    },
  },
];

const INDEX = new Map(DEMO_HEALTH_CASES.map((c) => [c.name, c]));

/**
 * 构建某成分的演示健康数据。
 * 返回结构与真实研究结果一致（healthSchema / healthInsights / healthAnswers…），
 * 但额外带 demoCurated 标记，界面据此说明「人工整理、没有联网」。
 */
export function buildDemoHealth(name) {
  const c = INDEX.get(String(name || '').trim());
  if (!c) return null;

  const health = validateHealthInsights({
    raw: c.raw,
    evidenceSet: c.sources,
    ingredientName: c.name,
    aliases: c.aliases,
  });
  const consumerEvidence = organizeConsumerEvidence({ insights: health.insights, sources: c.sources, name: c.name, aliases: c.aliases });
  health.insights = Object.keys(consumerEvidence.slots).length ? consumerEvidence.slots : null;
  const { healthAnswers, healthScore } = summarizeHealthAnswers({
    insights: health.insights,
    rejected: health.rejected,
    evidenceFacts: consumerEvidence.facts,
  });
  const unanswered = ['normalIntake', 'highIntake', 'sensitiveGroups'].filter(
    (k) => healthAnswers[k].status !== 'answered',
  );
  const coverage = findHealthEvidence(c.sources, {
    names: [c.name, ...c.aliases],
  });

  return {
    consumerEvidence,
    healthSchema: HEALTH_SCHEMA_VERSION,
    healthInsights: health.insights,
    healthRejected: health.rejected,
    healthStats: health.stats,
    healthStatus: health.insights ? 'available' : 'unavailable',
    healthAnswers,
    healthScore,
    healthUnanswered: unanswered,
    healthCoverage: coverage,
    healthRoundUsed: false,
    healthProvenance: 'curated',
    healthBasis: c.basis,
    healthReviewedAt: '2026-11-04',
    sources: c.sources,
  };
}
