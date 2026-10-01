# Project checks

These tests protect executable release logic, deployment configuration, version
consistency, and documentation validity. They do not lock down prose, headings,
Action versions, runner names, or equivalent command syntax.

```bash
bun run test:project
bun run test
bun run typecheck
```

`test` runs these checks and both workspace suites; `typecheck` includes these tests.
Server runtime behavior remains in `server/test`, and browser behavior in `web/tests`.

Image-tag tests execute the release workflow's Bash script with temporary output,
covering stable and prerelease tags without contacting GitHub or pushing images.
