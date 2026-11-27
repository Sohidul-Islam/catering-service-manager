"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Lock,
  Mail,
  Phone,
  Utensils,
} from "lucide-react";
import { MealCalendar } from "@/components/calendar/MealCalendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading-state";
import { formatBDT } from "@/lib/money";
import { toast } from "sonner";

function formatActivityValue(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const hiddenKeys = new Set(["messageId", "invoiceId"]);
      const entries = Object.entries(parsed).filter(
        ([k, v]) => !hiddenKeys.has(k) && v !== undefined && v !== null && v !== ""
      );
      if (entries.length > 0) {
        return entries
          .map(([k, v]) => {
            const label = k
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (c) => c.toUpperCase());
            return `${label}: ${String(v)}`;
          })
          .join(" • ");
      }
    } catch {
      // Fallback to raw string if not valid JSON
    }
  }
  return raw;
}

function formatActivityDetails(
  previousValue: string | null,
  newValue: string | null,
  reason: string | null
): string {
  const prevFormatted = formatActivityValue(previousValue);
  const nextFormatted = formatActivityValue(newValue);
  const transition =
    prevFormatted && nextFormatted
      ? `${prevFormatted} → ${nextFormatted}`
      : nextFormatted || prevFormatted;
  if (transition && reason) return `${transition} (${reason})`;
  return transition || reason || "—";
}

interface GuestProfileResponse {
  guest: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: "INVITED" | "ACTIVE" | "INACTIVE";
    mealPreference: "REGULAR" | "OCCASIONAL";
    defaultMealQty: number;
    mealStartDate: string | null;
    joinedAt: string;
    mealRuleHistories: {
      id: string;
      effectiveFrom: string;
      quantity: number;
      scope: string;
      source: string;
      reason: string | null;
      createdAt: string;
      changedBy: { name: string; role: string } | null;
    }[];
    invoices: {
      id: string;
      invoiceNumber: string;
      year: number;
      month: number;
      totalMeals: number;
      totalAmountPoisha: number;
      paidAmountPoisha: number;
      status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    }[];
    payments: {
      id: string;
      amountPoisha: number;
      method: string;
      paymentType: string;
      paidAt: string;
      invoice: { invoiceNumber: string };
    }[];
  };
  dashboard: {
    year: number;
    month: number;
    today: string;
    tomorrow: string;
    settings: {
      timezone: string;
      deadlineHour: number;
      deadlineMinute: number;
      maxMealQty: number | null;
    };
    todayMeal: { date: string; quantity: number; unitPricePoisha: number } | null;
    tomorrowMeal: { date: string; quantity: number; unitPricePoisha: number } | null;
    tomorrowLocked: boolean;
    tomorrowWorking: boolean;
    tomorrowPendingRequest: { requestedQuantity: number; status: string } | null;
    monthlyMeals: number;
    monthlyBillPoisha: number;
    totalBilledAllPoisha: number;
    totalPaidAllPoisha: number;
    remainingDuesPoisha: number;
    upcomingMeals: { id: string; date: string; quantity: number; unitPricePoisha: number }[];
  };
  activityLogs: {
    id: string;
    action: string;
    date: string | null;
    previousValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: string;
    actor: { name: string; role: string } | null;
  }[];
}

export default function AdminGuestProfilePage() {
  const params = useParams<{ id: string }>();
  const guestId = params?.id ?? "";

  const [profile, setProfile] = useState<GuestProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(
    async (silent = false) => {
      if (!guestId) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/guests/${encodeURIComponent(guestId)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to load guest profile");
        }
        setProfile(json as GuestProfileResponse);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load guest profile";
        if (!silent) setError(msg);
        toast.error(msg);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [guestId]
  );

  useEffect(() => {
    if (!guestId) return;
    let active = true;
    fetch(`/api/guests/${encodeURIComponent(guestId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to load guest profile");
        }
        if (active) {
          setProfile(json as GuestProfileResponse);
          setError(null);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load guest profile";
        if (active) {
          setError(msg);
          toast.error(msg);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guestId]);

  if (loading) {
    return (
      <PageLoader
        label="Loading guest profile..."
        description="Fetching meal summary, calendar, and activity history"
      />
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <Link href="/admin/guests">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to Guests
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Guest Profile Unavailable</CardTitle>
            <CardDescription>{error || "Guest could not be found."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { guest, dashboard, activityLogs } = profile;
  const todayQty = dashboard.todayMeal?.quantity ?? 0;
  const todayCostPoisha = todayQty * (dashboard.todayMeal?.unitPricePoisha ?? 0);
  const tomorrowQty = dashboard.tomorrowMeal?.quantity ?? 0;
  const monthLabel = new Date(dashboard.year, dashboard.month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Top Navigation & Profile Identity */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/admin/guests"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Guests
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-bold text-slate-900">{guest.name}</h2>
            <Badge
              variant={
                guest.status === "ACTIVE"
                  ? "success"
                  : guest.status === "INVITED"
                  ? "warning"
                  : "muted"
              }
            >
              {guest.status}
            </Badge>
            <Badge variant={guest.mealPreference === "REGULAR" ? "info" : "default"}>
              {guest.mealPreference}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> {guest.email}
            </span>
            {guest.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {guest.phone}
              </span>
            )}
            <span>Default Qty: {guest.defaultMealQty}</span>
            <span>Meal Start: {guest.mealStartDate || "Not set (Calendar)"}</span>
            <span>Joined: {new Date(guest.joinedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Dashboard-Consistent KPI Cards (mirrors Guest Dashboard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-medium text-slate-500">
              Today&apos;s Lunch ({dashboard.today})
            </span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {todayQty > 0 ? `${todayQty} Meal${todayQty > 1 ? "s" : ""}` : "OFF"}
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <Badge variant={todayQty > 0 ? "success" : "muted"}>
                {todayQty > 0 ? "Meal ON" : "Meal OFF"}
              </Badge>
              {dashboard.todayMeal && (
                <span className="text-xs text-slate-500">
                  {todayQty > 0
                    ? formatBDT(todayCostPoisha)
                    : `${formatBDT(dashboard.todayMeal.unitPricePoisha)}/meal`}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5">
            <span className="text-xs font-medium text-slate-500">
              Tomorrow&apos;s Lunch ({dashboard.tomorrow})
            </span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {!dashboard.tomorrowWorking
                ? "Closed"
                : tomorrowQty > 0
                ? `${tomorrowQty} Meal${tomorrowQty > 1 ? "s" : ""}`
                : "OFF"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {dashboard.tomorrowPendingRequest ? (
                <Badge variant="warning">
                  <Clock className="h-3 w-3" /> Pending ({dashboard.tomorrowPendingRequest.requestedQuantity})
                </Badge>
              ) : dashboard.tomorrowLocked ? (
                <Badge variant="danger">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              ) : !dashboard.tomorrowWorking ? (
                <Badge variant="muted">Weekend / Holiday</Badge>
              ) : (
                <Badge variant={tomorrowQty > 0 ? "success" : "muted"}>
                  {tomorrowQty > 0 ? "Confirmed" : "OFF"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                {monthLabel} Meals
              </span>
              <Utensils className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{dashboard.monthlyMeals}</p>
            <p className="mt-1 text-xs text-slate-500">
              Estimated Bill: {formatBDT(dashboard.monthlyBillPoisha)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Remaining Dues</span>
              <CreditCard className="h-4 w-4 text-red-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {formatBDT(dashboard.remainingDuesPoisha)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Total Paid: {formatBDT(dashboard.totalPaidAllPoisha)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Individual Guest Meal Calendar Management */}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Meal Management Calendar
          </h3>
          <p className="text-xs text-slate-500">
            Click any date to adjust {guest.name}&apos;s meals, apply changes to following dates,
            override locked dates, or recalculate affected monthly invoices.
          </p>
        </div>
        <MealCalendar
          mode="ADMIN"
          guestId={guest.id}
          onMealUpdated={() => void loadProfile(true)}
        />
      </div>

      {/* Upcoming Meals & Invoices / Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meals</CardTitle>
            <CardDescription>Next 7 scheduled days (matches Guest Dashboard)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dashboard.upcomingMeals.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No upcoming records generated.</p>
            ) : (
              dashboard.upcomingMeals.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-900">{m.date}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {formatBDT(m.unitPricePoisha)}/meal
                    </span>
                    <Badge variant={m.quantity > 0 ? "success" : "muted"}>
                      {m.quantity > 0 ? `${m.quantity} Meal` : "OFF"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Invoices &amp; Recent Payments</CardTitle>
              <CardDescription>
                Total Billed: {formatBDT(dashboard.totalBilledAllPoisha)} • Paid:{" "}
                {formatBDT(dashboard.totalPaidAllPoisha)}
              </CardDescription>
            </div>
            <Link href="/admin/invoices">
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4" /> Invoices
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Invoices ({guest.invoices.length})
              </p>
              {guest.invoices.length === 0 ? (
                <p className="text-xs text-slate-500">No invoices generated yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {guest.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-mono font-semibold text-slate-900">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-slate-500">
                          {inv.year}-{String(inv.month).padStart(2, "0")} • {inv.totalMeals} meals •{" "}
                          {formatBDT(inv.paidAmountPoisha)} / {formatBDT(inv.totalAmountPoisha)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "PARTIALLY_PAID"
                            ? "warning"
                            : "danger"
                        }
                      >
                        {inv.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Recent Payments ({guest.payments.length})
              </p>
              {guest.payments.length === 0 ? (
                <p className="text-xs text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {guest.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-900">
                          {p.invoice.invoiceNumber}
                        </span>{" "}
                        <span className="text-slate-500">
                          • {new Date(p.paidAt).toLocaleDateString()} ({p.method.replace("_", " ")})
                        </span>
                      </div>
                      <span className="font-semibold text-emerald-700">
                        {formatBDT(p.amountPoisha)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meal Rule Changes & Activity History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Meal Rule History ({guest.mealRuleHistories.length})</CardTitle>
            <CardDescription>Schedule overrides and recurring meal rule updates</CardDescription>
          </CardHeader>
          <CardContent>
            {guest.mealRuleHistories.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No rule changes recorded.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {guest.mealRuleHistories.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {rule.effectiveFrom} • {rule.quantity} meal(s)
                      </p>
                      <p className="text-slate-500">
                        {rule.scope === "FOLLOWING_DATES"
                          ? "This and following meals"
                          : "This meal only"}{" "}
                        • {rule.source.replaceAll("_", " ")}
                        {rule.reason ? ` (${rule.reason})` : ""}
                      </p>
                    </div>
                    <span className="text-slate-500">
                      {rule.changedBy?.name || "System"} •{" "}
                      {new Date(rule.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity &amp; Audit History ({activityLogs.length})</CardTitle>
            <CardDescription>Recent meal, account, and billing events for this guest</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLogs.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No activity recorded yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {activityLogs.map((l) => (
                  <div key={l.id} className="px-3 py-2.5 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default" className="text-[10px] whitespace-nowrap">
                          {l.action.replaceAll("_", " ")}
                        </Badge>
                        {l.date && (
                          <Badge variant="muted" className="text-[10px] whitespace-nowrap">
                            Meal: {l.date}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-slate-700 break-words">
                        {formatActivityDetails(l.previousValue, l.newValue, l.reason)}
                      </p>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        By {l.actor?.name || "System"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
