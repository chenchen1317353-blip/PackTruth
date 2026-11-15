/**
 * V2.5 八个验收案例（官方资料回放，不联网、不调用付费 API）。
 *
 * 重要区分：
 * - evidence 里的正文逐字取自官方页面/报告（URL 见每条）；
 * - model 里的健康回答是**人工整理**的测试输入，不是实时 Chat 输出；
 * - 每条回答都会经过真实的 validateHealthInsights / validateFoodMeaning，
 *   quote 必须能在 evidence 里逐字找到，数字必须出现在来源里；
 * - 因此这里验证的是「证据发现 → 结论准入 → 展示」这条链路，
 *   不是「DeepSeek 实时搜索是否命中」。真实联调状态见最终报告。
 *
 * 每个案例还带 before 字段：上一版实际展示给用户的健康信息（来自
 * PACKTRUTH_DEEP_HEALTH_RESEARCH_REPORT.md 与 runtime-output/shots-deep 的 BEFORE 截图）。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const JECFA_INS635 = readFileSync(join(HERE, 'jecfa-ins635.txt'), 'utf8');

const src = (id, title, organization, url, excerpt, publishedAt = null) => ({
  id,
  title,
  organization,
  sourceType: 'fetch_content',
  url,
  excerpt,
  excerptType: 'fetched_excerpt',
  publishedAt,
  tier: 'web_body',
});

export const ACCEPTANCE_CASES = [
  // ------------------------------------------------------------ 1. INS 635
  {
    key: 'ins635',
    name: '5′-呈味核苷酸二钠',
    aliases: ['呈味核苷酸二钠', 'ribonucleotide', 'disodium 5-ribonucleotides'],
    ins: 'INS 635',
    foodContext: { productName: '山椒脆笋', category: '酱腌菜' },
    before:
      '旧版只得到「它是增味剂、不是防腐剂、没有找到针对它的健康评估」，深入分析主要是 GB 2760 与用途。',
    evidence: [
      src(
        'W1',
        "788. Disodium 5'-guanylate and disodium 5'-inosinate (WHO Food Additives Series 32)",
        'IPCS INCHEM / JECFA',
        'https://www.inchem.org/documents/jecfa/jecmono/v32je06.htm',
        JECFA_INS635,
        '1989-01-01',
      ),
    ],
    model: {
      identity: {
        type: 'additive',
        label: '食品添加剂 · 增味剂',
        note: 'JECFA 将这两种 5′-核苷酸二钠作为增味剂联合评估',
      },
      healthInsights: {
        consumerTakeaway: {
          text: 'JECFA 对两种组成物质的联合评估认为，作为增味剂的总摄入量没有毒理学意义。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            "the combined total daily intake of disodium 5'-guanylate and disodium 5'-inosinate is not of toxicological significance",
          conditions: '组成物质联合评估；针对增味剂用途；不等于可以无限量使用',
          sourceYear: '1989',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'constituent',
        },
        normalIntake: {
          text: 'JECFA 重新确认 ADI「无需规定」，并认为增味剂用途的暴露远低于膳食天然核苷酸的摄入量。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'Because exposure to these substances from their use as flavour enhancers is low compared with daily intake of naturally occurring nucleotides in the diet',
          conditions: '针对增味剂用途；ADI「无需规定」不等于可以任意添加',
          sourceYear: '1989',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'constituent',
        },
        highIntake: {
          text:
            '一项 3 名健康男性的研究中，每天 2 000 mg 的 50:50 混合物使血尿酸和尿尿酸显著升高，但仍在正常范围；4 000 mg/天时超出正常范围。',
          evidenceStatus: 'conditional',
          sourceRefs: ['W1'],
          quote: 'doses of 2 000 and 4 000 mg/day caused significant increases in both measures',
          conditions:
            '人体研究；50:50 混合物；每种剂量 5 天；研究剂量不能等同于这款食品的实际添加量',
          sourceYear: '1989',
          studyType: 'human',
          studyContext: '3 名健康男性；2 000–4 000 mg/天；每种剂量 5 天；血尿酸和尿尿酸',
          evidenceBasis: 'constituent',
        },
      },
      foodMeaning: {
        text:
          '这些证据针对的是它作为增味剂的一般使用，不针对某一款食品的检测结果；配料表没有标示实际添加量，不能据此换算。',
        sourceRefs: ['W1'],
        conditions: '适用于一般食品用途；研究剂量不是产品添加量',
        studyType: 'assessment',
        evidenceBasis: 'constituent',
      },
    },
    expect: {
      normal: 'answered',
      high: 'answered',
      sensitive: 'missing',
      basis: 'constituent',
      mustInclude: ['尿酸', '2 000', '4 000', '3 名健康男性'],
      mustNotInclude: ['正常吃会引发痛风', '每天最多吃几包'],
      coverage: { normal: 'direct', high: 'human' },
    },
  },

  // ------------------------------------------------------------ 2. 谷氨酸钠
  {
    key: 'msg',
    name: '谷氨酸钠',
    aliases: ['味精', 'monosodium glutamate', 'glutamate'],
    ins: 'INS 621',
    foodContext: { productName: '香辣味薯片', category: '膨化食品' },
    before: '旧版大字是「ADI 无需规定」或「总膳食摄入不构成健康危害」，没有高暴露人群与头痛/血压剂量。',
    evidence: [
      src(
        'W1',
        'Re-evaluation of glutamic acid (E 620) and glutamates (E 621–E 625) as food additives',
        '欧洲食品安全局（EFSA）',
        'https://efsa.onlinelibrary.wiley.com/doi/full/10.2903/j.efsa.2017.4910',
        'The value of 27.8 mg glutamate/kg bw per day was rounded to derive a group ADI of 30 mg/kg bw per day, expressed as glutamic acid. The Panel noted that the ADI is below the doses which have been associated with the MSG symptom complex (> 42.9 mg/kg bw per day), headache (85.8 mg/kg bw per day), blood pressure increase (150 mg/kg bw per day) and also insulin increase (> 143 mg/kg bw per day) in humans. The Panel noted that in the non-brand-loyal scenario, the mean exposure exceeded the dose which has been associated with the MSG symptom complex (> 42.9 mg/kg bw per day) in toddlers and children, and the high exposure (95th percentile) in infants, toddlers, children and adolescents.',
        '2017-07-12',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 增味剂', note: 'EFSA 按谷氨酸及其盐整组评估' },
      healthInsights: {
        consumerTakeaway: {
          text:
            'EFSA 把谷氨酸及其盐作为一组评估，组 ADI 为 30 mg/kg 体重/天；部分幼儿、儿童和青少年的估算高暴露超过与不良反应相关的剂量。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'the high exposure (95th percentile) in infants, toddlers, children and adolescents',
          conditions: '组评估；以谷氨酸计；估算暴露，不是这款食品的实际含量',
          sourceYear: '2017',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'group',
        },
        normalIntake: {
          text:
            'EFSA 给出的组 ADI 是 30 mg/kg 体重/天（以谷氨酸计），并指出按现行允许用途估算，部分人群的平均或高暴露会超过这个参考值。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'The value of 27.8 mg glutamate/kg bw per day was rounded to derive a group ADI of 30 mg/kg bw per day, expressed as glutamic acid.',
          conditions: '组 ADI；基于估算暴露；不是这款产品的检测结果',
          sourceYear: '2017',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'group',
        },
        highIntake: {
          text:
            'EFSA 汇总的人体研究把 MSG 症状复合体与约 42.9 mg/kg 体重/天、头痛与约 85.8、血压升高与约 150、胰岛素升高与约 143 mg/kg 体重/天联系起来；这些是研究中的相关剂量，不是正常吃一次的后果。',
          evidenceStatus: 'conditional',
          sourceRefs: ['W1'],
          quote:
            'headache (85.8 mg/kg bw per day), blood pressure increase (150 mg/kg bw per day) and also insulin increase (> 143 mg/kg bw per day) in humans',
          conditions: '人体研究汇总；相关剂量；不能换算成这款食品的食用量',
          sourceYear: '2017',
          studyType: 'human',
          studyContext: '人体研究汇总；42.9–150 mg/kg 体重/天；MSG 症状复合体、头痛、血压、胰岛素',
          evidenceBasis: 'group',
        },
        sensitiveGroups: {
          text:
            '婴幼儿、幼儿和儿童的高暴露（95th percentile）可能超过与不良反应相关的剂量；EFSA 特别提到婴儿的高暴露需要进一步评估。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'the high exposure (95th percentile) in infants, toddlers, children and adolescents',
          conditions: '按 EFSA 的暴露情景；不是对某个孩子的诊断',
          sourceYear: '2017',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'group',
        },
      },
      foodMeaning: {
        text:
          '如果这款食品属于 EFSA 估算中贡献较大的类别（如膨化食品、焙烤食品、汤、酱料、调味品），上面的暴露结论更相关；但配料表没有标示谷氨酸盐的实际含量，不能据此推算这一份的摄入量。',
        sourceRefs: ['W1'],
        conditions: '按食品类别判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'group',
      },
    },
    expect: {
      normal: 'answered',
      high: 'answered',
      sensitive: 'answered',
      basis: 'group',
      mustInclude: ['30 mg/kg', '42.9', '85.8', '150', '婴幼儿'],
      mustNotInclude: ['超过 ADI 就会中毒', '所有人都会头痛'],
      coverage: { normal: 'direct', high: 'human', sensitive: 'named' },
    },
  },

  // ------------------------------------------------------------ 3. 三氯蔗糖
  {
    key: 'sucralose',
    name: '三氯蔗糖',
    aliases: ['蔗糖素', 'sucralose'],
    ins: 'INS 955',
    foodContext: { productName: '无糖焙烤饼干', category: '饼干' },
    before: '旧版只到「甜味剂、ADI 15 mg/kg」，没有 EFSA 2026 的高温加工不确定性与焙烤用途限制。',
    evidence: [
      src(
        'W1',
        'Re-evaluation of sucralose (E 955) as a food additive and evaluation of a new application on extension of use in fine bakery wares',
        '欧洲食品安全局（EFSA）',
        'https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2026.9854',
        'The Panel considered it appropriate to derive chemical-specific assessment factor for sucralose and concluded that there is no need to revise the current ADI of 15 mg/kg bw per day of sucralose (E 955) previously established by the Scientific Committee for Food. The exposure estimates considering the currently authorised uses did not exceed the ADI. Therefore, the Panel concluded that there is no safety concern at the reported uses and use levels of sucralose (E 955). However, based on the available data and the identified uncertainties regarding the potential formation of chlorinated compounds under the wide range of baking processes that may be applicable for FC 7.2, the Panel could not conclude on the safety of the proposed extension of use of E 955 in this FC.',
        '2026-02-17',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: 'EFSA 2026 再评估' },
      healthInsights: {
        consumerTakeaway: {
          text:
            'EFSA 维持三氯蔗糖 ADI 15 mg/kg 体重/天，认为现行允许用途的暴露低于 ADI、没有安全担忧；但不能确认在更多焙烤用途中长时间高温加热的安全性。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'there is no safety concern at the reported uses and use levels of sucralose (E 955)',
          conditions: '现行允许用途；新增焙烤用途未被确认；不是这款产品的检测结果',
          sourceYear: '2026',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        normalIntake: {
          text:
            'EFSA 对现行允许用途的暴露估计没有超过 ADI，因此认为在这些用途和用量下没有安全担忧。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'The exposure estimates considering the currently authorised uses did not exceed the ADI.',
          conditions: '现行允许用途；不覆盖新增焙烤用途',
          sourceYear: '2026',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        highIntake: {
          text:
            '本次资料没有给出正常食用之外的高摄入人体后果；EFSA 的不确定性集中在长时间高温加工时可能形成氯化物，其健康影响尚不清楚。',
          evidenceStatus: 'insufficient',
          sourceRefs: ['W1'],
          quote:
            'the Panel could not conclude on the safety of the proposed extension of use of E 955 in this FC',
          conditions: '针对高温焙烤/油炸；不是正常冲调或冷饮',
          sourceYear: '2026',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
      },
      foodMeaning: {
        text:
          '如果这款食品是焙烤或油炸类，且使用了三氯蔗糖，EFSA 对高温加工的不确定性更相关；但这次评估没有确认新增焙烤用途，也没有给出这款产品的实际用量。',
        sourceRefs: ['W1'],
        conditions: '按食品类别和加工方式判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'direct',
      },
    },
    expect: {
      normal: 'answered',
      high: 'missing',
      sensitive: 'missing',
      basis: 'direct',
      mustInclude: ['15 mg/kg', '高温', '焙烤', '氯化物'],
      mustNotInclude: ['三氯蔗糖会致癌', '正常吃会中毒'],
      coverage: { normal: 'direct', high: 'reference' },
    },
  },

  // ------------------------------------------------------------ 4. 焦亚硫酸钠
  {
    key: 'sulfite',
    name: '焦亚硫酸钠',
    aliases: ['sodium metabisulfite', 'sulfite'],
    ins: 'INS 223',
    foodContext: { productName: '蜜饯果干', category: '果脯' },
    before: '旧版只说明「漂白剂/防腐剂、按标准使用」，没有亚硫酸盐敏感人群与哮喘反应。',
    evidence: [
      src(
        'W1',
        'FDA Import Alert 99-21: Undeclared Added Sulfiting Agents',
        '美国食品药品监督管理局（FDA）',
        'https://www.accessdata.fda.gov/cms_IA/importalert_265.html',
        'Under 21 CFR 101.100(a)(3), if an ingredient is present at an incidental level (present at less than 10 ppm (21 CFR 101.100(a)(4)) and has no functional or technical effect in the finished product, then it need not be declared on the label.',
        '2026-09-10',
      ),
      src(
        'W2',
        'Euroline Foods LLC Issues Alert on Undeclared Sulfites in Dry Fruit Mix',
        '美国食品药品监督管理局（FDA）',
        'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/euroline-foods-llc-issues-alert-undeclared-sulfites-dry-fruit-mix-quince-compote-tainy-vostoka',
        'The consumption of 10 milligrams of sulfites per serving has been reported to elicit severe reaction in some asthmatics. Anaphylactic shock could occur in certain sulfite sensitive individuals upon ingesting 10 milligrams or more of sulfites.',
        '2019-11-21',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 漂白剂/防腐剂', note: '亚硫酸盐类' },
      healthInsights: {
        consumerTakeaway: {
          text:
            '部分哮喘患者和亚硫酸盐敏感个体在摄入亚硫酸盐后可能出现严重过敏样反应；FDA 的标签规则要求达到 10 ppm 时声明。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W2'],
          quote:
            'Anaphylactic shock could occur in certain sulfite sensitive individuals upon ingesting 10 milligrams or more of sulfites.',
          conditions: '部分敏感个体；报告剂量为每份 10 mg；不是所有人都会反应',
          sourceYear: '2019',
          studyType: 'human',
          studyContext: 'FDA 不良事件报告；部分哮喘患者；每份 10 mg 亚硫酸盐',
          evidenceBasis: 'direct',
        },
        normalIntake: {
          text:
            'FDA 规定食品中亚硫酸盐达到 10 ppm 或以上时需要在标签上声明；这是标签要求，不是安全摄入量。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'present at less than 10 ppm (21 CFR 101.100(a)(4)) and has no functional or technical effect in the finished product',
          conditions: '标签规则；不是健康摄入上限',
          sourceYear: '2026',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        highIntake: {
          text:
            '摄入每份 10 mg 或以上亚硫酸盐时，部分哮喘患者可能出现严重反应，某些亚硫酸盐敏感个体可能发生过敏性休克。',
          evidenceStatus: 'conditional',
          sourceRefs: ['W2'],
          quote:
            'The consumption of 10 milligrams of sulfites per serving has been reported to elicit severe reaction in some asthmatics.',
          conditions: '部分哮喘患者/亚硫酸盐敏感个体；报告剂量不是这款食品的实际含量',
          sourceYear: '2019',
          studyType: 'human',
          studyContext: 'FDA 不良事件报告；部分哮喘患者；每份 10 mg 亚硫酸盐',
          evidenceBasis: 'direct',
        },
        sensitiveGroups: {
          text:
            '部分哮喘患者和亚硫酸盐敏感人群需要特别注意；FDA 的报告说，严重反应出现在部分哮喘患者中，过敏性休克可能出现在某些敏感个体。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W2'],
          quote:
            'certain sulfite sensitive individuals upon ingesting 10 milligrams or more of sulfites',
          conditions: '部分人群；不是所有哮喘患者都会反应',
          sourceYear: '2019',
          studyType: 'human',
          studyContext: null,
          evidenceBasis: 'direct',
        },
      },
      foodMeaning: {
        text:
          '如果这款食品是果干、蜜饯、腌渍蔬菜或葡萄酒等可能使用亚硫酸盐的类别，标签上的二氧化硫/亚硫酸盐声明值得看一眼；配料表没有标示含量，不能推算这一份的摄入量。',
        sourceRefs: ['W1', 'W2'],
        conditions: '按食品类别判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'direct',
      },
    },
    expect: {
      normal: 'missing',
      high: 'answered',
      sensitive: 'answered',
      basis: 'direct',
      mustInclude: ['哮喘', '10 mg', '过敏性休克'],
      mustNotInclude: ['所有人都会过敏', '亚硫酸盐一定致癌'],
      coverage: { normal: 'missing', high: 'human', sensitive: 'named' },
    },
  },

  // ------------------------------------------------------------ 5. 阿斯巴甜
  {
    key: 'aspartame',
    name: '阿斯巴甜',
    aliases: ['天门冬酰苯丙氨酸甲酯', 'aspartame'],
    ins: 'INS 951',
    foodContext: { productName: '无糖气泡水', category: '饮料' },
    before: '旧版能说「甜味剂、ADI 40 mg/kg」，但苯丙酮尿症提示有时来自模型常识，未稳定引用评估原文。',
    evidence: [
      src(
        'W1',
        'Aspartame — Food Safety Authority of Ireland',
        '爱尔兰食品安全局（FSAI）',
        'https://www.fsai.ie/getmedia/3682e3c7-2163-4788-a62c-6ff84ddc89e7/aspartame-15-final.pdf',
        'Current exposure to aspartame is below the ADI. In patients suffering from the medical condition phenylketonuria (PKU), the ADI is not applicable as they require strict adherence to a diet low in phenylalanine.',
        '2015-01-01',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 甜味剂', note: 'EFSA/JECFA 均确认 ADI' },
      healthInsights: {
        consumerTakeaway: {
          text:
            '阿斯巴甜的现行暴露低于 ADI 40 mg/kg 体重/天；但苯丙酮尿症（PKU）患者不适用这个 ADI，需要严格控制苯丙氨酸摄入。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'In patients suffering from the medical condition phenylketonuria (PKU), the ADI is not applicable as they require strict adherence to a diet low in phenylalanine.',
          conditions: '一般人群 vs PKU 患者；不是这款饮料的实际含量',
          sourceYear: '2015',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        normalIntake: {
          text: '现行阿斯巴甜暴露低于 ADI，一般人群不需要因为阿斯巴甜本身改变饮食。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote: 'Current exposure to aspartame is below the ADI.',
          conditions: '一般人群；不适用于 PKU 患者',
          sourceYear: '2015',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        highIntake: {
          text:
            '本次资料没有给出正常食用之外的高摄入人体后果；资料只说明现行暴露低于 ADI，并没有把超过 ADI 写成急性中毒线。',
          evidenceStatus: 'insufficient',
          sourceRefs: ['W1'],
          quote: 'Current exposure to aspartame is below the ADI.',
          conditions: '只有参考值边界；没有高摄入后果证据',
          sourceYear: '2015',
          studyType: 'reference',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        sensitiveGroups: {
          text:
            '苯丙酮尿症（PKU）患者需要特别注意：他们需要严格控制苯丙氨酸摄入，阿斯巴甜的 ADI 不适用于他们。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'In patients suffering from the medical condition phenylketonuria (PKU), the ADI is not applicable as they require strict adherence to a diet low in phenylalanine.',
          conditions: 'PKU 患者；不是所有消费者',
          sourceYear: '2015',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
      },
      foodMeaning: {
        text:
          '如果这款饮料标注含阿斯巴甜，PKU 患者需要看标签上的苯丙氨酸提示；其他消费者可以按 ADI 理解，但配料表不标实际含量，不能推算这一瓶的摄入量。',
        sourceRefs: ['W1'],
        conditions: '按产品是否含阿斯巴甜判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'direct',
      },
    },
    expect: {
      normal: 'answered',
      high: 'missing',
      sensitive: 'answered',
      basis: 'direct',
      mustInclude: ['苯丙酮尿症', 'PKU', '苯丙氨酸'],
      mustNotInclude: ['阿斯巴甜致癌', '所有人都不能喝'],
      coverage: { normal: 'direct', high: 'reference', sensitive: 'named' },
    },
  },

  // ------------------------------------------------------------ 6. EDTA 二钠
  {
    key: 'edta',
    name: '乙二胺四乙酸二钠',
    aliases: ['EDTA二钠', 'disodium EDTA', 'disodium edetate'],
    ins: 'INS 386',
    foodContext: { productName: '果酱', category: '果酱' },
    before: '旧版通常只给「螯合剂/防腐剂、ADI 2.5 mg/kg」，没有区分 EDTA 二钠与钙二钠，也没有婴幼儿限制。',
    evidence: [
      src(
        'W1',
        'Pharmacology/Toxicology Review — EDTA ADI',
        '美国食品药品监督管理局（FDA）',
        'https://www.accessdata.fda.gov/drugsatfda_docs/nda/2010/022560Orig1s000PharmR.pdf',
        'The joint FAO/WHO Expert Committee on Food Additives (JECFA, 1974) established an ADI of EDTA of 2.5 mg/kg body weight, for disodium and Ca-disodium salts. JECFA concluded that the use of CaNa2EDTA in foods is preferable to that of Na2EDTA since the latter sequesters Ca more effectively.',
        '2010-01-01',
      ),
      src(
        'W2',
        'Reports of the Scientific Committee for Food — calcium disodium EDTA',
        '欧盟食品科学委员会（SCF）',
        'https://food.ec.europa.eu/document/download/28c66cb3-6c9e-4935-b717-87d6b4b982c3_en',
        'The Committee continued to be concerned about the usage of additives in foods intended for consumption by infants less than 2 years of age. Calcium disodium EDTA is an effective sequestrant of mineral elements and should not be used in such foods.',
        '1977-09-16',
      ),
      src(
        'W3',
        'Reasons for raising the maximum acceptable daily intake of EDTA',
        'PubMed Central（PMC）',
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC4282355',
        'At double this level (∼500 mg day−1 kgbw−1 of calcium EDTA), diarrhoea has been observed occasionally in experimental animals, but no other harmful health effects have ever been reported.',
        '2015-01-01',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 螯合剂', note: 'EDTA 二钠是 INS 386；钙二钠是 INS 385' },
      healthInsights: {
        // 注意：JECFA 只给了两种盐共用的组 ADI 数值，属于参考值，
        // 不能当「最值得知道的一句」；真正的核心是婴幼儿限制，由 sensitiveGroups 承担。
        normalIntake: {
          text:
            'JECFA 为 EDTA 二钠与 EDTA 二钠钙设了同一组 ADI 2.5 mg/kg 体重/天（以钙二钠 EDTA 计）；本次资料没有给出针对食品的膳食暴露评估，因此不能把 ADI 当成这款食品的实际摄入量。',
          evidenceStatus: 'insufficient',
          sourceRefs: ['W1'],
          quote:
            'established an ADI of EDTA of 2.5 mg/kg body weight, for disodium and Ca-disodium salts',
          conditions: '组 ADI；两种盐共用；没有膳食暴露评估',
          sourceYear: '1974',
          studyType: 'reference',
          studyContext: null,
          evidenceBasis: 'group',
        },
        highIntake: {
          text:
            '动物实验中，约 500 mg/kg 体重/天的钙二钠 EDTA 曾偶见腹泻；这是动物证据，不能直接写成人体高摄入后果，也不能套到 EDTA 二钠的所有用途上。',
          evidenceStatus: 'conditional',
          sourceRefs: ['W3'],
          quote:
            'At double this level (∼500 mg day−1 kgbw−1 of calcium EDTA), diarrhoea has been observed occasionally in experimental animals',
          conditions: '动物实验；钙二钠 EDTA；不是人体数据',
          sourceYear: '2015',
          studyType: 'animal',
          studyContext: '动物实验；约 500 mg/kg 体重/天钙二钠 EDTA；偶见腹泻',
          evidenceBasis: 'analog',
        },
        sensitiveGroups: {
          text:
            '食品科学委员会曾指出，EDTA 会螯合矿物质，不应用于 2 岁以下婴幼儿食品。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W2'],
          quote:
            'Calcium disodium EDTA is an effective sequestrant of mineral elements and should not be used in such foods.',
          conditions: '2 岁以下婴幼儿食品；不是所有人群',
          sourceYear: '1977',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'analog',
        },
      },
      foodMeaning: {
        text:
          '如果这款食品是果酱、腌渍蔬菜、罐头或复合调味料，EDTA 二钠可能有工艺用途；组 ADI 不是这款产品的检测结果，配料表也不标实际含量。',
        sourceRefs: ['W1'],
        conditions: '按食品类别判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'group',
      },
    },
    expect: {
      normal: 'missing',
      high: 'missing',
      sensitive: 'answered',
      basis: 'group',
      mustInclude: ['2.5 mg/kg', '钙二钠', '婴幼儿'],
      mustNotInclude: ['EDTA 二钠就是钙二钠', '所有肾病患者不能吃'],
      coverage: { normal: 'reference', high: 'animal', sensitive: 'named' },
    },
  },

  // ------------------------------------------------------------ 7. 本地未收录的新添加剂
  {
    key: 'succinate',
    name: '琥珀酸二钠',
    aliases: ['丁二酸钠', 'disodium succinate'],
    ins: 'INS 364(ii)',
    foodContext: { productName: '海鲜风味调味料', category: '复合调味料' },
    before: '本地知识库没有收录，旧版容易停在「未知成分/资料不足」，或只用 GB 标准解释用途。',
    evidence: [
      src(
        'W1',
        'Safety evaluation of disodium succinate as a flavouring substance',
        '欧洲食品安全局（EFSA）',
        'https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2012.2576',
        'disodium succinate [FL-no: 08.113] was considered to raise no safety concerns at a level of intake of 1500 μg/day/person, as estimated by the maximised survey-derived daily intake (MSDI).',
        '2012-03-01',
      ),
      src(
        'W2',
        'Safety evaluation of d-α-tocopheryl polyethylene glycol-1000 succinate (Vitamin E TPGS) as a food additive',
        '欧洲食品安全局（EFSA）',
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC12336668/',
        "In 2024, JECFA reaffirmed that succinic acid does not pose a hazard at levels used in food, confirming the ADI 'not specified' (JECFA, 2024).",
        '2025-01-01',
      ),
    ],
    model: {
      identity: { type: 'additive', label: '食品添加剂 · 增味剂', note: '本地未收录；按 EFSA 香料评估与 JECFA 母体酸评估处理' },
      healthInsights: {
        consumerTakeaway: {
          text:
            'EFSA 把琥珀酸二钠作为香料物质评估，按 1500 μg/人/天的估算摄入量认为没有安全担忧；这是香料用途的评估，不等于对所有食品用途都做过同样评估。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'disodium succinate [FL-no: 08.113] was considered to raise no safety concerns at a level of intake of 1500 μg/day/person',
          conditions: '香料用途；估算摄入量 1500 μg/人/天；不是这款产品的检测结果',
          sourceYear: '2012',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        normalIntake: {
          text:
            'EFSA 在香料评估中按 1500 μg/人/天的估算摄入量认为琥珀酸二钠没有安全担忧。',
          evidenceStatus: 'authoritative',
          sourceRefs: ['W1'],
          quote:
            'was considered to raise no safety concerns at a level of intake of 1500 μg/day/person',
          conditions: '香料用途；MSDI 估算；不覆盖其他食品用途',
          sourceYear: '2012',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'direct',
        },
        highIntake: {
          text:
            'JECFA 2024 对琥珀酸（母体酸）维持 ADI「无需规定」；这是母体酸/组级结论，不等于对琥珀酸二钠所有食品用途都做过单独评估。',
          evidenceStatus: 'conditional',
          sourceRefs: ['W2'],
          quote:
            "JECFA reaffirmed that succinic acid does not pose a hazard at levels used in food, confirming the ADI 'not specified'",
          conditions: '母体酸/组级结论；不是琥珀酸二钠所有用途的单独评估',
          sourceYear: '2024',
          studyType: 'assessment',
          studyContext: null,
          evidenceBasis: 'group',
        },
      },
      foodMeaning: {
        text:
          '如果这款复合调味料把它用作增味剂，EFSA 的评估只覆盖香料用途的估算摄入量；不能据此推断这款食品的实际添加量，也不能把母体酸的 ADI 当成所有用途的结论。',
        sourceRefs: ['W1', 'W2'],
        conditions: '按香料用途判断适用性；不推算实际含量',
        studyType: 'assessment',
        evidenceBasis: 'group',
      },
    },
    expect: {
      normal: 'answered',
      high: 'missing',
      sensitive: 'missing',
      basis: 'direct',
      mustInclude: ['1500 μg', '香料', '母体酸'],
      mustNotInclude: ['本地知识库已收录', '所有用途都安全'],
      coverage: { normal: 'direct', high: 'reference' },
    },
  },

  // ------------------------------------------------------------ 8. 真正缺少人体健康资料
  {
    key: 'bamboo',
    name: '竹笋',
    aliases: ['bamboo shoots'],
    ins: null,
    foodContext: { productName: '山椒脆笋', category: '酱腌菜' },
    before: '旧版有时会把「普通食材」写成「资料不足的未知成分」，或硬套添加剂 ADI 模板。',
    evidence: [
      src(
        'W1',
        '竹笋 — 普通食品原料说明',
        '国家食品安全风险评估中心（CFSA）',
        'https://www.cfsa.net.cn/',
        '竹笋是普通食品原料，常作为蔬菜食用。本页只说明其食品属性，没有针对竹笋的食品添加剂每日允许摄入量（ADI）或高摄入人体影响评估。',
        '2024-01-01',
      ),
    ],
    model: {
      identity: { type: 'food_ingredient', label: '普通食品配料', note: '竹笋是普通食材，不是食品添加剂' },
      healthInsights: null,
      sections: [
        {
          id: 'limits-1',
          section: 'limits',
          text:
            '本次检索没有取得针对竹笋的正式健康评估；它是普通食材，不按食品添加剂的方式设定 ADI。没有取得证据不等于它有风险，也不等于它一定安全。',
          sourceRefs: ['W1'],
          limitations: null,
        },
      ],
      foodMeaning: {
        text:
          '对于这款食品，竹笋只是普通配料；本次资料没有给出需要特别提示的健康结论，也没有这款产品的检测数据。',
        sourceRefs: [],
        conditions: '普通食材；没有产品检测数据',
        studyType: 'none',
        evidenceBasis: 'direct',
      },
    },
    expect: {
      normal: 'missing',
      high: 'missing',
      sensitive: 'missing',
      basis: null,
      mustInclude: ['普通食材'],
      mustNotInclude: ['竹笋致癌', '竹笋没有营养'],
      coverage: { normal: 'missing', high: 'missing', sensitive: 'missing' },
    },
  },
];

export const ACCEPTANCE_BY_KEY = Object.fromEntries(ACCEPTANCE_CASES.map((c) => [c.key, c]));

/**
 * 简明版 / 身份用途段落（用于截图回放）。
 * 全部是身份与用途层面的说明，不含健康结论；来源指向各案例的官方证据。
 */
export const ACCEPTANCE_BRIEFS = {
  ins635: {
    brief: {
      what: '5′-呈味核苷酸二钠是肌苷酸二钠与鸟苷酸二钠的混合物，用作增味剂。',
      why: '它和谷氨酸钠一起使用时能明显增强鲜味，常见于方便面、零食和调味料。',
      howToUnderstand: '它不是一个单一物质；权威评估可能只写组成物质的名字，不写这个商品名。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: '5′-呈味核苷酸二钠是肌苷酸二钠与鸟苷酸二钠的混合物。', sourceRefs: ['W1'] },
      { section: 'why', text: 'JECFA 将其作为增味剂评估，用途是增强鲜味。', sourceRefs: ['W1'] },
      { section: 'limits', text: '配料表没有标示实际添加量，研究剂量不能等同于这款食品的实际添加量。', sourceRefs: ['W1'] },
    ],
  },
  msg: {
    brief: {
      what: '谷氨酸钠是谷氨酸的钠盐，是最常见的增味剂之一。',
      why: '它用来增强食品的鲜味，常出现在零食、汤料、酱料和复合调味料里。',
      howToUnderstand: 'EFSA 是把谷氨酸及其盐作为一组来评估的，结论以谷氨酸计。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: '谷氨酸钠是谷氨酸的钠盐，属于增味剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: 'EFSA 2017 按谷氨酸及其盐整组评估，并给出了暴露与不良反应相关剂量的对比。', sourceRefs: ['W1'] },
      { section: 'limits', text: '组 ADI 以谷氨酸计；不同盐的钠含量不同，配料表不标实际添加量。', sourceRefs: ['W1'] },
    ],
  },
  sucralose: {
    brief: {
      what: '三氯蔗糖是一种人工甜味剂，甜度约为蔗糖的 600 倍。',
      why: '它用于无糖或低糖食品，提供甜味而不带来能量。',
      howToUnderstand: 'EFSA 2026 确认了现行用途的安全性，但对高温加工的新用途保留了不确定性。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: '三氯蔗糖是一种人工甜味剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: 'EFSA 无法确认新增焙烤用途的安全性，原因是长时间高温下可能形成氯化物，其健康影响尚不清楚。', sourceRefs: ['W1'] },
      { section: 'limits', text: '这次评估没有确认新增焙烤用途；家庭高温烹调的不确定性也被点出。', sourceRefs: ['W1'] },
    ],
  },
  sulfite: {
    brief: {
      what: '焦亚硫酸钠是亚硫酸盐类食品添加剂。',
      why: '它用于漂白、防腐和抗氧化，常见于果干、蜜饯、腌渍蔬菜和葡萄酒。',
      howToUnderstand: '亚硫酸盐有明确的标签声明要求；对敏感人群，标签信息比数值更重要。',
      sourceRefs: ['W1', 'W2'],
    },
    sections: [
      { section: 'what', text: '焦亚硫酸钠是亚硫酸盐类食品添加剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: 'FDA 要求食品中亚硫酸盐达到 10 ppm 或以上时在标签上声明。', sourceRefs: ['W1'] },
      { section: 'limits', text: '严重反应的报告剂量是每份 10 mg；敏感阈值因人而异，不能推算这款产品的含量。', sourceRefs: ['W2'] },
    ],
  },
  aspartame: {
    brief: {
      what: '阿斯巴甜是一种人工甜味剂。',
      why: '它用于无糖饮料、口香糖和低糖食品，提供甜味而不带来能量。',
      howToUnderstand: '它含有苯丙氨酸成分，标签上需要标注，这是给苯丙酮尿症患者看的提示。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: '阿斯巴甜是一种人工甜味剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: '现行阿斯巴甜暴露低于 ADI；EFSA/JECFA 均维持 40 mg/kg 体重的参考值。', sourceRefs: ['W1'] },
      { section: 'limits', text: '苯丙酮尿症患者不适用这个 ADI；配料表不标实际含量。', sourceRefs: ['W1'] },
    ],
  },
  edta: {
    brief: {
      what: 'EDTA 二钠是一种螯合剂，用来抓住金属离子。',
      why: '它用于防止变色和氧化，常见于果酱、腌渍蔬菜、罐头和复合调味料。',
      howToUnderstand: 'EDTA 二钠与 EDTA 二钠钙是两种不同物质，只有组 ADI 是共用的。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: 'EDTA 二钠是一种螯合剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: 'JECFA 1974 为 EDTA 二钠与钙二钠设了同一组 ADI 2.5 mg/kg 体重/天。', sourceRefs: ['W1'] },
      { section: 'limits', text: '钙二钠是不同物质；具体用途和结论不能互换，配料表不标实际含量。', sourceRefs: ['W1'] },
    ],
  },
  succinate: {
    brief: {
      what: '琥珀酸二钠是一种增味剂，带海鲜般的鲜味。',
      why: '它用于海鲜风味调味料、零食和汤料，增强贝类般的鲜味。',
      howToUnderstand: '本地知识库没有收录它；EFSA 的评估是香料用途，JECFA 的结论是母体酸的。',
      sourceRefs: ['W1', 'W2'],
    },
    sections: [
      { section: 'what', text: '琥珀酸二钠是一种增味剂。', sourceRefs: ['W1'] },
      { section: 'evidence', text: 'EFSA 在香料评估中按 1500 μg/人/天的估算摄入量认为没有安全担忧。', sourceRefs: ['W1'] },
      { section: 'limits', text: '母体酸的 ADI「无需规定」不等于对琥珀酸二钠所有食品用途都做过单独评估。', sourceRefs: ['W2'] },
    ],
  },
  bamboo: {
    brief: {
      what: '竹笋是普通食材，不是食品添加剂。',
      why: '它作为蔬菜提供口感和膳食纤维，常见于酱腌菜和炒菜。',
      howToUnderstand: '普通食材不按添加剂的方式设定每日允许摄入量；本次也没有取得针对它的健康评估。',
      sourceRefs: ['W1'],
    },
    sections: [
      { section: 'what', text: '竹笋是普通食材，不是食品添加剂。', sourceRefs: ['W1'] },
      { section: 'why', text: '它作为蔬菜提供口感和膳食纤维。', sourceRefs: ['W1'] },
      { section: 'limits', text: '本次检索没有取得针对竹笋的正式健康评估；没有取得证据不等于它有风险，也不等于它一定安全。', sourceRefs: ['W1'] },
    ],
  },
};

