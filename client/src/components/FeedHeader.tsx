import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Bell } from "lucide-react";

export function FeedHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();

  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#F0F0F2]" data-testid="feed-header">
      <div className="max-w-[600px] mx-auto px-4 h-[52px] flex items-center justify-between">
        <button
          onClick={() => navigate("/settings")}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366F1] to-[#818CF8] flex items-center justify-center flex-shrink-0"
          aria-label="Open settings"
          data-testid="feed-avatar-btn"
        >
          <span className="text-white text-[13px] font-bold leading-none">{initials}</span>
        </button>

        <Link href="/" className="flex items-center absolute left-1/2 -translate-x-1/2" data-testid="feed-logo">
          <PodCapWordmark />
        </Link>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/discover")}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] transition-colors"
            aria-label="Search"
            data-testid="feed-search-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#09090B]" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
