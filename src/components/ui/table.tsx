import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-slate-200 bg-slate-50/70", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-slate-100", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-slate-50/70 transition-colors", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-500",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle text-slate-700", className)} {...props} />;
}

export interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  disabled?: boolean;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: TablePaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  const pageItems: (number | "ellipsis")[] = [];
  if (totalPages <= 7) {
    for (let p = 1; p <= totalPages; p++) {
      pageItems.push(p);
    }
  } else {
    pageItems.push(1);
    if (safePage > 3) {
      pageItems.push("ellipsis");
    }
    const rangeStart = Math.max(2, safePage - 1);
    const rangeEnd = Math.min(totalPages - 1, safePage + 1);
    for (let p = rangeStart; p <= rangeEnd; p++) {
      pageItems.push(p);
    }
    if (safePage < totalPages - 2) {
      pageItems.push("ellipsis");
    }
    pageItems.push(totalPages);
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        Showing {start}–{end} of {total}
        {totalPages > 1 ? ` • Page ${safePage} of ${totalPages}` : ""}
      </p>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          {pageItems.map((item, idx) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-2 text-xs text-slate-400 select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                type="button"
                variant={item === safePage ? "default" : "outline"}
                size="sm"
                className="min-w-8 px-2"
                disabled={disabled}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            )
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
