import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse, parseDocument, stringify } from "yaml";
import { DeviceIconSchema, MimeTypeSchema, SafeTextSchema, UuidSchema } from "../common/validation";
import { isVirtualDevice } from "../common/virtual-device";
import {
  Config,
  ConfigError,
  FrameConfig,
  configLoadOptions,
  configMode,
  configPath,
  fieldNameMappers,
  isConfigObject,
  loadYamlConfigSync,
} from "../frame/config";
import { SecurityConfig } from "../frame/security";
import { SessionConfig } from "../frame/session";
import { zz } from "../frame/zod";
import type { ConfigObject, ConfigValue } from "../frame/config";

const deviceKeyPattern = /^cbx_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{32,})$/iu;
const positiveInteger = zz.number().int().positive();
const nonnegativeInteger = zz.number().int().nonnegative();

const AdministratorConfigurationSchema = zz.object({
  username: SafeTextSchema(64).min(3),
  password: zz.string().min(7).max(256),
}).strict();

const DeviceKeyConfigurationSchema = zz.object({
  value: zz.string().regex(deviceKeyPattern, "Expected cbx_<UUID v4>_<secret>"),
  createdAt: nonnegativeInteger.optional(),
  expiresAt: nonnegativeInteger.optional(),
}).strict();

const DeviceConfigurationSchema = zz.object({
  id: UuidSchema,
  tag: SafeTextSchema(256).min(1).optional(),
  iconKind: DeviceIconSchema.optional(),
  disabled: zz.boolean().default(false),
  keys: zz.array(DeviceKeyConfigurationSchema).default([]),
}).strict().transform(({ tag: _tag, iconKind: _iconKind, ...device }) => device);

const ChannelConfigurationSchema = zz.object({
  id: UuidSchema,
  name: SafeTextSchema(256).min(1),
  members: zz.array(UuidSchema).default([]),
}).strict();

export const ManagedConfigurationSchema = zz.object({
  administrator: AdministratorConfigurationSchema,
  devices: zz.array(DeviceConfigurationSchema).default([]),
  channels: zz.array(ChannelConfigurationSchema).default([]),
}).strict().superRefine((configuration, context) => {
  const deviceIds = new Set<string>();
  const keyIds = new Set<string>();
  for (const [deviceIndex, device] of configuration.devices.entries()) {
    if (isVirtualDevice(device.id)) {
      context.addIssue({ code: "custom", path: ["devices", deviceIndex, "id"], message: "Virtual device id is reserved" });
    }
    if (deviceIds.has(device.id)) {
      context.addIssue({ code: "custom", path: ["devices", deviceIndex, "id"], message: "Device id must be unique" });
    }
    deviceIds.add(device.id);
    for (const [keyIndex, key] of device.keys.entries()) {
      const keyId = deviceKeyId(key.value);
      if (keyIds.has(keyId)) {
        context.addIssue({ code: "custom", path: ["devices", deviceIndex, "keys", keyIndex, "value"], message: "Device key id must be unique" });
      }
      keyIds.add(keyId);
    }
  }

  const channelIds = new Set<string>();
  for (const [channelIndex, channel] of configuration.channels.entries()) {
    if (channelIds.has(channel.id)) {
      context.addIssue({ code: "custom", path: ["channels", channelIndex, "id"], message: "Channel id must be unique" });
    }
    channelIds.add(channel.id);
    const members = new Set<string>();
    for (const [memberIndex, deviceId] of channel.members.entries()) {
      if (!deviceIds.has(deviceId)) {
        context.addIssue({ code: "custom", path: ["channels", channelIndex, "members", memberIndex], message: "Channel member must reference a configured device" });
      }
      if (members.has(deviceId)) {
        context.addIssue({ code: "custom", path: ["channels", channelIndex, "members", memberIndex], message: "Channel member must be unique" });
      }
      members.add(deviceId);
    }
  }
});

const WebOptions = zz.object({
  root: zz.string().min(1).default("./web"),
  publicOrigin: zz.preprocess(
    (value) => value === "" ? undefined : value,
    zz.url().optional(),
  ),
  cookieSecure: zz.union([
    zz.boolean(),
    zz.enum(["true", "false"]).transform((value) => value === "true"),
  ]).default(true),
}).strict().default({ root: "./web", cookieSecure: true });

const LimitsOptions = zz.object({
  maxObjectBytes: positiveInteger.max(1024 * 1024 * 1024).default(80 * 1024 * 1024),
  maxItemBytes: positiveInteger.max(2 * 1024 * 1024 * 1024).default(256 * 1024 * 1024),
  maxPreviewBytes: positiveInteger.max(16 * 1024 * 1024).default(1024 * 1024),
}).strict().default({ maxObjectBytes: 80 * 1024 * 1024, maxItemBytes: 256 * 1024 * 1024, maxPreviewBytes: 1024 * 1024 });

const LifetimesOptions = zz.object({
  keyOverlapMillis: nonnegativeInteger.max(86_400_000).default(300_000),
  materializationTtlMillis: positiveInteger.min(30_000).max(86_400_000).default(600_000),
}).strict().default({ keyOverlapMillis: 300_000, materializationTtlMillis: 600_000 });

const defaultClipboardCleanup = {
  maxItemsPerDevicePerChannel: 1000,
  maxAgeMillis: 30 * 86_400_000,
};

const CleanupClipboardOptions = zz.object({
  maxItems: positiveInteger.optional(),
  maxItemsPerChannel: positiveInteger.optional(),
  maxItemsPerDevice: positiveInteger.optional(),
  maxItemsPerDevicePerChannel: positiveInteger.optional(),
  maxAgeMillis: positiveInteger.optional(),
}).strict().default(defaultClipboardCleanup);

export const CleanupOptions = zz.object({
  enabled: zz.boolean().default(true),
  intervalMillis: positiveInteger.min(60_000).max(86_400_000).default(3_600_000),
  clipboard: CleanupClipboardOptions,
}).strict().default({
  enabled: true,
  intervalMillis: 3_600_000,
  clipboard: defaultClipboardCleanup,
});

const ContentOptions = zz.object({
  supportedMimeTypes: zz.array(MimeTypeSchema).min(1).max(64).default([
    "text/plain;charset=utf-8",
    "text/html",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ]),
}).strict().prefault({});

const HttpOptions = zz.object({
  jsonBodyLimitBytes: positiveInteger.max(16 * 1024 * 1024).default(256 * 1024),
  rateLimit: zz.object({
    limit: positiveInteger.default(600),
    windowMillis: positiveInteger.default(60_000),
  }).strict().default({ limit: 600, windowMillis: 60_000 }),
}).strict().default({
  jsonBodyLimitBytes: 256 * 1024,
  rateLimit: { limit: 600, windowMillis: 60_000 },
});

export type ManagedConfiguration = zz.output<typeof ManagedConfigurationSchema>;
export type DeviceConfiguration = ManagedConfiguration["devices"][number];
export type DeviceKeyConfiguration = DeviceConfiguration["keys"][number];
export type ChannelConfiguration = ManagedConfiguration["channels"][number];

export class CleanupOverrideError extends ConfigError {}

export function deviceKeyId(value: string): string {
  const match = deviceKeyPattern.exec(value);
  if (!match?.[1]) throw new Error("Invalid device API key");
  return match[1];
}

export function deviceKeySecret(value: string): string {
  const match = deviceKeyPattern.exec(value);
  if (!match?.[2]) throw new Error("Invalid device API key");
  return match[2];
}

function managedFromConfig(): ManagedConfiguration {
  const value = Config.get();
  return ManagedConfigurationSchema.parse({
    administrator: value.administrator,
    devices: value.devices,
    channels: value.channels,
  });
}

function cloneManaged(value: ManagedConfiguration): ManagedConfiguration {
  return structuredClone(value);
}

function sourceValue(value: unknown): ConfigValue {
  if (Array.isArray(value)) return value.map(sourceValue);
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean | null;
  }
  if (typeof value !== "object") {
    throw new ConfigError(`Unsupported configuration value: ${typeof value}`);
  }
  const mapper = fieldNameMappers.get("kebab_case_to_camel_case");
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [mapper.toSourceName(key), sourceValue(item)]),
  ) as ConfigObject;
}

function renderManaged(value: ManagedConfiguration): string {
  const root = parse(readFileSync(configPath, "utf8"));
  if (!isConfigObject(root)) {
    throw new ConfigError("Configuration root must be an object", {
      path: configPath,
    });
  }
  root.administrator = sourceValue(value.administrator);
  root.devices = sourceValue(value.devices);
  root.channels = sourceValue(value.channels);
  return `# Clipboard X Server configuration. Contains secrets; keep mode 0600.\n${stringify(root, {
    indent: 2,
    lineWidth: 0,
  })}`;
}

function writeConfig(contents: string): void {
  const directory = dirname(configPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, configPath);
    chmodSync(configPath, 0o600);
    const directoryDescriptor = openSync(directory, "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (cause) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
    throw cause;
  }
}

function writeManaged(value: ManagedConfiguration): void {
  writeConfig(renderManaged(value));
}

function renderCleanup(value: zz.output<typeof CleanupOptions>): string {
  const document = parseDocument(readFileSync(configPath, "utf8"));
  if (document.errors.length || !isConfigObject(document.toJS())) {
    throw new ConfigError("Configuration root must be a valid YAML object", { path: configPath });
  }
  document.set("cleanup", sourceValue(value));
  return document.toString({ indent: 2, lineWidth: 0 });
}

let managed = managedFromConfig();

const web = Config.section("web", WebOptions);
const limits = Config.section("limits", LimitsOptions);
const lifetimes = Config.section("lifetimes", LifetimesOptions);
let cleanup = CleanupOptions.parse(Config.section("cleanup", CleanupOptions));
const content = Config.section("content", ContentOptions);
const http = Config.section("http", HttpOptions);

export const config = Object.freeze({
  path: configPath,
  environment: configMode,
  host: FrameConfig.App.host,
  port: FrameConfig.App.port,
  tlsEnabled: Boolean(FrameConfig.App.tls?.certFile),
  shutdownTimeoutMillis: FrameConfig.App.shutdownTimeoutMillis,
  webRoot: Config.resolvePath(web.root),
  publicOrigin: web.publicOrigin,
  cookieSecure: web.cookieSecure,
  dataDirectory: FrameConfig.DataDir,
  objectDirectory: join(FrameConfig.DataDir, "objects"),
  maxObjectBytes: limits.maxObjectBytes,
  maxItemBytes: limits.maxItemBytes,
  maxPreviewBytes: limits.maxPreviewBytes,
  keyOverlapMillis: lifetimes.keyOverlapMillis,
  materializationTtlMillis: lifetimes.materializationTtlMillis,
  get cleanup() { return cleanup; },
  supportedMimeTypes: content.supportedMimeTypes,
  jsonBodyLimitBytes: http.jsonBodyLimitBytes,
  rateLimit: http.rateLimit,
  passwordMemoryCost: SecurityConfig.password.memoryCost,
  passwordTimeCost: SecurityConfig.password.timeCost,
  sessionTtlMillis: SessionConfig.ttlMillis,
  sessionTokenBytes: SessionConfig.tokenBytes,
  read(): ManagedConfiguration {
    return cloneManaged(managed);
  },
  updateCleanup(input: zz.input<typeof CleanupOptions>): zz.output<typeof CleanupOptions> {
    const next = CleanupOptions.parse(input);
    const previous = readFileSync(configPath, "utf8");
    writeConfig(renderCleanup(next));
    try {
      const effective = CleanupOptions.parse(loadYamlConfigSync(configLoadOptions).cleanup);
      if (JSON.stringify(effective) !== JSON.stringify(next)) {
        throw new CleanupOverrideError("Cleanup is overridden by an imported or environment configuration", { path: configPath });
      }
      cleanup = effective;
      return effective;
    } catch (cause) {
      writeConfig(previous);
      throw cause;
    }
  },
  change<Value>(
    mutate: (draft: ManagedConfiguration) => Value,
    apply: (next: ManagedConfiguration, value: Value) => void,
  ): Value {
    const previous = managed;
    const candidate = cloneManaged(previous);
    const result = mutate(candidate);
    const next = ManagedConfigurationSchema.parse(candidate);
    writeManaged(next);
    try {
      apply(next, result);
      managed = next;
      return result;
    } catch (cause) {
      try {
        writeManaged(previous);
      } catch (rollbackCause) {
        throw new AggregateError([cause, rollbackCause], "Configuration and database update both failed");
      }
      throw cause;
    }
  },
});

export function publicConfig(): Readonly<Record<string, unknown>> {
  return {
    environment: config.environment,
    host: config.host,
    port: config.port,
    tlsEnabled: config.tlsEnabled,
    publicOrigin: config.publicOrigin ?? "request origin",
    cookieSecure: config.cookieSecure,
    maxObjectBytes: config.maxObjectBytes,
    maxItemBytes: config.maxItemBytes,
    maxPreviewBytes: config.maxPreviewBytes,
  };
}

export { Config, FrameConfig } from "../frame/config";
