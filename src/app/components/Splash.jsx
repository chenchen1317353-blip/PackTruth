import { useEffect, useRef, useState } from "react";

/**
 * 开屏动画。
 *
 * 参考 recent.design 的几何幽灵拼合动效（部件逐笔拼合 → 背景明暗切换 →
 * 友好收尾），把幽灵换成 PackTruth 的星标：先弹出底色方块，四笔线条依次
 * 绘制，中心圆点弹跳落位，随后背景由明转暗、显现品牌名，整屏向上滑出。
 *
 * 点击可跳过；系统开启「减少动态效果」时直接不播放。
 */
const PLAY_MS = 2500;
const EXIT_MS = 620;

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current = [
      setTimeout(() => setLeaving(true), PLAY_MS),
      setTimeout(onDone, PLAY_MS + EXIT_MS),
    ];
    return () => timersRef.current.forEach(clearTimeout);
    // onDone 由父组件以稳定引用传入（setState），无需列入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    if (leaving) return;
    timersRef.current.forEach(clearTimeout);
    setLeaving(true);
    setTimeout(onDone, EXIT_MS);
  }

  return (
    <div
      className={`splash ${leaving ? "splash-leave" : ""}`}
      role="presentation"
      aria-hidden="true"
      onClick={skip}
    >
      <div className="splash-inner">
        <div className="splash-mark">
          <svg viewBox="0 0 32 32" width="118" height="118">
            <rect className="splash-tile" width="32" height="32" rx="10" />
            <g className="splash-strokes">
              <path d="M16 5v22" pathLength="1" />
              <path d="M5 16h22" pathLength="1" />
              <path d="M8 8l16 16" pathLength="1" />
              <path d="M8 24 24 8" pathLength="1" />
            </g>
            <circle className="splash-dot" cx="16" cy="16" r="4" />
          </svg>
        </div>
        <div className="splash-word">
          PackTruth<span>®</span>
        </div>
      </div>
    </div>
  );
}
