"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_HINT,
  validatePasswordStrength,
} from "@/lib/password-validation";
import { toast } from "sonner";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [verifying, setVerifying] = useState(() => Boolean(token));
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const effectiveTokenError = !token ? "Missing password reset token." : tokenError;
  const isVerifying = Boolean(token) && verifying;

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;
    fetch(`/api/auth/reset-password/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.valid) {
          throw new Error(json.error || "Invalid or expired password reset link.");
        }
        if (active) {
          setMaskedEmail(json.maskedEmail ?? null);
          setTokenError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setTokenError(
            err instanceof Error ? err.message : "Invalid or expired password reset link."
          );
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setFormError(strengthError);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reset password");
      }
      setCompleted(true);
      toast.success("Password reset successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reset password";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Reset Password</CardTitle>
        <CardDescription>
          {maskedEmail
            ? `Choose a new password for ${maskedEmail}`
            : "Set a new password for your account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isVerifying ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            Verifying password reset link...
          </p>
        ) : effectiveTokenError ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <span>{effectiveTokenError}</span>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/forgot-password">
                <Button className="w-full">Request a New Reset Link</Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </Button>
            </div>
          </div>
        ) : completed ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-1.5">
              <p className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                Password Updated
              </p>
              <p className="text-xs text-emerald-800">
                Your password has been reset successfully. You can now sign in using your new
                password.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.push("/login")}>
              Sign In with New Password
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}
            <div>
              <Label htmlFor="rp-password">New Password</Label>
              <PasswordInput
                id="rp-password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Enter new password"
                className="mt-1"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-slate-500">{PASSWORD_REQUIREMENTS_HINT}</p>
            </div>
            <div>
              <Label htmlFor="rp-confirm">Confirm New Password</Label>
              <PasswordInput
                id="rp-confirm"
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Re-enter new password"
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <KeyRound className="h-4 w-4" />
              {submitting ? "Updating Password..." : "Reset Password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
