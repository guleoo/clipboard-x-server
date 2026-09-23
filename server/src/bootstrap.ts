import { closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, fsyncSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseDocument } from "yaml";

export interface BootstrapConfigOptions {
  configPath: string;
  templatePath: string;
  password: string;
  publicOrigin: string;
}

export function bootstrapConfig(options: BootstrapConfigOptions): boolean {
  if (existsSync(options.configPath)) return false;
  if (options.password.length < 7 || options.password.length > 256) {
    throw new Error("CBX_ADMIN_PASSWORD must contain 7 to 256 characters");
  }
  const origin = new URL(options.publicOrigin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("CBX_PUBLIC_ORIGIN must be an HTTP or HTTPS URL");
  }

  const document = parseDocument(readFileSync(options.templatePath, "utf8"));
  if (document.errors.length > 0) throw document.errors[0];
  document.setIn(["administrator", "password"], options.password);
  document.setIn(["app", "hostname"], "0.0.0.0");
  document.setIn(["database", "migrations-folder"], "../server/drizzle");
  document.setIn(["web", "public-origin"], origin.toString().replace(/\/$/, ""));
  document.setIn(["web", "cookie-secure"], origin.protocol === "https:");

  mkdirSync(dirname(options.configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${options.configPath}.${randomUUID()}.tmp`;
  try {
    const file = openSync(temporaryPath, "wx", 0o600);
    try {
      writeFileSync(file, document.toString());
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    try {
      linkSync(temporaryPath, options.configPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    }
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return true;
}

const password = process.env.CBX_BOOTSTRAP_ADMIN_PASSWORD;
if (password !== undefined) {
  bootstrapConfig({
    configPath: process.env.CBX_BOOTSTRAP_CONFIG_PATH ?? "/app/config/config.yaml",
    templatePath: process.env.CBX_BOOTSTRAP_TEMPLATE_PATH ?? "/app/server/config.example.yaml",
    password,
    publicOrigin: process.env.CBX_BOOTSTRAP_PUBLIC_ORIGIN ?? "http://127.0.0.1:28787",
  });
}
