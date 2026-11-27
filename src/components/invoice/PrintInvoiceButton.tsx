"use client";

import React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintInvoiceButton() {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="print:hidden bg-white text-slate-900 hover:bg-slate-100 border-white/20"
      onClick={() => window.print()}
    >
      <Printer className="h-3.5 w-3.5" /> Print / Save PDF
    </Button>
  );
}
