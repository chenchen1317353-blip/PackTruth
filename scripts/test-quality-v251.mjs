import assert from 'node:assert/strict';
import fs from 'node:fs';
import { QUALITY_CASES, rebuildQualityResult, ledgerHash, OUTPUT, foodContext } from './fixtures/quality-v251.mjs';
import { buildHealthView, getConsumerEvidence } from '../src/app/ingredientView.js';
import { inferApplicability, classifyPopulationInfo, organizeConsumerEvidence } from '../src/domain/evidence/consumerEvidence.js';
import { matchIngredient } from '../src/domain/ingredients/index.js';
const hash=ledgerHash();
const realFetch=globalThis.fetch;let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw new Error('本次验收禁止联网或付费调用');};
fs.mkdirSync(OUTPUT,{recursive:true});
const results=[];
function test(name,fn){fn();console.log('PASS '+name);}
try {
 for(const sample of QUALITY_CASES){
  const result=rebuildQualityResult(sample),view=buildHealthView(result,{name:sample.name,foodContext});
  results.push({...sample,result,view});
  test(sample.name+'：原文锚点、适用性与共享结构',()=>{
   assert.equal(result.consumerEvidence.version,1);
   for(const f of result.consumerEvidence.facts)for(const key of ['population','route','dose','setting','foodRelevance','generalizable'])assert.ok(key in f.applicability);
   assert.equal(view.rows.filter(r=>r.absence).length,0);
   assert.equal(new Set([view.headline,...view.rows].filter(Boolean).map(f=>f.id)).size,[view.headline,...view.rows].filter(Boolean).length);
   assert.ok(view.gaps.length<=1);
  });
 }
 const get=name=>results.find(r=>r.name===name);
 test('婴儿特殊喂养不作为普通酱腌菜高摄入主结论，完整研究保留',()=>{
  const r=get('乳酸');assert.ok(!r.view.rows.some(f=>f.key==='highIntake'&&/婴儿|喂养/.test(f.text)));
  assert.match(r.result.healthInsights.sensitiveGroups.text,/婴儿/);
  assert.ok(!/婴儿/.test(r.view.headline.text), '特殊人群限制应在独立人群栏，完整大字原文仍可展开');
  assert.ok(r.view.deepFacts.some(f=>f.applicability.population==='infants'&&/腹泻|乳酸/.test(f.fullText)));
  assert.equal(inferApplicability({text:'婴儿特殊配方喂养试验中观察到指标变化。',studyType:'human'},{category:'婴儿配方食品'}).samePopulation,true);
 });
 test('第二种特殊人群：哮喘敏感反应不推广到普通成人，仍明确提示',()=>{
  const r=get('焦亚硫酸钠');assert.match(r.result.healthInsights.sensitiveGroups.text,/哮喘/);
  assert.ok(r.view.deepFacts.some(f=>f.populationNature==='risk'));
  assert.ok(!r.result.healthInsights.highIntake?.text.includes('哮喘患者摄入'));
 });
 test('两种适用性输入均移出风险栏，并保留适用信息',()=>{
  for(const name of ['爱德万甜','含钾低钠盐']){
   const r=get(name);assert.ok(!r.result.healthInsights?.sensitiveGroups);
   assert.ok(r.view.context.some(f=>f.populationNature==='suitability'));
  }
 });
 test('年龄组高暴露不是疾病禁忌',()=>{
  const item={text:'某些儿童在膳食暴露估计中可能超过参考摄入值。'};
  assert.equal(classifyPopulationInfo(item),'higher_exposure');
  const q={quote:'Children had higher exposure estimates.',sourceRefs:['W1'],...item};
  const r=organizeConsumerEvidence({insights:{sensitiveGroups:q},sources:[{id:'W1',excerpt:q.quote,title:'儿童暴露'}]});
  assert.ok(!r.slots.sensitiveGroups);
 });
 test('阿斯巴甜深度区human_trial统一后进入简明高摄入，引用不丢',()=>{
  const r=get('阿斯巴甜');assert.match(r.result.healthInsights.highIntake.text,/苯丙氨酸/);
  assert.equal(r.result.healthInsights.highIntake.studyType,'human');
  assert.ok(r.result.healthInsights.highIntake.sourceRefs.length);
 });
 test('三个类别合并缺口且不继承随机香料危害',()=>{
  for(const name of ['食用香精','香辛料','复合调味料']){
   const r=get(name);assert.equal(r.view.rows.length,0);assert.equal(r.view.headline,null);
   assert.equal(r.view.gaps.length,1);assert.equal(r.view.deepFacts.length,0);
   assert.equal(r.view.foodMeaning,null,'旧模型的重复组成说明不绕回食品栏');
  }
 });
 test('通用适用性不随成分名字变化，乐观模型标注不能覆盖特殊条件',()=>{
  // Synthetic routing fixtures only; these sentences are not scientific claims
  // about either substance and never enter the browser acceptance data.
  for(const name of ['塔格糖','阿洛酮糖','测试新成分甲']){
   const text='婴儿特殊配方喂养试验记录了指标变化。';
   const r=organizeConsumerEvidence({name,foodContext,studies:[{text,studyType:'human',semanticChecked:true,
    sourceRefs:['W1'],quote:'Synthetic infant formula study fixture.',
    applicability:{population:'general_population',route:'food_oral',generalizable:true}}],
    sources:[{id:'W1',title:'Synthetic routing fixture',excerpt:'Synthetic infant formula study fixture.'}]});
   assert.equal(r.deepFacts.length,1);assert.equal(r.deepFacts[0].applicability.generalizable,false);
   assert.equal(r.deepFacts[0].applicability.population,'infants');assert.equal(Object.keys(r.slots).length,0);
  }
  for(const text of ['哮喘患者的试验观察。','儿童的摄入试验。','大鼠实验观察。']){
   assert.equal(inferApplicability({text,studyType:'human',semanticChecked:true,
    applicability:{population:'general_population',generalizable:true}},foodContext).generalizable,false);
  }
 });
 test('普通原料不套ADI；两个新增未收录名称不捏造疾病',()=>{
  for(const name of ['白砂糖','食用盐','竹笋'])assert.ok(!/ADI/.test(JSON.stringify(get(name).view)));
  for(const name of ['塔格糖','阿洛酮糖']){
   assert.equal(matchIngredient(name).status,'unknown');
   assert.equal(get(name).view.rows.length,0);assert.equal(get(name).view.headline,null);
   assert.equal(get(name).result.consumerEvidence.facts.length,0);
  }
 });
 test('伪造引用不被简明提升或深入展示；动物仅留科学背景',()=>{
  const bad=organizeConsumerEvidence({studies:[{text:'测试成分会降低血压。',sourceRefs:['W999'],quote:'invented',studyType:'human'}],sources:[]});
  assert.equal(bad.deepFacts.length,0);assert.equal(Object.keys(bad.slots).length,0);
  const r=get('EDTA 二钠');assert.ok(r.view.deepFacts.some(f=>f.applicability.population==='animal'));
  assert.ok(!r.view.rows.some(f=>f.key==='highIntake'&&f.applicability.population==='animal'));
 });
 test('真实日志、预算、模型调用次数均未改变',()=>{assert.equal(networkCalls,0);assert.equal(ledgerHash(),hash);});
 fs.writeFileSync(OUTPUT+'/display-results.json',JSON.stringify(results,null,2));
 fs.writeFileSync(OUTPUT+'/verification.json',JSON.stringify({cases:results.length,networkCalls,paidCalls:0,ledgerBefore:hash,ledgerAfter:ledgerHash()},null,2));
 console.log('V2.5.1 quality cases: '+results.length+'; paid calls: 0');
} finally {globalThis.fetch=realFetch;}
