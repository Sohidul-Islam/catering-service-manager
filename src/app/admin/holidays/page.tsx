"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/loading-state";
import { toast } from "sonner";

interface HolidayRow {
  id: string;
  date: string;
  name: string;
  type: "HOLIDAY" | "OFFICE_CLOSED" | "SPECIAL_WORKING_DAY";
  allowMeals: boolean;
  note: string | null;
}

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"HOLIDAY" | "OFFICE_CLOSED" | "SPECIAL_WORKING_DAY">("HOLIDAY");
  const [allowMeals, setAllowMeals] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadHolidays() {
    setLoading(true);
    try {
      const res = await fetch("/api/holidays");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load holidays");
      setHolidays(json.holidays);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHolidays();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate: endDate || undefined,
          name,
          type,
          allowMeals: type === "SPECIAL_WORKING_DAY" ? true : allowMeals,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save holiday");
      toast.success(`Saved ${json.holidays.length} calendar date(s)`);
      setStartDate("");
      setEndDate("");
      setName("");
      setNote("");
      loadHolidays();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/holidays/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      toast.success("Holiday removed");
      setDeleteTarget(null);
      loadHolidays();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Holidays & Office Calendar</h2>
        <p className="text-sm text-slate-500">
          Add single holidays, office closure date ranges, or mark weekends as special working days.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Holiday or Special Working Day</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="h-start">Start Date</Label>
              <Input
                id="h-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="h-end">End Date (optional for range)</Label>
              <Input
                id="h-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="h-name">Title / Event Name</Label>
              <Input
                id="h-name"
                required
                placeholder="e.g. Eid Holiday / Special Saturday"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="h-type">Calendar Type</Label>
              <Select
                id="h-type"
                value={type}
                onChange={(e) => {
                  const val = e.target.value as HolidayRow["type"];
                  setType(val);
                  if (val === "SPECIAL_WORKING_DAY") setAllowMeals(true);
                  else setAllowMeals(false);
                }}
                className="mt-1"
              >
                <option value="HOLIDAY">Public Holiday</option>
                <option value="OFFICE_CLOSED">Office Closed</option>
                <option value="SPECIAL_WORKING_DAY">Special Working Day</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="h-note">Notes (optional)</Label>
              <Textarea
                id="h-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-[38px]"
              />
            </div>
            <div className="flex items-end justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={allowMeals}
                  onChange={(e) => setAllowMeals(e.target.checked)}
                />
                Allow lunch service
              </label>
              <Button type="submit" disabled={submitting}>
                <Plus className="h-4 w-4" /> Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured Dates ({holidays.length})</CardTitle>
          <CardDescription>Overrides normal weekday/weekend schedule rules</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} label="Loading holidays..." />
          ) : holidays.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No holidays configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Meals Allowed</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.date}</TableCell>
                    <TableCell>{h.name}</TableCell>
                    <TableCell>
                      <Badge variant={h.type === "SPECIAL_WORKING_DAY" ? "info" : "muted"}>
                        {h.type.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.allowMeals ? "success" : "danger"}>
                        {h.allowMeals ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{h.note || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(h)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Holiday / Event"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.name}" on ${deleteTarget.date}? Normal weekday/weekend rules will apply to this date.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
