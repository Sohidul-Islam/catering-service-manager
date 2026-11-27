"use client";

import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function VendorShareLinkCard() {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");
  const [monthLabel, setMonthLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/vendor-link")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load vendor link");
        if (!active) return;
        setToken(json.token);
        setUrl(`${window.location.origin}/vendor-meals/${json.token}`);
        setMonthLabel(
          new Date(json.year, json.month - 1, 1).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })
        );
      })
      .catch((err) => {
        if (active) {
          toast.error(err instanceof Error ? err.message : "Failed to load vendor link");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/vendor-link", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to regenerate vendor link");
      setToken(json.token);
      const nextUrl = `${window.location.origin}/vendor-meals/${json.token}`;
      setUrl(nextUrl);
      await navigator.clipboard?.writeText(nextUrl);
      toast.success("New vendor link generated & copied!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    toast.success("Vendor meal link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-sm font-semibold text-slate-900">
              Vendor Shareable Meal Link
            </span>
            {monthLabel && <Badge variant="info">{monthLabel} Only</Badge>}
            {token && (
              <Badge variant="muted" className="font-mono">
                Token: {token}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600">
            Share this link with your meal vendor to view live Today, Tomorrow, and daily meal
            counts for the current month (no login or guest details exposed).
          </p>
          {!loading && url && (
            <p className="text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1 inline-block break-all">
              {url}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => void handleCopy()}
            disabled={loading || !url}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleRegenerate()}
            disabled={loading || regenerating}
            title="Revoke current token and create a new 6-character token"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            New Token
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
