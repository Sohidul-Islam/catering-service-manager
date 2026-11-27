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
import { formatActivityDetails } from "@/lib/activity-format";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { filterCodecs } from "@/lib/url-filters";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-state";

interface LogRow {
  id: string;
  action: string;
  entityType: string;
  date: string | null;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  actor: { name: string; role: string } | null;
  targetUser: { name: string } | null;
}

const PAGE_SIZE = 20;

export default function AdminActivityLogsPage() {
  const activitySchema = useMemo(
    () => ({
      action: filterCodecs.enum(
        [
          "",
          "GUEST_UPDATE_MEAL",
          "ADMIN_UPDATE_MEAL",
          "ADMIN_OVERRIDE_LOCKED_MEAL",
          "APPROVE_ADJUSTMENT_REQUEST",
          "RECORD_PAYMENT",
          "GENERATE_INVOICE",
          "SET_DATE_MEAL_PRICE",
          "UPSERT_HOLIDAY",
          "PASSWORD_RESET_COMPLETED",
          "ADMIN_SEND_PASSWORD_RESET",
          "ADMIN_CHANGE_GUEST_PASSWORD",
        ] as const,
        ""
      ),
      search: filterCodecs.string(""),
      page: filterCodecs.int(1, { min: 1 }),
    }),
    []
  );

  const {
    filters: { action: actionFilter, search, page },
    setFilter,
    resetFilters,
    hasActiveFilters,
  } = useUrlFilters(activitySchema, { resetKeysOnFilterChange: ["page"] });

  const [logs, setLogs] = useState<LogRow[]>([]);
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
        ...(actionFilter ? { action: actionFilter } : {}),
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      });

      fetch(`/api/activity-logs?${qs.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Failed to load logs");
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
  }, [actionFilter, page, search, setFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Activity & Audit Logs</h2>
          <p className="text-sm text-slate-500">
            Tracks all meal updates, overrides, pricing changes, invoices, and payments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Search actor, guest, details..."
              className="pl-8 w-56 h-9 text-xs"
            />
          </div>
          <Select
            className="w-56"
            value={actionFilter}
            onChange={(e) =>
              setFilter(
                "action",
                e.target.value as
                  | ""
                  | "GUEST_UPDATE_MEAL"
                  | "ADMIN_UPDATE_MEAL"
                  | "ADMIN_OVERRIDE_LOCKED_MEAL"
                  | "APPROVE_ADJUSTMENT_REQUEST"
                  | "RECORD_PAYMENT"
                  | "GENERATE_INVOICE"
                  | "SET_DATE_MEAL_PRICE"
                  | "UPSERT_HOLIDAY"
                  | "PASSWORD_RESET_COMPLETED"
                  | "ADMIN_SEND_PASSWORD_RESET"
                  | "ADMIN_CHANGE_GUEST_PASSWORD"
              )
            }
          >
            <option value="">All Actions</option>
            <option value="GUEST_UPDATE_MEAL">Guest Meal Change</option>
            <option value="ADMIN_UPDATE_MEAL">Admin Meal Change</option>
            <option value="ADMIN_OVERRIDE_LOCKED_MEAL">Admin Override Locked Meal</option>
            <option value="APPROVE_ADJUSTMENT_REQUEST">Approve Adjustment</option>
            <option value="RECORD_PAYMENT">Record Payment</option>
            <option value="GENERATE_INVOICE">Generate Invoice</option>
            <option value="SET_DATE_MEAL_PRICE">Date Price Override</option>
            <option value="UPSERT_HOLIDAY">Holiday Change</option>
            <option value="PASSWORD_RESET_COMPLETED">Password Reset Completed</option>
            <option value="ADMIN_SEND_PASSWORD_RESET">Admin Sent Password Reset</option>
            <option value="ADMIN_CHANGE_GUEST_PASSWORD">Admin Changed Guest Password</option>
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
          <CardTitle>Recent Activity ({total})</CardTitle>
          <CardDescription>Immutable chronological audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading activity logs..." />
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No activity logs found.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target Guest</TableHead>
                    <TableHead>Meal Date</TableHead>
                    <TableHead>Change / Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {l.actor ? `${l.actor.name} (${l.actor.role})` : "System"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-[11px] whitespace-nowrap">
                          {l.action.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{l.targetUser?.name || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{l.date || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-md break-words">
                        {formatActivityDetails(l.previousValue, l.newValue, l.reason)}
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
