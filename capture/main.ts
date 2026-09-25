// The capture module: what prex loads for `--game <MODULE>`, from
// /prexy/games/<MODULE>.js. It hooks every transport the page talks on, keeps
// what it sees in a log, forwards each entry to prex, and exposes
// window.<MODULE> (shared/api.ts) for the HUD and the browser console.
//
// It starts out assuming nothing about the target. Specialize it as for
// the target: narrow a hook with a `filter`, declare its messages in SCHEMA,
// and add helpers for its own API to ModuleApi.
import { MODULE } from "../shared/module.ts";
import { type GameModule, type PrexyAgent, PREXY_CONTROL_SOCKET } from "../shared/prexy.ts";
import type { ModuleApi } from "../shared/api.ts";
import {
  createCaptureLog,
  drainPrehook,
  hookEventSource,
  hookFetch,
  hookNamedDispatch,
  hookSendBeacon,
  hookWebSocketFull,
  hookXHR,
  nativeFetch,
  readGlobal,
} from "./lib/capture.ts";
import { discoverInScripts } from "./lib/discover.ts";
import { createStore } from "./lib/store.ts";
import { SCHEMA } from "./schema.ts";

const sameOrigin = (url: string): boolean => {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

const captureModule: GameModule = {
  name: MODULE,
  init(agent: PrexyAgent) {
    // Before any hook exists, so prex reads the very first captured message
    // with this declaration already applied.
    agent.event("game-schema", SCHEMA);

    const capture = createCaptureLog(agent);
    agent.registerCaptureLog(capture.log);

    // prexy's own control socket is a WebSocket too. Without this check every
    // event sent over it would be captured, sent, captured again, forever.
    const isControlSocket = (ws: WebSocket) => !!(ws as unknown as Record<symbol, boolean>)[PREXY_CONTROL_SOCKET];

    // Every transport, because a new target is exactly the case where you
    // cannot know which one it uses. Anything built on axios or jQuery talks
    // XMLHttpRequest, not fetch: hooking fetch alone can see almost none of a
    // page's REST traffic and make it look idle.
    hookFetch(capture.push);
    hookXHR(capture.push);
    hookWebSocketFull(capture.push, { isControlSocket });
    hookEventSource(capture.push);
    hookSendBeacon(capture.push);

    // Only after the hooks are live: replay what a document_start pre-hook
    // buffered before this module existed (prexin installs one; a plain
    // bookmarklet does not, and then this is a no-op). The other order would
    // leave a gap in which frames belong to neither.
    const replayed = drainPrehook(capture.push);

    // Worth knowing when a target looks quieter than it should: the WebSocket
    // and EventSource hooks replace constructors, so they see only streams
    // opened AFTER this loads. A bookmarklet usually runs after the page's own
    // scripts, so an already-open socket shows its outgoing frames (the
    // prototype patch reaches it) but no incoming ones until it reconnects.

    const store = createStore(`lib${MODULE}`);
    const api: ModuleApi = {
      log: capture.log,
      pause: capture.pause,
      resume: capture.resume,
      isPaused: capture.isPaused,
      readGlobal,
      hookNamedDispatch: (name) => hookNamedDispatch(name, capture.push),
      // Called bare, not as a method: the native fetch throws "Illegal invocation"
      // when `this` is anything but the window or undefined.
      nativeFetch: (input, init) => nativeFetch()(input, init),
      // async so a malformed pattern rejects instead of throwing synchronously.
      discover: async (pattern) =>
        discoverInScripts(typeof pattern === "string" ? new RegExp(pattern) : pattern, { filter: sameOrigin }),
      save: store.save,
      load: store.load,
      list: store.list,
      remove: store.remove,
    };
    (window as unknown as Record<string, ModuleApi>)[MODULE] = api;

    agent.event(`${MODULE}-ready`, { replayed });
  },
};

export default captureModule;
