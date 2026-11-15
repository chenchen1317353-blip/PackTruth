/**
 * V2.5 八个验收案例（官方资料回放 + 真实校验器，零付费调用）。
 *
 * 这里验证的是：
 *   身份关系 → 证据台账 → 健康结论准入 → 消费者视图
 * 这条链路在八个不同难度的案例上都能工作，而不是只对 INS 635 写死。
 *
 * 不验证：DeepSeek 实时搜索是否命中（没有授权付费调用，见最终报告）。
 */

import assert from 'node:assert/strict';
import { ACCEPTANCE_CASES } from './fixtures/acceptance-cases.mjs';
import { resolveSubstanceIdentity, matchEvidenceToIdentity } from '../server/lib/substanceIdentity.js';
import { createEvidenceLedger, addRecord, buildCompletionAudit } from '../server/lib/evidenceLedger.js';
import { validateHealthInsights, validateFoodMeaning } from '../src/domain/evidence/healthGuard.js';
import { buildHealthView, buildHealthGapView } from '../src/app/ingredientView.js';
import { summarizeHealthAnswers } from '../src/domain/evidence/healthAnswer.js';

let pass = 0;
const failures = [];
function t(id, name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ [${id}] ${name}`);
  } catch (e) {
    failures.push(`${id} ${name} — ${e.message}`);
    console.log(`  ✗ [${id}] ${name}\n         ${e.message}`);
  }
}
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function runCase(c) {
  const identity = resolveSubstanceIdentity({ name: c.name, aliases: c.aliases || [] });
  const ledger = createEvidenceLedger({ identity, hasLocalEntry: false });
  for (const ev of c.evidence) {
    addRecord(ledger, {
      url: ev.url,
      title: ev.title,
      content: ev.excerpt,
      organization: ev.organization,
      publishedAt: ev.publishedAt,
      authority: 4,
      read: true,
      round: 1,
      focus: 'normal',
    });
  }
  const aliases = [
    ...(c.aliases || []),
    ...identity.names,
    ...(identity.analogs || []).flatMap((a) => [a.name, ...(a.en || [])]),
    ...(identity.groupNames || []),
    ...(identity.constituents || []).flatMap((x) => [x.name, ...(x.en || [])]),
  ];
  const health = validateHealthInsights({
    raw: c.model.healthInsights,
    evidenceSet: c.evidence,
    ingredientName: c.name,
    aliases,
  });
  const food = validateFoodMeaning({
    raw: c.model.foodMeaning,
    evidenceSet: c.evidence,
    ingredientName: c.name,
    aliases,
    foodContext: c.foodContext,
  });
  const view = c.model.healthInsights
    ? buildHealthView(
        { healthInsights: health.insights, healthSchema: 2, foodMeaning: food.value },
        { foodContext: c.foodContext, name: c.name },
      )
    : null;
  const answers = summarizeHealthAnswers({ insights: health.insights, rejected: health.rejected });
  return { identity, ledger, health, food, view, answers };
}

console.log('\n【A】六个有证据的案例：能否找回并正确解释健康信息\n');

for (const c of ACCEPTANCE_CASES.filter((x) => x.model.healthInsights)) {
  t(c.key, `${c.name}：${c.expect.mustInclude.join(' / ')}`, () => {
    const r = runCase(c);
    ok(r.health.insights, `没有健康结论；rejected=${JSON.stringify(r.health.rejected)}`);
    const text = Object.values(r.health.insights).map((x) => x.text).join('\n');
    for (const must of c.expect.mustInclude) {
      ok(text.includes(must), `缺少「${must}」：${text}`);
    }
    for (const bad of c.expect.mustNotInclude || []) {
      ok(!text.includes(bad), `出现了不应有的话「${bad}」`);
    }
    ok(r.view, '没有生成健康视图');
    for (const [slot, status] of Object.entries(c.expect.coverage)) {
      ok(
        r.ledger.coverage[slot] === status,
        `${slot} 覆盖应为 ${status}，实际 ${r.ledger.coverage[slot]}`,
      );
    }
    const answered = r.answers.healthAnswers;
    if (c.expect.normal === 'answered') ok(answered.normalIntake.status === 'answered', '正常食用未回答');
    if (c.expect.high === 'answered') ok(answered.highIntake.status === 'answered', '高摄入未回答');
    if (c.expect.high === 'missing') ok(answered.highIntake.status !== 'answered', '高摄入不应算已回答');
    if (c.expect.sensitive === 'answered') ok(answered.sensitiveGroups.status === 'answered', '特殊人群未回答');
    // 关键结论必须带研究条件/证据基础
    for (const slot of ['consumerTakeaway', 'normalIntake', 'highIntake', 'sensitiveGroups']) {
      const item = r.health.insights[slot];
      if (!item) continue;
      ok(item.studyType, `${slot} 缺少 studyType`);
      ok(item.evidenceBasis, `${slot} 缺少 evidenceBasis`);
    }
    if (c.expect.basis) {
      const bases = Object.values(r.health.insights).map((x) => x.evidenceBasis);
      ok(bases.includes(c.expect.basis), `证据基础没有 ${c.expect.basis}：${bases.join(',')}`);
    }
    ok(r.food.value, '没有通过校验的「对这款食品」说明');
  });
}

console.log('\n【B】本地未收录 / 真正缺资料的案例：不能编造\n');

t('bamboo', '竹笋：普通食材，没有正式健康评估时如实说明', () => {
  const c = ACCEPTANCE_CASES.find((x) => x.key === 'bamboo');
  const r = runCase(c);
  ok(!r.health.insights, '不应生成健康结论');
  const gap = buildHealthGapView({
    healthInsights: null,
    healthAnswers: {
      normalIntake: { status: 'no_evidence' },
      highIntake: { status: 'no_evidence' },
      sensitiveGroups: { status: 'no_evidence' },
    },
    healthUnanswered: ['normalIntake', 'highIntake', 'sensitiveGroups'],
    healthCoverage: { available: false },
    identity: { type: 'food_ingredient' },
    healthRoundUsed: true,
    searchBudget: { usedRounds: 3 },
  });
  ok(gap && /普通食材/.test(gap.text), `缺口说明不对：${gap?.text}`);
  ok(!/致癌|没有营养/.test(gap.text), '出现了没有证据的判断');
});

console.log('\n【C】INS 635 的完整链路：组成物质联合评估 + 人体研究剂量\n');

t('ins635-deep', 'INS 635：JECFA 联合评估 + 3 名健康男性 + 尿酸剂量', () => {
  const c = ACCEPTANCE_CASES.find((x) => x.key === 'ins635');
  const r = runCase(c);
  ok(r.ledger.coverage.normal === 'direct', '正常食用应是直接评估');
  ok(r.ledger.coverage.high === 'human', '高摄入应有人体证据');
  ok(r.ledger.coverage.original === 'read', '应已取得可读原文');
  const high = r.health.insights.highIntake;
  ok(/3 名健康男性/.test(high.text), '缺少受试人数');
  ok(/2 000/.test(high.text) && /4 000/.test(high.text), '缺少研究剂量');
  ok(/尿酸/.test(high.text), '缺少观察指标');
  ok(high.studyType === 'human', `studyType 应为 human，实际 ${high.studyType}`);
  ok(high.evidenceBasis === 'constituent', '证据基础应为组成物质联合评估');
  ok(/组成物质|联合评估/.test(high.basisNote || high.conditions || ''), '没有标明联合评估');
  const completion = buildCompletionAudit(r.ledger, { final: { answered: 2, conditionsKept: true } });
  ok(completion.items.find((x) => x.id === 'authority')?.status === 'done', '权威评估未标记完成');
  ok(completion.items.find((x) => x.id === 'original')?.status === 'done', '原文阅读未标记完成');
});

console.log('\n【D】不同化学形式：EDTA 二钠 vs 钙二钠\n');

t('edta-forms', 'EDTA：组 ADI 可以共用，具体结论不能互换', () => {
  const c = ACCEPTANCE_CASES.find((x) => x.key === 'edta');
  const r = runCase(c);
  ok(r.identity.analogs.some((a) => /calcium/i.test(a.en.join(' '))), '没有识别钙二钠是不同形式');
  const high = r.health.insights.highIntake;
  ok(high.studyType === 'animal', '高摄入应标为动物证据');
  ok(high.answersQuestion === false, '动物证据不应算人体高摄入已回答');
  ok(/钙二钠/.test(high.text), '没有写明研究的是钙二钠');
  const group = r.health.insights.normalIntake;
  ok(/2.5 mg\/kg/.test(group.text), '缺少组 ADI');
  ok(/组 ADI/.test(group.text), '没有标明这是组 ADI');
});

console.log('\n【E】证据基础：组成物质 / 组 / 不同形式\n');

for (const [key, expected] of [
  ['ins635', 'constituent'],
  ['msg', 'group'],
  ['sulfite', 'direct'],
  ['succinate', 'group'],
  ['edta', 'group'],
]) {
  t(`basis-${key}`, `${key}：证据基础应包含 ${expected}`, () => {
    const c = ACCEPTANCE_CASES.find((x) => x.key === key);
    const r = runCase(c);
    const bases = Object.values(r.health.insights).map((x) => x.evidenceBasis);
    ok(bases.includes(expected), `实际：${bases.join(',')}`);
  });
}

console.log(`\n结果：${pass} 通过 / ${failures.length} 失败\n`);
for (const f of failures) console.log('  ✗', f);
process.exit(failures.length === 0 ? 0 : 1);
