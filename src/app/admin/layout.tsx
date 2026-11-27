import { redirect } from "next/navigation";
import { getCurrentUser } from "@/services/auth.service";
import { getSettings } from "@/services/schedule.service";
import { AppShell } from "@/components/layout/AppShell";
import { UserRole } from "@prisma/client";

function formatCutoffLabel(timezone: string, hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const minStr = String(minute).padStart(2, "0");
  return `Lunch Only • ${timezone} (${h12}:${minStr} ${period} Cutoff)`;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  if (!user) {
    redirect("/login");
  }
  if (user.role !== UserRole.ADMIN) {
    redirect("/guest/dashboard");
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: "ADMIN",
      }}
      cutoffLabel={formatCutoffLabel(
        settings.timezone,
        settings.deadlineHour,
        settings.deadlineMinute
      )}
    >
      {children}
    </AppShell>
  );
}
