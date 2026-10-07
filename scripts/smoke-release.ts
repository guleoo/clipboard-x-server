import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { archiveExtension, executableName, releaseName, releaseTag, releaseTarget } from "./release";

const root = resolve(import.meta.dir, "..");
const { version } = await Bun.file(resolve(root, "package.json")).json();
const target = releaseTarget(process.platform, process.arch, process.env.CBX_RELEASE_TARGET);
const name = releaseName(releaseTag(version, process.env.CBX_RELEASE_TAG), target);
const directory = await mkdtemp(resolve(tmpdir(), "clipboard-x-release-smoke-"));
let child: Bun.Subprocess | undefined;

try {
  const extraction = Bun.spawn(["tar", "-xf", resolve(root, "release", `${name}.${archiveExtension(target)}`), "-C", directory], {
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await extraction.exited, 0, "Release archive extraction failed");

  const release = resolve(directory, name);
  const configuration = resolve(release, "config.yaml");
  const document = parseDocument(await readFile(resolve(release, "config.example.yaml"), "utf8"));
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") });
  const origin = `http://127.0.0.1:${reservation.port}`;
  document.setIn(["app", "host"], "127.0.0.1");
  document.setIn(["app", "port"], reservation.port);
  document.setIn(["logger", "console", "enabled"], false);
  document.setIn(["logger", "file", "enabled"], false);
  await reservation.stop(true);
  await writeFile(configuration, document.toString());

  // Run the extracted executable outside the source checkout and its working directory.
  child = Bun.spawn([resolve(release, executableName(target)), "--config", configuration, "--migrate", "--serve"], {
    cwd: directory,
    stdout: "inherit",
    stderr: "inherit",
  });
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    if (child.exitCode !== null) throw new Error(`Release executable exited with code ${child.exitCode}`);
    const response = await fetch(`${origin}/health/ready`, {
      signal: AbortSignal.timeout(500),
    }).catch(() => undefined);
    ready = response?.ok ?? false;
    if (!ready) await Bun.sleep(100);
  }
  assert(ready, "Release executable did not become ready");
  assert(await Bun.file(resolve(release, "data/clipboard-x.db")).exists(), "SQLite must remain inside the release directory");

  const expected = await readFile(resolve(release, "web/index.html"), "utf8");
  const page = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
  assert.equal(page.status, 200);
  assert.equal(await page.text(), expected, "Executable must serve the bundled Web entry point");
  const asset = expected.match(/src="(\/assets\/[^"]+)"/u)?.[1];
  assert(asset, "Web entry point must reference its built JavaScript");
  const response = await fetch(`${origin}${asset}`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200);
  assert(Buffer.from(await response.arrayBuffer()).equals(await readFile(resolve(release, "web", asset.slice(1)))),
    "Executable must serve the bundled JavaScript");
  console.log("Release archive, SQLite initialization, and Web assets smoke test passed");
} finally {
  if (child) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
  }
  await rm(directory, { recursive: true, force: true });
}
