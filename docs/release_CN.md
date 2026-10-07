# GitHub 版本发布

> [English](release.md) · [部署指南](deployment_CN.md)

[Release 工作流](../.github/workflows/release.yml)会构建六份原生压缩包：Linux、macOS 和 Windows 各有 x64、ARM64 版本。Linux、macOS 使用 `.tar.gz`，Windows 使用 `.zip`。每份压缩包都包含编译后的 Server、Web 资源、SQLite 迁移文件、配置模板、OpenAPI 规范、许可证和文档。安装步骤见[部署指南](deployment_CN.md)。

压缩包统一命名为 `clipboard-x-server_{version}_{platform}_{architecture}.{extension}`，平台为 `linux`、`macos` 或 `windows`，架构为 `amd64` 或 `arm64`。例如：`clipboard-x-server_1.0.0_windows_amd64.zip` 和 `clipboard-x-server_1.0.0_linux_arm64.tar.gz`。预发布版本保留 `1.0.0-beta.1` 这样的后缀。

## 只验证工作流，不发布

先推送包含该工作流的提交，再在 GitHub 上选择 **Actions → Release → Run workflow**。手动运行会验证项目、构建并冒烟测试全部六份原生程序包，完成后可下载工作流产物；它不会创建 GitHub Release，也不会推送容器镜像。

## 发布 beta 或正式版

打 tag 前，准备好 `docs/release/v{version}-en.md` 和 `docs/release/v{version}-cn.md`，预发布后缀也包含在 `{version}` 中。工作流使用英文文档作为 Release 正文，不追加自动生成的说明。英文文档中的中文入口使用对应 tag 的仓库链接：

```markdown
[简体中文](https://github.com/guleoo/clipboard-x-server/blob/v{version}/docs/release/v{version}-cn.md)
```

首个版本只介绍功能。后续版本简单概括功能与变更，并在末尾添加比较链接，替换其中两个版本占位符：

```markdown
**Full Changelog**: https://github.com/guleoo/clipboard-x-server/compare/v{previous-version}...v{version}
```

先在 `dev` 提交两份文档，再与发布改动一起合并到 `main`，然后创建 tag。

1. 同步更新各包配置和 Server 状态接口中的发布版本。运行 `bun install` 更新 `bun.lock`，然后在本地运行 `bun run typecheck`、`bun run test` 和 `bun run openapi:check`。提交并推送这些改动。
2. 创建指向该提交的 tag 并推送。正式版 tag 必须恰好为 `v<package.version>`；预发布版 tag 在版本号后添加 `-beta.1` 等后缀。已发布的 tag 不应移动。
3. 推送 tag 后，GitHub 会核对 tag 与 `package.json` 中的版本、验证项目、构建并冒烟测试六份压缩包，确认每份压缩包都存在且可读取，然后生成 `SHA256SUMS` 并创建 GitHub Release。独立的任务还会构建 Linux amd64/arm64 镜像并推送到 `ghcr.io/guleoo/clipboard-x-server`。两项发布任务都只会在全部原生程序包构建成功后启动。

推送版本提交后，从包配置读取版本号来发布 beta：

```sh
release_tag="v$(bun -p 'require("./package.json").version')-beta.1"
git tag -a "$release_tag" -m "Beta release"
git push origin "$release_tag"
```

发布正式版时，使用不带预发布后缀的包版本号：

```sh
release_tag="v$(bun -p 'require("./package.json").version')"
git tag -a "$release_tag" -m "Release $release_tag"
git push origin "$release_tag"
```

示例使用 `origin` 远端；如果你的远端名称不同，请替换它。发布新的程序版本时，需要使用匹配的新提交和 tag。

镜像始终带有对应的发布 tag。预发布版 tag（包含 `-`）会将 GitHub Release 标为预发布版，不更新镜像的 `latest`；正式版 tag 还会更新 `latest`。除六份平台程序包和 `SHA256SUMS` 外，GitHub 还会自动提供源码压缩包。

GitHub Release 任务与 GHCR 任务互相独立：在程序包构建成功后，任一发布任务仍可能单独失败。对于已经存在 GitHub Release 的 tag，重新运行工作流不会覆盖已有 Release；`gh release create` 会因 tag 对应的 Release 已存在而失败。首次发布 GHCR 镜像时，仓库所有者可能还需要在 GitHub Packages 中把包的可见性设为 **Public**，匿名用户才能拉取镜像。
