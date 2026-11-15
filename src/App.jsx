import { useEffect, useState } from 'react';
import LabApp from './lab/LabApp.jsx';
import VisionCompare from './lab/VisionCompare.jsx';
import ProductApp from './app/ProductApp.jsx';

/**
 * 极简 hash 路由。故意不引入 react-router：
 * 只有三个入口，用 URL hash 已经够用，也方便以后单独打开某个页面。
 *
 *   #/                正式产品（上传 → 确认 → 结果）
 *   #/lab             第一阶段接口测试台
 *   #/lab/vision      真实包装双模型对比工具
 */
export default function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.name === 'lab') return <LabApp />;
  if (route.name === 'lab-vision') return <VisionCompare />;
  return <ProductApp />;
}

function readRoute() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (raw.startsWith('lab/vision')) return { name: 'lab-vision' };
  if (raw === 'lab' || raw === 'lab/') return { name: 'lab' };
  return { name: 'app' };
}
