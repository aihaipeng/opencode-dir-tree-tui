# opencode-dir-tree-tui

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

一个 [OpenCode](https://opencode.ai) TUI 插件：在右侧边栏增加 VS Code 风格的文件树，点击展开/折叠目录，右键用系统默认程序打开，git 状态一眼可见。

![demo](assets/demo.gif)

## ✨ 功能

- ↕️ 目录排前、文件排后，各自按名称排序
- 🎨 git 状态着色：新增（绿）、修改（黄）、删除（红）；非 git 项目不着色
- 🧹 剔除常见构建产物 / 依赖目录（`node_modules`、`dist`、`build` 等），即使没被 gitignore——可配置，见下文
- 🖱️ 右键（或 Ctrl+点击）用默认编辑器打开文件、打开文件资源管理器
- 📁 面板可折叠，展开目录与面板状态跨重启保留
- 🔄 文件变更自动刷新，外部编辑也能同步
- 🔔 有新版本时提醒，并给出需要删除的缓存目录

## ⚙️ 配置

常见构建产物 / 依赖目录即使没被 gitignore 也会被剔除。默认清单：

```text
node_modules  dist  build  out  target  __pycache__
```

目录名精确匹配、任意层级生效。两个可选插件选项（`~/.config/opencode/tui.json` 元组形式）都作用在默认清单之上：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    ["opencode-dir-tree-tui", { "hiddenDirs": ["logs", ".cache"], "visibleDirs": ["build"] }]
  ]
}
```

- `hiddenDirs`：额外要隐藏的目录名，合并进默认清单。
- `visibleDirs`：要重新显示的默认目录名（比如源码就叫 `build`，把它解禁）。
- 两个都不传（或插件用纯字符串形式注册）则只保留默认清单。改完配置重启 `opencode`。

## 📦 安装

这是 **TUI 插件**：必须配置在 `~/.config/opencode/tui.json`，不是 `opencode.json`。

### 方式一：让 AI agent 代装（推荐）

把下面这段话粘贴给 OpenCode 或任意 LLM agent：

```text
按照 https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.md 的说明，安装 opencode-dir-tree-tui 插件。
```

### 方式二：npm 安装

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "opencode-dir-tree-tui"
  ]
}
```

无需手动操作——OpenCode 启动时用内嵌 Bun 运行时自行拉取 npm 插件。保留 `plugin` 里的已有条目，数组可装多个插件。加载页卡住见故障排查。

### 方式三：源码构建

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run build
```

然后把 `dist/tui.js` 的绝对路径按方式二的样子写进 `plugin`（如 `"C:\\path\\to\\opencode-dir-tree-tui\\dist\\tui.js"`）。

### ⬆️ 更新

- **npm 安装**：重启 `opencode` 即可，启动时会重新解析版本。若仍加载旧版，删除 `~/.cache/opencode/packages/opencode-dir-tree-tui@latest/` 后再重启。
- **本地安装**：`git pull` → `bun install && bun run build` → 重启。

无热重载——安装、更新、改配置后都需重启 `opencode`。

### 🤖 给 LLM Agent 的说明

<details>
<summary>AI agent 代装时按以下步骤执行</summary>

1. 不要让用户安装 Bun——OpenCode 用内嵌运行时安装 npm 插件。启动卡住时运行 `opencode --print-logs` 查看依赖解析；若卡住，删除 `~/.cache/opencode/` 后重试。
2. 编辑 `~/.config/opencode/tui.json`（不存在则创建）——TUI 插件写这里，绝不写 `opencode.json`。
3. 将 `"opencode-dir-tree-tui"` 加入 `plugin` 数组，保留已有条目：

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": ["opencode-dir-tree-tui"]
   }
   ```

4. 不要手动执行 `npm install` / `bun add`——OpenCode 启动时自行拉取。
5. 重启 `opencode`（无热重载）。右侧边栏出现 `File Tree` 区块即成功。

</details>

## 🚀 使用

| 操作 | 效果 |
| --- | --- |
| 点击目录 | 展开 / 折叠 |
| 右键文件 / 目录 | 用默认编辑器打开 / 打开文件资源管理器 |
| Ctrl+点击 文件 / 目录 | 同右键 |
| 点击 `File Tree` 标题 | 折叠 / 展开面板 |

## 🛠️ 故障排查

- **TUI 卡在加载页**：多半是内嵌运行时解析依赖挂起（代理/慢网络常见）。运行 `opencode --print-logs` 观察；若卡住，删除 `~/.cache/opencode/` 后重试，或改用源码构建。
- **没有 `File Tree` 区块**：检查 `tui.json` 路径为绝对路径且正确，然后重启。`opencode --pure` 会跳过所有外部插件，可用来定位问题。
- **Ctrl+点击无反应**：部分终端不转发 Ctrl 修饰键，请改用右键。
- **没有 git 着色**：项目不是 git 仓库（或 `git` 不可用），设计上保持静默。

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
├── tree.ts                        # 树模型：懒加载、git 状态、忽略清单、排序
└── components/
    └── dir-tree-panel.tsx         # 面板渲染、鼠标交互、用默认程序打开
```

如果这个插件对你有帮助，欢迎点个 ⭐——能让更多人发现它。

## 📄 许可证

[MIT](LICENSE)
