/** @jsxImportSource @opentui/solid */

import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { TreeStore } from "./tree"
import { DirTreePanel } from "./components/dir-tree-panel"

const SIDEBAR_ORDER = 260
const COLLAPSED_KEY = "opencode-dir-tree-tui.collapsed"
const AUTO_REFRESH_MS = 10_000

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
