import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEvidenceLedger, addRecord, buildEvidenceExcerpt } from '../server/lib/evidenceLedger.js';
import { resolveSubstanceIdentity } from '../server/lib/substanceIdentity.js';
import { checkUrlAllowed } from '../server/lib/sourceWhitelist.js';
import { createResearchBudget, researchBudgetScope, reserveCall, settleCall, budgetTotal } from '../server/lib/researchBudget.js';
import { validateHealthInsights } from '../src/domain/evidence/healthGuard.js';
import { researchRequestKey } from '../src/domain/ingredients/researchKey.js';
const dir='runtime-output/consumer-rebuild';
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
const responses=fs.readdirSync(dir).filter(n=>n.startsWith('public-response-')).map(n=>JSON.parse(fs.readFileSync(`${dir}/${n}`)));
const records=responses.flatMap(r=>r.call.kind==='search' ? r.data?.results || [] : []);
test('真实EFSA 2017原文回放：结论、人体剂量和血压不被规格表挤掉',()=>{
  const raw=records.find(r=>r.url.includes('2017.4910') && r.content?.length>100000);assert.ok(raw,'需先保存真实Search返回');
  const l=createEvidenceLedger({identity:resolveSubstanceIdentity({name:'谷氨酸钠'})});
  const record=addRecord(l,raw);const excerpt=buildEvidenceExcerpt(record,{maxChars:18000});
  assert.match(excerpt,/4 Conclusions/);assert.match(excerpt,/blood pressure/);assert.match(excerpt,/150 mg\/kg/);assert.match(excerpt,/human/);
  addRecord(l,{...raw,read:true});addRecord(l,{...raw,content:'shorter search summary'});
  assert.equal(l.records[0].read,true);assert.equal(l.records[0].rawText.length,raw.content.length);
});
test('真实JECFA混合物专论回放：人体尿酸研究与联合评估都保留',()=>{
  const raw=records.find(r=>r.url.includes('v32je06') && r.content?.includes('Three healthy men'));assert.ok(raw);
  const record=addRecord(createEvidenceLedger({identity:resolveSubstanceIdentity({name:'5′-呈味核苷酸二钠'})}),raw);
  const excerpt=buildEvidenceExcerpt(record,{maxChars:18000});
  assert.match(excerpt,/Three healthy men/);assert.match(excerpt,/2 000/);assert.match(excerpt,/uric acid/);assert.equal(record.match.match,'constituent');
});
test('费用硬上限在网络请求之前预留，未知模型拒绝调用',()=>researchBudgetScope.run(createResearchBudget({limitCny:0.005}),()=>{
  const url='https://api.deepseek.com/v1/tools/search';const ticket=reserveCall(url,{query:'one'});
  assert.throws(()=>reserveCall(url,{query:'two'}),/费用/);
  settleCall(ticket,{status:200,ok:true,data:{results:[{}]}});assert.equal(budgetTotal(researchBudgetScope.getStore()),0.005);
  assert.throws(()=>reserveCall('https://api.deepseek.com/chat/completions',{model:'unpriced',max_tokens:100}),/模型/);
}));
test('连续错误保险丝阻止下一次请求，不会无限重试',()=>researchBudgetScope.run(createResearchBudget({limitCny:1}),()=>{
  for(let i=0;i<3;i++){const t=reserveCall('https://api.deepseek.com/v1/tools/fetch',{});settleCall(t,{status:404,ok:false,data:{}});}
  assert.throws(()=>reserveCall('https://api.deepseek.com/v1/tools/search',{}),/连续三次/);
}));
test('学术来源进入核对，伪装域与私网地址仍禁止',()=>{
  assert.equal(checkUrlAllowed('https://www.nature.com/articles/science').allowed,true);
  for(const u of ['https://who.int.example.com/a','http://127.1/a','http://[::ffff:127.0.0.1]/','http://10.0.0.1/','file:///x','https://who.int:8899/a','https://user:pass@who.int/'])assert.equal(checkUrlAllowed(u).allowed,false,u);
});
test('技术用途即使被模型误标evaluation也不能占健康大字',()=>{
  const quote='This substance is used as a flavour enhancer in food.';
  const r=validateHealthInsights({ingredientName:'x test',raw:{consumerTakeaway:{text:'这种物质用作增味剂。',sourceRefs:['W1'],quote,semanticChecked:true,semanticAnswerKind:'evaluation'}},evidenceSet:[{id:'W1',title:'x test',excerpt:quote}]});
  assert.equal(r.insights,null);
});
test('营养和配料改变会使研究缓存失效',()=>{
  const input={name:'salt',foodContext:{category:'蔬菜',productName:'A',nutrition:{items:[{name:'钠',value:100}]}}};
  assert.notEqual(researchRequestKey(input),researchRequestKey({...input,foodContext:{...input.foodContext,nutrition:{items:[{name:'钠',value:800}]}}}));
});
console.log(`${passed} consumer rebuild regressions passed; zero paid calls`);
