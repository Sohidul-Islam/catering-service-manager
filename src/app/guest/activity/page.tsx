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
import { formatActivityDetails } from "@/lib/activity-format";
import { TableSkeleton } from "@/components/ui/loading-state";
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

export default function GuestActivityPage() {
  const [logs, setLogs] = useState<GuestLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity-logs")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load activity");
        setLogs(json.logs);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Meal Activity</h2>
        <p className="text-sm text-slate-500">History of your meal selections, requests, and updates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity History ({logs.length})</CardTitle>
          <CardDescription>Includes admin approvals and overrides on your schedule</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading activity..." />
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No activity recorded yet.</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
