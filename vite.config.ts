import preact from "@preact/preset-vite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";
import { MODULE, MODULE_NAME } from "./shared/module.ts";

// Library mode: a single ES module that prexy's loadModule() import()s into
// the target page. There is no index.html and no page to open.
//
// Built straight into <prex>/static/<MODULE>-hud/, which prex serves at
// /static/<MODULE>-hud/<MODULE>-hud.js: the same "a rebuild is live"
// arrangement as the capture module (capture/build.ts). PREX_STATIC moves it.
export default defineConfig((): UserConfig => {
  if (!MODULE_NAME.test(MODULE)) {
    throw new Error(`MODULE "${MODULE}" in shared/module.ts must match ${MODULE_NAME}`);
  }
  const staticDir = (process.env.PREX_STATIC ?? fileURLToPath(new URL("../prex/static/", import.meta.url))).replace(/\/+$/, "");
  if (!existsSync(staticDir)) {
    throw new Error(`no prex static directory at ${staticDir}; set PREX_STATIC to <prex checkout>/static`);
  }

  return {
    plugins: [preact()],
    build: {
      lib: {
        entry: fileURLToPath(new URL("./src/main.tsx", import.meta.url)),
        formats: ["es"],
        fileName: () => `${MODULE}-hud.js`,
      },
      outDir: `${staticDir}/${MODULE}-hud`,
      // It is outside this project, so Vite would not empty it anyway; saying
      // so here beats relying on that.
      emptyOutDir: false,
      rollupOptions: {
        // Everything, Preact included, in the one file: the page this loads
        // into has no import map and no node_modules.
        external: [],
      },
    },
  };
});
