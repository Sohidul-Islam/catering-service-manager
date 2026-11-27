"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  dividerBefore?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

const MENU_WIDTH = 224;
const MENU_ITEM_ESTIMATED_HEIGHT = 36;
const MENU_PADDING = 16;

export function ActionMenu({
  items,
  label = "Open actions",
  align = "right",
}: {
  items: ActionMenuItem[];
  label?: string;
  align?: "left" | "right";
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const computePosition = useCallback((): MenuPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = items.length * MENU_ITEM_ESTIMATED_HEIGHT + MENU_PADDING;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    const rawLeft =
      align === "right" ? rect.right - MENU_WIDTH : rect.left;
    const clampedLeft = Math.max(
      8,
      Math.min(rawLeft, window.innerWidth - MENU_WIDTH - 8)
    );

    const top = openUpward
      ? Math.max(8, rect.top - 6)
      : Math.min(window.innerHeight - 8, rect.bottom + 6);

    return { top, left: clampedLeft, openUpward };
  }, [align, items.length]);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    const nextPos = computePosition();
    if (nextPos) {
      setPosition(nextPos);
      setOpen(true);
    }
  }, [computePosition, open]);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleCloseOnViewportChange() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleCloseOnViewportChange);
    window.addEventListener("scroll", handleCloseOnViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleCloseOnViewportChange);
      window.removeEventListener("scroll", handleCloseOnViewportChange, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  const menuContent =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
              transform: position.openUpward ? "translateY(-100%)" : undefined,
            }}
            className="z-50 rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-xs p-1.5 shadow-lg ring-1 ring-slate-900/5"
          >
            {items.map((item) => {
              const itemClass = cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                item.variant === "danger"
                  ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              );

              const inner = (
                <>
                  {item.icon && (
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                        item.variant === "danger"
                          ? "text-red-500"
                          : "text-slate-500"
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.description && (
                      <span className="block truncate text-[10px] font-normal text-slate-400">
                        {item.description}
                      </span>
                    )}
                  </span>
                </>
              );

              return (
                <React.Fragment key={item.key}>
                  {item.dividerBefore && (
                    <div className="my-1 border-t border-slate-100" role="separator" />
                  )}
                  {item.href ? (
                    <Link
                      href={item.href}
                      role="menuitem"
                      className={itemClass}
                      onClick={() => setOpen(false)}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      className={itemClass}
                      onClick={() => {
                        setOpen(false);
                        item.onClick?.();
                      }}
                    >
                      {inner}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="inline-flex justify-end">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={handleToggle}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer",
          open
            ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menuContent}
    </div>
  );
}
