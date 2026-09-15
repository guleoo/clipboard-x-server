import { and, eq, gt, lte } from "drizzle-orm"
import { db } from "../db"
import { administrators } from "../db/schema"
import { frameSession } from "../frame/session/schema"

export class AdministratorRepo {
  administrator() {
    return db.select().from(administrators).where(eq(administrators.id, 1)).get()
  }

  administratorByUsername(username: string) {
    return db.select().from(administrators).where(and(
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
    db.insert(administrators).values({ id: 1, ...input }).onConflictDoUpdate({
      target: administrators.id,
      set: {
        username: input.username,
        passwordHash: input.passwordHash,
        updatedAt: input.updatedAt,
      },
    }).run()
  }

  updateAdministrator(username: string, passwordHash: string, updatedAt: number): void {
    db.update(administrators).set({ username, passwordHash, updatedAt })
      .where(eq(administrators.id, 1)).run()
  }

  clearSessions(): void {
    db.delete(frameSession).run()
  }

  purgeExpiredSessions(now: number): number {
    return db.delete(frameSession).where(lte(frameSession.expiresAt, now))
      .returning({ id: frameSession.id }).all().length
  }
}
