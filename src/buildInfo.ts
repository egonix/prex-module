// Stamped in by vite.config.ts `define` at build time: Vite replaces the two
// identifiers with string literals. Declared here, in a module, rather than
// in a .d.ts deno check only reads files the import graph reaches.
declare const __HUD_VERSION__: string;
declare const __HUD_BUILT_AT__: string;

/** The commit the HUD was built from, "+" when the build had uncommitted changes. */
export const HUD_VERSION: string = __HUD_VERSION__;
export const HUD_BUILT_AT: string = __HUD_BUILT_AT__;
