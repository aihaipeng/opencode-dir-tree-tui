# opencode-dir-tree

English | [简体中文](README.zh-CN.md)

An [OpenCode](https://opencode.ai) TUI plugin that adds a VS Code-style file tree to the right sidebar: click directories to expand/collapse, right-click (or Ctrl+click) to open files and folders with the system default program, and files are colored by their git status.

## Features

- File tree in the session sidebar, lazily loaded per directory (`file.list`, server-side `.gitignore` filtering)
- Directories sort first, then files, both alphabetically
- Git status coloring: `M` modified (yellow), `A` added (green), `D` deleted (red) — status letter shown as a row prefix; non-git repos stay uncolored
- Right-click a file to open it in your default editor, right-click a directory to open it in your file explorer (`start` / `open` / `xdg-open`)
- Ctrl+click works as an equivalent shortcut
- Collapsible panel header; collapsed state and expanded directories persist across restarts (plugin kv)
- Refreshes on OpenCode events (`file.watcher.updated`, `message.updated`, `session.updated`, workspace events) plus a 10s fallback poll (paused while the panel is collapsed, refreshes immediately on re-expand)
- Deleted/renamed directories are detected via a local filesystem check and removed silently — no error spam

## Requirements

- OpenCode with TUI plugin support (`slots.sidebar_content`); tested on 1.18.x
- [Bun](https://bun.sh) to build
- Git in the project for status coloring (optional — the tree works without it)

## Installation

This is a **TUI plugin**, so it must be configured in `~/.config/opencode/tui.json`, not in `opencode.json`.

### 1. Build the plugin

```bash
git clone <this-repo>
cd opencode-dir-tree
bun install
bun run build
```

That produces `dist/tui.js`.

### 2. Register it in OpenCode

Add the built file (absolute path) to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\path\\to\\opencode-dir-tree\\dist\\tui.js"
  ]
}
```

Keep any existing entries in the `plugin` array — it can hold multiple plugins.

### 3. Restart OpenCode

TUI plugins are loaded at startup; there is no hot reload. Restart `opencode` after building or updating.

## Usage

| Action | Result |
| --- | --- |
| Click a directory | Expand / collapse it |
| Click a file | Nothing (by design) |
| Right-click a file | Open in default text editor |
| Right-click a directory | Open in file explorer |
| Ctrl+click file / directory | Same as right-click |
| Click the `File Tree` header | Collapse / expand the panel |

## How it works

- Registers a `sidebar_content` slot via the OpenCode TUI plugin API (`@opencode-ai/plugin/tui`), slot `order: 260` (between the built-in `MCP` at 200 and `LSP` at 300)
- Directory listings come from OpenCode itself via `client.file.list({ path })`, lazily per expanded directory; nodes flagged `ignored` are hidden
- Git status comes from `client.file.status()` and is matched to rows by absolute path
- Refresh sources: `workspace.ready`, `worktree.ready`, `project.updated`, `file.watcher.updated`, `message.updated`, `session.updated` (debounced) + a 10s poll as a safety net
- Refreshes swap data in place, so the tree does not flicker on each poll
- The first failed `file.status()` call disables git polling (non-git repos stay quiet)

## Troubleshooting

- **No `File Tree` section**: check the path in `tui.json` is absolute and correct, then restart. `opencode --pure` skips all external plugins.
- **Ctrl+click does nothing**: some terminals do not forward the Ctrl modifier over the mouse protocol. Use right-click instead — it needs no modifier keys.
- **No git colors**: the project is not a git repository (or `git` is unavailable). This is silent by design.
- **Stale tree after editing files outside OpenCode**: wait for the 10s poll, or collapse and re-expand the panel.

## Development

```bash
bun run build      # bundle to dist/tui.js + declarations
bun run typecheck  # tsc --noEmit
```

Source layout:

- `src/tui.tsx` — plugin entry: slot registration, event wiring, poll, kv persistence
- `src/tree.ts` — tree model: lazy loading, expansion state, git status map, row flattening
- `src/components/dir-tree-panel.tsx` — panel rendering and mouse interaction
- `src/open-file.ts` — cross-platform "open with default program"
