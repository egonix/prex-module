import { useEffect, useRef, useState } from "preact/hooks";
import { MODULE } from "../shared/module.ts";
import type { PrexyAgent } from "../shared/prexy.ts";
import { DiscoverTab } from "./tabs/DiscoverTab.tsx";
import { LogTab } from "./tabs/LogTab.tsx";

// A new tab is an entry here and a panel below.
const TABS = [
  { id: "log", label: "Log" },
  { id: "discover", label: "Discover" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Window({ agent }: { agent: PrexyAgent }) {
  const [visible, setVisible] = useState(true);
  const [tab, setTab] = useState<TabId>("log");
  const [connected, setConnected] = useState(agent.connected);
  const [pos, setPos] = useState({ top: 70, left: 70 });
  const drag = useRef<{ x: number; y: number; top: number; left: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setConnected(agent.connected), 1000);
    return () => clearInterval(id);
  }, [agent]);

  function onHeaderMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".prex-close")) return;
    drag.current = { x: e.clientX, y: e.clientY, top: pos.top, left: pos.left };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    const d = drag.current;
    if (!d) return;
    setPos({ left: Math.max(0, d.left + e.clientX - d.x), top: Math.max(0, d.top + e.clientY - d.y) });
  }

  function onMouseUp() {
    drag.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  return (
    <>
      <button type="button" class="prex-toggle" onClick={() => setVisible((v) => !v)}>
        {MODULE}
      </button>
      {/* Always mounted; closing only hides it. Unmounting on close would
          throw away every tab's state and reset the window's native CSS
          resize each time it reopened. The tab panels below follow the same
          rule for the same reason. */}
      <div class="prex-window" style={{ top: `${pos.top}px`, left: `${pos.left}px`, display: visible ? "flex" : "none" }}>
        <div class="prex-header" onMouseDown={onHeaderMouseDown}>
          <span class="prex-title">{MODULE}</span>
          <span class={`prex-dot ${connected ? "on" : "off"}`} title={connected ? "connected to prex" : "not connected to prex"} />
          <button type="button" class="prex-close" onClick={() => setVisible(false)}>
            ×
          </button>
        </div>
        <div class="prex-tabs">
          {TABS.map((t) => (
            <button type="button" key={t.id} class={`prex-tab-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div class="prex-body">
          <div style={{ display: tab === "log" ? "block" : "none" }}>
            <LogTab />
          </div>
          <div style={{ display: tab === "discover" ? "block" : "none" }}>
            <DiscoverTab />
          </div>
        </div>
      </div>
    </>
  );
}
