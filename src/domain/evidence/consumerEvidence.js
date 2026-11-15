import { getCategoryHint } from '../ingredients/categories.js';
import { answersQuestion, isHeadlineEligible, isTechnicalOnly, judgeAnswerKind } from './healthAnswer.js';
import { checkHealthClaim, verifyQuoteSupport } from './healthGuard.js';

export const CONSUMER_EXPLANATION_VERSION = 1;
export const POPULATION_NATURE = { RISK: 'risk', EXPOSURE: 'higher_exposure', SUITABILITY: 'suitability', NONE: 'none', UNCERTAIN: 'uncertain' };
const unique = list => [...new Set(list.filter(Boolean))];
const norm = s => String(s || '').replace(/[\s，,。.；;：:、（）()]/g, '').toLowerCase();
const member = (value, list, fallback) => list.includes(value) ? value : fallback;
const infants = /婴儿|婴幼儿|新生儿|\binfants?\b|\bbabies\b|\bneonat/i;
const children = /儿童|幼儿|\bchildren\b|\btoddlers?\b/i;
const patient = /患者|疾病|哮喘|苯丙酮尿症|糖尿病|\bpatients?\b|asthma|phenylketonuria|diabet/i;
const animal = /大鼠|小鼠|家兔|兔子|动物(?:研究|试验|实验)|\brats?\b|\bmice\b|\brabbits?\b/i;
const benefit = /(?:可|能够|适合|适用).{0,20}(?:替代|选择|使用|用于)|替代选择|营养用途|潜在受益|suitable|alternative for|may benefit/i;
const risk = /不应|不宜|不适用|禁用|避免|限制.{0,12}摄入|需要.{0,10}注意|敏感反应|超敏|过敏|不良反应|不耐受|利用.{0,6}困难|(?:出现|发生|引起|导致).{0,20}(?:腹泻|酸中毒|哮喘|头痛|损伤)|should not|avoid|contraindicat|hypersensitiv|adverse reaction|intoleran/i;
const exposure = /(?:暴露|膳食|摄入).{0,20}(?:估计|估算|情景|百分位|超过|高于)|高暴露|高消费人群|exposure estimates?|high consumers?|percentile|exceed.{0,20}ADI/i;
const highDose = /高剂量|单次.{0,8}(?:大量|剂量)|单剂量|(?:单|一)次吃较多|灌胃|激发试验|研究剂量|剂量远高于|experimental dose|high doses?|gavag|challenge/i;
const specialRoute = /(?:特殊|婴儿|婴幼儿|配方).{0,12}(?:喂养|配方|奶)|酸化奶|formula|infant feeding|acidified milk/i;
const contextOnly = /不适用于|不能.{0,12}(?:外推|套用|等同)|不直接覆盖|不同.{0,8}用途|cannot be extrapolated/i;
const normalizeStudyType = value => /^(human(?:_trial|_observation|_study)?|rct|clinical_trial)$/i.test(value || '') ? 'human'
  : /animal/i.test(value || '') ? 'animal' : /in.?vitro/i.test(value || '') ? 'in_vitro' : value;

/** Older saved results have no semantic annotations. These conservative inferences
 * describe the claim's own context, never the whole document's disease keywords. */
export function inferApplicability(item = {}, foodContext = null) {
  const prose = [item.title, item.text, item.studyContext, item.conditions].filter(Boolean).join(' ');
  const anchor = (item.quotes?.map(q => q.quote).join(' ') || item.quote || '');
  const primary = String(item.text || '').split(/[。；;]/)[0];
  const subject = item.studyType === 'assessment' ? primary : [item.studyContext, item.text].filter(Boolean).join(' ') || anchor;
  const annotation = item.semanticChecked ? item.applicability || {} : {};
  const inferredPopulation = ['animal','in_vitro'].includes(item.studyType) || animal.test(item.studyContext || '') || item.studyType !== 'assessment' && animal.test(primary)
    ? 'animal' : infants.test(subject) ? 'infants' : patient.test(subject) && !/一般人群|普通人群|general population/i.test(item.text || '')
      ? 'clinical_group' : children.test(subject) && !/(?:成年(?:人)?|成人)(?:和|及|与)儿童|adults? and children/i.test(subject)
        ? 'children' : /成人|男性|女性|志愿者|healthy|adults?|volunteers?/i.test(subject) ? 'general_adults' : 'general_population';
  // Explicit restrictive context wins over an optimistic model label.
  const population = ['animal','infants','children','clinical_group'].includes(inferredPopulation) ? inferredPopulation
    : member(annotation.population, ['general_population','general_adults','children','infants','clinical_group','animal','unknown'], inferredPopulation);
  const route = specialRoute.test(prose) ? 'special_formula' : /静脉|注射|intravenous|injection/i.test(prose) ? 'non_oral'
    : /浓缩|浓原液|concentrat/i.test(prose) ? 'concentrate' : /灌胃|gavag/i.test(prose) ? 'experimental_dosing'
      : member(annotation.route, ['food_oral','special_formula','experimental_dosing','concentrate','non_oral','unknown'], 'food_oral');
  const dose = highDose.test(prose) ? 'experimental_high' : exposure.test(prose) ? 'high_dietary'
    : member(annotation.dose, ['dietary','high_dietary','experimental_high','unknown'], 'unknown');
  const setting = population === 'animal' ? 'laboratory' : route === 'special_formula' || ['infants','clinical_group'].includes(population) ? 'special_population'
    : /随机|试验|临床|trial|randomi[sz]/i.test(prose) ? 'clinical_trial'
      : member(annotation.setting, ['everyday_diet','clinical_trial','laboratory','special_population','assessment','unknown'], item.studyType === 'assessment' ? 'assessment' : 'unknown');
  const target = [foodContext?.category, foodContext?.productName, foodContext?.consumerGroup].filter(Boolean).join(' ');
  const samePopulation = population === 'infants' && infants.test(target) || population === 'children' && children.test(target)
    || population === 'clinical_group' && patient.test(target);
  const restricted = population === 'animal' || ['non_oral','concentrate','special_formula'].includes(route) || ['infants','children','clinical_group'].includes(population) && !samePopulation;
  const generalizable = restricted ? false : annotation.generalizable === false ? false
    : population === 'unknown' || route === 'unknown' ? 'unknown' : true;
  const foodRelevance = restricted ? samePopulation ? 'conditional' : 'context_only' : contextOnly.test(prose) ? 'conditional'
    : member(annotation.foodRelevance, ['direct','conditional','context_only','unrelated','unknown'], foodContext ? 'conditional' : 'unknown');
  return { population, route, dose, setting, foodRelevance, generalizable, samePopulation: Boolean(samePopulation),
    provenance: Object.keys(annotation).length ? 'semantic_with_conservative_constraints' : 'legacy_context_inference' };
}

export function classifyPopulationInfo(item = {}) {
  if (item.absence) return POPULATION_NATURE.NONE;
  const text = item.text || '';
  const annotated = item.semanticChecked ? item.populationInfo?.nature : null;
  // A disease name is never by itself a risk instruction.
  if (benefit.test(text) && !risk.test(text)) return POPULATION_NATURE.SUITABILITY;
  if (exposure.test(text) && !/敏感反应|超敏|过敏|禁用|不应|不耐受|hypersensitiv|contraindicat/i.test(text)) return POPULATION_NATURE.EXPOSURE;
  if (risk.test(text) && (infants.test(text) || children.test(text) || patient.test(text) || /敏感|不耐受|sensitive/i.test(text))) return POPULATION_NATURE.RISK;
  if (annotated === POPULATION_NATURE.RISK && !risk.test(text)) return POPULATION_NATURE.UNCERTAIN;
  return member(annotated, Object.values(POPULATION_NATURE), POPULATION_NATURE.NONE);
}

function supported(item, sources, name, aliases) {
  if (item.absence) return true;
  const refs = item.sourceRefs || [];
  const cited = sources.filter(s => refs.includes(s.id));
  if (!refs.length || cited.length !== unique(refs).length) return false;
  const quotes = item.quotes?.length ? item.quotes : [{ quote: item.quote }];
  if (!quotes.every(q => verifyQuoteSupport(q.quote, cited).ok)) return false;
  return checkHealthClaim(item.text, { ingredientName: name, aliases, citedEvidence: cited, conditions: item.conditions, semanticChecked: Boolean(item.semanticChecked || item.verified) }).status !== 'reject';
}

function consumerText(text) {
  return String(text || '').replace(/在作为食品添加剂使用的评估条件下/g,'在评估的食品使用条件下')
    .replace(/目前没有获取可直接支持[^。]*证据。?/g,'目前查到的研究还不能说明正常吃这类食品会产生什么具体不良反应。')
    .replace(/出生前三个月婴儿/g,'出生后前三个月的婴儿');
}
// An exact leading clause may be shown when the remainder is either derivation
// detail or a separate population warning already visible elsewhere. Never clip
// an opposing finding or an unrepresented qualification.
function assessmentLead(fact, facts) {
  if (fact.studyType !== 'assessment' || fact.answerKind !== 'evaluation') return null;
  const match = fact.text.match(/^([^；;]+)[；;](.+)$/s);
  if (!match || match[1].length > 150) return null;
  const [, lead, rest] = match;
  const derivation = /^(?:该|此|上述)?\s*ADI.{0,12}(?:由|基于|推导|源自)/i.test(rest);
  const group = infants.test(rest) ? infants : children.test(rest) ? children : patient.test(rest) ? patient : null;
  const warningElsewhere = group && risk.test(rest) && facts.some(f => f.id !== fact.id && f.populationNature === 'risk' && group.test(f.text));
  return derivation || warningElsewhere ? lead + '。' : null;
}
function candidateKind(item, slot) {
  const lexical = judgeAnswerKind({ slot: slot === 'sensitiveGroups' ? 'highIntake' : slot, text: item.text, absence: item.absence });
  if (item.absence || isTechnicalOnly(item.text)) return item.absence ? 'reference' : 'none';
  if (slot === 'sensitiveGroups') return item.populationNature === 'risk' ? 'named_group' : lexical;
  if (lexical === 'effect') return lexical;
  if (item.studyType === 'human' && /升高|上升|降低|下降|增加|减少|未显著改变|未改变|未超|无显著差异/.test(item.text)) return 'effect';
  if (/未(?:观察到|发现).{0,30}(?:变化|影响|不良)|无.{0,10}临床相关变化/.test(item.text)) return 'effect';
  return item.answerKind || lexical;
}
function headlineScore(fact) {
  if (!isHeadlineEligible(fact) || fact.absence || fact.applicability.generalizable !== true || fact.populationNature === 'suitability' || ['context_only','unrelated'].includes(fact.applicability.foodRelevance)) return -Infinity;
  if (fact.applicability.dose === 'experimental_high' && fact.studyType !== 'assessment') return -Infinity;
  return (fact.originSlot === 'consumerTakeaway' ? 60 : fact.answerKind === 'evaluation' ? 55 : 30)
    + (fact.evidenceStatus === 'authoritative' ? 8 : 0) - Math.max(0, fact.text.length - 100) / 8;
}
function scoreSlot(f, slot) {
  if (f.absence || f.answerKind === 'none') return -Infinity;
  if (slot === 'normalIntake') {
    if (f.applicability.generalizable !== true || ['context_only','unrelated'].includes(f.applicability.foodRelevance) || f.applicability.dose === 'experimental_high' || f.populationNature === 'suitability') return -Infinity;
    if (!['evaluation','effect'].includes(f.answerKind)) return -Infinity;
    if (f.studyType !== 'assessment' && f.originSlot !== 'normalIntake' || f.answerKind === 'named_group') return -Infinity;
    return (f.originSlot === slot ? 55 : 35) + (f.answerKind === 'evaluation' ? 20 : 0);
  }
  if (slot === 'highIntake') {
    if (f.applicability.generalizable !== true || ['context_only','unrelated'].includes(f.applicability.foodRelevance) || ['animal','in_vitro'].includes(f.studyType) || f.populationNature === 'suitability' || f.populationNature === 'risk' && f.applicability.population === 'clinical_group') return -Infinity;
    // ADI and exposure estimates stay available as context, not bodily effects.
    return f.answerKind === 'effect' ? (f.studyType === 'human' ? 100 : 75) : -Infinity;
  }
  if (slot === 'sensitiveGroups') return f.populationNature === 'risk' ? (f.originSlot === slot ? 70 : 40) : -Infinity;
  return -Infinity;
}

/** One pure assembly for live results, saved-result replay, demos and both UI depths.
 * Facts keep their exact full text and citations. Routing never fabricates a health claim. */
export function organizeConsumerEvidence({ insights = {}, studies = [], facts: savedFacts = null, sources = [], foodContext = null, name = '', aliases = [], category = false } = {}) {
  category = category || Boolean(getCategoryHint(name));
  sources = [...new Map(sources.map(s=>[s.id+'|'+s.url,s])).values()];
  const facts = [], rejected = [], seen = new Map();
  const offered = savedFacts?.length ? savedFacts : [...Object.entries(insights || {}).map(([originSlot,f])=>({...f,originSlot})),
    ...studies.map(f=>({...f,originSlot:'study'}))];
  for (const [i, original] of offered.entries()) {
    const item = {...original,studyType:normalizeStudyType(original?.studyType)};
    if (!item?.text) continue;
    if (!supported(item,sources,name,aliases)) { rejected.push({ text:item.text, reason:'来源或科学底线未核对通过', originSlot:item.originSlot }); continue; }
    const key=norm(item.text);
    if (seen.has(key)) { const old=seen.get(key); old.originSlots=unique([...old.originSlots,item.originSlot]); continue; }
    const applicability=inferApplicability(item,foodContext), populationNature=classifyPopulationInfo(item);
    const fact={...item,id:'health-fact-'+i,originSlots:[item.originSlot],fullText:item.text,text:consumerText(item.text),applicability,populationNature,verified:true,
      quotes:(item.quotes || []).map(q=>({...q,sourceRef:verifyQuoteSupport(q.quote,sources.filter(s=>(item.sourceRefs||[]).includes(s.id))).evidenceId || q.sourceRef})),
      sources:sources.filter(s=>(item.sourceRefs||[]).includes(s.id))};
    fact.answerKind=candidateKind(fact,item.originSlot);
    fact.answersQuestion=answersQuestion(fact.answerKind,item.originSlot,{animalOnly:applicability.population==='animal'});
    if (item.originSlot==='sensitiveGroups' && populationNature!=='risk') fact.answersQuestion=false;
    if (category && !item.absence) { fact.categoryExcluded=true; fact.applicability.generalizable=false; fact.applicability.foodRelevance='unrelated'; }
    facts.push(fact);seen.set(key,fact);
  }
  const candidates=facts.filter(f=>!f.categoryExcluded), slots={};
  for (const fact of candidates) fact.consumerLead = assessmentLead(fact, candidates);
  const headline=[...candidates].sort((a,b)=>headlineScore(b)-headlineScore(a))[0];
  if (headline && Number.isFinite(headlineScore(headline))) slots.consumerTakeaway=headline;
  for (const slot of ['normalIntake','highIntake','sensitiveGroups']) {
    const chosen=[...candidates].sort((a,b)=>scoreSlot(b,slot)-scoreSlot(a,slot))[0];
    if (chosen && Number.isFinite(scoreSlot(chosen,slot))) slots[slot]={...chosen,answersQuestion:slot==='sensitiveGroups'||answersQuestion(chosen.answerKind,slot,{animalOnly:false}),slot};
  }
  const populationContext=candidates.filter(f=>['suitability','higher_exposure'].includes(f.populationNature));
  const gaps=[];
  if(category) gaps.push({code:'composition',text:'包装只写了配料类别。还需要具体组成，才能查对应的健康评估。'});
  else if(!Object.keys(slots).length) gaps.push({code:'limited_health',text:facts.some(f=>!f.absence)?'现有研究有特定对象或条件，暂不能直接说明一般食用的健康影响。':'这次没有取得能直接回答健康影响的资料，先看已经确认的配料信息。'});
  else if(!slots.highIntake) gaps.push({code:'general_intake',text:candidates.some(f=>!f.absence && f.applicability.generalizable===false)?'特殊人群和实验条件下的研究保留在深入了解中，不能直接当作一般人吃多后的反应。':'本次没有取得一般人高摄入后具体反应的直接证据。'});
  const deepFacts=candidates.filter(f=>!f.absence).sort((a,b)=>(a.applicability.generalizable===true?0:1)-(b.applicability.generalizable===true?0:1));
  return {version:CONSUMER_EXPLANATION_VERSION,category,facts,slots,populationContext,gaps,deepFacts,rejected};
}
