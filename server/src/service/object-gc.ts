import { rmSync } from "node:fs"
import { config } from "../config"
import { ObjectGcRepo } from "../repo/object-gc"
import { objectStore } from "../repo/object"

export class ObjectCollector {
  private readonly repo = new ObjectGcRepo()

  plan(now = Date.now()) {
    return this.repo.plan(now - config.objectGcGraceMillis)
  }

  collect(now = Date.now()): number {
    const cutoff = now - config.objectGcGraceMillis
    let removed = 0
    while (true) {
      const candidates = this.repo.candidates(cutoff)
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
      if (candidates.length < 100 || collected === 0) return removed
    }
  }
}

export const objectCollector = new ObjectCollector()
