import { useEffect, useState } from "react";
import { confirmRecord } from "../domain/foodRecord.js";
import UploadPage from "./pages/UploadPage.jsx";
import ConfirmPage from "./pages/ConfirmPage.jsx";
import ResultPage from "./pages/ResultPage.jsx";
import BrandIcon from "./components/BrandIcon.jsx";
import Splash from "./components/Splash.jsx";
import AISettings from "./components/AISettings.jsx";
import "./app.css";
import "./design.css";

/**
 * 正式产品外壳：上传 → 确认 → 结果。
 *
 * 为什么用 state 而不是 URL 路由：三个阶段共用同一份 FoodRecord，
 * 放在 URL 里反而要反复序列化；刷新重来在当前阶段是可接受的。
 * 顶部保留 #/lab 入口，方便随时回到接口测试台。
 */

const STEPS = [
  { id: "upload", label: "上传" },
  { id: "confirm", label: "确认" },
  { id: "result", label: "分析" },
];

const scrollBehavior = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

export default function ProductApp() {
  const [step, setStep] = useState("upload");
  const [record, setRecord] = useState(null);
  const [section, setSection] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [splash, setSplash] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (step === "upload" && section) {
      document
        .getElementById(section)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      setSection(null);
    }
  }, [step, section]);

  function navigateTo(id) {
    setStep("upload");
    setSection(id);
  }

  function handleRecognized(next) {
    setRecord(next);
    setStep("confirm");
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function handleConfirm() {
    setRecord((r) => confirmRecord(r));
    setStep("result");
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function handleRestart() {
    setRecord(null);
    setUploadKey((key) => key + 1);
    setStep("upload");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className={`app-shell step-${step}`}>
      {splash && <Splash onDone={() => setSplash(false)} />}
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header className="app-header">
        <button
          className="app-brand"
          onClick={handleRestart}
          aria-label="PackTruth 首页"
        >
          <span className="brand-mark">
            <BrandIcon size={23} />
          </span>
          <span className="brand-name">
            PackTruth<span className="brand-period">®</span>
          </span>
        </button>
        {step === "upload" ? (
          <nav className="main-nav" aria-label="主导航">
            <button
              className="nav-active"
              onClick={() => navigateTo("how-it-works")}
            >
              使用指南
            </button>
            <button onClick={() => navigateTo("workspace")}>识别工作台</button>
            <button onClick={() => navigateTo("samples")}>
              体验样品 <span>↗</span>
            </button>
          </nav>
        ) : (
          <StepBar current={step} />
        )}
        <div className="header-signature">
          <span className="live-dot" /> 为每一口，多一点了解
        </div>
      </header>

      <main className="app-main" id="main-content">
        <AISettings />
        {step === "upload" && (
          <UploadPage key={uploadKey} onRecognized={handleRecognized} />
        )}

        {step === "confirm" && record && (
          <ConfirmPage
            record={record}
            onChange={setRecord}
            onBack={() => setStep("upload")}
            onConfirm={handleConfirm}
          />
        )}

        {step === "result" && record && (
          <ResultPage
            record={record}
            onBack={() => setStep("confirm")}
            onRestart={handleRestart}
          />
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-brand">
          <BrandIcon size={21} />
          <strong>PackTruth</strong>
          <span>看见食物的另一面。</span>
        </div>
        <div className="footer-meta">
          <span>识别与分析仅供参考，不替代医学诊断。</span>
          <a className="app-lab-link" href="#/lab">
            开发者测试台 ↗
          </a>
          <span>© {new Date().getFullYear()} PACKTRUTH</span>
        </div>
      </footer>
    </div>
  );
}

function StepBar({ current }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="stepbar" aria-label="分析进度">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === idx ? "step" : undefined}
          className={i === idx ? "active" : i < idx ? "done" : ""}
        >
          <span className="step-dot">{i < idx ? "✓" : `0${i + 1}`}</span>
          <span className="step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
