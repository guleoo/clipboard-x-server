import { config } from "../config"
import { Lifecycle } from "../frame/core"
import { Log } from "../frame/logger"
import { ClipboardRepo, type ClipboardCleanupPolicy } from "../repo/clipboard"
import { objectCollector } from "./object-gc"

const logger = Log.create({ service: "cleanup" })
const ITEM_BATCH_SIZE = 50
const CANDIDATE_PLAN_SIZE = 1_000

type CleanupConfiguration = typeof config.cleanup

function yieldToRuntime(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export class CleanupService {
  private readonly repo = new ClipboardRepo()
  private timer?: ReturnType<typeof setInterval>
  private activeSweep?: Promise<{ readonly removedItems: number; readonly removedObjects: number }>
  private generation = 0
  private registered = false

  start(): void {
    if (!this.registered) {
      Lifecycle.register({
        name: "server-data-cleanup",
        on: "shutdown",
        phase: "stop",
        event: () => this.shutdown(),
      })
      this.registered = true
    }
    this.configure()
  }

  configure(): void {
    this.generation += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    const policy = config.cleanup
    if (!policy.enabled) return
    this.timer = setInterval(() => {
      void this.sweep().catch((error) => logger.error("Cleanup sweep failed", { error }))
    }, policy.intervalMillis)
    this.timer.unref()
  }

  sweep(): Promise<{ readonly removedItems: number; readonly removedObjects: number }> {
    if (this.activeSweep) return this.activeSweep
    const policy = config.cleanup
    if (!policy.enabled) return Promise.resolve({ removedItems: 0, removedObjects: 0 })
    const generation = this.generation
    const task = this.execute(policy, () => generation === this.generation)
    this.activeSweep = task
    void task.finally(() => {
      if (this.activeSweep === task) this.activeSweep = undefined
    }).catch(() => undefined)
    return task
  }

  async enforceClipboard(
    options: CleanupConfiguration = config.cleanup,
    shouldContinue: () => boolean = () => true,
  ): Promise<number> {
    if (!options.enabled || !this.hasClipboardLimits(options.clipboard)) return 0
    let removed = 0
    while (shouldContinue()) {
      const candidates = this.repo.cleanupCandidates(options.clipboard, Date.now(), CANDIDATE_PLAN_SIZE)
      if (candidates.length === 0) return removed
      let removedFromPlan = 0
      for (let offset = 0; offset < candidates.length && shouldContinue(); offset += ITEM_BATCH_SIZE) {
        const batch = candidates.slice(offset, offset + ITEM_BATCH_SIZE)
        const count = this.repo.transaction(() => {
          const now = Date.now()
          return batch.reduce(
            (total, id) => total + (this.repo.pruneCleanupCandidate(id, now) ? 1 : 0),
            0,
          )
        })
        removed += count
        removedFromPlan += count
        if (offset + ITEM_BATCH_SIZE < candidates.length || candidates.length === CANDIDATE_PLAN_SIZE) {
          await yieldToRuntime()
        }
      }
      if (candidates.length < CANDIDATE_PLAN_SIZE || removedFromPlan === 0) return removed
    }
    return removed
  }

  private async execute(
    policy: CleanupConfiguration,
    shouldContinue: () => boolean,
  ): Promise<{ readonly removedItems: number; readonly removedObjects: number }> {
    const removedItems = await this.enforceClipboard(policy, shouldContinue)
    const removedObjects = await objectCollector.collect(Date.now(), { shouldContinue })
    if (removedItems || removedObjects) {
      logger.info("Cleanup sweep completed", { removedItems, removedObjects })
    }
    return { removedItems, removedObjects }
  }

  private hasClipboardLimits(policy: ClipboardCleanupPolicy): boolean {
    return policy.maxItems !== undefined
      || policy.maxItemsPerChannel !== undefined
      || policy.maxItemsPerDevice !== undefined
      || policy.maxItemsPerDevicePerChannel !== undefined
      || policy.maxAgeMillis !== undefined
  }

  private async shutdown(): Promise<void> {
    this.generation += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await this.activeSweep
  }
}

export const cleanupService = new CleanupService()
