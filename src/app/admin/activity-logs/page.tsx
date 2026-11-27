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
    }),
    []
  );

  const {
    filters: { action: actionFilter, search },
    setFilter,
    resetFilters,
    hasActiveFilters,
  } = useUrlFilters(activitySchema);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
    fetch(`/api/activity-logs${qs}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load logs");
        setLogs(json.logs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [actionFilter]);

  const visibleLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        (l.actor?.name.toLowerCase().includes(q) ?? false) ||
        (l.targetUser?.name.toLowerCase().includes(q) ?? false) ||
        (l.date?.includes(q) ?? false) ||
        formatActivityDetails(l.previousValue, l.newValue, l.reason).toLowerCase().includes(q)
    );
  }, [logs, search]);

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
          <CardTitle>
            Recent Activity ({visibleLogs.length}
            {visibleLogs.length !== logs.length ? ` of ${logs.length}` : ""})
          </CardTitle>
          <CardDescription>Immutable chronological audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading activity logs..." />
          ) : visibleLogs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No activity logs found.</p>
          ) : (
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
                {visibleLogs.map((l) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
