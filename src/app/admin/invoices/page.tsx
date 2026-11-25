"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FilePlus2,
  Link2,
  Mail,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailPreviewData, EmailPreviewModal } from "@/components/email/EmailPreviewModal";
import { formatBDT } from "@/lib/money";
import { invalidateDashboardCache } from "@/lib/dashboard-cache";
import { toast } from "sonner";

interface InvoiceItemRow {
  id: string;
  date: string;
  quantity: number;
  unitPricePoisha: number;
  totalAmountPoisha: number;
  paidAmountPoisha: number;
  isPaid: boolean;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  year: number;
  month: number;
  totalMeals: number;
  totalAmountPoisha: number;
  paidAmountPoisha: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  generatedAt: string;
  user: { id: string; name: string; email: string };
  items: InvoiceItemRow[];
  publicTokens?: { token: string; createdAt: string }[];
  emailLogs?: { sentAt: string | null; recipientEmail: string }[];
}

export default function AdminInvoicesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Email preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);

  async function loadInvoices() {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices?year=${year}&month=${month}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load invoices");
      setInvoices(json.invoices);
      if (selectedInvoice) {
        const refreshed = (json.invoices as InvoiceRow[]).find(
          (i) => i.id === selectedInvoice.id
        );
        if (refreshed) setSelectedInvoice(refreshed);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [year, month]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate invoices");
      toast.success(`Generated/updated ${json.count} invoice(s)`);
      setConfirmGenerateOpen(false);
      invalidateDashboardCache();
      loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteInvoice() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete invoice");
      toast.success(`Invoice ${deleteTarget.invoiceNumber} deleted`);
      if (selectedInvoice?.id === deleteTarget.id) {
        setSelectedInvoice(null);
      }
      setDeleteTarget(null);
      invalidateDashboardCache();
      await loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setDeleting(false);
    }
  }

  async function handlePublicLink(
    invoiceId: string,
    action: "generate" | "revoke" | "regenerate"
  ) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/public-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Public link operation failed");

      if (action === "revoke") {
        toast.success("Public link revoked");
      } else {
        await navigator.clipboard?.writeText(json.publicUrl);
        toast.success(
          action === "regenerate"
            ? "Public link regenerated & copied to clipboard"
            : "Public link generated & copied to clipboard"
        );
      }
      await loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function openInvoiceEmailPreview(invoiceId: string) {
    setEmailInvoiceId(invoiceId);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/emails/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: "INVOICE", invoiceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to preview email");
      setPreviewData(json.preview);
      await loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendInvoiceEmail() {
    if (!emailInvoiceId) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: "INVOICE", invoiceId: emailInvoiceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send invoice email");
      toast.success("Invoice email sent via Resend");
      setPreviewOpen(false);
      await loadInvoices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email send failed");
    } finally {
      setSendingEmail(false);
    }
  }

  function getPublicUrl(inv: InvoiceRow): string | null {
    const tok = inv.publicTokens?.[0]?.token;
    if (!tok) return null;
    if (typeof window === "undefined") return `/invoice/${tok}`;
    return `${window.location.origin}/invoice/${tok}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Monthly Invoices & Billing</h2>
          <p className="text-sm text-slate-500">
            Generate invoices separately from sending emails, and manage secure public invoice links.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-36"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2026, m - 1).toLocaleDateString("en-US", { month: "long" })}
              </option>
            ))}
          </Select>
          <Select
            className="w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Button onClick={() => setConfirmGenerateOpen(true)} disabled={generating}>
            <FilePlus2 className="h-4 w-4" />
            {generating ? "Generating..." : "Generate Invoices"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices ({invoices.length})</CardTitle>
          <CardDescription>
            Generate public share links or manually preview and send invoice emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No invoices for this month yet. Click &ldquo;Generate Invoices&rdquo; above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead className="text-right">Meals</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const balance = Math.max(0, inv.totalAmountPoisha - inv.paidAmountPoisha);
                  const lastSent = inv.emailLogs?.[0]?.sentAt ?? null;
                  const pubUrl = getPublicUrl(inv);

                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{inv.user.name}</p>
                        <p className="text-xs text-slate-500">{inv.user.email}</p>
                      </TableCell>
                      <TableCell className="text-right">{inv.totalMeals}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBDT(inv.totalAmountPoisha)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {formatBDT(balance)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "PAID"
                              ? "success"
                              : inv.status === "PARTIALLY_PAID"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {inv.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {lastSent ? (
                          <Badge variant="success" className="text-[11px]">
                            <CheckCircle2 className="h-3 w-3" /> Sent{" "}
                            {new Date(lastSent).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <Badge variant="muted" className="text-[11px]">
                            Not sent
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                          {pubUrl ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard?.writeText(pubUrl);
                                toast.success("Public link copied");
                              }}
                              title="Copy Public Link"
                            >
                              <Copy className="h-3.5 w-3.5" /> Link
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePublicLink(inv.id, "generate")}
                            >
                              <Link2 className="h-3.5 w-3.5" /> Public Link
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={lastSent ? "outline" : "default"}
                            onClick={() => openInvoiceEmailPreview(inv.id)}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {lastSent ? "Send Again" : "Send Email"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedInvoice(inv)}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTarget(inv)}
                            title="Delete Invoice"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Breakdown & Public Link Management Modal */}
      <Dialog
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice ? `Invoice ${selectedInvoice.invoiceNumber}` : ""}
        description={
          selectedInvoice
            ? `${selectedInvoice.user.name} • Billing ${selectedInvoice.year}-${String(
                selectedInvoice.month
              ).padStart(2, "0")}`
            : ""
        }
        maxWidthClass="max-w-2xl"
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 border border-slate-200 text-sm">
              <div>
                <p className="text-xs text-slate-500">Total Bill</p>
                <p className="font-bold text-slate-900">
                  {formatBDT(selectedInvoice.totalAmountPoisha)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Amount Paid</p>
                <p className="font-bold text-emerald-700">
                  {formatBDT(selectedInvoice.paidAmountPoisha)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="font-bold text-red-600">
                  {formatBDT(
                    Math.max(0, selectedInvoice.totalAmountPoisha - selectedInvoice.paidAmountPoisha)
                  )}
                </p>
              </div>
            </div>

            {/* Public Link Controls */}
            {(() => {
              const pubUrl = getPublicUrl(selectedInvoice);
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Public Invoice Link</p>
                  {pubUrl ? (
                    <>
                      <p className="text-xs font-mono break-all bg-white p-2 rounded border border-slate-200 text-slate-700">
                        {pubUrl}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard?.writeText(pubUrl);
                            toast.success("Public link copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy Link
                        </Button>
                        <a href={pubUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePublicLink(selectedInvoice.id, "regenerate")}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handlePublicLink(selectedInvoice.id, "revoke")}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Revoke
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">No active public link</span>
                      <Button
                        size="sm"
                        onClick={() => handlePublicLink(selectedInvoice.id, "generate")}
                      >
                        <Link2 className="h-3.5 w-3.5" /> Generate Public Link
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Date Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoice.items
                  .filter((item) => item.quantity > 0)
                  .map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.date}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatBDT(item.unitPricePoisha)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBDT(item.totalAmountPoisha)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isPaid ? "success" : "muted"}>
                          {item.isPaid ? "Paid" : "Unpaid"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteTarget(selectedInvoice)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Invoice
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteInvoice}
        title="Delete Invoice"
        description={
          deleteTarget
            ? `Delete invoice ${deleteTarget.invoiceNumber} for ${deleteTarget.user.name} (${deleteTarget.year}-${String(
                deleteTarget.month
              ).padStart(2, "0")}, Total: ${formatBDT(deleteTarget.totalAmountPoisha)})?${
                deleteTarget.paidAmountPoisha > 0
                  ? ` Warning: This will also permanently delete recorded payment(s) totaling ${formatBDT(
                      deleteTarget.paidAmountPoisha
                    )}.`
                  : ""
              } Underlying meal records in the calendar are preserved and can be re-invoiced later.`
            : ""
        }
        confirmLabel="Delete Invoice"
        variant="destructive"
        loading={deleting}
      />

      <ConfirmDialog
        open={confirmGenerateOpen}
        onClose={() => setConfirmGenerateOpen(false)}
        onConfirm={handleGenerate}
        title="Generate Monthly Invoices"
        description={`Generate or recalculate invoices for ${new Date(year, month - 1).toLocaleDateString(
          "en-US",
          { month: "long", year: "numeric" }
        )}? This will finalize the month's meal records and lock their historical prices without automatically sending emails.`}
        confirmLabel="Generate Invoices"
        loading={generating}
      />

      <EmailPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={previewData}
        loading={previewLoading}
        sending={sendingEmail}
        onConfirmSend={handleSendInvoiceEmail}
      />
    </div>
  );
}
