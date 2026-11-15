import { parseIngredientText } from '../../src/domain/ingredientStructure.js';

/** 一份接近真实上限的长配料表：63 项，含 7 组多层括号 */
export const LONG_ITEMS = [
  '小麦粉', '棕榈油', '白砂糖', '食用盐', '麦芽糊精', '谷朊粉', '酵母提取物', '香辛料',
  '食品添加剂（碳酸钠、碳酸钾、三聚磷酸钠、六偏磷酸钠、焦磷酸二氢二钠）',
  '复配酸度调节剂（柠檬酸、乳酸、苹果酸、冰乙酸、柠檬酸钠）',
  '食品添加剂（谷氨酸钠、5′-呈味核苷酸二钠、琥珀酸二钠）',
  '食品添加剂（黄原胶、瓜尔胶、羧甲基纤维素钠、海藻酸钠、卡拉胶）',
  '食品添加剂（山梨酸钾、脱氢乙酸钠、乳酸链球菌素、丙酸钙）',
  '食品添加剂（三氯蔗糖、安赛蜜、阿斯巴甜、甜菊糖苷、赤藓糖醇）',
  '食品添加剂（焦糖色、日落黄、柠檬黄、胭脂红、亮蓝）',
  '食品添加剂（特丁基对苯二酚、丁基羟基茴香醚、二丁基羟基甲苯、抗坏血酸钠）',
  '复合调味料（牛肉粉、鸡肉粉（鸡骨提取物、食盐）、洋葱粉、蒜粉、黑胡椒粉、辣椒粉、花椒粉、姜粉）',
  '食品用香精（食用香料、天然香料、合成香料）',
  '营养强化剂（维生素 B1、维生素 B2、烟酸、叶酸、硫酸亚铁、氧化锌）',
  '麦麸', '燕麦粉', '玉米淀粉', '马铃薯淀粉', '大豆分离蛋白', '乳清蛋白粉', '全脂乳粉',
  '食用葡萄糖', '果葡糖浆', '蜂蜜', '芝麻', '花生碎', '核桃仁', '南瓜籽', '葵花籽仁',
  '蔓越莓干', '葡萄干', '椰蓉', '可可粉', '速溶咖啡粉', '抹茶粉', '食用酒精', '饮用水',
  '浓缩苹果汁', '柠檬汁', '番茄粉', '胡萝卜粉', '菠菜粉', '海苔碎', '虾粉', '鱼露', '蚝油',
  '酱油粉', '食醋粉', '料酒', '味精', '鸡精调味料', '骨汤', '食用玉米油', '单硬脂酸甘油酯',
  '蔗糖脂肪酸酯', '聚甘油脂肪酸酯', '磷脂', '碳酸钙',
];
export const LONG_TEXT = LONG_ITEMS.join('、');

export const NUTRITION = Array.from({ length: 18 }, (_, i) => ({
  name: ['能量', '蛋白质', '脂肪', '饱和脂肪', '碳水化合物', '糖', '膳食纤维', '钠', '钙', '铁', '锌', '维生素 B1', '维生素 B2', '烟酸', '叶酸', '维生素 C', '维生素 E', '钾'][i],
  value: String(1 + i * 3),
  unit: i === 0 ? 'kJ' : i === 7 ? 'mg' : 'g',
  nrv_percent: String(i),
}));

/**
 * 旧结构：配料写两遍 —— 一遍原文，一遍对象数组（每个对象再带完整 raw）。
 * 这是 V2.3 之前模型真实的输出形态。
 */
export function buildOldOutput() {
  const items = parseIngredientText(LONG_TEXT).items;
  return JSON.stringify({
    product_name: '长配料测试饼干',
    brand: '测试品牌',
    category: '饼干',
    net_content: '400g',
    ingredients_text: LONG_TEXT,
    ingredients: items.map((it) => ({ name: it.name, raw: it.raw })),
    nutrition: { basis: 'per_100g', basis_text: '每100克', items: NUTRITION },
    claims: ['0 蔗糖', '非油炸'],
    unreadable: [],
    notes: null,
  });
}

/** 新结构：只写一次原文 + 营养表 + 少量产品信息 */
export function buildNewOutput() {
  return JSON.stringify({
    product_name: '长配料测试饼干',
    net_content: '400g',
    ingredients_text: LONG_TEXT,
    nutrition: { basis: 'per_100g', basis_text: '每100克', items: NUTRITION },
    claims: ['0 蔗糖', '非油炸'],
    brand: '测试品牌',
    category: '饼干',
    unreadable: [],
    notes: null,
  });
}
