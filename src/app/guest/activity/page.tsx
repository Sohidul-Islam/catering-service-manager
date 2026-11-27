"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { TableSkeleton } from "@/components/ui/loading-state";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { filterCodecs } from "@/lib/url-filters";
import { toast } from "sonner";

interface GuestLog {
  id: string;
  action: string;
  date: string | null;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  actor: { name: string; role: string } | null;
}

const PAGE_SIZE = 20;

export default function GuestActivityPage() {
  const activitySchema = useMemo(
    () => ({
      page: filterCodecs.int(1, { min: 1 }),
    }),
    []
  );

  const {
    filters: { page },
    setFilter,
  } = useUrlFilters(activitySchema, { resetKeysOnFilterChange: ["page"] });

  const [logs, setLogs] = useState<GuestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/activity-logs?page=${page}&pageSize=${PAGE_SIZE}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load activity");
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

    return () => controller.abort();
  }, [page, setFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Meal Activity</h2>
        <p className="text-sm text-slate-500">History of your meal selections, requests, and updates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity History ({total})</CardTitle>
          <CardDescription>Includes admin approvals and overrides on your schedule</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading activity..." />
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No activity recorded yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(l.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-[11px]">
                          {l.action.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{l.actor?.name || "System"}</TableCell>
                      <TableCell className="text-xs">{l.date || "—"}</TableCell>
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
