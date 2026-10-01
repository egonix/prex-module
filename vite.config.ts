import preact from "@preact/preset-vite";
import { execSync } from "node:child_process";
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

  // The title bar's HUD version: the commit, "+" when the build has
  // uncommitted changes (package.json's version is never bumped). make-dist.sh
  // builds from a git archive, which has no history to ask, so it passes its
  // own in HUD_VERSION. A build outside a git checkout still works, as "dev".
  const git = (args: string) => {
    try {
      return execSync(`git ${args}`, { cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const commit = git("rev-parse --short HEAD");
  const hudVersion = process.env.HUD_VERSION || (commit ? `${commit}${git("status --porcelain") ? "+" : ""}` : "dev");

  return {
    plugins: [preact()],
    define: {
      __HUD_VERSION__: JSON.stringify(hudVersion),
      __HUD_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
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
