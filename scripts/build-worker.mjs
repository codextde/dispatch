/**
 * Bundle the worker and the migration runner into self-contained ESM files
 * for the production image (no node_modules or TypeScript needed at runtime):
 *
 *   dist/worker.mjs    ← src/worker/index.ts   (node dist/worker.mjs)
 *   dist/migrate.mjs   ← scripts/migrate.ts    (node dist/migrate.mjs; needs ./drizzle)
 *
 *   node scripts/build-worker.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))

/** `server-only` throws outside React Server Components; the worker is plain Node. */
const serverOnlyShim = {
  name: "server-only-shim",
  setup(b) {
    b.onResolve({ filter: /^(server-only|client-only)$/ }, (args) => ({ path: args.path, namespace: "empty-module" }))
    b.onLoad({ filter: /.*/, namespace: "empty-module" }, () => ({ contents: "export {}", loader: "js" }))
  },
}

// CommonJS dependencies bundled into ESM still call require(), __dirname and __filename
const banner = [
  'import { createRequire as __dispatchCreateRequire } from "node:module";',
  'import { fileURLToPath as __dispatchFileURLToPath } from "node:url";',
  'import { dirname as __dispatchDirname } from "node:path";',
  "const require = __dispatchCreateRequire(import.meta.url);",
  "const __filename = __dispatchFileURLToPath(import.meta.url);",
  "const __dirname = __dispatchDirname(__filename);",
].join("\n")

const started = Date.now()
const result = await build({
  absWorkingDir: root,
  entryPoints: { worker: "src/worker/index.ts", migrate: "scripts/migrate.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: "tsconfig.json",
  plugins: [serverOnlyShim],
  // Optional native / unused drivers some dependencies try to load
  external: ["pg-native", "better-sqlite3", "bufferutil", "utf-8-validate", "@aws-sdk/credential-provider-sso"],
  banner: { js: banner },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.DISPATCH_VERSION": JSON.stringify(pkg.version),
  },
  sourcemap: "linked",
  minifySyntax: true,
  minifyWhitespace: true,
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
})

for (const [file, info] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith(".mjs")) console.log(`  ${file}  ${(info.bytes / 1024 / 1024).toFixed(2)} MB`)
}
console.log(`[build-worker] done in ${Date.now() - started}ms`)
