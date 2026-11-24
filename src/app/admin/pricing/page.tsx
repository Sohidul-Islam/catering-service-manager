"use client";

import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT, poishaToBdt } from "@/lib/money";
import { toast } from "sonner";

interface MealPriceRow {
  id: string;
  date: string;
  pricePoisha: number;
  note: string | null;
  createdBy: { name: string } | null;
}

export default function AdminPricingPage() {
  const [defaultBdt, setDefaultBdt] = useState("120");
  const [prices, setPrices] = useState<MealPriceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [overrideBdt, setOverrideBdt] = useState("100");
  const [note, setNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MealPriceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadPricing() {
    setLoading(true);
    try {
      const res = await fetch("/api/pricing");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load pricing");
      setDefaultBdt(String(poishaToBdt(json.defaultMealPricePoisha)));
      setPrices(json.prices);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pricing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, []);

  async function handleSaveDefault(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultMealPriceBdt: Number(defaultBdt) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update default price");
      toast.success("Default meal price updated (historical finalized records preserved)");
      loadPricing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleAddOverride(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate: endDate || undefined,
          priceBdt: Number(overrideBdt),
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save override");
      toast.success(`Saved price override for ${json.prices.length} date(s)`);
      setStartDate("");
      setEndDate("");
      setNote("");
      loadPricing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/pricing/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove override");
      toast.success("Price override removed");
      setDeleteTarget(null);
      loadPricing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Meal Pricing Management</h2>
        <p className="text-sm text-slate-500">
          Set the global default meal price or override prices for specific dates/ranges. Finalized meals retain their historical price snapshots.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Global Default Price</CardTitle>
            <CardDescription>Applied when no date-specific price exists</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveDefault} className="space-y-3">
              <div>
                <Label htmlFor="def-price">Default Price (BDT)</Label>
                <Input
                  id="def-price"
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={defaultBdt}
                  onChange={(e) => setDefaultBdt(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full">
                <Save className="h-4 w-4" /> Update Default Price
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Set Date or Range Price Override</CardTitle>
            <CardDescription>Overrides default price for the selected date(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddOverride} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-start">Start Date</Label>
                <Input
                  id="p-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-end">End Date (optional)</Label>
                <Input
                  id="p-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-bdt">Override Price (BDT)</Label>
                <Input
                  id="p-bdt"
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={overrideBdt}
                  onChange={(e) => setOverrideBdt(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="p-note">Note (optional)</Label>
                <Input
                  id="p-note"
                  placeholder="e.g. Special menu / discount"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end pt-1">
                <Button type="submit">
                  <Plus className="h-4 w-4" /> Set Price Override
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date-Specific Price History ({prices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading...</p>
          ) : prices.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No date overrides configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Configured By</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.date}</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatBDT(p.pricePoisha)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{p.note || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {p.createdBy?.name || "System"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)}>
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
        title="Remove Date Price Override"
        description={
          deleteTarget
            ? `Remove the ${formatBDT(deleteTarget.pricePoisha)} price override for ${deleteTarget.date}? Unfinalized meal records on this date will revert to the global default price.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
