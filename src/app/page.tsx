import { redirect } from "next/navigation";
import { getCurrentUser } from "@/services/auth.service";
import { UserRole } from "@prisma/client";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role === UserRole.ADMIN) {
    redirect("/admin/dashboard");
  }
  redirect("/guest/dashboard");
}
