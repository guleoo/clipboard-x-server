import { config } from "../config"
import { Lifecycle } from "../frame/core"
import { Log } from "../frame/logger"
import { ClipboardRepo, type ClipboardCleanupPolicy } from "../repo/clipboard"
import { objectCollector } from "./object-gc"

const logger = Log.create({ service: "cleanup" })

interface CleanupScope {
  readonly deviceId: string
  readonly channelId: string
}

interface ConfigureOptions {
  readonly runNow?: boolean
}

type CleanupConfiguration = typeof config.cleanup

export class CleanupService {
  private readonly repo = new ClipboardRepo()
  private timer?: ReturnType<typeof setInterval>
  private registered = false

  start(): void {
    if (!this.registered) {
      Lifecycle.register({
        name: "server-data-cleanup",
        on: "shutdown",
        phase: "stop",
        event: () => this.stop(),
      })
      this.registered = true
    }
    this.configure({ runNow: config.cleanup.triggers.onStartup })
  }

  configure(options: ConfigureOptions = {}): void {
    this.stop()
    const policy = config.cleanup
    if (!policy.enabled) return
    if (policy.triggers.scheduled) {
      this.timer = setInterval(() => {
        try { this.sweep() }
        catch (error) { logger.error("Cleanup sweep failed", { error }) }
      }, policy.triggers.intervalMillis)
      this.timer.unref()
    }
    if (options.runNow) {
      try { this.sweep() }
      catch (error) { logger.error("Cleanup sweep failed", { error }) }
    }
  }

  afterPublish(scope: CleanupScope): number {
    const policy = config.cleanup
    if (!policy.enabled || !policy.triggers.afterPublish) return 0
    return this.enforceClipboard(policy, scope)
  }

  tightens(previous: CleanupConfiguration, next: CleanupConfiguration): boolean {
    if (!next.enabled) return false
    const enablesDeletion = this.hasClipboardLimits(next.clipboard) || next.objects.enabled
    if (!previous.enabled) return enablesDeletion
    const fields = [
      "maxItems",
      "maxItemsPerChannel",
      "maxItemsPerDevice",
      "maxItemsPerDevicePerChannel",
      "maxAgeMillis",
    ] as const
    const tightensClipboard = fields.some((field) =>
      (next.clipboard[field] ?? Infinity) < (previous.clipboard[field] ?? Infinity))
    const tightensObjects = next.objects.enabled
      && (!previous.objects.enabled || next.objects.graceMillis < previous.objects.graceMillis)
    return tightensClipboard || tightensObjects
  }

  sweep(): { readonly removedItems: number; readonly removedObjects: number } {
    const policy = config.cleanup
    if (!policy.enabled) return { removedItems: 0, removedObjects: 0 }
    const removedItems = this.enforceClipboard(policy)
    const removedObjects = objectCollector.collect(Date.now(), policy)
    if (removedItems || removedObjects) {
      logger.info("Cleanup sweep completed", { removedItems, removedObjects })
    }
    return { removedItems, removedObjects }
  }

  enforceClipboard(
    options = config.cleanup,
    scope?: CleanupScope,
  ): number {
    if (!options.enabled || !this.hasClipboardLimits(options.clipboard)) return 0
    const effectiveScope = options.clipboard.maxItems === undefined ? scope : undefined
    let removed = 0
    while (removed < options.execution.maxItemsPerRun) {
      const limit = Math.min(
        options.execution.itemBatchSize,
        options.execution.maxItemsPerRun - removed,
      )
      const count = this.repo.transaction(() => {
        const now = Date.now()
        const candidates = this.repo.cleanupCandidates(
          options.clipboard,
          now,
          limit,
          effectiveScope,
        )
        for (const id of candidates) this.repo.pruneItem(id, now)
        return candidates.length
      })
      removed += count
      if (count < limit) return removed
    }
    return removed
  }

  private hasClipboardLimits(policy: ClipboardCleanupPolicy): boolean {
    return policy.maxItems !== undefined
      || policy.maxItemsPerChannel !== undefined
      || policy.maxItemsPerDevice !== undefined
      || policy.maxItemsPerDevicePerChannel !== undefined
      || policy.maxAgeMillis !== undefined
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}

export const cleanupService = new CleanupService()
