import React from "react";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, UtensilsCrossed } from "lucide-react";
import { PrintInvoiceButton } from "@/components/invoice/PrintInvoiceButton";
import { getPublicInvoiceByToken } from "@/services/public-invoice.service";
import { formatBDT } from "@/lib/money";
import { formatReadableDate } from "@/lib/timezone";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await getPublicInvoiceByToken(token);

  if (!invoice) {
    notFound();
  }

  const billingPeriod = new Date(invoice.year, invoice.month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const generatedDate = new Date(invoice.generatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:py-12 print:bg-white print:py-0 print:px-0">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden print:border-0 print:shadow-none">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-6 sm:px-8 text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-300">
                Office Meal Management
              </p>
              <h1 className="text-xl font-bold">Invoice #{invoice.invoiceNumber}</h1>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-slate-200">{billingPeriod}</p>
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  invoice.status === "PAID"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                    : invoice.status === "PARTIALLY_PAID"
                    ? "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                    : "bg-red-500/20 text-red-200 border border-red-400/30"
                }`}
              >
                {invoice.status === "PAID" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {invoice.status.replace("_", " ")}
              </span>
            </div>
            <PrintInvoiceButton />
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Billed To & Meta */}
          <div className="flex flex-wrap justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Billed To
              </p>
              <p className="mt-1 text-base font-bold text-slate-900">{invoice.guest.name}</p>
              <p className="text-sm text-slate-500">{invoice.guest.email}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Generated On
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">{generatedDate}</p>
              {invoice.participationStart && invoice.participationEnd && (
                <p className="mt-1 text-xs text-slate-500">
                  Meal Participation: {formatReadableDate(invoice.participationStart)} –{" "}
                  {formatReadableDate(invoice.participationEnd)}
                </p>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs text-slate-500">Total Meals</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{invoice.totalMeals}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs text-slate-500">Total Amount</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatBDT(invoice.totalAmountPoisha)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
              <p className="text-xs text-emerald-700">Paid</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatBDT(invoice.paidAmountPoisha)}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5">
              <p className="text-xs text-red-700">Due</p>
              <p className="mt-1 text-xl font-bold text-red-600">
                {formatBDT(invoice.outstandingPoisha)}
              </p>
            </div>
          </div>

          {/* Meal Details Table */}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2.5">Meal Details</h2>
            {invoice.items.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No meals billed for this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-right">Meal Qty</th>
                      <th className="px-4 py-2.5 text-right">Unit Price</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5 text-right">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items.map((item) => (
                      <tr key={item.date}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {formatReadableDate(item.date)}
                        </td>
                        <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right">
                          {formatBDT(item.unitPricePoisha)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                          {formatBDT(item.totalAmountPoisha)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.isPaid
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {item.isPaid ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment History */}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2.5">Payment History</h2>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-slate-500 py-3 rounded-xl border border-slate-200 bg-slate-50 px-4">
                No payments recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Payment Date</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5 text-left">Method</th>
                      <th className="px-4 py-2.5 text-left">Reference</th>
                      <th className="px-4 py-2.5 text-left">Allocated Dates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.payments.map((p, idx) => (
                      <tr key={`${p.paidAt}-${idx}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {new Date(p.paidAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                          {formatBDT(p.amountPoisha)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {p.method.replace("_", " ")}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{p.reference || "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {p.allocatedDates.length > 0
                            ? p.allocatedDates.join(", ")
                            : "Invoice Balance"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totals Footer */}
          <div className="flex flex-col items-end border-t border-slate-200 pt-4 space-y-1 text-sm">
            <div className="flex justify-between w-56">
              <span className="text-slate-500">Total Amount:</span>
              <span className="font-semibold text-slate-900">
                {formatBDT(invoice.totalAmountPoisha)}
              </span>
            </div>
            <div className="flex justify-between w-56">
              <span className="text-slate-500">Total Paid:</span>
              <span className="font-semibold text-emerald-700">
                {formatBDT(invoice.paidAmountPoisha)}
              </span>
            </div>
            <div className="flex justify-between w-56 border-t border-slate-200 pt-1.5 text-base">
              <span className="font-bold text-slate-900">Outstanding:</span>
              <span className="font-bold text-red-600">
                {formatBDT(invoice.outstandingPoisha)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
