import { and, desc, eq, isNotNull, lte, notInArray } from "drizzle-orm"
import { db } from "../db"
import { transfers } from "../db/schema"

export type TransferRow = typeof transfers.$inferSelect

export class TransferRepo {
  create(input: typeof transfers.$inferInsert): void {
    db.insert(transfers).values(input).run()
  }

  get(id: string): TransferRow | undefined {
    return db.select().from(transfers).where(eq(transfers.id, id)).get()
  }

  list(deviceId: string | undefined, limit: number): readonly TransferRow[] {
    const query = db.select().from(transfers)
    return deviceId
      ? query.where(eq(transfers.deviceId, deviceId)).orderBy(desc(transfers.updatedAt)).limit(limit).all()
      : query.orderBy(desc(transfers.updatedAt)).limit(limit).all()
  }

  update(id: string, input: {
    readonly state: string
    readonly completedBytes: number
    readonly errorCode: string | null
    readonly errorMessage: string | null
    readonly updatedAt: number
  }): void {
    db.update(transfers).set(input).where(eq(transfers.id, id)).run()
  }

  expire(now: number): number {
    return db.update(transfers).set({
      state: "expired",
      errorCode: "transfer_expired",
      errorMessage: "Transfer expired",
      updatedAt: now,
    }).where(and(
      isNotNull(transfers.expiresAt),
      lte(transfers.expiresAt, now),
      notInArray(transfers.state, ["completed", "failed", "cancelled", "expired"]),
    )).returning({ id: transfers.id }).all().length
  }
}
