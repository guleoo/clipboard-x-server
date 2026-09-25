# GitHub Releases

The [Release workflow](../.github/workflows/release.yml) builds six native archives: Linux,
macOS, and Windows, each for x64 and ARM64. Every archive includes the compiled Server, Web
assets, SQLite migrations, a configuration template, the license, and documentation. Windows
archives are also `.tar.gz`; recent Windows versions can unpack them with `tar`. On a tag push,
the workflow also publishes a Linux amd64/arm64 image to `ghcr.io/guleoo/clipboard-x-server`.

## Try the workflow without publishing

Push the commits containing the workflow, then select **Actions → Release → Run workflow** on
GitHub. This manual run validates the project, builds and smoke-tests all six packages, and leaves
them as downloadable workflow artifacts. It does **not** create a GitHub Release or push an image.

## Publish a beta or stable release

1. Set the root `package.json` version, run `bun install` to update `bun.lock`, run the local tests,
   commit the changes, and push the commit.
2. Create and push an immutable tag pointing to that commit. A stable tag must be exactly
   `v<package.version>`; a prerelease tag adds a suffix such as `-beta.1`.
3. GitHub verifies the tag, builds and smoke-tests all six native archives, checks that all six
   artifacts are present and readable, writes `SHA256SUMS`, then creates the Release. It also builds
   and pushes the multi-platform GHCR image. A tag with a hyphen becomes a prerelease and receives
   only its versioned image tag; a stable tag also updates `latest`.

For the current `0.1.0` package version, after pushing the commit:

```sh
git tag -a v0.1.0-beta.1 -m "Beta 1"
git push clipboard-x-server v0.1.0-beta.1
```

For the final release, create and push `v0.1.0` instead. `clipboard-x-server` above is this local
repository's Git remote name; substitute yours if different. Do not move a published tag. A new
version should receive a new commit and tag.

The workflow only publishes after every native build succeeds. Running it again for a tag that
already has a GitHub Release does not overwrite that release. GitHub also shows its own automatic
source-code archives in addition to the six platform packages.

The first GHCR publication may require the repository owner to set the package visibility to
**Public** in GitHub Packages before anonymous `docker compose` deployments can pull it.
