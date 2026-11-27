"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{
    name: string;
    email: string;
    phone: string | null;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token.");
      setLoading(false);
      return;
    }

    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid invitation");
        setInviteInfo(data.invitation);
        setPhone(data.invitation.phone ?? "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invalid invitation");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to activate account");
      toast.success("Account activated! Welcome aboard.");
      router.push("/guest/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Accept Invitation</CardTitle>
        <CardDescription>Set your password to activate your meal account</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500 py-4">Verifying invitation...</p>
        ) : error ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" onClick={() => router.push("/login")}>
              Go to Sign In
            </Button>
          </div>
        ) : inviteInfo ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-slate-900">{inviteInfo.name}</p>
              <p className="text-xs text-slate-500">{inviteInfo.email}</p>
            </div>
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteInfo.email}
                disabled
                className="mt-1 bg-slate-50"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number (optional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+88017..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="confirmPassword"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Activating..." : "Activate Account"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="flex items-center gap-2.5 mb-6">
        <img
          src="/logo.jpg"
          alt="Office Meal Manager"
          className="h-11 w-11 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shadow-xs"
        />
        <span className="text-lg font-bold text-slate-900">Office Meal Management</span>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
