import { ArrowRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface GetRecapsModalProps {
  open: boolean;
  onClose: () => void;
  podcastName: string;
  artworkUrl?: string;
  itunesId?: string;
}

export function GetRecapsModal({ open, onClose, podcastName, artworkUrl }: GetRecapsModalProps) {
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
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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

              <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-6" data-testid="text-modal-subtitle">
                Sign up free and we'll send a recap whenever a new episode drops.
              </p>

              <a
                href="https://podrise.com/register"
                className="w-full min-h-[52px] flex items-center justify-center gap-2.5 rounded-2xl font-display font-bold text-[17px] bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 transition-all active:scale-[0.98]"
                data-testid="button-modal-register"
              >
                Get Free Recaps
                <ArrowRight className="w-5 h-5" />
              </a>

              <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] mt-4 leading-relaxed" data-testid="text-modal-disclaimer">
                No credit card required.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
