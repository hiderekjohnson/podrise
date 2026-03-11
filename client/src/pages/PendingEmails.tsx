import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Clock, CheckCircle2, XCircle, Send, Eye, X, Ban, Zap, RefreshCw, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EpisodeStatsData {
  included: number;
  noNewEpisode: number;
  error: number;
  details: { podcast: string; status: string; episodeCount?: number; errorMessage?: string }[];
}

interface PendingEmailEntry {
  id: number;
  userId: number;
  recipientEmail: string;
  podcasts: string[];
  recapDate: string;
  subject: string;
  scheduledFor: string;
  timezone: string;
  episodeStats: string | null;
  source: string;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  emailOpenedAt: string | null;
  createdAt: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "held":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700" data-testid="badge-held">
          <Eye className="w-3 h-3" />
          Held for Review
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700" data-testid="badge-pending">
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

function formatDeliveryTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "-";
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
  const [statusFilter, setStatusFilter] = useState<string>("pending_approval");
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

  const allEmails = emails || [];
  const pendingApprovalEmails = allEmails.filter(e => e.status === "held" || e.status === "pending");
  const sentEmails = allEmails.filter(e => e.status === "sent");
  const cancelledErrorEmails = allEmails.filter(e => e.status === "cancelled" || e.status === "error");

  const filteredEmails = statusFilter === "pending_approval"
    ? pendingApprovalEmails
    : statusFilter === "sent"
    ? sentEmails
    : cancelledErrorEmails;

  const tabs = [
    { key: "pending_approval", label: "Pending Approval", count: pendingApprovalEmails.length },
    { key: "sent", label: "Approved - Sent", count: sentEmails.length },
    { key: "cancelled_error", label: "Cancelled / Error", count: cancelledErrorEmails.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === tab.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-black/[0.03]"}`}
              data-testid={`filter-${tab.key}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {pendingApprovalEmails.length > 0 && statusFilter === "pending_approval" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="pending-summary">
          <Mail className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{pendingApprovalEmails.length} email{pendingApprovalEmails.length !== 1 ? "s" : ""} waiting for your approval</p>
            <p className="text-xs text-amber-600 mt-0.5">Preview each email, then click Send or Cancel.</p>
          </div>
        </div>
      )}

      {filteredEmails.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No {statusFilter !== "all" ? statusFilter : ""} emails found.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Emails will appear here as they are generated at each user's delivery time.
          </p>
        </div>
      ) : (
        <div className="border border-black/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="table-pending-emails">
            <thead>
              <tr className="bg-black/[0.02] border-b border-black/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Episodes</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Delivery</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Source</th>
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
                    <p className="font-semibold text-foreground text-sm">{email.recipientEmail}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">User #{email.userId} · {email.recapDate}</p>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const stats: EpisodeStatsData | null = email.episodeStats ? (() => { try { return JSON.parse(email.episodeStats); } catch { return null; } })() : null;
                      if (!stats) {
                        return <span className="text-xs text-muted-foreground italic">No data</span>;
                      }
                      return (
                        <div className="space-y-1" data-testid={`episode-stats-${email.id}`}>
                          <div className="flex items-center gap-3">
                            {stats.included > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700" data-testid={`stat-included-${email.id}`}>
                                <CheckCircle2 className="w-3 h-3" />
                                {stats.included} included
                              </span>
                            )}
                            {stats.noNewEpisode > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500" data-testid={`stat-no-new-${email.id}`}>
                                <Ban className="w-3 h-3" />
                                {stats.noNewEpisode} no new ep
                              </span>
                            )}
                            {stats.error > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" data-testid={`stat-error-${email.id}`}>
                                <XCircle className="w-3 h-3" />
                                {stats.error} error
                              </span>
                            )}
                          </div>
                          {stats.details.length > 0 && (
                            <div className="text-xs text-muted-foreground/70 leading-relaxed">
                              {stats.details.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className={d.status === "included" ? "text-green-600" : d.status === "no_new_episode" ? "text-gray-400" : "text-red-500"}>
                                    {d.status === "included" ? "✓" : d.status === "no_new_episode" ? "-" : "✗"}
                                  </span>
                                  <span className="truncate max-w-[140px]" title={d.podcast}>{d.podcast}</span>
                                  {d.status === "included" && d.episodeCount && <span className="text-green-600">({d.episodeCount} ep)</span>}
                                  {d.status === "error" && d.errorMessage && <span className="text-red-400 truncate max-w-[100px]" title={d.errorMessage}>({d.errorMessage})</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">{formatDeliveryTime(email.scheduledFor)}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{email.recapDate} · {email.timezone.replace(/_/g, " ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${email.source === "manual" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"}`} data-testid={`badge-source-${email.id}`}>
                      {email.source === "manual" ? <Zap className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {email.source === "manual" ? "Manual" : "Scheduled"}
                    </span>
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
                    {email.status === "sent" && (
                      <span className={`inline-flex items-center gap-1 text-xs mt-1 ${email.emailOpenedAt ? "text-green-600" : "text-muted-foreground/40"}`} data-testid={`badge-opened-${email.id}`}>
                        <Mail className="w-3 h-3" />
                        {email.emailOpenedAt ? `Opened ${formatDateTime(email.emailOpenedAt)}` : "Not opened"}
                      </span>
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
                      {(email.status === "held" || email.status === "pending") && (
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
