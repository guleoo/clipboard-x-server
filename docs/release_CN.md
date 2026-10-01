# GitHub 版本发布

> [English](release.md) · [部署指南](deployment_CN.md)

[Release 工作流](../.github/workflows/release.yml)会构建六份原生 `.tar.gz` 压缩包：Linux、macOS 和 Windows 各有 x64、ARM64 版本。每份压缩包都包含编译后的 Server、Web 资源、SQLite 迁移文件、配置模板、OpenAPI 规范、许可证和文档。Windows 的压缩包同样是 `.tar.gz`；较新的 Windows 版本可用 `tar` 解压。安装步骤见[部署指南](deployment_CN.md)。

## 只验证工作流，不发布

先推送包含该工作流的提交，再在 GitHub 上选择 **Actions → Release → Run workflow**。手动运行会验证项目、构建并冒烟测试全部六份原生程序包，完成后可下载工作流产物；它不会创建 GitHub Release，也不会推送容器镜像。

## 发布 beta 或正式版

1. 同步更新各包配置和 Server 状态接口中的发布版本。运行 `bun install` 更新 `bun.lock`，然后在本地运行 `bun run typecheck`、`bun run test` 和 `bun run openapi:check`。提交并推送这些改动。
2. 创建指向该提交的 tag 并推送。正式版 tag 必须恰好为 `v<package.version>`；预发布版 tag 在版本号后添加 `-beta.1` 等后缀。已发布的 tag 不应移动。
3. 推送 tag 后，GitHub 会核对 tag 与 `package.json` 中的版本、验证项目、构建并冒烟测试六份压缩包，确认每份压缩包都存在且可读取，然后生成 `SHA256SUMS` 并创建 GitHub Release。独立的任务还会构建 Linux amd64/arm64 镜像并推送到 `ghcr.io/guleoo/clipboard-x-server`。两项发布任务都只会在全部原生程序包构建成功后启动。

推送版本提交后，从包配置读取版本号来发布 beta：

```sh
release_tag="v$(bun -p 'require("./package.json").version')-beta.1"
git tag -a "$release_tag" -m "Beta release"
git push clipboard-x-server "$release_tag"
```

发布正式版时，使用不带预发布后缀的包版本号：

```sh
release_tag="v$(bun -p 'require("./package.json").version')"
git tag -a "$release_tag" -m "Release $release_tag"
git push clipboard-x-server "$release_tag"
```

`clipboard-x-server` 是当前检出目录的 Git 远端名称；如果你的远端名称不同，请替换它。发布新的程序版本时，需要使用匹配的新提交和 tag。

镜像始终带有对应的发布 tag。预发布版 tag（包含 `-`）会将 GitHub Release 标为预发布版，不更新镜像的 `latest`；正式版 tag 还会更新 `latest`。除六份平台程序包和 `SHA256SUMS` 外，GitHub 还会自动提供源码压缩包。

GitHub Release 任务与 GHCR 任务互相独立：在程序包构建成功后，任一发布任务仍可能单独失败。对于已经存在 GitHub Release 的 tag，重新运行工作流不会覆盖已有 Release；`gh release create` 会因 tag 对应的 Release 已存在而失败。首次发布 GHCR 镜像时，仓库所有者可能还需要在 GitHub Packages 中把包的可见性设为 **Public**，匿名用户才能拉取镜像。
