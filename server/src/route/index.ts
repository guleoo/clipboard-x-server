import { createHono } from "../frame/security";
import { createPublicHono } from "../frame/hono";
import { overviewService } from "../service/overview";
import {
  adminCredential,
  sameOrigin,
} from "./auth";
import {
  registerProtectedAdministratorRoutes,
  registerPublicAdministratorRoutes,
} from "./administrator";
import {
  registerAdminChannelRoutes,
  registerDeviceChannelRoutes,
} from "./channel";
import {
  registerAdminClipboardRoutes,
  registerDeviceClipboardRoutes,
} from "./clipboard";
import {
  registerAdminDeviceRoutes,
  registerDeviceProfileRoutes,
} from "./device";
import { operation } from "./openapi";
import {
  registerAdminTransferRoutes,
  registerDeviceTransferRoutes,
} from "./transfer";

export const publicAdministratorRoutes = createPublicHono("/v1", {
  surface: "admin",
});
publicAdministratorRoutes.use("*", sameOrigin);
registerPublicAdministratorRoutes(publicAdministratorRoutes);

export const administratorRoutes = createHono("/v1", {
  surface: "admin",
  credential: adminCredential,
});
administratorRoutes.use("*", sameOrigin);
registerProtectedAdministratorRoutes(administratorRoutes);
registerAdminDeviceRoutes(administratorRoutes);
registerAdminChannelRoutes(administratorRoutes);
registerAdminClipboardRoutes(administratorRoutes);
registerAdminTransferRoutes(administratorRoutes);
administratorRoutes.get(
  "/overview",
  operation({
    operationId: "getAdminOverview",
    tags: ["Admin operations"],
    summary: "Get administrator overview",
    auth: true,
    scheme: "adminSession",
  }),
  (context) => context.json(overviewService.get()),
);

export const deviceRoutes = createHono("/v1", { surface: "app" });
registerDeviceProfileRoutes(deviceRoutes);
registerDeviceChannelRoutes(deviceRoutes);
registerDeviceClipboardRoutes(deviceRoutes);
registerDeviceTransferRoutes(deviceRoutes);

export const routes = [
  publicAdministratorRoutes,
  administratorRoutes,
  deviceRoutes,
] as const;
