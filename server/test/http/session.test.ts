import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Database, db } from "../../src/db";
import { Provider } from "../../src/frame/core";
import { databaseConfig } from "../../src/frame/db";
import { SecurityFrameService } from "../../src/frame/security";
import { registerSessionSecurity, Session } from "../../src/session";

  beforeAll(() => {
  Database.init();
  Database.migrate({
    migrationsFolder: databaseConfig.migrationsFolder,
  });
});

afterAll(() => Provider.unprovide(SecurityFrameService));

describe("database session capability", () => {
  it("stores only a token hash and treats the database as authoritative", () => {
    const credential = Session.create({
      uid: "user-1",
      tenantId: "tenant-1",
      permissionKeys: ["account:read"],
    });
    expect(Session.resolve(credential.token)).toMatchObject({
      id: credential.session.id,
      uid: "user-1",
    });
    Session.revoke(credential.session.id);
    expect(Session.resolve(credential.token)).toBeUndefined();
    const stored = db.get<{ token_hash: string }>(
      sql.raw("select token_hash from admin_sessions limit 1"),
    );
    expect(stored?.token_hash).not.toBe(credential.token);
  });

  it("accepts only access JWT payloads for database sessions", async () => {
    const credential = Session.create({ uid: "user-2" });
    Provider.unprovide(SecurityFrameService);
    registerSessionSecurity();
    const security = Provider.inject(SecurityFrameService);

    expect(
      await security.resolveSession({
        token: "signed-token",
        payload: { sid: credential.session.id, uid: "user-2" },
      }),
    ).toBeUndefined();
    expect(
      await security.resolveSession({
        token: "signed-token",
        payload: {
          sid: credential.session.id,
          uid: "user-2",
          type: "access",
        },
      }),
    ).toMatchObject({ sid: credential.session.id, uid: "user-2" });
  });
});
