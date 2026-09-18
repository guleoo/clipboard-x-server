import { ObjectGcRepo } from "../repo/object-gc"
import { objectStore } from "../repo/object"

export const OBJECT_COLLECTION_GRACE_MILLIS = 86_400_000
const OBJECT_BATCH_SIZE = 50

interface CollectionOptions {
  readonly shouldContinue?: () => boolean
}

function yieldToRuntime(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export class ObjectCollector {
  private readonly repo = new ObjectGcRepo()

  plan(now = Date.now()) {
    return this.repo.plan(now - OBJECT_COLLECTION_GRACE_MILLIS)
  }

  async collect(now = Date.now(), options: CollectionOptions = {}): Promise<number> {
    const cutoff = now - OBJECT_COLLECTION_GRACE_MILLIS
    const shouldContinue = options.shouldContinue ?? (() => true)
    let removed = 0
    while (shouldContinue()) {
      const candidates = this.repo.candidates(cutoff, OBJECT_BATCH_SIZE)
      let collected = 0
      for (const object of candidates) {
        if (object.path !== objectStore.path(object.sha256)) {
          throw new Error(`Object ${object.id} has an unexpected storage path`)
        }
        if (this.repo.delete(object.id, cutoff)) {
          await objectStore.remove(object.path)
          removed += 1
          collected += 1
        }
      }
      if (candidates.length < OBJECT_BATCH_SIZE || collected === 0) return removed
      await yieldToRuntime()
    }
    return removed
  }
}

export const objectCollector = new ObjectCollector()
