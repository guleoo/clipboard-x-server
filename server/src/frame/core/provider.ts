import { BaseError } from "./error";

export interface ProviderToken<Value> {
  readonly name: string;
  readonly key: symbol;
  readonly value?: Value;
}

export interface ProvideOptions {
  readonly override?: boolean;
}

export class ProviderError extends BaseError<{
  readonly provider?: string;
}> {}

const values = new Map<symbol, unknown>();

export namespace Provider {
  export const Error = ProviderError;

  export function create<Value>(name: string): ProviderToken<Value> {
    if (!name.trim()) throw new ProviderError("Provider name is required");
    return { name, key: Symbol(name) };
  }

  export function provide<Value>(
    token: ProviderToken<Value>,
    value: Value,
    options: ProvideOptions = {},
  ): void {
    if (!options.override && values.has(token.key)) {
      throw new ProviderError(`${token.name} provider is already registered`, {
        provider: token.name,
      });
    }
    values.set(token.key, value);
  }

  export function inject<Value>(token: ProviderToken<Value>): Value {
    if (!values.has(token.key)) {
      throw new ProviderError(`${token.name} provider is not registered`, {
        provider: token.name,
      });
    }
    return values.get(token.key) as Value;
  }

  export function has<Value>(token: ProviderToken<Value>): boolean {
    return values.has(token.key);
  }

  export function unprovide<Value>(token: ProviderToken<Value>): void {
    values.delete(token.key);
  }
}
