"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  UserPlus,
  Users,
  Utensils,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import {
  fetchDashboardDeduped,
  getCachedDashboard,
  setCachedDashboard,
} from "@/lib/dashboard-cache";
import { toast } from "sonner";

interface AdminDashboardData {
  year: number;
  month: number;
  today: string;
  tomorrow: string;
  stats: {
    activeGuestsCount: number;
    todayMeals: number;
    tomorrowMeals: number;
    monthlyMeals: number;
    monthlyAmountPoisha: number;
    invoicedTotalPoisha: number;
    collectedPaymentsPoisha: number;
    outstandingDuesPoisha: number;
    pendingRequestsCount: number;
  };
  dailyChart: { date: string; meals: number; amountBdt: number }[];
  upcomingHolidays: { id: string; date: string; name: string; type: string }[];
  guestBalances: {
    id: string;
    name: string;
    email: string;
    billedPoisha: number;
    paidPoisha: number;
    outstandingPoisha: number;
  }[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard(force = false) {
    const cacheKey = "ADMIN";
    const cached = !force ? getCachedDashboard<AdminDashboardData>(cacheKey) : null;

    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (cached.isFresh) return;
    } else {
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
        if (json.role !== "ADMIN" || !json.stats) {
          return { redirect: "/guest/dashboard" as const };
        }
        return { data: json as AdminDashboardData };
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
      if (!cached) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading || !data || !data.stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  const { stats } = data;
  const monthLabel = new Date(data.year, data.month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const paidVsUnpaidData = [
    {
      name: "Collected",
      value: Math.round(stats.collectedPaymentsPoisha / 100),
      color: "#10b981",
    },
    {
      name: "Outstanding",
      value: Math.round(stats.outstandingDuesPoisha / 100),
      color: "#ef4444",
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header + Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Admin Overview • {monthLabel}</h2>
          <p className="text-sm text-slate-500">
            Today is {data.today} • Tomorrow is {data.tomorrow}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/guests">
            <Button size="sm" variant="outline">
              <UserPlus className="h-4 w-4" /> Add / Invite Guest
            </Button>
          </Link>
          <Link href="/admin/calendar">
            <Button size="sm" variant="outline">
              <Utensils className="h-4 w-4" /> Manage Today&apos;s Meals
            </Button>
          </Link>
          <Link href="/admin/invoices">
            <Button size="sm" variant="outline">
              <FileText className="h-4 w-4" /> Generate Invoices
            </Button>
          </Link>
          <Link href="/admin/payments">
            <Button size="sm">
              <CreditCard className="h-4 w-4" /> Record Payment
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Active Guests</span>
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.activeGuestsCount}</p>
            <p className="mt-1 text-xs text-slate-500">Receiving lunch schedules</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Today&apos;s Meals</span>
              <Utensils className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stats.todayMeals}</p>
            <p className="mt-1 text-xs text-slate-500">Tomorrow expected: {stats.tomorrowMeals}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Monthly Meals & Amount</span>
              <Calendar className="h-4 w-4 text-violet-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stats.monthlyMeals} meals
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Expected: {formatBDT(stats.monthlyAmountPoisha)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Outstanding Dues</span>
              <CreditCard className="h-4 w-4 text-red-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatBDT(stats.outstandingDuesPoisha)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Collected this month: {formatBDT(stats.collectedPaymentsPoisha)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending requests banner if any */}
      {stats.pendingRequestsCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-amber-900">
              <Clock className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium">
                You have {stats.pendingRequestsCount} pending late meal adjustment request(s).
              </span>
            </div>
            <Link href="/admin/adjustment-requests">
              <Button size="sm" variant="outline" className="bg-white">
                Review Requests
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1: Daily Meal Quantities + Monthly Expense Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Meal Quantities ({monthLabel})</CardTitle>
            <CardDescription>Confirmed lunch count per day</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="meals" name="Meals" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Meal Expenses ({monthLabel})</CardTitle>
            <CardDescription>Expected daily meal billing in BDT (৳)</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val) => [`৳${val}`, "Amount"]} />
                <Area
                  type="monotone"
                  dataKey="amountBdt"
                  name="Expense (BDT)"
                  stroke="#7c3aed"
                  fill="#ede9fe"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Paid vs Unpaid Summary + Upcoming Holidays */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Paid vs. Unpaid Summary</CardTitle>
            <CardDescription>Collected vs. remaining dues</CardDescription>
          </CardHeader>
          <CardContent>
            {paidVsUnpaidData.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">
                No invoiced or collected amounts yet.
              </p>
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paidVsUnpaidData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={72}
                        paddingAngle={3}
                      >
                        {paidVsUnpaidData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => `৳${val}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 text-xs mt-1">
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Collected: {formatBDT(stats.collectedPaymentsPoisha)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    Dues: {formatBDT(stats.outstandingDuesPoisha)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Holidays & Events</CardTitle>
            <CardDescription>Configured office calendar dates</CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcomingHolidays.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No upcoming holidays configured.</p>
            ) : (
              <div className="space-y-3">
                {data.upcomingHolidays.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{h.name}</p>
                      <p className="text-xs text-slate-500">{h.date}</p>
                    </div>
                    <Badge variant={h.type === "SPECIAL_WORKING_DAY" ? "info" : "muted"}>
                      {h.type.replaceAll("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Link href="/admin/holidays">
                <Button variant="outline" size="sm">
                  Manage Holidays
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guest Outstanding Balances */}
      <Card>
        <CardHeader>
          <CardTitle>Guest Billing & Outstanding Balances</CardTitle>
          <CardDescription>Summary across all generated invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {data.guestBalances.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No invoices generated yet. Generate monthly invoices to track guest balances.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead className="text-right">Total Billed</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.guestBalances.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{g.name}</p>
                      <p className="text-xs text-slate-500">{g.email}</p>
                    </TableCell>
                    <TableCell className="text-right">{formatBDT(g.billedPoisha)}</TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {formatBDT(g.paidPoisha)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {formatBDT(g.outstandingPoisha)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
