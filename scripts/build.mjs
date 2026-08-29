import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const root = fileURLToPath(new URL("..", import.meta.url))
const version = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version
const entrypoint = fileURLToPath(new URL("../src/tui.tsx", import.meta.url))
const outdir = fileURLToPath(new URL("../dist", import.meta.url))
const outfile = fileURLToPath(new URL("../dist/tui.js", import.meta.url))
const sourcemap = fileURLToPath(new URL("../dist/tui.js.map", import.meta.url))

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const result = await Bun.build({
  entrypoints: [entrypoint],
  root,
  format: "esm",
  target: "bun",
  sourcemap: "external",
  write: false,
  plugins: [createSolidTransformPlugin()],
  define: { __PLUGIN_VERSION__: JSON.stringify(version) },
  external: ["@opencode-ai/plugin/tui", "@opentui/core", "@opentui/solid", "solid-js"],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

for (const artifact of result.outputs) {
  const destination = artifact.kind === "entry-point" ? outfile : sourcemap
  writeFileSync(destination, Buffer.from(await artifact.arrayBuffer()))
}
