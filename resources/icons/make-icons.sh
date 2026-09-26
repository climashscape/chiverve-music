#!/usr/bin/env bash
#
# Ch'iverve Music 占位图标重建脚本
#
#   用法：bash resources/icons/make-icons.sh
#
# 改完五个 SVG 源（app-icon.svg / app-icon-compact.svg / tray-white.svg / tray-black.svg /
# tray-origin.svg）后重跑本脚本，所有尺寸的 PNG、icon.ico、icon.icns 与托盘图都会重新生成。
#
# 产物落点（**别手改产物**，下次重跑就覆盖了）：
#   resources/icons/         10 个：16/32/48/64/128/256/512.png、icon.png、icon.ico、icon.icns
#   src/static/images/tray/  16 个：三套托盘主题的 .png/.ico 与倍率变体
#
# 尺寸分工（<=64 用单字母标、>=128 用两行字标）：见同目录 README.md 的规格表。
#
# 依赖：inkscape、ImageMagick(convert)、python3 + Pillow(仅 .icns 用)。
# 缺 Pillow 时只跳过 .icns（保留现有文件）并告警，其余照常生成。

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$REPO_DIR/resources/icons"
TRAY_DIR="$REPO_DIR/src/static/images/tray"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for tool in inkscape convert python3; do
  command -v "$tool" >/dev/null || { echo "缺少工具：$tool" >&2; exit 1; }
done

# inkscape 1.2.2 遇到 XML 语法错误时**只往 stderr 打 parser error、退出码仍是 0**，
# 并照样写出一个半成品 PNG（实测：注释里带连续两个减号就触发）。所以既查退出码，
# 也查输出文件是否真的产出了——只看退出码会静默把坏图装进产物。
export_svg() { # <源 svg> <边长> <目标 png>
  local err status=0
  err="$(inkscape --export-type=png --export-filename="$3" -w "$2" -h "$2" "$1" 2>&1 >/dev/null)" || status=$?
  if [ "$status" -ne 0 ] || printf '%s' "$err" | grep -qi 'parser error'; then
    echo "✗ SVG 渲染失败：$1（${2}px）" >&2
    printf '%s\n' "$err" >&2
    exit 1
  fi
  [ -s "$3" ] || { echo "✗ 未产出文件：$3" >&2; exit 1; }
}

# ── 1. 应用图标：各尺寸 PNG 先渲到临时目录，全部成功后再落到 resources/icons ──
# 16~64 用单字母标（两行字标在这个区间已经糊了），128 以上用两行字标。
for size in 16 24 32 48 64; do
  export_svg "$SRC_DIR/app-icon-compact.svg" "$size" "$TMP_DIR/app-$size.png"
done
for size in 128 256 512 1024; do
  export_svg "$SRC_DIR/app-icon.svg" "$size" "$TMP_DIR/app-$size.png"
done

install -m 644 "$TMP_DIR/app-16.png"  "$SRC_DIR/16x16.png"
install -m 644 "$TMP_DIR/app-32.png"  "$SRC_DIR/32x32.png"
install -m 644 "$TMP_DIR/app-48.png"  "$SRC_DIR/48x48.png"
install -m 644 "$TMP_DIR/app-64.png"  "$SRC_DIR/64x64.png"
install -m 644 "$TMP_DIR/app-128.png" "$SRC_DIR/128x128.png"
install -m 644 "$TMP_DIR/app-256.png" "$SRC_DIR/256x256.png"
install -m 644 "$TMP_DIR/app-512.png" "$SRC_DIR/512x512.png"
# icon.png 是 electron-builder 在目录里找不到 512x512.png 时的兜底图，内容与 512 一致
install -m 644 "$TMP_DIR/app-512.png" "$SRC_DIR/icon.png"

# icon.ico：256 必须是其中之一（electron-builder 会校验，不够大直接报 ERR_ICON_TOO_SMALL）。
# 小尺寸走 BMP 条目、256 走 PNG 条目，是 ImageMagick 的默认行为，也是 Windows 兼容性最好的形态。
convert "$TMP_DIR/app-16.png" "$TMP_DIR/app-24.png" "$TMP_DIR/app-32.png" \
        "$TMP_DIR/app-48.png" "$TMP_DIR/app-64.png" "$TMP_DIR/app-128.png" \
        "$TMP_DIR/app-256.png" "$SRC_DIR/icon.ico"

# ── 2. 托盘图：三套「底板 + 字形」配色 ──
# 文件名与数量必须与 src/main/modules/tray.ts 的 getIconPath() 完全一致
# （它按 `fileName + (isWin ? '.ico' : '.png')` 拼路径，Electron 再自己找 @1.25x/@1.5x/@2x
# 倍率变体），少一个文件托盘就会在相应主题/缩放下空白。
#
# 三份源各自带底板与字形颜色，**不再有染色步骤**（旧的「纯黑字形 + colorize 染绿」随
# 2026-09-26 的带底板改版一并去掉）：
#   tray-white  = 深绿底板 + 白字   ← 白色档；「跟随系统」在深色面板下用它
#   tray-black  = 白色底板 + 黑字   ← 黑色档；「跟随系统」在浅色面板下用它
#   tray-origin = 白色底板 + 品牌绿字形 ← 原色档
# 三份源的底板与字形几何必须逐字一致（只在一份里改坐标会做出一套不齐的图标），这里先校验，
# 免得渲染完 16 个文件才发现。期望：1 种底板 + 1 种 transform + 2 条路径 = 4 条唯一几何。
n_geom="$(grep -ho 'x="1" y="1" width="30" height="30" rx="6.6" ry="6.6"\|<g transform="[^"]*"\|d="[^"]*"' \
  "$SRC_DIR"/tray-*.svg | sort -u | wc -l)"
if [ "$n_geom" != 4 ]; then
  echo "✗ 三份 tray-*.svg 的底板/字形几何不一致（唯一几何 $n_geom 条，应为 4）" >&2
  exit 1
fi

for size in 16 20 24 32; do
  for theme in white black origin; do
    export_svg "$SRC_DIR/tray-$theme.svg" "$size" "$TMP_DIR/tray-$theme-$size.png"
  done
done

# 白色档与黑色档给全套倍率变体：@1.25x/@1.5x 只有它们有——「跟随系统」在两种面板下都可能
# 命中这两档，缺变体就会在 125%/150% 缩放的面板上用错尺寸；原色档沿用上游的档位（只 16/32）。
for size in 16 20 24 32; do
  case "$size" in
    16) variant='' ;;
    20) variant='@1.25x' ;;
    24) variant='@1.5x' ;;
    32) variant='@2x' ;;
  esac
  install -m 644 "$TMP_DIR/tray-white-$size.png" "$TRAY_DIR/tray_white$variant.png"
  install -m 644 "$TMP_DIR/tray-black-$size.png" "$TRAY_DIR/tray_black$variant.png"
done

# .ico 里的 `-strip` 不是装饰：去掉 ImageMagick 默认写进容器的 tIME 时间戳块，
# 否则同一条命令每次跑出来的字节都不同，「重跑一遍确认没变化」就永远看到文件在动。
convert "$TMP_DIR/tray-white-16.png" -strip "$TRAY_DIR/tray_white.ico"
convert "$TMP_DIR/tray-white-32.png" -strip "$TRAY_DIR/tray_white@2x.ico"
convert "$TMP_DIR/tray-black-16.png" -strip "$TRAY_DIR/tray_black.ico"
convert "$TMP_DIR/tray-black-32.png" -strip "$TRAY_DIR/tray_black@2x.ico"
convert "$TMP_DIR/tray-origin-16.png" -strip "$TRAY_DIR/tray_origin.ico"
convert "$TMP_DIR/tray-origin-32.png" -strip "$TRAY_DIR/tray_origin@2x.ico"

install -m 644 "$TMP_DIR/tray-origin-16.png" "$TRAY_DIR/tray_origin.png"
install -m 644 "$TMP_DIR/tray-origin-32.png" "$TRAY_DIR/tray_origin@2x.png"

# ── 3. icon.icns（macOS）：Pillow 的 ICNS 写出器会生成 ic07~ic14（PNG 载荷）──
# 本机没有 png2icns / icnsutils / iconutil（实测 2026-09-24），用 Pillow 代替；
# 它写的是 10.7+ 的 PNG 型 icns，不含 is32/il32 那套 legacy ARGB 块——
# macOS 10.6 及更老读不了，对现代系统无影响（且本机打不了 dmg，无法真机验）。
if python3 -c 'import PIL' 2>/dev/null; then
  OUT_ICNS="$SRC_DIR/icon.icns" TMP_DIR="$TMP_DIR" python3 - <<'PY'
import os
from PIL import Image

tmp = os.environ["TMP_DIR"]
# 32/64 用单字母标，128 以上用两行字标——与 PNG 档位的取舍一致
sources = {32: "app-32", 64: "app-64", 128: "app-128", 256: "app-256", 512: "app-512"}
base = Image.open(os.path.join(tmp, "app-1024.png")).convert("RGBA")
appended = [Image.open(os.path.join(tmp, sources[s] + ".png")).convert("RGBA")
            for s in sorted(sources)]
base.save(os.environ["OUT_ICNS"], format="ICNS", append_images=appended)
print("✓ icon.icns（%d 字节）" % os.path.getsize(os.environ["OUT_ICNS"]))
PY
else
  echo "⚠ 未安装 Pillow，跳过 icon.icns（保留现有文件不动）" >&2
fi

# ── 4. 自检：把产物的尺寸与格式打出来，便于人工核对 ──
# icns 不在 identify 里查：本机的 ImageMagick 没有 ICNS 解码器（实测 2026-09-24），
# 硬查会报 "no decode delegate" 干扰判断；它的字节数在第 3 步已打印。
echo
echo "── 产物清单 ──"
identify "$SRC_DIR"/*.png "$SRC_DIR"/icon.ico
identify "$TRAY_DIR"/*
