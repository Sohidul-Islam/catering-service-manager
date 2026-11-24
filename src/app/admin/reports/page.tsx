"use client";

import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
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
import { toast } from "sonner";

interface ReportData {
  year: number;
  month: number;
  mealReport: {
    totalWorkingDays: number;
    totalMeals: number;
    totalExpectedAmountPoisha: number;
    guestBreakdown: {
      userId: string;
      name: string;
      email: string;
      totalMeals: number;
      totalAmountPoisha: number;
    }[];
    dateWiseHistory: {
      id: string;
      date: string;
      quantity: number;
      unitPricePoisha: number;
      totalPoisha: number;
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

      {loading || !data ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading reports...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Working Days / Total Meals</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {data.mealReport.totalWorkingDays} days • {data.mealReport.totalMeals} meals
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
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Guest-wise Meal Report</CardTitle>
                <CardDescription>Total meals and expected expense per guest</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportCsv("meals")}>
                <Download className="h-4 w-4" /> Export Meals CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="text-right">Total Meals</TableHead>
                    <TableHead className="text-right">Total Meal Expense</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.mealReport.guestBreakdown.map((g) => (
                    <TableRow key={g.userId}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{g.name}</p>
                        <p className="text-xs text-slate-500">{g.email}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">{g.totalMeals}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBDT(g.totalAmountPoisha)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {guestId && data.mealReport.dateWiseHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Selected Guest Date-wise Meal History</CardTitle>
                <CardDescription>Daily confirmed quantities and unit prices</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.mealReport.dateWiseHistory.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.date}</TableCell>
                        <TableCell className="text-right">{d.quantity}</TableCell>
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
              </CardContent>
            </Card>
          )}

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
