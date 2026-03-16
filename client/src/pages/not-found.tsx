import { Link } from "wouter";
import { Mic, Home, Radio, ShoppingBag, Headphones, HelpCircle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center py-20">
        <div className="relative mb-8">
          <div className="w-28 h-28 rounded-full bg-primary/[0.08] flex items-center justify-center" data-testid="icon-404">
            <Mic className="w-14 h-14 text-primary/60" />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center rotate-12">
            <span className="text-red-500 text-lg font-bold">✕</span>
          </div>
        </div>

        <h1 className="text-5xl sm:text-6xl font-display font-extrabold text-foreground tracking-tight mb-3" data-testid="text-404-title">
          404
        </h1>
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-3" data-testid="text-404-subtitle">
          This episode was never recorded
        </h2>
        <p className="text-base sm:text-lg text-[#52525B] dark:text-[#A1A1AA] max-w-md leading-relaxed mb-2" data-testid="text-404-description">
          Looks like you've gone off-script. The page you're looking for doesn't exist — maybe it was cut in post-production.
        </p>
        <p className="text-[15px] text-[#A1A1AA] dark:text-[#71717A] mb-6" data-testid="text-404-joke">
          Even the best podcasters flub a take sometimes.
        </p>
        <div className="mb-10 inline-flex items-center gap-2 text-sm text-primary hover:underline" data-testid="link-404-support">
          <HelpCircle className="w-4 h-4" />
          <Link href="/support">Need help? Visit our support page</Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3" data-testid="nav-404-links">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background font-display font-bold text-[15px] hover:bg-foreground/90 transition-all active:scale-[0.98]"
            data-testid="link-404-home"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
          <Link
            href="/podcasts"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card text-foreground font-display font-bold text-[15px] hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.98]"
            data-testid="link-404-podcasts"
          >
            <Headphones className="w-4 h-4" />
            Browse Podcasts
          </Link>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card text-foreground font-display font-bold text-[15px] hover:border-primary/30 hover:shadow-sm transition-all active:scale-[0.98]"
            data-testid="link-404-shop"
          >
            <ShoppingBag className="w-4 h-4" />
            Shop
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
