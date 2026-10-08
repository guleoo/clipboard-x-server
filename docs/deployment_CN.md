# 部署指南

> [English](deployment.md) · [版本发布指南](release_CN.md)

## 原生程序包

从 [GitHub Releases](https://github.com/guleoo/clipboard-x-server/releases) 下载对应平台的压缩包并解压。请保持整个解压目录完整：其中包含可执行文件、Web 资源、SQLite 迁移文件、配置模板、OpenAPI 规范、许可证和文档。

在解压目录中复制模板，修改 `config.yaml`，为 `administrator.password` 设置唯一密码，然后启动 Server：

```sh
cp config.example.yaml config.yaml
chmod 600 config.yaml
./clipboard-x-server
```

Windows 平台下载并解压 `.zip` 压缩包，然后在解压目录中使用 PowerShell 运行：

```powershell
Copy-Item config.example.yaml config.yaml
# 编辑 config.yaml，为 administrator.password 设置唯一密码。
.\clipboard-x-server.exe
```

启动时默认先执行尚未应用的数据库迁移，再提供服务。可使用 `--config {path}` 指定其他 YAML 配置文件；数据库表结构已就绪时，可使用 `--no-migrate` 跳过迁移。

模板默认监听 `0.0.0.0:28787`，时区为 UTC。监听地址 `host`、端口 `port`、`timezone` 和 `data-dir` 都位于 `app` 下；根级还包含 `web`、`limits`、`lifetimes`、`cleanup`、`administrator`、`devices` 和 `channels`。其他内部设置使用 Server 代码中的默认值。YAML 中的相对路径以该 YAML 文件所在目录为基准解析。绑定 443 等特权端口需要相应的操作系统权限。

如需由 Server 直接提供 HTTPS，请在 `app.tls` 中填写可读取的 PEM 证书和私钥路径，并将 `web.cookie-secure` 设为 `true`：

```yaml
app:
  tls:
    cert-file: /absolute/path/to/fullchain.pem
    key-file: /absolute/path/to/privkey.pem
web:
  cookie-secure: true
```

请将这些字段加入现有模板，保留模板中的其他配置。原生模板默认不包含 TLS 字段。证书续期后需要重启进程。如果由 HTTPS 反向代理终止 TLS，则将 `web.public-origin` 设为浏览器访问的 HTTPS 源，并将 `web.cookie-secure` 设为 `true`；这种部署方式下 Server 本身不需要证书。直接访问时，如果浏览器看到的源与 Server 收到的一致，可以不设置 `web.public-origin`。

YAML 文件是可配置选项、管理员、设备、完整设备 API Key、Channel 及成员关系的权威来源。容量限制使用 KB（1 KB = 1024 字节），时长使用秒，字段名不带单位后缀。进程启动时读取此文件。管理控制台修改配置时，先写入同步到磁盘的临时文件，再原子重命名，并将文件权限设为 `0600`；手动编辑后需要重启进程才能生效。

服务端 `cleanup` 默认开启，每个设备在每个 Channel 最多保留 1000 条，最长保存 30 天。它按配置的间隔删除较旧的服务端副本，不会删除客户端本地历史。可在 Web 配置页面修改或关闭策略，详见[运维指南](operations_CN.md)。

## 从 GHCR 部署容器

公开镜像地址为 `ghcr.io/guleoo/clipboard-x-server:latest`。正式版 tag 会发布 `latest`，预发布版只发布对应的版本 tag。将两个部署文件下载到新目录即可，无需检出源码或在本地构建：

```sh
mkdir -p clipboard-x-server
cd clipboard-x-server
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml -o compose.yaml
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example -o .env
```

在 `.env` 中设置唯一的 `CBX_ADMIN_PASSWORD`，长度须为 7–256 个字符，例如可以用 `openssl rand -hex 24` 生成。也可以修改默认值为 `admin` 的 `CBX_ADMIN_USERNAME`。`CBX_HOST` 和 `CBX_PORT` 控制宿主机对外发布的地址和端口；容器内部始终监听 `0.0.0.0:28787`。默认会在宿主机所有网络接口的 28787 端口提供 HTTP。若只允许本机访问，请设置 `CBX_HOST=127.0.0.1`。直接通过 HTTP 访问时，`CBX_PUBLIC_ORIGIN` 可以留空，Server 会根据每个请求推导源。对公网开放时应使用 HTTPS。

在包含 `compose.yaml` 和 `.env` 的目录中启动服务：

```sh
docker compose up -d
```

如果通过 HTTPS 反向代理访问，请在 `.env` 中设置 `CBX_PUBLIC_ORIGIN=https://clipboard.example.com` 和 `CBX_COOKIE_SECURE=true`。让代理转发到宿主机发布的 HTTP 端口；证书由代理处理。

如果希望容器直接提供 HTTPS，还需下载 TLS 覆盖文件：

```sh
curl -fsSL https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.tls.yaml -o compose.tls.yaml
```

在 `.env` 中填写宿主机上已有的两份 PEM 文件路径，以及它们在容器内对应的路径：

```dotenv
CBX_TLS_CERT_HOST_FILE=/absolute/path/to/fullchain.pem
CBX_TLS_KEY_HOST_FILE=/absolute/path/to/privkey.pem
CBX_TLS_CERT_FILE=/app/tls/fullchain.pem
CBX_TLS_KEY_FILE=/app/tls/privkey.pem
CBX_HOST=0.0.0.0
CBX_PORT=443
CBX_PUBLIC_ORIGIN=https://clipboard.example.com
CBX_COOKIE_SECURE=true
```

```sh
docker compose -f compose.yaml -f compose.tls.yaml up -d
```

覆盖文件将两份证书文件分别只读绑定到固定的容器路径，不会挂载整个证书目录。容器的 UID `10001` 必须能读取这两个文件。`CBX_PORT=443` 只改变宿主机发布的端口；容器内部仍监听 28787。证书续期后需要重启容器。

镜像提供 `/app/storage/config.yaml`，其中包括 `app.host`、`app.port`、`app.timezone`、`app.data-dir` 和容器专用设置的环境变量占位符。如果希望从 `.env` 配置 HTTPS 和浏览器访问源，请保留 YAML 中的 `app.tls.cert-file`、`app.tls.key-file`、`web.public-origin` 和 `web.cookie-secure`。唯一的命名卷 `clipboard-x-storage` 保存 `config.yaml`、`data/`（SQLite 和二进制对象）以及 `logs/`，更新时保留并备份这个卷。环境变量的变更只影响 YAML 中仍为占位符的字段：控制台写入具体值后，以 YAML 中的值为准；新镜像不会替换卷内配置。

更新镜像并保留卷时，先运行 `docker compose pull`，再运行 `docker compose up -d`；直接使用 TLS 时，这两个命令都应带上对应的两个 `-f` 选项。

无需认证的 `/health/live` 检查进程，`/health/ready` 还会检查 SQLite。容器健康检查读取同一份 YAML。备份与恢复方法见[运维指南](operations_CN.md)。
