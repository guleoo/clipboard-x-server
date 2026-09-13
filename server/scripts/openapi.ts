import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Application } from "../src/application"
import { ConfigurationSchema, ConfigurationStore, loadConfig } from "../src/config"
import { migrateApplicationDatabase } from "../src/db"
import { generateSpecs } from "../src/frame/hono/openapi"
import { createHttpApp } from "../src/http/app"

async function generateDocument() {
  const directory = await mkdtemp(join(tmpdir(), "clipboard-x-openapi-"))
  let application: Application | undefined
  try {
    const configurationPath = join(directory, "config.yaml")
    ConfigurationStore.create(configurationPath, ConfigurationSchema.parse({
      version: 1,
      server: {
        environment: "test",
        webRoot: "./web",
        cookieSecure: false,
      },
      storage: {
        dataDirectory: "./data",
        migrationsDirectory: resolve(import.meta.dir, "../drizzle"),
        wal: false,
      },
      security: {
        passwordMemoryCost: 19_456,
        passwordTimeCost: 2,
      },
      administrator: { username: "documentation", password: "documentation" },
      devices: [],
      channels: [],
    }))
    const config = loadConfig(configurationPath)
    migrateApplicationDatabase(config)
    application = await Application.create(config)

    return await generateSpecs(createHttpApp(application), {
      documentation: {
        openapi: "3.1.0",
        info: {
          title: "Clipboard X Server API",
          version: "0.1.0",
          description: "Device synchronization API and same-origin single-administrator API.",
        },
        servers: [{ url: "/" }],
        tags: [
          { name: "Health" },
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
              description: "Also requires X-Clipboard-X-Device-Id.",
            },
            adminSession: { type: "apiKey", in: "cookie", name: "clipboard_x_admin" },
          },
        },
      },
      defaultValidationErrorResponse: false,
    })
  } finally {
    application?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

const document = await generateDocument()

const target = resolve(import.meta.dir, "../openapi/openapi.json")
const rendered = `${JSON.stringify(document, null, 2)}\n`
if (process.argv.includes("--check")) {
  const current = await Bun.file(target).text().catch(() => "")
  if (current !== rendered) {
    console.error("server/openapi/openapi.json is out of date; run bun run --filter '@clipboard-x/server' openapi")
    process.exitCode = 1
  } else {
    console.log("OpenAPI document is current")
  }
} else {
  await mkdir(resolve(import.meta.dir, "../openapi"), { recursive: true })
  await Bun.write(target, rendered)
  console.log(`Wrote ${target}`)
}
