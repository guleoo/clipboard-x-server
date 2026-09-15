import { BaseError } from "../core";

export class ConfigError extends BaseError<{
  readonly path?: string;
}> {}

export class ConfigImportCycleError extends BaseError<{
  readonly chain: readonly string[];
}> {
  constructor(chain: readonly string[]) {
    super(`Configuration import cycle: ${chain.join(" -> ")}`, { chain });
  }
}

export class ConfigInterpolationError extends BaseError<{
  readonly token?: string;
}> {}
