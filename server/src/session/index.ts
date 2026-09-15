import { db } from "../db";
import { Provider } from "../frame/core";
import { SecurityFrameService } from "../frame/security";
import {
  createSessionStore,
  registerSessionSecurity as registerFrameSessionSecurity,
} from "../frame/session";
import { deviceService } from "../service/device";

export const Session = createSessionStore(db);

export function registerSessionSecurity(): void {
  registerFrameSessionSecurity(Session);
}

export function registerSecurity(): void {
  Provider.provide(SecurityFrameService, {
    async resolveSession() {
      return undefined;
    },
    async resolveOpaqueToken(token) {
      if (!token.startsWith("cbx_")) {
        const session = Session.resolve(token);
        return session && session.uid === "administrator"
          ? { ...session, sid: session.id, authType: "SESSION" }
          : undefined;
      }
      const identity = await deviceService.authenticate(token);
      return {
        sid: identity.keyId,
        uid: identity.deviceId,
        authType: "API_KEY",
        permissionKeys: [],
      };
    },
    async hasPermission() {
      return false;
    },
  });
}
