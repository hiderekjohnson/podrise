import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Clock, CheckCircle2, XCircle, Send, Eye, X, Ban, Zap, RefreshCw, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PendingEmailEntry {
  id: number;
  userId: number;
  recipientEmail: string;
  podcasts: string[];
  recapDate: string;
  subject: string;
  scheduledFor: string;
  timezone: string;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700" data-testid="badge-pending">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700" data-testid="badge-sent">
          <CheckCircle2 className="w-3 h-3" />
          Sent
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500" data-testid="badge-cancelled">
          <Ban className="w-3 h-3" />
          Cancelled
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700" data-testid="badge-error">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
}

function parsePodcastNames(podcasts: string[]): string {
  return podcasts.map(raw => {
    try {
      const p = JSON.parse(raw);
      return p.name || raw;
    } catch {
      return raw;
    }
  }).join(", ");
}

function formatDeliveryTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function PendingEmails() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [previewHtml, setPreviewHtml] = useState<{ id: number; html: string } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);

  const { data: emails, isLoading } = useQuery<PendingEmailEntry[]>({
    queryKey: ["/api/admin/pending-emails"],
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/pending-emails/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-emails"] });
      toast({ title: "Email cancelled", description: "This email will not be sent." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to cancel", variant: "destructive" });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/pending-emails/${id}/send-now`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-emails"] });
      toast({ title: "Email sent", description: "The email has been sent immediately." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to send", variant: "destructive" });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/trigger-pregeneration");
    },
    onSuccess: () => {
      toast({ title: "Pre-generation started", description: "Recaps are being generated. Refresh in a few minutes to see results." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-emails"] });
      }, 10000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to trigger", variant: "destructive" });
    },
  });

  const handlePreview = async (id: number) => {
    setLoadingPreviewId(id);
    try {
      const res = await apiRequest("GET", `/api/admin/pending-emails/${id}/html`);
      const data = await res.json();
      setPreviewHtml({ id, html: data.html });
    } catch {
      toast({ title: "Error", description: "Failed to load preview", variant: "destructive" });
    } finally {
      setLoadingPreviewId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const filteredEmails = statusFilter === "all"
    ? (emails || [])
    : (emails || []).filter(e => e.status === statusFilter);

  const statusCounts = (emails || []).reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingCount = statusCounts["pending"] || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.03]"}`}
            data-testid="filter-pending-all"
          >
            All ({emails?.length || 0})
          </button>
          {["pending", "sent", "cancelled", "error"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${statusFilter === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.03]"}`}
              data-testid={`filter-pending-${s}`}
            >
              {s} ({statusCounts[s] || 0})
            </button>
          ))}
        </div>
        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50"
          data-testid="button-trigger-pregeneration"
        >
          {triggerMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Generate Now
        </button>
      </div>

      {pendingCount > 0 && statusFilter === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="pending-summary">
          <Mail className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{pendingCount} email{pendingCount !== 1 ? "s" : ""} queued to send today</p>
            <p className="text-xs text-amber-600 mt-0.5">Review the content below. Cancel any that look wrong before they're delivered.</p>
          </div>
        </div>
      )}

      {filteredEmails.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No {statusFilter !== "all" ? statusFilter : ""} emails found.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {statusFilter === "pending" ? 'Click "Generate Now" to pre-generate today\'s recap emails.' : "Emails will appear here when generated."}
          </p>
        </div>
      ) : (
        <div className="border border-black/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="table-pending-emails">
            <thead>
              <tr className="bg-black/[0.02] border-b border-black/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Podcasts</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Delivery</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.map((email) => (
                <tr
                  key={email.id}
                  className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015] transition-colors"
                  data-testid={`row-pending-${email.id}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground text-[13px]">{email.recipientEmail}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">User #{email.userId} · {email.recapDate}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] text-foreground max-w-[200px] truncate">{parsePodcastNames(email.podcasts)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-foreground">{formatDeliveryTime(email.scheduledFor)}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{email.recapDate} · {email.timezone.replace(/_/g, " ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(email.status)}
                    {email.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 max-w-[150px] truncate" title={email.errorMessage}>
                        {email.errorMessage}
                      </p>
                    )}
                    {email.sentAt && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{formatDateTime(email.sentAt)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handlePreview(email.id)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="Preview email"
                        data-testid={`button-preview-${email.id}`}
                      >
                        {loadingPreviewId === email.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {email.status === "pending" && (
                        <>
                          <button
                            onClick={() => sendNowMutation.mutate(email.id)}
                            disabled={sendNowMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-green-100 text-muted-foreground hover:text-green-600 transition-all"
                            title="Send now"
                            data-testid={`button-send-now-${email.id}`}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancelMutation.mutate(email.id)}
                            disabled={cancelMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-all"
                            title="Cancel"
                            data-testid={`button-cancel-${email.id}`}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="modal-email-preview">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-bold text-foreground">Email Preview (Pending #{previewHtml.id})</h3>
              <button
                onClick={() => setPreviewHtml(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                data-testid="button-close-preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <iframe
                srcDoc={previewHtml.html}
                className="w-full h-full min-h-[500px] border-0"
                title="Email Preview"
                sandbox="allow-same-origin"
                data-testid="iframe-email-preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
