"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const normalized = email.trim();
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Unable to send reset link");
      }
      setSubmittedEmail(normalized);
      setSubmitted(true);
      toast.success("Reset link request submitted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request password reset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <img
            src="/logo.jpg"
            alt="Office Meal Manager"
            className="h-16 w-16 rounded-2xl object-contain bg-white p-1 shadow-sm border border-slate-200"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Office Meal Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">Reset your account password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>
              Enter your registered email address and we will send you a password reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    Check your email
                  </p>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    If an active account exists for{" "}
                    <span className="font-semibold">{submittedEmail}</span>, we have sent a
                    password reset link. The link expires in 60 minutes. Please also check your
                    spam folder if you don&apos;t see it.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link href="/login">
                    <Button className="w-full">
                      <ArrowLeft className="h-4 w-4" /> Back to Sign In
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                    }}
                  >
                    Try another email
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="fp-email">Email Address</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@office.com"
                    className="mt-1"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  <Mail className="h-4 w-4" />
                  {submitting ? "Sending Reset Link..." : "Send Reset Link"}
                </Button>
                <div className="text-center pt-1">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
