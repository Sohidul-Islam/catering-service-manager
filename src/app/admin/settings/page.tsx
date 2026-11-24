"use client";

import React, { useEffect, useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { poishaToBdt } from "@/lib/money";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Dhaka");
  const [defaultMealPriceBdt, setDefaultMealPriceBdt] = useState("120");
  const [deadlineHour, setDeadlineHour] = useState("23");
  const [deadlineMinute, setDeadlineMinute] = useState("50");
  const [maxMealQty, setMaxMealQty] = useState("");
  const [weekendDays, setWeekendDays] = useState("6,0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin account credentials
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/settings"), fetch("/api/auth/me")])
      .then(async ([settingsRes, meRes]) => {
        const settingsJson = await settingsRes.json();
        if (!settingsRes.ok) throw new Error(settingsJson.error || "Failed to load settings");
        const s = settingsJson.settings;
        setOrganizationName(s.organizationName);
        setTimezone(s.timezone);
        setDefaultMealPriceBdt(String(poishaToBdt(s.defaultMealPricePoisha)));
        setDeadlineHour(String(s.deadlineHour));
        setDeadlineMinute(String(s.deadlineMinute));
        setMaxMealQty(s.maxMealQty != null ? String(s.maxMealQty) : "");
        setWeekendDays(s.weekendDays);

        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.user) {
            setAdminName(meJson.user.name);
            setAdminEmail(meJson.user.email);
          }
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          timezone,
          defaultMealPriceBdt: Number(defaultMealPriceBdt),
          deadlineHour: Number(deadlineHour),
          deadlineMinute: Number(deadlineMinute),
          maxMealQty: maxMealQty.trim() ? Number(maxMealQty) : null,
          weekendDays,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update settings");
      toast.success("Organization settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingAccount(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update admin credentials");
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Admin credentials updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingAccount(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Organization & Admin Settings</h2>
        <p className="text-sm text-slate-500">
          Configure timezone, confirmation deadline, default meal price, and your admin credentials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General & Meal Rules</CardTitle>
          <CardDescription>Default timezone is Asia/Dhaka with 23:50 previous-day cutoff</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-4">Loading settings...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="s-org">Organization Name</Label>
                <Input
                  id="s-org"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="s-tz">Timezone</Label>
                  <Input
                    id="s-tz"
                    required
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="s-price">Default Meal Price (BDT)</Label>
                  <Input
                    id="s-price"
                    type="number"
                    min={0}
                    required
                    value={defaultMealPriceBdt}
                    onChange={(e) => setDefaultMealPriceBdt(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="s-hour">Deadline Hour (0-23)</Label>
                  <Input
                    id="s-hour"
                    type="number"
                    min={0}
                    max={23}
                    required
                    value={deadlineHour}
                    onChange={(e) => setDeadlineHour(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="s-min">Deadline Minute (0-59)</Label>
                  <Input
                    id="s-min"
                    type="number"
                    min={0}
                    max={59}
                    required
                    value={deadlineMinute}
                    onChange={(e) => setDeadlineMinute(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="s-max">Max Meal Qty (optional)</Label>
                  <Input
                    id="s-max"
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={maxMealQty}
                    onChange={(e) => setMaxMealQty(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="s-weekends">Weekend Days (0=Sun .. 6=Sat, comma-separated)</Label>
                <Input
                  id="s-weekends"
                  required
                  value={weekendDays}
                  onChange={(e) => setWeekendDays(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Account &amp; Credentials</CardTitle>
          <CardDescription>
            Change your administrator name, sign-in email, and password
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 py-4">Loading account...</p>
          ) : (
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="a-name">Admin Name</Label>
                  <Input
                    id="a-name"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="a-email">Sign-in Email</Label>
                  <Input
                    id="a-email"
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <Label htmlFor="a-cur-pass">Current Password</Label>
                  <Input
                    id="a-cur-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Required to change password"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="a-new-pass">New Password (optional)</Label>
                  <Input
                    id="a-new-pass"
                    type="password"
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" variant="outline" disabled={savingAccount}>
                  <KeyRound className="h-4 w-4" />
                  {savingAccount ? "Updating..." : "Update Admin Credentials"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
