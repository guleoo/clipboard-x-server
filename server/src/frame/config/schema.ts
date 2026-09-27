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
    hostname: z.string().trim().min(1).default("127.0.0.1"),
    port: z.coerce.number().int().nonnegative().default(28_787),
    tls: TlsOptions.optional(),
    shutdownTimeoutMillis: z.number().int().positive().default(30_000),
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
  .strict();

export const LoggerConfigOptions = LoggerOptions;
