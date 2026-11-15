import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createApp } from './server/app.js';

/**
 * 开发期把中转服务直接挂到 Vite 的 dev server 上。
 * 好处：只启动一个进程、只开一个端口（5173），
 *      页面与接口同源，浏览器端天然没有跨域问题，
 *      同时在服务端验证「浏览器直连上游会被 CORS 拦住」这个结论。
 */
function packtruthApiPlugin() {
  return {
    name: 'packtruth-api-relay',
    configureServer(server) {
      const app = createApp();
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) return app(req, res, next);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), packtruthApiPlugin()],
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
});
