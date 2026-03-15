import { useLocation } from "wouter";
import { Home, Search, Settings, Compass } from "lucide-react";

interface BottomNavProps {
  currentPath: string;
}

export function BottomNav({ currentPath }: BottomNavProps) {
  const [, navigate] = useLocation();

  const tabs = [
    { key: "feed", path: "/dashboard", icon: Home, label: "Home" },
    { key: "discover", path: "/discover", icon: Compass, label: "Discover" },
    { key: "settings", path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-[#F0F0F2] pb-[env(safe-area-inset-bottom)]"
      data-testid="bottom-nav"
    >
      <div className="flex items-center justify-around max-w-[600px] mx-auto h-14">
        {tabs.map(({ key, path, icon: Icon, label }) => {
          const isActive = currentPath === path || (path === "/dashboard" && currentPath === "/");
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors ${
                isActive ? "text-[#6366F1]" : "text-[#A1A1AA]"
              }`}
              data-testid={`bottom-nav-${key}`}
            >
              <Icon className="w-5.5 h-5.5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
