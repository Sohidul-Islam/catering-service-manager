"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import { TableSkeleton } from "@/components/ui/loading-state";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { filterCodecs } from "@/lib/url-filters";
import { toast } from "sonner";

interface GuestInvoice {
  id: string;
  invoiceNumber: string;
  year: number;
  month: number;
  totalMeals: number;
  totalAmountPoisha: number;
  paidAmountPoisha: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  items: {
    id: string;
    date: string;
    quantity: number;
    unitPricePoisha: number;
    totalAmountPoisha: number;
    isPaid: boolean;
  }[];
}

const PAGE_SIZE = 20;

export default function GuestInvoicesPage() {
  const invoicesSchema = useMemo(
    () => ({
      page: filterCodecs.int(1, { min: 1 }),
    }),
    []
  );

  const {
    filters: { page },
    setFilter,
  } = useUrlFilters(invoicesSchema, { resetKeysOnFilterChange: ["page"] });

  const [invoices, setInvoices] = useState<GuestInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<GuestInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/invoices?page=${page}&pageSize=${PAGE_SIZE}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load invoices");
        setInvoices(json.invoices);
        setTotal(json.pagination?.total ?? json.invoices.length);
        if (json.pagination?.page && json.pagination.page !== page) {
          setFilter("page", json.pagination.page);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, setFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Monthly Invoices</h2>
        <p className="text-sm text-slate-500">View your monthly meal summaries and date-wise bills.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices ({total})</CardTitle>
          <CardDescription>Only your own invoices are visible</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading invoices..." />
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No invoices generated yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Meals</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        {inv.year}-{String(inv.month).padStart(2, "0")}
                      </TableCell>
                      <TableCell className="text-right">{inv.totalMeals}</TableCell>
                      <TableCell className="text-right">{formatBDT(inv.totalAmountPoisha)}</TableCell>
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
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(inv)}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(nextPage) => setFilter("page", nextPage)}
                disabled={loading}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Invoice ${selected.invoiceNumber}` : ""}
        maxWidthClass="max-w-2xl"
      >
        {selected && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.items
                .filter((i) => i.quantity > 0)
                .map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.date}</TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right">{formatBDT(i.unitPricePoisha)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBDT(i.totalAmountPoisha)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={i.isPaid ? "success" : "muted"}>
                        {i.isPaid ? "Paid" : "Unpaid"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Dialog>
    </div>
  );
}
