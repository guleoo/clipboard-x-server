import { AsyncLocalStorage } from "node:async_hooks";
import type { Fields } from "./common";
import { BaseError } from "./error";

export class ContextError extends BaseError {}

type StoreValue<Value> = Value & Fields;
type StoreGet<Value, Key extends string> = Key extends keyof Value
  ? Value[Key] | undefined
  : unknown;
type StoreFetch<Value, Key extends string> = Key extends keyof Value
  ? NonNullable<Value[Key]>
  : unknown;
type StoreSet<Value, Key extends string> = Key extends keyof Value
  ? Value[Key]
  : unknown;
type ContextToken<Value> = symbol & { readonly context?: Value };

const FRAME_TOKEN = Symbol("AsyncStore.frame.token");
const FRAME_PARENT = Symbol("AsyncStore.frame.parent");
const FRAME_VALUE = Symbol("AsyncStore.frame.value");

interface ContextFrame<Value = unknown> {
  readonly [FRAME_TOKEN]?: ContextToken<Value>;
  readonly [FRAME_PARENT]?: ContextFrame;
  readonly [FRAME_VALUE]: StoreValue<Value>;
}

export interface ContextOptions {
  readonly key: string;
  /**
   * Whether only one context with this identity may exist in an async chain.
   * Anonymous AsyncStore.run() frames have no identity and are not checked.
   */
  readonly unique?: boolean;
}

export interface ContextHandle<Value> {
  readonly key: string;
  readonly unique: boolean;
  getStore(): StoreValue<Value> | undefined;
  get<Key extends string>(key: Key): StoreGet<Value, Key>;
  fetch<Key extends string>(key: Key): StoreFetch<Value, Key>;
  set<Key extends string>(key: Key, value: StoreSet<Value, Key>): void;
  run<Result>(value: StoreValue<Value>, callback: () => Result): Result;
}

export interface AsyncStoreApi {
  getStore(): Fields | undefined;
  get<Key extends string>(key: Key): unknown;
  fetch<Key extends string>(key: Key): unknown;
  set<Key extends string>(key: Key, value: unknown): void;
  run<Result>(value: Fields, callback: () => Result): Result;
  context<Value>(options: ContextOptions): ContextHandle<Value>;
}

function hasKey(frame: ContextFrame, key: string): boolean {
  return key in frame[FRAME_VALUE];
}

function createAsyncStore(): AsyncStoreApi {
  const storage = new AsyncLocalStorage<ContextFrame>();
  const registry = new Map<string, ContextHandle<unknown>>();

  function currentFrame(): ContextFrame | undefined {
    return storage.getStore();
  }

  function requireFrame(operation: string): ContextFrame {
    const frame = currentFrame();
    if (!frame) {
      throw new ContextError(
        `AsyncStore.${operation}() called outside AsyncStore.run()`,
      );
    }
    return frame;
  }

  function findFrame<Value>(
    token: ContextToken<Value>,
  ): ContextFrame<Value> | undefined {
    let frame = currentFrame();
    while (frame) {
      if (frame[FRAME_TOKEN] === token) return frame as ContextFrame<Value>;
      frame = frame[FRAME_PARENT];
    }
    return undefined;
  }

  function getFromChain(key: string, start = currentFrame()): unknown {
    let frame = start;
    while (frame) {
      if (hasKey(frame, key)) return frame[FRAME_VALUE][key];
      frame = frame[FRAME_PARENT];
    }
    return undefined;
  }

  function fetchValue(key: string, value: unknown, source: string): unknown {
    if (value !== undefined && value !== null) return value;
    throw new ContextError(`${source}.fetch("${key}") failed: value is missing`);
  }

  const store: AsyncStoreApi = {
    getStore: () => currentFrame()?.[FRAME_VALUE],
    get: (key) => getFromChain(key),
    fetch: (key) => fetchValue(key, getFromChain(key), "AsyncStore"),
    set(key, value) {
      requireFrame("set")[FRAME_VALUE][key] = value;
    },
    run(value, callback) {
      return storage.run(
        {
          [FRAME_VALUE]: value,
          [FRAME_PARENT]: currentFrame(),
        },
        callback,
      );
    },
    context<Value>(options: ContextOptions): ContextHandle<Value> {
      if (!options.key.trim()) {
        throw new ContextError("AsyncStore.context() requires a non-empty key");
      }
      if (registry.has(options.key)) {
        throw new ContextError(`Context "${options.key}" is already registered`);
      }

      const token = Symbol(options.key) as ContextToken<Value>;
      const unique = options.unique ?? true;
      const handle: ContextHandle<Value> = {
        key: options.key,
        unique,
        getStore: () => findFrame(token)?.[FRAME_VALUE],
        get: (key) => {
          const frame = findFrame(token);
          if (!frame) return undefined as StoreGet<Value, typeof key>;
          return getFromChain(key, frame) as StoreGet<Value, typeof key>;
        },
        fetch: (key) => {
          const frame = findFrame(token);
          return fetchValue(
            key,
            frame ? getFromChain(key, frame) : undefined,
            options.key,
          ) as StoreFetch<Value, typeof key>;
        },
        set(key, value) {
          const frame = findFrame(token);
          if (!frame) {
            throw new ContextError(
              `${options.key}.set() called outside ${options.key}.run()`,
            );
          }
          const fields = frame[FRAME_VALUE] as Fields;
          fields[key] = value;
        },
        run(value, callback) {
          if (unique && findFrame(token)) {
            throw new ContextError(
              `${options.key} already exists in the current async context`,
            );
          }
          return storage.run(
            {
              [FRAME_TOKEN]: token,
              [FRAME_VALUE]: value,
              [FRAME_PARENT]: currentFrame(),
            },
            callback,
          );
        },
      };

      registry.set(options.key, handle as ContextHandle<unknown>);
      return handle;
    },
  };

  return store;
}

export const AsyncStore = createAsyncStore();
