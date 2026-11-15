import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { researchIngredient } from '../server/providers/ingredientResearch.js';
import { createResearchBudget, researchBudgetScope, budgetTotal } from '../server/lib/researchBudget.js';
const dir = 'runtime-output/consumer-rebuild';
mkdirSync(dir, { recursive: true });
const ledgerFile = `${dir}/paid-ledger.json`;
const initial = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile)).calls : [];
const budget = createResearchBudget({ limitCny: 5, initial, onResponse: (call, data) => writeFileSync(`${dir}/public-response-${call.number}.json`, JSON.stringify({ call, data }, null, 2)), onChange: b => writeFileSync(ledgerFile, JSON.stringify({ limitCny: 5, estimate: '按高峰未命中价计费上界；不是账单实扣', upperCny: budgetTotal(b), calls: b.calls }, null, 2)) });
if (!process.argv.includes('--confirm-paid')) throw new Error('真实测试需要 --confirm-paid，累计仍受本地5元台账限制');
const [tag = 'baseline', ...names] = process.argv.slice(2).filter(a=>a!=='--confirm-paid');
if (!names.length) throw new Error('指定标签与成分名；仅本地明确授权后运行');
for (const [i, name] of names.entries()) {
  const start = budget.calls.length;
  console.log(`START ${name}`);
  try {
    const result = await researchBudgetScope.run(budget, () => researchIngredient({ name, force: true,
      foodContext: { productName: '验收样本：腌渍蔬菜（合成包装情境）', category: '酱腌菜', ingredientsText: `竹笋、水、食用盐、${name}`,
        nutrition: { basis: 'per_100g', items: [{ name: '钠', value: 800, unit: 'mg' }] } } }));
    writeFileSync(`${dir}/${tag}-${i}.json`, JSON.stringify({ name, result, calls: budget.calls.slice(start) }, null, 2));
    console.log(JSON.stringify({ name, status: result.status, totalMs: result.totalMs, health: result.healthInsights, rejected: result.healthRejected, food: result.foodMeaning, totalUpperCny: budgetTotal(budget) }, (k,v) => k === 'sources' ? undefined : v));
  } catch (e) {
    writeFileSync(`${dir}/${tag}-${i}.json`, JSON.stringify({ name, error: { code: e.code, message: e.message }, calls: budget.calls.slice(start) }, null, 2));
    console.log(JSON.stringify({ error: e.code, message: e.message, totalUpperCny: budgetTotal(budget) }));
    break;
  }
}
