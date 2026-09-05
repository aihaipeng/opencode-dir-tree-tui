# opencode-dir-tree-tui

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

一个 [OpenCode](https://opencode.ai) TUI 插件：在右侧边栏增加 VS Code 风格的文件树，点击目录展开/折叠，右键（或 Ctrl+点击）用系统默认程序打开文件和文件夹，文件按 git 状态着色。

![demo](assets/demo.gif)

## ✨ 功能

- 🌲 会话侧边栏 VS Code 风格文件树
- ↕️ 目录排前、文件排后，各自按名称排序
- 🎨 git 状态着色：修改（黄）、新增（绿）、删除（红），嵌套仓库同样生效；非 git 项目不着色
- 🖱️ 右键文件用默认编辑器打开，右键目录打开文件资源管理器；Ctrl+点击等效
- 📁 面板头可折叠，折叠状态与展开目录跨重启保留
- 🔄 文件变更自动刷新，外部编辑也能同步
- 🔔 有新版本发布时提醒你，并给出需要删除的缓存目录——OpenCode 自己不会接住新版本

## 📦 安装

这是 **TUI 插件**，必须配置在 `~/.config/opencode/tui.json`，不是 `opencode.json`。

### 方式一：让 AI agent 代装（推荐）

把下面这段话粘贴给 OpenCode 或任意 LLM agent：

```text
按照 https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.md 的说明，安装 opencode-dir-tree-tui 插件。
```

### 方式二：npm 安装

在 `~/.config/opencode/tui.json` 中写入包名：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "opencode-dir-tree-tui"
  ]
}
```

OpenCode 启动时会自动安装 npm 插件，**依赖 [Bun](https://bun.sh)**——`PATH` 中必须有 Bun。缺少时安装会静默失败，TUI 可能一直卡在加载页（见下方故障排查）。用 `bun --version` 检查；没有先安装：`curl -fsSL https://bun.sh/install | bash`（macOS/Linux）。

### 方式三：源码构建

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

- **npm 安装**：重启 `opencode` 即可——启动时会重新解析插件版本。若仍加载旧版，删除 `~/.cache/opencode/packages/opencode-dir-tree-tui@latest/` 后再重启。
- **本地安装**：`git pull` → `bun install && bun run build` → 重启 `opencode`。

### 🔄 重启 OpenCode

TUI 插件随启动加载，无热重载。安装或更新后请重启 `opencode`。

### 🤖 给 LLM Agent 的说明

<details>
<summary>AI agent 代装时按以下步骤执行</summary>

1. 检查 Bun：`bun --version`。若未安装，先从 <https://bun.sh> 安装——缺少 Bun 时 npm 自动安装会静默失败，TUI 会卡在加载页。
2. 读取 `~/.config/opencode/tui.json`（不存在则创建）。这是 **TUI 插件**：必须写入 `tui.json`，绝不写入 `opencode.json`。
3. 将 `"opencode-dir-tree-tui"` 加入 `plugin` 数组，保留已有条目：

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": ["opencode-dir-tree-tui"]
   }
   ```

4. 不要手动执行 `npm install` / `bun add`——OpenCode 启动时会自行拉取 npm 插件。
5. 提醒用户重启 `opencode`（无热重载）。右侧边栏出现 `File Tree` 区块即安装成功。

</details>

## 🚀 使用

| 操作 | 效果 |
| --- | --- |
| 点击目录 | 展开 / 折叠 |
| 点击文件 | 无操作（设计如此） |
| 右键文件 | 用默认编辑器打开 |
| 右键目录 | 打开文件资源管理器 |
| Ctrl+点击 文件 / 目录 | 同右键 |
| 点击 `File Tree` 标题 | 折叠 / 展开面板 |

## 🛠️ 故障排查

- **添加 npm 插件后 TUI 卡在加载页**：自动安装依赖 `PATH` 中的 Bun，缺失时会静默失败。用 `bun --version` 检查；安装 Bun，或改用方式三（源码构建），然后重启 `opencode`。
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
├── tui.tsx                        # 插件入口：侧边栏面板、刷新接线、版本检查
├── tree.ts                        # 树模型：懒加载、git 状态、行展平
├── open-file.ts                   # 跨平台「用默认程序打开」
└── components/
    └── dir-tree-panel.tsx         # 面板渲染与鼠标交互
```

如果这个插件对你有帮助，欢迎点个 ⭐——能让更多人发现它。

## 📄 许可证

[MIT](LICENSE)
