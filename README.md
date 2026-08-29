# opencode-dir-tree-tui

English | [简体中文](README.zh-CN.md)

An [OpenCode](https://opencode.ai) TUI plugin that adds a VS Code-style file tree to the right sidebar: click directories to expand/collapse, right-click (or Ctrl+click) to open files and folders with the system default program, and files are colored by their git status.

## ✨ Features

- 🌲 VS Code-style file tree in the session sidebar
- ↕️ Directories sort first, then files, both alphabetically
- 🎨 Git status coloring: modified (yellow), added (green), deleted (red) — including nested repositories; non-git projects stay uncolored
- 🖱️ Right-click a file to open it in your default editor, right-click a directory to open it in your file explorer; Ctrl+click works as an equivalent shortcut
- 📁 Collapsible panel header; collapsed state and expanded directories persist across restarts
- 🔄 Refreshes automatically on file changes, including edits made outside OpenCode
- 🔔 Notifies you when a newer version is published, with the exact cache directory to delete — OpenCode won't pick up a new release on its own

## 📦 Installation

This is a **TUI plugin**, so it must be configured in `~/.config/opencode/tui.json`, not in `opencode.json`.

### Option A: from npm (recommended)

Add the package name to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "opencode-dir-tree-tui"
  ]
}
```

No manual install is needed — OpenCode installs npm plugins automatically with Bun at startup.

### Option B: build from source

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run build
```

That produces `dist/tui.js`. Register its absolute path in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\path\\to\\opencode-dir-tree-tui\\dist\\tui.js"
  ]
}
```

Keep any existing entries in the `plugin` array — it can hold multiple plugins.

### ⬆️ Updating

- **npm install**: just restart `opencode` — plugins are re-resolved at startup. If the old version is still loaded, delete `~/.cache/opencode/packages/opencode-dir-tree-tui@latest/` and restart again.
- **Local install**: `git pull`, then `bun install && bun run build`, then restart `opencode`.

### 🔄 Restart OpenCode

TUI plugins are loaded at startup; there is no hot reload. Restart `opencode` after installing or updating.

## 🚀 Usage

| Action | Result |
| --- | --- |
| Click a directory | Expand / collapse it |
| Click a file | Nothing (by design) |
| Right-click a file | Open in default text editor |
| Right-click a directory | Open in file explorer |
| Ctrl+click file / directory | Same as right-click |
| Click the `File Tree` header | Collapse / expand the panel |

## 🛠️ Troubleshooting

- **No `File Tree` section**: check the path in `tui.json` is absolute and correct, then restart. `opencode --pure` skips all external plugins — handy to confirm the plugin is the cause.
- **Ctrl+click does nothing**: some terminals do not forward the Ctrl modifier over the mouse protocol. Use right-click instead.
- **No git colors**: the project is not a git repository (or `git` is unavailable). This is silent by design.
- **Stale tree after editing files outside OpenCode**: wait a few seconds, or collapse and re-expand the panel.

## 🧑‍💻 Development

```bash
bun install
bun run build      # bundle to dist/tui.js + declarations
bun run typecheck  # tsc --noEmit
```

### 📂 Project structure

```text
src/
├── tui.tsx                        # Plugin entry: sidebar panel, refresh wiring, update check
├── tree.ts                        # Tree model: lazy loading, git status, row flattening
├── open-file.ts                   # Cross-platform "open with default program"
└── components/
    └── dir-tree-panel.tsx         # Panel rendering and mouse interaction
```

## 📄 License

[MIT](LICENSE)
