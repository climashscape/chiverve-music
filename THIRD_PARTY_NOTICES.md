# 第三方组件与许可清单

本文件汇总**随本仓库源码分发的第三方内容**及其许可与出处。目的是让「我们用了别人的东西」这件事有据可查、署名齐全。

范围约定：npm 依赖（Electron、Vue、webpack、vitest 等）的许可文本随各自包分发（`node_modules/<包>/LICENSE*`），**不在本清单里重复抄录**；本清单只列**入库进本仓库**的第三方内容。本仓库的许可与署名底线见 `AGENTS.md` §8/§9。

> 说明：本仓库**不对外发布任何打包版**（只发源码，见 `docs/adr/0008-research-only-no-packaged-releases.md`）。下表标注「随应用分发」的项，指的是**维护者本机自打自用的包**会把它们打进去。

## 1. Agent Skills（`.agents/skills/`）

| 项 | 内容 |
|---|---|
| 许可 | **MIT** |
| 版权 | `Copyright (c) 2026 Matt Pocock` |
| 来源 | [`mattpocock/skills`](https://github.com/mattpocock/skills)（"Skills For Real Engineers"），安装于 2026-09-22，源 commit `c55ee46073ed923f86ce59a5eb3b6d895095d1b7`，整目录复制、未做本地修改 |
| 许可全文 | [`.agents/skills/LICENSE`](./.agents/skills/LICENSE)（上游原文） |
| 装了什么 / 跳过什么 | [`.agents/skills/README.md`](./.agents/skills/README.md) |
| 是否随应用分发 | 否（只存在于源码库，不进打包产物） |

**更新该目录时必须同步核对并保留 `LICENSE`**（步骤见 `.agents/skills/README.md` 的「更新方式」）。

## 2. better-sqlite3 预编译二进制（`build-config/lib/*.node`）

| 项 | 内容 |
|---|---|
| 许可 | **MIT**（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)） |
| 文件 | `better_sqlite3_linux-x64.node`、`linux-arm64.node`、`linux-arm.node`、`win32-x64.node`、`win32-ia32.node`（共 5 个，约 9 MB） |
| 用途 | `build-config/deps.js` 的 `copyLib()`：把对应平台的预编译件覆盖到 `node_modules/better-sqlite3/build/Release/`，从而**跳过 node-gyp 本地编译**（这也是 `npm i` 那两条坑的成因与对策，见 `docs/agents/pitfalls.md` 坑 3） |
| 性质 | 随仓库入库的**便利副本**，不是修改版；使用方可自行忽略它们、按 better-sqlite3 官方方式从源码编译 |
| 是否随应用分发 | 是（经 `files` 白名单进 asar） |

## 3. 上游打过补丁的 fork 依赖（`package.json` 的 5 个 `github:lyswhut/*`）

| 包 | 许可 | 用途 |
|---|---|---|
| [`needle`](https://github.com/lyswhut/needle) | MIT | `musicSdk/**` 的请求层（支持 `cancelHttp`） |
| [`spinnies`](https://github.com/lyswhut/spinnies) | MIT | 构建期终端进度显示 |
| [`webpack-hot-middleware`](https://github.com/lyswhut/webpack-hot-middleware) | MIT | `npm run dev` 热更新 |
| [`electron-devtools-installer`](https://github.com/lyswhut/electron-devtools-installer) | MIT | 装 devtools 扩展 |
| [`eslint-formatter-friendly`](https://github.com/lyswhut/eslint-friendly-formatter) | MIT | `npm run lint` 的输出格式 |

这几条按 GitHub 引用（`github:lyswhut/<repo>#<commit>`）拉取，**不是** npm registry 上的官方包——上游对它们打了本项目需要的补丁，换成 npm 官方版会破坏构建（理由见 `AGENTS.md` §11）。各自的许可文本随包下载，位于 `node_modules/<包>/LICENSE`。

## 4. LX Music 桌面版（本仓库的上游本体）

| 项 | 内容 |
|---|---|
| 许可 | **Apache-2.0** + 上游补充条款（禁止违法使用、非商业性质、版权数据 24 小时内清除等） |
| 作者 | [lyswhut](https://github.com/lyswhut)（中文署名「落雪无痕」）—— [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) |
| 基线 | tag `v2.12.6`，commit `ad95d509`，整树复制建立本仓库 |
| 许可全文 | [`LICENSE`](./LICENSE)（Apache-2.0 原文）、[`licenses/license_zh.txt`](./licenses/license_zh.txt)、[`licenses/license_en.txt`](./licenses/license_en.txt)、[`licenses/license.rtf`](./licenses/license.rtf) |
| 上游变更记录 | [`CHANGELOG.md`](./CHANGELOG.md)（上游原文，用来解释代码为何长这样，**不要删**） |
| 是否随应用分发 | 是（`LICENSE` 与 `licenses/` 经 `build-pack.js` 的 `extraResources` 打进包；`license.rtf` / `license_zh.txt` 同时用作安装器协议文本） |

**上游署名与协议全文完整保留**是本仓库不可回退的红线（`AGENTS.md` §9）；`components/layout/PactModal.vue` 内的协议原文与 i18n 里的 `download_lxlyric*` 词条同理，不得改。

## 5. 其他

- **图标**：应用图标与托盘图标为**本仓库自绘的占位版本**——三个 SVG 源（`resources/icons/app-icon.svg`、`app-icon-compact.svg`、`tray-glyph.svg`）配重建脚本 `resources/icons/make-icons.sh`，产物是 `resources/icons/*.png|.ico|.icns` 与 `src/static/images/tray/*`（16 个）。不来自第三方；怎么换见 `resources/icons/README.md`。
- **字体 / 图片 / 音效**等运行期资源：沿用上游（上游补充条款 §4.1 已声明「部分资源来源于互联网，如出现侵权可联系移除」）。
- 若发现本清单遗漏了某项入库的第三方内容，**欢迎开 Issue 指出**（见 `README.md` 的协作口径）。
