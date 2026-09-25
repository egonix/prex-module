// Injected into the HUD's Shadow DOM, not document.head, so it can neither leak into the page nor be overridden by it.
export const STYLES = `
:host, * { box-sizing: border-box; }

.prex-toggle {
  position: fixed; bottom: 16px; right: 16px; z-index: 2147483000;
  background: rgba(139, 92, 246, 0.85); color: #fff; border: none; border-radius: 999px;
  padding: 8px 14px; font: 600 12px ui-monospace, Consolas, monospace; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.prex-toggle:hover { background: rgba(139, 92, 246, 1); }

.prex-window {
  position: fixed; width: 760px; height: 620px;
  max-width: 94vw; max-height: 88vh; min-width: 420px; min-height: 300px;
  z-index: 2147483000; resize: both; overflow: hidden; display: flex; flex-direction: column;
  background: rgba(10, 10, 10, 0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(139, 92, 246, 0.35); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  color: #e5e5e5; font: 12px ui-monospace, Consolas, monospace;
}

.prex-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  background: rgba(139, 92, 246, 0.1); border-bottom: 1px solid rgba(139, 92, 246, 0.3);
  flex: 0 0 auto; user-select: none; cursor: move;
}
.prex-title { font-weight: 700; color: #c9b8ff; letter-spacing: 0.04em; }
.prex-dot { width: 7px; height: 7px; border-radius: 50%; }
.prex-dot.on { background: #4ade80; }
.prex-dot.off { background: #f87171; }
.prex-close { cursor: pointer; color: #a1a1aa; margin-left: auto; padding: 0 6px; font-size: 14px; background: none; border: none; }
.prex-close:hover { color: #fff; }

.prex-tabs { display: flex; gap: 4px; padding: 6px 8px 0; flex: 0 0 auto; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.prex-tab-btn {
  background: transparent; border: 1px solid transparent; border-bottom: none;
  color: #a1a1aa; padding: 5px 12px; font-size: 12px; cursor: pointer; border-radius: 6px 6px 0 0;
  font-family: inherit;
}
.prex-tab-btn:hover { color: #e5e5e5; }
.prex-tab-btn.active { color: #fff; background: rgba(139, 92, 246, 0.18); border-color: rgba(139, 92, 246, 0.35); }

.prex-body { flex: 1 1 auto; overflow: auto; padding: 8px 10px; }
.prex-body, .prex-pre { scrollbar-width: thin; scrollbar-color: rgba(139, 92, 246, 0.5) rgba(255, 255, 255, 0.05); }

.prex-dim { color: #71717a; }
.prex-status { margin-bottom: 6px; }
.prex-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.prex-actions { margin: 6px 0 0; }
.prex-grow { flex: 1; min-width: 120px; }
.prex-mono { font-family: ui-monospace, Consolas, monospace; }

.prex-btn {
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); color: #e5e5e5;
  padding: 4px 9px; border-radius: 5px; cursor: pointer; font-size: 12px; font-family: inherit;
}
.prex-btn:hover { background: rgba(255, 255, 255, 0.12); }
.prex-btn.accent { background: rgba(139, 92, 246, 0.3); border-color: rgba(139, 92, 246, 0.6); }
.prex-btn.accent:hover { background: rgba(139, 92, 246, 0.45); }
.prex-btn.danger { border-color: rgba(240, 80, 80, 0.5); color: #ffb3b3; }
.prex-btn:disabled { opacity: 0.5; cursor: default; }

.prex-input {
  background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.16); color: #e5e5e5;
  padding: 4px 7px; border-radius: 5px; font-size: 12px; font-family: inherit;
}

.prex-pre {
  background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;
  padding: 8px; font-size: 11.5px; white-space: pre-wrap; overflow-wrap: anywhere;
  max-height: 320px; overflow: auto; margin: 4px 0 0;
}

.prex-entry { border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 6px; margin-bottom: 5px; overflow: hidden; }
.prex-entry-head { display: flex; align-items: center; gap: 7px; padding: 5px 8px; cursor: pointer; background: rgba(255, 255, 255, 0.03); }
.prex-entry-head:hover { background: rgba(255, 255, 255, 0.06); }
.prex-entry-body { padding: 0 8px 8px; }
.prex-entry-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prex-time { color: #52525b; font-size: 10.5px; white-space: nowrap; }

.prex-badge { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; letter-spacing: 0.03em; white-space: nowrap; }
.prex-badge.http { background: rgba(56, 189, 248, 0.2); color: #7dd3fc; }
.prex-badge.err { background: rgba(248, 113, 113, 0.22); color: #fca5a5; }
.prex-badge.wsin { background: rgba(139, 92, 246, 0.28); color: #c9b8ff; }
.prex-badge.wsout { background: rgba(160, 120, 255, 0.16); color: #b3a3e0; }
.prex-badge.sse { background: rgba(250, 204, 21, 0.18); color: #fde68a; }
.prex-badge.beacon { background: rgba(163, 163, 163, 0.18); color: #d4d4d4; }
.prex-badge.sys { background: rgba(255, 255, 255, 0.08); color: #a1a1aa; }

.prex-saved { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 6px; margin-bottom: 5px; }
.prex-saved-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
