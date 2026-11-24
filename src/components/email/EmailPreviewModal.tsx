"use client";

import React from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export interface EmailPreviewData {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  text: string;
  html?: string;
  recipientCount?: number;
  extraNote?: string;
}

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  preview: EmailPreviewData | null;
  loading?: boolean;
  sending?: boolean;
  onConfirmSend: () => void;
}

export function EmailPreviewModal({
  open,
  onClose,
  preview,
  loading = false,
  sending = false,
  onConfirmSend,
}: EmailPreviewModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Email Preview"
      description={
        preview?.recipientCount && preview.recipientCount > 1
          ? `Review before manually sending to ${preview.recipientCount} selected guests`
          : "Review the generated email before sending via Resend"
      }
      maxWidthClass="max-w-xl"
    >
      {loading || !preview ? (
        <p className="text-sm text-slate-500 py-8 text-center">Generating email preview...</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 w-16 shrink-0">To:</span>
              <span className="text-slate-900 font-medium">
                {preview.recipientCount && preview.recipientCount > 1
                  ? `${preview.recipientCount} recipients (showing first: ${preview.recipientEmail})`
                  : preview.recipientEmail}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 w-16 shrink-0">Subject:</span>
              <span className="text-slate-900 font-semibold">{preview.subject}</span>
            </div>
          </div>

          {preview.extraNote && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
              {preview.extraNote}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
              <Mail className="h-3.5 w-3.5" /> Message Content
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
              {preview.text}
            </pre>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirmSend} disabled={sending}>
              <Send className="h-4 w-4" />
              {sending
                ? "Sending..."
                : preview.recipientCount && preview.recipientCount > 1
                ? `Send ${preview.recipientCount} Emails`
                : "Send Email"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
