import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]" data-testid="site-header">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/podcasts"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-podcasts"
          >
            Podcasts
          </Link>
          <Link
            href="/trends"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-trends"
          >
            Trends
          </Link>
          <Link
            href="/insights"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="nav-insights"
          >
            Insights
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 flex items-center"
              data-testid="nav-dashboard"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 flex items-center"
                data-testid="nav-login"
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/get-started")}
                className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-lg text-[15px] font-semibold hover:bg-foreground/90 transition-colors min-h-[44px]"
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
