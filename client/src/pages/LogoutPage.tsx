import { useEffect } from "react";
import { Link } from "wouter";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { Podcast, ArrowRight, Sparkles } from "lucide-react";

export default function LogoutPage() {
  useEffect(() => {
    document.title = "Signed Out | PodRise";
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090B] flex flex-col" data-testid="logout-page">
      <header className="border-b border-[#F0F0F2] dark:border-[#1C1C22]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center">
          <Link href="/">
            <PodRiseWordmark />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366F1] to-[#818CF8] flex items-center justify-center mx-auto mb-6">
            <Podcast className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-[28px] md:text-[32px] font-bold text-[#09090B] dark:text-white mb-3" data-testid="logout-heading">
            You've been signed out
          </h1>
          <p className="text-[16px] md:text-[17px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed mb-8">
            Thanks for using PodRise. Sign back in anytime to access your personalized podcast feed and saved recaps.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login">
              <span
                className="inline-flex items-center justify-center gap-2 h-[48px] px-8 rounded-full font-bold text-[15px] bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] transition-all active:scale-[0.98]"
                data-testid="logout-signin-btn"
              >
                Sign back in
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
            <Link href="/register">
              <span
                className="inline-flex items-center justify-center gap-2 h-[48px] px-8 rounded-full font-bold text-[15px] border border-[#D4D4D8] dark:border-[#3F3F46] text-[#09090B] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-all active:scale-[0.98]"
                data-testid="logout-register-btn"
              >
                <Sparkles className="w-4 h-4" />
                Create new account
              </span>
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-[#F0F0F2] dark:border-[#1C1C22]">
            <p className="text-[14px] text-[#A1A1AA] mb-4">Discover what's being discussed on your favorite podcasts</p>
            <Link href="/">
              <span className="text-[14px] font-semibold text-[#6366F1] hover:underline" data-testid="logout-explore-link">
                Explore PodRise
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
