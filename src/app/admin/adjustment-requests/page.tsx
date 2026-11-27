"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { TableSkeleton } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { filterCodecs } from "@/lib/url-filters";
import { toast } from "sonner";

interface AdjRequest {
  id: string;
  date: string;
  currentQuantity: number;
  requestedQuantity: number;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  reviewedBy: { id: string; name: string } | null;
}

export default function AdminAdjustmentRequestsPage() {
  const requestsSchema = useMemo(
    () => ({
      status: filterCodecs.enum(
        ["PENDING", "APPROVED", "REJECTED", "ALL"] as const,
        "PENDING"
      ),
    }),
    []
  );

  const {
    filters: { status: filter },
    setFilter,
  } = useUrlFilters(requestsSchema);

  const [requests, setRequests] = useState<AdjRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    setLoading(true);
    try {
      const qs = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/adjustment-requests${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load requests");
      setRequests(json.requests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function handleReview(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      const res = await fetch(`/api/adjustment-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewNote: notes[id] || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to review request");
      if (json.emailSent) {
        toast.success(`Request ${decision.toLowerCase()} & email sent to guest`);
      } else {
        toast.success(
          `Request ${decision.toLowerCase()}${json.emailError ? ` (email failed: ${json.emailError})` : ""}`
        );
      }
      window.dispatchEvent(new Event("adjustment-requests-updated"));
      loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Late Meal Adjustment Requests</h2>
          <p className="text-sm text-slate-500">
            Approving a request updates the guest&apos;s meal schedule and recalculates any generated invoice.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => setFilter("status", s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requests ({requests.length})</CardTitle>
          <CardDescription>Submitted after the 11:50 PM confirmation cutoff</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading adjustment requests..." />
          ) : requests.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No adjustment requests found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Meal Date</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{r.user.name}</p>
                      <p className="text-xs text-slate-500">{r.user.email}</p>
                    </TableCell>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell>
                      <span className="text-slate-500">{r.currentQuantity}</span> →{" "}
                      <span className="font-bold text-slate-900">{r.requestedQuantity}</span>
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-slate-600">
                      {r.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "APPROVED"
                            ? "success"
                            : r.status === "REJECTED"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" ? (
                        <div className="inline-flex items-center gap-2">
                          <Input
                            placeholder="Optional note"
                            className="h-8 w-36 text-xs"
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          />
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleReview(r.id, "APPROVED")}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReview(r.id, "REJECTED")}
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {r.reviewedBy ? `By ${r.reviewedBy.name}` : "Reviewed"}
                        </span>
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
