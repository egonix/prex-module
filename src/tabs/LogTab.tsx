import { useEffect, useState } from "preact/hooks";
import { MODULE } from "../../shared/module.ts";
import { getApi, type CaptureLogEntry, type Saved } from "../../shared/api.ts";
import { copyToClipboard } from "../clipboard.ts";

const SHOWN = 200;

interface Row {
  key: string;
  badge: string;
  tone: string;
  label: string;
  body: unknown;
}

const text = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// One row shape for every transport. Fields are read defensively because the
// log's element type is deliberately loose: each hook adds its own fields.
function row(e: CaptureLogEntry): Row {
  const key = e.key ?? `${e.kind}-${e.ts}`;
  switch (e.kind) {
    case "http": {
      const status = Number(e.status) || 0;
      return {
        key,
        badge: `${text(e.method)} ${status || ""}`.trim(),
        tone: status >= 400 || e.error ? "err" : "http",
        label: text(e.url),
        body: { request: e.reqBody, response: e.resBody, error: e.error },
      };
    }
    case "ws":
      return {
        key,
        badge: e.dir === "in" ? "WS-IN" : e.dir === "out" ? "WS-OUT" : "WS",
        tone: e.dir === "in" ? "wsin" : e.dir === "out" ? "wsout" : "sys",
        label: text(e.type),
        body: e.payload,
      };
    case "sse":
      return { key, badge: "SSE", tone: "sse", label: `${text(e.type)} ${text(e.url)}`, body: e.payload };
    case "beacon":
      return { key, badge: "BEACON", tone: "beacon", label: text(e.url), body: e.reqBody };
    default:
      return { key, badge: text(e.kind).toUpperCase(), tone: "sys", label: "", body: e };
  }
}

export function LogTab() {
  const [entries, setEntries] = useState<CaptureLogEntry[]>([]);
  const [found, setFound] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  // Open rows are tracked by each entry's stable key, never its index. The log
  // is newest-first and every capture shifts it by one, so an index names a
  // different entry on every tick and an open row would jump to it.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showSaved, setShowSaved] = useState(false);
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    const tick = () => {
      const api = getApi();
      setFound(!!api);
      if (!api) return;
      setEntries(api.log.slice(0, SHOWN));
      setPaused(api.isPaused());
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, []);

  const refreshSaved = () => setSaved(getApi()?.list() ?? {});

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save(entry: CaptureLogEntry, r: Row) {
    const api = getApi();
    if (!api) return;
    const name = `${r.badge} ${r.label}`.trim().slice(0, 60) + ` @${new Date(entry.ts).toLocaleTimeString()}`;
    setStatus(api.save(name, entry) ? `Saved as "${name}".` : "Not saved: storage refused it (full, blocked, not JSON-encodable, or the key holds other data).");
    refreshSaved();
  }

  const needle = filter.trim().toLowerCase();
  const rows = entries.map((e) => ({ e, r: row(e) }));
  const shown = needle ? rows.filter(({ r }) => `${r.badge} ${r.label}`.toLowerCase().includes(needle)) : rows;

  return (
    <>
      <div class="prex-row">
        <button
          type="button"
          class="prex-btn"
          onClick={() => {
            const api = getApi();
            if (!api) return;
            if (api.isPaused()) api.resume();
            else api.pause();
            setPaused(api.isPaused());
          }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          class="prex-btn"
          onClick={() => {
            const api = getApi();
            if (!api) return;
            api.log.length = 0;
            setEntries([]);
          }}
        >
          Clear
        </button>
        <button type="button" class="prex-btn" onClick={() => copyToClipboard(JSON.stringify(shown.map(({ e }) => e), null, 2))}>
          Copy JSON
        </button>
        <button
          type="button"
          class={`prex-btn${showSaved ? " accent" : ""}`}
          onClick={() => {
            refreshSaved();
            setShowSaved((v) => !v);
          }}
        >
          Saved
        </button>
        <input
          class="prex-input prex-grow"
          value={filter}
          onInput={(e) => setFilter(e.currentTarget.value)}
          placeholder="Filter..."
          spellcheck={false}
        />
      </div>
      {status && <div class="prex-dim prex-status">{status}</div>}

      {!found && (
        <div class="prex-dim">
          window.{MODULE} not found. Load the capture module: a bookmarklet with --game {MODULE}.
        </div>
      )}

      {showSaved ? (
        <SavedList
          saved={saved}
          onRemove={(name) => {
            getApi()?.remove(name);
            refreshSaved();
          }}
        />
      ) : (
        <>
          {found && shown.length === 0 && <div class="prex-dim">{needle ? "No matches." : "Nothing captured yet."}</div>}
          {shown.map(({ e, r }) => (
            <div class="prex-entry" key={r.key}>
              <div class="prex-entry-head" onClick={() => toggle(r.key)}>
                <span class={`prex-badge ${r.tone}`}>{r.badge}</span>
                <span class="prex-entry-label">{r.label}</span>
                <span class="prex-time">{new Date(e.ts).toLocaleTimeString()}</span>
              </div>
              {open.has(r.key) && (
                <div class="prex-entry-body">
                  <pre class="prex-pre">{JSON.stringify(r.body, null, 2)}</pre>
                  <div class="prex-row prex-actions">
                    <button type="button" class="prex-btn" onClick={() => copyToClipboard(JSON.stringify(r.body, null, 2))}>
                      Copy
                    </button>
                    <button type="button" class="prex-btn" onClick={() => save(e, r)}>
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

function SavedList({ saved, onRemove }: { saved: Record<string, Saved>; onRemove: (name: string) => void }) {
  const names = Object.keys(saved).sort((a, b) => saved[b].savedAt - saved[a].savedAt);
  if (names.length === 0) {
    return <div class="prex-dim">Nothing saved. Open a log entry and press Save; it stays in this site's localStorage.</div>;
  }
  return (
    <>
      {names.map((name) => (
        <div class="prex-saved" key={name}>
          <span class="prex-saved-name">{name}</span>
          <span class="prex-time">{new Date(saved[name].savedAt).toLocaleString()}</span>
          <button type="button" class="prex-btn" onClick={() => copyToClipboard(JSON.stringify(saved[name].data, null, 2))}>
            Copy
          </button>
          <button type="button" class="prex-btn danger" onClick={() => onRemove(name)}>
            Delete
          </button>
        </div>
      ))}
    </>
  );
}
