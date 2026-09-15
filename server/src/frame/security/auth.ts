import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { jwt } from "hono/jwt";
import { Provider } from "../core";
import { RequestStore } from "../hono/request-context";
import { AuthError } from "./error";
import { SecurityConfig } from "./config";
import { SecurityFrameService } from "./service";
import type { SecurityJwtPayload } from "./type";

export type CredentialReader = (context: Context) => string | undefined;

function readToken(header: string | undefined): string {
  const expected = `${SecurityConfig.tokenPrefix} `;
  if (!header?.startsWith(expected)) throw new AuthError();
  const token = header.slice(expected.length).trim();
  if (!token) throw new AuthError();
  return token;
}

const authorizationCredential: CredentialReader = (context) =>
  readToken(context.req.header("Authorization"));

export function auth(readCredential: CredentialReader = authorizationCredential) {
  const jwtMiddleware = SecurityConfig.jwtSecret
    ? jwt({
        secret: SecurityConfig.jwtSecret,
        alg: SecurityConfig.jwtAlgorithm,
        headerName: "Authorization",
      })
    : undefined;

  return createMiddleware(async (context, next) => {
    const token = readCredential(context);
    if (!token) throw new AuthError();
    const service = Provider.inject(SecurityFrameService);
    let payload: SecurityJwtPayload | undefined;
    try {
      if (!jwtMiddleware) throw new AuthError();
      await jwtMiddleware(context, async () => undefined);
      payload = context.get("jwtPayload") as SecurityJwtPayload;
    } catch {
      // Opaque session tokens remain an explicit service extension point.
    }
    const session = payload
      ? await service.resolveSession({ token, payload })
      : await service.resolveOpaqueToken?.(token);
    if (!session) throw new AuthError();

    RequestStore.set("sid", session.sid);
    RequestStore.set("uid", session.uid);
    RequestStore.set("tenantId", session.tenantId);
    RequestStore.set("authType", session.authType);
    RequestStore.set("permissionKeys", session.permissionKeys);
    await next();
  });
}
