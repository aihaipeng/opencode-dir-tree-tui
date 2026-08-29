/** @jsxImportSource @opentui/solid */

import { For, Show, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { MouseButton } from "@opentui/core"
import type { MouseEvent, RGBA } from "@opentui/core"
import type { GitStatus, TreeStore, TreeNode } from "../tree"
import { openPath } from "../open-file"

type ThemeColor = keyof TuiThemeCurrent

const GIT_STATUS_LAYOUT: Record<GitStatus, { mark: string; color: ThemeColor }> = {
  added: { mark: "A", color: "success" },
  deleted: { mark: "D", color: "error" },
  modified: { mark: "M", color: "warning" },
}

interface DirTreePanelProps {
  store: TreeStore
  theme: Accessor<TuiThemeCurrent>
  collapsed: Accessor<boolean>
  onToggle: () => void
}

export function DirTreePanel(props: DirTreePanelProps) {
  const [panelWidth, setPanelWidth] = createSignal(0)
  let panelBox: { width: number } | undefined

  const rows = createMemo(() => props.store.visibleRows())
  const loadError = createMemo(() => props.store.errorSignal()())
  const expanded = (path: string) => props.store.isExpanded(path)
  const theme = () => props.theme()

  const truncate = (label: string, maxWidth: number): string => {
    if (maxWidth <= 0 || label.length <= maxWidth) return label
    const ellipsis = "..."
    if (maxWidth <= ellipsis.length) return ellipsis.slice(0, maxWidth)
    return `${label.slice(0, maxWidth - ellipsis.length)}${ellipsis}`
  }

  const rowText = (node: TreeNode, depth: number): string => {
    const indent = "  ".repeat(depth)
    const marker = node.isDir ? (expanded(node.path) ? "▾ " : "▸ ") : "  "
    const statusMark = node.isDir ? " " : gitMark(node)
    const budget = Math.max(1, panelWidth() - indent.length)
    return indent + marker + statusMark + truncate(node.name, budget - marker.length - 1)
  }

  const gitMark = (node: TreeNode): string => {
    const status = props.store.gitStatus(node)
    return status ? GIT_STATUS_LAYOUT[status].mark : " "
  }

  const rowColor = (node: TreeNode): RGBA => {
    const t = theme()
    if (node.isDir) return t.secondary
    const status = props.store.gitStatus(node)
    return status ? (t[GIT_STATUS_LAYOUT[status].color] as RGBA) : t.text
  }

  const open = (node: TreeNode) => {
    if (!openPath(node.absolute)) return
    props.store.api.ui.toast({
      variant: "info",
      title: "Dir Tree",
      message: `Opened ${node.name}`,
      duration: 1500,
    })
  }

  const onRowMouseDown = (event: MouseEvent, node: TreeNode) => {
    // Only handle clicks inside the tree; stop the global text-selection
    // system (and its ctrl+click select-all gesture) from consuming this.
    event.preventDefault()

    if (event.button === MouseButton.RIGHT) {
      // Right-click: open with the default app (file -> editor, dir -> file explorer).
      open(node)
      return
    }

    if (event.button !== MouseButton.LEFT) return
    const ctrl = event.modifiers?.ctrl ?? false
    if (node.isDir) {
      if (ctrl) {
        // Ctrl+click a directory: open it in the file explorer.
        open(node)
        return
      }
      // Plain click: expand / collapse.
      props.store.toggle(node.path)
      return
    }
    // Ctrl+click a file: open it with the default text editor.
    if (ctrl) {
      open(node)
    }
    // Plain click on a file: no-op.
  }

  const title = () => (props.collapsed() ? "▶ File Tree" : "▼ File Tree")

  return (
    <box
      ref={(element) => {
        panelBox = element
        setPanelWidth(element.width)
      }}
      onSizeChange={() => setPanelWidth(panelBox?.width ?? 0)}
      flexDirection="column"
    >
      <box flexDirection="row" onMouseDown={props.onToggle}>
        <text style={{ fg: theme().text }}>
          <strong>{title()}</strong>
        </text>
      </box>

      <Show when={!props.collapsed()}>
        <Show when={loadError()}>
          {(error) => <text style={{ fg: theme().error }}>{error}</text>}
        </Show>

        <Show when={rows().length > 0} fallback={<text style={{ fg: theme().textMuted }}>No files listed</text>}>
          <For each={rows()}>
            {(row) => (
              <box onMouseDown={(event) => onRowMouseDown(event, row.node)} flexDirection="row">
                <text style={{ fg: rowColor(row.node) }}>
                  {rowText(row.node, row.depth)}
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>
    </box>
  )
}
