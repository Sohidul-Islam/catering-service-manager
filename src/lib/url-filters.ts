export interface FilterParamCodec<T> {
  defaultValue: T;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null;
  equals?: (a: T, b: T) => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterSchema = Record<string, FilterParamCodec<any>>;

export type FilterValues<S extends FilterSchema> = {
  [K in keyof S]: S[K] extends FilterParamCodec<infer T> ? T : never;
};

function defaultEquals<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export const filterCodecs = {
  string(defaultValue = ""): FilterParamCodec<string> {
    return {
      defaultValue,
      parse(raw) {
        if (raw === null) return defaultValue;
        return raw;
      },
      serialize(value) {
        if (value === defaultValue || value === "") return null;
        return value;
      },
    };
  },

  enum<T extends string>(
    allowed: readonly T[],
    defaultValue: T
  ): FilterParamCodec<T> {
    const allowedSet = new Set<string>(allowed);
    return {
      defaultValue,
      parse(raw) {
        if (raw !== null && allowedSet.has(raw)) {
          return raw as T;
        }
        return defaultValue;
      },
      serialize(value) {
        if (value === defaultValue) return null;
        return value;
      },
    };
  },

  int(
    defaultValue: number,
    options?: { min?: number; max?: number }
  ): FilterParamCodec<number> {
    return {
      defaultValue,
      parse(raw) {
        if (raw === null || !/^-?\d+$/.test(raw.trim())) {
          return defaultValue;
        }
        const parsed = Number(raw.trim());
        if (!Number.isSafeInteger(parsed)) return defaultValue;
        if (options?.min !== undefined && parsed < options.min) {
          return defaultValue;
        }
        if (options?.max !== undefined && parsed > options.max) {
          return defaultValue;
        }
        return parsed;
      },
      serialize(value) {
        if (!Number.isSafeInteger(value) || value === defaultValue) {
          return null;
        }
        return String(value);
      },
    };
  },

  boolean(defaultValue = false): FilterParamCodec<boolean> {
    return {
      defaultValue,
      parse(raw) {
        if (raw === null) return defaultValue;
        const normalized = raw.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
        return defaultValue;
      },
      serialize(value) {
        if (value === defaultValue) return null;
        return value ? "true" : "false";
      },
    };
  },

  date(defaultValue = ""): FilterParamCodec<string> {
    return {
      defaultValue,
      parse(raw) {
        if (raw === null) return defaultValue;
        const trimmed = raw.trim();
        if (isValidIsoDate(trimmed)) return trimmed;
        return defaultValue;
      },
      serialize(value) {
        if (!value || value === defaultValue || !isValidIsoDate(value)) {
          return null;
        }
        return value;
      },
    };
  },

  stringArray(defaultValue: readonly string[] = []): FilterParamCodec<string[]> {
    const defaultArr = [...defaultValue];
    const arraysEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((item, idx) => item === b[idx]);

    return {
      defaultValue: defaultArr,
      parse(raw) {
        if (raw === null) return [...defaultArr];
        const seen = new Set<string>();
        const result: string[] = [];
        for (const part of raw.split(",")) {
          const trimmed = part.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
          }
        }
        return result;
      },
      serialize(value) {
        if (value.length === 0 || arraysEqual(value, defaultArr)) {
          return null;
        }
        return value.join(",");
      },
      equals: arraysEqual,
    };
  },
};

export function getParamKey(key: string, prefix?: string): string {
  return prefix ? `${prefix}${key}` : key;
}

export function isFilterValueEqual<T>(
  codec: FilterParamCodec<T>,
  a: T,
  b: T
): boolean {
  return codec.equals ? codec.equals(a, b) : defaultEquals(a, b);
}

export function parseFiltersFromSearchParams<S extends FilterSchema>(
  searchParams: Pick<URLSearchParams, "get">,
  schema: S,
  prefix?: string
): FilterValues<S> {
  const result = {} as FilterValues<S>;
  for (const key of Object.keys(schema) as (keyof S & string)[]) {
    const codec = schema[key];
    const paramKey = getParamKey(key, prefix);
    result[key] = codec.parse(searchParams.get(paramKey));
  }
  return result;
}

export interface BuildSearchParamsOptions<S extends FilterSchema> {
  prefix?: string;
  resetKeysOnFilterChange?: readonly (keyof S)[];
  nonResettingKeys?: readonly (keyof S)[];
}

export function buildSearchParamsWithFilters<S extends FilterSchema>(
  currentSearchParams: URLSearchParams,
  patch: Partial<FilterValues<S>>,
  schema: S,
  options?: BuildSearchParamsOptions<S>
): URLSearchParams {
  const prefix = options?.prefix;
  const resetKeys = options?.resetKeysOnFilterChange ?? [];
  const nonResettingSet = new Set<keyof S>([
    ...(options?.nonResettingKeys ?? []),
    ...resetKeys,
  ]);

  const next = new URLSearchParams(currentSearchParams.toString());
  const currentValues = parseFiltersFromSearchParams(
    currentSearchParams,
    schema,
    prefix
  );

  let shouldResetDependentKeys = false;
  if (resetKeys.length > 0) {
    for (const key of Object.keys(patch) as (keyof S & string)[]) {
      if (!(key in schema) || nonResettingSet.has(key)) continue;
      const nextVal = patch[key];
      if (
        nextVal !== undefined &&
        !isFilterValueEqual(schema[key], currentValues[key], nextVal)
      ) {
        shouldResetDependentKeys = true;
        break;
      }
    }
  }

  const effectivePatch: Partial<FilterValues<S>> = { ...patch };
  if (shouldResetDependentKeys) {
    for (const resetKey of resetKeys) {
      if (!(resetKey in effectivePatch) && resetKey in schema) {
        effectivePatch[resetKey] = schema[resetKey].defaultValue;
      }
    }
  }

  for (const key of Object.keys(effectivePatch) as (keyof S & string)[]) {
    if (!(key in schema)) continue;
    const val = effectivePatch[key];
    if (val === undefined) continue;
    const codec = schema[key];
    const paramKey = getParamKey(key, prefix);
    const serialized = codec.serialize(val);
    if (serialized === null) {
      next.delete(paramKey);
    } else {
      next.set(paramKey, serialized);
    }
  }

  return next;
}

export function resetSchemaInSearchParams<S extends FilterSchema>(
  currentSearchParams: URLSearchParams,
  schema: S,
  prefix?: string
): URLSearchParams {
  const next = new URLSearchParams(currentSearchParams.toString());
  for (const key of Object.keys(schema)) {
    next.delete(getParamKey(key, prefix));
  }
  return next;
}

export function countActiveFilters<S extends FilterSchema>(
  values: FilterValues<S>,
  schema: S,
  excludeKeys: readonly (keyof S)[] = []
): number {
  const excluded = new Set<keyof S>(excludeKeys);
  let count = 0;
  for (const key of Object.keys(schema) as (keyof S & string)[]) {
    if (excluded.has(key)) continue;
    if (!isFilterValueEqual(schema[key], values[key], schema[key].defaultValue)) {
      count += 1;
    }
  }
  return count;
}
