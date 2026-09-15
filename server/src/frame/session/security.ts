import { Provider } from "../core";
import { RequestStore } from "../hono/request-context";
import {
  SecurityFrameService,
  type HasPermissionInput,
} from "../security";
import type { SessionStore } from "./session";

export interface SessionSecurityOptions {
  hasPermission?(input: HasPermissionInput): Promise<boolean> | boolean;
}

function permissionSnapshot(
  available: readonly string[],
  input: HasPermissionInput,
): boolean {
  const values = new Set(available);
  return input.demand.mode === "all"
    ? input.demand.permissions.every((permission) => values.has(permission))
    : input.demand.permissions.some((permission) => values.has(permission));
}

export function registerSessionSecurity(
  session: SessionStore,
  options: SessionSecurityOptions = {},
): void {
  Provider.provide(SecurityFrameService, {
    async resolveSession({ payload }) {
      if (
        payload.type !== "access" ||
        typeof payload.sid !== "string" ||
        typeof payload.uid !== "string"
      ) {
        return undefined;
      }
      const record = session.get(payload.sid);
      if (!record || record.uid !== payload.uid) return undefined;
      if (payload.tenantId && record.tenantId !== payload.tenantId) return undefined;
      return { ...record, sid: record.id, authType: "SESSION" };
    },
    async resolveOpaqueToken(token) {
      const record = session.resolve(token);
      return record
        ? { ...record, sid: record.id, authType: "SESSION" }
        : undefined;
    },
    async hasPermission(input) {
      if (options.hasPermission) return options.hasPermission(input);
      const sessionId = RequestStore.get("sid");
      const record = sessionId ? session.get(sessionId) : undefined;
      return record ? permissionSnapshot(record.permissionKeys, input) : false;
    },
  });
}
