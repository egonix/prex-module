// Named entries in the page's own localStorage: a captured response kept for
// later, a request body worked out once and replayed, anything a session
// should not lose to a reload. The capture log, by contrast, is memory only.
//
// One seen object under one key, read and written whole. Every access is
// guarded: storage can be blocked, full, or overwritten by the page itself,
// and none of that may break capture.

export interface Saved {
  savedAt: number;
  data: unknown;
  note?: string;
}

interface Lib {
  version: 1;
  saved: Record<string, Saved>;
}

export interface Store {
  save(name: string, data: unknown, note?: string): boolean;
  load(name: string): Saved | undefined;
  list(): Record<string, Saved>;
  remove(name: string): void;
}

export function createStore(key: string): Store {
  // A missing key reads as empty. Anything else that is not this shape, the
  // page's own value under the same name, a corrupt write, a newer version,
  // reads as undefined, and save/remove leave it alone rather than replace it.
  // If this shape ever changes, bump `version` and migrate the old one here.
  function read(): Lib | undefined {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return { version: 1, saved: {} };
      const parsed = JSON.parse(raw) as Partial<Lib> | null;
      if (parsed?.version === 1 && parsed.saved && typeof parsed.saved === "object") return parsed as Lib;
    } catch {
      // fall through: unreadable
    }
    return undefined;
  }

  // false covers both a full or blocked storage and data JSON cannot encode
  // (a cycle, a BigInt), so a caller can say it failed instead of pretending.
  function write(lib: Lib): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(lib));
      return true;
    } catch {
      return false;
    }
  }

  return {
    save(name, data, note) {
      const lib = read();
      if (!lib) return false;
      lib.saved[name] = { savedAt: Date.now(), data, ...(note ? { note } : {}) };
      return write(lib);
    },
    load: (name) => read()?.saved[name],
    list: () => read()?.saved ?? {},
    remove(name) {
      const lib = read();
      if (!lib) return;
      delete lib.saved[name];
      write(lib);
    },
  };
}
