import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { DomainError } from "../../common/error"
import { createId } from "../../common/identity"

export interface ObjectWriteExpectation {
  readonly size: number
  readonly sha256: string
  readonly maximumBytes: number
  readonly signal?: AbortSignal
  readonly onProgress?: (completedBytes: number) => void
}

export interface StoredObject {
  readonly sha256: string
  readonly size: number
  readonly path: string
}

export class ObjectStore {
  private readonly temporaryDirectory: string

  constructor(public readonly root: string) {
    this.temporaryDirectory = join(root, ".tmp")
  }

  async initialize(): Promise<void> {
    await mkdir(this.temporaryDirectory, { recursive: true, mode: 0o700 })
  }

  path(sha256: string): string {
    return join(this.root, sha256.slice(0, 2), sha256.slice(2, 4), sha256)
  }

  async write(
    stream: ReadableStream<Uint8Array> | null,
    expectation: ObjectWriteExpectation,
  ): Promise<StoredObject> {
    if (expectation.size > expectation.maximumBytes) {
      throw new DomainError("too_large", "Object exceeds the configured byte limit", 413)
    }
    const temporaryPath = join(this.temporaryDirectory, `${createId()}.part`)
    const sink = Bun.file(temporaryPath).writer({ highWaterMark: 64 * 1024 })
    const hash = new Bun.CryptoHasher("sha256")
    const reader = stream?.getReader()
    let size = 0

    try {
      while (reader) {
        if (expectation.signal?.aborted) throw expectation.signal.reason ?? new Error("Upload aborted")
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > expectation.maximumBytes || size > expectation.size) {
          throw new DomainError("too_large", "Upload body exceeds its declared size", 413)
        }
        hash.update(part.value)
        sink.write(part.value)
        expectation.onProgress?.(size)
      }
      await sink.end()
      if (size !== expectation.size) {
        throw new DomainError("invalid_request", "Content-Length does not match the declared size", 400)
      }
      const digest = hash.digest("hex")
      if (digest !== expectation.sha256) {
        throw new DomainError("hash_mismatch", "Uploaded object SHA-256 does not match its manifest", 422)
      }

      const destination = this.path(digest)
      await mkdir(join(this.root, digest.slice(0, 2), digest.slice(2, 4)), { recursive: true, mode: 0o700 })
      if (await Bun.file(destination).exists()) {
        await rm(temporaryPath, { force: true })
      } else {
        await rename(temporaryPath, destination)
        await chmod(destination, 0o600)
      }
      return { sha256: digest, size, path: destination }
    } catch (cause) {
      try {
        await sink.end()
      } catch {
        // The original error is more useful than a secondary sink failure.
      }
      await rm(temporaryPath, { force: true })
      throw cause
    } finally {
      await reader?.cancel().catch(() => undefined)
    }
  }

  file(path: string): Bun.BunFile {
    return Bun.file(path)
  }

  async files(): Promise<readonly string[]> {
    const result: string[] = []
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (path === this.temporaryDirectory) continue
        if (entry.isDirectory()) await visit(path)
        else if (entry.isFile()) result.push(path)
      }
    }
    await visit(this.root)
    return result
  }

  async remove(path: string): Promise<void> {
    await rm(path, { force: true })
  }

  async size(path: string): Promise<number | undefined> {
    try {
      return (await stat(path)).size
    } catch {
      return undefined
    }
  }
}
