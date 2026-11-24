import { redirect } from "next/navigation";
import { getCurrentUser } from "@/services/auth.service";
import { AppShell } from "@/components/layout/AppShell";
import { UserRole } from "@prisma/client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
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
    >
      {children}
    </AppShell>
  );
}
