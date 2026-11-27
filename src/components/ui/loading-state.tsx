"use client";

import React from "react";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function PageLoader({
  label = "Loading...",
  description,
  className,
}: {
  label?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="relative flex h-12 w-12 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        <UtensilsCrossed className="h-5 w-5 text-blue-600" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{label}</p>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  label,
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3 py-2">
      {label && (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Spinner className="h-3.5 w-3.5 text-blue-600" />
          <span>{label}</span>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 animate-pulse"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-8 w-8 rounded-full bg-slate-200/80 shrink-0" />
              <div className="space-y-1.5 flex-1 max-w-xs">
                <div className="h-3.5 w-2/3 rounded bg-slate-200/80" />
                <div className="h-2.5 w-1/2 rounded bg-slate-200/60" />
              </div>
            </div>
            <div className="h-5 w-16 rounded-full bg-slate-200/80" />
            <div className="h-4 w-20 rounded bg-slate-200/70 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Spinner className="h-3.5 w-3.5 text-blue-600" />
          <span>Loading meal schedule...</span>
        </div>
        <div className="h-4 w-28 rounded bg-slate-200/70 animate-pulse" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 animate-pulse flex flex-col justify-between"
          >
            <div className="flex justify-between items-center">
              <div className="h-3.5 w-5 rounded bg-slate-200/80" />
              <div className="h-3 w-8 rounded bg-slate-200/60" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-slate-200/70" />
              <div className="h-4 w-1/2 rounded-full bg-slate-200/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
