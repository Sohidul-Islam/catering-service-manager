"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Calendar,
  CalendarOff,
  Clock,
  CreditCard,
  Download,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  Settings,
  Smartphone,
  Tag,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidateCalendarCache } from "@/lib/calendar-cache";
import { invalidateDashboardCache } from "@/lib/dashboard-cache";
import { PageLoader } from "@/components/ui/loading-state";
import { toast } from "sonner";

export interface NavUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "GUEST";
}

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Meal Calendar", icon: Calendar },
  { href: "/admin/confirmations", label: "Meal Confirmations", icon: MailCheck },
  { href: "/admin/guests", label: "Guests", icon: Users },
  { href: "/admin/adjustment-requests", label: "Adjustment Requests", icon: Clock },
  { href: "/admin/invoices", label: "Invoices & Billing", icon: FileText },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/holidays", label: "Holidays", icon: CalendarOff },
  { href: "/admin/pricing", label: "Meal Pricing", icon: Tag },
  { href: "/admin/email-logs", label: "Email Logs", icon: Mail },
  { href: "/admin/activity-logs", label: "Activity Logs", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const GUEST_NAV = [
  { href: "/guest/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/guest/calendar", label: "My Meal Calendar", icon: Calendar },
  { href: "/guest/invoices", label: "My Invoices", icon: FileText },
  { href: "/guest/payments", label: "My Payments", icon: CreditCard },
  { href: "/guest/activity", label: "My Activity", icon: Activity },
  { href: "/guest/profile", label: "Profile", icon: UserIcon },
];

export function AppShell({
  user,
  cutoffLabel = "Lunch Only • Asia/Dhaka (11:50 PM Cutoff)",
  children,
}: {
  user: NavUser;
  cutoffLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingAdjustmentCount, setPendingAdjustmentCount] = useState(0);

  const loadPendingAdjustmentCount = useCallback(async () => {
    if (user.role !== "ADMIN") return;
    try {
      const res = await fetch("/api/adjustment-requests?countOnly=true");
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.pendingCount === "number") {
        setPendingAdjustmentCount(json.pendingCount);
      }
    } catch {
      // Ignore transient count fetch errors
    }
  }, [user.role]);

  useEffect(() => {
    void loadPendingAdjustmentCount();
  }, [loadPendingAdjustmentCount, pathname]);

  useEffect(() => {
    if (user.role !== "ADMIN") return;
    const handleUpdate = () => {
      void loadPendingAdjustmentCount();
    };
    window.addEventListener("adjustment-requests-updated", handleUpdate);
    return () => window.removeEventListener("adjustment-requests-updated", handleUpdate);
  }, [user.role, loadPendingAdjustmentCount]);

  const navItems = user.role === "ADMIN" ? ADMIN_NAV : GUEST_NAV;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    invalidateCalendarCache();
    invalidateDashboardCache();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-slate-100">
        <img
          src="/logo.jpg"
          alt="Office Meal Manager"
          className="h-9 w-9 rounded-xl object-contain bg-white border border-slate-200 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">Office Meal</p>
          <p className="text-[11px] font-medium text-slate-500">
            {user.role === "ADMIN" ? "Admin Portal" : "Guest Portal"}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-blue-600" : "text-slate-400")} />
              <span className="truncate">{item.label}</span>
              {item.href === "/admin/adjustment-requests" && pendingAdjustmentCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {pendingAdjustmentCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3 space-y-1.5">
        <a
          href="https://drive.google.com/file/d/1Toq8XOotWQ0B3gpgZwQqu7vqs5V-JgNq/view?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100/80 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 shrink-0" />
            Download Android App
          </span>
          <Download className="h-3.5 w-3.5 shrink-0" />
        </a>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
          <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[80vw] h-full">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-20 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-800">
              {navItems.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
                ?.label ?? "Office Meal Management"}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden sm:inline">{cutoffLabel}</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          <Suspense fallback={<PageLoader label="Loading page..." />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
