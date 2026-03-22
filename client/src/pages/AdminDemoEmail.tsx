import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function AdminDemoEmail() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const sendMutation = useMutation({
    mutationFn: async (toEmail: string) => {
      const res = await apiRequest("POST", "/api/admin/send-demo-email", { toEmail });
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ success: true, message: data.message, details: data });
    },
    onError: (err: any) => {
      setResult({ success: false, message: err.message || "Failed to send" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold mb-1" data-testid="demo-email-title">Send Demo Email</h3>
        <p className="text-sm text-muted-foreground">
          Send a demo email with the 4 most recent published recaps, shop books, missed episodes, and Pod Squad referral section.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4" data-testid="demo-email-form">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            type="email"
            placeholder="Enter email address..."
            value={email}
            onChange={(e) => { setEmail(e.target.value); setResult(null); }}
            className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
            data-testid="input-demo-email"
          />
          <button
            onClick={() => sendMutation.mutate(email)}
            disabled={!email.includes("@") || sendMutation.isPending}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            data-testid="button-send-demo"
          >
            {sendMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> Send Demo</>
            )}
          </button>
        </div>

        {result && (
          <div
            className={`flex items-start gap-3 p-4 rounded-lg text-sm ${
              result.success
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
            data-testid="demo-email-result"
          >
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium">{result.message}</p>
              {result.details && (
                <div className="mt-2 text-xs space-y-1 text-green-700">
                  <p>{result.details.recapCount} recaps from: {result.details.podcasts?.join(", ")}</p>
                  <p>{result.details.shopBooks} shop books · {result.details.missedEpisodes} missed episodes</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border rounded-xl p-5 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground text-sm">What's included in the demo email:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>4 most recent published episode recaps with full formatting</li>
          <li>AI-generated subject line and preview text</li>
          <li>Shop books section (from book insights)</li>
          <li>Missed episodes section</li>
          <li>Pod Squad referral section with sample data (3 referrals)</li>
          <li>Subject line prefixed with [DEMO]</li>
        </ul>
      </div>
    </div>
  );
}
