# GitHub Releases

> [简体中文](release_CN.md) · [Deployment guide](deployment.md)

The [Release workflow](../.github/workflows/release.yml) builds six native `.tar.gz` archives: Linux, macOS, and Windows, each for x64 and ARM64. Every archive contains the compiled Server, Web assets, SQLite migrations, a configuration template, the OpenAPI specification, the license, and documentation. Windows archives are also `.tar.gz`; recent Windows versions can extract them with `tar`. Deployment steps are in the [deployment guide](deployment.md).

## Try the workflow without publishing

Push the commits containing the workflow, then choose **Actions → Release → Run workflow** on GitHub. This manual run verifies the project, builds and smoke-tests all six native packages, and leaves them as downloadable workflow artifacts. It does not create a GitHub Release or push a container image.

## Publish a beta or stable release

1. Update the release version consistently in the package manifests and the Server status response. Run `bun install` to update `bun.lock`, then run `bun run typecheck`, `bun run test`, and `bun run openapi:check` locally. Commit and push the changes.
2. Create and push a tag pointing to that commit. A stable tag must be exactly `v<package.version>`; a prerelease tag starts with that version and adds a suffix such as `-beta.1`. Keep published tags fixed.
3. On the tag push, GitHub checks the tag against `package.json`, verifies the project, builds and smoke-tests all six archives, confirms that every archive is present and readable, and creates `SHA256SUMS` plus a GitHub Release. A separate job builds and pushes a Linux amd64/arm64 image to `ghcr.io/guleoo/clipboard-x-server`. Both publishing jobs start only after all native packages succeed.

After pushing the version commit, read the package version to publish a beta:

```sh
release_tag="v$(bun -p 'require("./package.json").version')-beta.1"
git tag -a "$release_tag" -m "Beta release"
git push clipboard-x-server "$release_tag"
```

For a stable release, use the package version without a prerelease suffix:

```sh
release_tag="v$(bun -p 'require("./package.json").version')"
git tag -a "$release_tag" -m "Release $release_tag"
git push clipboard-x-server "$release_tag"
```

`clipboard-x-server` is this checkout's Git remote name; substitute your remote if it differs. A new package version needs a matching new commit and tag.

The image always receives the release tag. A prerelease tag (one containing `-`) marks the GitHub Release as a prerelease and does not update the image's `latest` tag. A stable tag also updates `latest`. GitHub publishes its own automatic source-code archives alongside the six platform packages and `SHA256SUMS`.

The GitHub Release job and GHCR job are separate: either may fail after the package jobs pass. Re-running a tag whose GitHub Release already exists does not overwrite that Release; `gh release create` will fail for the existing tag. Before anonymous clients can pull the first GHCR image, the repository owner may need to set the package visibility to **Public** in GitHub Packages.
