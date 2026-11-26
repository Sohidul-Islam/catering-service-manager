"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface EmailLogRow {
  id: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  mealDate: string | null;
  resendMessageId: string | null;
  status: "PENDING" | "SENT" | "FAILED";
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  guest: { name: string } | null;
  sentBy: { name: string } | null;
  invoice: { invoiceNumber: string } | null;
}

export default function AdminEmailLogsPage() {
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (typeFilter) qs.set("emailType", typeFilter);
    if (statusFilter) qs.set("status", statusFilter);

    fetch(`/api/emails/logs?${qs.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load email logs");
        setLogs(json.logs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [typeFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Email Sending History</h2>
          <p className="text-sm text-slate-500">
            Audit trail for all manual Resend emails (confirmations, adjustments, invoices, receipts).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            className="w-48"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="GUEST_INVITATION">Guest Invitation</option>
            <option value="MEAL_CONFIRMATION">Meal Confirmation</option>
            <option value="MEAL_ADJUSTMENT">Meal Adjustment</option>
            <option value="INVOICE">Invoice</option>
            <option value="PAYMENT_CONFIRMATION">Payment Confirmation</option>
          </Select>
          <Select
            className="w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Logs ({logs.length})</CardTitle>
          <CardDescription>Tracks Resend message IDs, delivery status, and errors</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading email logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No emails sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Related</TableHead>
                  <TableHead>Sent By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details / Resend ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(l.sentAt || l.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info" className="text-[11px]">
                        {l.emailType.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-slate-900">
                        {l.guest?.name || l.recipientEmail}
                      </p>
                      <p className="text-[11px] text-slate-500">{l.recipientEmail}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {l.mealDate || l.invoice?.invoiceNumber || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{l.sentBy?.name || "Admin"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          l.status === "SENT"
                            ? "success"
                            : l.status === "FAILED"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                      {l.errorMessage ? (
                        <span className="text-red-600">{l.errorMessage}</span>
                      ) : (
                        <span className="font-mono text-[11px]">{l.resendMessageId || "—"}</span>
                      )}
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
