import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../db"
import { channelMembers, channels, devices } from "../db/schema"

export type ChannelRow = typeof channels.$inferSelect

export class ChannelRepo {
  save(input: { readonly id: string; readonly name: string; readonly now: number }): void {
    db.insert(channels).values({
      id: input.id,
      name: input.name,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    }).onConflictDoUpdate({
      target: channels.id,
      set: { name: input.name, updatedAt: input.now, deletedAt: null },
    }).run()
  }

  activeIds(): readonly string[] {
    return db.select({ id: channels.id }).from(channels)
      .where(isNull(channels.deletedAt)).all().map(({ id }) => id)
  }

  archive(id: string, now: number): void {
    db.update(channels).set({ deletedAt: now, updatedAt: now })
      .where(eq(channels.id, id)).run()
    this.clearMembers(id)
  }

  clearMembers(channelId: string): void {
    db.delete(channelMembers).where(eq(channelMembers.channelId, channelId)).run()
  }

  addMember(channelId: string, deviceId: string, joinedAt: number): void {
    db.insert(channelMembers).values({ channelId, deviceId, joinedAt })
      .onConflictDoNothing().run()
  }

  removeMember(channelId: string, deviceId: string): void {
    db.delete(channelMembers).where(and(
      eq(channelMembers.channelId, channelId),
      eq(channelMembers.deviceId, deviceId),
    )).run()
  }

  list(): readonly ChannelRow[] {
    return db.select().from(channels).where(isNull(channels.deletedAt))
      .orderBy(sql`${channels.name} collate nocase`, channels.id).all()
  }

  memberRows() {
    return db.select({
      channelId: channelMembers.channelId,
      id: devices.id,
      tag: devices.tag,
      iconKind: devices.iconKind,
      state: devices.state,
      disabledAt: devices.disabledAt,
    }).from(channelMembers).innerJoin(devices, eq(devices.id, channelMembers.deviceId))
      .where(isNull(devices.deletedAt)).orderBy(sql`${devices.tag} collate nocase`).all()
  }

  listForDevice(deviceId: string): readonly ChannelRow[] {
    return db.select({
      id: channels.id,
      name: channels.name,
      createdAt: channels.createdAt,
      updatedAt: channels.updatedAt,
      deletedAt: channels.deletedAt,
    }).from(channels).innerJoin(channelMembers, eq(channelMembers.channelId, channels.id)).where(and(
      eq(channelMembers.deviceId, deviceId),
      isNull(channels.deletedAt),
    )).orderBy(sql`${channels.name} collate nocase`, channels.id).all()
  }

  create(id: string, name: string, now: number): void {
    db.insert(channels).values({ id, name, createdAt: now, updatedAt: now }).run()
  }

  update(id: string, name: string, now: number): number {
    return db.update(channels).set({ name, updatedAt: now }).where(and(
      eq(channels.id, id),
      isNull(channels.deletedAt),
    )).returning({ id: channels.id }).all().length
  }

  softDelete(id: string, now: number): number {
    return db.update(channels).set({ deletedAt: now, updatedAt: now }).where(and(
      eq(channels.id, id),
      isNull(channels.deletedAt),
    )).returning({ id: channels.id }).all().length
  }

  get(id: string): ChannelRow | undefined {
    return db.select().from(channels).where(and(
      eq(channels.id, id),
      isNull(channels.deletedAt),
    )).get()
  }

  exists(id: string): boolean {
    return Boolean(db.select({ id: channels.id }).from(channels).where(eq(channels.id, id)).get())
  }

  activeDeviceExists(id: string): boolean {
    return Boolean(db.select({ id: devices.id }).from(devices).where(and(
      eq(devices.id, id),
      isNull(devices.deletedAt),
    )).get())
  }

  isMember(channelId: string, deviceId: string): boolean {
    return Boolean(db.select({ id: channelMembers.deviceId }).from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId)).where(and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.deviceId, deviceId),
        isNull(channels.deletedAt),
      )).get())
  }

  memberIds(channelId: string): readonly string[] {
    return db.select({ id: channelMembers.deviceId }).from(channelMembers)
      .where(eq(channelMembers.channelId, channelId)).all().map(({ id }) => id)
  }
}
