# prex-module

A starting point for a [prex](https://github.com/egonix/prex) game module: a **capture module** that records a target page's
traffic, and a **HUD** that shows it inside that page. Clone it, change one name, build.

> [!TIP] 
> if prex server runs on localhost only, implement the capture logic in the [prex server modules](https://github.com/egonix/prex/tree/main/prexy/games) beside default/minimal.
> - Centralizes game capture and management on the prex server (maintain logic once).
> - Coupling the shared contract directly to prex's lib without update/copy module (client without shared contracts).
> - Requires a full server rebuild whenever the capture module logic changes (client doesn't need to know).

## Quickstart

1. **Name it.** Set `MODULE` in [`shared/module.ts`](shared/module.ts): a lowercase letter, then lowercase
   letters, digits or `_`. Every other name is derived from it.
2. **Build**, with prex checked out beside this repo:
   ```bash
   npm install
   npm run build:all      # HUD + capture module, straight into ../prex/static/
   ```
   With prex anywhere else: `PREX_STATIC=/path/to/prex/static npm run build:all`.
3. **Load it** with a bookmarklet from prex:
   ```bash
   cd ../prex/prexy && deno task bookmarklet -- --server http://localhost:8000 --game <MODULE> \
     --module http://localhost:8000/static/<MODULE>-hud/<MODULE>-hud.js
   ```
4. **Iterate.** Rebuild, then in the tab run `window.__prexy.reload()` for the capture module, or
   `window.__prexy.loadModule("<hud url>")` for the HUD. prex itself never needs a rebuild: both builds write
   into the directory it serves from disk. `npm run watch` rebuilds the HUD on every save.

## Layout

| Path | Desc |
|---|---|
| `shared/module.ts` | The module name. |
| `shared/api.ts` | `window.<MODULE>`: implemented by the capture module and read by the HUD |
| `shared/prexy.ts` | The part of prexy's agent contract a module uses |
| `capture/main.ts` | The capture module |
| `capture/schema.ts` | How prex should read this target's traffic |
| `capture/lib/store.ts` | Named entries in the page's `localStorage` |
| `capture/lib/capture.ts`, `discover.ts` | Hooks and script discovery, mirror from prex |
| `capture/build.ts` | Builds `games/<MODULE>.js` |
| `src/` | The HUD: Preact, built in Vite library mode |

## How prex finds it

- **Capture module:** `--game <MODULE>` makes prexy load `/prexy/games/<MODULE>.js`. prex serves that from its
  own image first and then from its `static/games/`.
- **HUD:** any URL `loadModule()` can import. The build puts it at `/static/<MODULE>-hud/<MODULE>-hud.js`.

## The capture module

It starts out assuming nothing about the target: it hooks `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource` and `sendBeacon`, keeps the newest 400 entries, and forwards each one to prex. Specialize it as
you analyze: narrow a hook with `filter`, declare the target's messages in
[`capture/schema.ts`](capture/schema.ts), and add helpers for the target's own API to `ModuleApi`.

From the page's console:

```js
example.log                            // newest first; each entry has a stable .key
example.discover('type:\\s*"(\\w+)"')  // grep the page's own scripts; group 1 is the name
example.readGlobal("state")            // a global, including top-level let/const
example.save("foobar", example.log[0]) // kept in localStorage across reloads
example.nativeFetch("/api/me")         // a request the hooks will not capture
```

## The HUD

Two tabs. **Log** shows the capture log, filterable, with copy and save, plus a **Saved** view of what was kept.
**Discover** greps the page's own script files for a pattern, with presets for action types, event names and
API paths. Add a tab with an entry in `TABS` and a panel in [`src/Window.tsx`](src/Window.tsx).

## Already handled, so don't undo it

- **prexy's own socket is skipped.** Its control connection is a WebSocket too. Capturing it would feed every
  event back into the log in a loop. The `isControlSocket` check in `capture/main.ts` prevents that.
- **Log entries are tracked by `key`, never by index.** The log is newest-first and every capture shifts it
  by one, so an index points at a different entry on every tick.
- **The HUD unmounts its previous instance.** Each reload imports a fresh copy. Removing the old DOM without
  `render(null, ...)` would leave every earlier copy's intervals running forever.
- **Tabs stay mounted.** Unmounting a hidden tab loses its state and resets the window's resize.
- **The schema's `game` is `MODULE`.** prex rejects a declaration whose game differs from the session's.
- **Late sockets.** The WebSocket and EventSource hooks see only connections opened after the module loads. A
  socket the page opened earlier shows its outgoing messages but not its incoming ones until it reconnects.

## Compatibility with prex

*Highlighting again:* `shared/prexy.ts` mirrors prexy's agent contract, and `capture/lib/capture.ts` and `discover.ts` are copies
of prex's. **That's what lets this example build on its own.** When prex changes them, bring the change across.

*mirror example-c790985 `9bf5620d334b4dfe6e3a0096ded856a43c6132becd7f34ba0d8f141f0cb7f967`*
