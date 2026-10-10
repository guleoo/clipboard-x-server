# 贡献指南

[English](CONTRIBUTING.md)

欢迎报告问题、完善文档和提交代码。较大的功能或架构变更，请先通过 Issue 讨论范围，再开始实现。

## 开发环境

使用 `package.json` 中声明的 Bun 版本。在仓库根目录操作，从 `dev` 创建工作分支：

```sh
git switch dev
git switch -c your-change
bun install --frozen-lockfile
```

首次检出后，创建本地 Server 配置：

```sh
cp server/config.example.yaml server/config.yaml
```

启动前，为 `administrator.password` 设置唯一密码。在 Unix 系统上使用 `chmod 600 server/config.yaml` 限制访问。不要覆盖已有的本地配置。

在两个终端分别启动 Server 和 Web：

```sh
bun run dev:server
```

```sh
bun run dev:web
```

打开 `http://127.0.0.1:3000`。Vite 使用 `web/.env` 中的 `CBX_PROXY_URL` 将 API 请求代理到 Server。本地 Server 地址不同时，可在被 Git 忽略的 `web/.env.local` 中覆盖该参数。

## 项目约定

- 改动聚焦当前问题。引入新的基础设施或改变公共 API 行为前，先讨论设计。
- Server 采用扁平结构，`config` 和 `db` 是进程级全局单例；Route 适配 HTTP，Service 承载业务规则，Repository 负责持久化。
- Web 与 Server 工作区不互相导入源码。复用现有 UI 组件，面向用户的文本提供英文和简体中文翻译。
- YAML 是受管配置的权威来源，回写时保持易读的格式。
- 在实际使用依赖的工作区声明依赖，通过 Bun 管理，并提交根目录唯一的 `bun.lock` 的变更。

详细设计见 [Server 架构](docs/architecture_CN.md)、[Web 架构](web/docs/architecture_CN.md)和[协议指南](docs/protocol_CN.md)。

## 检查与测试

提交代码改动前，在仓库根目录执行：

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
```

Server 测试位于 `server/test/`，Web 测试位于 `web/tests/`。按领域组织测试，验证可观察的实际行为。有实质性行为变化时，新增或更新有价值的回归测试；文档、格式、CSS 和常规控件属性修改不需要新增测试。完整测试集包含启动和 TLS 检查，需要允许监听本地端口。

修改 HTTP 契约时，同步更新 Schema、相关客户端代码、协议文档和契约测试。通过以下命令重新生成 OpenAPI：

```sh
bun run --cwd server openapi
```

然后执行 `bun run openapi:check`，检查生成内容的差异。

## Pull Request

PR 的目标分支为 `dev`。没有仓库写权限时，通过 Fork 提交。

- 说明问题、改动内容和已完成的验证，有关联 Issue 时附上链接。
- 界面可见的改动附上截图。
- 不夹带与当前问题无关的清理工作。
- Commit 沿用现有英文风格：`action: message`，例如 `fix: load complete clipboard text`。
- 不提交密码、API Key、私钥、本地配置、数据库、日志或真实剪切板内容。测试使用虚构数据，问题报告和截图应隐藏敏感信息。

## 许可证

贡献内容遵循项目的 [GPL-3.0-or-later 许可证](LICENSE.md)。
