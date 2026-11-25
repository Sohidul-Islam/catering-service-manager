"use client";

import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";

interface ProfileUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  mealPreference: string;
  defaultMealQty: number;
  status: string;
}

export default function GuestProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error("Failed to load profile");
        setUser(json.user);
        setName(json.user.name);
        setPhone(json.user.phone || "");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: phone || null,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setUser(json.user);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Profile</h2>
        <p className="text-sm text-slate-500">Manage your contact details and password.</p>
      </div>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="info">Preference: {user.mealPreference}</Badge>
              <Badge variant="default">Default Qty: {user.defaultMealQty}</Badge>
              <Badge variant="success">Status: {user.status}</Badge>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label htmlFor="gp-name">Full Name</Label>
                <Input
                  id="gp-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gp-phone">Phone</Label>
                <Input
                  id="gp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600">Change Password (optional)</p>
                <div>
                  <Label htmlFor="gp-cur">Current Password</Label>
                  <PasswordInput
                    id="gp-cur"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="gp-new">New Password</Label>
                  <PasswordInput
                    id="gp-new"
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
