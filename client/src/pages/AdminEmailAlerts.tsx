import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BellOff, Mail, Plus, X, Send, RefreshCw,
  CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";

interface AlertSub {
  id: number;
  alertType: string;
  name: string;
  description: string | null;
  enabled: boolean;
  emails: string[];
  updatedAt: string;
}

function EmailChip({
  email,
  onRemove,
  disabled,
}: {
  email: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
      <Mail className="w-3 h-3" />
      {email}
      {!disabled && (
        <button
          onClick={onRemove}
          className="ml-0.5 hover:text-red-500 transition-colors"
          data-testid={`button-remove-email-${email}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function AlertCard({ sub }: { sub: AlertSub }) {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Pick<AlertSub, "enabled" | "emails">>) =>
      apiRequest("PATCH", `/api/admin/alert-subscriptions/${sub.id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-subscriptions"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      toast({ title: "Invalid email address", variant: "destructive" });
      return;
    }
    if (sub.emails.includes(email)) {
      toast({ title: "Email already in list", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ emails: [...sub.emails, email] });
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    updateMutation.mutate({ emails: sub.emails.filter(e => e !== email) });
  };

  const handleTest = async () => {
    if (sub.emails.length === 0) {
      toast({ title: "No emails configured", description: "Add at least one email before testing.", variant: "destructive" });
      return;
    }
    setIsTesting(true);
    try {
      const res = await apiRequest("POST", `/api/admin/alert-subscriptions/${sub.id}/test`);
      toast({ title: "Test sent!", description: (res as any).message });
    } catch (err: any) {
      toast({ title: "Test failed", description: err?.message ?? "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  const isUpdating = updateMutation.isPending;

  return (
    <div
      className={`rounded-xl border transition-all ${
        sub.enabled
          ? "border-border bg-card"
          : "border-border/50 bg-muted/30 opacity-75"
      }`}
      data-testid={`alert-card-${sub.alertType}`}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {sub.enabled ? (
                <Bell className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <h3 className="font-bold text-sm leading-snug">{sub.name}</h3>
              <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                {sub.alertType}
              </span>
            </div>
            {sub.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{sub.description}</p>
            )}
          </div>

          {/* Enable toggle */}
          <button
            onClick={() => updateMutation.mutate({ enabled: !sub.enabled })}
            disabled={isUpdating}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none ${
              sub.enabled ? "bg-primary" : "bg-muted-foreground/25"
            } ${isUpdating ? "opacity-50" : ""}`}
            data-testid={`toggle-alert-${sub.alertType}`}
            title={sub.enabled ? "Disable alert" : "Enable alert"}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                sub.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Email chips */}
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Recipients
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {sub.emails.length === 0 ? (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />No recipients configured
              </span>
            ) : (
              sub.emails.map(email => (
                <EmailChip
                  key={email}
                  email={email}
                  onRemove={() => removeEmail(email)}
                  disabled={isUpdating}
                />
              ))
            )}
            {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Add email row */}
        <div className="flex gap-2 mb-3">
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addEmail()}
            placeholder="Add email address…"
            type="email"
            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            data-testid={`input-add-email-${sub.alertType}`}
          />
          <button
            onClick={addEmail}
            disabled={!newEmail.trim() || isUpdating}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            data-testid={`button-add-email-${sub.alertType}`}
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
          <span className="text-[11px] text-muted-foreground">
            Last updated: {new Date(sub.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <button
            onClick={handleTest}
            disabled={isTesting || sub.emails.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-all disabled:opacity-50"
            data-testid={`button-test-alert-${sub.alertType}`}
          >
            {isTesting ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Send Test
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminEmailAlerts() {
  const { data, isLoading, isError, refetch } = useQuery<AlertSub[]>({
    queryKey: ["/api/admin/alert-subscriptions"],
    staleTime: 30_000,
  });

  const enabledCount = data?.filter(s => s.enabled).length ?? 0;
  const totalCount = data?.length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-amber-500" />
        <p className="text-sm font-semibold">Failed to load alert subscriptions</p>
        <button onClick={() => refetch()} className="mt-2 text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            Email Alert Subscriptions
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabledCount} of {totalCount} alert{totalCount !== 1 ? "s" : ""} active · Emails delivered via Resend
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {enabledCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              {enabledCount} active
            </span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4">
        {data?.map(sub => (
          <AlertCard key={sub.id} sub={sub} />
        ))}
        {data?.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No alert subscriptions configured.
          </div>
        )}
      </div>
    </div>
  );
}
