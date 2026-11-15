import { useEffect, useState } from 'react';
import { callApi } from '../lib/api.js';
import CorsPanel from '../components/CorsPanel.jsx';
import TestA from '../components/TestA.jsx';
import TestB from '../components/TestB.jsx';
import TestC from '../components/TestC.jsx';
import TestD from '../components/TestD.jsx';
import { KV, Pill } from '../components/ui.jsx';

/**
 * 第一阶段 API 测试台（原样保留，只把入口从「页面根」挪到 #/lab）。
 * 拆出来的原因：正式产品上线后，仍然需要能单独跑接口验证，
 * 而不是把调试面板混在产品界面里。
 */
export default function LabApp() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    callApi('/api/health')
      .then(setHealth)
      .catch((e) => setHealthError(e.message));
  }, []);

  const mimoReady = health?.keys?.mimo?.configured;
  const dsReady = health?.keys?.deepseek?.configured;

  return (
    <div className="wrap">
      <header className="hero">
        <div className="lab-tag">测试台 · 不属于正式产品</div>
        <h1>PackTruth · API 测试台</h1>
        <p>验证 MiMo 图片理解、DeepSeek JSON / Search / Fetch 四条链路能否真实跑通。</p>

        <div className="notice">
          <strong>安全提示：</strong>真实 API Key 只存在于项目根目录的 <span className="mono">.env</span>
          （已被 .gitignore 排除），浏览器和页面代码中不会出现任何密钥。若密钥曾出现在聊天窗口或截图中，请到控制台重新生成。
        </div>
      </header>

      <div className="statusbar">
        <div className="stat">
          <div className="k">本地中转服务</div>
          <div className="v">
            {health ? <Pill tone="green">已连接</Pill> : healthError ? <Pill tone="red">不可用</Pill> : '检测中…'}
          </div>
        </div>
        <div className="stat">
          <div className="k">小米 MiMo Key</div>
          <div className="v">
            {health ? (
              mimoReady ? (
                <>
                  <Pill tone="green">已配置</Pill> <span className="mono">{health.keys.mimo.keyPreview}</span>
                </>
              ) : (
                <Pill tone="red">未配置</Pill>
              )
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="stat">
          <div className="k">DeepSeek Key</div>
          <div className="v">
            {health ? (
              dsReady ? (
                <>
                  <Pill tone="green">已配置</Pill> <span className="mono">{health.keys.deepseek.keyPreview}</span>
                </>
              ) : (
                <Pill tone="red">未配置</Pill>
              )
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="stat">
          <div className="k">Node 运行时</div>
          <div className="v">{health ? health.node : '—'}</div>
        </div>
      </div>

      {healthError && (
        <div className="result err" style={{ marginTop: 16 }}>
          <div className="result-head">无法连接本地中转服务</div>
          <div className="result-body">{healthError}</div>
        </div>
      )}

      {health && (
        <details style={{ marginTop: 12 }}>
          <summary>查看环境详情</summary>
          <div className="pre" style={{ marginTop: 8 }}>
            <KV
              rows={[
                ['服务名', health.service],
                ['Node 版本', health.node],
                ['系统平台', health.platform],
                ['服务端时区', health.serverTimeZone],
                ['MiMo 端点', <span className="mono">{health.keys.mimo.baseUrl}</span>],
                ['MiMo 默认模型', <span className="mono">{health.keys.mimo.model}</span>],
                ['DeepSeek 端点', <span className="mono">{health.keys.deepseek.baseUrl}</span>],
                ['DeepSeek 模型', <span className="mono">{health.keys.deepseek.chatModel}</span>],
                ['密钥来源', health.envFile],
              ]}
            />
          </div>
        </details>
      )}

      <CorsPanel />

      <TestA defaultModel={health?.keys?.mimo?.model} />
      <TestB defaultModel={health?.keys?.deepseek?.chatModel} />
      <TestC onResults={setSearchResults} />
      <TestD searchResults={searchResults} />

      <footer className="footer">
        PackTruth · Lab · 第一阶段接口验证
        <br />
        测试顺序建议：先看跨域结论 → A 图片识别 → B JSON → C 搜索 → D 抓取（D 依赖 C 的真实链接）
      </footer>
    </div>
  );
}
