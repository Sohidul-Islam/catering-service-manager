"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildSearchParamsWithFilters,
  countActiveFilters,
  FilterSchema,
  FilterValues,
  isFilterValueEqual,
  parseFiltersFromSearchParams,
  resetSchemaInSearchParams,
} from "@/lib/url-filters";

export interface UseUrlFiltersOptions<S extends FilterSchema> {
  prefix?: string;
  historyMode?: "replace" | "push";
  resetKeysOnFilterChange?: readonly (keyof S)[];
  nonResettingKeys?: readonly (keyof S)[];
  enabled?: boolean;
  scroll?: boolean;
}

export interface UseUrlFiltersResult<S extends FilterSchema> {
  filters: FilterValues<S>;
  setFilter: <K extends keyof S>(key: K, value: FilterValues<S>[K]) => void;
  setFilters: (patch: Partial<FilterValues<S>>) => void;
  clearFilter: <K extends keyof S>(key: K) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

function getDefaultValues<S extends FilterSchema>(schema: S): FilterValues<S> {
  const result = {} as FilterValues<S>;
  for (const key of Object.keys(schema) as (keyof S & string)[]) {
    const def = schema[key].defaultValue;
    result[key] = Array.isArray(def) ? ([...def] as FilterValues<S>[typeof key]) : def;
  }
  return result;
}

export function useUrlFilters<S extends FilterSchema>(
  schema: S,
  options?: UseUrlFiltersOptions<S>
): UseUrlFiltersResult<S> {
  const prefix = options?.prefix;
  const historyMode = options?.historyMode ?? "replace";
  const resetKeysSig = options?.resetKeysOnFilterChange?.join("\0") ?? "";
  const nonResettingKeysSig = options?.nonResettingKeys?.join("\0") ?? "";
  const resetKeys = useMemo(
    () => (resetKeysSig ? (resetKeysSig.split("\0") as (keyof S)[]) : undefined),
    [resetKeysSig]
  );
  const nonResettingKeys = useMemo(
    () =>
      nonResettingKeysSig
        ? (nonResettingKeysSig.split("\0") as (keyof S)[])
        : undefined,
    [nonResettingKeysSig]
  );
  const enabled = options?.enabled ?? true;
  const scroll = options?.scroll ?? false;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const [localState, setLocalState] = useState<FilterValues<S>>(() =>
    getDefaultValues(schema)
  );

  const urlFilters = useMemo(
    () => parseFiltersFromSearchParams(searchParams, schema, prefix),
    [searchParams, schema, prefix]
  );

  const filters = enabled ? urlFilters : localState;

  const commitSearchParams = useCallback(
    (updater: (base: URLSearchParams) => URLSearchParams) => {
      const base =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(searchParamsRef.current.toString());
      const next = updater(base);
      const baseQuery = base.toString();
      const nextQuery = next.toString();
      if (baseQuery === nextQuery) return;

      const targetUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      if (historyMode === "push") {
        router.push(targetUrl, { scroll });
      } else {
        router.replace(targetUrl, { scroll });
      }
    },
    [historyMode, pathname, router, scroll]
  );

  const setFilters = useCallback(
    (patch: Partial<FilterValues<S>>) => {
      if (!enabled) {
        setLocalState((prev) => {
          const resetSet = new Set<keyof S>(resetKeys ?? []);
          const nonResettingSet = new Set<keyof S>([
            ...(nonResettingKeys ?? []),
            ...(resetKeys ?? []),
          ]);
          let shouldReset = false;
          if (resetKeys && resetKeys.length > 0) {
            for (const key of Object.keys(patch) as (keyof S & string)[]) {
              if (!(key in schema) || nonResettingSet.has(key)) continue;
              const nextVal = patch[key];
              if (
                nextVal !== undefined &&
                !isFilterValueEqual(schema[key], prev[key], nextVal)
              ) {
                shouldReset = true;
                break;
              }
            }
          }
          const next = { ...prev, ...patch };
          if (shouldReset) {
            for (const rk of resetSet) {
              if (!(rk in patch) && rk in schema) {
                next[rk] = schema[rk].defaultValue;
              }
            }
          }
          return next;
        });
        return;
      }

      commitSearchParams((base) =>
        buildSearchParamsWithFilters(base, patch, schema, {
          prefix,
          resetKeysOnFilterChange: resetKeys,
          nonResettingKeys,
        })
      );
    },
    [commitSearchParams, enabled, nonResettingKeys, prefix, resetKeys, schema]
  );

  const setFilter = useCallback(
    <K extends keyof S>(key: K, value: FilterValues<S>[K]) => {
      setFilters({ [key]: value } as unknown as Partial<FilterValues<S>>);
    },
    [setFilters]
  );

  const clearFilter = useCallback(
    <K extends keyof S>(key: K) => {
      setFilters({
        [key]: schema[key].defaultValue,
      } as unknown as Partial<FilterValues<S>>);
    },
    [schema, setFilters]
  );

  const resetFilters = useCallback(() => {
    if (!enabled) {
      setLocalState(getDefaultValues(schema));
      return;
    }
    commitSearchParams((base) => resetSchemaInSearchParams(base, schema, prefix));
  }, [commitSearchParams, enabled, prefix, schema]);

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters, schema, resetKeys),
    [filters, schema, resetKeys]
  );

  return {
    filters,
    setFilter,
    setFilters,
    clearFilter,
    resetFilters,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
  };
}
