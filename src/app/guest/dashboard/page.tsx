"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, CreditCard, FileText, Lock, Minus, Plus, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBDT } from "@/lib/money";
import { invalidateCalendarCache } from "@/lib/calendar-cache";
import {
  fetchDashboardDeduped,
  getCachedDashboard,
  invalidateDashboardCache,
  setCachedDashboard,
} from "@/lib/dashboard-cache";
import { toast } from "sonner";

interface GuestDashboardData {
  year: number;
  month: number;
  today: string;
  tomorrow: string;
  todayMeal: { date: string; quantity: number; unitPricePoisha: number } | null;
  tomorrowMeal: { date: string; quantity: number; unitPricePoisha: number } | null;
  tomorrowLocked: boolean;
  tomorrowWorking: boolean;
  tomorrowPendingRequest: { requestedQuantity: number; status: string } | null;
  monthlyMeals: number;
  monthlyBillPoisha: number;
  totalPaidAllPoisha: number;
  remainingDuesPoisha: number;
  upcomingMeals: { id: string; date: string; quantity: number; unitPricePoisha: number }[];
  latestInvoices: {
    id: string;
    invoiceNumber: string;
    year: number;
    month: number;
    totalAmountPoisha: number;
    paidAmountPoisha: number;
    status: string;
  }[];
  recentPayments: {
    id: string;
    amountPoisha: number;
    method: string;
    paymentType: string;
    paidAt: string;
    invoice: { invoiceNumber: string };
  }[];
}

export default function GuestDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<GuestDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  async function loadDashboard(silent = false, force = false) {
    const cacheKey = "GUEST";
    const cached = !force ? getCachedDashboard<GuestDashboardData>(cacheKey) : null;

    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (cached.isFresh) return;
    } else if (!silent) {
      setLoading(true);
    }

    try {
      const fetchFn = async () => {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (res.status === 401) {
          return { redirect: "/login" as const };
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load dashboard");
        if (json.role !== "GUEST") {
          return { redirect: "/admin/dashboard" as const };
        }
        return { data: json as GuestDashboardData };
      };

      const result = force ? await fetchFn() : await fetchDashboardDeduped(cacheKey, fetchFn);
      if ("redirect" in result && result.redirect) {
        router.replace(result.redirect);
        return;
      }

      if ("data" in result && result.data) {
        setCachedDashboard(cacheKey, result.data);
        setData(result.data);
      }
    } catch (err) {
      if (!cached) {
        toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    } finally {
      if (!silent && !cached) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadDashboard(false);
  }, []);

  function updateTomorrow(qty: number) {
    if (!data) return;
    const nextQty = Math.max(0, qty);
    const prevData = data;
    const prevQty = data.tomorrowMeal?.quantity ?? 0;
    const unitPrice = data.tomorrowMeal?.unitPricePoisha ?? 0;
    const diff = nextQty - prevQty;

    setData({
      ...data,
      tomorrowMeal: data.tomorrowMeal
        ? { ...data.tomorrowMeal, quantity: nextQty }
        : { date: data.tomorrow, quantity: nextQty, unitPricePoisha: unitPrice },
      monthlyMeals: data.monthlyMeals + diff,
      monthlyBillPoisha: data.monthlyBillPoisha + diff * unitPrice,
      upcomingMeals: data.upcomingMeals.map((m) =>
        m.date === data.tomorrow ? { ...m, quantity: nextQty } : m
      ),
    });

    const seq = ++seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: data.tomorrow, quantity: nextQty }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Update failed");
        if (seqRef.current === seq) {
          toast.success("Tomorrow's meal updated", { id: "tomorrow-meal-update" });
          invalidateDashboardCache("GUEST");
          invalidateCalendarCache();
          await loadDashboard(true, true);
        }
      } catch (err) {
        if (seqRef.current === seq) {
          invalidateDashboardCache("GUEST");
          setData(prevData);
          toast.error(err instanceof Error ? err.message : "Failed to update", {
            id: "tomorrow-meal-update",
          });
        }
      }
    }, 220);
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  const todayQty = data.todayMeal?.quantity ?? 0;
  const tomorrowQty = data.tomorrowMeal?.quantity ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Lunch Dashboard</h2>
          <p className="text-sm text-slate-500">
            Today is {data.today} • Confirm tomorrow&apos;s meal before 11:50 PM
          </p>
        </div>
        <Link href="/guest/calendar">
          <Button>
            <Calendar className="h-4 w-4" /> Open My Calendar
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Lunch ({data.today})</span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {todayQty > 0 ? `${todayQty} Meal${todayQty > 1 ? "s" : ""}` : "OFF"}
            </p>
            <Badge className="mt-1" variant={todayQty > 0 ? "success" : "muted"}>
              {todayQty > 0 ? "Meal ON" : "Meal OFF"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5">
            <span className="text-xs font-medium text-slate-500">
              Tomorrow&apos;s Lunch ({data.tomorrow})
            </span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {!data.tomorrowWorking
                ? "Closed"
                : tomorrowQty > 0
                  ? `${tomorrowQty} Meal${tomorrowQty > 1 ? "s" : ""}`
                  : "OFF"}
            </p>
            {data.tomorrowWorking && !data.tomorrowLocked ? (
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={tomorrowQty === 0 ? "secondary" : "outline"}
                  disabled={tomorrowQty === 0}
                  onClick={() => updateTomorrow(0)}
                >
                  OFF
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={tomorrowQty <= 0}
                  onClick={() => updateTomorrow(tomorrowQty - 1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => updateTomorrow(tomorrowQty + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : data.tomorrowLocked ? (
              <Badge className="mt-2" variant="danger">
                <Lock className="h-3 w-3" /> Locked
              </Badge>
            ) : (
              <Badge className="mt-2" variant="muted">
                Weekend / Holiday
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">This Month Meals</span>
              <Utensils className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{data.monthlyMeals}</p>
            <p className="mt-1 text-xs text-slate-500">
              Estimated Bill: {formatBDT(data.monthlyBillPoisha)}
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
              {formatBDT(data.remainingDuesPoisha)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Total Paid: {formatBDT(data.totalPaidAllPoisha)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Schedule + Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meals</CardTitle>
            <CardDescription>Next 7 scheduled days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingMeals.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No upcoming records generated.</p>
            ) : (
              data.upcomingMeals.map((m) => (
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
              <CardTitle>Latest Invoices</CardTitle>
              <CardDescription>Your monthly billing statements</CardDescription>
            </div>
            <Link href="/guest/invoices">
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4" /> View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.latestInvoices.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No invoices generated yet.</p>
            ) : (
              data.latestInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">
                      {inv.year}-{String(inv.month).padStart(2, "0")} • Total:{" "}
                      {formatBDT(inv.totalAmountPoisha)}
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
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Payment History</CardTitle>
            <CardDescription>Your latest recorded lunch payments</CardDescription>
          </div>
          <Link href="/guest/payments">
            <Button size="sm" variant="outline">
              <CreditCard className="h-4 w-4" /> View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {data.recentPayments.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {p.invoice.invoiceNumber} • {p.paymentType.replace("_", " ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(p.paidAt).toLocaleDateString()} • {p.method.replace("_", " ")}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">
                    {formatBDT(p.amountPoisha)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
