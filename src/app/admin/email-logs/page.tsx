"use client";

import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from "@/components/ui/table";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { filterCodecs } from "@/lib/url-filters";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-state";

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

const PAGE_SIZE = 20;

export default function AdminEmailLogsPage() {
  const emailLogsSchema = useMemo(
    () => ({
      emailType: filterCodecs.enum(
        [
          "",
          "GUEST_INVITATION",
          "MEAL_CONFIRMATION",
          "MEAL_ADJUSTMENT",
          "INVOICE",
          "PAYMENT_CONFIRMATION",
          "PASSWORD_RESET",
        ] as const,
        ""
      ),
      status: filterCodecs.enum(["", "SENT", "FAILED", "PENDING"] as const, ""),
      search: filterCodecs.string(""),
      page: filterCodecs.int(1, { min: 1 }),
    }),
    []
  );

  const {
    filters: { emailType: typeFilter, status: statusFilter, search, page },
    setFilter,
    resetFilters,
    hasActiveFilters,
  } = useUrlFilters(emailLogsSchema, { resetKeysOnFilterChange: ["page"] });

  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const trimmedSearch = search.trim();
    const delay = trimmedSearch ? 250 : 0;

    const timer = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ...(typeFilter ? { emailType: typeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      });

      fetch(`/api/emails/logs?${qs.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to load email logs");
          setLogs(json.logs);
          setTotal(json.pagination?.total ?? json.logs.length);
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
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, setFilter, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Email Sending History</h2>
          <p className="text-sm text-slate-500">
            Audit trail for all outgoing emails (confirmations, adjustments, invoices, receipts, resets).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Search recipient, subject..."
              className="pl-8 w-52 h-9 text-xs"
            />
          </div>
          <Select
            className="w-48"
            value={typeFilter}
            onChange={(e) =>
              setFilter(
                "emailType",
                e.target.value as
                  | ""
                  | "GUEST_INVITATION"
                  | "MEAL_CONFIRMATION"
                  | "MEAL_ADJUSTMENT"
                  | "INVOICE"
                  | "PAYMENT_CONFIRMATION"
                  | "PASSWORD_RESET"
              )
            }
          >
            <option value="">All Types</option>
            <option value="GUEST_INVITATION">Guest Invitation</option>
            <option value="MEAL_CONFIRMATION">Meal Confirmation</option>
            <option value="MEAL_ADJUSTMENT">Meal Adjustment</option>
            <option value="INVOICE">Invoice</option>
            <option value="PAYMENT_CONFIRMATION">Payment Confirmation</option>
            <option value="PASSWORD_RESET">Password Reset</option>
          </Select>
          <Select
            className="w-36"
            value={statusFilter}
            onChange={(e) =>
              setFilter("status", e.target.value as "" | "SENT" | "FAILED" | "PENDING")
            }
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </Select>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Logs ({total})</CardTitle>
          <CardDescription>Tracks message IDs, delivery status, and errors</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading email logs..." />
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No email logs found.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Related</TableHead>
                    <TableHead>Sent By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details / Message ID</TableHead>
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
    </div>
  );
}
