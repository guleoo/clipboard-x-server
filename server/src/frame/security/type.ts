import type { JWTPayload } from "hono/utils/jwt/types";

export type PermissionMode = "all" | "any";

export interface PermissionDemand {
  readonly mode: PermissionMode;
  readonly permissions: readonly string[];
}

export interface SecurityJwtPayload extends JWTPayload {
  readonly sid?: string;
  readonly uid?: string;
  readonly tenantId?: string;
  readonly type?: "access";
}

export interface SecuritySession {
  readonly sid?: string;
  readonly uid: string;
  readonly tenantId?: string;
  readonly authType?: "SESSION" | "API_KEY" | "OAUTH";
  readonly permissionKeys?: readonly string[];
}

export interface ResolveSessionInput {
  readonly token: string;
  readonly payload: SecurityJwtPayload;
}

export interface HasPermissionInput {
  readonly uid: string;
  readonly tenantId?: string;
  readonly demand: PermissionDemand;
}
