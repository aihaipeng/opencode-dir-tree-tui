/** @jsxImportSource @opentui/solid */

import { For, Show, createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import { spawn } from "node:child_process"
import type { Plugin } from "@opencode/plugin/tui"
import { MouseButton, RGBA } from "@opentui/core"
import type { MouseEvent } from "@opentui/core"
import type { GitStatus, TreeStore, TreeNode } from "../tree"

/** Nested semantic tokens replaced V1's flat TuiThemeCurrent. */
type Theme = Plugin.Context["theme"]
type ThemeMode = Plugin.Context["themeMode"]

/**
 * Fixed directory blue, following the ls / file-manager convention. Same
 * fixed-color rationale as GIT_STATUS_COLORS below: directories must stay
 * recognizable under every theme and never collide with the green/yellow/red
 * git states. Dark uses VS Code's classic blue, light GitHub's accent blue —
 * mid-tone values proven readable on their backgrounds (not neon, not muddy).
 */
export const DIR_COLORS: Record<ThemeMode, RGBA> = {
  dark: RGBA.fromHex("#569cd6"),
  light: RGBA.fromHex("#0969da"),
}

/**
 * Fixed VS Code Git status colors (added = green, modified = yellow,
 * deleted = red), not theme feedback tokens: states must stay recognizable
 * under every theme. Dark uses the bright VS Code family values; light the
 * official light gitDecoration defaults.
 */
export const GIT_STATUS_COLORS: Record<ThemeMode, Record<GitStatus, RGBA>> = {
  dark: {
    added: RGBA.fromHex("#73c991"),
    modified: RGBA.fromHex("#cca700"),
    deleted: RGBA.fromHex("#f14c4c"),
  },
  light: {
    added: RGBA.fromHex("#388138"),
    modified: RGBA.fromHex("#895503"),
    deleted: RGBA.fromHex("#ad0707"),
  },
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
  themeMode: Accessor<ThemeMode>
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
    // Directories use the fixed blue above (text.muted proved too dim to
    // separate from the background); files in the base text color, fixed
    // VS Code git colors on top.
    if (node.isDir) return DIR_COLORS[props.themeMode()]
    const status = props.store.gitStatus(node)
    return status ? GIT_STATUS_COLORS[props.themeMode()][status] : t.text.base
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

  const title = () => (props.collapsed() ? "▶ Dir Tree" : "▼ Dir Tree")

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
