# opencode-dir-tree-tui

[English](README.md) | 简体中文

一个 [OpenCode](https://opencode.ai) TUI 插件：在右侧边栏增加 VS Code 风格的文件树，点击目录展开/折叠，右键（或 Ctrl+点击）用系统默认程序打开文件和文件夹，文件按 git 状态着色。

## ✨ 功能

- 🌲 会话侧边栏 VS Code 风格文件树，目录按需加载
- ↕️ 目录排前、文件排后，各自按名称排序
- 🎨 git 状态着色：修改（黄）、新增（绿）、删除（红）；非 git 项目不着色
- 🖱️ 右键文件用默认编辑器打开，右键目录打开文件资源管理器；Ctrl+点击等效
- 📁 面板头可折叠，折叠状态与展开目录跨重启保留
- 🔄 文件变更自动刷新，外部编辑也能同步

## 📦 安装

这是 **TUI 插件**，必须配置在 `~/.config/opencode/tui.json`，不是 `opencode.json`。

### 方式一：npm 安装（推荐）

在 `~/.config/opencode/tui.json` 中写入包名：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "opencode-dir-tree-tui"
  ]
}
```

无需手动安装——OpenCode 启动时会用 Bun 自动安装 npm 插件。

### 方式二：源码构建

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run build
```

产出 `dist/tui.js`。在 `~/.config/opencode/tui.json` 中注册其绝对路径：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\path\\to\\opencode-dir-tree-tui\\dist\\tui.js"
  ]
}
```

`plugin` 数组可同时装多个插件，保留已有条目即可。

### ⬆️ 更新

- **npm 安装**：重启 `opencode` 即可——启动时会重新解析插件版本。若仍加载旧版，删除 `~/.cache/opencode/node_modules/` 后再重启。
- **本地安装**：`git pull` → `bun install && bun run build` → 重启 `opencode`。

### 🔄 重启 OpenCode

TUI 插件随启动加载，无热重载。安装或更新后请重启 `opencode`。

## 🚀 使用

| 操作 | 效果 |
| --- | --- |
| 点击目录 | 展开 / 折叠 |
| 点击文件 | 无操作（设计如此） |
| 右键文件 | 用默认编辑器打开 |
| 右键目录 | 打开文件资源管理器 |
| Ctrl+点击 文件 / 目录 | 同右键 |
| 点击 `File Tree` 标题 | 折叠 / 展开面板 |

> 💡 git 着色是可选的——没有 git 文件树照样可用。

## 🛠️ 故障排查

- **没有 `File Tree` 区块**：检查 `tui.json` 路径为绝对路径且正确，然后重启。`opencode --pure` 会跳过所有外部插件，可用来确认问题是否出在插件上。
- **Ctrl+点击无反应**：部分终端不转发 Ctrl 修饰键，请改用右键。
- **没有 git 着色**：项目不是 git 仓库（或 `git` 不可用），设计上保持静默。
- **在 OpenCode 外部编辑文件后树未更新**：稍等几秒，或折叠再展开面板。

## 🧑‍💻 开发

```bash
bun install
bun run build      # 打包到 dist/tui.js + 声明
bun run typecheck  # tsc --noEmit
```

### 📂 源码结构

```text
src/
├── tui.tsx                        # 插件入口：侧边栏插槽、刷新接线、持久化
├── tree.ts                        # 树模型：懒加载、git 状态、行展平
├── open-file.ts                   # 跨平台「用默认程序打开」
└── components/
    └── dir-tree-panel.tsx         # 面板渲染与鼠标交互
```

## 📄 许可证

[MIT](LICENSE)
