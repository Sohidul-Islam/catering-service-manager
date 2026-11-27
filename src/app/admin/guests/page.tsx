"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  History,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  UserCheck,
  Users,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/loading-state";
import { parseBulkGuestInput, type InvalidBulkGuest } from "@/lib/guest-bulk-parser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_HINT,
  validatePasswordStrength,
} from "@/lib/password-validation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBDT } from "@/lib/money";
import { invalidateCalendarCache } from "@/lib/calendar-cache";
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

export default function AdminGuestsPage() {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRawInput, setBulkRawInput] = useState("");
  const [bulkMealPreference, setBulkMealPreference] = useState<"REGULAR" | "OCCASIONAL">("REGULAR");
  const [bulkDefaultMealQty, setBulkDefaultMealQty] = useState(1);
  const [bulkMealStartDate, setBulkMealStartDate] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    created: {
      id: string;
      name: string;
      email: string;
      invitePath: string;
      emailSent: boolean;
      emailError?: string;
    }[];
    failed: InvalidBulkGuest[];
  } | null>(null);
  const [editGuest, setEditGuest] = useState<GuestRow | null>(null);
  const [passwordGuest, setPasswordGuest] = useState<GuestRow | null>(null);
  const [manualPassword, setManualPassword] = useState("");
  const [manualConfirmPassword, setManualConfirmPassword] = useState("");
  const [manualPasswordError, setManualPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resetLinkGuest, setResetLinkGuest] = useState<GuestRow | null>(null);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [createdInviteEmailStatus, setCreatedInviteEmailStatus] = useState<{
    email: string;
    sent: boolean;
    error?: string;
  } | null>(null);
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
  const [mealStartDate, setMealStartDate] = useState("");
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
      const invitedEmail = email;
      const fullLink = `${window.location.origin}${json.invitePath}`;
      setCreatedInviteLink(fullLink);
      setCreatedInviteEmailStatus({
        email: invitedEmail,
        sent: Boolean(json.emailSent),
        error: json.emailError,
      });
      if (json.emailSent) {
        toast.success(`Invitation created and sent to ${invitedEmail}`);
      } else {
        toast.warning(
          `Invitation created for ${name}, but email failed: ${json.emailError || "SMTP error"}`
        );
      }
      setName("");
      setEmail("");
      setPhone("");
      setMealStartDate("");
      invalidateCalendarCache();
      loadGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite guest");
    } finally {
      setSubmitting(false);
    }
  }

  const bulkPreview = useMemo(() => parseBulkGuestInput(bulkRawInput), [bulkRawInput]);

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (bulkPreview.valid.length === 0 && bulkPreview.invalid.length === 0) {
      toast.error("Please enter at least one guest email.");
      return;
    }
    setBulkSubmitting(true);
    try {
      const res = await fetch("/api/guests/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: bulkRawInput,
          mealPreference: bulkMealPreference,
          defaultMealQty: bulkMealPreference === "OCCASIONAL" ? 0 : bulkDefaultMealQty,
          mealStartDate: bulkMealStartDate || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk invite failed");

      setBulkResult({
        created: json.created || [],
        failed: json.failed || [],
      });

      const createdCount = json.created?.length ?? 0;
      const failedCount = json.failed?.length ?? 0;
      if (createdCount > 0) {
        toast.success(
          `Added ${createdCount} guest(s)${failedCount > 0 ? ` (${failedCount} skipped)` : ""}`
        );
        invalidateCalendarCache();
        loadGuests();
      } else {
        toast.error("No guests were added. Check the invalid/duplicate entries.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk invite failed");
    } finally {
      setBulkSubmitting(false);
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
      invalidateCalendarCache();
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
      if (json.emailSent) {
        toast.success("New invitation link emailed & copied to clipboard!");
      } else {
        toast.warning(
          `New invitation link copied, but email failed: ${json.emailError || "SMTP error"}`
        );
      }
      loadGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reinvite");
    }
  }

  function copyLink(link: string) {
    navigator.clipboard?.writeText(link);
    toast.success("Invite link copied");
  }

  function openManualPasswordModal(guest: GuestRow) {
    setPasswordGuest(guest);
    setManualPassword("");
    setManualConfirmPassword("");
    setManualPasswordError(null);
  }

  async function handleManualPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordGuest) return;
    setManualPasswordError(null);

    const strengthError = validatePasswordStrength(manualPassword);
    if (strengthError) {
      setManualPasswordError(strengthError);
      return;
    }
    if (manualPassword !== manualConfirmPassword) {
      setManualPasswordError("Passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`/api/guests/${passwordGuest.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: manualPassword,
          confirmPassword: manualConfirmPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update guest password");
      toast.success(json.message || `Password updated for ${passwordGuest.name}`);
      setPasswordGuest(null);
      setManualPassword("");
      setManualConfirmPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password";
      setManualPasswordError(msg);
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleConfirmSendResetLink() {
    if (!resetLinkGuest) return;
    setSendingResetLink(true);
    try {
      const res = await fetch(`/api/guests/${resetLinkGuest.id}/password-reset`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send password reset link");

      if (json.emailSent) {
        toast.success(`Password reset link sent to ${resetLinkGuest.email}`);
      } else {
        toast.error(
          `Could not send reset email to ${resetLinkGuest.email}: ${json.emailError || "SMTP error"}`
        );
      }
      setResetLinkGuest(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send password reset link");
    } finally {
      setSendingResetLink(false);
    }
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setBulkResult(null);
              setBulkRawInput("");
              setBulkMealStartDate("");
              setBulkOpen(true);
            }}
          >
            <Users className="h-4 w-4" /> Bulk Add Guests
          </Button>
          <Button
            onClick={() => {
              setCreatedInviteLink(null);
              setCreatedInviteEmailStatus(null);
              setInviteOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Invite Guest
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Guests ({guests.length})</CardTitle>
          <CardDescription>Inactive guests retain history but receive no new schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading guests..." />
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
                      {g.mealStartDate || "Not set (Calendar)"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{g.defaultMealQty}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBDT(g.outstandingPoisha)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
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
                        {g.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setResetLinkGuest(g)}
                            title="Send password reset link via email"
                          >
                            <Send className="h-3.5 w-3.5" /> Reset Link
                          </Button>
                        )}
                        {g.status !== "INVITED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openManualPasswordModal(g)}
                            title="Change guest password manually"
                          >
                            <KeyRound className="h-3.5 w-3.5" /> Password
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
                <Mail className="h-4 w-4" />{" "}
                {createdInviteEmailStatus?.sent
                  ? `Invitation Emailed to ${createdInviteEmailStatus.email}`
                  : "Invitation Link Ready"}
              </p>
              {createdInviteEmailStatus && !createdInviteEmailStatus.sent && (
                <p className="mt-1 text-xs text-amber-700">
                  Email could not be sent ({createdInviteEmailStatus.error || "SMTP error"}). You
                  can still copy and share the link below.
                </p>
              )}
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
              <Label htmlFor="g-start">Meal Start Date (optional)</Label>
              <Input
                id="g-start"
                type="date"
                value={mealStartDate}
                onChange={(e) => setMealStartDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                {mealStartDate ? (
                  <>
                    Starting from <span className="font-medium text-slate-700">{mealStartDate}</span>
                    : {mealPreference === "REGULAR" ? defaultMealQty : 0} meal(s) will be
                    auto-scheduled on applicable working days. Earlier dates are not
                    auto-scheduled, though admins can still add or adjust records in the Calendar.
                  </>
                ) : (
                  <>
                    Leave empty if the guest hasn&rsquo;t decided when they will start taking meals.
                    No meals will be auto-scheduled; admins can manage meals for this guest from the
                    Calendar.
                  </>
                )}
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

      {/* Bulk Add Modal */}
      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk Add Guests"
        description="Add multiple guests using comma-separated emails or one guest per line with an optional name."
        maxWidthClass="max-w-2xl"
      >
        {bulkResult ? (
          <div className="space-y-4">
            {bulkResult.created.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Added {bulkResult.created.length} Guest(s)
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {bulkResult.created.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 text-xs border border-emerald-200"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{item.name}</span>{" "}
                        <span className="text-slate-500">({item.email})</span>
                      </div>
                      <span
                        className={
                          item.emailSent ? "text-emerald-700 font-medium" : "text-amber-700"
                        }
                      >
                        {item.emailSent
                          ? "Invite emailed"
                          : `Email failed: ${item.emailError || "SMTP error"}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkResult.failed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  Could Not Process ({bulkResult.failed.length})
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {bulkResult.failed.map((item, idx) => (
                    <div
                      key={`${item.email}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 text-xs border border-red-200"
                    >
                      <span className="font-mono text-slate-800">{item.raw}</span>
                      <span className="text-red-700 font-medium">{item.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setBulkResult(null);
                  setBulkRawInput("");
                }}
              >
                Add More
              </Button>
              <Button onClick={() => setBulkOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <div>
              <Label htmlFor="bulk-guests-input">Guests (Email, Optional Name)</Label>
              <textarea
                id="bulk-guests-input"
                rows={5}
                required
                value={bulkRawInput}
                onChange={(e) => setBulkRawInput(e.target.value)}
                placeholder={
                  "john@example.com, John Doe\nsarah@example.com, Sarah Ahmed\nmike@example.com\n\nOr comma-separated emails:\nalex@example.com, priya.patel@example.com"
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
              />
              <p className="mt-1 text-xs text-slate-500">
                If no name is provided, a name is automatically generated from the email address
                (e.g. <span className="font-mono">john.doe@example.com</span> →{" "}
                <span className="font-medium text-slate-700">John Doe</span>).
              </p>
            </div>

            {bulkRawInput.trim().length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    Preview: {bulkPreview.valid.length} valid
                    {bulkPreview.invalid.length > 0 && (
                      <span className="text-red-600"> • {bulkPreview.invalid.length} invalid/duplicate</span>
                    )}
                  </span>
                </div>
                {bulkPreview.valid.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {bulkPreview.valid.map((g) => (
                      <div key={g.email} className="flex items-center justify-between text-slate-700">
                        <span>
                          <span className="font-medium text-slate-900">{g.name}</span>{" "}
                          <span className="text-slate-500">({g.email})</span>
                        </span>
                        {g.isNameGenerated && (
                          <Badge variant="muted" className="text-[10px]">
                            Auto-named
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {bulkPreview.invalid.length > 0 && (
                  <div className="max-h-24 overflow-y-auto space-y-1 border-t border-slate-200 pt-1.5">
                    {bulkPreview.invalid.map((inv, idx) => (
                      <div key={`${inv.raw}-${idx}`} className="flex justify-between text-red-600">
                        <span className="font-mono truncate max-w-[60%]">{inv.raw}</span>
                        <span>{inv.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bulk-pref">Meal Preference</Label>
                <Select
                  id="bulk-pref"
                  value={bulkMealPreference}
                  onChange={(e) =>
                    setBulkMealPreference(e.target.value as "REGULAR" | "OCCASIONAL")
                  }
                  className="mt-1"
                >
                  <option value="REGULAR">Regular</option>
                  <option value="OCCASIONAL">Occasional</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="bulk-qty">Default Meal Qty</Label>
                <Input
                  id="bulk-qty"
                  type="number"
                  min={0}
                  disabled={bulkMealPreference === "OCCASIONAL"}
                  value={bulkMealPreference === "OCCASIONAL" ? 0 : bulkDefaultMealQty}
                  onChange={(e) => setBulkDefaultMealQty(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bulk-start">Meal Start Date (optional)</Label>
              <Input
                id="bulk-start"
                type="date"
                value={bulkMealStartDate}
                onChange={(e) => setBulkMealStartDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave empty if guests haven&rsquo;t decided when they will start taking meals.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={bulkSubmitting || bulkPreview.valid.length === 0}
              >
                {bulkSubmitting
                  ? "Adding & Inviting..."
                  : `Add & Invite (${bulkPreview.valid.length})`}
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
                  onChange={(e) => {
                    const nextPref = e.target.value as "REGULAR" | "OCCASIONAL";
                    setEditGuest({
                      ...editGuest,
                      mealPreference: nextPref,
                      defaultMealQty:
                        nextPref === "OCCASIONAL" ? 0 : editGuest.defaultMealQty || 1,
                    });
                  }}
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
                  disabled={editGuest.mealPreference === "OCCASIONAL"}
                  value={
                    editGuest.mealPreference === "OCCASIONAL" ? 0 : editGuest.defaultMealQty
                  }
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
                Meals before this date will not be auto-scheduled. Admins can still manually add or
                adjust historical records in the Calendar.
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
                  {historyGuest.mealStartDate || "Not set (Calendar)"}
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

      {/* Admin Manual Password Change Modal */}
      <Dialog
        open={Boolean(passwordGuest)}
        onClose={() => {
          if (!changingPassword) setPasswordGuest(null);
        }}
        title="Change Guest Password"
        description="Set a new password for a guest who needs assistance signing in."
      >
        {passwordGuest && (
          <form onSubmit={handleManualPasswordSubmit} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {passwordGuest.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{passwordGuest.email}</p>
              </div>
              <Badge variant={passwordGuest.status === "ACTIVE" ? "success" : "muted"}>
                {passwordGuest.status}
              </Badge>
            </div>

            {manualPasswordError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {manualPasswordError}
              </div>
            )}

            <div>
              <Label htmlFor="admin-guest-pass">New Password</Label>
              <PasswordInput
                id="admin-guest-pass"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={manualPassword}
                onChange={(e) => {
                  setManualPassword(e.target.value);
                  if (manualPasswordError) setManualPasswordError(null);
                }}
                placeholder="Enter new password"
                className="mt-1"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-slate-500">{PASSWORD_REQUIREMENTS_HINT}</p>
            </div>

            <div>
              <Label htmlFor="admin-guest-pass-confirm">Confirm New Password</Label>
              <PasswordInput
                id="admin-guest-pass-confirm"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={manualConfirmPassword}
                onChange={(e) => {
                  setManualConfirmPassword(e.target.value);
                  if (manualPasswordError) setManualPasswordError(null);
                }}
                placeholder="Re-enter new password"
                className="mt-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={changingPassword}
                onClick={() => setPasswordGuest(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changingPassword}>
                <KeyRound className="h-4 w-4" />
                {changingPassword ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Admin Send Password Reset Link Confirmation */}
      <ConfirmDialog
        open={Boolean(resetLinkGuest)}
        onClose={() => {
          if (!sendingResetLink) setResetLinkGuest(null);
        }}
        onConfirm={handleConfirmSendResetLink}
        title="Send Password Reset Link"
        description={
          resetLinkGuest
            ? `Send a single-use password reset link (valid for 60 minutes) to ${resetLinkGuest.name} (${resetLinkGuest.email})? Any previously unused reset links for this guest will be invalidated.`
            : ""
        }
        confirmLabel="Send Reset Link"
        loading={sendingResetLink}
      />
    </div>
  );
}
