/**
 * 人工标记的存储与统计。
 * 关键原则：准确率只来自人工作出的标记，页面不会自动算分，也不让模型自评。
 */

export const MARK_OPTIONS = [
  { id: 'unchecked', label: '未检查', tone: 'gray' },
  { id: 'correct', label: '正确', tone: 'green' },
  { id: 'typo', label: '错字/漏字', tone: 'red' },
  { id: 'missing', label: '漏项', tone: 'red' },
  { id: 'number', label: '数字错', tone: 'red' },
  { id: 'unit', label: '单位错', tone: 'red' },
  { id: 'fabricated', label: '凭空补造', tone: 'red' },
  { id: 'format', label: '格式不规范', tone: 'amber' },
];

const STORAGE_KEY = 'packtruth:compare-marks:v1';

export function loadMarks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMarks(marks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    /* 存储满或隐私模式，忽略即可 */
  }
}

/** 路径：marks[imageFile][fieldKey][provider] = markId */
export function getMark(marks, imageFile, fieldKey, provider) {
  return marks?.[imageFile]?.[fieldKey]?.[provider] || 'unchecked';
}

export function setMark(marks, imageFile, fieldKey, provider, markId) {
  const next = { ...marks };
  next[imageFile] = { ...(next[imageFile] || {}) };
  next[imageFile][fieldKey] = { ...(next[imageFile][fieldKey] || {}) };
  next[imageFile][fieldKey][provider] = markId;
  return next;
}

/** 人工标记统计（只统计已检查项） */
export function summarize(marks, imageFile, provider, fieldKeys) {
  const counts = { checked: 0, correct: 0, problems: 0, byType: {} };
  for (const k of fieldKeys) {
    const m = getMark(marks, imageFile, k, provider);
    if (m === 'unchecked') continue;
    counts.checked += 1;
    if (m === 'correct') counts.correct += 1;
    else {
      counts.problems += 1;
      counts.byType[m] = (counts.byType[m] || 0) + 1;
    }
  }
  return counts;
}

export function markLabel(id) {
  return MARK_OPTIONS.find((m) => m.id === id)?.label || id;
}

export function markTone(id) {
  return MARK_OPTIONS.find((m) => m.id === id)?.tone || 'gray';
}

/** 导出全部标记为 JSON 文件 */
export function exportMarks(marks) {
  const blob = new Blob([JSON.stringify(marks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `packtruth-vision-marks-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
