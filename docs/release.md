# GitHub Releases

> [简体中文](release_CN.md) · [Deployment guide](deployment.md)

The [Release workflow](../.github/workflows/release.yml) builds six native `.tar.gz` archives: Linux, macOS, and Windows, each for x64 and ARM64. Every archive contains the compiled Server, Web assets, SQLite migrations, a configuration template, the OpenAPI specification, the license, and documentation. Windows archives are also `.tar.gz`; recent Windows versions can extract them with `tar`. Deployment steps are in the [deployment guide](deployment.md).

## Try the workflow without publishing

Push the commits containing the workflow, then choose **Actions → Release → Run workflow** on GitHub. This manual run verifies the project, builds and smoke-tests all six native packages, and leaves them as downloadable workflow artifacts. It does not create a GitHub Release or push a container image.

## Publish a beta or stable release

1. Set the root `package.json` version. Run `bun install` to update `bun.lock`, then run `bun run typecheck`, `bun run test`, and `bun run openapi:check` locally. Commit and push the changes.
2. Create and push a tag pointing to that commit. A stable tag must be exactly `v<package.version>`; a prerelease tag starts with that version and adds a suffix such as `-beta.1`. Keep published tags fixed.
3. On the tag push, GitHub checks the tag against `package.json`, verifies the project, builds and smoke-tests all six archives, confirms that every archive is present and readable, and creates `SHA256SUMS` plus a GitHub Release. A separate job builds and pushes a Linux amd64/arm64 image to `ghcr.io/guleoo/clipboard-x-server`. Both publishing jobs start only after all native packages succeed.

For the current `0.1.0` package version, after pushing the commit, publish a beta with:

```sh
git tag -a v0.1.0-beta.1 -m "Beta 1"
git push clipboard-x-server v0.1.0-beta.1
```

For a stable release, create and push `v0.1.0` instead:

```sh
git tag -a v0.1.0 -m "Release 0.1.0"
git push clipboard-x-server v0.1.0
```

`clipboard-x-server` is this checkout's Git remote name; substitute your remote if it differs. A new package version needs a matching new commit and tag.

The image always receives its versioned tag, such as `v0.1.0-beta.1` or `v0.1.0`. A prerelease tag (one containing `-`) marks the GitHub Release as a prerelease and does not update the image's `latest` tag. A stable tag also updates `latest`. GitHub publishes its own automatic source-code archives alongside the six platform packages and `SHA256SUMS`.

The GitHub Release job and GHCR job are separate: either may fail after the package jobs pass. Re-running a tag whose GitHub Release already exists does not overwrite that Release; `gh release create` will fail for the existing tag. Before anonymous clients can pull the first GHCR image, the repository owner may need to set the package visibility to **Public** in GitHub Packages.
