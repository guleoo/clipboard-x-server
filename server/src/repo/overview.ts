import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "../db"
import { channels, clipboardItems, devices, transfers } from "../db/schema"

export class OverviewRepo {
  snapshot(now: number) {
    const count = (value: number | undefined): number => Number(value ?? 0)
    const deviceTotal = db.select({ count: sql<number>`count(*)` }).from(devices)
      .where(isNull(devices.deletedAt)).get()
    const online = db.select({ count: sql<number>`count(*)` }).from(devices)
      .where(and(isNull(devices.deletedAt), isNull(devices.disabledAt), gte(devices.lastSeenAt, now - 120_000))).get()
    const disabled = db.select({ count: sql<number>`count(*)` }).from(devices)
      .where(and(isNull(devices.deletedAt), isNotNull(devices.disabledAt))).get()
    const channelTotal = db.select({ count: sql<number>`count(*)` }).from(channels)
      .where(isNull(channels.deletedAt)).get()
    const itemTotal = db.select({ count: sql<number>`count(*)` }).from(clipboardItems)
      .where(and(eq(clipboardItems.visible, true), isNull(clipboardItems.deletedAt))).get()
    const failed = db.select({ count: sql<number>`count(*)` }).from(transfers)
      .where(inArray(transfers.state, ["failed", "expired"])).get()
    const recent = db.select().from(transfers).orderBy(desc(transfers.updatedAt)).limit(8).all()
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
