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
import { z } from "zod"
import { DeviceIconSchema, MimeTypeSchema, SafeTextSchema, UuidSchema } from "../common/validation"

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
  }).strict().default({ environment: "production", host: "127.0.0.1", port: 8787, webRoot: "./web/dist", cookieSecure: true }),
  storage: z.object({
    dataDirectory: z.string().min(1).default("./data"),
    databasePath: z.string().min(1).optional(),
    objectDirectory: z.string().min(1).optional(),
  }).strict().default({ dataDirectory: "./data" }),
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

function scalar(value: string | number | boolean): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value)
}

function keyOf(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(value) ? value : JSON.stringify(value)
}

function block(value: unknown, indentation = 0): string[] {
  const prefix = " ".repeat(indentation)
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`]
    const lines: string[] = []
    for (const item of value) {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        lines.push(`${prefix}- ${scalar(item)}`)
      } else {
        lines.push(`${prefix}-`)
        lines.push(...block(item, indentation + 2))
      }
    }
    return lines
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
    if (entries.length === 0) return [`${prefix}{}`]
    const lines: string[] = []
    for (const [key, item] of entries) {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        lines.push(`${prefix}${keyOf(key)}: ${scalar(item)}`)
      } else if (item === undefined) {
        continue
      } else {
        const nested = block(item, indentation + 2)
        if (nested.length === 1 && (nested[0]?.trim() === "[]" || nested[0]?.trim() === "{}")) {
          lines.push(`${prefix}${keyOf(key)}: ${nested[0].trim()}`)
        } else {
          lines.push(`${prefix}${keyOf(key)}:`)
          lines.push(...nested)
        }
      }
    }
    return lines
  }
  throw new Error("Configuration contains an unsupported YAML value")
}

function render(configuration: Configuration): string {
  return `# Clipboard X Server configuration. Contains secrets; keep mode 0600.\n${block(configuration).join("\n")}\n`
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
    const parsed = ConfigurationSchema.parse(Bun.YAML.parse(source))
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
  readonly dataDirectory: string
  readonly databasePath: string
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
}

export function configurationPath(arguments_: readonly string[] = process.argv.slice(2)): string {
  const equals = arguments_.find((argument) => argument.startsWith("--config="))
  if (equals) return resolve(equals.slice("--config=".length))
  const index = arguments_.indexOf("--config")
  if (index >= 0) {
    const value = arguments_[index + 1]
    if (!value || value.startsWith("--")) throw new Error("--config requires a YAML file path")
    return resolve(value)
  }
  return resolve("config.yaml")
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
    dataDirectory,
    databasePath: resolve(base, value.storage.databasePath ?? `${value.storage.dataDirectory}/clipboard-x.sqlite`),
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
  }
}

export function publicConfig(config: ServerConfig): Readonly<Record<string, unknown>> {
  return {
    configurationPath: config.configuration.path,
    environment: config.environment,
    host: config.host,
    port: config.port,
    databasePath: config.databasePath,
    objectDirectory: config.objectDirectory,
    webRoot: config.webRoot,
    publicOrigin: config.publicOrigin ?? "request origin",
    cookieSecure: config.cookieSecure,
    maxObjectBytes: config.maxObjectBytes,
    maxItemBytes: config.maxItemBytes,
    maxPreviewBytes: config.maxPreviewBytes,
  }
}
