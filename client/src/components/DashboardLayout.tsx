import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import {
  Home, Compass, ShoppingBag, HelpCircle, Bookmark,
  Zap, Users, Settings, Radio, Menu, X
} from "lucide-react";
import { RightSidebar } from "@/components/RightSidebar";
import logoTransparent from "@assets/Transparent-square_1773866360595.png";

interface DashboardLayoutProps {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
}

const ALL_NAV_ITEMS = [
  { key: "feed", path: "/dashboard", label: "Home", Icon: Home },
  { key: "discover", path: "/discover", label: "Discover", Icon: Compass },
  { key: "pulse", path: "/pulse", label: "My Pulse", Icon: Zap, featureFlag: "pulse" as const },
  { key: "shop", path: "/shop", label: "Shop", Icon: ShoppingBag },
  { key: "bookmarks", path: "/bookmarks", label: "Saved Episodes", Icon: Bookmark },
  { key: "my-podcasts", path: "/my-podcasts", label: "My Podcasts", Icon: Radio },
  { key: "pod-squad", path: "/pod-squad", label: "Pod Squad", Icon: Users },
  { key: "settings", path: "/settings", label: "Settings", Icon: Settings },
];

function MobileBottomNav({ currentPath, navItems }: { currentPath: string; navItems: typeof ALL_NAV_ITEMS }) {
  const [, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  const primaryTabs = [
    { key: "feed", path: "/dashboard", Icon: Home, label: "Home" },
    { key: "discover", path: "/discover", Icon: Compass, label: "Discover" },
    { key: "pod-squad", path: "/pod-squad", label: "Refer", Icon: Users, highlight: true },
  ];

  const moreItems = navItems.filter(
    item => !primaryTabs.some(t => t.key === item.key) && item.key !== "pod-squad"
  );

  const isMoreActive = moreItems.some(item => currentPath === item.path);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E4E4E7] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="bottom-nav"
    >
      {moreOpen && (
        <div ref={moreRef} className="absolute bottom-full left-0 right-0 bg-white border-t border-[#E4E4E7] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] rounded-t-2xl overflow-hidden" data-testid="bottom-nav-more-menu">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[13px] font-bold text-[#09090B] tracking-wide uppercase">More</span>
            <button onClick={() => setMoreOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F4F4F5]" aria-label="Close menu" data-testid="bottom-nav-close-more">
              <X className="w-4 h-4 text-[#71717A]" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 px-3 pb-4">
            {moreItems.map(({ key, path, label, Icon }) => {
              const active = currentPath === path;
              return (
                <button
                  key={key}
                  onClick={() => { navigate(path); setMoreOpen(false); }}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-colors active:scale-95 ${
                    active ? "bg-[#EEF2FF] text-[#6366F1]" : "text-[#71717A] hover:bg-[#F4F4F5]"
                  }`}
                  data-testid={`bottom-nav-more-${key}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium leading-none">{label}</span>
                </button>
              );
            })}
            <button
              onClick={() => { navigate("/help"); setMoreOpen(false); }}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-colors active:scale-95 ${
                currentPath === "/help" ? "bg-[#EEF2FF] text-[#6366F1]" : "text-[#71717A] hover:bg-[#F4F4F5]"
              }`}
              data-testid="bottom-nav-more-help"
            >
              <HelpCircle className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">Help</span>
            </button>
          </div>
        </div>
      )}
      <div className="flex items-stretch justify-around mx-auto h-[50px]">
        {primaryTabs.map(({ key, path, Icon, label, highlight }) => {
          const isActive = currentPath === path || (path === "/dashboard" && currentPath === "/");
          return (
            <button
              key={key}
              onClick={() => { navigate(path); setMoreOpen(false); }}
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
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-col items-center justify-center flex-1 gap-[2px] transition-colors active:opacity-70 ${
            moreOpen || isMoreActive ? "text-[#09090B]" : "text-[#A1A1AA]"
          }`}
          data-testid="bottom-nav-more"
        >
          <Menu className="w-6 h-6" />
          <span className="text-[10px] font-semibold leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}

export function DashboardLayout({ children, hideRightSidebar }: DashboardLayoutProps) {
  const { isEnabled } = useFeatureFlags();
  const [location] = useLocation();

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => {
    if (item.featureFlag && !isEnabled(item.featureFlag)) return false;
    return true;
  });

  const isActive = (path: string) =>
    location === path || (path === "/dashboard" && location === "/");

  const showRightSidebar = !hideRightSidebar;

  return (
    <div className="dashboard-shell min-h-screen bg-[#F7F7FC]" data-testid="dashboard-layout">
      <aside
        className="hidden md:flex flex-col items-center fixed top-0 left-0 h-full z-40 w-[64px] border-r border-[#F0F0F2] bg-white py-4"
        data-testid="sidebar"
      >
        <Link href="/dashboard" data-testid="sidebar-logo">
          <img
            src={logoTransparent}
            alt="PodRise"
            width={36}
            height={36}
            className="w-9 h-9 rounded-[10px] object-contain mb-6"
          />
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

      <MobileBottomNav currentPath={location} navItems={NAV_ITEMS} />
    </div>
  );
}
