import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * 测试基建配置。
 *
 * 设计取舍（改之前先读这段）：
 *
 * 1. **不改 webpack**：本文件只服务 vitest，四个 webpack target 的配置一个字都不动。
 *    测试文件不在任何 entry 的依赖图里，不会被打包（`components/index.js` 的
 *    `require.context('./', true, /\.vue$/)` 只匹配 .vue，也捞不到 *.test.ts）。
 *
 * 2. **两个 project 按「跑在哪种运行时」切分**，而不是按目录切分业务模块：
 *    - `node`：主进程 / common / musicSdk / worker —— 这些代码只依赖 Node 内置能力，
 *      在 jsdom 里反而容易被 `fs`、Buffer、`process` 的差异干扰
 *    - `dom`（jsdom）：渲染进程 store / core / views / components / compositions ——
 *      这些代码假定 `window.lx`、`window.lxData`、`window.i18n` 等运行时单例存在
 *      （见 test/setup/dom.ts）
 *    两个 project 的 include 是**显式白名单**（`environmentMatchGlobs` 在 vitest 4 已
 *    移除，没法按 glob 切环境）：新目录要跑测试时，在对应 project 的 include 里加一行；
 *    不在任何 include 里的目录默认不跑。
 *    判断口径就一句：**测试会不会碰到 `window` / DOM / SFC** —— 会，放 dom；不会，放 node。
 *
 * 3. **别名与 webpack 对齐**：抄 `build-config/renderer/webpack.config.base.js:26-33`
 *    的 `resolve.alias`（那份最全）。别名写成绝对路径 —— Vite 的字符串别名是「前缀」
 *    语义，相对路径会按 importer 解析，容易在大仓库里指错。
 *
 * 4. **electron 桩**：`electron` 这个模块说明符被 alias 到 `test/stubs/electron.ts`。
 *    用正则 `^electron$` 精确匹配（而不是字符串前缀），避免把 `electron-log` /
 *    `electron-updater` 一起改写掉。桩里维护了 ipcMain/ipcRenderer 的真实事件表，
 *    所以主进程的手柄也能被测试（见 AGENTS.md §2.3）。
 *    `@electron/remote` 当前**不需要桩**：全仓 `grep -rn "@electron/remote" src` 零命中
 *    （上游已迁到 `@common/mainIpc` / `@common/rendererIpc`）。将来若引入，按同样方式
 *    加一条正则别名即可。
 *
 * 5. **样式**：`css: false`（默认值，这里显式写出来表明是有意为之）。`.css`/`.less`
 *    会被替换成空模块，CSS Modules 退化成「键名即类名」的代理，所以 `<style module>`
 *    的组件能正常挂载，也不需要 less 变量/字体等真实资源。
 *
 * 6. **已知的无害告警**：每次跑测试会打印一行
 *    「Your Vite config uses features that are unsupported by `configLoader: 'native'`…
 *     ESM syntax in a file loaded as CommonJS」。
 *    原因：package.json 没有 `"type": "module"`（webpack 那套是 CJS，不能加），
 *    而本文件是 ES module 语法。当前 `configLoader: 'bundle'` 能正常加载，
 *    只有 Vite 未来把默认加载器换成 native 时才会变成错误；届时把本文件改名为
 *    `vitest.config.mts` 即可（现在不改名是为了让配置文件名保持仓库惯例）。
 *
 * 7. **`test/` 目录布局**：`test/setup/` 是环境 setup 文件（只有 dom 需要），
 *    `test/stubs/` 是模块桩（当前只有 electron），`test/node/` 与 `test/dom/` 预留给
 *    「跨目录的公共测试」—— 业务测试一律**就近放**在被测文件同目录（`xxx.test.ts`）。
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url))

const resolveAlias = (relativePath: string) => path.resolve(rootDir, relativePath)

const alias = {
  '@root': resolveAlias('src'),
  '@main': resolveAlias('src/main'),
  '@renderer': resolveAlias('src/renderer'),
  '@lyric': resolveAlias('src/renderer-lyric'),
  '@static': resolveAlias('src/static'),
  '@common': resolveAlias('src/common'),
}

const resolve = {
  alias: [
    ...Object.entries(alias).map(([find, replacement]) => ({ find, replacement })),
    // electron 走正则精确匹配，理由见文件头第 4 点
    { find: /^electron$/, replacement: resolveAlias('test/stubs/electron.ts') },
  ],
  // 与 webpack 的 resolve.extensions 对齐（额外补 .vue 以支持 SFC 的无扩展导入）
  extensions: ['.tsx', '.ts', '.js', '.mjs', '.json', '.node', '.vue'],
}

/** 两个 project 共用的 test 选项（include / environment / setupFiles 各自不同） */
const sharedTestOptions = {
  // 显式 import { describe, it, expect }，不开 globals —— 开了就要动 ESLint 配置
  globals: false,
  css: false,
  // node_modules / dist 是 vitest 默认排除项；.agents 是 skills 仓库、build-config 是构建脚本
  exclude: ['**/node_modules/**', '**/dist/**', '**/.agents/**', '**/build-config/**'],
  // 默认 5s 对纯逻辑测试够用，留点余量防止慢机器误报
  testTimeout: 10_000,
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vue()],
        resolve,
        test: {
          ...sharedTestOptions,
          name: 'node',
          environment: 'node',
          include: [
            'src/common/**/*.test.ts',
            'src/main/**/*.test.ts',
            'src/renderer/worker/**/*.test.ts',
            'src/renderer/utils/musicSdk/**/*.test.ts',
            'test/node/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [vue()],
        resolve,
        test: {
          ...sharedTestOptions,
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['test/setup/dom.ts'],
          include: [
            'src/renderer/store/**/*.test.ts',
            'src/renderer/core/**/*.test.ts',
            'src/renderer/plugins/**/*.test.ts',
            'src/renderer/views/**/*.test.ts',
            'src/renderer/components/**/*.test.ts',
            // renderer/utils 顶层是 ipc / request 这类能被 dom 环境直接跑的模块，
            // musicSdk 在 node project 里（它只做请求与数据整形）
            'src/renderer/utils/*.test.ts',
            'src/renderer/utils/compositions/**/*.test.ts',
            'src/renderer-lyric/**/*.test.ts',
            'test/dom/**/*.test.ts',
          ],
        },
      },
    ],
    // 覆盖率只从根配置读；`coverage` 目录已在 .gitignore 里
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,js,vue}'],
      exclude: [
        '**/*.d.ts',
        'src/**/*.test.ts',
        // 入口文件只做装配（取设置 → 建应用 → 挂载），没有可测逻辑
        'src/main/index.ts',
        'src/main/index-dev.ts',
        'src/renderer/main.ts',
        'src/renderer-lyric/main.ts',
      ],
    },
  },
})
