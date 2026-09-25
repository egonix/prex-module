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
export interface ScriptMatch {
  key: string;
  files: string[];
  contexts: string[];
}

// `pattern` needs a capture group, its match becomes the grouped key
// (e.g. every ACTION_TYPE literal). contextChars is how much surrounding
// source to keep per occurrence; maxContextsPerKey caps it for patterns
// that recur a lot.
// Fetches only same-origin scripts already on the page
// (via `filter`, since a page can load third-party scripts too that aren't
// the target's own code and may not even be fetchable cross-origin without extra trouble).
export async function discoverInScripts(
  pattern: RegExp,
  opts: { contextChars?: number; maxContextsPerKey?: number; filter?: (url: string) => boolean } = {},
): Promise<ScriptMatch[]> {
  const contextChars = opts.contextChars ?? 150;
  const maxContextsPerKey = opts.maxContextsPerKey ?? 3;
  const filter = opts.filter ?? (() => true);

  const scriptUrls = [...document.querySelectorAll("script[src]")].map((el) => (el as HTMLScriptElement).src).filter(filter);

  const found = new Map<string, ScriptMatch>();

  await Promise.all(
    scriptUrls.map(async (url) => {
      try {
        const res = await fetch(url);
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
