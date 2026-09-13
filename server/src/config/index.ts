import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { zz as z } from "../frame/zod"
import { parse, stringify } from "yaml"
import { DeviceIconSchema, MimeTypeSchema, SafeTextSchema, UuidSchema } from "../common/validation"
import { LoggerOptions } from "../frame/logger"
import { validZone } from "../frame/core/date"

const deviceKeyPattern = /^cbx_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{32,})$/iu
const positiveInteger = z.number().int().positive()
const nonnegativeInteger = z.number().int().nonnegative()

const AdministratorConfigurationSchema = z.object({
  username: SafeTextSchema(64).min(3),
  password: z.string().min(7).max(256),
}).strict()

const DeviceKeyConfigurationSchema = z.object({
  value: z.string().regex(deviceKeyPattern, "Expected cbx_<UUID v4>_<secret>"),
  createdAt: nonnegativeInteger.optional(),
  expiresAt: nonnegativeInteger.optional(),
}).strict()

const DeviceConfigurationSchema = z.object({
  id: UuidSchema,
  tag: SafeTextSchema(256).min(1),
  iconKind: DeviceIconSchema,
  disabled: z.boolean().default(false),
  keys: z.array(DeviceKeyConfigurationSchema).default([]),
}).strict()

const ChannelConfigurationSchema = z.object({
  id: UuidSchema,
  name: SafeTextSchema(256).min(1),
  members: z.array(UuidSchema).default([]),
}).strict()

export const ConfigurationSchema = z.object({
  version: z.literal(1),
  server: z.object({
    environment: z.enum(["development", "test", "production"]).default("production"),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().min(1).max(65_535).default(8787),
    webRoot: z.string().min(1).default("./web/dist"),
    publicOrigin: z.url().optional(),
    cookieSecure: z.boolean().default(true),
    shutdownTimeoutMillis: positiveInteger.default(30_000),
    timezone: z.string().refine(validZone, "Invalid time zone").default("UTC"),
  }).strict().default({ environment: "production", host: "127.0.0.1", port: 8787, webRoot: "./web/dist", cookieSecure: true, shutdownTimeoutMillis: 30_000, timezone: "UTC" }),
  storage: z.object({
    dataDirectory: z.string().min(1).default("./data"),
    databasePath: z.string().min(1).optional(),
    objectDirectory: z.string().min(1).optional(),
    migrationsDirectory: z.string().min(1).default("./server/drizzle"),
    busyTimeoutMillis: positiveInteger.default(5_000),
    wal: z.boolean().default(true),
  }).strict().default({ dataDirectory: "./data", migrationsDirectory: "./server/drizzle", busyTimeoutMillis: 5_000, wal: true }),
  limits: z.object({
    maxObjectBytes: positiveInteger.max(1024 * 1024 * 1024).default(80 * 1024 * 1024),
    maxItemBytes: positiveInteger.max(2 * 1024 * 1024 * 1024).default(256 * 1024 * 1024),
    maxPreviewBytes: positiveInteger.max(16 * 1024 * 1024).default(1024 * 1024),
  }).strict().default({ maxObjectBytes: 80 * 1024 * 1024, maxItemBytes: 256 * 1024 * 1024, maxPreviewBytes: 1024 * 1024 }),
  lifetimes: z.object({
    sessionTtlSeconds: positiveInteger.min(300).max(365 * 24 * 60 * 60).default(7 * 24 * 60 * 60),
    keyOverlapSeconds: nonnegativeInteger.max(86_400).default(300),
    materializationTtlSeconds: positiveInteger.min(30).max(86_400).default(600),
    objectGcGraceSeconds: positiveInteger.min(60).max(365 * 24 * 60 * 60).default(86_400),
  }).strict().default({ sessionTtlSeconds: 7 * 24 * 60 * 60, keyOverlapSeconds: 300, materializationTtlSeconds: 600, objectGcGraceSeconds: 86_400 }),
  security: z.object({
    passwordMemoryCost: positiveInteger.min(19_456).default(65_536),
    passwordTimeCost: positiveInteger.min(2).default(3),
    sessionTokenBytes: positiveInteger.min(24).max(64).default(32),
    rateLimit: z.object({
      maximum: positiveInteger.default(600),
      windowMillis: positiveInteger.default(60_000),
    }).strict().default({ maximum: 600, windowMillis: 60_000 }),
  }).strict().default({
    passwordMemoryCost: 65_536,
    passwordTimeCost: 3,
    sessionTokenBytes: 32,
    rateLimit: { maximum: 600, windowMillis: 60_000 },
  }),
  logger: LoggerOptions,
  content: z.object({
    supportedMimeTypes: z.array(MimeTypeSchema).min(1).max(64).default([
      "text/plain;charset=utf-8",
      "text/html",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]),
  }).strict().default({
    supportedMimeTypes: [
      "text/plain;charset=utf-8",
      "text/html",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ],
  }),
  administrator: AdministratorConfigurationSchema,
  devices: z.array(DeviceConfigurationSchema).default([]),
  channels: z.array(ChannelConfigurationSchema).default([]),
}).strict().superRefine((configuration, context) => {
  const deviceIds = new Set<string>()
  const keyIds = new Set<string>()
  for (const [deviceIndex, device] of configuration.devices.entries()) {
    if (deviceIds.has(device.id)) {
      context.addIssue({ code: "custom", path: ["devices", deviceIndex, "id"], message: "Device id must be unique" })
    }
    deviceIds.add(device.id)
    for (const [keyIndex, key] of device.keys.entries()) {
      const keyId = deviceKeyId(key.value)
      if (keyIds.has(keyId)) {
        context.addIssue({ code: "custom", path: ["devices", deviceIndex, "keys", keyIndex, "value"], message: "Device key id must be unique" })
      }
      keyIds.add(keyId)
    }
  }
  const channelIds = new Set<string>()
  for (const [channelIndex, channel] of configuration.channels.entries()) {
    if (channelIds.has(channel.id)) {
      context.addIssue({ code: "custom", path: ["channels", channelIndex, "id"], message: "Channel id must be unique" })
    }
    channelIds.add(channel.id)
    const members = new Set<string>()
    for (const [memberIndex, deviceId] of channel.members.entries()) {
      if (!deviceIds.has(deviceId)) {
        context.addIssue({ code: "custom", path: ["channels", channelIndex, "members", memberIndex], message: "Channel member must reference a configured device" })
      }
      if (members.has(deviceId)) {
        context.addIssue({ code: "custom", path: ["channels", channelIndex, "members", memberIndex], message: "Channel member must be unique" })
      }
      members.add(deviceId)
    }
  }
})

export type Configuration = z.infer<typeof ConfigurationSchema>
export type DeviceConfiguration = Configuration["devices"][number]
export type DeviceKeyConfiguration = DeviceConfiguration["keys"][number]
export type ChannelConfiguration = Configuration["channels"][number]

export function deviceKeyId(value: string): string {
  const match = deviceKeyPattern.exec(value)
  if (!match?.[1]) throw new Error("Invalid device API key")
  return match[1]
}

export function deviceKeySecret(value: string): string {
  const match = deviceKeyPattern.exec(value)
  if (!match?.[2]) throw new Error("Invalid device API key")
  return match[2]
}

function clone(configuration: Configuration): Configuration {
  return structuredClone(configuration)
}

function render(configuration: Configuration): string {
  return `# Clipboard X Server configuration. Contains secrets; keep mode 0600.\n${stringify(configuration, {
    indent: 2,
    lineWidth: 0,
  })}`
}

export class ConfigurationStore {
  private configuration: Configuration

  private constructor(public readonly path: string, configuration: Configuration) {
    this.configuration = configuration
  }

  static open(path: string): ConfigurationStore {
    const absolutePath = resolve(path)
    if (!existsSync(absolutePath)) {
      throw new Error(`Configuration file not found: ${absolutePath}. Copy config.example.yaml and set administrator.password.`)
    }
    chmodSync(absolutePath, 0o600)
    const source = readFileSync(absolutePath, "utf8")
    const parsed = ConfigurationSchema.parse(parse(source))
    return new ConfigurationStore(absolutePath, parsed)
  }

  static create(path: string, configuration: Configuration): ConfigurationStore {
    const absolutePath = resolve(path)
    const parsed = ConfigurationSchema.parse(configuration)
    const store = new ConfigurationStore(absolutePath, parsed)
    store.write(parsed)
    return store
  }

  read(): Configuration {
    return clone(this.configuration)
  }

  change<Value>(
    mutate: (configuration: Configuration) => Value,
    apply: (configuration: Configuration, value: Value) => void,
  ): Value {
    const previous = this.configuration
    const candidate = clone(previous)
    const value = mutate(candidate)
    const next = ConfigurationSchema.parse(candidate)
    this.write(next)
    try {
      apply(next, value)
      this.configuration = next
      return value
    } catch (cause) {
      try {
        this.write(previous)
      } catch (rollbackCause) {
        throw new AggregateError([cause, rollbackCause], "Configuration and database update both failed")
      }
      throw cause
    }
  }

  private write(configuration: Configuration): void {
    const directory = dirname(this.path)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.path}.${process.pid}.${crypto.randomUUID()}.tmp`
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporaryPath, "wx", 0o600)
      writeFileSync(descriptor, render(configuration), "utf8")
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
      renameSync(temporaryPath, this.path)
      chmodSync(this.path, 0o600)
      const directoryDescriptor = openSync(directory, "r")
      try {
        fsyncSync(directoryDescriptor)
      } finally {
        closeSync(directoryDescriptor)
      }
    } catch (cause) {
      if (descriptor !== undefined) closeSync(descriptor)
      rmSync(temporaryPath, { force: true })
      throw cause
    }
  }
}

export interface ServerConfig {
  readonly configuration: ConfigurationStore
  readonly environment: "development" | "test" | "production"
  readonly host: string
  readonly port: number
  readonly shutdownTimeoutMs: number
  readonly timezone: string
  readonly dataDirectory: string
  readonly databasePath: string
  readonly databaseBusyTimeoutMs: number
  readonly databaseWal: boolean
  readonly migrationsDirectory: string
  readonly objectDirectory: string
  readonly webRoot: string
  readonly publicOrigin?: string
  readonly cookieSecure: boolean
  readonly sessionTtlMs: number
  readonly keyOverlapMs: number
  readonly maxObjectBytes: number
  readonly maxItemBytes: number
  readonly maxPreviewBytes: number
  readonly materializationTtlMs: number
  readonly objectGcGraceMs: number
  readonly supportedMimeTypes: readonly string[]
  readonly passwordMemoryCost: number
  readonly passwordTimeCost: number
  readonly sessionTokenBytes: number
  readonly rateLimitMaximum: number
  readonly rateLimitWindowMs: number
  readonly logger: z.output<typeof LoggerOptions>
}

export function configurationPath(arguments_: readonly string[] = process.argv.slice(2)): string {
  let selected: string | undefined
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!
    if (argument.startsWith("--config=")) {
      selected = argument.slice("--config=".length)
      continue
    }
    if (argument === "--config") {
      const value = arguments_[index + 1]
      if (!value || value.startsWith("--")) throw new Error("--config requires a YAML file path")
      selected = value
      index += 1
    }
  }
  return resolve(selected ?? "config.yaml")
}

export function loadConfig(path = configurationPath()): ServerConfig {
  const configuration = ConfigurationStore.open(path)
  const value = configuration.read()
  const base = dirname(configuration.path)
  const dataDirectory = resolve(base, value.storage.dataDirectory)
  return {
    configuration,
    environment: value.server.environment,
    host: value.server.host,
    port: value.server.port,
    shutdownTimeoutMs: value.server.shutdownTimeoutMillis,
    timezone: value.server.timezone,
    dataDirectory,
    databasePath: resolve(base, value.storage.databasePath ?? `${value.storage.dataDirectory}/clipboard-x.sqlite`),
    databaseBusyTimeoutMs: value.storage.busyTimeoutMillis,
    databaseWal: value.storage.wal,
    migrationsDirectory: resolve(base, value.storage.migrationsDirectory),
    objectDirectory: resolve(base, value.storage.objectDirectory ?? `${value.storage.dataDirectory}/objects`),
    webRoot: resolve(base, value.server.webRoot),
    ...(value.server.publicOrigin ? { publicOrigin: value.server.publicOrigin } : {}),
    cookieSecure: value.server.cookieSecure,
    sessionTtlMs: value.lifetimes.sessionTtlSeconds * 1000,
    keyOverlapMs: value.lifetimes.keyOverlapSeconds * 1000,
    maxObjectBytes: value.limits.maxObjectBytes,
    maxItemBytes: value.limits.maxItemBytes,
    maxPreviewBytes: value.limits.maxPreviewBytes,
    materializationTtlMs: value.lifetimes.materializationTtlSeconds * 1000,
    objectGcGraceMs: value.lifetimes.objectGcGraceSeconds * 1000,
    supportedMimeTypes: Object.freeze([...value.content.supportedMimeTypes]),
    passwordMemoryCost: value.security.passwordMemoryCost,
    passwordTimeCost: value.security.passwordTimeCost,
    sessionTokenBytes: value.security.sessionTokenBytes,
    rateLimitMaximum: value.security.rateLimit.maximum,
    rateLimitWindowMs: value.security.rateLimit.windowMillis,
    logger: {
      ...value.logger,
      file: { ...value.logger.file, dir: resolve(base, value.logger.file.dir) },
    },
  }
}

export function publicConfig(config: ServerConfig): Readonly<Record<string, unknown>> {
  return {
    configurationPath: config.configuration.path,
    environment: config.environment,
    host: config.host,
    port: config.port,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
    timezone: config.timezone,
    databasePath: config.databasePath,
    databaseBusyTimeoutMs: config.databaseBusyTimeoutMs,
    databaseWal: config.databaseWal,
    migrationsDirectory: config.migrationsDirectory,
    objectDirectory: config.objectDirectory,
    webRoot: config.webRoot,
    publicOrigin: config.publicOrigin ?? "request origin",
    cookieSecure: config.cookieSecure,
    maxObjectBytes: config.maxObjectBytes,
    maxItemBytes: config.maxItemBytes,
    maxPreviewBytes: config.maxPreviewBytes,
  }
}
