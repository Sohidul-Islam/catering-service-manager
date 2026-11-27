"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, RefreshCw, Utensils } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VendorDay {
  date: string;
  dayOfWeek: string;
  isWorkingDay: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  holidayName: string | null;
  totalMeals: number;
}

interface VendorMealSummaryResponse {
  organizationName: string;
  timezone: string;
  year: number;
  month: number;
  monthLabel: string;
  today: string;
  tomorrow: string;
  todayMeals: number;
  tomorrowMeals: number;
  monthTotalMeals: number;
  days: VendorDay[];
}

export default function PublicVendorMealsPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [data, setData] = useState<VendorMealSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`/api/public/vendor-meals/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Unable to load meal counts");
    }
    return json as VendorMealSummaryResponse;
  }, [token]);

  async function handleRefresh() {
    if (!token) return;
    setRefreshing(true);
    try {
      const json = await fetchSummary();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired link");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchSummary()
      .then((json) => {
        if (!active) return;
        setData(json);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Invalid or expired link");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, fetchSummary]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <PageLoader
          label="Loading live meal counts..."
          description="Fetching today, tomorrow, and monthly totals"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Link Unavailable</CardTitle>
            <CardDescription>{error || "This vendor meal link is invalid."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Office Meal Manager"
              className="h-12 w-12 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shadow-xs"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {data.organizationName} — Meal Count
              </h1>
              <p className="text-sm text-slate-500">
                {data.monthLabel} • Live vendor meal schedule
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {/* Today, Tomorrow, Month Total KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-blue-200 bg-blue-50/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Today&apos;s Total Meals
                </p>
                <Utensils className="h-4 w-4 text-blue-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{data.todayMeals}</p>
              <p className="mt-1 text-xs text-slate-600">{data.today}</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Tomorrow&apos;s Total Meals
                </p>
                <Calendar className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{data.tomorrowMeals}</p>
              <p className="mt-1 text-xs text-slate-600">{data.tomorrow}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {data.monthLabel} Total
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{data.monthTotalMeals}</p>
              <p className="mt-1 text-xs text-slate-500">Total meals this month</p>
            </CardContent>
          </Card>
        </div>

        {/* Daily Breakdown for Current Month */}
        <Card>
          <CardHeader>
            <CardTitle>{data.monthLabel} — Daily Meal Count</CardTitle>
            <CardDescription>
              Day-by-day total meal count for {data.organizationName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Meals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.days.map((day) => (
                  <TableRow
                    key={day.date}
                    className={
                      day.isToday
                        ? "bg-blue-50/70"
                        : day.isTomorrow
                        ? "bg-emerald-50/50"
                        : !day.isWorkingDay
                        ? "bg-slate-50/70 text-slate-400"
                        : ""
                    }
                  >
                    <TableCell className="font-medium">
                      <span>{day.date}</span>
                      {day.isToday && (
                        <Badge variant="info" className="ml-2 text-[10px]">
                          Today
                        </Badge>
                      )}
                      {day.isTomorrow && (
                        <Badge variant="success" className="ml-2 text-[10px]">
                          Tomorrow
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{day.dayOfWeek}</TableCell>
                    <TableCell className="text-xs">
                      {day.holidayName ? (
                        <Badge variant="muted">{day.holidayName}</Badge>
                      ) : day.isWorkingDay ? (
                        <span className="text-slate-600">Working Day</span>
                      ) : (
                        <span className="text-slate-400">Weekend / Off</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-900">
                      {day.totalMeals}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
