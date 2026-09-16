import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm"
import { db } from "../db"
import { channelMembers, deviceKeys, devices } from "../db/schema"
import { virtualDevice } from "../common/virtual-device"

export type DeviceRow = typeof devices.$inferSelect
export type DeviceKeyRow = typeof deviceKeys.$inferSelect

export class DeviceRepo {
  synchronizeVirtualDevice(now: number): void {
    db.insert(devices).values({
      ...virtualDevice,
      state: "online",
      lastSeenAt: now,
      disabledAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: devices.id,
      set: {
        tag: virtualDevice.tag,
        iconKind: virtualDevice.iconKind,
        state: "online",
        lastSeenAt: now,
        disabledAt: null,
        deletedAt: null,
        updatedAt: now,
      },
    }).run()
  }

  secretHash(id: string): string | undefined {
    return db.select({ value: deviceKeys.secretHash }).from(deviceKeys)
      .where(eq(deviceKeys.id, id)).get()?.value
  }

  deviceIds(): readonly string[] {
    return db.select({ id: devices.id }).from(devices).all().map(({ id }) => id)
  }

  activeKeyIds(): readonly string[] {
    return db.select({ id: deviceKeys.id }).from(deviceKeys)
      .where(isNull(deviceKeys.revokedAt)).all().map(({ id }) => id)
  }

  synchronizeDevice(input: {
    readonly id: string
    readonly disabledAt: number | null
    readonly now: number
  }): void {
    db.insert(devices).values({
      id: input.id,
      tag: "Waiting for device profile",
      iconKind: "other",
      state: "offline",
      lastSeenAt: 0,
      disabledAt: input.disabledAt,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: devices.id,
      set: {
        disabledAt: input.disabledAt,
        deletedAt: null,
      },
    }).run()
  }

  archive(id: string, now: number): void {
    db.update(devices).set({
      state: "unavailable",
      disabledAt: sql`coalesce(${devices.disabledAt}, ${now})`,
      deletedAt: sql`coalesce(${devices.deletedAt}, ${now})`,
      updatedAt: now,
    }).where(eq(devices.id, id)).run()
    this.revokeDeviceKeys(id, now)
    db.delete(channelMembers).where(eq(channelMembers.deviceId, id)).run()
  }

  saveKey(input: {
    readonly id: string
    readonly deviceId: string
    readonly secretHash: string
    readonly createdAt: number
    readonly expiresAt: number | null
  }): void {
    db.insert(deviceKeys).values({ ...input, revokedAt: null }).onConflictDoUpdate({
      target: deviceKeys.id,
      set: {
        deviceId: input.deviceId,
        secretHash: input.secretHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
      },
    }).run()
  }

  revokeKey(id: string, now: number): void {
    db.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(eq(deviceKeys.id, id)).run()
  }

  revokeDeviceKeys(deviceId: string, now: number): void {
    db.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(eq(deviceKeys.deviceId, deviceId)).run()
  }

  list(includeDeleted: boolean): readonly DeviceRow[] {
    const query = db.select().from(devices)
    return includeDeleted
      ? query.orderBy(desc(devices.createdAt)).all()
      : query.where(isNull(devices.deletedAt)).orderBy(desc(devices.createdAt)).all()
  }

  keys(): readonly DeviceKeyRow[] {
    return db.select().from(deviceKeys).orderBy(desc(deviceKeys.createdAt)).all()
  }

  get(id: string): DeviceRow | undefined {
    return db.select().from(devices).where(eq(devices.id, id)).get()
  }

  updateProfile(id: string, input: {
    readonly tag: string
    readonly iconKind: string
    readonly updatedAt: number
    readonly disabledAt?: number | null
  }): void {
    db.update(devices).set({
      tag: input.tag,
      iconKind: input.iconKind,
      updatedAt: input.updatedAt,
      ...(input.disabledAt === undefined ? {} : { disabledAt: input.disabledAt }),
    }).where(eq(devices.id, id)).run()
  }

  delete(id: string, now: number): void {
    db.update(devices).set({
      state: "unavailable",
      disabledAt: sql`coalesce(${devices.disabledAt}, ${now})`,
      deletedAt: now,
      updatedAt: now,
    }).where(eq(devices.id, id)).run()
    this.revokeDeviceKeys(id, now)
    db.delete(channelMembers).where(eq(channelMembers.deviceId, id)).run()
  }

  overlapActiveKeys(deviceId: string, expiresAt: number): void {
    db.update(deviceKeys).set({
      expiresAt: sql`case when ${deviceKeys.expiresAt} is null or ${deviceKeys.expiresAt} > ${expiresAt} then ${expiresAt} else ${deviceKeys.expiresAt} end`,
    }).where(and(eq(deviceKeys.deviceId, deviceId), isNull(deviceKeys.revokedAt))).run()
  }

  insertKey(input: typeof deviceKeys.$inferInsert): void {
    db.insert(deviceKeys).values(input).run()
  }

  revokeOwnedKey(deviceId: string, keyId: string, now: number): number {
    return db.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(and(eq(deviceKeys.id, keyId), eq(deviceKeys.deviceId, deviceId)))
      .returning({ id: deviceKeys.id }).all().length
  }

  activeAuthenticationKey(keyId: string, now: number) {
    return db.select({
      id: deviceKeys.id,
      deviceId: deviceKeys.deviceId,
      secretHash: deviceKeys.secretHash,
      disabledAt: devices.disabledAt,
      deletedAt: devices.deletedAt,
    }).from(deviceKeys).innerJoin(devices, eq(devices.id, deviceKeys.deviceId)).where(and(
      eq(deviceKeys.id, keyId),
      isNull(deviceKeys.revokedAt),
      or(isNull(deviceKeys.expiresAt), gt(deviceKeys.expiresAt, now)),
    )).get()
  }

  touch(id: string, now: number): void {
    db.update(devices).set({ state: "online", lastSeenAt: now, updatedAt: now })
      .where(and(eq(devices.id, id), sql`${now} - ${devices.lastSeenAt} >= 30000`)).run()
  }
}
