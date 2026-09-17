import { config } from "../config"
import { ClipboardRepo, type RetentionPolicy } from "../repo/clipboard"
import { Lifecycle } from "../frame/core"
import { Log } from "../frame/logger"
import { objectCollector } from "./object-gc"

const logger = Log.create({ service: "retention" })

export class RetentionService {
  private readonly repo = new ClipboardRepo()
  private timer?: ReturnType<typeof setInterval>
  private registered = false

  start(): void {
    if (!this.registered) {
      Lifecycle.register({
        name: "clipboard-retention",
        on: "shutdown",
        phase: "stop",
        event: () => this.stop(),
      })
      this.registered = true
    }
    this.configure()
  }

  configure(): void {
    this.stop()
    const policy = config.retention
    if (policy.maxItemsPerDevice === undefined && policy.maxItemsPerChannel === undefined
      && policy.maxAgeMillis === undefined) return
    this.timer = setInterval(() => {
      try { this.sweep() }
      catch (error) { logger.error("Retention sweep failed", { error }) }
    }, policy.sweepIntervalMillis)
    this.timer.unref()
    try { this.sweep() }
    catch (error) { logger.error("Retention sweep failed", { error }) }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  sweep(): void {
    const removedItems = this.enforce()
    const removedObjects = objectCollector.collect()
    if (removedItems || removedObjects) logger.info("Retention sweep completed", { removedItems, removedObjects })
  }

  enforce(policy: RetentionPolicy = config.retention, scope?: { readonly deviceId: string; readonly channelId: string }): number {
    if (policy.maxItemsPerDevice === undefined && policy.maxItemsPerChannel === undefined
      && policy.maxAgeMillis === undefined) return 0
    let removed = 0
    while (true) {
      const count = this.repo.transaction(() => {
        const now = Date.now()
        const candidates = this.repo.retentionCandidates(policy, now, 100, scope)
        for (const id of candidates) this.repo.pruneItem(id, now)
        return candidates.length
      })
      removed += count
      if (count < 100) return removed
    }
  }
}

export const retentionService = new RetentionService()
