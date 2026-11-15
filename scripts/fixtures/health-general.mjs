/**
 * 统一健康流程的「非添加剂」样本（官方资料回放，不联网、不调用付费 API）。
 *
 * 这组样本用来说明：同一套「正常吃 / 吃多了 / 谁要注意」流程，
 * 对普通食材、类别写法、本地未收录成分同样适用 —— 只是回答方式不同：
 *
 *   食用盐   普通食材，但有明确的膳食建议与高钠影响证据（WHO）
 *   白砂糖   普通食材，只有膳食建议（游离糖上限），没有具体后果证据
 *   香辛料   类别写法，本来就没有针对「这个类别」的健康评估
 *   未知成分 本地未收录、检索也没有取得评估资料
 *
 * 证据逐字取自：
 *  - WHO《Sodium reduction》fact sheet（2026-05-11 版）
 *  - WHO《Healthy diet》fact sheet（2026-01-26 版）
 */

const WHO_SODIUM = {
  id: 'W1',
  title: 'WHO Fact sheet：Sodium reduction（减钠）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'fetch_content',
  url: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction',
  excerpt:
    'The primary health effect associated with diets high in sodium is raised blood pressure which increases the risk of cardiovascular diseases, gastric cancer, obesity, osteoporosis, Meniere’s disease, and kidney disease. For adults, WHO recommends less than 2000 mg/day of sodium (equivalent to less than 5 g/day salt), or just under a teaspoon. For children aged 2–15 years, WHO recommends adjusting the adult dose downward based on their energy requirements. Excess sodium is linked to adverse health outcomes including increased blood pressure.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2026',
  tier: 'web_body',
};

const WHO_SUGAR_CARIES = {
  id: 'W1',
  title: 'WHO Fact sheet：Sugars and dental caries（糖与龋齿）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'fetch_content',
  url: 'https://www.who.int/news-room/fact-sheets/detail/sugars-and-dental-caries',
  excerpt:
    'The consumption of free sugars in foods and beverages is the most common risk factor for dental caries and is a shared risk factor across several NCDs. Limiting the intake of free sugars to less than 10% of total energy intake – and ideally to less than 5% – minimizes the risk of dental caries throughout the life course. Consumption of free sugars is a major risk factor for overweight, obesity and dental caries. A continued high intake of free sugars, inadequate exposure to fluoride and a lack of removal of plaque by toothbrushing with fluoride toothpaste containing 1000-1500 ppm concentration can lead to dental caries. Free sugars include all monosaccharides and disaccharides added to foods and beverages by the manufacturer, cook or consumer, as well as sugars naturally present in honey, syrups, fruit juices and fruit juice concentrates.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2025',
  tier: 'web_body',
};

const WHO_SUGAR_GUIDELINE = {
  id: 'W2',
  title: 'WHO Guideline：sugars intake for adults and children（2015）',
  organization: '世界卫生组织（WHO）',
  sourceType: 'fetch_content',
  url: 'https://www.who.int/publications/i/item/9789241549028',
  excerpt:
    'This guideline provides updated global, evidence-informed recommendations on the intake of free sugars to reduce the risk of NCDs in adults and children, with a particular focus on the prevention and control of unhealthy weight gain and dental caries.',
  excerptType: 'fetched_excerpt',
  publishedAt: '2015',
  tier: 'web_body',
};

const sectionOf = (section, text, ref) => ({
  id: `${section}-1`,
  section,
  text,
  sourceRefs: [ref],
  limitations: null,
});

export const GENERAL_CASES = [
  {
    key: 'salt',
    name: '食用盐',
    aliases: ['salt', 'sodium', 'table salt', 'sodium chloride'],
    kind: 'food_ingredient',
    identity: { type: 'food_ingredient', label: '普通食品配料', note: '氯化钠' },
    sources: [WHO_SODIUM],
    model: {
      brief: {
        what: '食用盐的主要成分是氯化钠，属于普通食品原料和调味料，不是食品添加剂。',
        why: '它提供咸味、增强风味；在食品工业里也用于防腐和加工。',
        howToUnderstand:
          '它对应营养成分表里的「钠」。想控制钠摄入，看营养标签的钠含量比看配料表有用。',
        sourceRefs: ['W1'],
      },
      sections: [
        sectionOf('what', '食用盐的主要成分是氯化钠，是普通食品原料，不是食品添加剂。', 'W1'),
        sectionOf(
          'limits',
          '配料表不标注用了多少盐；钠的具体数值在营养成分表里。',
          'W1',
        ),
      ],
      healthInsights: {
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
    expect: { headline: true, normal: true, high: true, sensitive: true },
  },

  {
    key: 'sugar',
    name: '白砂糖',
    aliases: ['white sugar', 'sugar', 'free sugars', 'sucrose'],
    kind: 'food_ingredient',
    identity: { type: 'food_ingredient', label: '普通食品配料', note: '蔗糖' },
    sources: [WHO_SUGAR_CARIES, WHO_SUGAR_GUIDELINE],
    model: {
      brief: {
        what: '白砂糖是以甘蔗或甜菜为原料制得的糖，属于普通食品原料，不是食品添加剂。',
        why: '提供甜味，在烘焙里影响上色、口感和保质期。',
        howToUnderstand:
          '它属于「糖」，营养标签上「糖」这一项就包含它；白砂糖不是甜味剂。',
        sourceRefs: ['W1'],
      },
      sections: [
        sectionOf(
          'what',
          '白砂糖是普通食品原料，属于添加糖；按 WHO 的定义，添加糖计入游离糖。',
          'W1',
        ),
      ],
      healthInsights: {
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
    expect: { headline: true, normal: false, high: true, sensitive: false },
  },

  {
    key: 'spice',
    name: '香辛料',
    aliases: [],
    kind: 'category',
    identity: { type: 'uncertain', label: '类别型写法', note: '配料表类别' },
    sources: [],
    model: {
      brief: {
        what: '「香辛料」是配料表里的类别写法，指用来赋香、赋味的植物性原料。',
        why: '这类原料通常直接提供香气和辛香风味；包装有时只写类别，不逐一列出品种。',
        howToUnderstand:
          '只写「香辛料」而没有展开时，无法知道具体用了哪一种，不能凭常识补成辣椒、八角或花椒。',
        sourceRefs: [],
      },
      sections: [],
      healthInsights: null,
    },
    expect: { headline: false, normal: false, high: false, sensitive: false },
  },

  {
    key: 'unknown',
    name: '竹叶黄酮提取物',
    aliases: ['bamboo leaf flavonoid extract'],
    kind: 'unknown',
    identity: { type: 'uncertain', label: '当前资料不足以确定', note: '本地未收录' },
    sources: [],
    model: {
      brief: {
        what: '本次检索只取得名称与用途描述，未能确认它的具体成分与规格。',
        why: '资料称它用于提供抗氧化或风味，但没有取得可核对的评估资料。',
        howToUnderstand:
          '名称听起来像植物提取物，但没有资料说明它的组成，不能据此推断安全性。',
        sourceRefs: [],
      },
      sections: [],
      healthInsights: null,
    },
    expect: { headline: false, normal: false, high: false, sensitive: false },
  },

  {
    key: 'bamboo',
    name: '竹笋',
    aliases: ['bamboo shoots'],
    kind: 'food_ingredient',
    identity: { type: 'food_ingredient', label: '普通食品配料', note: '蔬菜原料' },
    sources: [],
    model: {
      brief: {
        what: '竹笋是普通蔬菜原料，不是食品添加剂。',
        why: '在这类腌渍食品里提供脆度和口感，也带来本身的纤维。',
        howToUnderstand:
          '它是配料表里的普通食材；普通食材通常不按食品添加剂的方式设定摄入上限。',
        sourceRefs: [],
      },
      sections: [],
      healthInsights: null,
    },
    expect: { headline: false, normal: false, high: false, sensitive: false },
  },

  {
    key: 'polylysine',
    name: '聚赖氨酸盐酸盐',
    aliases: ['epsilon-polylysine', 'polylysine'],
    kind: 'unknown',
    identity: { type: 'uncertain', label: '当前资料不足以确定', note: '本地未收录的防腐剂' },
    sources: [],
    model: {
      brief: {
        what: '配料表里的名称指向一种防腐剂，但本次没有取得可核对的条目。',
        why: '资料只说明它用于抑制微生物，没有给出适用范围与评估结论。',
        howToUnderstand:
          '本地知识库没有收录它；名称陌生不代表有问题，也不代表可以放心，先确认身份。',
        sourceRefs: [],
      },
      sections: [],
      healthInsights: null,
    },
    expect: { headline: false, normal: false, high: false, sensitive: false },
  },
];
