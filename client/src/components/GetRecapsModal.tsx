import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Mail, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRegister } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface GetRecapsModalProps {
  open: boolean;
  onClose: () => void;
  podcastName: string;
  artworkUrl?: string;
  itunesId: string;
}

export function GetRecapsModal({ open, onClose, podcastName, artworkUrl, itunesId }: GetRecapsModalProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState("");

  const handleClose = () => {
    setEmail("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    register(
      {
        podcasts: [JSON.stringify({ id: itunesId, name: podcastName, artworkUrl: artworkUrl || "" })],
        email: email.trim(),
      },
      {
        onSuccess: () => {
          onClose();
          navigate("/dashboard?welcome=true");
        },
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400")
              ? "An account with this email already exists. Try logging in."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
            data-testid="modal-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-black/20 p-8 sm:p-10"
            data-testid="modal-get-recaps"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              data-testid="button-close-modal"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              {artworkUrl && (
                <img
                  src={artworkUrl}
                  alt={podcastName}
                  className="w-28 h-28 rounded-2xl shadow-lg shadow-black/[0.1] ring-1 ring-black/[0.04] object-cover mb-6"
                  data-testid="img-modal-artwork"
                />
              )}

              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug mb-2" data-testid="text-modal-title">
                Get recaps of every new {podcastName} episode
              </h2>

              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-6" data-testid="text-modal-subtitle">
                Enter your email and we'll send a recap whenever a new episode drops.
              </p>

              <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4" data-testid="form-modal-signup">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#71717A] pointer-events-none" />
                  <input
                    data-testid="input-email-modal"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full h-[52px] pl-12 pr-4 bg-white border-2 border-primary/20 rounded-2xl text-foreground text-[17px] focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all font-medium placeholder:text-[#71717A]"
                    autoFocus
                  />
                </div>

                <button
                  data-testid="button-modal-submit"
                  type="submit"
                  disabled={isPending}
                  className="w-full min-h-[52px] flex items-center justify-center gap-2.5 rounded-2xl font-display font-bold text-[17px] bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Get Free Recaps
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-[16px] text-[#3F3F46] dark:text-[#A1A1AA] mt-4 leading-relaxed" data-testid="text-modal-disclaimer">
                No credit card required.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
