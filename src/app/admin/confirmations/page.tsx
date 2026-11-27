"use client";

import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, Eye, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailPreviewData, EmailPreviewModal } from "@/components/email/EmailPreviewModal";
import { VendorShareLinkCard } from "@/components/vendor/VendorShareLinkCard";
import { formatBDT } from "@/lib/money";
import { TableSkeleton } from "@/components/ui/loading-state";
import { copyTextToClipboard, formatMealSummaryText } from "@/lib/meal-summary";
import { addDays } from "@/lib/timezone";
import { toast } from "sonner";

interface ConfirmationGuestRow {
  userId: string;
  guestName: string;
  guestEmail: string;
  quantity: number;
  unitPricePoisha: number;
  totalPoisha: number;
  confirmationEmailSentAt: string | null;
}

function getDefaultTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AdminMealConfirmationsPage() {
  const [date, setDate] = useState(getDefaultTomorrowDate);
  const [rows, setRows] = useState<ConfirmationGuestRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [targetGuestIds, setTargetGuestIds] = useState<string[]>([]);
  const [organizationName, setOrganizationName] = useState<string | undefined>(undefined);
  const [todayStr, setTodayStr] = useState<string>("");
  const [copiedSummary, setCopiedSummary] = useState(false);

  async function loadDay() {
    setLoading(true);
    try {
      const [y, m] = date.split("-").map(Number);
      const res = await fetch(`/api/calendar?year=${y}&month=${m}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load meal records");
      setOrganizationName(json.settings?.organizationName);
      setTodayStr(json.today ?? "");
      const day = (json.days as { date: string; records: ConfirmationGuestRow[] }[]).find(
        (d) => d.date === date
      );
      const recs = day?.records ?? [];
      setRows(recs);
      setSelectedIds(recs.filter((r) => r.quantity > 0).map((r) => r.userId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load confirmations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (date) loadDay();
  }, [date]);

  function toggleGuest(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function openPreview(guestIds: string[]) {
    if (guestIds.length === 0) {
      toast.error("Select at least one guest first");
      return;
    }
    setTargetGuestIds(guestIds);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/emails/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailType: "MEAL_CONFIRMATION",
          guestIds,
          date,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Preview failed");
      const names = rows
        .filter((r) => guestIds.includes(r.userId))
        .map((r) => `${r.guestName} (${r.quantity})`)
        .join(", ");
      setPreviewData({
        ...json.preview,
        recipientCount: json.recipientCount,
        extraNote:
          guestIds.length > 1 ? `Selected guests: ${names}` : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirmSend() {
    setSending(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailType: "MEAL_CONFIRMATION",
          guestIds: targetGuestIds,
          date,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send failed");

      if (json.failedCount > 0) {
        toast.warning(
          `Sent ${json.sentCount} email(s), ${json.failedCount} failed (check Email Logs)`
        );
      } else {
        toast.success(`Sent ${json.sentCount} confirmation email(s)`);
      }
      setPreviewOpen(false);
      await loadDay();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const activeRows = rows.filter((r) => r.quantity > 0);

  async function handleCopySummary() {
    const effectiveToday = todayStr || date;
    const effectiveTomorrow = addDays(effectiveToday, 1);
    const storedSig =
      typeof window !== "undefined"
        ? window.localStorage.getItem("pcs_meal_summary_signature") || undefined
        : undefined;

    const text = formatMealSummaryText(
      {
        period:
          date === effectiveToday
            ? "today"
            : date === effectiveTomorrow
            ? "tomorrow"
            : "custom",
        today: effectiveToday,
        tomorrow: effectiveTomorrow,
        startDate: date,
        endDate: date,
        organizationName,
        totalMeals: activeRows.reduce((s, r) => s + r.quantity, 0),
        totalGuestsWithMeals: activeRows.length,
        totalAmountPoisha: activeRows.reduce((s, r) => s + r.totalPoisha, 0),
        guests: activeRows.map((r) => ({
          userId: r.userId,
          name: r.guestName,
          email: r.guestEmail,
          totalMeals: r.quantity,
          totalAmountPoisha: r.totalPoisha,
          daysCount: 1,
        })),
        dailyBreakdown: [],
      },
      storedSig ? { signature: storedSig } : undefined
    );

    try {
      await copyTextToClipboard(text);
      setCopiedSummary(true);
      toast.success("Meal summary copied to clipboard");
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy summary");
    }
  }

  return (
    <div className="space-y-4">
      <VendorShareLinkCard />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Daily Meal Confirmations</h2>
          <p className="text-sm text-slate-500">
            Manually preview and send daily meal confirmation emails via Resend.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="conf-date">Meal Date</Label>
            <Input
              id="conf-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-44"
            />
          </div>
          <div>
            <Label htmlFor="conf-note">Optional Note</Label>
            <Input
              id="conf-note"
              placeholder="e.g. Special biryani menu"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-56"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleCopySummary}
          >
            {copiedSummary ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy Summary
              </>
            )}
          </Button>
          <Button
            variant="outline"
            disabled={selectedIds.length === 0}
            onClick={() => openPreview(selectedIds)}
          >
            <Eye className="h-4 w-4" /> Preview Selected ({selectedIds.length})
          </Button>
          <Button
            disabled={selectedIds.length === 0}
            onClick={() => openPreview(selectedIds)}
          >
            <Send className="h-4 w-4" /> Send Confirmation Emails ({selectedIds.length})
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Guest Meals for {date}</CardTitle>
            <CardDescription>
              {activeRows.length} guest(s) with confirmed meals •{" "}
              {activeRows.reduce((s, r) => s + r.quantity, 0)} total meals
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(activeRows.map((r) => r.userId))}
            >
              Select Active
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading meal records..." />
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No meal records found for this date.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead className="text-right">Meals</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Email Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.userId)}
                        onChange={() => toggleGuest(r.userId)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{r.guestName}</p>
                      <p className="text-xs text-slate-500">{r.guestEmail}</p>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.quantity === 0 ? "0 (OFF)" : r.quantity}
                    </TableCell>
                    <TableCell className="text-right">{formatBDT(r.unitPricePoisha)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBDT(r.totalPoisha)}
                    </TableCell>
                    <TableCell>
                      {r.confirmationEmailSentAt ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" /> Sent on{" "}
                          {new Date(r.confirmationEmailSentAt).toLocaleString()}
                        </Badge>
                      ) : (
                        <Badge variant="muted">Not sent</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.confirmationEmailSentAt ? "outline" : "default"}
                        onClick={() => openPreview([r.userId])}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {r.confirmationEmailSentAt ? "Send Again" : "Send Confirmation"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EmailPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={previewData}
        loading={previewLoading}
        sending={sending}
        onConfirmSend={handleConfirmSend}
      />
    </div>
  );
}
