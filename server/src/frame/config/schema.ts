import { z } from "zod";
import { validZone } from "../core";
import { LoggerOptions } from "../logger/config";

const TlsOptions = z.object({
  certFile: z.string().trim().default(""),
  keyFile: z.string().trim().default(""),
}).strict().superRefine(({ certFile, keyFile }, context) => {
  if (Boolean(certFile) !== Boolean(keyFile)) {
    context.addIssue({
      code: "custom",
      message: "TLS certificate and private key must be configured together",
    });
  }
});

export const AppOptions = z
  .object({
    name: z.string().trim().min(1).default("clipboard-x-server"),
    host: z.string().trim().min(1).default("0.0.0.0"),
    port: z.coerce.number().int().nonnegative().default(28_787),
    dataDir: z.string().trim().min(1).default("./data"),
    tls: TlsOptions.optional(),
    shutdownTimeout: z.number().min(0.001).default(30),
    apiPrefix: z.string().default("/"),
    routeSurfaces: z
      .object({
        admin: z.string().default("/admin/api"),
        app: z.string().default("/api"),
      })
      .catchall(z.string())
      .default({ admin: "/admin/api", app: "/api" }),
    timezone: z.string().refine(validZone, "Invalid time zone").default("UTC"),
  })
  .strict()
  .transform(({ shutdownTimeout, ...app }) => ({
    ...app,
    shutdownTimeoutMillis: Math.round(shutdownTimeout * 1_000),
  }));

export const LoggerConfigOptions = LoggerOptions;
