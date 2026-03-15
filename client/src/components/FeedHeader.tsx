import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Settings, User } from "lucide-react";

export function FeedHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#F0F0F2]" data-testid="feed-header">
      <div className="max-w-[600px] mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="feed-logo">
          <PodCapWordmark />
        </Link>
        {user && (
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F7F7FC] transition-colors"
            data-testid="feed-settings-btn"
          >
            <Settings className="w-5 h-5 text-[#52525B]" />
          </button>
        )}
      </div>
    </header>
  );
}
