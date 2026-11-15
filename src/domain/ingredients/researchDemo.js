/**
 * 预录的综合分析结果（演示用）。
 *
 * 来源：对「三氯蔗糖」执行的一次**真实**联网查询，本地知识库（K2/K5/K6/K8/K9）
 * 与权威网站（CFSA / 卫健委 / FAO / PubMed）整合后原样保存。
 * V5.2 只新增了 brief 字段（从已有 sections 里挑完整段落），不改任何结论内容。
 *
 * 原始检索时间：2026-11-01T03:22:43.019Z
 * 演示时必须标注「预录分析 · 本次没有联网」，并显示真实检索时间。
 */

import { buildDemoHealth } from './healthDemo.js';
import { organizeConsumerEvidence } from '../evidence/consumerEvidence.js';

export const DEMO_RESEARCH = {
  "三氯蔗糖": {
    "status": "ok",
    "composition": "mixed",
    "ingredient": "三氯蔗糖",
    "localMatched": true,
    "localEntryId": "sucralose",
    "localVerification": "verified",
    "query": "三氯蔗糖 sucralose site:nhc.gov.cn OR site:cfsa.net.cn OR site:who.int OR site:fao.org OR site:pubmed.ncbi.nlm.nih.gov",
    "querySites": [
      "nhc.gov.cn",
      "cfsa.net.cn",
      "who.int",
      "fao.org",
      "pubmed.ncbi.nlm.nih.gov"
    ],
    "queryLength": 114,
    "searchCount": 5,
    "searchContentCount": 5,
    "blocked": [],
    "fetchFailures": [],
    "fetchCount": 0,
    "sources": [
      {
        "id": "K2",
        "title": "《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D",
        "organization": "国家卫生健康委员会、国家市场监督管理总局",
        "sourceType": "verified_local",
        "url": "https://gb2760.cfsa.net.cn/func.html",
        "excerpt": "条款/位置：附录 D 食品添加剂功能类别（D.1–D.23）\nD.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。",
        "excerptType": "verbatim_local",
        "retrievedAt": null,
        "verifiedAt": "2026-10-31",
        "version": "GB 2760-2024 · 实施 2025-02-08",
        "conditions": [],
        "tier": "local"
      },
      {
        "id": "K5",
        "title": "Food additives — Fact sheet",
        "organization": "World Health Organization（世界卫生组织）",
        "sourceType": "verified_local",
        "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
        "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
        "excerptType": "verbatim_local",
        "retrievedAt": null,
        "verifiedAt": "2026-10-31",
        "version": "WHO Fact sheet · 发布 2023-11-16",
        "conditions": [],
        "tier": "local"
      },
      {
        "id": "K6",
        "title": "WHO advises not to use non-sugar sweeteners for weight control",
        "organization": "World Health Organization（世界卫生组织）",
        "sourceType": "verified_local",
        "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
        "excerpt": "条款/位置：Guideline recommendation\nWHO has issued a recommendation against the use of non-sugar sweeteners in general, based on evidence that they don’t seem to benefit long term weight loss or maintenance and may increase risk of noncommunicable diseases.\n中文译文：WHO 发布建议，不推荐使用非糖甜味剂来控制体重，依据是现有证据显示它们对长期减重或体重维持似乎没有帮助，并且可能与非传染性疾病风险升高有关。",
        "excerptType": "verbatim_local",
        "retrievedAt": null,
        "verifiedAt": "2026-10-31",
        "version": "WHO News release · 发布 2023-05-15",
        "conditions": [],
        "tier": "local"
      },
      {
        "id": "K8",
        "title": "GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖",
        "organization": "国家食品安全风险评估中心（CFSA）",
        "sourceType": "verified_local",
        "url": "https://gb2760.cfsa.net.cn/category/limit/329.html",
        "excerpt": "条款/位置：品种条目\n三氯蔗糖（又名蔗糖素）　功能：甜味剂",
        "excerptType": "verbatim_local",
        "retrievedAt": null,
        "verifiedAt": "2026-10-31",
        "version": "CNS 19.016",
        "conditions": [],
        "tier": "local"
      },
      {
        "id": "K9",
        "title": "拟征求意见的食品添加剂名单（含 JECFA 评估结论摘录）",
        "organization": "国家食品安全风险评估中心（CFSA）",
        "sourceType": "verified_local",
        "url": "https://cfsa.net.cn:8899/site2/UpLoadFiles/news/upload/2020/2020-06/903fc4b4-5836-475c-ad1f-67542f3b2400.pdf",
        "excerpt": "条款/位置：第六条 三氯蔗糖\n根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量为 15 mg/kg bw。",
        "excerptType": "verbatim_local",
        "retrievedAt": null,
        "verifiedAt": "2026-10-31",
        "version": "CFSA 公开文件 · 发布 2020-06",
        "conditions": [
          "该数值引自 CFSA 公开的征求意见文件，属于对 JECFA 结论的转述"
        ],
        "tier": "local"
      },
      {
        "id": "W1",
        "title": "GB 2760-2024 食品添加剂使用标准",
        "organization": "国家食品安全风险评估中心（CFSA）",
        "sourceType": "search_content",
        "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
        "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
        "excerptType": "search_body_excerpt",
        "retrievedAt": "2026-11-01T03:22:38.303Z",
        "publishedAt": null,
        "authority": 4,
        "suspicion": [],
        "tier": "web_body"
      },
      {
        "id": "W2",
        "title": "食品分类号 食品名称 最大使用量/(g/kg) 备注 03.01 冰淇淋类 3.0 <...",
        "organization": "国家卫生健康委员会",
        "sourceType": "search_content",
        "url": "http://www.nhc.gov.cn/cmsresources/mohwsjdj/cmsrsdocument/doc9338.pdf#17#24#17",
        "excerpt": "| 食品分类号 | 食品名称 | 最大使用量/(g/kg) | 备注 | 03.01 | 冰淇淋类 | 3.0 | 07.01 | 面包 | 0.1 | 07.02 | 糕点 | 0.1 | 三氯蔗糖（蔗糖素） sucralose\n\nCNS号19.016\n\nINS号955\n\n功能甜味剂 | 食品分类号 | 食品名称 | 最大使用量／(g/kg） | 备注 | 01.01.03.01 | 调味乳 | 0.3 | 01.02.02 | 调味和果料发酵乳 | 0.3 | 01.03.02 | 调制乳粉和调制奶油粉（包括调味乳粉和调味奶油粉） | 1.0 | 03.0 | 冷冻饮品（03 . 04 食用冰除外） | 0.25 | 04.01.02.02 | 水果干类 | 0.15 | 04.01.02.04 | 水果罐头 | 0.25 | 04.01.02.05 | 果酱 | 0.45 | 04.01.02.08 | 蜜饯凉果 | 1.5 | 04.01.02.12 | 煮熟的或油炸的水果 | 0.15 | 04.02.02.03.01 | 酱渍的蔬菜 | 0.25 | 04.02.02.03.02 | 盐渍的蔬菜 | 0.25 | 04.04.02.01 | 腐乳类 | 1.0 | 05.02 | 糖果 | 1.5 | 06.04.02.01 | 八宝粥罐头类 | 0.25 | 06.04.02.02 | 其他杂粮制品（仅限微波爆米花） | 5.0 | 06.06 | 即食谷物，包括碾轧燕麦（片） | 1.0 | 07.0 | 焙烤食品 | 0.25 | 11.04 | 餐桌…",
        "excerptType": "search_body_excerpt",
        "retrievedAt": "2026-11-01T03:22:38.305Z",
        "publishedAt": null,
        "authority": 4,
        "suspicion": [],
        "tier": "web_body"
      },
      {
        "id": "W3",
        "title": "食品添加剂通用标准在线版食品添加剂详细信息 Sucralose (Trichlorogalactosucrose) - 食品添加剂详细信息",
        "organization": "联合国粮食及农业组织（FAO）",
        "sourceType": "search_content",
        "url": "https://www.fao.org/gsfaonline/additives/details.html;jsessionid=3B88EEEF811A6A8174689329F25CD575?id=137&__cf_chl_rt_tk=2m.GrGTEk7Vwy9cdIFt5Dq8sAqYWeZBRrapdeuQOKvY-1791593782-1.0.1.1-bp1Q2qVN2K7lnVFwbJEGKWoFPqPnbDez.ariaML89dU#1",
        "excerpt": "食品添加剂详细信息\n\nSucralose (Trichlorogalactosucrose) (955)\n\nGSFA规定Sucralose (Trichlorogalactosucrose) \n\n编号 | 食品分类 | 最大使用量 | 备注 \n---|---|---|---\n14.2.7 | Aromatized alcoholic beverages (e.g. beer, wine and spirituous cooler-type beverages, low alcoholic refreshers) | 700 mg/kg \n01.3.2 | Beverage whiteners | 580 mg/kg \n07.1 | Bread and ordinary bakery wares | 650 mg/kg \n06.3 | Breakfast cereals, including rolled oats | 1,000 mg/kg \n04.1.2.7 | Candied fruit | 1,500 mg/kg \n04.1.2.4 | Canned or bottled (pasteurized) fruit | 400 mg/kg \n04.2.2.4 | Canned or bottled (pasteurized) or retort pouch vegetables (including mushrooms and fungi, roots and tubers, pulses and legumes, and aloe vera), and seaweeds | 580 mg/kg \n06.5 | Cereal and starch based desserts (e.g. rice pudding, tapioca pudding) | 400 mg/kg \n05.3 | Chewing gum | 5,000 mg/kg \n05.1.4 | Cocoa and chocolate products | 800 mg/kg \n05.1.1 | Cocoa mixes (powders) and cocoa mass/cake | 580 mg/kg \n05.1.2 | Cocoa mixes (syrups) | 400 mg/kg \n05.1.3 | Cocoa-based spreads, including fillings | 400 mg/kg \n14.1.5 | Coffee, coffee substitutes, tea, herbal infusions, and other hot cereal and grain beverages, excluding cocoa | 300 mg/kg \n14.1.3.3 | Co",
        "excerptType": "search_body_excerpt",
        "retrievedAt": "2026-11-01T03:22:38.305Z",
        "publishedAt": null,
        "authority": 4,
        "suspicion": [],
        "tier": "web_body"
      },
      {
        "id": "W4",
        "title": "The European Scientific Committee on Food (SCF) has also reviewed the safety of sucralose and issued an opinion in",
        "organization": "联合国粮食及农业组织（FAO）",
        "sourceType": "search_content",
        "url": "http://www.fao.org/fao-who-codexalimentarius/sh-proxy/en/?lnk=1&url=https%253A%252F%252Fworkspace.fao.org%252Fsites%252Fcodex%252FShared%2BDocuments%252FArchive%252FMeetings%252FCCFAC%252Fccfac38%252Ffa3809be.pdf#15#23#15",
        "excerpt": "The European Scientific Committee on Food (SCF) has also reviewed the safety of sucralose and issued an opinion in\n2000 (SCF 2000)2. The SCF was satisfied that the range of scientific studies available were sufficient for a full safety\nevaluation of sucralose. The SCF concluded that sucralose is acceptable as a sweetener for general food use and that an\nADI of 0 to 15 mg/kg bw can be established based on application of a 100 fold safety factor to the overall NOEL of\n1500 mg/kg bw/day. Based on the SCF opinion, Directive 2003/115/EC amended Directive 94/35/EC on sweeteners for\nuse in foodstuffs to include provisions for use of sucralose (E955) in dietary foods for special medical purposes at a\nmaximum permitted level of 400 mg/kg and as a general food sweetener at GMP levels in the US (21 CFR 172.831).\n\nUse of Sucralose in FSMP is kept to a minimum and only used for technological reasons. FSMP are formulated so that\ndaily intake of Sucralose remains within the ADI and below the maximum permitted level (400 mg/kg as consumed). In\naddition usage of FSMP is controlled by the recommended intake for a specific age and is administered under medical\nsupervision.\n\n**Conclusions**\n\nSucralose",
        "excerptType": "search_body_excerpt",
        "retrievedAt": "2026-11-01T03:22:38.305Z",
        "publishedAt": null,
        "authority": 4,
        "suspicion": [],
        "tier": "web_body"
      },
      {
        "id": "W5",
        "title": "An overview of the safety of sucralose - PubMed",
        "organization": "PubMed",
        "sourceType": "search_content",
        "url": "https://pubmed.ncbi.nlm.nih.gov/19464334/?i=6",
        "excerpt": "Review\ndoi: 10.1016/j.yrtph.2009.05.011. Epub 2009 May 21. \n\n# An overview of the safety of sucralose\n\nAffiliations\n\n- PMID: 19464334\n- DOI: 10.1016/j.yrtph.2009.05.011\n\nItem in Clipboard\n\nReview\n\n# An overview of the safety of sucralose\n\nV Lee Grotz et al. Regul Toxicol Pharmacol. 2009 Oct.\n\n## Abstract\n\nSucralose is a non-nutritive sweetener used in a broad range of foods and beverages and is the non-nutritive sweetener in retail SPLENDA Sweetening Products, composed of sucralose and common food ingredients. A review of the extensive body of evidence that supports the safety of sucralose is provided. The results of an independent review of a new study investigating the safety of a sucralose-mixture retail product, Granulated SPLENDA No Calorie Sweetener, are also discussed. The collective evidence supports the conclusion that the ingredient, sucralose, is safe for use in food and that the sucralose-mixture product, Granulated SPLENDA No Calorie Sweetener, is also safe for its intended use.\n\n## Comment in\n\n- Sucralose revisited: rebuttal of two papers about Splenda safety. Schiffman SS, Abou-Donia MB. Schiffman SS, et al. Regul Toxicol Pharmacol. 2012 Aug;63(3):505-8; author reply",
        "excerptType": "search_body_excerpt",
        "retrievedAt": "2026-11-01T03:22:38.305Z",
        "publishedAt": "2009-05-20T16:00:00+00:00",
        "authority": 4,
        "suspicion": [],
        "tier": "web_body"
      }
    ],
    "evidenceStats": {
      "local": 5,
      "webBody": 5,
      "webSummary": 0,
      "total": 10
    },
    "identity": {
      "type": "additive",
      "label": "食品添加剂 · 甜味剂",
      "note": "GB 2760-2024 中正式名称为三氯蔗糖（又名蔗糖素），CNS 19.016 / INS 955，登记功能为甜味剂。"
    },
    "sections": [
      {
        "id": "s1",
        "section": "what",
        "text": "三氯蔗糖在 GB 2760-2024 中的正式名称是「三氯蔗糖」，括号注明「又名蔗糖素」，英文名 sucralose，CNS 号 19.016，INS 号 955，登记功能为甜味剂。",
        "sourceRefs": [
          "K2",
          "K5",
          "W1"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K2",
            "title": "《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D",
            "organization": "国家卫生健康委员会、国家市场监督管理总局",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/func.html",
            "excerpt": "条款/位置：附录 D 食品添加剂功能类别（D.1–D.23）\nD.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "GB 2760-2024 · 实施 2025-02-08",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K5",
            "title": "Food additives — Fact sheet",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO Fact sheet · 发布 2023-11-16",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "W1",
            "title": "GB 2760-2024 食品添加剂使用标准",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "search_content",
            "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
            "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.303Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          }
        ],
        "refSplit": {
          "local": [
            "K2",
            "K5"
          ],
          "web": [
            "W1"
          ]
        }
      },
      {
        "id": "s2",
        "section": "what",
        "text": "它是独立登记的一种食品添加剂品种，与蔗糖是两种不同物质；营养标签上「蔗糖」属于「糖」的组成成分，而三氯蔗糖按添加剂管理。",
        "sourceRefs": [
          "K8"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K8",
            "title": "GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/category/limit/329.html",
            "excerpt": "条款/位置：品种条目\n三氯蔗糖（又名蔗糖素）　功能：甜味剂",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "CNS 19.016",
            "conditions": [],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K8"
          ],
          "web": []
        }
      },
      {
        "id": "s3",
        "section": "why",
        "text": "甜味剂在标准中的定义是「赋予食品甜味的物质」，三氯蔗糖用于给食品提供甜味，属于高倍甜味剂一类。",
        "sourceRefs": [
          "K2",
          "K5",
          "W1"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K2",
            "title": "《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D",
            "organization": "国家卫生健康委员会、国家市场监督管理总局",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/func.html",
            "excerpt": "条款/位置：附录 D 食品添加剂功能类别（D.1–D.23）\nD.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "GB 2760-2024 · 实施 2025-02-08",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K5",
            "title": "Food additives — Fact sheet",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO Fact sheet · 发布 2023-11-16",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "W1",
            "title": "GB 2760-2024 食品添加剂使用标准",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "search_content",
            "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
            "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.303Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          }
        ],
        "refSplit": {
          "local": [
            "K2",
            "K5"
          ],
          "web": [
            "W1"
          ]
        }
      },
      {
        "id": "s4",
        "section": "why",
        "text": "GB 2760-2024 按食品类别规定其允许使用范围和最大使用量，例如调制乳 0.3 g/kg、冷冻饮品 0.25 g/kg、蜜饯 1.5 g/kg 等。",
        "sourceRefs": [
          "W1"
        ],
        "limitations": "此处仅列举部分类别，完整清单以标准表 A.1 为准。",
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "W1",
            "title": "GB 2760-2024 食品添加剂使用标准",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "search_content",
            "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
            "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.303Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          }
        ],
        "refSplit": {
          "local": [],
          "web": [
            "W1"
          ]
        }
      },
      {
        "id": "s5",
        "section": "misconception",
        "text": "名字里有「蔗糖」不代表它就是蔗糖：三氯蔗糖是独立登记的甜味剂品种，别名蔗糖素，与蔗糖不能混为一谈。",
        "sourceRefs": [
          "K8"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K8",
            "title": "GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/category/limit/329.html",
            "excerpt": "条款/位置：品种条目\n三氯蔗糖（又名蔗糖素）　功能：甜味剂",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "CNS 19.016",
            "conditions": [],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K8"
          ],
          "web": []
        }
      },
      {
        "id": "s6",
        "section": "misconception",
        "text": "WHO 在 2023 年建议不推荐使用非糖甜味剂来控制体重，依据是现有证据显示其对长期减重或体重维持似乎没有帮助，并可能与非传染性疾病风险升高有关；该建议针对的是「用非糖甜味剂控制体重」这一用途，并非「含甜味剂的食品有毒」的安全性结论。",
        "sourceRefs": [
          "K6"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K6",
            "title": "WHO advises not to use non-sugar sweeteners for weight control",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Guideline recommendation\nWHO has issued a recommendation against the use of non-sugar sweeteners in general, based on evidence that they don’t seem to benefit long term weight loss or maintenance and may increase risk of noncommunicable diseases.\n中文译文：WHO 发布建议，不推荐使用非糖甜味剂来控制体重，依据是现有证据显示它们对长期减重或体重维持似乎没有帮助，并且可能与非传染性疾病风险升高有关。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO News release · 发布 2023-05-15",
            "conditions": [],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K6"
          ],
          "web": []
        }
      },
      {
        "id": "s7",
        "section": "misconception",
        "text": "ADI 是「可以被终生每天摄入而不产生可觉察健康风险的量的估计值」，是基于当时证据的估计值，用于风险评估和管理，不是把安全与不安全截然分开的界线。",
        "sourceRefs": [
          "K5",
          "K9"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K5",
            "title": "Food additives — Fact sheet",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO Fact sheet · 发布 2023-11-16",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K9",
            "title": "拟征求意见的食品添加剂名单（含 JECFA 评估结论摘录）",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "verified_local",
            "url": "https://cfsa.net.cn:8899/site2/UpLoadFiles/news/upload/2020/2020-06/903fc4b4-5836-475c-ad1f-67542f3b2400.pdf",
            "excerpt": "条款/位置：第六条 三氯蔗糖\n根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量为 15 mg/kg bw。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "CFSA 公开文件 · 发布 2020-06",
            "conditions": [
              "该数值引自 CFSA 公开的征求意见文件，属于对 JECFA 结论的转述"
            ],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K5",
            "K9"
          ],
          "web": []
        }
      },
      {
        "id": "s8",
        "section": "evidence",
        "text": "三氯蔗糖的 ADI 为 15 mg/kg bw（体重），该数值来自 JECFA 评估；欧洲 SCF 在 2000 年的意见中也得出 0–15 mg/kg bw 的 ADI。",
        "sourceRefs": [
          "K5",
          "K9",
          "W4"
        ],
        "limitations": "不同机构评估的时间与依据资料不同，数值一致不代表评估过程相同。",
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K5",
            "title": "Food additives — Fact sheet",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO Fact sheet · 发布 2023-11-16",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K9",
            "title": "拟征求意见的食品添加剂名单（含 JECFA 评估结论摘录）",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "verified_local",
            "url": "https://cfsa.net.cn:8899/site2/UpLoadFiles/news/upload/2020/2020-06/903fc4b4-5836-475c-ad1f-67542f3b2400.pdf",
            "excerpt": "条款/位置：第六条 三氯蔗糖\n根据联合国粮农组织/世界卫生组织食品添加剂联合专家委员会评估结果，该物质的每日允许摄入量为 15 mg/kg bw。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "CFSA 公开文件 · 发布 2020-06",
            "conditions": [
              "该数值引自 CFSA 公开的征求意见文件，属于对 JECFA 结论的转述"
            ],
            "tier": "local"
          },
          {
            "id": "W4",
            "title": "The European Scientific Committee on Food (SCF) has also reviewed the safety of sucralose and issued an opinion in",
            "organization": "联合国粮食及农业组织（FAO）",
            "sourceType": "search_content",
            "url": "http://www.fao.org/fao-who-codexalimentarius/sh-proxy/en/?lnk=1&url=https%253A%252F%252Fworkspace.fao.org%252Fsites%252Fcodex%252FShared%2BDocuments%252FArchive%252FMeetings%252FCCFAC%252Fccfac38%252Ffa3809be.pdf#15#23#15",
            "excerpt": "The European Scientific Committee on Food (SCF) has also reviewed the safety of sucralose and issued an opinion in\n2000 (SCF 2000)2. The SCF was satisfied that the range of scientific studies available were sufficient for a full safety\nevaluation of sucralose. The SCF concluded that sucralose is acceptable as a sweetener for general food use and that an\nADI of 0 to 15 mg/kg bw can be established based on application of a 100 fold safety factor to the overall NOEL of\n1500 mg/kg bw/day. Based on the SCF opinion, Directive 2003/115/EC amended Directive 94/35/EC on sweeteners for\nuse in foodstuffs to include provisions for use of sucralose (E955) in dietary foods for special medical purposes at a\nmaximum permitted level of 400 mg/kg and as a general food sweetener at GMP levels in the US (21 CFR 172.831).\n\nUse of Sucralose in FSMP is kept to a minimum and only used for technological reasons. FSMP are formulated so that\ndaily intake of Sucralose remains within the ADI and below the maximum permitted level (400 mg/kg as consumed). In\naddition usage of FSMP is controlled by the recommended intake for a specific age and is administered under medical\nsupervision.\n\n**Conclusions**\n\nSucralose",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.305Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          }
        ],
        "refSplit": {
          "local": [
            "K5",
            "K9"
          ],
          "web": [
            "W4"
          ]
        }
      },
      {
        "id": "s9",
        "section": "evidence",
        "text": "WHO 说明食品添加剂在获准使用前会先评估对人体健康的潜在危害，只有经 JECFA 安全评估并被认为不会对消费者构成可觉察健康风险的添加剂才能在国际上使用。",
        "sourceRefs": [
          "K6"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K6",
            "title": "WHO advises not to use non-sugar sweeteners for weight control",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Guideline recommendation\nWHO has issued a recommendation against the use of non-sugar sweeteners in general, based on evidence that they don’t seem to benefit long term weight loss or maintenance and may increase risk of noncommunicable diseases.\n中文译文：WHO 发布建议，不推荐使用非糖甜味剂来控制体重，依据是现有证据显示它们对长期减重或体重维持似乎没有帮助，并且可能与非传染性疾病风险升高有关。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO News release · 发布 2023-05-15",
            "conditions": [],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K6"
          ],
          "web": []
        }
      },
      {
        "id": "s10",
        "section": "limits",
        "text": "配料表只告诉你用了三氯蔗糖，不告诉你用了多少；估算摄入量需要实际含量和食用量，前者标签上没有，因此无法据此推算摄入量或评价具体产品。",
        "sourceRefs": [
          "K2",
          "K5",
          "K8"
        ],
        "limitations": null,
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "K2",
            "title": "《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D",
            "organization": "国家卫生健康委员会、国家市场监督管理总局",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/func.html",
            "excerpt": "条款/位置：附录 D 食品添加剂功能类别（D.1–D.23）\nD.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "GB 2760-2024 · 实施 2025-02-08",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K5",
            "title": "Food additives — Fact sheet",
            "organization": "World Health Organization（世界卫生组织）",
            "sourceType": "verified_local",
            "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
            "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "WHO Fact sheet · 发布 2023-11-16",
            "conditions": [],
            "tier": "local"
          },
          {
            "id": "K8",
            "title": "GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "verified_local",
            "url": "https://gb2760.cfsa.net.cn/category/limit/329.html",
            "excerpt": "条款/位置：品种条目\n三氯蔗糖（又名蔗糖素）　功能：甜味剂",
            "excerptType": "verbatim_local",
            "retrievedAt": null,
            "verifiedAt": "2026-10-31",
            "version": "CNS 19.016",
            "conditions": [],
            "tier": "local"
          }
        ],
        "refSplit": {
          "local": [
            "K2",
            "K5",
            "K8"
          ],
          "web": []
        }
      },
      {
        "id": "s11",
        "section": "limits",
        "text": "不同资料列出的最大使用量数值和食品分类不完全一致（如冷冻饮品、焙烤食品），可能源于标准版本或适用体系不同，资料之间无法据此判断孰为准。",
        "sourceRefs": [
          "W1",
          "W2",
          "W3"
        ],
        "limitations": "这些数值分别来自不同标准体系或版本，不能直接横向比较，也不代表某款具体产品的实际添加量。",
        "verified": true,
        "tier": "cited",
        "sources": [
          {
            "id": "W1",
            "title": "GB 2760-2024 食品添加剂使用标准",
            "organization": "国家食品安全风险评估中心（CFSA）",
            "sourceType": "search_content",
            "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
            "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.303Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          },
          {
            "id": "W2",
            "title": "食品分类号 食品名称 最大使用量/(g/kg) 备注 03.01 冰淇淋类 3.0 <...",
            "organization": "国家卫生健康委员会",
            "sourceType": "search_content",
            "url": "http://www.nhc.gov.cn/cmsresources/mohwsjdj/cmsrsdocument/doc9338.pdf#17#24#17",
            "excerpt": "| 食品分类号 | 食品名称 | 最大使用量/(g/kg) | 备注 | 03.01 | 冰淇淋类 | 3.0 | 07.01 | 面包 | 0.1 | 07.02 | 糕点 | 0.1 | 三氯蔗糖（蔗糖素） sucralose\n\nCNS号19.016\n\nINS号955\n\n功能甜味剂 | 食品分类号 | 食品名称 | 最大使用量／(g/kg） | 备注 | 01.01.03.01 | 调味乳 | 0.3 | 01.02.02 | 调味和果料发酵乳 | 0.3 | 01.03.02 | 调制乳粉和调制奶油粉（包括调味乳粉和调味奶油粉） | 1.0 | 03.0 | 冷冻饮品（03 . 04 食用冰除外） | 0.25 | 04.01.02.02 | 水果干类 | 0.15 | 04.01.02.04 | 水果罐头 | 0.25 | 04.01.02.05 | 果酱 | 0.45 | 04.01.02.08 | 蜜饯凉果 | 1.5 | 04.01.02.12 | 煮熟的或油炸的水果 | 0.15 | 04.02.02.03.01 | 酱渍的蔬菜 | 0.25 | 04.02.02.03.02 | 盐渍的蔬菜 | 0.25 | 04.04.02.01 | 腐乳类 | 1.0 | 05.02 | 糖果 | 1.5 | 06.04.02.01 | 八宝粥罐头类 | 0.25 | 06.04.02.02 | 其他杂粮制品（仅限微波爆米花） | 5.0 | 06.06 | 即食谷物，包括碾轧燕麦（片） | 1.0 | 07.0 | 焙烤食品 | 0.25 | 11.04 | 餐桌…",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.305Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          },
          {
            "id": "W3",
            "title": "食品添加剂通用标准在线版食品添加剂详细信息 Sucralose (Trichlorogalactosucrose) - 食品添加剂详细信息",
            "organization": "联合国粮食及农业组织（FAO）",
            "sourceType": "search_content",
            "url": "https://www.fao.org/gsfaonline/additives/details.html;jsessionid=3B88EEEF811A6A8174689329F25CD575?id=137&__cf_chl_rt_tk=2m.GrGTEk7Vwy9cdIFt5Dq8sAqYWeZBRrapdeuQOKvY-1791593782-1.0.1.1-bp1Q2qVN2K7lnVFwbJEGKWoFPqPnbDez.ariaML89dU#1",
            "excerpt": "食品添加剂详细信息\n\nSucralose (Trichlorogalactosucrose) (955)\n\nGSFA规定Sucralose (Trichlorogalactosucrose) \n\n编号 | 食品分类 | 最大使用量 | 备注 \n---|---|---|---\n14.2.7 | Aromatized alcoholic beverages (e.g. beer, wine and spirituous cooler-type beverages, low alcoholic refreshers) | 700 mg/kg \n01.3.2 | Beverage whiteners | 580 mg/kg \n07.1 | Bread and ordinary bakery wares | 650 mg/kg \n06.3 | Breakfast cereals, including rolled oats | 1,000 mg/kg \n04.1.2.7 | Candied fruit | 1,500 mg/kg \n04.1.2.4 | Canned or bottled (pasteurized) fruit | 400 mg/kg \n04.2.2.4 | Canned or bottled (pasteurized) or retort pouch vegetables (including mushrooms and fungi, roots and tubers, pulses and legumes, and aloe vera), and seaweeds | 580 mg/kg \n06.5 | Cereal and starch based desserts (e.g. rice pudding, tapioca pudding) | 400 mg/kg \n05.3 | Chewing gum | 5,000 mg/kg \n05.1.4 | Cocoa and chocolate products | 800 mg/kg \n05.1.1 | Cocoa mixes (powders) and cocoa mass/cake | 580 mg/kg \n05.1.2 | Cocoa mixes (syrups) | 400 mg/kg \n05.1.3 | Cocoa-based spreads, including fillings | 400 mg/kg \n14.1.5 | Coffee, coffee substitutes, tea, herbal infusions, and other hot cereal and grain beverages, excluding cocoa | 300 mg/kg \n14.1.3.3 | Co",
            "excerptType": "search_body_excerpt",
            "retrievedAt": "2026-11-01T03:22:38.305Z",
            "publishedAt": null,
            "authority": 4,
            "suspicion": [],
            "tier": "web_body"
          }
        ],
        "refSplit": {
          "local": [],
          "web": [
            "W1",
            "W2",
            "W3"
          ]
        }
      }
    ],
    "rejectedSections": [],
    "verification": {
      "status": "ok",
      "composition": "mixed",
      "errors": [],
      "warnings": [],
      "stats": {
        "totalSections": 11,
        "accepted": 11,
        "rejected": 0,
        "citedSources": 9,
        "citedFromBody": 11,
        "snippetOnly": 0,
        "localSources": 5,
        "webSources": 4,
        "localRefs": 15,
        "webRefs": 7,
        "composition": "mixed"
      }
    },
    "notes": [],
    "chat": {
      "model": "deepseek-flash",
      "usage": {
        "prompt_tokens": 3957,
        "completion_tokens": 952,
        "total_tokens": 4909,
        "prompt_tokens_details": {
          "cached_tokens": 0
        },
        "prompt_cache_hit_tokens": 0,
        "prompt_cache_miss_tokens": 3957
      },
      "reasoningTokens": 0,
      "durationMs": 4713,
      "finishReason": "stop"
    },
    "timings": {
      "searchMs": 584,
      "fetchCount": 0,
      "chatMs": 4713,
      "reasoningTokens": 0
    },
    "totalMs": 5303,
    "retrievedAt": "2026-11-01T03:22:43.019Z",
    "cached": false,
    "brief": {
      "what": "三氯蔗糖在 GB 2760-2024 中的正式名称是「三氯蔗糖」，括号注明「又名蔗糖素」，英文名 sucralose，CNS 号 19.016，INS 号 955，登记功能为甜味剂。",
      "why": "甜味剂在标准中的定义是「赋予食品甜味的物质」，三氯蔗糖用于给食品提供甜味，属于高倍甜味剂一类。",
      "howToUnderstand": "名字里有「蔗糖」不代表它就是蔗糖：三氯蔗糖是独立登记的甜味剂品种，别名蔗糖素，与蔗糖不能混为一谈。",
      "sourceRefs": [
        "K2",
        "K5",
        "W1",
        "K8"
      ],
      "sources": [
        {
          "id": "K2",
          "title": "《食品安全国家标准 食品添加剂使用标准》（GB 2760-2024）附录 D",
          "organization": "国家卫生健康委员会、国家市场监督管理总局",
          "sourceType": "verified_local",
          "url": "https://gb2760.cfsa.net.cn/func.html",
          "excerpt": "条款/位置：附录 D 食品添加剂功能类别（D.1–D.23）\nD.1 酸度调节剂：用以维持或改变食品酸碱度的物质。D.4 抗氧化剂：能防止或延缓油脂或食品成分氧化分解、变质，提高食品稳定性的物质。D.17 防腐剂：防止食品腐败变质、延长食品储存期的物质。D.19 甜味剂：赋予食品甜味的物质。D.20 增稠剂：可以提高食品的黏稠度或形成凝胶，从而改变食品的物理性状、赋予食品黏润、适宜的口感。D.23 其他：上述功能类别中不能涵盖的其他功能。",
          "excerptType": "verbatim_local",
          "retrievedAt": null,
          "verifiedAt": "2026-10-31",
          "version": "GB 2760-2024 · 实施 2025-02-08",
          "conditions": [],
          "tier": "local"
        },
        {
          "id": "K5",
          "title": "Food additives — Fact sheet",
          "organization": "World Health Organization（世界卫生组织）",
          "sourceType": "verified_local",
          "url": "https://www.who.int/news-room/fact-sheets/detail/food-additives",
          "excerpt": "条款/位置：Key facts / Safety assessments\nFood additives are assessed for potential harmful effects on human health before they are approved for use. … Only food additives that have undergone a JECFA safety assessment and are found not to present an appreciable health risk to consumers can be used internationally. … The ADI is an estimate of the amount of an additive in food or drinking water that can be safely consumed daily over a lifetime without adverse health effects.\n中文译文：食品添加剂在获准使用前，会先评估其对人体健康的潜在危害。……只有经过 JECFA 安全评估、并被认定不会对消费者构成可觉察健康风险的添加剂，才能在国际上使用。……ADI（每日允许摄入量）是指：某种添加剂在食物或饮水中，可以被终生每天摄入而不产生可觉察健康风险的量的估计值。",
          "excerptType": "verbatim_local",
          "retrievedAt": null,
          "verifiedAt": "2026-10-31",
          "version": "WHO Fact sheet · 发布 2023-11-16",
          "conditions": [],
          "tier": "local"
        },
        {
          "id": "K8",
          "title": "GB 2760-2024 食品添加剂使用标准查询系统 — 三氯蔗糖",
          "organization": "国家食品安全风险评估中心（CFSA）",
          "sourceType": "verified_local",
          "url": "https://gb2760.cfsa.net.cn/category/limit/329.html",
          "excerpt": "条款/位置：品种条目\n三氯蔗糖（又名蔗糖素）　功能：甜味剂",
          "excerptType": "verbatim_local",
          "retrievedAt": null,
          "verifiedAt": "2026-10-31",
          "version": "CNS 19.016",
          "conditions": [],
          "tier": "local"
        },
        {
          "id": "W1",
          "title": "GB 2760-2024 食品添加剂使用标准",
          "organization": "国家食品安全风险评估中心（CFSA）",
          "sourceType": "search_content",
          "url": "https://gb2760.cfsa.net.cn/addtives/faid/195.html",
          "excerpt": "GB 2760-2024 食品添加剂使用标准\n\n- --综合查询--\n- 食品添加剂查询\n- 按食品名称查询\n- 加工助剂查询\n- 酶制剂查询\n- 香精香料查询\n\n当前位置：三氯蔗糖（又名蔗糖素）\n\n中文名称 | 三氯蔗糖（又名蔗糖素） \n---|---\n英文名称 | sucralose \nCNS | 19.016 \nINS | 955 \n功能 | 甜味剂 \n质量规格标准 \nJECFA规格资料 \n\n三氯蔗糖（又名蔗糖素） 允许使用品种、使用范围 以及最大使用量或残留量\n\n食品分类号 | 食品名称 | 最大使用量(g/kg) | 备注 \n---|---|---|---\n01.01.03 | 调制乳 | 0.3 \n01.02.02 | 风味发酵乳 | 0.3 \n01.03.02 | 调制乳粉和调制奶油粉 | 1.0 \n01.06.04 | 再制干酪 | 0.2 \n01.06.04.01 | 普通再制干酪 | 0.2 \n01.06.04.02 | 调味再制干酪 | 0.2 \n03.0 | 冷冻饮品（03.04食用冰除外） | 0.25 | 03.04食用冰除外 \n03.01 | 冰淇淋、雪糕类 | 0.25 \n03.02 | — | 0.25 \n03.03 | 风味冰、冰棍类 | 0.25 \n03.05 | 其他冷冻饮品 | 0.25 \n04.01.02.02 | 水果干类 | 0.15 \n04.01.02.04 | 水果罐头 | 0.25 \n04.01.02.05 | 果酱 | 0.45 \n04.01.02.08 | 蜜饯 | 1.5 \n04.01.02.…",
          "excerptType": "search_body_excerpt",
          "retrievedAt": "2026-11-01T03:22:38.303Z",
          "publishedAt": null,
          "authority": 4,
          "suspicion": [],
          "tier": "web_body"
        }
      ],
      "tier": "cited",
      "verified": true,
      "charCount": 187
    },
    "healthInsights": {
      "practicalTakeaway": {
        "text": "它的每日允许摄入量是 15 mg/kg 体重：这是终生每天摄入也不产生可觉察风险的估计值，不是「超过就会中毒」的界线。",
        "evidenceStatus": "authoritative",
        "evidenceLabel": "权威评估直接支持",
        "sourceRefs": ["K9", "K5"]
      },
      "normalIntake": {
        "text": "食品添加剂在获准使用前会先评估对人体健康的潜在影响；ADI 指的是可以终生每天摄入、不产生可觉察健康风险的量的估计值。",
        "evidenceStatus": "authoritative",
        "evidenceLabel": "权威评估直接支持",
        "sourceRefs": ["K5"]
      }
    },
    "cost": {
      "currency": "USD",
      "webRequests": 1,
      "total": 0.003079,
      "basis": "Search $0.75/1000 次；Chat 按 deepseek-flash 价格估算"
    }
  }
}

/** 演示模式用：按成分名取预录结果，没有就返回 null */
export function getDemoResearch(name) {
  const key = String(name || '').trim();
  const base = DEMO_RESEARCH[key] ? { ...DEMO_RESEARCH[key] } : null;
  const curated = buildDemoHealth(key);

  // 没有预录综合分析、但有离线健康资料：给一个最小骨架，
  // 让健康区块和本地简明三段一起显示（不是伪造一次联网结果）。
  if (!base && !curated) return null;

  const record = base || {
    status: 'ok',
    composition: 'demo_curated',
    ingredient: key,
    localMatched: true,
    localEntryId: null,
    query: null,
    querySites: [],
    searchCount: 0,
    searchContentCount: 0,
    blocked: [],
    fetchFailures: [],
    fetchCount: 0,
    sources: [],
    evidenceStats: null,
    identity: null,
    brief: null,
    briefRejectReason: null,
    briefScienceReview: null,
    sections: [],
    rejectedSections: [],
    notes: [],
    retrievedAt: null,
    cached: false,
    demoReplay: true,
    demoCurated: true,
  };

  if (curated) {
    // 健康部分按当前结构重做；其余（身份/用途/来源）保留原样。
    // 来源编号可能和原有 K/W 编号冲突，合并后要把结论里的引用一起改名，
    // 否则「原文出自哪个来源」会指错页面。
    const { sources, idMap } = mergeSources(record.sources, curated.sources);
    const healthInsights = remapRefs(curated.healthInsights, idMap, sources);
    const facts = (curated.consumerEvidence?.facts || []).map(f=>remapRefs({fact:f},idMap,sources).fact);
    const consumerEvidence = organizeConsumerEvidence({facts,insights:healthInsights,sources,name:key});
    return {
      ...record,
      ...curated,
      healthInsights,
      consumerEvidence,
      sources,
      demoReplay: true,
      demoCurated: true,
    };
  }

  return { ...record, demoReplay: true };
}

/** 合并来源，返回 id 映射；已有编号优先保留，冲突时改用未占用的 W 编号 */
function mergeSources(base = [], extra = []) {
  const out = [...base];
  const used = new Set(base.map((s) => s.id));
  const idMap = new Map();
  let cursor = 0;

  for (const s of extra) {
    const same = base.find((b) => b.id === s.id && b.url === s.url);
    if (same) {
      idMap.set(s.id, same.id);
      continue;
    }
    let id = s.id;
    if (used.has(id)) {
      cursor = Math.max(cursor, out.length);
      do {
        cursor += 1;
        id = `W${cursor}`;
      } while (used.has(id));
    }
    out.push({ ...s, id });
    used.add(id);
    idMap.set(s.id, id);
  }
  return { sources: out, idMap };
}

/** 把健康结论里的来源编号按映射改名（含 quoteSourceId 与 sources 列表） */
function remapRefs(insights, idMap, mergedSources) {
  if (!insights) return insights;
  const byId = new Map(mergedSources.map((s) => [s.id, s]));
  const out = {};
  for (const [slot, item] of Object.entries(insights)) {
    const refs = (item.sourceRefs || []).map((r) => idMap.get(r) || r);
    out[slot] = {
      ...item,
      sourceRefs: refs,
      quotes: (item.quotes || []).map(q=>({...q,sourceRef:idMap.get(q.sourceRef)||q.sourceRef})),
      quoteSourceId: item.quoteSourceId ? idMap.get(item.quoteSourceId) || item.quoteSourceId : null,
      sources: refs.map((r) => byId.get(r)).filter(Boolean),
    };
  }
  return out;
}
