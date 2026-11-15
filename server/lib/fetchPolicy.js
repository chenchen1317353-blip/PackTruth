/**
 * Fetch 调度策略（纯函数，可单测）。
 *
 * V5.1 的规则是「正文总量够 600 字符就不抓」，它有一个致命副作用：
 * 两篇很长的 GB 2760 使用条件页就能把额度占满，
 * 真正能回答健康问题的 EFSA / JECFA 原文永远不会被打开。
 *
 * 现在的规则分两层：
 *   1. 健康优先：只要还有健康问题没被回答（missingQuestions 非空），
 *      就按「这份资料能不能回答那个问题」排序，最多抓 4 页；
 *   2. 长度兜底：健康问题都答上了（或没有健康候选），
 *      再回到「正文不够才补」的旧规则，避免为凑数而多抓。
 *
 * 仍然遵守：单页 <300 字符视为没有正文；最多 4 页；不抓白名单外的 URL（由上游过滤）。
 */

import { classifyEvidenceKind, EVIDENCE_KIND } from '../../src/domain/evidence/healthEvidence.js';

export const MIN_SINGLE_CONTENT = 300;
export const MIN_TOTAL_BODY_CHARS = 600;
export const MAX_FETCH_PAGES = 4;

/** 健康评估类词汇：用来判断一份「还没正文」的搜索结果值不值得打开 */
const HEALTH_HINT_RE =
  /(safety assessment|risk assessment|re-?evaluation|acceptable daily intake|\bADI\b|dietary exposure|toxicolog|no observed adverse|NOAEL|每日允许摄入量|风险评估|再评估|毒理)/i;
const HIGH_HINT_RE =
  /(high intake|high exposure|excessive|adverse (?:effect|reaction)|blood pressure|headache|asthma|dental caries|caries|weight gain|高摄入|过量|不良反应|血压|头痛|哮喘|龋齿)/i;
const GROUP_HINT_RE =
  /(sensitive|sensitivity|intoleran|allerg|asthma|phenylketonuria|\bPKU\b|sulfite|infant|children|pregnan|敏感|不耐受|过敏|哮喘|苯丙酮尿症|婴幼儿|孕妇|儿童)/i;

function textOf(p) {
  const r = p?.result || {};
  return `${r.title || ''}\n${r.snippet || ''}\n${r.summary || ''}`;
}

/**
 * 给一个待抓取候选打分。
 * @returns {{ score:number, kind:string, answers:string[] }}
 */
export function scoreFetchCandidate(planItem, { missingQuestions = [] } = {}) {
  const text = textOf(planItem);
  const cls = classifyEvidenceKind({ title: planItem?.result?.title || '', excerpt: text });
  const answers = [];
  let score = 0;

  if (cls.kind === EVIDENCE_KIND.RISK) {
    score += 6;
    answers.push('normal');
  }
  if (cls.kind === EVIDENCE_KIND.SENSITIVE) {
    score += 7;
    answers.push('sensitive');
  }
  if (cls.kind === EVIDENCE_KIND.HUMAN || cls.kind === EVIDENCE_KIND.ANIMAL) score += 3;

  if (HEALTH_HINT_RE.test(text)) {
    score += 2;
    answers.push('normal');
  }
  if (HIGH_HINT_RE.test(text)) {
    score += 2;
    answers.push('high');
  }
  if (GROUP_HINT_RE.test(text)) {
    score += 2;
    answers.push('sensitive');
  }

  // 缺什么就加权什么：这是「优先打开真正相关的原文」的核心
  for (const q of missingQuestions) {
    if (answers.includes(q)) score += 4;
  }
  if (planItem?.mentions) score += 1;
  score += Math.min(Math.max(planItem?.result?.authority ?? 0, 0), 4) * 0.5;

  return { score, kind: cls.kind, answers: [...new Set(answers)] };
}

/**
 * @param {Array<{kind:string, body?:string, result?:object, mentions?:boolean}>} plan
 * @param {{minTotalBodyChars?:number, maxFetchPages?:number, missingQuestions?:string[]}} [opts]
 * @returns {{needFetch:boolean, bodyChars:number, targets:Array, reason:string, healthTargets:number}}
 */
export function planFetch(
  plan = [],
  {
    minTotalBodyChars = MIN_TOTAL_BODY_CHARS,
    maxFetchPages = MAX_FETCH_PAGES,
    missingQuestions = [],
  } = {},
) {
  const withBody = plan.filter((p) => p.kind === 'search_content' || p.kind === 'fetch_content');
  const bodyChars = withBody.reduce((n, p) => n + (p.body?.length || 0), 0);
  const pending = plan.filter((p) => p.kind === 'pending');

  if (pending.length === 0) {
    return {
      needFetch: false,
      bodyChars,
      targets: [],
      reason: '没有待抓取的候选页面',
      healthTargets: 0,
    };
  }

  // ---- 第一层：健康问题优先 ----
  if (missingQuestions.length > 0) {
    const ranked = pending
      .map((p) => ({ p, ...scoreFetchCandidate(p, { missingQuestions }) }))
      .sort((a, b) => b.score - a.score);

    // 只抓「真的像在回答某个健康问题」的页面，避免把无关页面也抓一遍
    const healthTargets = ranked.filter(
      (x) => x.answers.some((q) => missingQuestions.includes(q)) || x.score >= 7,
    );
    const targets = (healthTargets.length > 0 ? healthTargets : ranked)
      .slice(0, maxFetchPages)
      .map((x) => x.p);

    if (targets.length > 0) {
      return {
        needFetch: true,
        bodyChars,
        targets,
        reason:
          `还有 ${missingQuestions.length} 个健康问题缺少直接证据` +
          `（${missingQuestions.join(' / ')}），优先抓取 ${targets.length} 篇可能回答它们的原文`,
        healthTargets: healthTargets.length,
      };
    }
  }

  // ---- 第二层：正文长度兜底 ----
  if (bodyChars >= minTotalBodyChars) {
    return {
      needFetch: false,
      bodyChars,
      targets: [],
      reason: `搜索已带回 ${bodyChars} 字符正文，足够支撑解释；没有需要优先补读的健康原文`,
      healthTargets: 0,
    };
  }

  const targets = pending.slice(0, maxFetchPages);
  return {
    needFetch: true,
    bodyChars,
    targets,
    reason: `正文只有 ${bodyChars} 字符，不足 ${minTotalBodyChars}，尝试补抓 ${targets.length} 页`,
    healthTargets: 0,
  };
}
