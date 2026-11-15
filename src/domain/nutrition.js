/**
 * 营养数值与标示基准的纯逻辑层。
 * 这一层不依赖 React、不依赖网络，可以在浏览器和 Node 里跑同一套校验。
 *
 * 三条铁律：
 * 1. 「未识别」必须是 null，绝不能用 0 兜底 —— 0 g 糖和「没看清」是两件事。
 * 2. 每 100g / 每 100mL / 每份 是三种不同基准，不能直接比较或混排。
 * 3. 非数字文本（"—"、"trace"、"未检出"）不能当数字用。
 */

/** 标示基准枚举。id 用于程序，label 用于界面。 */
export const BASIS = {
  per_100g: { id: 'per_100g', label: '每 100 克', short: '/100g', kind: 'mass' },
  per_100ml: { id: 'per_100ml', label: '每 100 毫升', short: '/100mL', kind: 'volume' },
  per_serving: { id: 'per_serving', label: '每份', short: '/份', kind: 'serving' },
};

export const BASIS_LIST = Object.values(BASIS);

export function basisLabel(id) {
  return BASIS[id]?.label ?? '基准未知';
}

export function isKnownBasis(id) {
  return Boolean(BASIS[id]);
}

/** 能量与质量单位白名单。不在白名单里的单位一律视为不可解析。 */
export const UNITS = {
  energy: ['kJ', 'kcal'],
  mass: ['g', 'mg', 'μg', 'ug'],
  percent: ['%'],
};

const MASS_TO_MG = { g: 1000, mg: 1, μg: 0.001, ug: 0.001 };

/** 把各种写法归一到白名单单位；无法识别返回 null */
export function normalizeUnit(unit, kind) {
  if (!unit) return null;
  const raw = String(unit).trim();
  const lower = raw.toLowerCase();

  if (kind === 'energy') {
    if (lower === 'kj' || raw === '千焦' || raw === '千焦耳') return 'kJ';
    if (lower === 'kcal' || raw === '千卡' || raw === '大卡') return 'kcal';
    return null;
  }
  if (kind === 'mass') {
    if (lower === 'g' || raw === '克') return 'g';
    if (lower === 'mg' || raw === '毫克') return 'mg';
    if (lower === 'μg' || lower === 'ug' || lower === 'mcg' || raw === '微克') return 'μg';
    return null;
  }
  if (kind === 'percent') {
    return raw === '%' ? '%' : null;
  }
  return null;
}

/** 数值 + 单位的原始文本解析。返回结构化结果，不猜。 */
export function parseNutrientValue(input) {
  if (input === null || input === undefined) {
    return { value: null, unit: null, text: '', status: 'EMPTY', note: '未填写' };
  }

  const raw = String(input).trim();
  if (raw === '') return { value: null, unit: null, text: raw, status: 'EMPTY', note: '未填写' };

  // 明确表示"没有数据"的写法
  if (/^[—\-–－/]+$/.test(raw) || /^(?:n\/?a|nd|trace|tr)$/i.test(raw)) {
    return { value: null, unit: null, text: raw, status: 'UNKNOWN', note: '标注为无数据' };
  }
  if (/^(未检出|未测|无|不详|未知)$/.test(raw)) {
    return { value: null, unit: null, text: raw, status: 'UNKNOWN', note: '标注为未检出/未知' };
  }

  // 先剥离括号里的单位："85千焦(kJ)" -> 主体 "85千焦" + 括号单位 "kJ"
  // 真实包装上模型经常返回这种写法，不处理会直接判成"非数字"把数值丢掉
  const parenMatch = raw.match(/[（(]\s*([^）)]+?)\s*[）)]/);
  const parenUnit = parenMatch ? parenMatch[1].trim() : null;
  const core = raw.replace(/[（(][^）)]*[）)]/g, '').trim();

  // 抓「数字（可带小数/范围符号） + 可选单位」
  const m = core.match(/^([<>≤≥＜＞~～约\s]*)\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zμ%千焦卡克毫克微升升]*)\s*$/);
  if (!m) {
    return { value: null, unit: null, text: raw, status: 'NOT_NUMERIC', note: `"${raw}" 不是可识别数值` };
  }

  const num = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(num)) {
    return { value: null, unit: null, text: raw, status: 'NOT_NUMERIC', note: `"${raw}" 数值无法解析` };
  }

  const comparator = /[<>≤≥＜＞]/.test(m[1]) ? m[1].trim() : null;
  return {
    value: num,
    unit: m[3] ? m[3].trim() : parenUnit || null,
    text: raw,
    status: comparator ? 'APPROXIMATE' : 'OK',
    comparator,
    note: comparator ? `标注为"${comparator}${num}"，是一个界限值而非精确值` : null,
  };
}

/** 只接受 number 或数字字符串；其余一律 null，绝不返回 0 */
export function toNumberOrNull(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input === 'string') {
    const r = parseNutrientValue(input);
    return r.value;
  }
  return null;
}

/** 同基准才能比较。返回是否可比较 + 原因。 */
export function canCompare(a, b) {
  if (!isKnownBasis(a) || !isKnownBasis(b)) {
    return { ok: false, reason: '有一方标示基准未知，无法比较' };
  }
  if (a !== b) {
    return {
      ok: false,
      reason: `基准不同（${basisLabel(a)} vs ${basisLabel(b)}），不能直接比较`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * 按倍数缩放营养数值（供「单品食用量」滑块使用）。
 * 只在同基准内做算术，不做跨基准换算。
 */
export function scaleNutrients(items, factor) {
  if (!Number.isFinite(factor) || factor <= 0) return items;
  return items.map((it) => ({
    ...it,
    value: it.value === null ? null : roundTo(it.value * factor, 3),
    scaled: true,
  }));
}

/** 把「每份」的数值换算成「每 100g」，仅在已知每份克重时可用 */
export function perServingToPer100g(value, servingSizeGram) {
  if (value === null || !Number.isFinite(servingSizeGram) || servingSizeGram <= 0) return null;
  return roundTo((value / servingSizeGram) * 100, 3);
}

/** 质量单位换算到 mg，用于同基准下不同单位的对齐 */
export function massToMg(value, unit) {
  if (value === null) return null;
  const f = MASS_TO_MG[normalizeUnit(unit, 'mass')];
  return f === undefined ? null : value * f;
}

export function roundTo(n, digits = 2) {
  if (!Number.isFinite(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** 营养素参考项目清单，用于界面排序与「是否漏项」检查 */
export const NUTRIENT_ORDER = [
  'energy',
  'protein',
  'fat',
  'saturated_fat',
  'trans_fat',
  'carbohydrate',
  'sugar',
  'dietary_fiber',
  'sodium',
  'other',
];

export const NUTRIENT_LABELS = {
  energy: '能量',
  protein: '蛋白质',
  fat: '脂肪',
  saturated_fat: '饱和脂肪',
  trans_fat: '反式脂肪',
  carbohydrate: '碳水化合物',
  sugar: '糖',
  dietary_fiber: '膳食纤维',
  sodium: '钠',
  other: '其他',
};
