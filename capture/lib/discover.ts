// Copied from prex (prexy/games/lib/discover.ts); bring changes across by this.
//
// Static-source introspection, finding the *shape* of the target's own
// client code (what actions/events/etc. it defines), not runtime traffic
// (that's capture's job). Built for action catalogues: rather
// than hand-writing payload schemas for a game's full action vocabulary
// up front, most of which won't matter for any one goal, and guessing
// which subset will is the same mistake as pre-trimming state around an
// assumed goal, this fetches the target's own already-loaded <script
// src> files live and greps them, so the catalog stays current with
// whatever's actually deployed and gives enough surrounding context to
// infer a specific action's payload shape on demand, only for whichever
// ones a given goal actually turns out to need.
import { nativeFetch } from "./capture.ts";

export interface ScriptMatch {
  key: string;
  files: string[];
  contexts: string[];
}

// `pattern` needs a capture group, its match becomes the grouped key
// (e.g. every ACTION_TYPE literal). contextChars is how much surrounding
// source to keep per occurrence; maxContextsPerKey caps it for patterns
// that recur a lot.
// Scans the scripts the page has loaded so far (loadedScriptUrls below), or
// exactly `urls` when given, e.g. chunks a bundler's own chunk map names that
// the page hasn't loaded yet. `filter` applies to either, since a page can load
// third-party scripts too that aren't the target's own code and may not even
// be fetchable cross-origin without extra trouble.
//
// Downloads go through nativeFetch, never the page's fetch: with hookFetch
// installed unfiltered, every scan otherwise captured each bundle it read as
// page traffic.
export async function discoverInScripts(
  pattern: RegExp,
  opts: { contextChars?: number; maxContextsPerKey?: number; filter?: (url: string) => boolean; urls?: string[] } = {},
): Promise<ScriptMatch[]> {
  const contextChars = opts.contextChars ?? 150;
  const maxContextsPerKey = opts.maxContextsPerKey ?? 3;
  const filter = opts.filter ?? (() => true);

  const scriptUrls = [...new Set(opts.urls ?? loadedScriptUrls())].filter(filter);
  const fetchScript = nativeFetch();

  const found = new Map<string, ScriptMatch>();

  await Promise.all(
    scriptUrls.map(async (url) => {
      try {
        const res = await fetchScript(url);
        const text = await res.text();
        const fileName = url.split("/").pop()?.split("?")[0] ?? url;
        const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const key = m[1] ?? m[0];
          let entry = found.get(key);
          if (!entry) {
            entry = { key, files: [], contexts: [] };
            found.set(key, entry);
          }
          if (!entry.files.includes(fileName)) entry.files.push(fileName);
          if (entry.contexts.length < maxContextsPerKey) {
            entry.contexts.push(text.slice(Math.max(0, m.index - 10), m.index + contextChars));
          }
        }
      } catch {
        // one file failing to fetch shouldn't lose the rest, partial results still useful
      }
    }),
  );

  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// Every script the page has loaded so far, from two sources because neither
// is complete alone. <script src> only names what the HTML (or a loader)
// inserted, and a bundler's code-split chunks arrive through import(), which
// leaves no <script> behind.
// Chunks the page has not loaded yet appear in neither; pass `urls` for those.
function loadedScriptUrls(): string[] {
  const urls = new Set<string>();
  for (const el of document.querySelectorAll<HTMLScriptElement>("script[src]")) urls.add(el.src);
  for (const el of document.querySelectorAll<HTMLLinkElement>("link[rel=modulepreload][href], link[rel=preload][as=script][href]")) {
    urls.add(el.href);
  }
  for (const entry of performance.getEntriesByType("resource")) {
    if ((entry as PerformanceResourceTiming).initiatorType === "script" || /\.m?js(?:[?#]|$)/.test(entry.name)) urls.add(entry.name);
  }
  return [...urls];
}
