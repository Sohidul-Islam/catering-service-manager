"use client";

import React, { useEffect, useState } from "react";
import { Copy, History, Mail, Plus, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import { toast } from "sonner";

interface GuestRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  mealPreference: "REGULAR" | "OCCASIONAL";
  defaultMealQty: number;
  mealStartDate: string | null;
  joinedAt: string;
  invitation: { token: string; acceptedAt: string | null } | null;
  outstandingPoisha: number;
}

function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AdminGuestsPage() {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editGuest, setEditGuest] = useState<GuestRow | null>(null);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [historyGuest, setHistoryGuest] = useState<{
    name: string;
    email: string;
    mealPreference: string;
    defaultMealQty: number;
    mealStartDate: string | null;
    mealRecords: {
      id: string;
      date: string;
      quantity: number;
      unitPricePoisha: number;
      source: string;
      overrideScope: string | null;
    }[];
    mealRuleHistories: {
      id: string;
      effectiveFrom: string;
      quantity: number;
      scope: string;
      source: string;
      reason: string | null;
      createdAt: string;
      changedBy: { name: string; role: string } | null;
    }[];
    invoices: {
      id: string;
      invoiceNumber: string;
      year: number;
      month: number;
      totalAmountPoisha: number;
      paidAmountPoisha: number;
      status: string;
    }[];
    payments: {
      id: string;
      amountPoisha: number;
      method: string;
      paymentType: string;
      paidAt: string;
      invoice: { invoiceNumber: string };
    }[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Invite form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mealPreference, setMealPreference] = useState<"REGULAR" | "OCCASIONAL">("REGULAR");
  const [defaultMealQty, setDefaultMealQty] = useState(1);
  const [mealStartDate, setMealStartDate] = useState(getTodayDateStr);
  const [submitting, setSubmitting] = useState(false);

  async function loadGuests() {
    setLoading(true);
    try {
      const res = await fetch("/api/guests");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load guests");
      setGuests(json.guests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load guests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGuests();
  }, []);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone || undefined,
          mealPreference,
          defaultMealQty: mealPreference === "OCCASIONAL" ? 0 : defaultMealQty,
          mealStartDate: mealStartDate || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to invite guest");
      const fullLink = `${window.location.origin}${json.invitePath}`;
      setCreatedInviteLink(fullLink);
      toast.success(`Invitation created for ${name}`);
      setName("");
      setEmail("");
      setPhone("");
      loadGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite guest");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editGuest) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/guests/${editGuest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editGuest.name,
          phone: editGuest.phone,
          status: editGuest.status,
          mealPreference: editGuest.mealPreference,
          defaultMealQty: editGuest.defaultMealQty,
          mealStartDate: editGuest.mealStartDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      toast.success("Guest updated");
      setEditGuest(null);
      loadGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReinvite(guestId: string) {
    try {
      const res = await fetch(`/api/guests/${guestId}/reinvite`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to regenerate invite");
      const link = `${window.location.origin}${json.invitePath}`;
      await navigator.clipboard?.writeText(link);
      toast.success("New invitation link copied to clipboard!");
      loadGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reinvite");
    }
  }

  function copyLink(link: string) {
    navigator.clipboard?.writeText(link);
    toast.success("Invite link copied");
  }

  async function openHistory(guestId: string) {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/guests/${guestId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load guest history");
      setHistoryGuest(json.guest);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Guest Accounts & Invitations</h2>
          <p className="text-sm text-slate-500">
            Invite guests, configure regular/occasional meal defaults, and manage access.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreatedInviteLink(null);
            setInviteOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Invite Guest
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Guests ({guests.length})</CardTitle>
          <CardDescription>Inactive guests retain history but receive no new schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading guests...</p>
          ) : guests.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No guests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preference</TableHead>
                  <TableHead>Meal Start</TableHead>
                  <TableHead className="text-right">Default Qty</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{g.name}</p>
                      <p className="text-xs text-slate-500">{g.email}</p>
                      {g.phone && <p className="text-xs text-slate-400">{g.phone}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          g.status === "ACTIVE"
                            ? "success"
                            : g.status === "INVITED"
                            ? "warning"
                            : "muted"
                        }
                      >
                        {g.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.mealPreference === "REGULAR" ? "info" : "default"}>
                        {g.mealPreference}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {g.mealStartDate || "From start"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{g.defaultMealQty}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBDT(g.outstandingPoisha)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {g.status === "INVITED" && g.invitation?.token && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copyLink(
                                `${window.location.origin}/invite/accept?token=${g.invitation!.token}`
                              )
                            }
                          >
                            <Copy className="h-3.5 w-3.5" /> Link
                          </Button>
                        )}
                        {g.status === "INVITED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReinvite(g.id)}
                            title="Regenerate invite link"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openHistory(g.id)}>
                          <History className="h-3.5 w-3.5" /> History
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditGuest(g)}>
                          <UserCheck className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}
      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite New Guest"
        description="Creates an invitation link for the guest to set their password and activate their account."
      >
        {createdInviteLink ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> Invitation Link Ready
              </p>
              <p className="mt-1 text-xs break-all font-mono bg-white p-2 rounded border border-emerald-200">
                {createdInviteLink}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => copyLink(createdInviteLink)}>
                <Copy className="h-4 w-4" /> Copy Link
              </Button>
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div>
              <Label htmlFor="g-name">Full Name</Label>
              <Input
                id="g-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="g-email">Email</Label>
              <Input
                id="g-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="g-phone">Phone (optional)</Label>
              <Input
                id="g-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="g-pref">Meal Preference</Label>
                <Select
                  id="g-pref"
                  value={mealPreference}
                  onChange={(e) => setMealPreference(e.target.value as "REGULAR" | "OCCASIONAL")}
                  className="mt-1"
                >
                  <option value="REGULAR">Regular</option>
                  <option value="OCCASIONAL">Occasional</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="g-qty">Default Meal Qty</Label>
                <Input
                  id="g-qty"
                  type="number"
                  min={0}
                  disabled={mealPreference === "OCCASIONAL"}
                  value={mealPreference === "OCCASIONAL" ? 0 : defaultMealQty}
                  onChange={(e) => setDefaultMealQty(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="g-start">Meal Start Date</Label>
              <Input
                id="g-start"
                type="date"
                required
                value={mealStartDate}
                onChange={(e) => setMealStartDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Starting from <span className="font-medium text-slate-700">{mealStartDate}</span>:{" "}
                {mealPreference === "REGULAR" ? defaultMealQty : 0} meal(s) will be scheduled on
                applicable working days. Previous dates will not be included.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Invitation"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        open={Boolean(editGuest)}
        onClose={() => setEditGuest(null)}
        title="Edit Guest Profile"
      >
        {editGuest && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                required
                value={editGuest.name}
                onChange={(e) => setEditGuest({ ...editGuest, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={editGuest.phone ?? ""}
                onChange={(e) => setEditGuest({ ...editGuest, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={editGuest.status}
                  onChange={(e) =>
                    setEditGuest({ ...editGuest, status: e.target.value as GuestRow["status"] })
                  }
                  className="mt-1"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="INVITED">Invited</option>
                </Select>
              </div>
              <div>
                <Label>Preference</Label>
                <Select
                  value={editGuest.mealPreference}
                  onChange={(e) =>
                    setEditGuest({
                      ...editGuest,
                      mealPreference: e.target.value as "REGULAR" | "OCCASIONAL",
                    })
                  }
                  className="mt-1"
                >
                  <option value="REGULAR">Regular</option>
                  <option value="OCCASIONAL">Occasional</option>
                </Select>
              </div>
              <div>
                <Label>Default Qty</Label>
                <Input
                  type="number"
                  min={0}
                  value={editGuest.defaultMealQty}
                  onChange={(e) =>
                    setEditGuest({ ...editGuest, defaultMealQty: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Meal Start Date</Label>
              <Input
                type="date"
                value={editGuest.mealStartDate ?? ""}
                onChange={(e) =>
                  setEditGuest({ ...editGuest, mealStartDate: e.target.value || null })
                }
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">
                Meals before this date will never be auto-scheduled or billed.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditGuest(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Guest History Modal */}
      <Dialog
        open={Boolean(historyGuest) || historyLoading}
        onClose={() => setHistoryGuest(null)}
        title={historyGuest ? `Guest History • ${historyGuest.name}` : "Loading History..."}
        description={historyGuest?.email}
        maxWidthClass="max-w-3xl"
      >
        {historyLoading ? (
          <p className="text-sm text-slate-500 py-6 text-center">Loading guest history...</p>
        ) : historyGuest ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <p className="text-slate-500">Meal Start Date</p>
                <p className="font-semibold text-slate-900">
                  {historyGuest.mealStartDate || "From start"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Meal Type</p>
                <p className="font-semibold text-slate-900">{historyGuest.mealPreference}</p>
              </div>
              <div>
                <p className="text-slate-500">Current Default</p>
                <p className="font-semibold text-slate-900">
                  {historyGuest.defaultMealQty} meal(s)
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Recent Meal Records (Last 60)
              </h4>
              {historyGuest.mealRecords.length === 0 ? (
                <p className="text-xs text-slate-500">No meal records yet.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyGuest.mealRecords.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs font-medium">{m.date}</TableCell>
                          <TableCell className="text-right text-xs">{m.quantity}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="muted" className="text-[10px]">
                              {m.source.replaceAll("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatBDT(m.unitPricePoisha)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">
                            {formatBDT(m.quantity * m.unitPricePoisha)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {historyGuest.mealRuleHistories.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Meal Rule History
                </h4>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {historyGuest.mealRuleHistories.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">
                          {rule.effectiveFrom}
                        </span>{" "}
                        • {rule.quantity} meal(s) •{" "}
                        <span className="text-slate-600">
                          {rule.scope === "FOLLOWING_DATES"
                            ? "This and following meals"
                            : "This meal only"}
                        </span>
                      </div>
                      <span className="text-slate-500">
                        By {rule.changedBy?.name || "System"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Invoices & Payments
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Invoices</p>
                  {historyGuest.invoices.length === 0 ? (
                    <p className="text-xs text-slate-500">None</p>
                  ) : (
                    historyGuest.invoices.map((inv) => (
                      <div key={inv.id} className="flex justify-between text-xs">
                        <span className="font-mono">{inv.invoiceNumber}</span>
                        <span>
                          {formatBDT(inv.paidAmountPoisha)} / {formatBDT(inv.totalAmountPoisha)} (
                          {inv.status})
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Recent Payments</p>
                  {historyGuest.payments.length === 0 ? (
                    <p className="text-xs text-slate-500">None</p>
                  ) : (
                    historyGuest.payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span>
                          {new Date(p.paidAt).toLocaleDateString()} ({p.method})
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {formatBDT(p.amountPoisha)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
