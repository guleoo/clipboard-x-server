import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp, mountRoutes } from "../src/frame/hono";
import { generateSpecs } from "../src/frame/hono/openapi";
import { routes } from "../src/route";

const app = createApp();
mountRoutes(app, routes);

const document = await generateSpecs(app, {
  documentation: {
    openapi: "3.1.0",
    info: {
      title: "Clipboard X Server API",
      version: "0.1.0",
      description:
        "Device synchronization API and same-origin single-administrator API.",
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Device" },
      { name: "Clipboard" },
      { name: "Work" },
      { name: "Device transfers" },
      { name: "Admin authentication" },
      { name: "Admin devices" },
      { name: "Admin channels" },
      { name: "Admin clipboard" },
      { name: "Admin transfers" },
      { name: "Admin operations" },
    ],
    components: {
      securitySchemes: {
        deviceKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "cbx_<keyId>_<secret>",
        },
        deviceId: {
          type: "apiKey",
          in: "header",
          name: "X-Clipboard-X-Device-Id",
          description: "Must match the device bound to the Bearer key.",
        },
        adminSession: {
          type: "apiKey",
          in: "cookie",
          name: "clipboard_x_admin",
        },
      },
    },
  },
  defaultValidationErrorResponse: false,
});

const target = resolve(import.meta.dir, "../openapi/openapi.json");
const rendered = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await Bun.file(target).text().catch(() => "");
  if (current !== rendered) {
    console.error(
      "server/openapi/openapi.json is out of date; run bun run --filter '@clipboard-x/server' openapi",
    );
    process.exitCode = 1;
  } else {
    console.log("OpenAPI document is current");
  }
} else {
  await mkdir(resolve(import.meta.dir, "../openapi"), { recursive: true });
  await Bun.write(target, rendered);
  console.log(`Wrote ${target}`);
}
