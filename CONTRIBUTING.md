# Contributing

[简体中文](CONTRIBUTING_CN.md)

Bug reports, documentation improvements, and code contributions are welcome. For a substantial feature or architecture change, open an issue to discuss the scope before implementation.

## Development setup

Use the Bun version declared in `package.json`. Work from the repository root and create your branch from `dev`:

```sh
git switch dev
git switch -c your-change
bun install --frozen-lockfile
```

For a fresh checkout, create the local Server configuration:

```sh
cp server/config.example.yaml server/config.yaml
```

Set a unique `administrator.password` before starting the Server. On Unix systems, restrict access with `chmod 600 server/config.yaml`. Do not overwrite an existing local configuration.

Run the Server and Web application in separate terminals:

```sh
bun run dev:server
```

```sh
bun run dev:web
```

Open `http://127.0.0.1:3000`. Vite proxies API requests to the Server using `CBX_PROXY_URL` from `web/.env`. Override it in an ignored `web/.env.local` file if your local Server uses a different address.

## Project conventions

- Keep changes focused on the issue being addressed. Discuss new infrastructure or changes to public API behavior before implementation.
- The Server uses a flat layout. `config` and `db` are process-wide singletons; routes adapt HTTP, services hold business rules, and repositories handle persistence.
- Web and Server workspaces do not import each other's source. Reuse existing UI components and provide both English and Simplified Chinese translations for user-facing text.
- YAML is the authoritative source for managed configuration. Preserve readable formatting when writing it.
- Declare dependencies in the workspace that uses them, use Bun to manage them, and commit changes to the single root `bun.lock`.

See the [Server architecture](docs/architecture.md), [Web architecture](web/docs/architecture.md), and [protocol guide](docs/protocol.md) for details.

## Checks and tests

Run these checks from the repository root before submitting code changes:

```sh
bun run typecheck
bun run test
bun run openapi:check
bun run build
```

Server tests live in `server/test/`; Web tests live in `web/tests/`. Group tests by domain and verify observable behavior. Add or update regression tests for meaningful behavior changes; documentation, formatting, CSS, and routine control attributes do not need new tests. The full test suite includes startup and TLS checks that require permission to listen on local ports.

When changing an HTTP contract, update the schemas, related client code, protocol documentation, and contract tests together. Regenerate OpenAPI with:

```sh
bun run --cwd server openapi
```

Then run `bun run openapi:check` and review the generated diff.

## Pull requests

Submit pull requests to `dev`. Use a fork if you do not have write access to the repository.

- Describe the problem, the change, and the checks performed. Link the relevant issue if there is one.
- Include screenshots for visible UI changes.
- Keep unrelated cleanup out of the pull request.
- Follow the existing English commit style: `action: message`, such as `fix: load complete clipboard text`.
- Do not commit passwords, API keys, private keys, local configuration, databases, logs, or real clipboard contents. Use synthetic fixtures and redact sensitive details from reports and screenshots.

## License

Contributions are covered by the project's [GPL-3.0-or-later license](LICENSE.md).
