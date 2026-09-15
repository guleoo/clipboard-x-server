import { resolve } from "node:path";

process.env.APP_ENV ??= "test";
process.env.APP_CONFIG_FILE ??= resolve(import.meta.dir, "../config.yaml");
