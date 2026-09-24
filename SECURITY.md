# 安全政策

> 本仓库**仅供研究用途**，**不对外发布任何打包版、不提供任何构建产物**（决策见 `docs/adr/0008-research-only-no-packaged-releases.md`）。
> 由此推出两条与本文件直接相关的结论：
>
> 1. **没有「补丁包 / 新版本」这种修复形态**——安全修复只体现在源码提交里，由使用者自行拉取、自行构建；
> 2. 本仓库由**单人业余维护**：会看、会尽力，但**不承诺响应时限**，也不提供任何形式的商业支持或 SLA。

## 怎么报告

1. **优先用 GitHub 的私密漏洞报告**：仓库页 → `Security` 标签 → `Report a vulnerability`（只有维护者可见的私密报告）。
2. 若该入口不可用，也可以在 [Issues](https://github.com/climashscape/chiverve-music/issues) 里开一条、标题标注 `[security]`；
   **但不要在公开 Issue 里贴可直接利用的细节、真实凭证或账号数据**——先只说清影响面，细节等私密渠道建立后再给。

报告里请写清：受影响的提交或版本（`git rev-parse HEAD` 的短 SHA 即可）、复现步骤、影响面、以及是否已在别处公开。
**不要提交含真实凭证的复现材料**：需要样例时用专门注册的测试账号，并把凭证值涂掉后再贴。

## 本仓库的真实攻击面

下面每一条都与本仓库代码对得上（不是通用模板清单）。它们大多是**有意为之的取舍**，但仍值得知道边界在哪。

| 面 | 现状 | 位置 |
|---|---|---|
| QQ 登录凭证 | **明文 JSON 落盘**（`<userData>/LxDatas/qq_auth.json`），不引 `safeStorage`/keytar：**任何能读该文件的本地进程都能冒充账号**。前提是「单用户本地机器」 | `docs/adr/0005-plaintext-credential-storage.md`；文件位置见 `docs/agents/build-and-pack.md` §7.1 |
| 同步凭证 | 同为明文（`<userData>/LxDatas/sync/client/syncAuthKey.json`） | `docs/agents/qq-music-native.md` §2.3 的安全现状段 |
| 主窗口 / 歌词窗渲染进程 | `nodeIntegration: true` + `contextIsolation: false` + `sandbox: false` + `webSecurity: false`（上游既有形态）：**渲染层的代码等价于本地 Node 权限**，一旦发生注入即任意代码执行 | `src/main/modules/winMain/main.ts:105-109`；歌词窗同形态 `src/main/modules/winLyric/main.ts:181-190` |
| 自定义音源脚本 | 第三方脚本在独立窗口里跑：`contextIsolation: true`、`nodeIntegration: false`、CSP `default-src 'none'`（`src/main/modules/userApi/main.ts:83-99`）——沙箱是有的，但**它的代码仍是你主动导入并运行的第三方代码**，来源不可信就等于把环境交给作者 | `src/main/modules/userApi/main.ts:83-99` |
| 本地 OpenAPI 服务 | 默认绑 `127.0.0.1`；勾选「允许来自局域网的访问」后绑 `0.0.0.0` 且**没有鉴权**——同一网段内任何设备都能控制播放器 | `src/main/modules/openApi/index.ts:279-281`；设置项文案见 `src/lang/zh-cn.json` 的 `setting__open_api_bind_lan_tip` |
| 本地同步服务端 | 默认关闭（`sync.enable: false`），端口默认 `23332`，连接需 `authCode`：面向局域网多设备同步，开启即等于在该网络里开了一个带口令的数据端点 | `src/common/defaultSetting.ts:187-188`；实现 `src/main/modules/sync/server/` |
| 凭证类 IPC 通道 | 已校验来源窗口（`assertFromMainWindow`，`src/main/modules/qqAuth/rendererEvent.ts:15`），非主窗口的调用会被拒 | 同上 |

**不在本仓库范围内**（别往这里报）：

- **上游 LX Music 桌面版自身的问题** —— 请去上游仓库提（本仓库是它的派生分支，见 README「关于本仓库」）。
- **第三方音源脚本 / 第三方音乐平台接口**的行为、风控与数据正确性 —— 归各脚本作者与各平台。
- **合规与法务问题**（例如「这样用是否违反某平台条款」）—— 上游补充条款已写明「禁止违法使用、非商业性质」（`licenses/`），**使用本仓库代码的合规责任由使用者自负**，本仓库不代为回答。

## 已知的设计取舍（不是漏洞，但请别当漏洞报）

- **明文存凭证**：单用户本地机器的前提下有意沿用上游惯例，不是疏忽；要改成加密存储，得先改 `docs/adr/0005-plaintext-credential-storage.md`。
- **渲染进程的宽权限**：同样沿用上游形态，改动会牵到取流与请求层的整体设计（属大改，不在当前范围）。
- **没有自动更新检查**：本项目不发布安装包，所以也不存在「安全更新推送」；唯一的更新途径是拉源码重新构建，见 README「自行构建」。
