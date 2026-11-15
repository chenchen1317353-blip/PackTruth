import { useRef, useState, useSyncExternalStore } from 'react';
import { hasUserKey, setUserKey, subscribeCredentials, credentialRevision } from '../../lib/credentials.js';
import './ai-settings.css';

export default function AISettings() {
  const dialog = useRef(null);
  const input = useRef(null);
  const trigger = useRef(null);
  const [visible, setVisible] = useState(false);
  useSyncExternalStore(subscribeCredentials, credentialRevision);
  const close = () => { if (input.current) input.current.value = ''; setVisible(false); trigger.current?.focus(); };
  return <div className="ai-settings">
    <button className="btn-ghost" ref={trigger} onClick={() => dialog.current.showModal()}>AI 功能设置</button>
    <dialog ref={dialog} className="ai-settings-dialog" aria-labelledby="ai-settings-title" onClose={close}>
      <h2 id="ai-settings-title">AI 功能设置</h2>
      <p role="status">{hasUserKey() ? '已填写 Key（尚未验证）' : '未填写 Key · 演示模式可用'}</p>
      <label className="field"><span>DeepSeek API Key</span>
        <input ref={input} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={256}
          placeholder={hasUserKey() ? '重新输入可替换当前 Key' : '输入自己的 API Key'} onChange={e => setUserKey(e.target.value)} />
      </label>
      <div className="ai-settings-actions">
        <button className="btn-ghost" onClick={() => setVisible(v => !v)} aria-pressed={visible}>{visible ? '隐藏 Key' : '显示 Key'}</button>
        <button className="btn-ghost" onClick={() => { setUserKey(''); input.current.value = ''; setVisible(false); }}>清除 Key</button>
      </div>
      <p>仅保存在当前页面内存，刷新后需重新填写。不会自动调用 API 验证密钥；真实分析可能由你的 DeepSeek 账户计费。</p>
      <p>Key 会经 PackTruth 服务端用于对应请求，应用不主动持久化或记录。请只在可信网站使用独立密钥，并根据平台能力控制费用、撤销密钥。</p>
      <p>
        点开一个成分会自动联网做深度研究：最多 7 轮检索（身份 → 正式评估 → 组成物质/高摄入 → 特殊人群/较新评估，
        证据够了会提前停）、最多 4 次原文读取、最多 3 次研究规划及 3 次身份/整理/核验调用。研究规划会看已取得的资料决定下一步，
        每次费用硬上限 0.80 元，按高峰价预留预算，达到上限会停止。费用全部由你的 DeepSeek 账户承担，按实际调用与官方价目计费；
        PackTruth 不代收、不加价，也不会在预算之外自动增加调用。
      </p>
      <p>包装图片经服务端发送至 DeepSeek Vision；成分分析发送必要的成分与食品语境。请避免照片包含无关个人信息。运营者可以接触传输中的图片与密钥。</p>
      <p>清除或替换 Key 会尽可能取消当前请求，但不能保证立即停止上游处理或计费。</p>
      <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">前往 DeepSeek 官方平台获取 Key ↗</a>
      <div className="ai-settings-actions"><button className="btn-primary" onClick={() => dialog.current.close()}>完成设置</button></div>
    </dialog>
  </div>;
}
