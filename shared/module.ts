// Global module
//
// It becomes:
//   --game <MODULE>                 the bookmarklet flag that selects the capture module
//   games/<MODULE>.js               served by prex at /prexy/games/<MODULE>.js
//   <MODULE>-hud/<MODULE>-hud.js    the HUD, loaded with --module or loadModule()
//   window.<MODULE>                 the capture module's API inside the page
//   the game-schema `game`          prex rejects a declaration naming another game
//   localStorage "lib<MODULE>"      the store (capture/lib/store.ts)
//
// Lowercase letter first, then lowercase letters, digits or underscores, so
// window.<MODULE> works with plain dot access in a console. Both builds refuse
// anything else, rather than produce a module that loads under one name and
// registers under another.
export const MODULE = "example";

export const MODULE_NAME = /^[a-z][a-z0-9_]*$/;
