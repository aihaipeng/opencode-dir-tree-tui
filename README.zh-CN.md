# opencode-dir-tree-tui

[English](README.md) | 简体中文

一个 [OpenCode](https://opencode.ai) TUI 插件：在右侧侧边栏添加 VS Code 风格的项目目录树——点击目录展开/折叠，右键（或 Ctrl+左键）用系统默认程序打开文件与目录，文件按 git 状态染色。

## 功能特性

- 会话侧边栏中的文件目录树，按目录懒加载（`file.list`，服务端按 `.gitignore` 过滤）
- 目录排前、文件排后，各自按字母序排列
- git 状态染色：修改（黄）、新增（绿）、删除（红）；非 git 仓库保持默认色不干扰。通过 `git status --porcelain` 实现，覆盖未跟踪与已暂存文件
- 右键文件 → 用默认文本编辑器打开；右键目录 → 打开文件资源管理器（`start` / `open` / `xdg-open`）
- Ctrl+左键为等价快捷方式
- 面板标题可折叠；折叠状态与目录展开状态跨重启持久化（插件 kv）
- 多源刷新：OpenCode 事件（`file.watcher.updated`、`message.updated`、`session.updated`、workspace 事件）+ 10 秒轮询兜底（面板折叠时暂停，重新展开立即刷新）
- 已删除/更名的目录通过本地文件系统检查静默移除——不弹错误轰炸

## 环境要求

- 支持 TUI 插件的 OpenCode（`slots.sidebar_content`）；已在 1.18.x 实测
- [Bun](https://bun.sh)，用于构建
- 项目内有 git 才有状态染色（可选——没有 git 目录树照样工作）

## 安装

这是一个 **TUI 插件**，必须配置在 `~/.config/opencode/tui.json`，而不是 `opencode.json`。

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

无需手动安装——OpenCode 启动时会用 Bun 自动安装 npm 插件（缓存在 `~/.cache/opencode/node_modules/`）。

### 方式二：源码构建

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run build
```

构建产物为 `dist/tui.js`。在 `~/.config/opencode/tui.json` 中注册其绝对路径：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "C:\\path\\to\\opencode-dir-tree-tui\\dist\\tui.js"
  ]
}
```

`plugin` 数组可以放多个插件，保留已有条目即可。

### 重启 OpenCode

TUI 插件只在启动时加载，没有热更新。安装或更新插件后需要重启 `opencode`。

## 使用

| 操作 | 效果 |
| --- | --- |
| 单击目录 | 展开 / 折叠 |
| 单击文件 | 无操作（刻意设计） |
| 右键文件 | 用默认文本编辑器打开 |
| 右键目录 | 打开文件资源管理器 |
| Ctrl+左键 文件 / 目录 | 等价于右键 |
| 单击 `File Tree` 标题 | 折叠 / 展开整个面板 |

## 工作原理

- 通过 OpenCode TUI 插件 API（`@opencode-ai/plugin/tui`）注册 `sidebar_content` 插槽，`order: 260`（位于内置 `MCP`（200）与 `LSP`（300）之间）
- 目录列表来自 OpenCode 自身的 `client.file.list({ path })`，按展开目录懒加载；标记为 `ignored` 的节点不显示
- git 状态来自 `client.file.status()`，按绝对路径匹配到树行
- 刷新来源：`workspace.ready`、`worktree.ready`、`project.updated`、`file.watcher.updated`、`message.updated`、`session.updated`（去抖）+ 10 秒轮询兜底
- 刷新采用原位替换（in-place），轮询不会导致树闪动
- `file.status()` 首次失败即停用 git 轮询（非 git 仓库保持安静）

## 常见问题

- **没有 `File Tree` 区块**：检查 `tui.json` 里的路径是否为正确的绝对路径，然后重启。`opencode --pure` 会跳过所有外部插件。
- **Ctrl+左键无反应**：部分终端不通过鼠标协议转发 Ctrl 修饰键。改用右键——无需任何修饰键。
- **没有 git 染色**：项目不是 git 仓库（或 `git` 不可用）。这是刻意设计的静默行为。
- **在 OpenCode 之外改了文件，树没更新**：等 10 秒轮询，或折叠再展开面板。

## 开发

```bash
bun run build      # 打包到 dist/tui.js + 类型声明
bun run typecheck  # tsc --noEmit
```

源码结构：

- `src/tui.tsx` — 插件入口：插槽注册、事件接线、轮询、kv 持久化
- `src/tree.ts` — 树模型：懒加载、展开状态、git 状态映射、行扁平化
- `src/components/dir-tree-panel.tsx` — 面板渲染与鼠标交互
- `src/open-file.ts` — 跨平台"用系统默认程序打开"

## 许可证

[MIT](LICENSE)
