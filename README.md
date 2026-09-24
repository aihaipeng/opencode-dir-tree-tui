# 🌳 opencode-dir-tree-tui

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads per month"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

A little file tree for your [**OpenCode V2**](https://opencode.ai/v2/docs/) sidebar. Expand folders, spot Git changes, and open files without leaving the terminal.

![File tree demo](assets/demo.gif)

## ✨ What you get

- See file Git status at a glance with color highlights.
- Right-click or Ctrl+click to open files and folders in their default apps.
- Hide clutter with names or wildcards like `*.log`.
- Automatic refresh, a collapsible panel, and remembered folder expansion.

## 📦 Install

Unversioned installs target OpenCode V2. OpenCode V1 users should stay on `opencode-dir-tree-tui@0.5.1`.

### Let your Agent do it (recommended)

Paste this into OpenCode or your favorite coding Agent:

```text
Install opencode-dir-tree-tui for OpenCode V2 using the manual installation section in this README. Preserve my existing configuration:
https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.md
```

### Manual installation

Add this plugin to `~/.config/opencode/cli.json`, keeping your existing settings:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "opencode-dir-tree-tui",
      "options": {
        "hiddenDirs": ["node_modules", "__pycache__", "*.pyc"]
      }
    }
  ]
}
```

OpenCode handles the npm download and reloads watched configuration changes.

## 🖱️ Click around

| Action | What happens |
| --- | --- |
| Click a folder | Expand / collapse |
| Right-click or Ctrl+click a file or folder | Open with the system default app |
| Click `File Tree` | Fold / unfold the panel |

## 🧹 Hide the clutter

`hiddenDirs` in the config above works for **both files and folders**. Leave it out or use `[]` to show everything the server returns, including gitignored files.

| Rule | Matches |
| --- | --- |
| `node_modules` | That exact name |
| `*.log` | Names ending in `.log` |
| `.env*` | `.env`, `.env.local`, … |
| `temp?` | `temp1`, `tempA`, … |

Rules match the whole name, at any depth, and are case-sensitive. `*` means zero or more characters (including a leading dot); `?` means one. Everything else is literal — no path patterns, negation, character classes or `.gitignore` loading. This only hides entries in the tree.

## 🔧 A few tips

- **No tree?** Check your OpenCode version and plugin configuration, then restart. For loading details, enable `OPENCODE_LOG_LEVEL=DEBUG` and look for `stage=setup` + `opencode-dir-tree-tui` in `~/.local/share/opencode/log/opencode.log`.
- **Ctrl+click not working?** Your terminal may not send the modifier. Try right-click.
- **No Git colors?** Check that `git` is available and you're inside a Git repo. Colors follow your theme.
- **Changes not showing up?** V2 reloads watched plugin/config files. Unwatched local dependencies may still need a restart.

## 🛠️ Development

Working on the plugin? Clone the repo and install [Bun](https://bun.sh) for the development tools:

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run typecheck
bun run test
bun run test:package
```

Build before loading this repository as a local plugin: `bun run build`. Published packages include precompiled Solid code so OpenCode can update the tree after a click. `bun run test:package` checks the actual npm tarball from a `node_modules` path.

[Plugin installation](https://opencode.ai/v2/docs/cli/plugins) · [V2 plugin API](https://opencode.ai/v2/docs/build/plugins/cli) · [MIT license](LICENSE)
