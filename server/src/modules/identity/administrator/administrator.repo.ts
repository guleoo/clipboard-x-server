import { and, eq, gt, lte } from "drizzle-orm"
import type { ApplicationDatabase } from "../../../db"
import { adminSessions, administrators } from "../../../db/schema"

export class AdministratorRepo {
  constructor(private readonly database: ApplicationDatabase) {}

  administrator() {
    return this.database.current.select().from(administrators).where(eq(administrators.id, 1)).get()
  }

  administratorByUsername(username: string) {
    return this.database.current.select().from(administrators).where(and(
      eq(administrators.id, 1),
      eq(administrators.username, username),
    )).get()
  }

  saveAdministrator(input: {
    readonly username: string
    readonly passwordHash: string
    readonly createdAt: number
    readonly updatedAt: number
  }): void {
    this.database.current.insert(administrators).values({ id: 1, ...input }).onConflictDoUpdate({
      target: administrators.id,
      set: {
        username: input.username,
        passwordHash: input.passwordHash,
        updatedAt: input.updatedAt,
      },
    }).run()
  }

  updateAdministrator(username: string, passwordHash: string, updatedAt: number): void {
    this.database.current.update(administrators).set({ username, passwordHash, updatedAt })
      .where(eq(administrators.id, 1)).run()
  }

  clearSessions(): void {
    this.database.current.delete(adminSessions).run()
  }

  createSession(input: typeof adminSessions.$inferInsert): void {
    this.database.current.insert(adminSessions).values(input).run()
  }

  session(tokenHash: string, now: number) {
    return this.database.current.select({
      id: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      lastSeenAt: adminSessions.lastSeenAt,
      username: administrators.username,
      administratorCreatedAt: administrators.createdAt,
    }).from(adminSessions).innerJoin(administrators, eq(administrators.id, 1)).where(and(
      eq(adminSessions.tokenHash, tokenHash),
      gt(adminSessions.expiresAt, now),
    )).get()
  }

  touchSession(id: string, lastSeenAt: number): void {
    this.database.current.update(adminSessions).set({ lastSeenAt }).where(eq(adminSessions.id, id)).run()
  }

  deleteSession(tokenHash: string): void {
    this.database.current.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash)).run()
  }

  purgeExpiredSessions(now: number): number {
    return this.database.current.delete(adminSessions).where(lte(adminSessions.expiresAt, now))
      .returning({ id: adminSessions.id }).all().length
  }
}
