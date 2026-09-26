#!/usr/bin/env bash
# Builds a drop-in release: the files prex serves, laid out the way prex's
# static/ expects them.
#
#   ./make-dist.sh          # HEAD
#   ./make-dist.sh <ref>    # any commit or tag
#
# Install on a prex server, then reload the tab; no prex rebuild:
#
#   tar xzf <module>-<version>.tar.gz -C <prex>/static/
#     games/<module>.js              the capture module, at /prexy/games/<module>.js
#     <module>-hud/<module>-hud.js   the HUD, at /static/<module>-hud/<module>-hud.js
#     <module>.version               which commit this is, at /static/<module>.version
set -euo pipefail

cd "$(dirname "$0")"
PROJECT=$PWD

REF=${1:-HEAD}
git rev-parse --verify "$REF^{commit}" >/dev/null
COMMIT=$(git rev-parse "$REF")
VERSION=$(git describe --tags --always "$REF")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

[ -n "$(git status --porcelain)" ] && echo "note: uncommitted changes; building $REF as committed"

# From the committed tree, never the working tree, so what the version file
# names is what the tarball contains.
SRC="$WORK/src"
mkdir -p "$SRC"
git archive --format=tar "$REF" | tar -x -C "$SRC"
[ -f "$SRC/shared/module.ts" ] || { echo "no shared/module.ts at $REF" >&2; exit 1; }
MODULE=$(cd "$SRC" && deno eval 'console.log((await import(`file://${Deno.cwd()}/shared/module.ts`)).MODULE)')
NAME="$MODULE-$VERSION"
echo "==> $MODULE @ $VERSION"

# Both builds write wherever PREX_STATIC points, which here is the staging
# directory: that is the whole release layout, produced by the same builds.
STAGE="$WORK/stage"
mkdir -p "$STAGE"
export PREX_STATIC="$STAGE"

echo "==> build capture module"
( cd "$SRC" && deno task build:capture >/dev/null )

echo "==> build HUD"
if [ -d "$PROJECT/node_modules" ]; then
  # Safe to share: nothing the build writes goes inside node_modules
  # (tsconfig keeps its build info in .tsbuild/ for exactly this reason).
  ln -s "$PROJECT/node_modules" "$SRC/node_modules"
else
  ( cd "$SRC" && npm ci --silent )
fi
( cd "$SRC" && npm run build >/dev/null )

echo "==> finish"
# Source maps are not shipped: esbuild's embed the complete original source,
# comments and all. Their sourceMappingURL line goes too, or devtools requests
# a map that is not there and logs "Source map error" in the page's console.
rm -f "$STAGE/games/$MODULE.js.map"
sed -i '/^\/\/# sourceMappingURL=/d' "$STAGE/games/$MODULE.js"

# The HUD gets a real minify pass. Vite does not minify library-mode ES output,
# so the build carries every source comment and rolldown's //#region markers,
# which here name paths through the node_modules symlink into the builder's
# home directory. Same pinned esbuild as the capture build; esnext so it only
# minifies and never rewrites syntax.
HUD="$STAGE/$MODULE-hud/$MODULE-hud.js"
ESBUILD=$(cd "$SRC" && deno eval 'console.log(JSON.parse(await Deno.readTextFile("deno.json")).imports.esbuild)')
( cd "$WORK" && deno run --allow-read --allow-write --allow-run --allow-env --allow-net "$ESBUILD" \
    "$HUD" --minify --format=esm --target=esnext --legal-comments=inline --log-level=warning \
    --outfile="$WORK/hud.min.js" )
mv "$WORK/hud.min.js" "$HUD"

printf '%s\n%s\n%s\n' "$VERSION" "$COMMIT" "$(git log -1 --format=%cI "$REF")" > "$STAGE/$MODULE.version"

echo "==> check"
for f in "games/$MODULE.js" "$MODULE-hud/$MODULE-hud.js"; do
  grep -q 'as default}' "$STAGE/$f" || { echo "$f has no default export; prexy calls default.init()" >&2; exit 1; }
done
# Minifiers drop comments, but that is a claim, not a check. TypeScript's own
# parser tells a comment from `//` inside a string or a regex literal; anything
# but a license notice fails the release. License notices stay on purpose: a
# bundled dependency's license requires its notice to travel with every copy.
node - "$PROJECT/node_modules/typescript" "$STAGE/games/$MODULE.js" "$HUD" <<'JS'
const ts = require(process.argv[2]);
const { readFileSync } = require("node:fs");
let bad = 0;
for (const file of process.argv.slice(3)) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const seen = new Map();
  const take = (ranges) => { for (const r of ranges ?? []) seen.set(r.pos, text.slice(r.pos, r.end)); };
  (function walk(node) {
    take(ts.getLeadingCommentRanges(text, node.getFullStart()));
    take(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, walk);
  })(sf);
  const all = [...seen.values()];
  const licenses = all.filter((c) => /^\/\*!|@license|@preserve/.test(c));
  const other = all.filter((c) => !licenses.includes(c));
  console.log(`    ${file.split("/").slice(-2).join("/")}: ${other.length} comments, ${licenses.length} license notices kept`);
  for (const c of other.slice(0, 3)) console.error(`      unexpected: ${c.slice(0, 80)}`);
  bad += other.length;
}
process.exit(bad ? 1 : 0);
JS
# Nothing from the machine that built it.
for leak in "$HOME" "$WORK"; do
  if grep -rlF -- "$leak" "$STAGE" >/dev/null; then
    echo "build path in the release: $(grep -rlF -- "$leak" "$STAGE" | sed "s|$STAGE/||")" >&2
    exit 1
  fi
done
echo "    no build-machine paths"

echo "==> pack"
OUT="$PROJECT/release"
mkdir -p "$OUT"
tar --numeric-owner --owner=0 --group=0 --mtime="@$(git log -1 --format=%ct "$REF")" \
    --sort=name -czf "$OUT/$NAME.tar.gz" -C "$STAGE" games "$MODULE-hud" "$MODULE.version"
( cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256" )

echo
echo "$OUT/$NAME.tar.gz"
tar tzf "$OUT/$NAME.tar.gz" | grep -v '/$' | sed 's/^/  /'
echo "  $(du -h "$OUT/$NAME.tar.gz" | cut -f1)  $(cut -d' ' -f1 "$OUT/$NAME.tar.gz.sha256")"
