import { app, Menu } from 'electron'
import { isMac } from '@common/utils'


export default () => {
  if (isMac) {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        // 不能用 app.getName()：打包后它返回机器标识 `chiverve-music`，而 macOS 首菜单该显示展示名
        // （全名形态 `Ch'iverve Music`）。机器标识与展示名的分工见 README 的「关于本仓库」。
        label: 'Ch\'iverve Music',
        submenu: [
          { label: '关于 Ch\'iverve Music', role: 'about' },
          { type: 'separator' },
          { label: '隐藏', role: 'hide' },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: 'Command+Q',
            click() {
              global.lx.isSkipTrayQuit = true
              app.quit()
            },
          },
        ],
      },
      {
        label: '窗口',
        role: 'window',
        submenu: [
          { label: '最小化', role: 'minimize' },
          { label: '关闭', role: 'close', accelerator: 'Command+W' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', accelerator: 'Command+Z', role: 'undo' },
          { label: '恢复', accelerator: 'Shift+Command+Z', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', accelerator: 'Command+X', role: 'cut' },
          { label: '复制', accelerator: 'Command+C', role: 'copy' },
          { label: '粘贴', accelerator: 'Command+V', role: 'paste' },
          { label: '选择全部', accelerator: 'Command+A', role: 'selectAll' },
        ],
      },
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } else {
    Menu.setApplicationMenu(null)
  }
}
