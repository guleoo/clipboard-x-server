import type { AppRoute } from "../frame/hono";
import { createApp, mountRoutes, Server } from "../frame/hono";
import { Database } from "../db";
import { healthRoutes, registerDefaultHealthChecks } from "../frame/health";
import { registerSecurity } from "../session";
import { administratorService } from "../service/administrator";
import { channelService } from "../service/channel";
import { deviceService } from "../service/device";
import { cleanupService } from "../service/cleanup";
import { objectStore } from "../repo/object";
import { config } from "../config";
import { staticFile } from "../route/static";
import { productErrorHandler } from "../route/error";
import { RequestStore } from "../frame/hono";
import {
  jsonBodyLimit,
  requestRateLimit,
  securityHeaders,
} from "../route/middleware";

Database.init();
registerDefaultHealthChecks(Database);
registerSecurity();

export function createServerApp(routes: readonly AppRoute[]) {
  const app = createApp();
  app.use("*", securityHeaders);
  app.use("*", requestRateLimit);
  app.use("*", jsonBodyLimit);
  app.notFound((context) => context.json({ error: {
    code: "not_found",
    message: "Resource not found",
    requestId: RequestStore.get("requestId") ?? "unknown",
    details: {},
  } }, 404));
  app.onError(productErrorHandler);
  mountRoutes(app, routes);
  mountRoutes(app, [healthRoutes], { overridePrefix: true });
  app.get("*", async (context) => {
    const path = new URL(context.req.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/admin/api/") || path.startsWith("/health/")) {
      return context.notFound();
    }
    const response = await staticFile(config.webRoot, path);
    return response ?? context.notFound();
  });
  return app;
}

export async function initialize(): Promise<void> {
  await objectStore.initialize();
  await administratorService.synchronize();
  await deviceService.synchronize();
  channelService.synchronize();
  cleanupService.start();
}

export async function startServer(routes: readonly AppRoute[]) {
  await initialize();
  return Server.listen(createServerApp(routes));
}
