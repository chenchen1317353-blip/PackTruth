import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { organizeConsumerEvidence } from '../../src/domain/evidence/consumerEvidence.js';
import { HEALTH_SCHEMA_VERSION, summarizeHealthAnswers } from '../../src/domain/evidence/healthAnswer.js';
import { getCategoryHint } from '../../src/app/ingredientView.js';
import { buildIngredientCard, matchIngredient } from '../../src/domain/ingredients/index.js';

export const OUTPUT='runtime-output/quality-v251';
export const foodContext={productName:'内容组织回放样本',category:'酱腌菜',ingredientsText:'竹笋、水、食用盐',nutrition:{basis:'per_100g',items:[{name:'钠',value:800,unit:'mg'}]}};
export const ledgerHash=()=>createHash('sha256').update(fs.readFileSync('runtime-output/consumer-rebuild/paid-ledger.json')).digest('hex');
const saved=file=>JSON.parse(fs.readFileSync('runtime-output/consumer-rebuild/'+file,'utf8'));
const fromLive=(file,tag)=>{const x=saved(file);return {name:x.name,tag,provenance:'上轮真实DeepSeek结果，零调用回放',file,before:x.result};};
export function rebuildQualityResult(test) {
  const r=structuredClone(test.before);
  const consumerEvidence=organizeConsumerEvidence({insights:r.healthInsights,studies:r.studies,sources:r.sources,name:test.name,
    aliases:r.identityGraph?.en,foodContext:test.foodContext||foodContext,category:Boolean(getCategoryHint(test.name))||test.category});
  const h=Object.keys(consumerEvidence.slots).length?consumerEvidence.slots:null;
  const summary=summarizeHealthAnswers({insights:h,rejected:r.healthRejected,evidenceFacts:consumerEvidence.facts});
  return {...r,ingredient:test.name,consumerEvidence,healthInsights:h,healthSchema:HEALTH_SCHEMA_VERSION,
    ...summary,healthUnanswered:Object.entries(summary.healthAnswers).filter(([,v])=>v.status!=='answered').map(([k])=>k),
    cached:false,demoReplay:false,retrievedAt:null,qualityReplay:true};
}
function empty(name,category=false) {
  const card=buildIngredientCard(matchIngredient(name));
  return {name,category,tag:category?'category':'limited',provenance:'离线缺证据/本地基础资料场景；未联网取得该成分研究',
    before:{ingredient:name,status:'partial',healthSchema:3,healthInsights:null,studies:[],sources:[],
      brief:card?.brief?{...card.brief,sourceRefs:[],sources:[],tier:'local'}:null,sections:[],
      identity:{type:category?'uncertain':'food_ingredient',label:category?'类别型配料':'普通食品配料'}}};
}
export const QUALITY_CASES=[
  fromLive('monograph-0.json','special_population'),
  fromLive('verified-3.json','suitability'),
  fromLive('verified-5.json','category'),
  empty('香辛料',true),empty('复合调味料',true),
  fromLive('browser-live.json','additive'),
  fromLive('extracted-2.json','additive'),
  fromLive('population-0.json','special_population'),
  fromLive('finalcore-3.json','mixture'),
  fromLive('extracted-4.json','human_from_deep'),
  fromLive('extracted-5.json','chemical_forms'),
  fromLive('finalfix-1.json','ordinary'),
  fromLive('extracted-7.json','ordinary'),
  empty('竹笋'),
  empty('塔格糖'),empty('阿洛酮糖'),
];
// A second suitability example, grounded in the saved WHO text. This is a
// constructed classification input, never presented as a prior model output.
const salt=saved('extracted-7.json').result.sources.find(s=>s.excerpt.includes('如果选择使用食盐，世卫组织建议用含钾的低钠盐替代品取代普通食盐。'));
const substitute={text:'对选择用盐的人，含钾低钠盐可作为普通食盐的替代选择。',quote:'如果选择使用食盐，世卫组织建议用含钾的低钠盐替代品取代普通食盐。',
  sourceRefs:[salt.id],semanticChecked:true,answerKind:'named_group',studyType:'assessment',evidenceStatus:'supported',populationInfo:{nature:'suitability'}};
QUALITY_CASES.push({name:'含钾低钠盐',tag:'suitability',provenance:'上轮保存WHO原文＋离线构造的分类输入（非原模型答复）',
  before:{status:'partial',healthSchema:3,healthInsights:{sensitiveGroups:substitute},sources:[salt],studies:[],sections:[],identity:{type:'food_ingredient',label:'食品配料'}}});
export const cardFor=name=>buildIngredientCard(matchIngredient(name));
