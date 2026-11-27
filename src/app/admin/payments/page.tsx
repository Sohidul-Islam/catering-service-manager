"use client";

import React, { useEffect, useState } from "react";
import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmailPreviewData, EmailPreviewModal } from "@/components/email/EmailPreviewModal";
import { formatBDT, poishaToBdt } from "@/lib/money";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-state";

interface PaymentRow {
  id: string;
  amountPoisha: number;
  method: "CASH" | "BANK_TRANSFER" | "OTHER";
  paymentType: "FULL" | "PARTIAL" | "SELECTED_DATES";
  reference: string | null;
  note: string | null;
  paidAt: string;
  user: { id: string; name: string; email: string };
  invoice: { id: string; invoiceNumber: string; year: number; month: number };
  allocations: {
    id: string;
    amountPoisha: number;
    invoiceItem: { id: string; date: string } | null;
  }[];
}

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string;
  year: number;
  month: number;
  totalAmountPoisha: number;
  paidAmountPoisha: number;
  status: string;
  user: { id: string; name: string; email: string };
  items: {
    id: string;
    date: string;
    quantity: number;
    totalAmountPoisha: number;
    paidAmountPoisha: number;
    isPaid: boolean;
  }[];
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<UnpaidInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Payment form
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "SELECTED_DATES">("FULL");
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [amountBdt, setAmountBdt] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Payment confirmation email preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewData | null>(null);
  const [emailPaymentId, setEmailPaymentId] = useState<string | null>(null);

  async function openReceiptPreview(paymentId: string) {
    setEmailPaymentId(paymentId);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/emails/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: "PAYMENT_CONFIRMATION", paymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Preview failed");
      setPreviewData(json.preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendReceipt() {
    if (!emailPaymentId) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: "PAYMENT_CONFIRMATION", paymentId: emailPaymentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send failed");
      toast.success("Payment confirmation email sent via Resend");
      setPreviewOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email send failed");
    } finally {
      setSendingEmail(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [payRes, invRes] = await Promise.all([
        fetch("/api/payments"),
        fetch("/api/invoices"),
      ]);
      const payJson = await payRes.json();
      const invJson = await invRes.json();
      if (!payRes.ok) throw new Error(payJson.error || "Failed to load payments");
      if (!invRes.ok) throw new Error(invJson.error || "Failed to load invoices");

      setPayments(payJson.payments);
      const openInvoices = (invJson.invoices as UnpaidInvoice[]).filter(
        (i) => i.totalAmountPoisha - i.paidAmountPoisha > 0
      );
      setInvoices(openInvoices);
      if (openInvoices.length > 0 && !selectedInvoiceId) {
        setSelectedInvoiceId(openInvoices[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const currentInvoice = invoices.find((i) => i.id === selectedInvoiceId) ?? null;
  const outstandingPoisha = currentInvoice
    ? Math.max(0, currentInvoice.totalAmountPoisha - currentInvoice.paidAmountPoisha)
    : 0;

  const unpaidItems = (currentInvoice?.items ?? []).filter(
    (item) => item.totalAmountPoisha - item.paidAmountPoisha > 0
  );

  const selectedDatesTotalPoisha = unpaidItems
    .filter((i) => selectedItemIds.includes(i.id))
    .reduce((s, i) => s + (i.totalAmountPoisha - i.paidAmountPoisha), 0);

  function toggleItem(id: string) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!currentInvoice) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        invoiceId: currentInvoice.id,
        paymentType,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      };
      if (paymentType === "PARTIAL") {
        payload.amountBdt = Number(amountBdt);
      } else if (paymentType === "SELECTED_DATES") {
        payload.invoiceItemIds = selectedItemIds;
      }

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to record payment");

      toast.success("Payment recorded & allocated");
      setModalOpen(false);
      setAmountBdt("");
      setSelectedItemIds([]);
      setReference("");
      setNote("");
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Payments & Allocations</h2>
          <p className="text-sm text-slate-500">
            Supports full monthly payments, partial payments, and selected-date payments.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={invoices.length === 0}>
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment History ({payments.length})</CardTitle>
          <CardDescription>Complete audit trail of all received payments and date allocations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} label="Loading payments..." />
          ) : payments.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Allocated Dates</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">
                      {new Date(p.paidAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{p.user.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <Badge variant="info">{p.paymentType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{p.method.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-xs">
                      {p.allocations
                        .map((a) => a.invoiceItem?.date)
                        .filter(Boolean)
                        .join(", ") || "Invoice Balance"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">
                      {formatBDT(p.amountPoisha)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReceiptPreview(p.id)}
                      >
                        <Mail className="h-3.5 w-3.5" /> Send Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Payment"
        description="Select an unpaid or partially paid invoice and choose how to allocate the payment."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <Label htmlFor="p-invoice">Invoice</Label>
            <Select
              id="p-invoice"
              value={selectedInvoiceId}
              onChange={(e) => {
                setSelectedInvoiceId(e.target.value);
                setSelectedItemIds([]);
              }}
              className="mt-1"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.user.name} (Due:{" "}
                  {formatBDT(inv.totalAmountPoisha - inv.paidAmountPoisha)})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-type">Payment Mode</Label>
              <Select
                id="p-type"
                value={paymentType}
                onChange={(e) =>
                  setPaymentType(e.target.value as "FULL" | "PARTIAL" | "SELECTED_DATES")
                }
                className="mt-1"
              >
                <option value="FULL">Full Payment ({formatBDT(outstandingPoisha)})</option>
                <option value="PARTIAL">Partial Amount</option>
                <option value="SELECTED_DATES">Selected Meal Dates</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-method">Payment Method</Label>
              <Select
                id="p-method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "OTHER")
                }
                className="mt-1"
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>

          {paymentType === "PARTIAL" && (
            <div>
              <Label htmlFor="p-amount">
                Amount (BDT) • Max {poishaToBdt(outstandingPoisha).toFixed(2)}
              </Label>
              <Input
                id="p-amount"
                type="number"
                step="0.01"
                min="1"
                max={poishaToBdt(outstandingPoisha)}
                required
                value={amountBdt}
                onChange={(e) => setAmountBdt(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {paymentType === "SELECTED_DATES" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Unpaid Meal Dates</Label>
                <span className="text-xs font-semibold text-blue-700">
                  Selected Total: {formatBDT(selectedDatesTotalPoisha)}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {unpaidItems.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No unpaid individual dates remaining.</p>
                ) : (
                  unpaidItems.map((item) => {
                    const rem = item.totalAmountPoisha - item.paidAmountPoisha;
                    const checked = selectedItemIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.id)}
                          />
                          <span className="font-medium text-slate-900">{item.date}</span>
                          <span className="text-slate-500">({item.quantity} meal)</span>
                        </span>
                        <span className="font-semibold text-slate-800">{formatBDT(rem)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-ref">Reference (optional)</Label>
              <Input
                id="p-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="TXN ID / Receipt #"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="p-note">Note (optional)</Label>
              <Textarea
                id="p-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-[38px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Recording..." : "Confirm Payment"}
            </Button>
          </div>
        </form>
      </Dialog>

      <EmailPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={previewData}
        loading={previewLoading}
        sending={sendingEmail}
        onConfirmSend={handleSendReceipt}
      />
    </div>
  );
}
