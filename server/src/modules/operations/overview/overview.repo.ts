import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import type { ApplicationDatabase } from "../../../db"
import { channels, clipboardItems, devices, transfers } from "../../../db/schema"

export class OverviewRepo {
  constructor(private readonly database: ApplicationDatabase) {}

  snapshot(now: number) {
    const count = (value: number | undefined): number => Number(value ?? 0)
    const deviceTotal = this.database.current.select({ count: sql<number>`count(*)` }).from(devices)
      .where(isNull(devices.deletedAt)).get()
    const online = this.database.current.select({ count: sql<number>`count(*)` }).from(devices)
      .where(and(isNull(devices.deletedAt), isNull(devices.disabledAt), gte(devices.lastSeenAt, now - 120_000))).get()
    const disabled = this.database.current.select({ count: sql<number>`count(*)` }).from(devices)
      .where(and(isNull(devices.deletedAt), isNotNull(devices.disabledAt))).get()
    const channelTotal = this.database.current.select({ count: sql<number>`count(*)` }).from(channels)
      .where(isNull(channels.deletedAt)).get()
    const itemTotal = this.database.current.select({ count: sql<number>`count(*)` }).from(clipboardItems)
      .where(and(eq(clipboardItems.visible, true), isNull(clipboardItems.deletedAt))).get()
    const failed = this.database.current.select({ count: sql<number>`count(*)` }).from(transfers)
      .where(inArray(transfers.state, ["failed", "expired"])).get()
    const recent = this.database.current.select().from(transfers).orderBy(desc(transfers.updatedAt)).limit(8).all()
    return {
      devices: { total: count(deviceTotal?.count), online: count(online?.count), disabled: count(disabled?.count) },
      channels: count(channelTotal?.count),
      items: count(itemTotal?.count),
      failedTransfers: count(failed?.count),
      recentTransfers: recent.map((row) => ({
        id: row.id, itemId: row.itemId, state: row.state, kind: row.kind,
        direction: row.direction, updatedAt: row.updatedAt,
      })),
    }
  }
}
