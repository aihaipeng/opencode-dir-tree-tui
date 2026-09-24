/** @jsxImportSource @opentui/solid */

import { For, Show, createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import { spawn } from "node:child_process"
import type { Plugin } from "@opencode/plugin/tui"
import { MouseButton } from "@opentui/core"
import type { MouseEvent, RGBA } from "@opentui/core"
import type { GitStatus, TreeStore, TreeNode } from "../tree"

/** Nested semantic tokens replaced V1's flat TuiThemeCurrent. */
type Theme = Plugin.Context["theme"]

const GIT_STATUS_COLOR: Record<GitStatus, "success" | "error" | "warning"> = {
  added: "success",
  deleted: "error",
  modified: "warning",
}

/** Open a file or directory with the system default program. */
function openPath(absolutePath: string): boolean {
  const cmd =
    process.platform === "win32"
      ? [process.env.ComSpec ?? "cmd.exe", "/c", "start", "", absolutePath.replaceAll("/", "\\")]
      : [process.platform === "darwin" ? "open" : "xdg-open", absolutePath]
  try {
    const child = spawn(cmd[0]!, cmd.slice(1), { detached: true, stdio: "ignore" })
    // A missing opener (e.g. no xdg-open) emits 'error' async; without a
    // listener that would crash the TUI.
    child.on("error", () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

interface DirTreePanelProps {
  store: TreeStore
  theme: Accessor<Theme>
  collapsed: Accessor<boolean>
  onToggle: () => void
}

export function DirTreePanel(props: DirTreePanelProps) {
  const rows = createMemo(() => props.store.visibleRows())
  const theme = () => props.theme()

  /** indent + expand marker, then the name in one colored run. */
  const rowText = (node: TreeNode, depth: number): string => {
    const indent = "  ".repeat(depth)
    const marker = node.isDir ? (props.store.isExpanded(node.path) ? "▾ " : "▸ ") : "  "
    return indent + marker + node.name
  }

  const rowColor = (node: TreeNode): RGBA => {
    const t = theme()
    // Directories render muted (V1 used t.secondary, which has no V2
    // equivalent); files in the base text color, git feedback colors on top.
    if (node.isDir) return t.text.muted
    const status = props.store.gitStatus(node)
    return status ? t.text.feedback[GIT_STATUS_COLOR[status]].base : t.text.base
  }

  const open = (node: TreeNode) => {
    if (!openPath(node.absolute)) return
    props.store.context.ui.toast.show({
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

    if (event.button === MouseButton.RIGHT ||
      (event.button === MouseButton.LEFT && event.modifiers?.ctrl)) {
      open(node)
    } else if (event.button === MouseButton.LEFT && node.isDir) {
      props.store.toggle(node.path)
    }
  }

  const title = () => (props.collapsed() ? "▶ File Tree" : "▼ File Tree")

  return (
    <box flexDirection="column">
      <box flexDirection="row" onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        event.preventDefault()
        props.onToggle()
      }}>
        <text style={{ fg: theme().text.base }}>
          <strong>{title()}</strong>
        </text>
      </box>

      <Show when={!props.collapsed()}>
        <Show when={props.store.loadError()}>
          {(error) => <text style={{ fg: theme().text.feedback.error.base }}>{error()}</text>}
        </Show>

        <For each={rows()} fallback={<text style={{ fg: theme().text.muted }}>No files listed</text>}>
          {(row) => (
            <box onMouseDown={(event) => onRowMouseDown(event, row.node)} flexDirection="row">
              <text width="100%" wrapMode="none" truncate style={{ fg: rowColor(row.node) }}>
                {rowText(row.node, row.depth)}
              </text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
