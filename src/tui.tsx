/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui"
import { TreeStore, resolveHiddenDirs } from "./tree"
import { DirTreePanel } from "./components/dir-tree-panel"

type Context = Plugin.Context

const STORAGE_PANEL = "dir-tree.panel"
const AUTO_REFRESH_MS = 10_000

export default Plugin.define({
  id: "opencode-dir-tree-tui",
  setup(context: Context) {
    const store = new TreeStore(context, resolveHiddenDirs(context.options))
    const [panel, updatePanel] = context.storage.store(STORAGE_PANEL, {
      initial: { collapsed: false },
    })
    const collapsed = () => panel.collapsed

    const unregisters = [
      // V2 replaced V1's workspace.ready/worktree.ready with server.connected;
      // project.updated kept its name and file.watcher.updated became
      // filesystem.changed ({ file, event: "add"|"change"|"unlink" }).
      context.data.on("server.connected", () => store.scheduleRefresh(0)),
      context.data.on("project.updated", () => store.scheduleRefresh(400)),
      context.data.on("filesystem.changed", () => store.scheduleRefresh(400)),
    ]

    // Fallback: poll regularly so external changes (e.g. files removed or
    // edited outside opencode) surface even when watchers miss them. Skipped
    // while the panel is collapsed to avoid pointless requests.
    const autoRefresh = setInterval(() => {
      if (!collapsed()) store.scheduleRefresh(200)
    }, AUTO_REFRESH_MS)

    // Initial load. The location may not be synced yet; the events above
    // re-schedule.
    void store.refreshAll()

    const unregisterSlot = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <DirTreePanel
          store={store}
          theme={() => context.theme}
          collapsed={collapsed}
          onToggle={() => {
            const next = !collapsed()
            void updatePanel((draft) => {
              draft.collapsed = next
            })
            // Collapsed panel skips polling; refresh now so reopening
            // shows current state instead of waiting for the next tick.
            if (!next) store.scheduleRefresh(0)
          }}
        />
      ),
    })

    return () => {
      clearInterval(autoRefresh)
      store.dispose()
      unregisterSlot()
      for (const unregister of unregisters) unregister()
    }
  },
})
