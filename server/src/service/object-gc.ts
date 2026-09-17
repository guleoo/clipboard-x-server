import { rmSync } from "node:fs"
import { config } from "../config"
import { ObjectGcRepo } from "../repo/object-gc"
import { objectStore } from "../repo/object"

export class ObjectCollector {
  private readonly repo = new ObjectGcRepo()

  plan(now = Date.now()) {
    return this.repo.plan(now - config.cleanup.objects.graceMillis)
  }

  collect(now = Date.now(), options = config.cleanup): number {
    if (!options.enabled || !options.objects.enabled) return 0
    const cutoff = now - options.objects.graceMillis
    let removed = 0
    while (removed < options.execution.maxObjectsPerRun) {
      const limit = Math.min(
        options.execution.objectBatchSize,
        options.execution.maxObjectsPerRun - removed,
      )
      const candidates = this.repo.candidates(cutoff, limit)
      let collected = 0
      for (const object of candidates) {
        if (object.path !== objectStore.path(object.sha256)) {
          throw new Error(`Object ${object.id} has an unexpected storage path`)
        }
        if (this.repo.delete(object.id, cutoff)) {
          rmSync(object.path, { force: true })
          removed += 1
          collected += 1
        }
      }
      if (candidates.length < limit || collected === 0) return removed
    }
    return removed
  }
}

export const objectCollector = new ObjectCollector()
