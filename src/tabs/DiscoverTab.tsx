import { useState } from "preact/hooks";
import { MODULE } from "../../shared/module.ts";
import { getApi, type ScriptMatch } from "../../shared/api.ts";
import { copyToClipboard } from "../clipboard.ts";

// Starting points for a target you know nothing about yet. The first capture
// group of a pattern becomes each result's name.
const PRESETS = [
  { label: "Action types", pattern: String.raw`type\s*:\s*["']([A-Za-z_][\w./:-]*)["']` },
  { label: "Event names", pattern: String.raw`\.on\(\s*["']([\w./:-]+)["']` },
  { label: "API paths", pattern: String.raw`["'](\/api\/[\w./:{}-]+)["']` },
];

// Greps the page's own script files, fetched live, so the answer is whatever
// is deployed right now and never a list that went stale. On demand only: it
// downloads every same-origin script on the page.
export function DiscoverTab() {
  const [pattern, setPattern] = useState(PRESETS[0].pattern);
  const [results, setResults] = useState<ScriptMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  async function run() {
    const api = getApi();
    if (!api) {
      setStatus(`window.${MODULE} not found. Load the capture module first.`);
      return;
    }
    try {
      new RegExp(pattern);
    } catch (err) {
      setStatus(`Not a valid pattern: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setBusy(true);
    setStatus("Fetching and scanning the page's scripts...");
    try {
      const found = await api.discover(pattern);
      setResults(found);
      setOpen(new Set());
      setStatus(`${found.length} found.`);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const needle = filter.trim().toLowerCase();
  const shown = results ? (needle ? results.filter((r) => r.key.toLowerCase().includes(needle)) : results) : [];

  return (
    <>
      <div class="prex-row">
        {PRESETS.map((p) => (
          <button type="button" key={p.label} class="prex-btn" onClick={() => setPattern(p.pattern)}>
            {p.label}
          </button>
        ))}
      </div>
      <div class="prex-row">
        <input
          class="prex-input prex-grow prex-mono"
          value={pattern}
          onInput={(e) => setPattern(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && run()}
          placeholder="Regular expression with one capture group"
          spellcheck={false}
        />
        <button type="button" class="prex-btn accent" onClick={run} disabled={busy}>
          {busy ? "Scanning..." : "Discover"}
        </button>
      </div>
      <div class="prex-row">
        <input
          class="prex-input prex-grow"
          value={filter}
          onInput={(e) => setFilter(e.currentTarget.value)}
          placeholder="Filter results..."
          spellcheck={false}
        />
      </div>
      <div class="prex-dim prex-status">
        {status || "Scans this page's own (same-origin) script files."}
        {results && results.length > 0 && ` Showing ${shown.length} of ${results.length}.`}
      </div>

      {results !== null && shown.length === 0 && <div class="prex-dim">No matches.</div>}
      {shown.map((r) => (
        <div class="prex-entry" key={r.key}>
          <div class="prex-entry-head" onClick={() => toggle(r.key)}>
            <span class="prex-entry-label">{r.key}</span>
            <span class="prex-dim">
              {r.files.length} file{r.files.length === 1 ? "" : "s"}
            </span>
          </div>
          {open.has(r.key) && (
            <div class="prex-entry-body">
              <div class="prex-dim">{r.files.join(", ")}</div>
              {/* Source text around each occurrence: a hint at a payload's
                  shape, not a guarantee of it. Check against real traffic. */}
              <pre class="prex-pre">{r.contexts.join("\n\n···\n\n")}</pre>
              <div class="prex-row prex-actions">
                <button type="button" class="prex-btn" onClick={() => copyToClipboard(r.key)}>
                  Copy name
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
