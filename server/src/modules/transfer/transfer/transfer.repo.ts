import { and, desc, eq, isNotNull, lte, notInArray } from "drizzle-orm"
import type { ApplicationDatabase } from "../../../db"
import { transfers } from "../../../db/schema"

export type TransferRow = typeof transfers.$inferSelect

export class TransferRepo {
  constructor(private readonly database: ApplicationDatabase) {}

  create(input: typeof transfers.$inferInsert): void {
    this.database.current.insert(transfers).values(input).run()
  }

  get(id: string): TransferRow | undefined {
    return this.database.current.select().from(transfers).where(eq(transfers.id, id)).get()
  }

  list(deviceId: string | undefined, limit: number): readonly TransferRow[] {
    const query = this.database.current.select().from(transfers)
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
    this.database.current.update(transfers).set(input).where(eq(transfers.id, id)).run()
  }

  expire(now: number): number {
    return this.database.current.update(transfers).set({
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
