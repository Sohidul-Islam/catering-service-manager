"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import { TableSkeleton } from "@/components/ui/loading-state";
import { toast } from "sonner";

interface GuestPayment {
  id: string;
  amountPoisha: number;
  method: string;
  paymentType: string;
  reference: string | null;
  paidAt: string;
  invoice: { invoiceNumber: string };
  allocations: { invoiceItem: { date: string } | null }[];
}

export default function GuestPaymentsPage() {
  const [payments, setPayments] = useState<GuestPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payments")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load payments");
        setPayments(json.payments);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Payment History</h2>
        <p className="text-sm text-slate-500">All payments recorded for your meal invoices.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments ({payments.length})</CardTitle>
          <CardDescription>Includes full, partial, and selected-date allocations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading payments..." />
          ) : payments.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Allocated Dates</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">
                      {new Date(p.paidAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <Badge variant="info">{p.paymentType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{p.method.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {p.allocations
                        .map((a) => a.invoiceItem?.date)
                        .filter(Boolean)
                        .join(", ") || "Invoice Balance"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{p.reference || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">
                      {formatBDT(p.amountPoisha)}
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
