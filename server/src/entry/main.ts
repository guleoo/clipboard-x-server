import { Application } from "../application"
import { createHttpApp } from "../http/app"
import { configurationPath, loadConfig, publicConfig } from "./config"

const config = loadConfig(configurationPath())
if (process.argv.includes("--healthcheck")) {
  const host = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host
  const response = await fetch(`http://${host}:${config.port}/health/ready`).catch(() => undefined)
  process.exit(response?.ok ? 0 : 1)
}
const application = await Application.create(config)
const app = createHttpApp(application)
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
})

console.info(JSON.stringify({
  level: "info",
  event: "server.started",
  url: server.url.toString(),
  config: publicConfig(config),
}))

let closing = false
function shutdown(signal: string): void {
  if (closing) return
  closing = true
  console.info(JSON.stringify({ level: "info", event: "server.stopping", signal }))
  server.stop(false)
  application.close()
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
