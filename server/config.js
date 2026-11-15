// 显式指向项目根目录的 .env：vite 把配置打包到 node_modules/.vite-temp 里执行时，
// 相对路径的默认行为可能找不到它，导致「密钥明明配了却显示未配置」。
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../.env', import.meta.url) });

/**
 * 集中读取环境变量。真实密钥只存在于这里和 .env 文件，
 * 任何接口返回给前端的内容都必须先经过 keyStatus() 脱敏。
 */

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT || 8787),
  mimo: {
    apiKey: process.env.MIMO_API_KEY || '',
    baseUrl: trimSlash(process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1'),
    visionModel: process.env.MIMO_VISION_MODEL || 'mimo-v2.6-flash',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: trimSlash(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
    chatModel: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-flash',
  },
};

/** 只暴露“是否配置”和脱敏后的指纹，绝不返回密钥本身 */
export function maskKey(key) {
  if (!key) return null;
  if (key.length <= 10) return '***';
  return `${key.slice(0, 3)}***${key.slice(-4)}`;
}

export function keyStatus() {
  return {
    mimo: {
      configured: Boolean(config.mimo.apiKey),
      keyPreview: maskKey(config.mimo.apiKey),
      baseUrl: config.mimo.baseUrl,
      model: config.mimo.visionModel,
    },
    deepseek: {
      configured: Boolean(config.deepseek.apiKey),
      keyPreview: maskKey(config.deepseek.apiKey),
      baseUrl: config.deepseek.baseUrl,
      chatModel: config.deepseek.chatModel,
    },
  };
}
