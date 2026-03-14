import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, CheckCircle, X, Mic } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface RequestPodcastDialogProps {
  open: boolean;
  onClose: () => void;
  searchQuery?: string;
}

export function RequestPodcastDialog({ open, onClose, searchQuery }: RequestPodcastDialogProps) {
  const [podcastName, setPodcastName] = useState(searchQuery || "");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podcastName.trim() || !reason.trim()) return;
    setSending(true);
    try {
      await apiRequest("POST", "/api/podcast-request", {
        podcastName: podcastName.trim(),
        reason: reason.trim(),
        email: email.trim() || undefined,
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setPodcastName(searchQuery || "");
    setReason("");
    setEmail("");
    setSent(false);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
          data-testid="modal-request-podcast"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-[#18181B] rounded-2xl shadow-2xl shadow-black/20 w-full max-w-md p-6 relative"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.05] transition-colors"
              data-testid="button-close-request"
            >
              <X className="w-4 h-4" />
            </button>

            {sent ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-[#6366F1]/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-[#6366F1]" />
                </div>
                <h3 className="font-display font-extrabold text-xl text-foreground mb-2" data-testid="text-request-sent">
                  Request sent
                </h3>
                <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-6">
                  Thanks for the suggestion! We'll review it and may add this podcast to our library.
                </p>
                <button
                  onClick={handleClose}
                  className="min-h-[44px] px-6 rounded-xl font-display font-bold text-[15px] bg-[#6366F1] text-white hover:bg-[#6366F1]/90 transition-all active:scale-[0.98]"
                  data-testid="button-done-request"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-[#6366F1]/10 flex items-center justify-center shrink-0">
                    <Mic className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-lg text-foreground" data-testid="text-request-title">
                      Request a podcast
                    </h3>
                    <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA]">
                      We don't track this one yet, but we could!
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA] mb-1.5">Podcast name</label>
                    <input
                      type="text"
                      value={podcastName}
                      onChange={(e) => setPodcastName(e.target.value)}
                      placeholder="e.g. The Daily"
                      className="w-full h-[44px] px-3.5 bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl text-foreground placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15 focus:border-[#6366F1]/25 transition-all text-[15px]"
                      data-testid="input-request-podcast-name"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA] mb-1.5">Why should we track it?</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Tell us why this podcast would be a great addition..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl text-foreground placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15 focus:border-[#6366F1]/25 transition-all text-[15px] resize-none"
                      data-testid="input-request-reason"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA] mb-1.5">Your email <span className="font-normal">(optional)</span></label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-[44px] px-3.5 bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl text-foreground placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15 focus:border-[#6366F1]/25 transition-all text-[15px]"
                      data-testid="input-request-email"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!podcastName.trim() || !reason.trim() || sending}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[15px] bg-[#6366F1] text-white hover:bg-[#6366F1]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] mt-1"
                    data-testid="button-submit-request"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send request
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
