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
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [actionFilter, setActionFilter] = useState("");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Activity & Audit Logs</h2>
          <p className="text-sm text-slate-500">
            Tracks all meal updates, overrides, pricing changes, invoices, and payments.
          </p>
        </div>
        <Select
          className="w-56"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
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
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity ({logs.length})</CardTitle>
          <CardDescription>Immutable chronological audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No logs recorded yet.</p>
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
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {l.actor ? `${l.actor.name} (${l.actor.role})` : "System"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="text-[11px]">
                        {l.action.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{l.targetUser?.name || "—"}</TableCell>
                    <TableCell className="text-xs">{l.date || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-sm truncate">
                      {l.previousValue ? `${l.previousValue} → ` : ""}
                      {l.newValue || ""}
                      {l.reason ? ` (${l.reason})` : ""}
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
