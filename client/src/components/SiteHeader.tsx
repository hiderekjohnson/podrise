import { useState } from "react";
import { Link, useLocation } from "wouter";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { useAuth } from "@/hooks/use-auth";
import { Menu, X, ArrowRight } from "lucide-react";

export function SiteHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodRiseWordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/podcasts"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-podcasts"
          >
            Podcasts
          </Link>
          <Link
            href="/how-it-works"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-how-it-works"
          >
            How it Works
          </Link>
          <Link
            href="/shop"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center gap-1.5"
            data-testid="nav-shop"
          >
            Shop
            <span className="text-[12px] font-bold uppercase tracking-wide bg-primary/[0.1] text-primary px-1.5 py-0.5 rounded-md leading-none">Beta</span>
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
              data-testid="nav-dashboard"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center ml-2"
                data-testid="nav-login"
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="flex items-center gap-2 px-6 py-2.5 border-2 border-foreground text-foreground rounded-[10px] text-[15px] font-semibold hover:bg-foreground hover:text-background transition-all min-h-[44px] ml-1"
                data-testid="nav-get-started"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg hover:bg-muted/60 transition-colors"
          data-testid="button-mobile-menu"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-black/[0.06] dark:border-white/[0.06] bg-background/95 backdrop-blur-md max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            <div className="space-y-1">
              <Link href="/podcasts" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-podcasts">Podcasts</Link>
              <Link href="/how-it-works" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-how-it-works">How it Works</Link>
              <Link href="/shop" className="flex items-center gap-2 text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-shop">
                Shop
                <span className="text-[12px] font-bold uppercase tracking-wide bg-primary/[0.1] text-primary px-1.5 py-0.5 rounded-md leading-none">Beta</span>
              </Link>
              <Link href="/people" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-people">People</Link>
              <Link href="/companies" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-companies">Companies</Link>
            </div>
            <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] mt-2">
              {user ? (
                <Link href="/dashboard" className="block text-[17px] font-semibold text-primary py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-dashboard">Dashboard</Link>
              ) : (
                <div className="space-y-2 px-3 pb-2">
                  <button onClick={() => { navigate("/register"); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#6366F1] text-white rounded-[10px] text-[17px] font-semibold hover:bg-[#4F46E5] transition-all min-h-[48px]" data-testid="mobile-nav-create-account">Get started</button>
                  <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="w-full text-center text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] py-3 min-h-[44px]" data-testid="mobile-nav-login">Log in</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
