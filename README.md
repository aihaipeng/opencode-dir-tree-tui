# opencode-dir-tree-tui

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

An [OpenCode](https://opencode.ai) TUI plugin that adds a VS Code-style file tree to the right sidebar: expand/collapse directories, open files and folders with the system default program, and see git status at a glance.

![demo](assets/demo.gif)

## ✨ Features

- ↕️ Directories sort first, then files — both alphabetically
- 🎨 Git status coloring: added (green), modified (yellow), deleted (red); non-git projects stay uncolored
- 🧹 Opt-in hiding: only names listed in `hiddenDirs` are hidden — nothing by default
- 🖱️ Right-click (or Ctrl+click) opens files in your editor / directories in your file explorer
- 📁 Collapsible panel; expanded directories and panel state persist across restarts
- 🔄 Auto-refreshes on file changes, including edits made outside OpenCode
- 🔔 Update notifications with the exact cache directory to delete

## ⚙️ Configuration

The tree shows everything OpenCode's file API returns — including gitignored files. The only hiding is what you declare yourself: whatever names you put in `hiddenDirs` gets hidden (exact match, any depth).

Reference config (paste as-is; omitting `hiddenDirs` or leaving it empty hides nothing):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["opencode-dir-tree-tui", { "hiddenDirs": ["node_modules", "__pycache__", ".git"] }]
  ]
}
```

- Restart `opencode` after changing the config.
- Note: a few system entries (e.g. Windows junction links like `Application Data`) are filtered by OpenCode's server itself and never reach the plugin.

## 📦 Installation

This is a **TUI plugin**: it goes into `~/.config/opencode/tui.json`, not `opencode.json`.

### Option 1: let your agent do it (recommended)

Paste this into OpenCode, or any LLM agent:

```text
Install the opencode-dir-tree-tui plugin by following the instructions here:
https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.md
```

### Option 2: from npm

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["opencode-dir-tree-tui", { "hiddenDirs": [] }]
  ]
}
```

No manual steps — OpenCode fetches npm plugins itself at startup. Keep existing entries; the array holds multiple plugins. Loading-screen hang? See Troubleshooting.

### Option 3: build from source

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run build
```

Then register the absolute path of `dist/tui.js` in `plugin` the same way as Option 2 (e.g. `"C:\\path\\to\\opencode-dir-tree-tui\\dist\\tui.js"`).

### ⬆️ Updating

- **npm install**: restart `opencode`; plugins re-resolve at startup. If the old version is still loaded, delete `~/.cache/opencode/packages/opencode-dir-tree-tui@latest/` and restart again.
- **Local install**: `git pull`, then `bun install && bun run build`, then restart.

No hot reload — restart `opencode` after installing, updating, or changing config.

### 🤖 For LLM Agents

<details>
<summary>Step-by-step instructions when an AI agent is doing the install</summary>

1. Don't ask the user to install Bun — OpenCode installs npm plugins with its own embedded runtime. Startup hang: run `opencode --print-logs`; if package resolution is stuck, delete `~/.cache/opencode/` and retry.
2. Edit `~/.config/opencode/tui.json` (create if missing) — TUI plugins go here, never `opencode.json`.
3. Add the plugin as a `[name, options]` tuple (a plain string works too), keeping existing entries:

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": [["opencode-dir-tree-tui", { "hiddenDirs": [] }]]
   }
   ```

4. No manual `npm install` / `bun add` — OpenCode fetches npm plugins itself at startup.
5. Restart `opencode` (no hot reload). A `File Tree` section in the right sidebar means it worked.

</details>

## 🚀 Usage

| Action | Result |
| --- | --- |
| Click a directory | Expand / collapse it |
| Right-click a file / directory | Open in default text editor / file explorer |
| Ctrl+click file / directory | Same as right-click |
| Click the `File Tree` header | Collapse / expand the panel |

## 🛠️ Troubleshooting

- **TUI stuck on the loading screen**: the embedded runtime is likely stuck resolving the package (proxies / slow networks). Run `opencode --print-logs`; if stuck, delete `~/.cache/opencode/` and retry, or build from source.
- **No `File Tree` section**: check the path in `tui.json` is absolute and correct, then restart. `opencode --pure` skips all external plugins — handy to isolate the cause.
- **Ctrl+click does nothing**: some terminals don't forward the Ctrl modifier over the mouse protocol. Use right-click.
- **No git colors**: the project is not a git repository (or `git` is unavailable). Silent by design.

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
├── tree.ts                        # Tree model: lazy loading, git status, hidden dirs, sorting
└── components/
    └── dir-tree-panel.tsx         # Panel rendering, mouse interaction, open-with-default-program
```

If you find this useful, consider giving it a ⭐ — it helps others discover this plugin.

## 📄 License

[MIT](LICENSE)
