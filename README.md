# 🌳 opencode-dir-tree-tui

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads per month"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

A little file tree for your [**OpenCode**](https://opencode.ai) sidebar. Expand folders, spot Git changes, and open files without leaving the terminal.

![File tree demo](assets/demo.gif)

## ✨ What you get

- See file Git status at a glance with color highlights.
- Right-click or Ctrl+click to open files and folders in their default apps.
- Hide clutter with names or wildcards like `*.log`.
- Automatic refresh, a collapsible panel, and remembered folder expansion.

## 📦 Install

Choose the instructions below for your installed OpenCode version. OpenCode V1 uses a pinned legacy release; V2 uses the current release.

### Let your Agent do it (recommended)

Paste this into OpenCode or your favorite coding Agent:

```text
Install opencode-dir-tree-tui using the manual installation section in this README. Check my installed OpenCode version and follow the matching instructions. Preserve my existing configuration:
https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.md
```

### Manual installation

First check the OpenCode version you use:

```bash
opencode --version
```

| OpenCode version | Plugin package | Configuration file and field |
| --- | --- | --- |
| `1.x` (V1) | `opencode-dir-tree-tui@0.5.1` | `~/.config/opencode/tui.json` → `plugin` |
| `2.x` (V2) | `opencode-dir-tree-tui` | `~/.config/opencode/cli.json` → `plugins` |

If the version cannot be determined, confirm it before editing the configuration. Merge the matching entry into your existing file, preserving other plugins and settings. If this plugin is already listed, update that entry and preserve its options instead of adding a duplicate.

#### OpenCode V2

Add the following entry to `~/.config/opencode/cli.json`:

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

#### OpenCode V1

Add the pinned version and its options as a nested array in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "opencode-dir-tree-tui@0.5.1",
      {
        "hiddenDirs": ["node_modules", "__pycache__", ".git"]
      }
    ]
  ]
}
```

Restart OpenCode to download and load the plugin. Keep `@0.5.1` pinned while using V1, even if an update notice appears; an unversioned package selects the V2 release.

The usage below describes V2. V1's `hiddenDirs` matches exact names only; see the [V1 usage guide](https://github.com/aihaipeng/opencode-dir-tree-tui/blob/v0.5.1/README.md) for its features.

## 🖱️ Click around

| Action | What happens |
| --- | --- |
| Click a folder | Expand / collapse |
| Right-click or Ctrl+click a file or folder | Open with the system default app |
| Click `Dir Tree` | Fold / unfold the panel |

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
- **No Git colors?** Check that `git` is available and you're inside a Git repo. Status colors are fixed VS Code Git decoration values (green = added, yellow = modified, red = deleted) and do not follow the theme.
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
