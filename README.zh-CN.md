# 🌳 opencode-dir-tree-tui

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/v/opencode-dir-tree-tui" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-dir-tree-tui"><img src="https://img.shields.io/npm/dm/opencode-dir-tree-tui" alt="npm downloads per month"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

给 [**OpenCode V2**](https://opencode.ai/v2/docs/) 的侧边栏加一棵文件树。展开目录、查看 Git 变更、打开文件，在终端里就能搞定。

![文件树演示](assets/demo.gif)

## ✨ 有什么好用的

- 用颜色区分文件的 Git 状态。
- 右键或 Ctrl+点击，用系统默认程序打开文件和目录。
- 按名称或 `*.log` 这样的通配符隐藏杂项。
- 自动刷新，面板可以折叠，展开过的目录也会记住。

## 📦 安装

不带版本号的安装面向 OpenCode V2。OpenCode V1 用户请继续使用 `opencode-dir-tree-tui@0.5.1`。

### 让 Agent 帮你装（推荐）

把这段话发给 OpenCode 或你常用的编程 Agent：

```text
帮我安装适用于 OpenCode V2 的 opencode-dir-tree-tui，按照这份 README 的「手动安装」部分配置，保留已有设置：
https://raw.githubusercontent.com/aihaipeng/opencode-dir-tree-tui/main/README.zh-CN.md
```

### 手动安装

把插件加进 `~/.config/opencode/cli.json`，保留已有设置：

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

OpenCode 会自动从 npm 下载，并自动重载受监控的配置改动。

## 🖱️ 怎么点

| 操作 | 效果 |
| --- | --- |
| 点击目录 | 展开 / 折叠 |
| 右键或 Ctrl+点击文件、目录 | 用系统默认程序打开 |
| 点击 `File Tree` | 收起 / 展开面板 |

## 🧹 隐藏杂项

上面配置里的 `hiddenDirs` 对**文件和目录都生效**。不写或设为 `[]`，就显示服务端返回的所有条目，包括 gitignore 忽略的文件。

| 规则 | 匹配内容 |
| --- | --- |
| `node_modules` | 名称完全相同的条目 |
| `*.log` | 以 `.log` 结尾的名称 |
| `.env*` | `.env`、`.env.local` 等 |
| `temp?` | `temp1`、`tempA` 等 |

按完整名称匹配，区分大小写，任意层级都生效。`*` 表示零个或多个字符（包括开头的点），`?` 表示一个字符；其余字符按字面匹配。不支持路径模式、否定规则、字符组或读取 `.gitignore`。隐藏只影响文件树显示。

## 🔧 几个小提示

- **没看到文件树？** 检查 OpenCode 版本和插件配置，然后重启。需要排查加载问题时，启用 `OPENCODE_LOG_LEVEL=DEBUG`，在 `~/.local/share/opencode/log/opencode.log` 中找 `stage=setup` + `opencode-dir-tree-tui`。
- **Ctrl+点击没反应？** 可能是终端不转发修饰键，试试右键。
- **没有 Git 颜色？** 检查 `git` 是否可用，以及当前目录是否在 Git 仓库里。颜色会跟随主题。
- **改动没生效？** V2 会自动重载受监控的插件和配置文件；未被监控的本地依赖可能仍需重启。

## 🛠️ 开发

想改插件代码？克隆仓库，再装好开发工具需要的 [Bun](https://bun.sh)：

```bash
git clone https://github.com/aihaipeng/opencode-dir-tree-tui.git
cd opencode-dir-tree-tui
bun install
bun run typecheck
bun run test
```

OpenCode 会直接编译 TSX，并重载受监控的文件。改动没被检测到时，再重启确认。测试覆盖树状态、通配符过滤和无界面鼠标交互。

[插件安装说明](https://opencode.ai/v2/docs/cli/plugins) · [V2 插件 API](https://opencode.ai/v2/docs/build/plugins/cli) · [MIT 许可证](LICENSE)
