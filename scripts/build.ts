import solidPlugin from "@opentui/solid/bun-plugin"

// OpenCode 2.0.16 skips Solid's TSX transform inside node_modules.
// Compile JSX before publishing; share all runtime dependencies with the host.
const result = await Bun.build({
  entrypoints: ["src/tui.tsx"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  packages: "external",
  plugins: [solidPlugin],
})

if (!result.success) throw new AggregateError(result.logs, "TUI build failed")
