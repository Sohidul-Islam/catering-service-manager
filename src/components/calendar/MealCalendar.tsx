"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Lock,
  Mail,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Utensils,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailPreviewData, EmailPreviewModal } from "@/components/email/EmailPreviewModal";
import { formatBDT } from "@/lib/money";
import {
  fetchCalendarDeduped,
  getCachedCalendar,
  invalidateCalendarCache,
  setCachedCalendar,
} from "@/lib/calendar-cache";
import { invalidateDashboardCache } from "@/lib/dashboard-cache";
import { copyTextToClipboard, formatMealSummaryText } from "@/lib/meal-summary";
import { addDays } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface CalendarGuestRecord {
  id: string;
  userId: string;
  guestName: string;
  guestEmail: string;
  guestStatus: string;
  guestMealStartDate?: string | null;
  quantity: number;
  unitPricePoisha: number;
  totalPoisha: number;
  source?: string;
  overrideScope?: string | null;
  isCustomized: boolean;
  isFinalized: boolean;
}

export interface CalendarGuestSummary {
  id: string;
  name: string;
  email: string;
  status: string;
  mealPreference: string;
  defaultMealQty: number;
  mealStartDate: string | null;
}

export interface CalendarDay {
  date: string;
  isToday: boolean;
  isWorkingDay: boolean;
  isLocked: boolean;
  holiday: {
    id: string;
    name: string;
    type: "HOLIDAY" | "OFFICE_CLOSED" | "SPECIAL_WORKING_DAY";
    allowMeals: boolean;
    note?: string | null;
  } | null;
  hasCustomPrice: boolean;
  effectivePricePoisha: number;
  totalMeals: number;
  activeGuestsCount: number;
  totalAmountPoisha: number;
  pendingAdjustmentsCount: number;
  records: CalendarGuestRecord[];
  myPendingRequest: {
    id: string;
    requestedQuantity: number;
    status: string;
    reason?: string | null;
  } | null;
}

interface CalendarResponse {
  year: number;
  month: number;
  today: string;
  guestMealStartDate?: string | null;
  guests?: CalendarGuestSummary[];
  settings: {
    organizationName?: string;
    timezone: string;
    defaultMealPricePoisha: number;
    deadlineHour: number;
    deadlineMinute: number;
    maxMealQty: number | null;
  };
  days: CalendarDay[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDayOfWeekUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function MealCalendar({ mode }: { mode: "ADMIN" | "GUEST" }) {
  const nowDate = new Date();
  const [year, setYear] = useState(nowDate.getFullYear());
  const [month, setMonth] = useState(nowDate.getMonth() + 1);
  const [view, setView] = useState<"month" | "week">("month");
  const [weekIndex, setWeekIndex] = useState(0);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const updateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const latestSeqRef = useRef<Map<string, number>>(new Map());

  // Guest late adjustment modal state
  const [lateQty, setLateQty] = useState(1);
  const [lateReason, setLateReason] = useState("");
  const [submittingLate, setSubmittingLate] = useState(false);

  // Admin override reason & adjustment email / invoice recalculation prompts
  const [applyScope, setApplyScope] = useState<"SINGLE_DATE" | "FOLLOWING_DATES">("SINGLE_DATE");
  const [overrideReason, setOverrideReason] = useState("");
  const [showUnscheduledGuests, setShowUnscheduledGuests] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [copiedDaySummary, setCopiedDaySummary] = useState(false);
  const baselineQtyRef = useRef<Map<string, number>>(new Map());
  const [lastAdjustment, setLastAdjustment] = useState<{
    guestId: string;
    guestName: string;
    date: string;
    previousQuantity: number;
    newQuantity: number;
    unitPricePoisha: number;
    note?: string;
  } | null>(null);
  const [affectedInvoice, setAffectedInvoice] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    currentTotalPoisha: number;
    projectedTotalPoisha: number;
  } | null>(null);
  const [updatingInvoice, setUpdatingInvoice] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);

  const cacheKey = `${mode}:${year}-${month}`;
  const activeKeyRef = useRef(cacheKey);

  const fetchCalendar = useCallback(
    async (silent = false, force = false) => {
      const requestKey = `${mode}:${year}-${month}`;
      const cached = !force ? getCachedCalendar<CalendarResponse>(requestKey) : null;

      if (cached) {
        setData(cached.data);
        setSelectedDay((prev) => {
          if (!prev) return null;
          return cached.data.days.find((d) => d.date === prev.date) ?? prev;
        });
        setLoading(false);
        if (cached.isFresh) {
          return;
        }
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const loadFromApi = async () => {
          const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to load calendar");
          return json as CalendarResponse;
        };

        const json = force
          ? await loadFromApi()
          : await fetchCalendarDeduped(requestKey, loadFromApi);

        setCachedCalendar(requestKey, json);

        if (activeKeyRef.current !== requestKey) return;

        setData(json);
        setSelectedDay((prev) => {
          if (!prev) return null;
          return json.days.find((d) => d.date === prev.date) ?? prev;
        });
      } catch (err) {
        if (!cached && activeKeyRef.current === requestKey) {
          toast.error(err instanceof Error ? err.message : "Failed to load calendar");
        }
      } finally {
        if (!silent && !cached && activeKeyRef.current === requestKey) {
          setLoading(false);
        }
      }
    },
    [mode, year, month]
  );

  useEffect(() => {
    activeKeyRef.current = cacheKey;
    fetchCalendar(false, false);
  }, [cacheKey, fetchCalendar]);

  function handlePrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setWeekIndex(0);
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setWeekIndex(0);
  }

  function handleToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setWeekIndex(0);
  }

  async function handleGenerateMonth() {
    try {
      const res = await fetch("/api/calendar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate schedule");
      toast.success(
        `Schedule synced for ${MONTH_NAMES[month - 1]} ${year} (${json.createdCount} new records)`
      );
      invalidateCalendarCache(cacheKey);
      invalidateDashboardCache();
      fetchCalendar(true, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
  }

  function handleUpdateMeal(
    dateStr: string,
    quantity: number,
    userId?: string,
    scopeOverride?: "SINGLE_DATE" | "FOLLOWING_DATES"
  ) {
    const nextQty = Math.max(0, quantity);
    const key = `${userId ?? "self"}-${dateStr}`;
    const selectedScope = scopeOverride ?? applyScope;

    const prevData = data;
    const prevSelectedDay = selectedDay;

    const currentRecord = selectedDay?.records.find((r) =>
      userId ? r.userId === userId : true
    );
    const guestInfo =
      mode === "ADMIN" && userId
        ? data?.guests?.find((g) => g.id === userId)
        : undefined;
    if (!baselineQtyRef.current.has(key)) {
      baselineQtyRef.current.set(key, currentRecord?.quantity ?? 0);
    }

    const applyOptimistic = (day: CalendarDay): CalendarDay => {
      const isTargetDate = day.date === dateStr;
      const isFollowingTarget =
        selectedScope === "FOLLOWING_DATES" && day.date > dateStr && day.isWorkingDay;

      if (!isTargetDate && !isFollowingTarget) return day;

      const hasExistingMatch = day.records.some((r) => (userId ? r.userId === userId : true));
      let updatedRecords: CalendarGuestRecord[];

      if (hasExistingMatch) {
        updatedRecords = day.records.map((r) => {
          const isMatch = userId ? r.userId === userId : true;
          if (!isMatch) return r;
          if (isFollowingTarget && mode === "GUEST" && day.isLocked) {
            return r;
          }
          return {
            ...r,
            quantity: nextQty,
            totalPoisha: nextQty * r.unitPricePoisha,
            source: isFollowingTarget
              ? "FOLLOWING_RULE"
              : mode === "ADMIN"
              ? "ADMIN_OVERRIDE"
              : "GUEST_OVERRIDE",
            overrideScope: selectedScope,
            isCustomized: true,
          };
        });
      } else if (
        mode === "ADMIN" &&
        userId &&
        guestInfo &&
        (isTargetDate ||
          (isFollowingTarget &&
            nextQty > 0 &&
            Boolean(guestInfo.mealStartDate) &&
            day.date < guestInfo.mealStartDate!))
      ) {
        updatedRecords = [
          ...day.records,
          {
            id: `temp-${userId}-${day.date}`,
            userId,
            guestName: guestInfo.name,
            guestEmail: guestInfo.email,
            guestStatus: guestInfo.status,
            guestMealStartDate: guestInfo.mealStartDate,
            quantity: nextQty,
            unitPricePoisha: day.effectivePricePoisha,
            totalPoisha: nextQty * day.effectivePricePoisha,
            source: isFollowingTarget ? "FOLLOWING_RULE" : "ADMIN_OVERRIDE",
            overrideScope: selectedScope,
            isCustomized: true,
            isFinalized: false,
          },
        ];
      } else {
        updatedRecords = day.records;
      }

      const totalMeals = updatedRecords.reduce((s, r) => s + r.quantity, 0);
      const activeGuestsCount = updatedRecords.filter((r) => r.quantity > 0).length;
      const totalAmountPoisha = updatedRecords.reduce((s, r) => s + r.totalPoisha, 0);

      return {
        ...day,
        records: updatedRecords,
        totalMeals,
        activeGuestsCount,
        totalAmountPoisha,
      };
    };

    setData((curr) =>
      curr ? { ...curr, days: curr.days.map(applyOptimistic) } : curr
    );
    setSelectedDay((curr) => (curr ? applyOptimistic(curr) : curr));

    const nextSeq = (latestSeqRef.current.get(key) ?? 0) + 1;
    latestSeqRef.current.set(key, nextSeq);

    const existingTimer = updateTimersRef.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      const baseQty = baselineQtyRef.current.get(key) ?? currentRecord?.quantity ?? 0;
      try {
        const res = await fetch("/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: dateStr,
            quantity: nextQty,
            scope: selectedScope,
            ...(userId ? { userId } : {}),
            ...(overrideReason.trim() ? { reason: overrideReason.trim() } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update meal");

        if (latestSeqRef.current.get(key) === nextSeq) {
          baselineQtyRef.current.delete(key);
          toast.success("Meal quantity updated", { id: "meal-update" });

          const resolvedGuestName = currentRecord?.guestName ?? guestInfo?.name;
          const resolvedUnitPrice =
            currentRecord?.unitPricePoisha ??
            selectedDay?.effectivePricePoisha ??
            data?.settings.defaultMealPricePoisha ??
            0;
          if (mode === "ADMIN" && userId && resolvedGuestName && baseQty !== nextQty) {
            setLastAdjustment({
              guestId: userId,
              guestName: resolvedGuestName,
              date: dateStr,
              previousQuantity: baseQty,
              newQuantity: nextQty,
              unitPricePoisha: resolvedUnitPrice,
              note: overrideReason.trim() || undefined,
            });
          }
          if (mode === "ADMIN" && json.affectedInvoice) {
            setAffectedInvoice(json.affectedInvoice);
          }

          if (selectedScope === "FOLLOWING_DATES") {
            invalidateCalendarCache();
          } else {
            invalidateCalendarCache(cacheKey);
          }
          invalidateDashboardCache();
          await fetchCalendar(true, true);
        }
      } catch (err) {
        if (latestSeqRef.current.get(key) === nextSeq) {
          baselineQtyRef.current.delete(key);
          invalidateCalendarCache(cacheKey);
          setData(prevData);
          setSelectedDay(prevSelectedDay);
          toast.error(err instanceof Error ? err.message : "Update failed", {
            id: "meal-update",
          });
        }
      }
    }, 220);

    updateTimersRef.current.set(key, timer);
  }

  async function openAdjustmentEmailPreview() {
    if (!lastAdjustment) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/emails/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailType: "MEAL_ADJUSTMENT",
          guestId: lastAdjustment.guestId,
          date: lastAdjustment.date,
          previousQuantity: lastAdjustment.previousQuantity,
          newQuantity: lastAdjustment.newQuantity,
          note: lastAdjustment.note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to preview email");
      setPreviewData(json.preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendAdjustmentEmail() {
    if (!lastAdjustment) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailType: "MEAL_ADJUSTMENT",
          guestId: lastAdjustment.guestId,
          date: lastAdjustment.date,
          previousQuantity: lastAdjustment.previousQuantity,
          newQuantity: lastAdjustment.newQuantity,
          note: lastAdjustment.note,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send adjustment email");
      toast.success("Meal adjustment email sent via Resend");
      setPreviewOpen(false);
      setLastAdjustment(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email send failed");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleRecalculateAffectedInvoice() {
    if (!affectedInvoice) return;
    setUpdatingInvoice(true);
    try {
      const res = await fetch(`/api/invoices/${affectedInvoice.invoiceId}/recalculate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update invoice");
      toast.success(`Invoice ${affectedInvoice.invoiceNumber} recalculated`);
      setAffectedInvoice(null);
      invalidateCalendarCache(cacheKey);
      invalidateDashboardCache();
      await fetchCalendar(true, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setUpdatingInvoice(false);
    }
  }

  async function handleSubmitLateRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDay) return;
    setSubmittingLate(true);
    try {
      const res = await fetch("/api/adjustment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDay.date,
          requestedQuantity: lateQty,
          reason: lateReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit request");
      toast.success("Late adjustment request submitted for admin approval");
      setLateReason("");
      invalidateCalendarCache(cacheKey);
      invalidateDashboardCache();
      await fetchCalendar(true, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmittingLate(false);
    }
  }

  const days = data?.days ?? [];
  const firstDow = days.length > 0 ? getDayOfWeekUtc(days[0].date) : 0;
  const paddedCells: (CalendarDay | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ];
  while (paddedCells.length % 7 !== 0) {
    paddedCells.push(null);
  }

  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < paddedCells.length; i += 7) {
    weeks.push(paddedCells.slice(i, i + 7));
  }

  const visibleCells = view === "month" ? paddedCells : weeks[weekIndex] ?? paddedCells.slice(0, 7);

  function openDayModal(day: CalendarDay) {
    setSelectedDay(day);
    setApplyScope("SINGLE_DATE");
    setOverrideReason("");
    setShowUnscheduledGuests(day.records.length === 0);
    setGuestSearch("");
    setCopiedDaySummary(false);
    setLastAdjustment(null);
    setAffectedInvoice(null);
    const currentQty = day.records[0]?.quantity ?? 0;
    setLateQty(currentQty > 0 ? 0 : 1);
    setLateReason("");
  }

  async function handleCopyDaySummary() {
    if (!selectedDay) return;
    const todayStr = data?.today ?? selectedDay.date;
    const tomorrowStr = addDays(todayStr, 1);
    const activeRecords = selectedDay.records.filter((r) => r.quantity > 0);
    const storedSig =
      typeof window !== "undefined"
        ? window.localStorage.getItem("pcs_meal_summary_signature") || undefined
        : undefined;

    const text = formatMealSummaryText(
      {
        period:
          selectedDay.date === todayStr
            ? "today"
            : selectedDay.date === tomorrowStr
            ? "tomorrow"
            : "custom",
        today: todayStr,
        tomorrow: tomorrowStr,
        startDate: selectedDay.date,
        endDate: selectedDay.date,
        organizationName: data?.settings.organizationName,
        totalMeals: selectedDay.totalMeals,
        totalGuestsWithMeals: activeRecords.length,
        totalAmountPoisha: selectedDay.totalAmountPoisha,
        guests: activeRecords.map((r) => ({
          userId: r.userId,
          name: r.guestName,
          email: r.guestEmail,
          status: r.guestStatus,
          totalMeals: r.quantity,
          totalAmountPoisha: r.totalPoisha,
          daysCount: 1,
        })),
        dailyBreakdown: [],
      },
      storedSig ? { signature: storedSig } : undefined
    );

    try {
      await copyTextToClipboard(text);
      setCopiedDaySummary(true);
      toast.success("Meal summary copied to clipboard");
      setTimeout(() => setCopiedDaySummary(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy summary");
    }
  }

  function renderDayStatusBadge(day: CalendarDay) {
    if (day.holiday && day.holiday.type !== "SPECIAL_WORKING_DAY") {
      return (
        <Badge variant="muted" className="text-[10px] px-1.5 py-0">
          <CalendarOff className="h-3 w-3" /> Closed
        </Badge>
      );
    }
    if (day.holiday?.type === "SPECIAL_WORKING_DAY") {
      return (
        <Badge variant="info" className="text-[10px] px-1.5 py-0">
          <Sparkles className="h-3 w-3" /> Special Day
        </Badge>
      );
    }
    if (!day.isWorkingDay) {
      return (
        <Badge variant="muted" className="text-[10px] px-1.5 py-0">
          Weekend
        </Badge>
      );
    }

    if (mode === "GUEST") {
      const myQty = day.records[0]?.quantity ?? 0;
      if (data?.guestMealStartDate && day.date < data.guestMealStartDate) {
        if (myQty > 0) {
          return (
            <Badge variant="danger" className="text-[10px] px-1.5 py-0">
              <Lock className="h-3 w-3" /> Admin • {myQty}
            </Badge>
          );
        }
        return (
          <Badge variant="muted" className="text-[10px] px-1.5 py-0">
            Not started
          </Badge>
        );
      }
      if (day.myPendingRequest) {
        return (
          <Badge variant="warning" className="text-[10px] px-1.5 py-0">
            <Clock className="h-3 w-3" /> Pending ({day.myPendingRequest.requestedQuantity})
          </Badge>
        );
      }
      if (day.isLocked) {
        return myQty > 0 ? (
          <Badge variant="danger" className="text-[10px] px-1.5 py-0">
            <Lock className="h-3 w-3" /> Locked • {myQty}
          </Badge>
        ) : (
          <Badge variant="muted" className="text-[10px] px-1.5 py-0">
            <Lock className="h-3 w-3" /> Locked • OFF
          </Badge>
        );
      }
      return myQty > 0 ? (
        <Badge variant="success" className="text-[10px] px-1.5 py-0">
          <CheckCircle2 className="h-3 w-3" /> ON ({myQty})
        </Badge>
      ) : (
        <Badge variant="muted" className="text-[10px] px-1.5 py-0">
          <XCircle className="h-3 w-3" /> OFF
        </Badge>
      );
    }

    // ADMIN badge
    if (day.pendingAdjustmentsCount > 0) {
      return (
        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
          <Clock className="h-3 w-3" /> {day.pendingAdjustmentsCount} Req
        </Badge>
      );
    }
    if (day.isLocked) {
      return (
        <Badge variant="danger" className="text-[10px] px-1.5 py-0">
          <Lock className="h-3 w-3" /> Locked
        </Badge>
      );
    }
    return (
      <Badge variant="success" className="text-[10px] px-1.5 py-0">
        <Utensils className="h-3 w-3" /> Open
      </Badge>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-l-lg cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm font-semibold text-slate-900 min-w-[140px] text-center">
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-r-lg cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setView("month")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                  view === "month" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                )}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setView("week")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                  view === "week" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                )}
              >
                Week
              </button>
            </div>

            {view === "week" && weeks.length > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={weekIndex === 0}
                  onClick={() => setWeekIndex((w) => Math.max(0, w - 1))}
                >
                  Prev Wk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={weekIndex >= weeks.length - 1}
                  onClick={() => setWeekIndex((w) => Math.min(weeks.length - 1, w + 1))}
                >
                  Next Wk
                </Button>
              </div>
            )}

            {mode === "ADMIN" && (
              <Button size="sm" variant="outline" onClick={handleGenerateMonth}>
                <RefreshCw className="h-3.5 w-3.5" />
                Generate Schedule
              </Button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Meal ON / Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Meal OFF / Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending Adjustment
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Locked (Past 11:50 PM)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Special Working Day
          </span>
        </div>
      </Card>

      {/* Desktop / Tablet Calendar Grid */}
      <Card className="overflow-hidden hidden md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="py-2.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 border-r last:border-r-0 border-slate-200"
            >
              {wd}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading calendar...</div>
        ) : (
          <div className="grid grid-cols-7">
            {visibleCells.map((day, idx) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[118px] bg-slate-50/50 border-b border-r border-slate-100"
                  />
                );
              }

              const dayNum = Number(day.date.slice(8));
              const myQty = day.records[0]?.quantity ?? 0;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => openDayModal(day)}
                  className={cn(
                    "min-h-[118px] p-2.5 text-left border-b border-r border-slate-200 flex flex-col justify-between transition-colors hover:bg-blue-50/40 cursor-pointer",
                    !day.isWorkingDay && "bg-slate-50/80",
                    day.holiday?.type === "SPECIAL_WORKING_DAY" && "bg-blue-50/30",
                    day.isToday && "ring-2 ring-inset ring-blue-500 bg-blue-50/20"
                  )}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        day.isToday
                          ? "bg-blue-600 text-white"
                          : "text-slate-700"
                      )}
                    >
                      {dayNum}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-medium px-1.5 py-0.5 rounded",
                        day.hasCustomPrice
                          ? "bg-violet-50 text-violet-700 border border-violet-200"
                          : "text-slate-500"
                      )}
                    >
                      {formatBDT(day.effectivePricePoisha)}
                    </span>
                  </div>

                  <div className="my-1.5 space-y-1">
                    {day.holiday && (
                      <p className="text-[11px] font-medium text-slate-600 truncate">
                        {day.holiday.name}
                      </p>
                    )}
                    {(day.isWorkingDay ||
                      (mode === "ADMIN" && day.totalMeals > 0) ||
                      (mode === "GUEST" && myQty > 0)) && (
                      <>
                        {mode === "GUEST" &&
                        data?.guestMealStartDate &&
                        day.date < data.guestMealStartDate ? (
                          myQty > 0 ? (
                            <>
                              <p className="text-xs font-semibold text-slate-800">
                                {myQty} meal{myQty === 1 ? "" : "s"}
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Admin record
                              </p>
                            </>
                          ) : (
                            <p className="text-[11px] text-slate-400">Before start date</p>
                          )
                        ) : (
                          <p className="text-xs font-semibold text-slate-800">
                            {mode === "ADMIN"
                              ? `${day.totalMeals} meal${day.totalMeals === 1 ? "" : "s"} (${day.activeGuestsCount} guests)`
                              : `${myQty} meal${myQty === 1 ? "" : "s"}`}
                          </p>
                        )}
                        {mode === "GUEST" &&
                          day.records[0]?.overrideScope === "SINGLE_DATE" && (
                            <p className="text-[10px] text-blue-600 font-medium">
                              Modified for this day
                            </p>
                          )}
                        {mode === "GUEST" &&
                          day.records[0]?.source === "FOLLOWING_RULE" && (
                            <p className="text-[10px] text-violet-600 font-medium">
                              Following rule
                            </p>
                          )}
                      </>
                    )}
                    {mode === "ADMIN" &&
                      (day.isWorkingDay || day.totalMeals > 0) &&
                      day.totalAmountPoisha > 0 && (
                        <p className="text-[11px] text-slate-500">
                          {formatBDT(day.totalAmountPoisha)}
                        </p>
                      )}
                  </div>

                  <div>{renderDayStatusBadge(day)}</div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Mobile Agenda List */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          <Card className="p-6 text-center text-sm text-slate-500">Loading calendar...</Card>
        ) : (
          days.map((day) => {
            const dow = WEEKDAYS[getDayOfWeekUtc(day.date)];
            const myQty = day.records[0]?.quantity ?? 0;
            const isBeforeGuestStart =
              mode === "GUEST" &&
              Boolean(data?.guestMealStartDate) &&
              day.date < data!.guestMealStartDate!;
            return (
              <Card
                key={day.date}
                onClick={() => openDayModal(day)}
                className={cn(
                  "p-3.5 flex items-center justify-between gap-3 cursor-pointer active:bg-slate-50",
                  day.isToday && "border-blue-500 ring-1 ring-blue-500"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {day.date} ({dow})
                    </span>
                    {day.isToday && <Badge variant="info">Today</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>Price: {formatBDT(day.effectivePricePoisha)}</span>
                    {mode === "ADMIN" && (day.isWorkingDay || day.totalMeals > 0) && (
                      <span>• {day.totalMeals} meals</span>
                    )}
                    {mode === "GUEST" &&
                      (isBeforeGuestStart ? (
                        myQty > 0 ? (
                          <span>• {myQty} meal(s)</span>
                        ) : day.isWorkingDay ? (
                          <span>• Before start date</span>
                        ) : null
                      ) : day.isWorkingDay || myQty > 0 ? (
                        <span>• {myQty} meal(s)</span>
                      ) : null)}
                  </div>
                  {day.holiday && (
                    <p className="mt-0.5 text-xs text-slate-600">{day.holiday.name}</p>
                  )}
                </div>
                <div>{renderDayStatusBadge(day)}</div>
              </Card>
            );
          })
        )}
      </div>

      {/* Date Detail Dialog */}
      <Dialog
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Meal Schedule • ${selectedDay.date}` : ""}
        description={
          selectedDay
            ? `${WEEKDAYS[getDayOfWeekUtc(selectedDay.date)]} • Price: ${formatBDT(
                selectedDay.effectivePricePoisha
              )} ${selectedDay.hasCustomPrice ? "(Custom Date Price)" : "(Default Price)"}`
            : ""
        }
        maxWidthClass="max-w-2xl"
      >
        {selectedDay && (
          <div className="space-y-4">
            {selectedDay.holiday && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <p className="font-semibold">{selectedDay.holiday.name}</p>
                {selectedDay.holiday.note && <p className="mt-0.5">{selectedDay.holiday.note}</p>}
              </div>
            )}

            {mode === "ADMIN" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">Daily Total</p>
                    <p className="text-base font-bold text-slate-900">
                      {selectedDay.totalMeals} meals • {formatBDT(selectedDay.totalAmountPoisha)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCopyDaySummary}
                    >
                      {copiedDaySummary ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy Summary
                        </>
                      )}
                    </Button>
                    {selectedDay.isLocked && (
                      <Badge variant="danger">
                        <Lock className="h-3 w-3" /> Past Deadline (Admin Override Enabled)
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="override-reason">Optional Reason for Admin Change</Label>
                    <Input
                      id="override-reason"
                      className="mt-1"
                      placeholder="e.g. Guest called in late, special event"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Apply Change To</Label>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="admin-scope"
                          checked={applyScope === "SINGLE_DATE"}
                          onChange={() => setApplyScope("SINGLE_DATE")}
                        />
                        This meal only
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="admin-scope"
                          checked={applyScope === "FOLLOWING_DATES"}
                          onChange={() => setApplyScope("FOLLOWING_DATES")}
                        />
                        This &amp; following meals
                      </label>
                    </div>
                  </div>
                </div>

                {lastAdjustment && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-emerald-900">
                          Meal updated for {lastAdjustment.guestName}
                        </p>
                        <p className="text-emerald-800 mt-0.5">
                          Previous: {lastAdjustment.previousQuantity} meal(s) (
                          {formatBDT(
                            lastAdjustment.previousQuantity * lastAdjustment.unitPricePoisha
                          )}
                          ) → Updated: {lastAdjustment.newQuantity} meal(s) (
                          {formatBDT(lastAdjustment.newQuantity * lastAdjustment.unitPricePoisha)})
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={openAdjustmentEmailPreview}>
                          <Mail className="h-3.5 w-3.5" /> Send Meal Adjustment Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLastAdjustment(null)}
                        >
                          Skip Email
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {affectedInvoice && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-amber-900">
                          This meal adjustment affects existing invoice{" "}
                          {affectedInvoice.invoiceNumber}
                        </p>
                        <p className="text-amber-800 mt-0.5">
                          Current Invoice: {formatBDT(affectedInvoice.currentTotalPoisha)} → After
                          Adjustment: {formatBDT(affectedInvoice.projectedTotalPoisha)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={updatingInvoice}
                          onClick={handleRecalculateAffectedInvoice}
                        >
                          {updatingInvoice ? "Updating..." : "Update Invoice"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAffectedInvoice(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const recordByUserId = new Map(selectedDay.records.map((r) => [r.userId, r]));
                  const allGuests = data?.guests ?? [];
                  const missingGuests = allGuests.filter((g) => !recordByUserId.has(g.id));

                  type DisplayRow = CalendarGuestRecord & { hasRecord: boolean };

                  const combinedRows: DisplayRow[] = [
                    ...selectedDay.records.map((r) => ({ ...r, hasRecord: true })),
                    ...(showUnscheduledGuests
                      ? missingGuests.map((g) => ({
                          id: `virtual-${g.id}`,
                          userId: g.id,
                          guestName: g.name,
                          guestEmail: g.email,
                          guestStatus: g.status,
                          guestMealStartDate: g.mealStartDate,
                          quantity: 0,
                          unitPricePoisha: selectedDay.effectivePricePoisha,
                          totalPoisha: 0,
                          source: undefined,
                          overrideScope: null,
                          isCustomized: false,
                          isFinalized: false,
                          hasRecord: false,
                        }))
                      : []),
                  ].sort((a, b) => a.guestName.localeCompare(b.guestName));

                  const searchLower = guestSearch.trim().toLowerCase();
                  const filteredRows = searchLower
                    ? combinedRows.filter(
                        (r) =>
                          r.guestName.toLowerCase().includes(searchLower) ||
                          r.guestEmail.toLowerCase().includes(searchLower)
                      )
                    : combinedRows;

                  const hasBeforeStartRows = combinedRows.some(
                    (r) => r.guestMealStartDate && selectedDay.date < r.guestMealStartDate
                  );

                  if (allGuests.length === 0 && selectedDay.records.length === 0) {
                    return (
                      <p className="text-sm text-slate-500 py-4 text-center">
                        No guests found in the system yet. Invite guests from the Guests page first.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {showUnscheduledGuests &&
                        (missingGuests.length > 0 || hasBeforeStartRows) && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                            Admins can add or adjust historical/unscheduled meal records here
                            (including dates before a guest&rsquo;s Meal Start Date). Guests cannot
                            modify dates prior to their start date.
                          </div>
                        )}

                      {(allGuests.length > 5 || combinedRows.length > 5) && (
                        <Input
                          value={guestSearch}
                          onChange={(e) => setGuestSearch(e.target.value)}
                          placeholder="Filter guests by name or email..."
                          className="h-8 text-xs"
                        />
                      )}

                      {filteredRows.length === 0 ? (
                        <p className="text-sm text-slate-500 py-4 text-center">
                          No matching guests.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Guest</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRows.map((rec) => {
                              const isBeforeStart =
                                Boolean(rec.guestMealStartDate) &&
                                selectedDay.date < rec.guestMealStartDate!;
                              return (
                                <TableRow key={rec.userId}>
                                  <TableCell>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="font-medium text-slate-900">{rec.guestName}</p>
                                      {isBeforeStart && (
                                        <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                          Before start ({rec.guestMealStartDate})
                                        </Badge>
                                      )}
                                      {rec.guestStatus !== "ACTIVE" && (
                                        <Badge variant="muted" className="text-[10px] px-1.5 py-0">
                                          {rec.guestStatus === "INVITED" ? "Invited" : "Inactive"}
                                        </Badge>
                                      )}
                                      {!rec.hasRecord && !isBeforeStart && (
                                        <Badge variant="muted" className="text-[10px] px-1.5 py-0">
                                          No record yet
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500">{rec.guestEmail}</p>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7"
                                        disabled={rec.quantity <= 0}
                                        onClick={() =>
                                          handleUpdateMeal(
                                            selectedDay.date,
                                            rec.quantity - 1,
                                            rec.userId
                                          )
                                        }
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="w-7 text-center font-semibold text-slate-900">
                                        {rec.quantity}
                                      </span>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7"
                                        onClick={() =>
                                          handleUpdateMeal(
                                            selectedDay.date,
                                            rec.quantity + 1,
                                            rec.userId
                                          )
                                        }
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatBDT(rec.unitPricePoisha)}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatBDT(rec.totalPoisha)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}

                      {missingGuests.length > 0 && !showUnscheduledGuests && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <span>
                            {missingGuests.length} other guest(s) have no record on this date
                            (e.g. before Meal Start Date).
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowUnscheduledGuests(true)}
                          >
                            Show All Guests (+{missingGuests.length})
                          </Button>
                        </div>
                      )}

                      {showUnscheduledGuests && selectedDay.records.length > 0 && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowUnscheduledGuests(false)}
                          >
                            Show Recorded Only
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // GUEST DETAIL VIEW
              <div className="space-y-4">
                {(() => {
                  const rec = selectedDay.records[0];
                  const qty = rec?.quantity ?? 0;

                  if (data?.guestMealStartDate && selectedDay.date < data.guestMealStartDate) {
                    if (qty > 0) {
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div>
                              <p className="text-xs font-medium text-slate-500">
                                Historical Meal (Admin Recorded)
                              </p>
                              <p className="text-xl font-bold text-slate-900 mt-0.5">
                                {qty} meal{qty > 1 ? "s" : ""}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Cost:{" "}
                                {formatBDT(
                                  qty * (rec?.unitPricePoisha ?? selectedDay.effectivePricePoisha)
                                )}
                              </p>
                            </div>
                            <Badge variant="danger">
                              <Lock className="h-3.5 w-3.5" /> Locked
                            </Badge>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                            This date is before your Meal Start Date (
                            <span className="font-semibold">{data.guestMealStartDate}</span>). This
                            historical meal record was added by an admin and can only be adjusted by
                            an admin.
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        This date is before your Meal Start Date (
                        <span className="font-semibold">{data.guestMealStartDate}</span>). Meals
                        are not auto-scheduled prior to your start date, and only an admin can add
                        or adjust historical records.
                      </div>
                    );
                  }

                  if (!selectedDay.isWorkingDay) {
                    return (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Lunch service is closed on this date (Weekend or Holiday).
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Your Scheduled Meal</p>
                          <p className="text-xl font-bold text-slate-900 mt-0.5">
                            {qty === 0 ? "OFF (0 meals)" : `${qty} meal${qty > 1 ? "s" : ""}`}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Expected Cost: {formatBDT(qty * selectedDay.effectivePricePoisha)}
                          </p>
                        </div>
                        {!selectedDay.isLocked ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <Button
                                variant={qty === 0 ? "secondary" : "outline"}
                                size="sm"
                                disabled={qty === 0}
                                onClick={() => handleUpdateMeal(selectedDay.date, 0)}
                              >
                                Turn OFF
                              </Button>
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  disabled={qty <= 0}
                                  onClick={() => handleUpdateMeal(selectedDay.date, qty - 1)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-bold">{qty}</span>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => handleUpdateMeal(selectedDay.date, qty + 1)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <Badge variant="danger">
                            <Lock className="h-3.5 w-3.5" /> Locked
                          </Badge>
                        )}
                      </div>

                      {!selectedDay.isLocked && (
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-700">Apply change to:</span>
                          <div className="flex flex-wrap items-center gap-4 text-slate-700">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="guest-scope"
                                checked={applyScope === "SINGLE_DATE"}
                                onChange={() => setApplyScope("SINGLE_DATE")}
                              />
                              This meal only
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="guest-scope"
                                checked={applyScope === "FOLLOWING_DATES"}
                                onChange={() => setApplyScope("FOLLOWING_DATES")}
                              />
                              This and following meals
                            </label>
                            {applyScope === "FOLLOWING_DATES" && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                  handleUpdateMeal(
                                    selectedDay.date,
                                    qty,
                                    undefined,
                                    "FOLLOWING_DATES"
                                  )
                                }
                              >
                                Apply ({qty} meal{qty === 1 ? "" : "s"}) to following
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedDay.isLocked && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <Lock className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                            <div className="text-xs text-amber-900">
                              <p className="font-semibold">Confirmation Deadline Passed</p>
                              <p className="mt-0.5">
                                Meal selections lock at 11:50 PM on the previous day. You can
                                submit a late adjustment request for admin approval.
                              </p>
                            </div>
                          </div>

                          {selectedDay.myPendingRequest ? (
                            <div className="rounded-lg bg-white border border-amber-200 p-3 text-xs">
                              <p className="font-semibold text-amber-800">
                                Pending Request: Change to {selectedDay.myPendingRequest.requestedQuantity}{" "}
                                meal(s)
                              </p>
                              {selectedDay.myPendingRequest.reason && (
                                <p className="text-slate-600 mt-1">
                                  Reason: {selectedDay.myPendingRequest.reason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <form onSubmit={handleSubmitLateRequest} className="space-y-3 pt-1">
                              <div>
                                <Label htmlFor="late-qty">Requested Meal Quantity</Label>
                                <Input
                                  id="late-qty"
                                  type="number"
                                  min={0}
                                  value={lateQty}
                                  onChange={(e) => setLateQty(Number(e.target.value))}
                                  className="mt-1 bg-white"
                                  required
                                />
                              </div>
                              <div>
                                <Label htmlFor="late-reason">Reason (optional)</Label>
                                <Textarea
                                  id="late-reason"
                                  placeholder="Why do you need a late change?"
                                  value={lateReason}
                                  onChange={(e) => setLateReason(e.target.value)}
                                  className="mt-1 bg-white"
                                />
                              </div>
                              <Button type="submit" size="sm" disabled={submittingLate}>
                                {submittingLate ? "Submitting..." : "Submit Late Request"}
                              </Button>
                            </form>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </Dialog>

      <EmailPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={previewData}
        loading={previewLoading}
        sending={sendingEmail}
        onConfirmSend={handleSendAdjustmentEmail}
      />
    </div>
  );
}
