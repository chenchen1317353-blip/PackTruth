import { createApp } from './app.js';
import { config, keyStatus } from './config.js';

/**
 * 独立启动中转服务（不经过 Vite）。
 * 用途：未来接正式后端 / 单独调试接口时使用。
 * 日常开发直接 npm run dev，Vite 会把 /api 挂到同一个端口。
 */
const app = createApp();

app.listen(config.port, () => {
  const ks = keyStatus();
  console.log('');
  console.log('  PackTruth Phase1 中转服务已启动');
  console.log(`  地址: http://localhost:${config.port}`);
  console.log(`  MiMo Key:     ${ks.mimo.configured ? ks.mimo.keyPreview : '未配置'}`);
  console.log(`  DeepSeek Key: ${ks.deepseek.configured ? ks.deepseek.keyPreview : '未配置'}`);
  console.log('');
});
