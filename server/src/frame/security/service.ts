import { Provider } from "../core";
import type {
  HasPermissionInput,
  ResolveSessionInput,
  SecuritySession,
} from "./type";

export interface SecurityFrameService {
  resolveSession(input: ResolveSessionInput): Promise<SecuritySession | undefined>;
  resolveOpaqueToken?(token: string): Promise<SecuritySession | undefined>;
  hasPermission(input: HasPermissionInput): Promise<boolean>;
}

export const SecurityFrameService =
  Provider.create<SecurityFrameService>("SecurityFrameService");
