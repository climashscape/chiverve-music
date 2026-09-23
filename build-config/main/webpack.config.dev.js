const path = require('path')
const { merge } = require('webpack-merge')
const webpack = require('webpack')

const baseConfig = require('./webpack.config.base')


module.exports = merge(baseConfig, {
  mode: 'development',
  entry: {
    main: path.join(__dirname, '../../src/main/index-dev.ts'),
    // 'dbService.worker': path.join(__dirname, '../../src/main/worker/dbService/index.ts'),
  },
  // 开发版的产物写 dist-dev/：与 `npm run build` 的 dist/ 分开，
  // 否则后者开头的 del.sync(['dist/**']) 会把正在跑的 dev 主进程产物撕掉（2026-09-23）
  output: {
    path: path.join(__dirname, '../../dist-dev'),
  },
  devtool: 'eval-source-map',
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"development"',
      },
      webpackStaticPath: `"${path.join(__dirname, '../../src/static').replace(/\\/g, '\\\\')}"`,
      webpackUserApiPath: `"${path.join(__dirname, '../../src/main/modules/userApi').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: {
    maxEntrypointSize: 1024 * 1024 * 50,
    maxAssetSize: 1024 * 1024 * 30,
  },
})
