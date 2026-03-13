import { useState } from "react";
import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Menu, X } from "lucide-react";

export function SiteHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <nav className="hidden sm:flex items-center gap-2">
          <Link
            href="/podcasts"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-podcasts"
          >
            Podcasts
          </Link>
          <Link
            href="/trends"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-trends"
          >
            Trends
          </Link>
          <Link
            href="/topics"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-topics"
          >
            Topics
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
              data-testid="nav-dashboard"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
                data-testid="nav-login"
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/get-started")}
                className="flex items-center gap-2 px-7 py-3 bg-[#6366F1] text-white rounded-[10px] text-[17px] font-semibold hover:bg-[#4F46E5] hover:shadow-[0_6px_20px_rgba(99,102,241,0.35)] transition-all min-h-[44px]"
                data-testid="nav-create-account"
              >
                Create Account
              </button>
            </>
          )}
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden flex items-center justify-center w-11 h-11 rounded-lg hover:bg-muted/60 transition-colors"
          data-testid="button-mobile-menu"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-black/[0.06] dark:border-white/[0.06] bg-background/95 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1">
            <Link
              href="/podcasts"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-podcasts"
              onClick={() => setMobileMenuOpen(false)}
            >
              Podcasts
            </Link>
            <Link
              href="/trends"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-trends"
              onClick={() => setMobileMenuOpen(false)}
            >
              Trends
            </Link>
            <Link
              href="/topics"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-topics"
              onClick={() => setMobileMenuOpen(false)}
            >
              Topics
            </Link>
            <Link
              href="/people"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-people"
              onClick={() => setMobileMenuOpen(false)}
            >
              People
            </Link>
            <Link
              href="/companies"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-companies"
              onClick={() => setMobileMenuOpen(false)}
            >
              Companies
            </Link>
            <Link
              href="/bookstore"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-bookstore"
              onClick={() => setMobileMenuOpen(false)}
            >
              Bookstore
            </Link>
            <Link
              href="/daily-drop"
              className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
              data-testid="mobile-nav-signal"
              onClick={() => setMobileMenuOpen(false)}
            >
              Signal
            </Link>
            <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] mt-2">
              {user ? (
                <Link
                  href="/dashboard"
                  className="block text-[17px] font-semibold text-primary py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors"
                  data-testid="mobile-nav-dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
              ) : (
                <div className="space-y-2 px-3 pb-2">
                  <button
                    onClick={() => { navigate("/get-started"); setMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#6366F1] text-white rounded-[10px] text-[17px] font-semibold hover:bg-[#4F46E5] transition-all min-h-[48px]"
                    data-testid="mobile-nav-create-account"
                  >
                    Create Account
                  </button>
                  <button
                    onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}
                    className="w-full text-center text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] py-3 min-h-[44px]"
                    data-testid="mobile-nav-login"
                  >
                    Log in
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
