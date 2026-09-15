import {
  id,
  id_like,
  int,
  str_list,
  table,
  varchar,
} from "../db/dbtype";

export const frameSession = table("admin_sessions", {
  id: id(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  uid: id_like("uid").notNull(),
  tenantId: id_like("tenant_id"),
  permissionKeys: str_list("permission_keys").notNull().default([]),
  createdAt: int("created_at").notNull(),
  lastActiveAt: int("last_seen_at").notNull(),
  expiresAt: int("expires_at").notNull(),
  revokedAt: int("revoked_at"),
});
