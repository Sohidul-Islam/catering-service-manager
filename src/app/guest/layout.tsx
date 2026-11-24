import { redirect } from "next/navigation";
import { getCurrentUser } from "@/services/auth.service";
import { AppShell } from "@/components/layout/AppShell";
import { UserRole } from "@prisma/client";

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== UserRole.GUEST) {
    redirect("/admin/dashboard");
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: "GUEST",
      }}
    >
      {children}
    </AppShell>
  );
}
