const path = require('path')
const webpack = require('webpack')

const { merge } = require('webpack-merge')

const baseConfig = require('./webpack.config.base')

module.exports = merge(baseConfig, {
  mode: 'development',
  // 同主进程：dev 的 preload 写 dist-dev/，与 `npm run build` 的 dist/ 互不打扰
  output: {
    path: path.join(__dirname, '../../dist-dev'),
  },
  devtool: 'eval-source-map',
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"development"',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
      staticPath: `"${path.join(__dirname, '../../src/static').replace(/\\/g, '\\\\')}"`,
    }),
  ],
  performance: {
    hints: false,
  },
})

