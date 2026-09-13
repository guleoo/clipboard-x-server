type DictInput = Record<
  string,
  { readonly label: string; readonly desc?: string; readonly sort?: number }
>;
type DictValue<Items extends DictInput> = Extract<keyof Items, string>;
type DictItems<Type extends string, Items extends DictInput> = {
  readonly [Value in DictValue<Items>]: DictItem<Type, Value>;
};

export interface DictItem<Type extends string = string, Value extends string = string> {
  readonly type: Type;
  readonly value: Value;
  readonly label: string;
  readonly description?: string;
  readonly sort: number;
}

const DEFAULT_SORT = 255;

export function defineDict<const Type extends string, const Items extends DictInput>(
  type: Type,
  input: Items,
) {
  type Value = DictValue<Items>;
  const declared = Object.keys(input) as Value[];
  let itemsCache: DictItems<Type, Items> | undefined;
  let valuesCache: readonly Value[] | undefined;
  let rowsCache: readonly DictItem<Type, Value>[] | undefined;
  let setCache: ReadonlySet<Value> | undefined;

  const item = (value: Value): DictItem<Type, Value> => ({
    type,
    value,
    label: input[value]!.label,
    ...(input[value]!.desc === undefined ? {} : { description: input[value]!.desc }),
    sort: input[value]!.sort ?? DEFAULT_SORT,
  });

  function values(): readonly Value[] {
    valuesCache ??= Object.freeze(
      declared
        .map((value, index) => ({ value, index, sort: input[value]!.sort ?? DEFAULT_SORT }))
        .sort((left, right) => left.sort - right.sort || left.index - right.index)
        .map(({ value }) => value),
    );
    return valuesCache;
  }

  return Object.freeze({
    type,
    Value: undefined as unknown as Value,
    items(): DictItems<Type, Items> {
      if (!itemsCache) {
        itemsCache = Object.freeze(
          Object.fromEntries(declared.map((value) => [value, item(value)])),
        ) as DictItems<Type, Items>;
      }
      return itemsCache;
    },
    values,
    rows(): readonly DictItem<Type, Value>[] {
      rowsCache ??= Object.freeze(values().map(item));
      return rowsCache;
    },
    is(value: unknown): value is Value {
      setCache ??= new Set(declared);
      return typeof value === "string" && setCache.has(value as Value);
    },
  });
}
