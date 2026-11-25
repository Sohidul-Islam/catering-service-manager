"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatBDT } from "@/lib/money";
import {
  copyTextToClipboard,
  formatMealSummaryText,
  MealSummaryGuestDisplay,
  MealSummaryPayload,
  MealSummaryPeriod,
  resolveSummarySignature,
} from "@/lib/meal-summary";
import { addDays, formatDateRangeLabel, formatLongDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SIGNATURE_STORAGE_KEY = "pcs_meal_summary_signature";

const PERIOD_TABS: { value: MealSummaryPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const DISPLAY_OPTIONS: { value: MealSummaryGuestDisplay; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "name_email", label: "Name & Email" },
  { value: "name", label: "Name" },
];

function getLocalTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function MealSummaryPanel({
  initialPeriod = "today",
  compact = false,
  className,
}: {
  initialPeriod?: MealSummaryPeriod;
  compact?: boolean;
  className?: string;
}) {
  const now = new Date();
  const [period, setPeriod] = useState<MealSummaryPeriod>(initialPeriod);
  const [anchorDate, setAnchorDate] = useState<string>("");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [customStart, setCustomStart] = useState<string>(getLocalTodayStr);
  const [customEnd, setCustomEnd] = useState<string>(getLocalTodayStr);

  const [data, setData] = useState<MealSummaryPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [guestDisplay, setGuestDisplay] = useState<MealSummaryGuestDisplay>("email");
  const [includeCost, setIncludeCost] = useState<boolean>(false);
  const [includeDailyBreakdown, setIncludeDailyBreakdown] = useState<boolean>(false);
  const [includeZeroMealGuests, setIncludeZeroMealGuests] = useState<boolean>(false);
  const [customNote, setCustomNote] = useState<string>("");
  const [signature, setSignature] = useState<string>("");
  const [hasStoredSignature, setHasStoredSignature] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIGNATURE_STORAGE_KEY);
      if (saved && saved.trim()) {
        setSignature(saved);
        setHasStoredSignature(true);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const loadSummary = useCallback(async () => {
    if (period === "custom" && customStart && customEnd && customStart > customEnd) {
      setError("Start date must be on or before end date.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ period });
      if (period === "weekly" && anchorDate) {
        qs.set("date", anchorDate);
      } else if (period === "monthly") {
        qs.set("year", String(year));
        qs.set("month", String(month));
      } else if (period === "custom") {
        if (customStart) qs.set("startDate", customStart);
        if (customEnd) qs.set("endDate", customEnd);
      }

      const res = await fetch(`/api/meal-summary?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load meal summary");

      const payload = json as MealSummaryPayload;
      setData(payload);

      if (!hasStoredSignature) {
        setSignature((prev) => prev || resolveSummarySignature(payload.organizationName));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load meal summary";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [period, anchorDate, year, month, customStart, customEnd, hasStoredSignature]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  function handleSignatureChange(val: string) {
    setSignature(val);
    setHasStoredSignature(Boolean(val.trim()));
    try {
      if (val.trim()) {
        window.localStorage.setItem(SIGNATURE_STORAGE_KEY, val);
      } else {
        window.localStorage.removeItem(SIGNATURE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  const isMultiDay = Boolean(data && data.startDate !== data.endDate);

  const formattedText = useMemo(() => {
    if (!data) return "";
    return formatMealSummaryText(data, {
      guestDisplay,
      includeCost,
      includeDailyBreakdown: isMultiDay && includeDailyBreakdown,
      includeZeroMealGuests,
      customNote,
      signature,
    });
  }, [
    data,
    guestDisplay,
    includeCost,
    isMultiDay,
    includeDailyBreakdown,
    includeZeroMealGuests,
    customNote,
    signature,
  ]);

  async function handleCopy() {
    if (!formattedText) return;
    try {
      await copyTextToClipboard(formattedText);
      setCopied(true);
      toast.success("Meal summary copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy summary");
    }
  }

  const baseYear = now.getFullYear();
  const yearOptions = [baseYear - 1, baseYear, baseYear + 1, baseYear + 2];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Period tabs + Period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setPeriod(tab.value);
                if (tab.value === "weekly" && !anchorDate && data?.today) {
                  setAnchorDate(data.today);
                }
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                period === tab.value
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(period === "today" || period === "tomorrow") && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {data && <span className="font-medium">{formatLongDate(data.startDate)}</span>}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={loadSummary}
                title="Refresh summary"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          )}

          {period === "weekly" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setAnchorDate(addDays(anchorDate || data?.today || getLocalTodayStr(), -7))
                }
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAnchorDate(data?.today || "")}
              >
                This Week
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setAnchorDate(addDays(anchorDate || data?.today || getLocalTodayStr(), 7))
                }
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {data && (
                <span className="text-xs font-medium text-slate-600 ml-1">
                  {formatDateRangeLabel(data.startDate, data.endDate)}
                </span>
              )}
            </div>
          )}

          {period === "monthly" && (
            <div className="flex items-center gap-2">
              <Select
                className="w-32 h-8 text-xs"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, m - 1).toLocaleDateString("en-US", { month: "long" })}
                  </option>
                ))}
              </Select>
              <Select
                className="w-24 h-8 text-xs"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                aria-label="Summary start date"
                className="w-36 h-8 text-xs"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                aria-label="Summary end date"
                className="w-36 h-8 text-xs"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Format & Enhancement Options */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Guest Format:</span>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
              {DISPLAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGuestDisplay(opt.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                    guestDisplay === opt.value
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCost}
                onChange={(e) => setIncludeCost(e.target.checked)}
              />
              Include Cost (৳)
            </label>
            {isMultiDay && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDailyBreakdown}
                  onChange={(e) => setIncludeDailyBreakdown(e.target.checked)}
                />
                Daily Breakdown
              </label>
            )}
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeZeroMealGuests}
                onChange={(e) => setIncludeZeroMealGuests(e.target.checked)}
              />
              Include 0-meal guests
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="summary-note" className="text-[11px]">
              Optional Note
            </Label>
            <Input
              id="summary-note"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Please deliver by 1:00 PM"
              className="mt-1 h-8 text-xs bg-white"
            />
          </div>
          <div>
            <Label htmlFor="summary-signature" className="text-[11px]">
              Signature
            </Label>
            <Input
              id="summary-signature"
              value={signature}
              onChange={(e) => handleSignatureChange(e.target.value)}
              placeholder="Premium Catering Service (Mediusware Ltd)"
              className="mt-1 h-8 text-xs bg-white"
            />
          </div>
        </div>
      </div>

      {/* KPI Badges + Copy Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <>
              <Badge variant="info">Guests: {data.totalGuestsWithMeals}</Badge>
              <Badge variant="success">Total Meals: {data.totalMeals}</Badge>
              <Badge variant="muted">Total Amount: {formatBDT(data.totalAmountPoisha)}</Badge>
            </>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          disabled={loading || !formattedText}
          onClick={handleCopy}
          className={cn(
            copied && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
          )}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy Summary
            </>
          )}
        </Button>
      </div>

      {/* Live Preview */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : loading && !data ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Loading meal summary...
        </div>
      ) : (
        <pre
          className={cn(
            "whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs sm:text-sm font-mono text-slate-800 overflow-y-auto",
            compact ? "max-h-64" : "max-h-80"
          )}
        >
          {formattedText}
        </pre>
      )}
    </div>
  );
}
