# resources/icons —— 应用图标与图标源（**占位版**）

本目录的图标是**占位图标**（2026-09-24 落地）：品牌与上游隔离的目的已达到（不再是上游
LX Music 的美术资产），但**不是最终设计**——用户以后想换，替换下面的 SVG 源再重跑一条
命令即可，打包配置与代码里的引用都不用动。

## 想换图标怎么做

1. 改这五个 SVG 源（**只改这五个，产物不要手改**）：
   | 源文件 | 用途 |
   |---|---|
   | `app-icon.svg` | 大字标版：品牌绿底板 + 两行 `Ch'iverve` / `MUSIC`，用于 **>= 128px** |
   | `app-icon-compact.svg` | 单字母标版：同一块底板 + `C` 加撇号，用于 **<= 64px**（两行字标在这个尺寸已经糊了） |
   | `tray-white.svg` | 托盘「白色」档：深绿底板 + 白字形（跟随系统在深色面板下也用它） |
   | `tray-black.svg` | 托盘「黑色」档：白底板 + 黑字形（跟随系统在浅色面板下也用它） |
   | `tray-origin.svg` | 托盘「原色」档：白底板 + 品牌绿字形 |

   三份 `tray-*.svg` 的**底板与字形几何必须逐字一致**（只允许改颜色），`make-icons.sh` 开头会校验；
   为什么托盘要带底板、留边与缩放比例怎么定的，写在 `tray-white.svg` 的注释里（另两份只写差异）。
2. 重跑生成（会覆盖下面规格表里的全部 26 个产物）：
   ```bash
   bash resources/icons/make-icons.sh
   ```
   依赖：`inkscape`、ImageMagick `convert`、`python3` + Pillow（只有 `.icns` 需要 Pillow；
   缺 Pillow 时脚本跳过 icns 并告警，其余照常）。脚本结尾会 `identify` 一遍全部产物。
3. 验收：`identify resources/icons/*.png resources/icons/icon.ico src/static/images/tray/*`
   与下面规格表逐行对照；再跑一次 `npm run build && npm run pack:linux:deb:amd64`，
   用 `dpkg-deb -c build/chiverve-music_<版本>_amd64.deb | grep hicolor` 确认产物里的图标是新的。
   **托盘图不在 hicolor 里**：它们进的是 `resources/app.asar`（`build-pack.js` 的 `files: ['dist/**/*']`），
   所以解包后要另查，例如
   `strings <解包目录>/opt/chiverve-music/resources/app.asar | grep -E 'tray_(white|black|origin)'`
   ——三个名字都在、且看不到已删掉的旧名字才算对。
4. 与上游"还像不像"的核对（本仓库的红线之一就是别分发上游美术资产）：
   ```bash
   for f in resources/icons/* src/static/images/tray/*; do
     printf '%s %s\n' "$(git hash-object "$f")" "$f"
   done   # 与上游 lx-music-desktop 同名文件的 blob sha 逐条比，应当全都不同
   ```

## 规格表（尺寸 → 生成自哪个源 → 谁在用）

### 应用图标（`resources/icons/`，10 个文件）

| 文件 | 尺寸 / 格式 | 源 | 引用处 |
|---|---|---|---|
| `16x16.png` `32x32.png` `48x48.png` `64x64.png` | PNG NxN | compact | Linux 目标：`build-config/build-pack.js:82` 的 `linux.icon` 传的是**目录**，electron-builder 自己扫 `NxN.png`；deb 会放进 `/usr/share/icons/hicolor/<N>x<N>/apps/chiverve-music.png`，`.desktop` 的 `Icon=chiverve-music` 靠它解析 |
| `128x128.png` `256x256.png` `512x512.png` | PNG NxN | app-icon | 同上 |
| `icon.png` | PNG 512×512 | app-icon | 同上目录；是 `collectIconsFromDir()` 在目录里找不到 `NxN.png` 时的**兜底图**，正常不参与 |
| `icon.ico` | ICO 16/24/32/48/64/128/256（256 为 PNG 条目，其余为 BMP 条目） | compact ≤64 / app-icon ≥128 | Windows：`build-pack.js:56`；electron-builder 校验它**必须含 256×256**，否则 `ERR_ICON_TOO_SMALL` |
| `icon.icns` | ICNS `ic07`~`ic14`（32/64/128/256/512/1024） | compact ≤64 / app-icon ≥128 | macOS：`build-pack.js:131` |

### 托盘图（`src/static/images/tray/`，16 个文件）

引用处是 `src/main/modules/tray.ts` 的 `getIconPath()`——它按
`fileName + (isWin ? '.ico' : '.png')` 拼路径，**倍率变体（`@1.25x`/`@1.5x`/`@2x`）由 Electron
自己按后缀找**，所以文件名与数量必须与下表逐字一致，少一个就在对应主题/缩放下空白。
`tray.ts` 的 `themeList` 用 `fileName` 指定三档，下表按它列。

**为什么带底板**（2026-09-26 用户拍板，推翻了此前「托盘只画字形、不画底板」的取舍）：
裸字形只能靠字形色去适配面板深浅，选错档就是看不见（默认档在 Linux 深色面板上正是黑字形）；
底板把可见性从面板底色里解耦出来，四档怎么选都看得见。**因此白色档的文件名不能带 `Template`
后缀**——Electron 在 macOS 上按后缀判定模板图（只取 alpha、由系统涂色），带底板的图会被
涂成一块实心方块、C 变挖空；底板自己就解决了面板亮暗适配，不需要模板图语义。
旧的「纯黑字形 + `convert -colorize` 染绿」流程已随本次改版删掉（源自带颜色，不再染色）。

| 主题（`tray.ts` 的 `themeList`） | 文件（`src/static/images/tray/`） | 尺寸 | 底板 / 字形 |
|---|---|---|---|
| `tray_white`（id 0「白色」，跟随系统的深色面板档） | `.png` / `@1.25x.png` / `@1.5x.png` / `@2x.png` / `.ico` / `@2x.ico` | 16 / 20 / 24 / 32 | 底板 `#3e8e65`（品牌深绿）+ 白字形 |
| `tray_black`（id 2「黑色」，跟随系统的浅色面板档） | 同上 6 个 | 16 / 20 / 24 / 32 | 底板 `#ffffff` + 黑字形 |
| `tray_origin`（id 1「原色」） | `.png` / `@2x.png` / `.ico` / `@2x.ico`（**没有** `@1.25x`/`@1.5x`，上游也没给） | 16 / 32 | 底板 `#ffffff` + 品牌绿 `#4daf7c` 字形 |

三档的底板与字形几何**完全相同**（圆角方块 `rect(1,1,30,30,rx 6.6)`、字形
`translate(2.24 2.24) scale(0.86)`），差异只在颜色：底板在「深绿 / 白」之间反色，字形承担
白 / 黑 / 品牌绿。`tray-white` 与 `tray-black` 给全套倍率变体（「跟随系统」在两种面板下都可能
命中它们），`tray-origin` 沿用上游档位。

## 设计约束（改之前先读，都是实测踩过的）

- **配色锁在品牌 token 上**：`#4daf7c` / `#71bf96` / `#3e8e65` 取自
  `src/renderer/assets/styles/index.less` 的 `color-primary`、`color-primary-light-100`、
  `color-primary-dark-200`（CSS 变量名带两个减号前缀，本文件与 SVG 注释里都没写前缀——
  XML 注释不允许出现连续两个减号，写了会让 inkscape 静默产出半成品图）。
- **字标两行 `Ch'iverve` / `MUSIC`**（短名 + 副行的写法；正式场合的全名是 `Ch'iverve Music`）；字体只写通用栈
  `Arial, Helvetica, sans-serif`，不绑定本机专有字体。
- **`C` 与撇号是路径/描边画的，不依赖字体**——小尺寸下笔画宽度才可控。
  `app-icon-compact.svg` 与三份 `tray-*.svg` 用同一套比例：撇号必须落在缺口外侧、
  与 C 上臂切口留 ≥5% 边长的间隙，贴上去会被读成"钩在 C 上"。
- **托盘图标必须带底板，且底板不铺满视口**（2026-09-26 定，取代此前的「只画字形、不画底板」）：
  面板亮暗对可见性的影响由底板承担，字形色不再需要跟面板底色匹配；四周留 1/32 边长
  （16px 档≈0.5px）避免贴边抗锯齿被裁，字形在底板里缩到 0.86 倍（C 环外径≈底板 66%，
  16px 档笔画 2.2px，再小就糊、再大顶到圆角）。
- **三份 `tray-*.svg` 的几何三行必须逐字一致**（底板 `rect`、字形 `<g transform>`、两条
  路径 `d`），只允许改颜色：`make-icons.sh` 开头以「唯一几何 4 条」为准做校验，漂了就直接退出。
- **`inkscape` 的 XML 解析错误只往 stderr 打警告、退出码仍是 0**（1.2.2 实测），
  所以 `make-icons.sh` 除了退出码还查 stderr 里的 `parser error` 与输出文件是否非空。

## 不在本目录范围内的上游美术资产

- `src/static/images/taskbar/*.png`（6 个，`winMain/utils.ts` 用的播放/上一首/下一首等
  任务栏媒体控件图标）：与上游逐字节相同，但画的是**通用媒体控件符号**（播放、暂停、
  心形），不含品牌标识——与 `src/renderer/assets/svgs/*` 同类，本轮的"换图标"没算它们。
  要一并换就在 `src/static/images/taskbar/` 里替换，同样保持文件名与 48×48 尺寸。
- `src/common/theme/images/*`、`src/renderer/assets/images/*`：主题背景图/占位头像，
  同属上游素材但属"主题图"而非品牌标识，另行判断。
