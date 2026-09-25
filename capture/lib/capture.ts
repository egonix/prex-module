// Game-agnostic capture/instrumentation primitives.
//
// Copied from prex (prexy/games/lib/capture.ts) so this project builds on its
// own. prex keeps the original; bring changes across by this.
//
// Nothing here talks to `agent` directly except through the `push`
// callback createCaptureLog() hands back, that's the one that
// actually needs a PrexyAgent, so every hook function below stays
// testable/reusable independent of it.
import type { PrexyAgent } from "../../shared/prexy.ts";

export interface CaptureLogEntry {
  key?: string; // assigned unconditionally by push(), callers never set this, same idea as ts
  kind: string; // "http" | "ws" | ...
  ts: number;
  [key: string]: unknown;
}

export interface CaptureLog<T extends CaptureLogEntry = CaptureLogEntry> {
  log: T[];
  push(entry: T): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
}

// A ring buffer that also forwards every entry to prex through
// agent.event(). `push` sets `ts` itself (callers pass `ts: 0` as a placeholder)
// so every hook below doesn't need to.
export function createCaptureLog<T extends CaptureLogEntry = CaptureLogEntry>(agent: PrexyAgent, max = 400): CaptureLog<T> {
  const log: T[] = [];
  let paused = false;

  function push(entry: T): void {
    if (paused) return;
    // Callers pass `ts: 0` as a placeholder and this fills it in, but a REPLAYED
    // frame (see drainPrehook) already carries the time it actually arrived,
    // which for pre-page-load frames is the entire reason it was kept. Stamping
    // over it would relabel the whole buffer with the moment of the replay.
    if (!entry.ts) entry.ts = Date.now();
    entry.key = agent.nextActivityKey();
    log.unshift(entry);
    if (log.length > max) log.length = max;
    agent.event(entry.kind, entry);
  }

  return {
    log,
    push,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    isPaused: () => paused,
  };
}

// `type` first, then `event`. Both are dominant conventions for naming a frame
// and a generic capture has no way to know which a new target uses, checking
// only `type` made every frame from a Pusher/Laravel-broadcasting target come
// back "?", whose real shape may be {event, data, channel}). 
// `type` keeps precedence, so targets already using it are unaffected.
export function messageType(parsed: unknown): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if ("type" in o && (typeof o.type === "string" || typeof o.type === "number")) return String(o.type);
    if ("event" in o && (typeof o.event === "string" || typeof o.event === "number")) return String(o.event);
  }
  return "?";
}

// Reads an ambient global by name, including ones that don't attach to
// `window`, a top-level `let`/`const` in a classic (non-module) <script>
// creates a real, live binding, but (unlike `var` or a function
// declaration) it does NOT become a `window` property. `new Function(...)`'s
// body always runs in the true *global* scope regardless of where the call
// site itself lives (unlike a plain function literal here, which would
// close over this module's own scope and never see the page's
// script-global bindings), the standard way to read an ambient global
// that isn't on `window`. Degrades to `undefined` instead of throwing if
// the name doesn't exist (yet, or ever, read before the page's own script
// has run, or a future refactor removes it). Load-bearing on real targets:
// a page built without a bundler often keeps its whole state in top-level
// let/const bindings exactly this way.
export function readGlobal<T = unknown>(name: string): T | undefined {
  try {
    return new Function(`return typeof ${name} !== "undefined" ? ${name} : undefined;`)() as T | undefined;
  } catch {
    return undefined;
  }
}

// Every hook below installs its low-level patch (replacing window.fetch,
// WebSocket.prototype.send, a named dispatch function, ...) at most once,
// necessary, or a page that's been hooked, reconnected, and re-hooked
// several times would end up N patches deep, each layer adding its own
// redundant work. But "already installed" and "still routing to the
// *current* module instance's log" are different questions: loadModule()
// creates a brand-new module instance on every reload (cache-busted
// import), with its own fresh `log` array, normally fine, a real page
// reload also hands you an unhooked page to hook fresh. A *reconnect*
// without a page reload (prex server restarts, drops the session, the
// client's own retry loop reconnects and re-runs reload()) is different:
// the low-level patch is still there from the *previous* instance, so the
// guard correctly skips reinstalling it, but if that early return doesn't
// also repoint the patch at the new instance's `push`, the old instance's
// closure keeps capturing into an array nothing references anymore, while
// window.<game>.log (reassigned fresh on every init()) sits at a
// permanently-empty orphan. 
//
// After a reconnect, a module hooked fresh at that point saw its log
// grow normally while one hooked before the reconnect is frozen at 0
// despite real traffic clearly still flowing. Every hook here
// stores its current `push` on the *same object* its "already installed"
// marker lives on, and updates it unconditionally on every call, so a
// reconnect-triggered re-init still costs nothing extra at the patch
// level, but always ends up routing to whichever module instance is
// actually current.

export interface HttpCaptureEntry extends CaptureLogEntry {
  kind: "http";
  method: string;
  url: string;
  status: number;
  reqBody?: unknown;
  resBody?: unknown;
  error?: string;
}

// REST capture via a wrapped window.fetch. No path filter by default
// pass `filter` to narrow it once you know the target's own convention.
// The wrapper stashes the pre-hook native fetch on itself (not a separate
// window property) so nativeFetch() below can recover it regardless of
// how many times a module has reloaded on this page, a *separate*
// "stash it on first install" property would stay unset forever on a tab
// that was already hooked before a given reload, which is exactly the bug
// this shape was chosen to avoid ... found the hard way on a real target :)
export function hookFetch(push: (entry: HttpCaptureEntry) => void, opts: { filter?: (url: string, method: string) => boolean } = {}): void {
  const currentFetch = window.fetch as typeof fetch & { __prexFetchHooked?: boolean; __prexFetchPush?: typeof push };
  if (currentFetch.__prexFetchHooked) {
    currentFetch.__prexFetchPush = push;
    return;
  }
  const orig = currentFetch.bind(window);
  const filter = opts.filter ?? (() => true);

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : undefined) ?? "GET").toUpperCase();
    const promise = orig(input, init);

    if (filter(url, method)) {
      let reqBody: unknown;
      const rawBody = init?.body;
      if (typeof rawBody === "string") {
        try {
          reqBody = JSON.parse(rawBody);
        } catch {
          reqBody = rawBody;
        }
      }
      promise
        .then((res) => {
          res
            .clone()
            .text()
            .then((text) => {
              let data: unknown;
              try {
                data = JSON.parse(text);
              } catch {
                data = text;
              }
              wrapped.__prexFetchPush?.({ kind: "http", method, url, status: res.status, reqBody, resBody: data, ts: 0 });
            })
            .catch(() => {});
        })
        .catch((err) => {
          wrapped.__prexFetchPush?.({ kind: "http", method, url, status: 0, reqBody, error: String((err as Error)?.message ?? err), ts: 0 });
        });
    }
    return promise;
  }) as typeof fetch & { __prexFetchHooked?: boolean; __prexFetchPush?: typeof push; __prexOrigFetch?: typeof fetch };

  wrapped.__prexFetchHooked = true;
  wrapped.__prexFetchPush = push;
  wrapped.__prexOrigFetch = orig;
  window.fetch = wrapped;
}

// Bypasses hookFetch's wrapper, for the debugger's own requests (an
// Explorer-tab probe, a HUD's own poll...), which must never compete with
// real captured traffic for the same fixed-size ring buffer. See
// hookFetch's doc comment for why the native ref lives on the wrapper
// itself rather than a separate window property.
export function nativeFetch(): typeof fetch {
  const current = window.fetch as typeof fetch & { __prexOrigFetch?: typeof fetch };
  return current.__prexOrigFetch ?? current;
}

export interface WsCaptureEntry extends CaptureLogEntry {
  kind: "ws";
  dir: "in" | "out" | "sys";
  type: string;
  payload: unknown;
}

// Outgoing only: patching the prototype affects every socket, existing or
// future, since `.send()` resolves the method off the prototype at call
// time, no "already open before the hook installed" race. Use this alone
// (paired with hookNamedDispatch, if the target exposes one) when a
// message-dispatch global exists; use hookWebSocketFull instead when it
// doesn't. Not used internally by hookWebSocketFull below, deliberately
// self-contained instead of composed, since composing them would mean two
// different marker objects (this one's marker lives on the native
// constructor; hookWebSocketFull's has to live on its own wrapper
// constructor once that replaces window.WebSocket) and repointing only one
// of them on a reconnect would silently leave the other stale.
export function hookWebSocketSend(push: (entry: WsCaptureEntry) => void, opts: { isControlSocket?: (ws: WebSocket) => boolean } = {}): void {
  const NativeWS = window.WebSocket as typeof WebSocket & { __prexWsSendHooked?: boolean; __prexWsSendPush?: typeof push };
  if (NativeWS.__prexWsSendHooked) {
    NativeWS.__prexWsSendPush = push;
    return;
  }

  const isControlSocket = opts.isControlSocket ?? (() => false);
  const origSend = NativeWS.prototype.send;
  NativeWS.prototype.send = function (this: WebSocket, data: string) {
    if (isControlSocket(this)) return origSend.call(this, data);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      NativeWS.__prexWsSendPush?.({ kind: "ws", dir: "out", type: messageType(parsed), payload: parsed, ts: 0 });
    } catch {
      //NOP never let capture errors break the real send
    }
    return origSend.call(this, data);
  };

  NativeWS.__prexWsSendHooked = true;
  NativeWS.__prexWsSendPush = push;
}

// Both directions, no assumptions about the target game's architecture,
// the general-purpose fallback for a brand-new/unknown target. Outgoing
// is the same race-free prototype patch as hookWebSocketSend above (but
// self-contained, not delegated, see that function's doc comment for
// why); incoming replaces the WebSocket constructor itself, which only
// instruments sockets created *after* this hook installs, a bookmarklet
// has no way to attach a listener to a socket that's already open. If the
// target turns out to expose a single global message-dispatch function
// (worth checking, see hookNamedDispatch below), prefer that instead:
// it has no such race, since the dispatch function is looked up by name
// fresh on every message rather than captured once at connect time.
export function hookWebSocketFull(push: (entry: WsCaptureEntry) => void, opts: { isControlSocket?: (ws: WebSocket) => boolean } = {}): void {
  const current = window.WebSocket as typeof WebSocket & { __prexWsFullHooked?: boolean; __prexWsFullPush?: typeof push };
  if (current.__prexWsFullHooked) {
    current.__prexWsFullPush = push;
    return;
  }

  const NativeWS = current; // true native, this path only runs before any wrapping
  const isControlSocket = opts.isControlSocket ?? (() => false);
  // A document_start pre-hook (prexin) already wraps the WebSocket constructor
  // and hands incoming frames over via drainPrehook. Wrapping again would put
  // every socket through two wrappers and report every incoming frame twice,
  // and the pre-hook's wrapper is strictly better, because it also covers
  // sockets opened before prexy loaded, which this one can never see.
  // Outgoing is unaffected: that is a prototype patch, installed below either
  // way, and the pre-hook deliberately does not touch it.
  const preCoversIncoming = prehook()?.wrapsWebSocket === true;

  type PatchedWS = {
    (this: unknown, url: string | URL, protocols?: string | string[]): WebSocket;
    prototype: WebSocket;
    __prexWsFullPush?: typeof push;
  };

  const origSend = NativeWS.prototype.send;
  NativeWS.prototype.send = function (this: WebSocket, data: string) {
    if (isControlSocket(this)) return origSend.call(this, data);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      (WrappedWS as PatchedWS).__prexWsFullPush?.({ kind: "ws", dir: "out", type: messageType(parsed), payload: parsed, ts: 0 });
    } catch {
      //NOP never let capture errors break the real send
    }
    return origSend.call(this, data);
  };

  function WrappedWS(this: unknown, url: string | URL, protocols?: string | string[]): WebSocket {
    const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
    // isControlSocket is checked per EVENT, not once here at construction, and
    // that distinction is load-bearing. prex core defaultTransport marks the
    // socket only AFTER `new WebSocket(url)` returns, so at this point prexy's
    // own control socket is still unmarked and a construction-time check always
    // says "not control". It looks correct and never fires.
    //
    // Harmless while the control socket predates this hook (the usual case, since
    // the bookmarklet connects before loading a game module), but every
    // RECONNECT builds a new control socket through this wrapper, and prex then
    // captures its own eval/result frames as target traffic. 
    // Like {type:"eval", id, code} stored as game activity.
    // By the time a message arrives the marker is set, so checking here is both
    // correct and race-free.
    ws.addEventListener("message", (ev: MessageEvent) => {
      if (isControlSocket(ws)) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        parsed = ev.data;
      }
      (WrappedWS as PatchedWS).__prexWsFullPush?.({ kind: "ws", dir: "in", type: messageType(parsed), payload: parsed, ts: 0 });
    });
    ws.addEventListener("close", (ev: CloseEvent) => {
      if (isControlSocket(ws)) return;
      (WrappedWS as PatchedWS).__prexWsFullPush?.({ kind: "ws", dir: "sys", type: "close", payload: { code: ev.code, reason: ev.reason }, ts: 0 });
    });
    return ws;
  }
  WrappedWS.prototype = NativeWS.prototype;
  Object.assign(WrappedWS, {
    CONNECTING: NativeWS.CONNECTING,
    OPEN: NativeWS.OPEN,
    CLOSING: NativeWS.CLOSING,
    CLOSED: NativeWS.CLOSED,
    __prexWsFullHooked: true,
    __prexWsFullPush: push,
  });
  if (!preCoversIncoming) window.WebSocket = WrappedWS as unknown as typeof WebSocket;
}

// XMLHttpRequest capture. Emits the SAME `kind: "http"` shape hookFetch does,
// deliberately: to everything downstream, the store's indexed columns, the
// detector, query_activity, an XHR call and a fetch call are the same event,
// and only the hook differs.
//
// This is not a nice-to-have, a Laravel + Pusher of XMLHttpRequests calls against
// a fetch, so hooking fetch alone captured not all of its REST traffic and
// the page looked almost silent.
// Anything built on axios or jQuery is XHR by default, which is a large share of
// the web, `fetch` being the modern API does not make it the common one.
export function hookXHR(push: (entry: HttpCaptureEntry) => void, opts: { filter?: (url: string, method: string) => boolean } = {}): void {
  const Native = window.XMLHttpRequest as typeof XMLHttpRequest & {
    __prexXhrHooked?: boolean;
    __prexXhrPush?: typeof push;
  };
  if (Native.__prexXhrHooked) {
    Native.__prexXhrPush = push;
    return;
  }
  const filter = opts.filter ?? (() => true);
  // Symbol.for, not a plain Symbol: capture.ts is bundled separately into each
  // game module, so two bundles asking for a plain Symbol would get two unequal
  // symbols and fail to read each other's per-request metadata.
  const META = Symbol.for("prex-xhr-meta");
  type Meta = { method: string; url: string; reqBody?: unknown };

  const origOpen = Native.prototype.open;
  const origSend = Native.prototype.send;

  Native.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      (this as unknown as Record<symbol, Meta>)[META] = { method: String(method ?? "GET").toUpperCase(), url: String(url) };
    } catch {
      //NOP never let capture errors break the real open
    }
    // deno-lint-ignore no-explicit-any
    return (origOpen as any).call(this, method, url, ...rest);
  };

  Native.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      const meta = (this as unknown as Record<symbol, Meta>)[META];
      if (meta && filter(meta.url, meta.method)) {
        if (typeof body === "string") {
          try {
            meta.reqBody = JSON.parse(body);
          } catch {
            meta.reqBody = body;
          }
        }
        // loadend fires for success, error and abort alike, so one listener
        // covers every terminal outcome without three separate handlers.
        this.addEventListener("loadend", () => {
          try {
            let data: unknown;
            // responseText THROWS when responseType is "blob"/"arraybuffer"/
            // "document", reading it unguarded would break capture on any
            // binary request the target makes.
            if (this.responseType === "" || this.responseType === "text") {
              try {
                data = JSON.parse(this.responseText);
              } catch {
                data = this.responseText;
              }
            } else if (this.responseType === "json") {
              data = this.response;
            } else {
              data = `[${this.responseType}]`;
            }
            const entry: HttpCaptureEntry = {
              kind: "http",
              method: meta.method,
              url: meta.url,
              status: this.status,
              reqBody: meta.reqBody,
              resBody: data,
              ts: 0,
            };
            // status 0 is how the platform reports a network failure or an
            // abort, matching hookFetch's own error path.
            if (this.status === 0) entry.error = "network error or aborted";
            Native.__prexXhrPush?.(entry);
          } catch {
            //NOP never let capture errors break the page
          }
        });
      }
    } catch {
      //NOP never let capture errors break the real send
    }
    return origSend.call(this, body as XMLHttpRequestBodyInit | null);
  };

  Native.__prexXhrHooked = true;
  Native.__prexXhrPush = push;
}

export interface SseCaptureEntry extends CaptureLogEntry {
  kind: "sse";
  dir: "in" | "sys";
  type: string;
  url: string;
  payload: unknown;
}

// Server-Sent Events. The second server-push transport, and a target that uses
// it instead of a WebSocket is 100% invisible without this, the same total
// blind spot XHR was, not a partial one.
//
// Like hookWebSocketFull this replaces the constructor, so it only sees streams
// opened after it installs. Unlike a WebSocket there is no prototype-level send
// to patch (SSE is receive-only), so there is no partial-capture fallback: an
// already-open stream is simply missed until it reconnects.
export function hookEventSource(push: (entry: SseCaptureEntry) => void): void {
  const current = window.EventSource as (typeof EventSource & { __prexSseHooked?: boolean; __prexSsePush?: typeof push }) | undefined;
  if (!current) return; // browser without SSE support, nothing to hook
  // Same reasoning as hookWebSocketFull: a pre-hook that already wraps this
  // covers streams opened before prexy loaded, and wrapping twice would double
  // every frame. SSE is receive-only, so unlike WebSocket there is nothing left
  // for this function to install once the pre-hook has it.
  if (prehook()?.wrapsEventSource === true) return;
  if (current.__prexSseHooked) {
    current.__prexSsePush = push;
    return;
  }
  const NativeES = current;

  type PatchedES = {
    (this: unknown, url: string | URL, init?: EventSourceInit): EventSource;
    prototype: EventSource;
    __prexSsePush?: typeof push;
  };

  function WrappedES(this: unknown, url: string | URL, init?: EventSourceInit): EventSource {
    const es = init !== undefined ? new NativeES(url, init) : new NativeES(url);
    const href = String(url);
    const report = (type: string, raw: unknown, dir: "in" | "sys" = "in") => {
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }
      (WrappedES as PatchedES).__prexSsePush?.({ kind: "sse", dir, type, url: href, payload: parsed, ts: 0 });
    };
    es.addEventListener("message", (ev: MessageEvent) => report("message", ev.data));
    es.addEventListener("error", () => report("error", { readyState: es.readyState }, "sys"));

    // SSE streams commonly use NAMED events (`event: tick`), which never reach
    // the "message" listener above. There is no way to enumerate them, so the
    // page's own subscriptions are the only source of truth for which names
    // exist, wrapping addEventListener per instance captures exactly the ones
    // the target actually listens for, and nothing it does not.
    const origAdd = es.addEventListener.bind(es);
    // deno-lint-ignore no-explicit-any
    (es as any).addEventListener = function (type: string, listener: any, options?: any) {
      if (type !== "message" && type !== "error" && type !== "open") {
        origAdd(type, ((ev: MessageEvent) => report(type, ev.data)) as EventListener);
      }
      return origAdd(type, listener, options);
    };
    return es;
  }
  WrappedES.prototype = NativeES.prototype;
  Object.assign(WrappedES, {
    CONNECTING: NativeES.CONNECTING,
    OPEN: NativeES.OPEN,
    CLOSED: NativeES.CLOSED,
    __prexSseHooked: true,
    __prexSsePush: push,
  });
  window.EventSource = WrappedES as unknown as typeof EventSource;
}

export interface BeaconCaptureEntry extends CaptureLogEntry {
  kind: "beacon";
  method: "POST";
  url: string;
  reqBody?: unknown;
}

// navigator.sendBeacon, fire-and-forget POSTs, typically on pagehide/unload.
// Included because it is the one remaining way a page can send data that none of
// the hooks above see. There is deliberately no response to capture:
// the API returns only a boolean for whether the send was queued.
export function hookSendBeacon(push: (entry: BeaconCaptureEntry) => void): void {
  const nav = navigator as Navigator & { __prexBeaconHooked?: boolean; __prexBeaconPush?: typeof push };
  if (nav.__prexBeaconHooked) {
    nav.__prexBeaconPush = push;
    return;
  }
  if (typeof nav.sendBeacon !== "function") return;
  const orig = nav.sendBeacon.bind(nav);
  nav.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
    try {
      let body: unknown = undefined;
      if (typeof data === "string") {
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
      } else if (data !== undefined && data !== null) {
        body = `[${(data as object).constructor?.name ?? typeof data}]`;
      }
      nav.__prexBeaconPush?.({ kind: "beacon", method: "POST", url: String(url), reqBody: body, ts: 0 });
    } catch {
      //NOP never let capture errors break the real beacon
    }
    return orig(url, data);
  };
  nav.__prexBeaconHooked = true;
  nav.__prexBeaconPush = push;
}

interface PrehookFrame {
  transport: "ws" | "sse";
  dir: "in" | "sys";
  type: string | null;
  url: string;
  data: unknown;
  ts: number;
}

interface PrehookSurface {
  version: number;
  wrapsWebSocket?: boolean;
  wrapsEventSource?: boolean;
  drain(onFrame?: (f: PrehookFrame) => void): { frames: PrehookFrame[]; dropped: number };
  readonly dropped: number;
  readonly pending: number;
}

function prehook(): PrehookSurface | undefined {
  const p = (window as unknown as { __prexPrehook?: PrehookSurface }).__prexPrehook;
  return p && typeof p.drain === "function" ? p : undefined;
}

// Replays anything a document_start pre-hook buffered before this module existed.
//
// Constructor-replacement capture (hookWebSocketFull, hookEventSource) only sees
// streams opened AFTER it installs, and prexy necessarily loads asynchronously,
// so on a target that opens its socket during page load, incoming frames are
// missed until the target's own client happens to reconnect.
//
// prexin (the browser extension) can install a synchronous MAIN-world hook at
// document_start that buffers raw frames and waits. This drains that buffer. It
// is a no-op when nothing went before, a plain bookmarklet, or an older
// extension build, so nothing depends on the extension being present.
export function drainPrehook(push: (entry: CaptureLogEntry) => void): number {
  const pre = prehook();
  if (!pre) return 0;
  const emit = (f: PrehookFrame) => {
    let parsed: unknown = f.data;
    if (typeof f.data === "string") {
      try {
        parsed = JSON.parse(f.data);
      } catch {
        parsed = f.data;
      }
    }
    if (f.transport === "sse") {
      push({ kind: "sse", dir: f.dir, type: f.type ?? "message", url: f.url, payload: parsed, ts: f.ts } as CaptureLogEntry);
    } else {
      push({ kind: "ws", dir: f.dir, type: f.type ?? messageType(parsed), payload: parsed, ts: f.ts } as CaptureLogEntry);
    }
  };
  let drained: { frames: PrehookFrame[]; dropped: number };
  try {
    // Passing `emit` takes over LIVE delivery as well as collecting the backlog.
    // Required, not optional: a socket opened before prexy loaded is invisible to
    // our own constructor wrap forever, so if the pre-hook stopped here those
    // sockets would go silent the instant they were drained.
    drained = pre.drain(emit);
  } catch {
    return 0;
  }
  // Real arrival times, not replay time, push() preserves a non-zero ts.
  for (const f of drained.frames) emit(f);
  // The pre-hook buffer is bounded, so overflow is possible on a page left open
  // a long time before prexy connected. Reported rather than silent, an unknown
  // hole is exactly what makes an absence unreadable later.
  if (drained.dropped > 0) {
    push({ kind: "ws", dir: "sys", type: "prehook-overflow", payload: { dropped: drained.dropped }, ts: Date.now() } as CaptureLogEntry);
  }
  return drained.frames.length;
}

// Some apps funnel every incoming server message through one named,
// top-level dispatch function (`function foo(msg){...}`) rather than
// wiring a listener straight onto a WebSocket instance. When true, that's
// a *better* incoming hook than hookWebSocketFull's constructor-wrap,
// replacing the function works no matter when it happens relative to the
// socket already being open, because every call site looks the name up
// fresh each time, not once at connect time. Only really works when the
// name is `var`/function-declared (attaches to `window`, so a plain
// assignment updates the one binding everything else already resolves
// against), a `let`/`const`-declared dispatcher can't be reassigned from
// outside like this at all; readGlobal() can still *read* one of those,
// just not replace it. Worth checking for on any new target.
// (just try this and see if it returns true) before assuming 
// hookWebSocketFull's race is unavoidable.
export function hookNamedDispatch(name: string, push: (entry: WsCaptureEntry) => void): boolean {
  const current = readGlobal<((msg: unknown) => unknown) & { __prexDispatchHookedName?: string; __prexDispatchPush?: typeof push }>(name);
  if (!current) return false;

  if (current.__prexDispatchHookedName === name) {
    current.__prexDispatchPush = push;
    return true;
  }

  const original = current;
  const wrapped = ((msg: unknown) => {
    wrapped.__prexDispatchPush?.({ kind: "ws", dir: "in", type: messageType(msg), payload: msg, ts: 0 });
    return original(msg);
  }) as ((msg: unknown) => unknown) & { __prexDispatchHookedName?: string; __prexDispatchPush?: typeof push };
  wrapped.__prexDispatchHookedName = name;
  wrapped.__prexDispatchPush = push;

  try {
    (window as unknown as Record<string, unknown>)[name] = wrapped;
    return (window as unknown as Record<string, unknown>)[name] === wrapped;
  } catch {
    return false;
  }
}
