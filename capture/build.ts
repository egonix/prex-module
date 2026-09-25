// Builds the capture module into <prex>/static/games/<MODULE>.js, which prex
// serves at /prexy/games/<MODULE>.js.
//
//   deno task build:capture                                  prex checked out beside this repo
//   PREX_STATIC=/path/to/prex/static deno task build:capture
//
// Writing straight into prex's static/ is what makes a rebuild live: prex
// serves that directory from disk, so the next window.__prexy.reload() in a
// tab loads it, with no prex rebuild. make-dist.sh points PREX_STATIC at its
// own staging directory instead.
import * as esbuild from "esbuild";
import { fromFileUrl } from "jsr:@std/path@^1.0.8/from-file-url";
import { MODULE, MODULE_NAME } from "../shared/module.ts";

if (!MODULE_NAME.test(MODULE)) {
  console.error(`MODULE "${MODULE}" in shared/module.ts must match ${MODULE_NAME}`);
  Deno.exit(1);
}

const staticDir = (Deno.env.get("PREX_STATIC") ?? fromFileUrl(new URL("../../prex/static/", import.meta.url)))
  .replace(/\/+$/, "");
try {
  if (!(await Deno.stat(staticDir)).isDirectory) throw new Error("not a directory");
} catch {
  console.error(`no prex static directory at ${staticDir}\nset PREX_STATIC to <prex checkout>/static`);
  Deno.exit(1);
}

// The same options prex uses for the game modules it builds itself.
await esbuild.build({
  entryPoints: [fromFileUrl(new URL("./main.ts", import.meta.url))],
  outfile: `${staticDir}/games/${MODULE}.js`,
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  sourcemap: true,
});

esbuild.stop();
console.log(`[${MODULE}] capture module -> ${staticDir}/games/${MODULE}.js`);
