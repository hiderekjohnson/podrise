import { ArrowRight, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SignUpCTAModalProps {
  open: boolean;
  onClose: () => void;
}

export function SignUpCTAModal({ open, onClose }: SignUpCTAModalProps) {
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
            onClick={onClose}
            data-testid="signup-cta-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative w-full max-w-md bg-white dark:bg-[#18181B] rounded-3xl shadow-2xl shadow-black/20 p-8 sm:p-10"
            data-testid="modal-signup-cta"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              data-testid="button-close-signup-cta"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#6366F1]/10 flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-[#6366F1]" />
              </div>

              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-snug mb-2" data-testid="text-signup-cta-title">
                Unlock all insights
              </h2>

              <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-6" data-testid="text-signup-cta-subtitle">
                Create a free account to see every key takeaway, plus get recaps delivered to your inbox.
              </p>

              <a
                href="/register"
                className="w-full min-h-[52px] flex items-center justify-center gap-2.5 rounded-2xl font-display font-bold text-[17px] bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 transition-all active:scale-[0.98]"
                data-testid="button-signup-cta-register"
              >
                Create free account
                <ArrowRight className="w-5 h-5" />
              </a>

              <p className="text-[14px] text-[#A1A1AA] mt-4 leading-relaxed" data-testid="text-signup-cta-disclaimer">
                No credit card required. Always free.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
