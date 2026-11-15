/**
 * 统一的食品数据结构（FoodRecord）。
 *
 * 这是第二阶段最重要的产出：第三到第七阶段的所有功能（话术拆解、成分解剖、
 * 食用量换算、证据引用）都读这一份结构，不再各自定义。
 *
 * 设计原则：
 * - 未知就是 null，永远不用 0 或空字符串冒充"已知"。
 * - 每个字段都有「是否被用户改过」的痕迹，便于结果页标注数据来源。
 * - 分析结论只留位置（analysis），本阶段不填充业务逻辑。
 */

import {
  BASIS,
  NUTRIENT_LABELS,
  isKnownBasis,
  normalizeUnit,
  parseNutrientValue,
  toNumberOrNull,
} from './nutrition.js';
import { parseIngredientName, parseIngredientText } from './ingredientStructure.js';

export const RECORD_STATUS = {
  DRAFT: 'draft', // 刚建，还没识别
  RECOGNIZED: 'recognized', // 识别完成，待用户确认
  CONFIRMED: 'confirmed', // 用户已确认，可进入分析
};

/**
 * 字段存在状态 —— 第三阶段新增，用来区分四件完全不同的事：
 *
 *   LABELED + value=0    包装上明确标示「0」
 *   LABELED + value=null 包装上有这一行，但没读清楚（待补）
 *   LABELED + value=5    包装上标了 5
 *   NOT_LABELED          包装上根本没有这一项（不是 0，是没标）
 *   UNREADABLE           模型说看不清，用户还没处理
 *
 * 外加 record.status !== 'confirmed' 表示「用户尚未确认」。
 * 这四种状态绝不能混为一谈，否则「0」和「没识别」会被当成一回事。
 */
export const PRESENCE = {
  LABELED: 'labeled',
  NOT_LABELED: 'not_labeled',
  UNREADABLE: 'unreadable',
};

export const PRESENCE_LABELS = {
  labeled: '包装已标示',
  not_labeled: '包装未标示',
  unreadable: '待补录',
};

let seq = 0;
function nextId(prefix = 'fr') {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** 空记录：所有业务字段都是 null，而不是 0 或 '' */
export function createFoodRecord() {
  return {
    id: nextId(),
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: RECORD_STATUS.DRAFT,

    source: {
      kind: 'photo', // photo | demo
      image: null, // { name, mimeType, size, width, height, dataUrl? }
      capturedAt: null,
      provider: null, // mimo | deepseek-vision
      model: null,
      durationMs: null,
      usage: null,
      /** 模型输出被截断时，是否保留了部分字段；true 时确认页必须提示核对 */
      partial: false,
      /** 实际保留下来的字段（中文标签），用于告诉用户还缺什么 */
      partialFields: [],
      /** 截断后仍然缺失的核心字段（中文标签）；空数组表示核心字段都恢复了 */
      partialMissing: [],
    },

    basic: {
      productName: null,
      brand: null,
      category: null,
      /**
       * 食品形态：solid | liquid | null
       * 低脂肪、高蛋白、高钙、膳食纤维、低能量等声称在固体 / 液体上的界限值不同，
       * 必须让用户确认，不能由程序替这款食品「选一个」。
       */
      physicalForm: null,
      netContent: { value: null, unit: null, text: null, presence: PRESENCE.UNREADABLE },
    },

    ingredients: {
      rawText: null,
      /**
       * items: [{
       *   id, order, name, raw,
       *   children: [{ id, order, name, raw, children? }], // 括号里的具体成分
       *   note: string|null                                 // 结构待核对的原因
       * }]
       * children 只来自包装原文，不凭常识补充。
       */
      items: [],
      presence: PRESENCE.UNREADABLE, // 包装上有没有配料表
    },

    nutrition: {
      basis: null, // per_100g | per_100ml | per_serving | null
      basisText: null,
      servingSize: { value: null, unit: null }, // 每份克重，用于后续换算
      items: [], // 见下方 makeNutrientItem
    },

    claims: [], // [{ id, text, source: 'preset'|'manual', presetId }]

    /** 明确记录「哪些信息没有识别出来」，避免界面上下意识地补零 */
    unknownFields: [],

    /** 用户修订痕迹：字段路径 -> 修改时间 */
    review: {
      editedFields: {},
      confirmedAt: null,
      confirmedBy: 'user',
    },

    /** 分析结果预留位置，第三阶段之后的规则引擎写这里 */
    analysis: {
      claims: [], // 话术拆解结论
      ingredients: [], // 成分解剖结论
      evidence: [], // 引用证据卡片
    },
  };
}

/** 单条营养素 */
export function makeNutrientItem({
  key = 'other',
  name = '',
  value = null,
  unit = null,
  nrvPercent = null,
  parentKey = null,
  rawText = null,
  status = null,
  presence = null,
} = {}) {
  return {
    id: nextId('nut'),
    key,
    name: name || NUTRIENT_LABELS[key] || '',
    value: value === null ? null : Number(value),
    unit: unit ?? null,
    nrvPercent: nrvPercent === null ? null : Number(nrvPercent),
    parentKey,
    rawText,
    status: status || (value === null ? 'UNKNOWN' : 'OK'),
    // 包装上到底有没有这一行，和 value 是不是 null 是两件事
    presence: presence || (value === null ? PRESENCE.UNREADABLE : PRESENCE.LABELED),
  };
}

/** 营养素名称 -> 标准 key。模型写法五花八门，这里做一次兜底归一。 */
export function guessNutrientKey(name) {
  const s = String(name || '')
    .replace(/[\s　]/g, '')
    .replace(/^[—\-–－一]+/, ''); // 去掉子项的破折号，"—饱和脂肪" -> "饱和脂肪"
  if (!s) return 'other';
  if (/能量|热量|energy|kilojoule|千焦/i.test(s)) return 'energy';
  if (/饱和脂肪/.test(s)) return 'saturated_fat';
  if (/反式脂肪/.test(s)) return 'trans_fat';
  if (/脂肪/.test(s)) return 'fat';
  if (/蛋白质|蛋白/.test(s)) return 'protein';
  // 单种糖、糖醇与总糖不是同一个项目；括号中的单位不改变项目身份。
  if (/^(?:糖|总糖|糖含量|总糖含量)(?:[（(](?:g|克)[）)])?$/.test(s)) return 'sugar';
  if (/碳水化合物|碳水/.test(s)) return 'carbohydrate';
  if (/膳食纤维|纤维/.test(s)) return 'dietary_fiber';
  if (/钠/.test(s)) return 'sodium';
  return 'other';
}

/** 判断某个营养素是否是子项（界面缩进用） */
const CHILD_KEYS = new Set(['saturated_fat', 'trans_fat', 'sugar']);

function deriveParentKey(key, rawName) {
  const raw = String(rawName || '');
  const isChild = /^[—\-–－一]/.test(raw.replace(/[\s　]/g, ''));
  if (isChild && CHILD_KEYS.has(key)) {
    return key === 'sugar' ? 'carbohydrate' : 'fat';
  }
  return null;
}

/**
 * 把视觉模型的输出（可能很脏）转成 FoodRecord。
 * 这里的原则是「能转就转，转不了就留 null 并记进 unknownFields」，绝不猜。
 */
/**
 * 给配料与子配料分配稳定 id / 顺序。
 * 子配料也保留 order，确认页和结果页才能按原文顺序展示。
 */
function assignIngredientIds(nodes = [], depth = 0) {
  return nodes.map((n, i) => ({
    id: nextId(depth === 0 ? 'ing' : 'ingc'),
    order: i + 1,
    name: n.name || '',
    raw: n.raw || n.name || '',
    children: assignIngredientIds(n.children || [], depth + 1),
    ...(n.note ? { note: n.note } : {}),
  }));
}

export function fromRecognition(raw, meta = {}) {
  const rec = createFoodRecord();

  rec.source = {
    ...rec.source,
    kind: meta.kind || 'photo',
    image: meta.image || null,
    capturedAt: new Date().toISOString(),
    provider: meta.provider || null,
    model: meta.model || null,
    durationMs: meta.durationMs ?? null,
    usage: meta.usage ?? null,
    partial: Boolean(meta.partial),
    partialFields: Array.isArray(meta.partialFields) ? meta.partialFields : [],
    partialMissing: Array.isArray(meta.partialMissing) ? meta.partialMissing : [],
  };

  const p = raw || {};

  // ---- 基本信息 ----
  rec.basic.productName = toTextOrNull(p.product_name);
  rec.basic.brand = toTextOrNull(p.brand);
  rec.basic.category = toTextOrNull(p.category);

  const net = toTextOrNull(p.net_content);
  rec.basic.netContent = net
    ? { ...parseNetContent(net), presence: PRESENCE.LABELED }
    : { value: null, unit: null, text: null, presence: PRESENCE.UNREADABLE };

  // ---- 配料 ----
  const rawIngredients = toTextOrNull(p.ingredients_text);
  rec.ingredients.rawText = rawIngredients;

  const list = Array.isArray(p.ingredients) ? p.ingredients : [];
  const modelItems = list
    .map((it) => {
      if (typeof it === 'string') return { name: toTextOrNull(it), raw: toTextOrNull(it) };
      const name = toTextOrNull(it?.name);
      const raw = toTextOrNull(it?.raw);
      if (!name && !raw) return null;
      return { name: name || raw, raw: raw || name };
    })
    .filter(Boolean);

  // 原文是配料完整性的最后一道保险：
  // - 结构化列表为空 → 直接解析原文；
  // - 结构化列表明显比原文少、且它的名称都能在原文里找到 → 以原文为准，
  //   避免模型漏掉中段的「竹笋、山椒」或整组括号子配料。
  const textParsed = rawIngredients ? parseIngredientText(rawIngredients) : null;
  let sourceItems = modelItems;
  if (!modelItems.length) {
    sourceItems = textParsed?.items || [];
  } else if (textParsed?.balanced && textParsed.items.length > modelItems.length) {
    const textNames = new Set(textParsed.items.map((it) => it.name));
    if (modelItems.every((it) => textNames.has(it.name))) {
      sourceItems = textParsed.items;
    }
  }

  rec.ingredients.items = assignIngredientIds(
    sourceItems.map((it) => {
      const raw = it.raw || it.name;
      const parsed = parseIngredientName(raw);
      // 成功拆出子项：父级用去掉括号的名称
      if (parsed.children.length) {
        return { name: parsed.name, raw, children: parsed.children, note: null };
      }
      // 结构异常：保留整段原文，不用残片猜
      if (parsed.note) {
        return { name: it.name || raw, raw, children: [], note: parsed.note };
      }
      // 普通配料：优先用模型给的名称，没有就用本地解析结果
      return { name: it.name || parsed.name, raw, children: [], note: null };
    }),
  );

  rec.ingredients.presence =
    rec.ingredients.items.length || rawIngredients ? PRESENCE.LABELED : PRESENCE.UNREADABLE;

  // ---- 营养 ----
  const nut = p.nutrition || {};
  const basisRaw = toTextOrNull(nut.basis);
  rec.nutrition.basis = isKnownBasis(basisRaw) ? basisRaw : null;
  rec.nutrition.basisText = toTextOrNull(nut.basis_text);

  // 没给 basis 时，从 basis_text 里兜底推断（"每100克" -> per_100g）
  if (!rec.nutrition.basis && rec.nutrition.basisText) {
    rec.nutrition.basis = inferBasisFromText(rec.nutrition.basisText);
  }

  // 形态先按标示基准给一个可修改的默认值，最终由用户在确认页确认
  rec.basic.physicalForm = inferPhysicalForm(rec.nutrition.basis);

  const items = Array.isArray(nut.items) ? nut.items : [];
  rec.nutrition.items = items
    .map((it) => {
      const name = toTextOrNull(it?.name);
      if (!name) return null;
      const key = guessNutrientKey(name);
      const parsed = parseNutrientValue(it?.value);
      const unitKind = key === 'energy' ? 'energy' : 'mass';
      const unit = normalizeUnit(it?.unit, unitKind) || normalizeUnit(parsed.unit, unitKind);
      return makeNutrientItem({
        key,
        name,
        value: parsed.value,
        unit,
        nrvPercent: toNumberOrNull(it?.nrv_percent),
        parentKey: deriveParentKey(key, name),
        rawText: it?.value === null || it?.value === undefined ? null : String(it.value),
        status: parsed.value === null ? 'UNKNOWN' : 'OK',
      });
    })
    .filter(Boolean);

  // ---- 宣传语 ----
  const claims = Array.isArray(p.claims) ? p.claims : [];
  rec.claims = claims
    .map((c) => toTextOrNull(typeof c === 'string' ? c : c?.text))
    .filter(Boolean)
    .map((text) => ({ id: nextId('claim'), text, source: 'recognized', presetId: null }));

  // ---- 未知字段清单 ----
  rec.unknownFields = collectUnknownFields(rec);

  rec.status = RECORD_STATUS.RECOGNIZED;
  return rec;
}

/** 把用户输入的宣传语（预设选项或手动）加进记录 */
export function addClaim(record, text, { source = 'manual', presetId = null } = {}) {
  const t = String(text || '').trim();
  if (!t) return record;
  if (record.claims.some((c) => c.text === t)) return record;
  return {
    ...record,
    claims: [...record.claims, { id: nextId('claim'), text: t, source, presetId }],
    updatedAt: new Date().toISOString(),
  };
}

export function removeClaim(record, claimId) {
  return {
    ...record,
    claims: record.claims.filter((c) => c.id !== claimId),
    updatedAt: new Date().toISOString(),
  };
}

/** 标记某个字段被用户改过 */
export function markEdited(record, path) {
  return {
    ...record,
    review: {
      ...record.review,
      editedFields: { ...record.review.editedFields, [path]: new Date().toISOString() },
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 确认前的校验。返回错误（阻断）与提醒（不阻断）。
 */
export function validateFoodRecord(record) {
  const errors = [];
  const warnings = [];

  if (!record) return { valid: false, errors: ['记录为空'], warnings };

  if (!record.basic?.productName) {
    warnings.push('食品名称为空，结果页会显示「未识别」');
  }

  if (!record.ingredients?.items?.length && !record.ingredients?.rawText) {
    warnings.push('没有配料信息，成分解剖区将无内容可展示');
  }

  if (!isKnownBasis(record.nutrition?.basis)) {
    errors.push('营养标示基准未确认（每 100 克 / 每 100 毫升 / 每份），不能进入分析');
  }

  if (!record.nutrition?.items?.length) {
    warnings.push('没有营养数据，话术拆解区无法给出数值依据');
  }

  for (const it of record.nutrition?.items || []) {
    if (it.value !== null && (typeof it.value !== 'number' || !Number.isFinite(it.value) || it.value < 0)) {
      errors.push(`「${it.name}」的数值不是合法数字`);
    }
    if (it.value !== null && !it.unit) {
      warnings.push(`「${it.name}」有数值但缺单位`);
    }
  }

  // 既没数值、也没标记成「包装未标示」的，就是还没处理
  const pending = (record.nutrition?.items || []).filter(
    (it) => it.presence !== PRESENCE.NOT_LABELED && it.value === null,
  );
  if (pending.length) {
    warnings.push(
      `还有 ${pending.length} 项营养数据没处理（没填数值，也没标「包装未标示」）：${pending
        .map((x) => x.name || x.key)
        .join('、')}`,
    );
  }

  if (record.basic?.netContent?.presence === PRESENCE.UNREADABLE && record.basic.netContent.value === null) {
    warnings.push('净含量还没填。如果包装上确实没印，可以标为「包装未标示」');
  }

  if (!record.claims?.length) {
    warnings.push('还没有选择或输入任何宣传语，话术拆解区将是空的');
  }

  if (!record.basic?.physicalForm && record.nutrition?.basis === 'per_serving') {
    warnings.push('食品形态（固体 / 液体）还没确认，低脂肪、高蛋白、高钙等声称的阈值无法判定');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function confirmRecord(record) {
  return {
    ...record,
    status: RECORD_STATUS.CONFIRMED,
    review: { ...record.review, confirmedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- 工具函数

function toTextOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
}

/** "250g" / "净含量 907 克" / "555毫升" -> { value, unit, text } */
export function parseNetContent(text) {
  const s = String(text || '').trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|克|ml|mL|毫升|l|L|升)/);
  if (!m) return { value: null, unit: null, text: s || null };
  const value = Number(m[1]);
  const u = m[2].toLowerCase();
  const unit = u === 'kg' || u === '克' || u === 'g' ? (u === 'kg' ? 'kg' : 'g') : u === 'l' || u === '升' ? 'L' : 'mL';
  return { value: Number.isFinite(value) ? value : null, unit, text: s };
}

/** 按标示基准给一个默认形态：每 100 mL 视为液体，每 100 g 视为固体 */
export function inferPhysicalForm(basis) {
  if (basis === 'per_100ml') return 'liquid';
  if (basis === 'per_100g') return 'solid';
  return null;
}

function inferBasisFromText(text) {
  const s = String(text);
  if (/100\s*(?:g|克|公克)/i.test(s)) return BASIS.per_100g.id;
  if (/100\s*(?:ml|毫升)/i.test(s)) return BASIS.per_100ml.id;
  if (/每份|per\s*serving|份\s*\(/i.test(s)) return BASIS.per_serving.id;
  return null;
}

function collectUnknownFields(rec) {
  const out = [];
  if (!rec.basic.productName) out.push('食品名称');
  if (!rec.basic.netContent.value) out.push('净含量');
  if (!rec.ingredients.items.length && !rec.ingredients.rawText) out.push('配料表');
  if (!rec.nutrition.items.length) out.push('营养成分表');
  if (!rec.nutrition.basis) out.push('营养标示基准');
  else if (!rec.nutrition.basisText) out.push('标示基准原文');
  return out;
}

/** 深拷贝，编辑时避免引用污染 */
export function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}
