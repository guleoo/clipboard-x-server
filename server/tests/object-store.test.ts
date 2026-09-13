import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { ObjectStore } from "../src/modules/clipboard/object"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function digest(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

describe("object store", () => {
  test("streams, verifies, deduplicates and removes temporary files after failure", async () => {
    const directory = await mkdtemp("/tmp/clipboard-x-objects-")
    directories.push(directory)
    const store = new ObjectStore(directory)
    await store.initialize()
    const bytes = new TextEncoder().encode("streamed object")
    const progress: number[] = []
    const stored = await store.write(new Blob([bytes]).stream(), {
      size: bytes.byteLength,
      sha256: digest(bytes),
      maximumBytes: 1024,
      onProgress: (value) => progress.push(value),
    })
    expect(await store.size(stored.path)).toBe(bytes.byteLength)
    expect(progress.at(-1)).toBe(bytes.byteLength)
    expect((await store.write(new Blob([bytes]).stream(), {
      size: bytes.byteLength,
      sha256: digest(bytes),
      maximumBytes: 1024,
    })).path).toBe(stored.path)
    expect(await store.files()).toEqual([stored.path])

    await expect(store.write(new Blob([bytes]).stream(), {
      size: bytes.byteLength,
      sha256: "0".repeat(64),
      maximumBytes: 1024,
    })).rejects.toMatchObject({ code: "hash_mismatch" })
    expect(await store.files()).toEqual([stored.path])
  })

  test("rejects data beyond declared and configured limits", async () => {
    const directory = await mkdtemp("/tmp/clipboard-x-objects-")
    directories.push(directory)
    const store = new ObjectStore(directory)
    await store.initialize()
    const bytes = new Uint8Array(16)
    await expect(store.write(new Blob([bytes]).stream(), {
      size: 8,
      sha256: digest(bytes),
      maximumBytes: 64,
    })).rejects.toMatchObject({ code: "too_large" })
    await expect(store.write(new Blob([bytes]).stream(), {
      size: 16,
      sha256: digest(bytes),
      maximumBytes: 8,
    })).rejects.toMatchObject({ code: "too_large" })
  })
})
