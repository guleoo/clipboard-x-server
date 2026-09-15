import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { createId, type Fields } from "../core";
import type { DbFacade } from "../db";
import { SessionConfig } from "./config";
import { frameSession } from "./schema";

export interface SessionRecord {
  readonly id: string;
  readonly uid: string;
  readonly tenantId?: string;
  readonly permissionKeys: readonly string[];
  readonly createdAt: number;
  readonly lastActiveAt: number;
  readonly expiresAt: number;
}

export interface CreateSessionInput {
  readonly uid: string;
  readonly tenantId?: string;
  readonly permissionKeys?: readonly string[];
  readonly ttlMillis?: number;
}

export interface SessionCredential {
  readonly token: string;
  readonly session: SessionRecord;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function record(row: typeof frameSession.$inferSelect): SessionRecord {
  return {
    id: row.id,
    uid: row.uid,
    tenantId: row.tenantId ?? undefined,
    permissionKeys: row.permissionKeys,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
  };
}

function activeWhere(now: number) {
  return and(isNull(frameSession.revokedAt), gt(frameSession.expiresAt, now));
}

export interface SessionStore {
  create(input: CreateSessionInput): SessionCredential;
  get(id: string): SessionRecord | undefined;
  resolve(token: string): SessionRecord | undefined;
  listByUser(uid: string): readonly SessionRecord[];
  revoke(id: string): void;
  revokeUser(uid: string): void;
  purgeExpired(): number;
}

export function createSessionStore<Schema extends Fields>(
  database: DbFacade<Schema>,
): SessionStore {
  function create(input: CreateSessionInput): SessionCredential {
    const now = Date.now();
    const token = randomBytes(SessionConfig.tokenBytes).toString("base64url");
    const row: typeof frameSession.$inferInsert = {
      id: createId(),
      tokenHash: tokenHash(token),
      uid: input.uid,
      tenantId: input.tenantId,
      permissionKeys: input.permissionKeys ?? [],
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + (input.ttlMillis ?? SessionConfig.ttlMillis),
      revokedAt: null,
    };
    database.insert(frameSession).values(row).run();
    return { token, session: record(row as typeof frameSession.$inferSelect) };
  }

  function get(id: string): SessionRecord | undefined {
    const row = database
      .select()
      .from(frameSession)
      .where(and(eq(frameSession.id, id), activeWhere(Date.now())))
      .get();
    return row ? record(row) : undefined;
  }

  function resolve(token: string): SessionRecord | undefined {
    const now = Date.now();
    const row = database
      .select()
      .from(frameSession)
      .where(and(eq(frameSession.tokenHash, tokenHash(token)), activeWhere(now)))
      .get();
    if (!row) return undefined;
    if (now - row.lastActiveAt >= SessionConfig.touchIntervalMillis) {
      database
        .update(frameSession)
        .set({ lastActiveAt: now })
        .where(eq(frameSession.id, row.id))
        .run();
      row.lastActiveAt = now;
    }
    return record(row);
  }

  function listByUser(uid: string): readonly SessionRecord[] {
    return database
      .select()
      .from(frameSession)
      .where(and(eq(frameSession.uid, uid), activeWhere(Date.now())))
      .orderBy(desc(frameSession.lastActiveAt))
      .all()
      .map(record);
  }

  function revoke(id: string): void {
    database
      .update(frameSession)
      .set({ revokedAt: Date.now() })
      .where(and(eq(frameSession.id, id), isNull(frameSession.revokedAt)))
      .run();
  }

  function revokeUser(uid: string): void {
    database
      .update(frameSession)
      .set({ revokedAt: Date.now() })
      .where(and(eq(frameSession.uid, uid), isNull(frameSession.revokedAt)))
      .run();
  }

  function purgeExpired(): number {
    return database
      .delete(frameSession)
      .where(lte(frameSession.expiresAt, Date.now()))
      .returning({ id: frameSession.id })
      .all().length;
  }

  return Object.freeze({
    create,
    get,
    resolve,
    listByUser,
    revoke,
    revokeUser,
    purgeExpired,
  });
}
