import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { Application } from "../src/application"
import { loadConfig } from "../src/entry/config"
import { createTestConfig } from "./support"

const directories: string[] = []
const applications: Application[] = []

afterEach(async () => {
  for (const application of applications.splice(0)) application.close()
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe("authoritative YAML configuration", () => {
  test("console mutations persist secrets and restart reconciles derived database state", async () => {
    const directory = await mkdtemp("/tmp/clipboard-x-configuration-")
    directories.push(directory)
    const config = createTestConfig(directory)
    const first = await Application.create(config)
    applications.push(first)
    const deviceId = "11111111-1111-4111-8111-111111111111"
    first.devices.create({ id: deviceId, tag: "Configured device", iconKind: "laptop" })
    const issued = await first.devices.issueKey(deviceId)
    const channel = first.channels.create("Configured channel")
    first.channels.addMember(channel.id, deviceId)
    await first.auth.update("configured-admin", "configured-password")

    const yaml = await readFile(join(directory, "config.yaml"), "utf8")
    expect(yaml).toContain("\nserver:\n")
    expect(yaml).toContain("\n  supportedMimeTypes:\n")
    expect(yaml).toContain("\ndevices:\n  -\n")
    expect(yaml).toContain("configured-password")
    expect(yaml).toContain(issued.key)
    expect(yaml).toContain(channel.id)
    const passwordHash = first.database.raw.query<{ password_hash: string }, []>(
      "SELECT password_hash FROM administrators WHERE id = 1",
    ).get()?.password_hash
    const secretHash = first.database.raw.query<{ secret_hash: string }, [string]>(
      "SELECT secret_hash FROM device_keys WHERE id = ?",
    ).get(issued.id)?.secret_hash
    expect(passwordHash).toStartWith("$argon2id$")
    expect(passwordHash).not.toContain("configured-password")
    expect(secretHash).toStartWith("$argon2id$")
    expect(secretHash).not.toContain(issued.key)

    first.close()
    applications.splice(applications.indexOf(first), 1)
    const second = await Application.create(loadConfig(join(directory, "config.yaml")))
    applications.push(second)
    expect((await second.auth.login("configured-admin", "configured-password")).administrator.username)
      .toBe("configured-admin")
    expect((await second.devices.authenticate(issued.key, deviceId)).deviceId).toBe(deviceId)
    expect(second.channels.listForDevice(deviceId).map((value) => value.id)).toEqual([channel.id])
  }, 30_000)

  test("failed database application restores the previous YAML atomically", async () => {
    const directory = await mkdtemp("/tmp/clipboard-x-configuration-")
    directories.push(directory)
    const config = createTestConfig(directory)
    const before = await readFile(config.configuration.path, "utf8")
    expect(() => config.configuration.change(
      (configuration) => {
        configuration.administrator.username = "must-not-persist"
      },
      () => {
        throw new Error("database failed")
      },
    )).toThrow("database failed")
    expect(await readFile(config.configuration.path, "utf8")).toBe(before)
    expect((await stat(config.configuration.path)).mode & 0o777).toBe(0o600)
  })
})
