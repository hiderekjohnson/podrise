import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/podcasts"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-podcasts"
          >
            Podcasts
          </Link>
          <Link
            href="/trends"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-trends"
          >
            Trends
          </Link>
          <Link
            href="/insights"
            className="text-[17px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-insights"
          >
            Insights
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
      </div>
    </header>
  );
}
