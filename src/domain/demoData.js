/**
 * 演示数据与领域常量。
 *
 * 三个虚构样品各有一个明确的教学重点，全部走与真实照片完全相同的
 * 确认组件、计算引擎和分析组件 —— 不允许演示模式另走一套逻辑。
 *
 * 所有样品都明确标注为虚构，不对应任何真实商品。
 */

import { createFoodRecord, makeNutrientItem, PRESENCE, RECORD_STATUS } from './foodRecord.js';
import { BASIS } from './nutrition.js';

/**
 * 默认展示的宣传语（8 个）。
 * 选择区只先露这一组，其余放进「更多宣传语」，避免一屏 28 个按钮。
 */
export const CLAIM_PRESETS = [
  { id: 'sugar-0', text: '0 蔗糖', group: '糖' },
  { id: 'fat-0', text: '0 脂肪', group: '脂肪' },
  { id: 'low-fat', text: '低脂', group: '脂肪' },
  { id: 'high-protein', text: '高蛋白', group: '蛋白质' },
  { id: 'trans-fat-0', text: '0 反式脂肪', group: '脂肪' },
  { id: 'low-sodium', text: '低钠', group: '钠' },
  { id: 'fiber', text: '含膳食纤维', group: '碳水' },
  { id: 'no-fry', text: '非油炸', group: '__meta__' },
];

/** 需要展开才显示的宣传语 */
export const CLAIM_PRESETS_MORE = [
  { id: 'low-sugar', text: '低糖', group: '糖' },
  { id: 'no-added-sugar', text: '无添加糖', group: '糖' },
  { id: 'no-added-sucrose', text: '不添加蔗糖', group: '糖' },
  { id: 'reduce-sugar', text: '减糖', group: '糖' },
  { id: 'high-fiber', text: '高膳食纤维', group: '碳水' },
  { id: 'high-calcium', text: '高钙', group: '矿物质' },
  { id: 'calcium', text: '含钙', group: '矿物质' },
  { id: 'low-energy', text: '低热量', group: '能量' },
  { id: 'energy-0', text: '0 卡', group: '能量' },
  { id: 'reduce-energy', text: '减少热量', group: '能量' },
  { id: 'reduce-fat', text: '减脂', group: '脂肪' },
  { id: 'reduce-sodium', text: '减盐', group: '钠' },
  { id: 'increase-protein', text: '增加蛋白质', group: '蛋白质' },
  { id: 'no-preservative', text: '不添加防腐剂', group: '配料' },
  { id: 'no-colorant', text: '不添加色素', group: '配料' },
  { id: 'whole-grain', text: '全麦', group: '配料' },
  { id: 'juice-100', text: '100% 果汁', group: '配料' },
  { id: 'natural', text: '纯天然', group: '泛营销' },
  { id: 'zero-additive', text: '零添加', group: '泛营销' },
];

/** 全部可点选的宣传语（界面按需分组展示） */
export const ALL_CLAIM_PRESETS = [...CLAIM_PRESETS, ...CLAIM_PRESETS_MORE];

export const DEMO_SAMPLES = [
  {
    id: 'drink',
    label: '演示一 · 清柠气泡水',
    desc: '0 蔗糖 + 0 脂肪。展示界限值换算（500 mL → 2.5 g 上限）与「糖未标示」',
  },
  {
    id: 'cookie',
    label: '演示二 · 燕麦纤维饼干',
    desc: '含膳食纤维 + 非油炸。一个能对照纤维数值，一个只能解释工艺',
  },
  {
    id: 'yogurt',
    label: '演示三 · 原味发酵乳',
    desc: '多项营养。展示「包装未标示」与「标示为 0」的区别',
  },
  {
    id: 'bamboo',
    label: '演示四 · 山椒脆笋',
    desc: '复合配料。展示「食品添加剂（…）」里的具体成分与父子结构',
  },
];

const DEMO_BUILDERS = {
  drink: buildDrink,
  cookie: buildCookie,
  yogurt: buildYogurt,
  bamboo: buildBamboo,
};

/** 兼容旧调用：不传参数时返回第一个样品 */
export function createDemoRecord(sampleId = 'drink') {
  const builder = DEMO_BUILDERS[sampleId] || buildDrink;
  const r = builder();
  r.source = {
    kind: 'demo',
    image: null,
    capturedAt: new Date().toISOString(),
    provider: 'demo',
    model: '内置演示数据（虚构）',
    durationMs: null,
    usage: null,
  };
  r.status = RECORD_STATUS.RECOGNIZED; // 仍要用户走一遍确认
  return r;
}

// ---------------------------------------------------------------- 样品一：气泡水

function buildDrink() {
  const r = createFoodRecord();
  r.basic = {
    productName: '清柠气泡水（虚构）',
    brand: '演示品牌 DEMO',
    category: '碳酸饮料',
    physicalForm: 'liquid',
    netContent: { value: 500, unit: 'mL', text: '净含量 500mL', presence: PRESENCE.LABELED },
  };

  r.ingredients = {
    rawText: '水、赤藓糖醇、二氧化碳、柠檬酸、柠檬酸钠、三氯蔗糖、食用香精。',
    presence: PRESENCE.LABELED,
    items: ['水', '赤藓糖醇', '二氧化碳', '柠檬酸', '柠檬酸钠', '三氯蔗糖', '食用香精'].map((name, i) => ({
      id: `demo_drink_ing_${i}`,
      order: i + 1,
      name,
      raw: name,
      children: [],
    })),
  };

  r.nutrition = {
    basis: BASIS.per_100ml.id,
    basisText: '每 100mL',
    servingSize: { value: 500, unit: 'mL' },
    items: [
      makeNutrientItem({ key: 'energy', name: '能量', value: 75, unit: 'kJ', nrvPercent: 1 }),
      makeNutrientItem({ key: 'protein', name: '蛋白质', value: 0, unit: 'g', nrvPercent: 0 }),
      // 关键：脂肪标示 0 —— 触发界限值换算
      makeNutrientItem({ key: 'fat', name: '脂肪', value: 0, unit: 'g', nrvPercent: 0 }),
      makeNutrientItem({ key: 'carbohydrate', name: '碳水化合物', value: 4.4, unit: 'g', nrvPercent: 1 }),
      // 关键：糖这一项明确标记「包装未标示」—— 不是 0
      makeNutrientItem({
        key: 'sugar',
        name: '糖',
        value: null,
        unit: 'g',
        presence: PRESENCE.NOT_LABELED,
      }),
      makeNutrientItem({ key: 'sodium', name: '钠', value: 22, unit: 'mg', nrvPercent: 1 }),
    ],
  };

  r.claims = [
    { id: 'demo_drink_c1', text: '0 蔗糖', source: 'preset', presetId: 'sugar-0' },
    { id: 'demo_drink_c2', text: '0 脂肪', source: 'preset', presetId: 'fat-0' },
  ];

  r.unknownFields = [];
  r.demoNote =
    '本品为虚构演示样品，营养数据与配料均为编写，不对应任何真实商品。脂肪标 0、糖未标示，用来展示「0」与「没标」的区别。';
  return r;
}

// ---------------------------------------------------------------- 样品二：饼干

function buildCookie() {
  const r = createFoodRecord();
  r.basic = {
    productName: '燕麦纤维饼干（虚构）',
    brand: '演示品牌 DEMO',
    category: '饼干',
    physicalForm: 'solid',
    netContent: { value: 200, unit: 'g', text: '净含量 200g', presence: PRESENCE.LABELED },
  };

  r.ingredients = {
    rawText: '小麦粉、燕麦片、麦芽糊精、白砂糖、植物油、鸡蛋、食用盐、柠檬酸、食用香精。',
    presence: PRESENCE.LABELED,
    items: ['小麦粉', '燕麦片', '麦芽糊精', '白砂糖', '植物油', '鸡蛋', '食用盐', '柠檬酸', '食用香精'].map((name, i) => ({
      id: `demo_cookie_ing_${i}`,
      order: i + 1,
      name,
      raw: name,
      children: [],
    })),
  };

  r.nutrition = {
    basis: BASIS.per_100g.id,
    basisText: '每 100g',
    servingSize: { value: 25, unit: 'g' },
    items: [
      makeNutrientItem({ key: 'energy', name: '能量', value: 1850, unit: 'kJ', nrvPercent: 22 }),
      makeNutrientItem({ key: 'protein', name: '蛋白质', value: 8.2, unit: 'g', nrvPercent: 14 }),
      makeNutrientItem({ key: 'fat', name: '脂肪', value: 12.5, unit: 'g', nrvPercent: 21 }),
      makeNutrientItem({
        key: 'saturated_fat',
        name: '饱和脂肪',
        value: 5.1,
        unit: 'g',
        nrvPercent: 26,
        parentKey: 'fat',
      }),
      makeNutrientItem({ key: 'carbohydrate', name: '碳水化合物', value: 62.0, unit: 'g', nrvPercent: 21 }),
      makeNutrientItem({
        key: 'sugar',
        name: '糖',
        value: 18.5,
        unit: 'g',
        nrvPercent: null,
        parentKey: 'carbohydrate',
      }),
      makeNutrientItem({ key: 'dietary_fiber', name: '膳食纤维', value: 6.0, unit: 'g', nrvPercent: 24 }),
      makeNutrientItem({ key: 'sodium', name: '钠', value: 280, unit: 'mg', nrvPercent: 14 }),
    ],
  };

  r.claims = [
    { id: 'demo_cookie_c1', text: '含膳食纤维', source: 'preset', presetId: 'fiber' },
    { id: 'demo_cookie_c2', text: '非油炸', source: 'preset', presetId: 'no-fry' },
  ];

  r.unknownFields = [];
  r.demoNote =
    '本品为虚构演示样品。配料含燕麦片与白砂糖，用来展示「含膳食纤维」「非油炸」的实际判定：一个能对照纤维数值，一个只能解释工艺。';
  return r;
}

// ---------------------------------------------------------------- 样品三：酸奶

function buildYogurt() {
  const r = createFoodRecord();
  r.basic = {
    productName: '原味发酵乳（虚构）',
    brand: '演示品牌 DEMO',
    category: '发酵乳',
    physicalForm: 'solid',
    netContent: { value: 180, unit: 'g', text: '净含量 180g', presence: PRESENCE.LABELED },
  };

  r.ingredients = {
    rawText: '生牛乳、白砂糖、浓缩乳清蛋白粉、乳酸菌（保加利亚乳杆菌、嗜热链球菌）。',
    presence: PRESENCE.LABELED,
    items: ['生牛乳', '白砂糖', '浓缩乳清蛋白粉', '乳酸菌（保加利亚乳杆菌、嗜热链球菌）'].map((name, i) => ({
      id: `demo_yogurt_ing_${i}`,
      order: i + 1,
      name,
      raw: name,
      children: [],
    })),
  };

  r.nutrition = {
    basis: BASIS.per_100g.id,
    basisText: '每 100g',
    servingSize: { value: 180, unit: 'g' },
    items: [
      makeNutrientItem({ key: 'energy', name: '能量', value: 380, unit: 'kJ', nrvPercent: 5 }),
      makeNutrientItem({ key: 'protein', name: '蛋白质', value: 3.2, unit: 'g', nrvPercent: 5 }),
      // 脂肪标了明确非零值
      makeNutrientItem({ key: 'fat', name: '脂肪', value: 3.6, unit: 'g', nrvPercent: 6 }),
      makeNutrientItem({ key: 'carbohydrate', name: '碳水化合物', value: 4.8, unit: 'g', nrvPercent: 2 }),
      // 糖未标示 —— 用来对比「未标示」和「标示为 0」
      makeNutrientItem({ key: 'sugar', name: '糖', value: null, unit: 'g', presence: PRESENCE.NOT_LABELED }),
      makeNutrientItem({ key: 'sodium', name: '钠', value: 55, unit: 'mg', nrvPercent: 3 }),
      makeNutrientItem({ key: 'other', name: '钙', value: 110, unit: 'mg', nrvPercent: 14 }),
    ],
  };

  r.claims = [
    { id: 'demo_yogurt_c1', text: '0 蔗糖', source: 'preset', presetId: 'sugar-0' },
  ];

  r.unknownFields = [];
  r.demoNote =
    '本品为虚构演示样品。配料里有白砂糖，但营养成分表未标示糖 —— 用来展示「未标示」不等于「0」，也不等于「没有添加」。';
  return r;
}

// ---------------------------------------------------------------- 样品四：山椒脆笋

function buildBamboo() {
  const r = createFoodRecord();
  r.basic = {
    productName: '山椒脆笋（虚构）',
    brand: '演示品牌 DEMO',
    category: '酱腌菜',
    physicalForm: 'solid',
    netContent: { value: 150, unit: 'g', text: '净含量 150g', presence: PRESENCE.LABELED },
  };

  const additives = ['谷氨酸钠', '5′-呈味核苷酸二钠', '柠檬酸', '冰乙酸', '乳酸'];
  const groupRaw = `食品添加剂（${additives.join('、')}）`;

  r.ingredients = {
    rawText: `饮用水、竹笋、山椒、食用盐、香辛料、${groupRaw}、食用香精香料。`,
    presence: PRESENCE.LABELED,
    items: [
      { id: 'demo_bamboo_ing_0', order: 1, name: '饮用水', raw: '饮用水', children: [] },
      { id: 'demo_bamboo_ing_1', order: 2, name: '竹笋', raw: '竹笋', children: [] },
      { id: 'demo_bamboo_ing_2', order: 3, name: '山椒', raw: '山椒', children: [] },
      { id: 'demo_bamboo_ing_3', order: 4, name: '食用盐', raw: '食用盐', children: [] },
      { id: 'demo_bamboo_ing_4', order: 5, name: '香辛料', raw: '香辛料', children: [] },
      {
        id: 'demo_bamboo_ing_5',
        order: 6,
        name: '食品添加剂',
        raw: groupRaw,
        note: null,
        children: additives.map((name, i) => ({
          id: `demo_bamboo_ingc_${i}`,
          order: i + 1,
          name,
          raw: name,
          children: [],
        })),
      },
      { id: 'demo_bamboo_ing_6', order: 7, name: '食用香精香料', raw: '食用香精香料', children: [] },
    ],
  };

  r.nutrition = {
    basis: BASIS.per_100g.id,
    basisText: '每 100g',
    servingSize: { value: 50, unit: 'g' },
    items: [
      makeNutrientItem({ key: 'energy', name: '能量', value: 105, unit: 'kJ', nrvPercent: 1 }),
      makeNutrientItem({ key: 'protein', name: '蛋白质', value: 1.2, unit: 'g', nrvPercent: 2 }),
      makeNutrientItem({ key: 'fat', name: '脂肪', value: 0.2, unit: 'g', nrvPercent: 0 }),
      makeNutrientItem({ key: 'carbohydrate', name: '碳水化合物', value: 4.6, unit: 'g', nrvPercent: 2 }),
      makeNutrientItem({ key: 'sugar', name: '糖', value: null, unit: 'g', presence: PRESENCE.NOT_LABELED }),
      makeNutrientItem({ key: 'dietary_fiber', name: '膳食纤维', value: 1.6, unit: 'g', nrvPercent: 6 }),
      makeNutrientItem({ key: 'sodium', name: '钠', value: 1180, unit: 'mg', nrvPercent: 59 }),
    ],
  };

  r.claims = [];
  r.unknownFields = [];
  r.demoNote =
    '本品为虚构演示样品。配料表里的「食品添加剂（…）」用来展示括号内的具体成分：父级只是类别标题，真正可以逐个查看的是括号里的物质。';
  return r;
}

/** 结果页占位文案（第五/第七阶段会被真实内容替换） */
export const PLACEHOLDER_NOTES = {
  ingredients: '成分解剖内容将在第五阶段接入规则库，第七阶段接入联网证据。当前只列出配料顺序，不做结论。',
  evidence: '引用证据卡片将在第七阶段接入 DeepSeek Search + Fetch。',
  serving: '食用量只做数值换算，不参与任何健康结论。',
};
