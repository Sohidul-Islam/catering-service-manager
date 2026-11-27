"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import { MealSummaryPanel } from "@/components/summary/MealSummaryPanel";
import { PageLoader } from "@/components/ui/loading-state";
import { toast } from "sonner";

interface ReportData {
  year: number;
  month: number;
  mealReport: {
    totalWorkingDays: number;
    totalMeals: number;
    yearTotalMeals: number;
    allTimeTotalMeals: number;
    totalExpectedAmountPoisha: number;
    monthlyBreakdown: {
      month: number;
      totalMeals: number;
      mealDays: number;
      totalAmountPoisha: number;
    }[];
    guestBreakdown: {
      userId: string;
      name: string;
      email: string;
      mealDays: number;
      totalMeals: number;
      allTimeMeals: number;
      totalAmountPoisha: number;
    }[];
    dateWiseHistory: {
      id: string;
      date: string;
      quantity: number;
      unitPricePoisha: number;
      totalPoisha: number;
      source?: string;
    }[];
  };
  financialReport: {
    totalInvoicedPoisha: number;
    totalCollectedPoisha: number;
    totalOutstandingPoisha: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
    invoices: {
      id: string;
      invoiceNumber: string;
      totalMeals: number;
      totalAmountPoisha: number;
      paidAmountPoisha: number;
      status: string;
      user: { name: string; email: string };
    }[];
  };
  guests: { id: string; name: string }[];
}

export default function AdminReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guestId, setGuestId] = useState("");
  const [status, setStatus] = useState("");
  const [onlyTakenDays, setOnlyTakenDays] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReport() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        year: String(year),
        month: String(month),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(guestId ? { guestId } : {}),
        ...(status ? { status } : {}),
      });
      const res = await fetch(`/api/reports?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, [year, month, startDate, endDate, guestId, status]);

  function exportCsv(type: "meals" | "financial") {
    const qs = new URLSearchParams({
      year: String(year),
      month: String(month),
      type,
      format: "csv",
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(guestId ? { guestId } : {}),
      ...(status ? { status } : {}),
    });
    window.location.href = `/api/reports?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports & Financial Summary</h2>
          <p className="text-sm text-slate-500">
            Filter monthly or date-range meal, financial, and guest-wise reports and export to CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-32" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2026, m - 1).toLocaleDateString("en-US", { month: "long" })}
              </option>
            ))}
          </Select>
          <Select className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="Start date"
            className="w-36"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            title="Optional start date override"
          />
          <Input
            type="date"
            aria-label="End date"
            className="w-36"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            title="Optional end date override"
          />
          {(startDate || endDate) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear Dates
            </Button>
          )}
          <Select className="w-40" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
            <option value="">All Guests</option>
            {data?.guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Copyable Total Meal Summary</CardTitle>
          <CardDescription>
            Generate and copy Today, Tomorrow, Weekly, Monthly, or Custom meal summaries for sharing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MealSummaryPanel />
        </CardContent>
      </Card>

      {loading || !data ? (
        <PageLoader
          label="Loading meal & financial reports..."
          description="Aggregating monthly totals and guest history"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Working Days / Period Meals</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {data.mealReport.totalWorkingDays} days • {data.mealReport.totalMeals} meals
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">
                  {guestId ? "Guest Total (Year / All-Time)" : `Total Meals (${year} / All-Time)`}
                </p>
                <p className="mt-1 text-xl font-bold text-blue-700">
                  {data.mealReport.yearTotalMeals} / {data.mealReport.allTimeTotalMeals}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Invoiced</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatBDT(data.financialReport.totalInvoicedPoisha)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Collected</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatBDT(data.financialReport.totalCollectedPoisha)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Outstanding</p>
                <p className="mt-1 text-xl font-bold text-red-600">
                  {formatBDT(data.financialReport.totalOutstandingPoisha)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Paid: {data.financialReport.paidCount} • Partial:{" "}
                  {data.financialReport.partialCount} • Unpaid: {data.financialReport.unpaidCount}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Month-by-Month Meal Overview ({year})
                {guestId && (
                  <Badge variant="info">
                    {data.guests.find((g) => g.id === guestId)?.name ?? "Selected Guest"}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Click any month to view its detailed breakdown.{" "}
                {guestId
                  ? "Showing monthly meal counts for the selected guest."
                  : "Showing total meals across all guests."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {data.mealReport.monthlyBreakdown.map((m) => {
                  const isActive = m.month === month && !startDate && !endDate;
                  const monthLabel = new Date(year, m.month - 1).toLocaleDateString("en-US", {
                    month: "short",
                  });
                  return (
                    <button
                      key={m.month}
                      type="button"
                      onClick={() => {
                        setStartDate("");
                        setEndDate("");
                        setMonth(m.month);
                      }}
                      className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                        isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">{monthLabel}</span>
                        <span className="text-xs font-bold text-blue-700">{m.totalMeals}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {m.mealDays} day(s) • {formatBDT(m.totalAmountPoisha)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Guest-wise Meal Report</CardTitle>
                <CardDescription>
                  Click a guest to inspect their day-by-day meal history and monthly totals
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {guestId && (
                  <Button size="sm" variant="ghost" onClick={() => setGuestId("")}>
                    Show All Guests
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => exportCsv("meals")}>
                  <Download className="h-4 w-4" /> Export Meals CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="text-right">Days Taken</TableHead>
                    <TableHead className="text-right">Period Meals</TableHead>
                    <TableHead className="text-right">All-Time Meals</TableHead>
                    <TableHead className="text-right">Period Expense</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.mealReport.guestBreakdown.map((g) => (
                    <TableRow
                      key={g.userId}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        guestId === g.userId ? "bg-blue-50/60" : ""
                      }`}
                      onClick={() => setGuestId(g.userId)}
                    >
                      <TableCell>
                        <p className="font-medium text-slate-900">{g.name}</p>
                        <p className="text-xs text-slate-500">{g.email}</p>
                      </TableCell>
                      <TableCell className="text-right text-slate-600">{g.mealDays}</TableCell>
                      <TableCell className="text-right font-semibold">{g.totalMeals}</TableCell>
                      <TableCell className="text-right font-bold text-blue-700">
                        {g.allTimeMeals}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBDT(g.totalAmountPoisha)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={guestId === g.userId ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setGuestId(guestId === g.userId ? "" : g.userId);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />{" "}
                          {guestId === g.userId ? "Selected" : "View Days"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {guestId && (() => {
            const visibleHistory = onlyTakenDays
              ? data.mealReport.dateWiseHistory.filter((d) => d.quantity > 0)
              : data.mealReport.dateWiseHistory;
            const selectedGuestName =
              data.guests.find((g) => g.id === guestId)?.name ?? "Selected Guest";

            return (
              <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>{selectedGuestName} — Day-wise Meal History</CardTitle>
                    <CardDescription>
                      Period total: {data.mealReport.totalMeals} meal(s) • {year} total:{" "}
                      {data.mealReport.yearTotalMeals} meal(s) • All-time total:{" "}
                      {data.mealReport.allTimeTotalMeals} meal(s)
                    </CardDescription>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyTakenDays}
                      onChange={(e) => setOnlyTakenDays(e.target.checked)}
                    />
                    Only show days with meals (&gt; 0)
                  </label>
                </CardHeader>
                <CardContent>
                  {visibleHistory.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No meals recorded for this guest in the selected period.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleHistory.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">{d.date}</TableCell>
                            <TableCell className="text-right font-semibold">{d.quantity}</TableCell>
                            <TableCell className="text-xs">
                              {d.source ? (
                                <Badge variant="muted" className="text-[10px]">
                                  {d.source.replaceAll("_", " ")}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatBDT(d.unitPricePoisha)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatBDT(d.totalPoisha)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Monthly Financial Report</CardTitle>
                <CardDescription>Invoices, payments collected, and balances</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportCsv("financial")}>
                <Download className="h-4 w-4" /> Export Financial CSV
              </Button>
            </CardHeader>
            <CardContent>
              {data.financialReport.invoices.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No invoices generated for this filter.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.financialReport.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{inv.user.name}</TableCell>
                        <TableCell className="text-right">
                          {formatBDT(inv.totalAmountPoisha)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-700">
                          {formatBDT(inv.paidAmountPoisha)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatBDT(Math.max(0, inv.totalAmountPoisha - inv.paidAmountPoisha))}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
