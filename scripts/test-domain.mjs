/**
 * 领域层纯逻辑测试（零成本、不联网）。
 * 重点验证「0 和 未识别 必须区分」这条铁律，以及真实包装上出现过的脏数据。
 */

import { parseNutrientValue, normalizeUnit, canCompare, massToMg, scaleNutrients } from '../src/domain/nutrition.js';
import {
  createFoodRecord,
  fromRecognition,
  validateFoodRecord,
  parseNetContent,
  confirmRecord,
} from '../src/domain/foodRecord.js';
import { redact } from '../server/lib/redact.js';

let pass = 0;
let fail = 0;

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

function check(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

console.log('\n【1】数值解析：0 与「未识别」必须分开');
eq('"0" 解析为数字 0（不是 null）', parseNutrientValue('0').value, 0);
eq('"0.8" 解析为 0.8', parseNutrientValue('0.8').value, 0.8);
eq('"" 解析为 null', parseNutrientValue('').value, null);
eq('"—" 解析为 null 且标记 UNKNOWN', [parseNutrientValue('—').value, parseNutrientValue('—').status], [null, 'UNKNOWN']);
eq('"未检出" 解析为 null', parseNutrientValue('未检出').value, null);
eq('null 解析为 null', parseNutrientValue(null).value, null);

console.log('\n【2】真实包装上的脏数据（实测踩过的坑）');
const dirty1 = parseNutrientValue('85千焦(kJ)');
eq('"85千焦(kJ)" 数值=85', dirty1.value, 85);
eq('"85千焦(kJ)" 单位取主体「千焦」', dirty1.unit, '千焦');
const dirty2 = parseNutrientValue('1.6克(g)');
eq('"1.6克(g)" 数值=1.6', dirty2.value, 1.6);
eq('"1.6克(g)" 再归一化为 g', normalizeUnit(dirty2.unit, 'mass'), 'g');
const dirty3 = parseNutrientValue('0克(g)');
eq('"0克(g)" 数值=0（不是 null）', dirty3.value, 0);
eq('"912kJ" 归一化为 kJ', normalizeUnit(parseNutrientValue('912kJ').unit, 'energy'), 'kJ');
eq('"<0.5" 标记为界限值', parseNutrientValue('<0.5').status, 'APPROXIMATE');

console.log('\n【3】非数字文本不能当数值');
eq('"abc" 判为 NOT_NUMERIC', parseNutrientValue('abc').status, 'NOT_NUMERIC');
eq('"约 3 克" 能解析出 3', parseNutrientValue('约 3 克').value, 3);
eq('"3g/100g" 判为不可解析', parseNutrientValue('3g/100g').status, 'NOT_NUMERIC');

console.log('\n【4】单位归一');
eq('"千焦" -> kJ', normalizeUnit('千焦', 'energy'), 'kJ');
eq('"千卡" -> kcal', normalizeUnit('千卡', 'energy'), 'kcal');
eq('"毫克" -> mg', normalizeUnit('毫克', 'mass'), 'mg');
eq('"ug" -> μg', normalizeUnit('ug', 'mass'), 'μg');
eq('未知单位 -> null', normalizeUnit('勺', 'mass'), null);
eq('2500mg = 2.5g（换算到 mg）', massToMg(2500, 'mg'), 2500);

console.log('\n【5】基准不能混用');
check('同为 per_100g 可比较', canCompare('per_100g', 'per_100g').ok);
check('per_100g vs per_100ml 不可比较', !canCompare('per_100g', 'per_100ml').ok);
check('未知基准不可比较', !canCompare(null, 'per_100g').ok);

console.log('\n【6】从模型输出构建 FoodRecord');
const raw = {
  product_name: '脆笋（山椒味）',
  brand: '奇爽',
  category: '酱腌菜',
  net_content: null,
  ingredients_text: '饮用水、竹笋、山椒',
  ingredients: [{ name: '饮用水', raw: '饮用水' }, { name: '竹笋', raw: '竹笋' }],
  nutrition: {
    basis: 'per_100g',
    basis_text: '每100克',
    items: [
      { name: '能量', value: '85千焦(kJ)', unit: 'kJ', nrv_percent: '1' },
      { name: '—饱和脂肪', value: '0克(g)', unit: 'g', nrv_percent: null },
      { name: '钠', value: null, unit: 'mg', nrv_percent: null },
    ],
  },
  claims: ['0 蔗糖'],
  unreadable: ['第3行反光'],
};
const rec = fromRecognition(raw, { provider: 'mimo', model: 'test' });
eq('产品名带入', rec.basic.productName, '脆笋（山椒味）');
eq('净含量 null 时不编造', rec.basic.netContent.value, null);
eq('配料顺序保留', rec.ingredients.items.map((i) => i.order), [1, 2, 3]);
eq('原文补全模型漏掉的配料', rec.ingredients.items.map((i) => i.name), ['饮用水', '竹笋', '山椒']);
eq('能量数值 85', rec.nutrition.items[0].value, 85);
eq('能量单位归一为 kJ', rec.nutrition.items[0].unit, 'kJ');
eq('钠为 null 而非 0', rec.nutrition.items[2].value, null);
eq('钠状态为 UNKNOWN', rec.nutrition.items[2].status, 'UNKNOWN');
eq('子项识别 parentKey', rec.nutrition.items[1].parentKey, 'fat');
eq('宣传语带入', rec.claims[0].text, '0 蔗糖');
check('unknownFields 记录净含量缺失', rec.unknownFields.includes('净含量'));

console.log('\n【7】净含量解析');
eq('"净含量 250g"', parseNetContent('净含量 250g'), { value: 250, unit: 'g', text: '净含量 250g' });
eq('"555毫升"', parseNetContent('555毫升'), { value: 555, unit: 'mL', text: '555毫升' });
eq('"907g"', parseNetContent('907g').value, 907);
eq('空字符串', parseNetContent('').value, null);

console.log('\n【8】确认前校验');
const empty = createFoodRecord();
const v1 = validateFoodRecord(empty);
check('缺基准时不能通过', !v1.valid && v1.errors.some((e) => e.includes('基准')));
const ok1 = { ...rec, nutrition: { ...rec.nutrition, basis: 'per_100g' } };
const v2 = validateFoodRecord(ok1);
check('补齐基准后通过', v2.valid, JSON.stringify(v2.errors));
const confirmed = confirmRecord(ok1);
eq('确认后状态变为 confirmed', confirmed.status, 'confirmed');
check('确认时间已记录', Boolean(confirmed.review.confirmedAt));

console.log('\n【9】取值缩放（食用量滑块）');
const scaled = scaleNutrients(rec.nutrition.items, 0.3);
eq('85 × 0.3 = 25.5', scaled[0].value, 25.5);
eq('null 缩放后仍是 null', scaled[2].value, null);

console.log('\n【10】脱敏层不能破坏数据结构（实测踩过的坑）');
const deepPayload = {
  ok: true,
  data: {
    results: {
      mimo: {
        parsed: {
          nutrition: {
            items: [{ name: '能量', value: '912kJ', unit: 'kJ', nrv_percent: '11' }],
          },
        },
      },
    },
  },
};
const deepOut = redact(deepPayload);
eq(
  '第 8 层的字段仍能完整保留',
  deepOut.data.results.mimo.parsed.nutrition.items[0],
  { name: '能量', value: '912kJ', unit: 'kJ', nrv_percent: '11' },
);
eq('深层数组长度不丢', deepOut.data.results.mimo.parsed.nutrition.items.length, 1);
eq(
  '字符串里的密钥仍被脱敏',
  redact({ msg: 'bad key sk-abcdef1234567890', auth: 'Bearer abcdefghijklmn' }).msg,
  'bad key sk-***REDACTED***',
);
eq('键名 api_key 被整体替换', redact({ api_key: 'whatever-value' }).api_key, '***REDACTED***');
const circular = { name: 'a' };
circular.self = circular;
eq('循环引用不炸', redact(circular).self, '[circular]');

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
