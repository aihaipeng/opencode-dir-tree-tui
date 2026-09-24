import { $ } from "bun"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { name } from "../package.json"

const sandbox = await mkdtemp(join(process.cwd(), "node_modules", ".package-test-"))
try {
  const packed = await $`npm pack --json --ignore-scripts --pack-destination ${sandbox}`.quiet().json()
  const installed = join(sandbox, "node_modules", name)
  await mkdir(installed, { recursive: true })
  await $`tar -xzf ${join(sandbox, packed[0].filename)} -C ${installed} --strip-components=1`
  // Preserve the node_modules path because OpenCode loads published packages there.
  await $`bun test --conditions=browser --preload @opentui/solid/runtime-plugin-support tests/panel.test.tsx`
    .env({ ...process.env, PLUGIN_TEST_ENTRY: pathToFileURL(join(installed, "tui.tsx")).href })
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
