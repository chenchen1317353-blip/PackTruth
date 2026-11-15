import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { prepareImageFromFile } from '../server/lib/imagePrep.js';
import { extractPackage, VISION_PROVIDERS } from '../server/providers/vision.js';
import { redact } from '../server/lib/redact.js';

/**
 * 真实包装照片的双模型识别对比（命令行版）。
 * 网页版（#/lab/vision）走的是同一个 provider，结果应当一致。
 *
 * 用法：
 *   node scripts/vision-compare.mjs --limit 1      # 只跑第一张，验证链路
 *   node scripts/vision-compare.mjs                # 跑全部 5 张（10 次付费调用）
 *   node scripts/vision-compare.mjs --only 03      # 只跑文件名包含 03 的图
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMG_DIR = join(ROOT, 'public', 'test-images', 'real');
const OUT_DIR = join(ROOT, 'runtime-output');

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? args[onlyArg + 1] : null;

const manifest = JSON.parse(await readFile(join(ROOT, 'public', 'test-images', 'manifest.json'), 'utf8'));
let images = manifest.images;
if (ONLY) images = images.filter((i) => i.file.includes(ONLY));
images = images.slice(0, LIMIT);

const PROVIDERS = Object.keys(VISION_PROVIDERS);

const LINE = '─'.repeat(78);
const DLINE = '═'.repeat(78);

function fmtCost(c) {
  if (!c) return '—';
  return `${c.currency === 'CNY' ? '¥' : '$'}${c.amount.toFixed(6)}`;
}

async function callOne(provider, filePath) {
  const t0 = Date.now();
  try {
    const prepared = await prepareImageFromFile(filePath);
    const r = await extractPackage({
      provider,
      imageBase64: prepared.base64,
      mimeType: prepared.mimeType,
    });
    return { ok: true, ...r, wallMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      provider,
      providerLabel: VISION_PROVIDERS[provider].label,
      wallMs: Date.now() - t0,
      error: { code: e.code || 'ERROR', message: e.message, httpStatus: e.httpStatus ?? null, detail: redact(e.detail) },
    };
  }
}

console.log('');
console.log(DLINE);
console.log('PackTruth · 真实包装双模型识别对比');
console.log(`图片来源：public/test-images/real/ · 共 ${images.length} 张`);
console.log(`模型：${PROVIDERS.map((p) => `${VISION_PROVIDERS[p].label}(${VISION_PROVIDERS[p].getModel()})`).join('  vs  ')}`);
console.log(DLINE);

const records = [];
let totalCNY = 0;
let totalUSD = 0;
let successCalls = 0;
let failedCalls = 0;

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const filePath = join(IMG_DIR, img.file);

  console.log('');
  console.log(`【${i + 1}/${images.length}】${img.label}`);
  console.log(`  文件：${img.file}（${img.size}）`);
  console.log(`  难点：${img.challenge}`);

  const results = {};
  for (const p of PROVIDERS) {
    process.stdout.write(`  · ${VISION_PROVIDERS[p].label} 识别中…`);
    const r = await callOne(p, filePath);
    results[p] = r;
    if (r.ok) {
      successCalls += 1;
      const c = r.costEstimate;
      if (c) {
        if (c.currency === 'CNY') totalCNY += c.amount;
        else totalUSD += c.amount;
      }
    } else {
      failedCalls += 1;
    }
    process.stdout.write('\r');
    if (r.ok) {
      const c = r.costEstimate;
      console.log(
        `  ✓ ${VISION_PROVIDERS[p].label.padEnd(16)} HTTP ${r.httpStatus} · ${String(r.durationMs).padStart(6)}ms · ` +
          `tokens ${r.usage?.prompt_tokens ?? '—'}/${r.usage?.completion_tokens ?? '—'} · ${fmtCost(c)}`,
      );
      if (c) {
        console.log(`  ${''.padEnd(18)}计价依据：${c.basis}`);
      }
      if (!r.parsed) {
        console.log(
          `  ${''.padEnd(18)}⚠ HTTP 200 但 JSON 不可用：finish_reason=${r.finishReason} · ${r.jsonParse?.reason}`,
        );
      }
    } else {
      console.log(
        `  ✗ ${VISION_PROVIDERS[p].label.padEnd(16)} ${r.error.code} · HTTP ${r.error.httpStatus ?? '—'} · ${r.error.message}`,
      );
    }
  }

  // ---- 并排摘要 ----
  const mimo = results.mimo;
  const ds = results['deepseek-vision'];

  const pick = (r, fn) => {
    if (!r) return '（未调用）';
    if (!r.ok) return `（调用失败：${r.error?.code}）`;
    if (!r.parsed) {
      const truncated = r.finishReason === 'length' ? '输出被 max_tokens 截断' : 'JSON 解析失败';
      return `（${truncated}：${r.jsonParse?.reason ?? '?'}）`;
    }
    return fn(r.parsed);
  };
  const rows = [
    ['食品名称', pick(mimo, (p) => p.product_name ?? 'null'), pick(ds, (p) => p.product_name ?? 'null')],
    ['品牌', pick(mimo, (p) => p.brand ?? 'null'), pick(ds, (p) => p.brand ?? 'null')],
    ['净含量', pick(mimo, (p) => p.net_content ?? 'null'), pick(ds, (p) => p.net_content ?? 'null')],
    [
      '标示基准',
      pick(mimo, (p) => `${p.nutrition?.basis_text ?? 'null'} [${p.nutrition?.basis ?? 'null'}]`),
      pick(ds, (p) => `${p.nutrition?.basis_text ?? 'null'} [${p.nutrition?.basis ?? 'null'}]`),
    ],
    ['配料条数', pick(mimo, (p) => String(p.ingredients?.length ?? 'null')), pick(ds, (p) => String(p.ingredients?.length ?? 'null'))],
    [
      '营养项数',
      pick(mimo, (p) => String(p.nutrition?.items?.length ?? 'null')),
      pick(ds, (p) => String(p.nutrition?.items?.length ?? 'null')),
    ],
    [
      '标注看不清',
      pick(mimo, (p) => String(p.unreadable?.length ?? 0)),
      pick(ds, (p) => String(p.unreadable?.length ?? 0)),
    ],
  ];

  console.log('');
  console.log('  ┌ 关键字段对比');
  for (const [k, a, b] of rows) {
    console.log(`  │ ${k.padEnd(10, '　')} MiMo: ${String(a).slice(0, 42)}`);
    console.log(`  │ ${''.padEnd(10, '　')} DS  : ${String(b).slice(0, 42)}`);
  }
  console.log('  └');

  // 营养逐项
  const nutRounds = [];
  const seen = new Set();
  for (const [label, r] of [
    ['MiMo', mimo],
    ['DS', ds],
  ]) {
    for (const it of (r?.parsed?.nutrition?.items || [])) {
      const name = String(it.name || '').replace(/^[—\-–－一]+/, '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const a = (mimo?.parsed?.nutrition?.items || []).find(
        (x) => String(x.name || '').replace(/^[—\-–－一]+/, '').trim() === name,
      );
      const b = (ds?.parsed?.nutrition?.items || []).find(
        (x) => String(x.name || '').replace(/^[—\-–－一]+/, '').trim() === name,
      );
      nutRounds.push([
        name,
        a ? `${a.value ?? 'null'} ${a.unit ?? ''}`.trim() : '（未识别）',
        b ? `${b.value ?? 'null'} ${b.unit ?? ''}`.trim() : '（未识别）',
      ]);
    }
  }
  if (nutRounds.length) {
    console.log('  ┌ 营养成分逐项');
    for (const [n, a, b] of nutRounds) {
      console.log(`  │ ${n.padEnd(12, '　')} MiMo:${String(a).padEnd(12)} DS:${b}`);
    }
    console.log('  └');
  }

  // 原始 content 片段
  console.log('');
  console.log(`  MiMo 原始片段：${String(mimo?.content || '').replace(/\s+/g, ' ').slice(0, 220)}`);
  console.log(`  DS   原始片段：${String(ds?.content || '').replace(/\s+/g, ' ').slice(0, 220)}`);

  records.push({
    file: img.file,
    label: img.label,
    challenge: img.challenge,
    basisHint: img.basisHint,
    results: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [
        k,
        v.ok
          ? {
              ok: true,
              model: v.model,
              httpStatus: v.httpStatus,
              durationMs: v.durationMs,
              usage: v.usage,
              costEstimate: v.costEstimate,
              jsonParse: v.jsonParse,
              structure: v.structure,
              parsed: v.parsed,
              contentPreview: String(v.content).slice(0, 1500),
            }
          : { ok: false, error: v.error },
      ]),
    ),
  });
}

console.log('');
console.log(DLINE);
console.log('汇总');
console.log(DLINE);
console.log(`  成功调用 ${successCalls} 次 · 失败 ${failedCalls} 次`);
console.log(`  估算费用：¥${totalCNY.toFixed(6)} + $${totalUSD.toFixed(6)}`);

// 粗略耗时对比
const sumBy = (p) => {
  const arr = records.map((r) => r.results[p]).filter((x) => x?.ok);
  if (!arr.length) return null;
  const total = arr.reduce((s, x) => s + x.durationMs, 0);
  return { avg: Math.round(total / arr.length), n: arr.length };
};
for (const p of PROVIDERS) {
  const s = sumBy(p);
  if (s) console.log(`  ${VISION_PROVIDERS[p].label.padEnd(16)} 平均 ${s.avg} ms（${s.n} 张）`);
}
console.log('');
console.log('  注意：以上只是调用耗时和费用，识别准确率必须人工核对，脚本不做任何自动评分。');
console.log('');

await mkdir(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `vision-compare-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(
  outFile,
  JSON.stringify(
    redact({
      runAt: new Date().toISOString(),
      imageSource: 'public/test-images/real/',
      providers: PROVIDERS.map((p) => ({ id: p, label: VISION_PROVIDERS[p].label, model: VISION_PROVIDERS[p].getModel() })),
      summary: { successCalls, failedCalls, costCNY: totalCNY, costUSD: totalUSD },
      records,
    }),
    null,
    2,
  ),
  'utf8',
);
console.log(`结果已保存：${outFile}（已脱敏）`);
