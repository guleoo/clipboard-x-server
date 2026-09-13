import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm"
import type { ApplicationDatabase } from "../../../db"
import { channelMembers, deviceKeys, devices } from "../../../db/schema"

export type DeviceRow = typeof devices.$inferSelect
export type DeviceKeyRow = typeof deviceKeys.$inferSelect

export class DeviceRepo {
  constructor(private readonly database: ApplicationDatabase) {}

  secretHash(id: string): string | undefined {
    return this.database.current.select({ value: deviceKeys.secretHash }).from(deviceKeys)
      .where(eq(deviceKeys.id, id)).get()?.value
  }

  deviceIds(): readonly string[] {
    return this.database.current.select({ id: devices.id }).from(devices).all().map(({ id }) => id)
  }

  activeKeyIds(): readonly string[] {
    return this.database.current.select({ id: deviceKeys.id }).from(deviceKeys)
      .where(isNull(deviceKeys.revokedAt)).all().map(({ id }) => id)
  }

  synchronizeDevice(input: {
    readonly id: string
    readonly tag: string
    readonly iconKind: string
    readonly disabledAt: number | null
    readonly now: number
  }): void {
    this.database.current.insert(devices).values({
      id: input.id,
      tag: input.tag,
      iconKind: input.iconKind,
      state: "offline",
      lastSeenAt: 0,
      disabledAt: input.disabledAt,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: devices.id,
      set: {
        tag: input.tag,
        iconKind: input.iconKind,
        disabledAt: input.disabledAt,
        deletedAt: null,
        updatedAt: input.now,
      },
    }).run()
  }

  archive(id: string, now: number): void {
    this.database.current.update(devices).set({
      state: "unavailable",
      disabledAt: sql`coalesce(${devices.disabledAt}, ${now})`,
      deletedAt: sql`coalesce(${devices.deletedAt}, ${now})`,
      updatedAt: now,
    }).where(eq(devices.id, id)).run()
    this.revokeDeviceKeys(id, now)
    this.database.current.delete(channelMembers).where(eq(channelMembers.deviceId, id)).run()
  }

  saveKey(input: {
    readonly id: string
    readonly deviceId: string
    readonly secretHash: string
    readonly createdAt: number
    readonly expiresAt: number | null
  }): void {
    this.database.current.insert(deviceKeys).values({ ...input, revokedAt: null }).onConflictDoUpdate({
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
    this.database.current.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(eq(deviceKeys.id, id)).run()
  }

  revokeDeviceKeys(deviceId: string, now: number): void {
    this.database.current.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(eq(deviceKeys.deviceId, deviceId)).run()
  }

  list(includeDeleted: boolean): readonly DeviceRow[] {
    const query = this.database.current.select().from(devices)
    return includeDeleted
      ? query.orderBy(desc(devices.createdAt)).all()
      : query.where(isNull(devices.deletedAt)).orderBy(desc(devices.createdAt)).all()
  }

  keys(): readonly DeviceKeyRow[] {
    return this.database.current.select().from(deviceKeys).orderBy(desc(deviceKeys.createdAt)).all()
  }

  get(id: string): DeviceRow | undefined {
    return this.database.current.select().from(devices).where(eq(devices.id, id)).get()
  }

  saveDevice(input: {
    readonly id: string
    readonly tag: string
    readonly iconKind: string
    readonly now: number
  }): void {
    this.database.current.insert(devices).values({
      id: input.id,
      tag: input.tag,
      iconKind: input.iconKind,
      state: "offline",
      lastSeenAt: 0,
      createdAt: input.now,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: devices.id,
      set: {
        tag: input.tag,
        iconKind: input.iconKind,
        state: "offline",
        disabledAt: null,
        deletedAt: null,
        updatedAt: input.now,
      },
    }).run()
  }

  updateProfile(id: string, input: {
    readonly tag: string
    readonly iconKind: string
    readonly updatedAt: number
    readonly disabledAt?: number | null
  }): void {
    this.database.current.update(devices).set({
      tag: input.tag,
      iconKind: input.iconKind,
      updatedAt: input.updatedAt,
      ...(input.disabledAt === undefined ? {} : { disabledAt: input.disabledAt }),
    }).where(eq(devices.id, id)).run()
  }

  delete(id: string, now: number): void {
    this.database.current.update(devices).set({
      state: "unavailable",
      disabledAt: sql`coalesce(${devices.disabledAt}, ${now})`,
      deletedAt: now,
      updatedAt: now,
    }).where(eq(devices.id, id)).run()
    this.revokeDeviceKeys(id, now)
    this.database.current.delete(channelMembers).where(eq(channelMembers.deviceId, id)).run()
  }

  overlapActiveKeys(deviceId: string, expiresAt: number): void {
    this.database.current.update(deviceKeys).set({
      expiresAt: sql`case when ${deviceKeys.expiresAt} is null or ${deviceKeys.expiresAt} > ${expiresAt} then ${expiresAt} else ${deviceKeys.expiresAt} end`,
    }).where(and(eq(deviceKeys.deviceId, deviceId), isNull(deviceKeys.revokedAt))).run()
  }

  insertKey(input: typeof deviceKeys.$inferInsert): void {
    this.database.current.insert(deviceKeys).values(input).run()
  }

  revokeOwnedKey(deviceId: string, keyId: string, now: number): number {
    return this.database.current.update(deviceKeys).set({
      revokedAt: sql`coalesce(${deviceKeys.revokedAt}, ${now})`,
    }).where(and(eq(deviceKeys.id, keyId), eq(deviceKeys.deviceId, deviceId)))
      .returning({ id: deviceKeys.id }).all().length
  }

  activeAuthenticationKey(keyId: string, now: number) {
    return this.database.current.select({
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
    this.database.current.update(devices).set({ state: "online", lastSeenAt: now, updatedAt: now })
      .where(and(eq(devices.id, id), sql`${now} - ${devices.lastSeenAt} >= 30000`)).run()
  }
}
