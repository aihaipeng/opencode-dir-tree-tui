/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { TreeStore } from "./tree"
import { DirTreePanel } from "./components/dir-tree-panel"

const SIDEBAR_ORDER = 260
const COLLAPSED_KEY = "opencode-dir-tree-tui.collapsed"
const AUTO_REFRESH_MS = 10_000
const NPM_PACKAGE = "opencode-dir-tree-tui"

declare const __PLUGIN_VERSION__: string

// opencode caches npm plugins per spec and never re-resolves @latest, so a
// published update stays invisible until the user deletes the cache. Check
// the registry once at startup and point them at the cache dir.
const checkForUpdates = async (api: Awaited<Parameters<TuiPlugin>[0]>) => {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    const manifest = (await res.json()) as { version?: string }
    if (manifest.version && manifest.version !== __PLUGIN_VERSION__) {
      api.ui.toast({
        variant: "info",
        title: NPM_PACKAGE,
        message: `Version ${manifest.version} is available. Delete ~/.cache/opencode/packages/${NPM_PACKAGE}@latest and restart opencode to update.`,
        duration: 10000,
      })
    }
  } catch {
    // Offline or registry unreachable: silently skip.
  }
}

const tui: TuiPlugin = async (api) => {
  const store = new TreeStore(api)
  const [collapsed, setCollapsed] = createSignal(Boolean(api.kv.get(COLLAPSED_KEY, false)))

  const unregisters = (
    [
      ["workspace.ready", 0],
      ["worktree.ready", 0],
      ["project.updated", 400],
      ["file.watcher.updated", 400],
      ["message.updated", 500],
      ["session.updated", 500],
    ] as const
  ).map(([type, delay]) => api.event.on(type, () => store.scheduleRefresh(delay)))

  // Fallback: poll regularly so external changes (e.g. files removed or
  // edited outside opencode) surface even when watchers miss them. Skipped
  // while the panel is collapsed to avoid pointless requests.
  const autoRefresh = setInterval(() => {
    if (!collapsed()) store.scheduleRefresh(200)
  }, AUTO_REFRESH_MS)

  api.lifecycle.onDispose(() => {
    clearInterval(autoRefresh)
    store.dispose()
    for (const unregister of unregisters) unregister()
  })

  // Initial load. Workspace may not be ready yet; the ready events re-schedule.
  store.requestInitial()

  void checkForUpdates(api)

  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content: () => {
        return (
          <DirTreePanel
            store={store}
            theme={() => api.theme.current}
            collapsed={collapsed}
            onToggle={() => {
              const next = !collapsed()
              setCollapsed(next)
              api.kv.set(COLLAPSED_KEY, next)
              // Collapsed panel skips polling; refresh now so reopening
              // shows current state instead of waiting for the next tick.
              if (next) store.scheduleRefresh(0)
            }}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-dir-tree-tui",
  tui,
}

export default plugin
