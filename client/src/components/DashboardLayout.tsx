import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Home, Compass, ShoppingBag, HelpCircle, Bookmark,
  Zap, Users, Settings
} from "lucide-react";
import { RightSidebar } from "@/components/RightSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
}

const NAV_ITEMS = [
  { key: "feed", path: "/dashboard", label: "Home", Icon: Home },
  { key: "discover", path: "/discover", label: "Discover", Icon: Compass },
  { key: "pulse", path: "/pulse", label: "My Pulse", Icon: Zap },
  { key: "shop", path: "/shop", label: "Shop", Icon: ShoppingBag },
  { key: "bookmarks", path: "/bookmarks", label: "Bookmarks", Icon: Bookmark },
  { key: "pod-squad", path: "/pod-squad", label: "Pod Squad", Icon: Users },
  { key: "settings", path: "/settings", label: "Settings", Icon: Settings },
];

function MobileBottomNav({ currentPath }: { currentPath: string }) {
  const [, navigate] = useLocation();

  const tabs = [
    { key: "feed", path: "/dashboard", Icon: Home, label: "Home" },
    { key: "discover", path: "/discover", Icon: Compass, label: "Discover" },
    { key: "pod-squad", path: "/pod-squad", label: "Refer", Icon: Users, highlight: true },
    { key: "settings", path: "/settings", Icon: Settings, label: "You" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E4E4E7] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="bottom-nav"
    >
      <div className="flex items-stretch justify-around mx-auto h-[50px]">
        {tabs.map(({ key, path, Icon, label, highlight }) => {
          const isActive = currentPath === path || (path === "/dashboard" && currentPath === "/");
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 gap-[2px] transition-colors active:opacity-70 ${
                highlight
                  ? "text-[#6366F1]"
                  : isActive ? "text-[#09090B]" : "text-[#A1A1AA]"
              }`}
              data-testid={`bottom-nav-${key}`}
            >
              {highlight ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1, #7C3AED)" }}>
                  <Icon className="w-[18px] h-[18px] text-white" />
                </div>
              ) : (
                <Icon className="w-6 h-6" />
              )}
              <span className={`text-[10px] font-semibold leading-none ${highlight ? "text-[#6366F1]" : ""}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardLayout({ children, hideRightSidebar }: DashboardLayoutProps) {
  const { data: user } = useAuth();
  const [location] = useLocation();

  const isActive = (path: string) =>
    location === path || (path === "/dashboard" && location === "/");

  const showRightSidebar = !hideRightSidebar;

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="dashboard-shell min-h-screen bg-[#F7F7FC]" data-testid="dashboard-layout">
      <aside
        className="hidden md:flex flex-col items-center fixed top-0 left-0 h-full z-40 w-[64px] border-r border-[#F0F0F2] bg-white py-4"
        data-testid="sidebar"
      >
        <Link href="/dashboard" data-testid="sidebar-logo">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-6"
            style={{ background: "linear-gradient(145deg, #6366F1, #8B5CF6)" }}
          >
            <svg viewBox="0 0 28 28" width="20" height="20" fill="none">
              <rect x="1" y="11" width="3.5" height="6" rx="1.75" fill="white" opacity="0.5"/>
              <rect x="6.5" y="7" width="3.5" height="14" rx="1.75" fill="white" opacity="0.75"/>
              <rect x="12" y="4" width="3.5" height="20" rx="1.75" fill="white"/>
              <rect x="17.5" y="8" width="3.5" height="12" rx="1.75" fill="white" opacity="0.85"/>
              <rect x="23" y="5" width="3.5" height="18" rx="1.75" fill="white" opacity="0.6"/>
              <circle cx="25.5" cy="3" r="2.5" fill="white"/>
            </svg>
          </div>
        </Link>

        <nav className="flex flex-col items-center gap-[2px] flex-1 w-full px-[10px]" data-testid="sidebar-nav">
          {NAV_ITEMS.map(({ key, path, label, Icon }) => {
            const active = isActive(path);
            return (
              <Link key={key} href={path}>
                <div
                  className={`sidebar-icon-item w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all relative ${
                    active
                      ? "bg-[#EEF2FF] text-[#6366F1]"
                      : "text-[#A1A1AA] hover:bg-[#F7F7FC] hover:text-[#52525B]"
                  }`}
                  data-label={label}
                  data-testid={`sidebar-nav-${key}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-[6px]">
          <Link href="/help">
            <div
              className="sidebar-icon-item w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all text-[#A1A1AA] hover:bg-[#F7F7FC] hover:text-[#52525B] relative"
              data-label="Help"
              data-testid="sidebar-nav-help"
            >
              <HelpCircle className="w-5 h-5" />
            </div>
          </Link>
          <Link href="/settings">
            <div
              className="w-[34px] h-[34px] rounded-full bg-[#EEF2FF] text-[#6366F1] text-[12px] font-bold flex items-center justify-center cursor-pointer border-2 border-[#A5B4FC]"
              data-testid="sidebar-avatar"
            >
              {initials}
            </div>
          </Link>
        </div>
      </aside>

      <div className="md:ml-[64px]">
        <div className="flex">
          <div className="flex-1 min-w-0">
            {children}
          </div>
          {showRightSidebar && (
            <div className="hidden xl:block transition-all duration-200">
              <RightSidebar />
            </div>
          )}
        </div>
      </div>

      <MobileBottomNav currentPath={location} />
    </div>
  );
}
