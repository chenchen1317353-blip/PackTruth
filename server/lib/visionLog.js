/**
 * Vision 诊断日志落盘（V2.3 验收修复）。
 *
 * 为什么现在才做：V2.3 已经把诊断字段设计好，但只 console.log 到进程 stdout。
 * 用户报来的编号 007942 在当前机器上查不到，因为开发服务器的终端输出
 * 没有任何地方保存 —— 重启一次就没了。没有日志，编号就只是一个摆设。
 *
 * 落盘内容与 console 完全相同：只有编号、阶段、状态码、长度、解析分支。
 * 绝不写入 API Key、Authorization、图片 / base64、模型原文、完整食品记录。
 *
 * 单文件上限 2 MB，超过后轮转成 .1（只保留一份历史），
 * 避免长期运行时无限增长。
 */

import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;

export const VISION_LOG_DIR = 'runtime-output';
export const VISION_LOG_FILE = 'vision-diagnostics.jsonl';

/**
 * 追加一条诊断记录。
 * 任何失败都不影响识别本身 —— 日志是辅助，不是主流程。
 *
 * @param {object} record 已脱敏的诊断对象
 * @param {{ dir?: string, now?: Date }} [opts]
 * @returns {{ written: boolean, path: string|null, reason?: string }}
 */
export function appendVisionDiagnostic(record, { dir = VISION_LOG_DIR, now = new Date() } = {}) {
  const path = join(dir, VISION_LOG_FILE);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (existsSync(path) && statSync(path).size > MAX_BYTES) {
      renameSync(path, `${path}.1`);
    }
    const line = JSON.stringify({ ts: now.toISOString(), ...record });
    appendFileSync(path, `${line}\n`, 'utf8');
    return { written: true, path };
  } catch (e) {
    return { written: false, path: null, reason: e?.message || String(e) };
  }
}
