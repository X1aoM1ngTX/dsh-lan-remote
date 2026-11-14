# 局域网远程（dsh-lan-remote）

在同一个局域网内，用另一台电脑的浏览器使用这台电脑上的 DSH；也可以在这个页面里保存、测试并一键打开其他电脑的 DSH。

安装后出现在 **设置 → 局域网远程**。

![icon](assets/icon-180.png)

## 功能

- **本机共享**：在 `0.0.0.0:<端口>`（默认 4778）起一个很小的 HTTP/WebSocket 网关，把请求透明转发到本机 `127.0.0.1:50590` 的 DSH Web 服务。分享链接形如 `http://192.168.1.8:4778/?lan=ABCD-1234`。
- **其他电脑**：保存别人发来的分享链接，探测对方是否在线，一键在新标签页打开。
- **访问码**：可随时重置；端口可改。
- **状态持久化**：端口、访问码、共享开关、位机列表都记在磁盘上；DSH 重启后自动恢复上次的共享状态。

## 安装

在 DSH 里用 `plugin_manager` 安装（推荐指向一个 commit，升级可控）：

```text
plugin_manager action=install_bundle target=git+https://github.com/X1aoM1ngTX/dsh-lan-remote.git#<commit>
```

也可以先用默认分支：

```text
plugin_manager action=install_bundle target=git+https://github.com/X1aoM1ngTX/dsh-lan-remote.git
```

本地开发时直接指向目录：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-lan-remote
```

安装后刷新页面，在 **设置 → 局域网远程** 打开。

## 使用

1. 两台电脑都安装这个插件。
2. 在**被连接**的那台：设置 → 局域网远程 → 打开「本机共享」→ 复制页面给出的分享链接。
3. 在**你面前**的那台：把链接粘贴到「其他电脑」→「测试」确认能通 →「连接」。
4. 对方连不上时，展开「另一台电脑连不上？」，复制那行管理员 PowerShell 防火墙命令执行一次（只放行该端口的专用网络入站）。

## 工作原理

网关不修改 DSH 的绑定地址，也不自己实现登录：

1. 浏览器访问网关，网关把 `Host`、`Origin`、`Referer` 改写成回环地址后转发给 DSH Web 服务。
2. 分享链接里的 `?lan=访问码` 由网关校验；通过后换成 DSH 进程自己的启动令牌，再去访问 DSH。
3. DSH 用这个令牌签发它自己的浏览器 Cookie，之后的 HTTP 和 WebSocket 请求都由 DSH 自己鉴权。

也就是说：**认证仍然由 DSH 负责**，网关只做地址改写和访问码这一道额外门禁。

## 安全须知

- 分享链接就是凭证。共享开启期间，局域网内拿到链接的人可以像坐在那台电脑前一样使用 DSH：读写文件、执行命令、使用已登录的账号。
- 只在可信网络开启，不用时关掉；链接只发给可信的人。
- 「重置访问码」只让旧链接失效，**不会**让已经登录过的远端浏览器下线——它们的 Cookie 最长保留 30 天。
- 网关使用明文 HTTP；不要在不可信网络上开启。

## 数据

`$DSH_HOME/lan-remote/state.json` 保存端口、访问码、共享开关和位机列表。插件不保存任何 DSH 令牌或 Cookie。

## 已知限制

- 远程界面在**新标签页**打开，不内嵌：跨站 iframe 会被浏览器的第三方 Cookie 策略挡住。
- 没有自动发现，需要手动粘贴一次链接。
- 防火墙提示只在 Windows 上验证过；其他系统需要自行放行端口。
- 远端浏览器与 DSH 之间是明文 HTTP，跨网段/不可信网络请勿使用。

## 分享与收录

- 仓库根目录就是包根，`package.json` 已声明 `dsh.bundle`，可直接被 DSH 安装。
- 已在 [docs/awesome-dsh-plugin.yml](docs/awesome-dsh-plugin.yml) 准备好社区目录条目：把它复制成 `awesome-dsh-plugin` 仓库里的 `data/plugins/X1aoM1ngTX__dsh-lan-remote.yml`，然后提 PR。
- 目录收录后，社区索引（如 `aaamechanic.github.io/dsh-plugin-market/index.json`）会自动镜像；用户也可以自建 format 1 索引，把地址加到 **插件 → 发现 → 添加索引源**。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：网关、状态持久化、`/__lan_remote/api/*` |
| `client.js` | Client 半：设置页（React，无 JSX，仅用主题令牌） |
| `cordis.patch.yml` | 安装时插入的插件行 |
| `locale/*.json` | 插件管理器显示的标题、描述与详情页 |
| `docs/*.md` | 详情页长描述（`meta.detail`）与社区目录条目 |
| `assets/icon-180.png` | 商店/目录卡片图标 |

English version: [README.en.md](README.en.md)
