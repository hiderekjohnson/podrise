import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PodCapIcon, PodCapWordmark } from "@/components/PodCapHeader";
import {
  Home, Compass, ShoppingBag, Settings, HelpCircle, Bookmark,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { RightSidebar } from "@/components/RightSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
}

function HomeIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.1L1 12h3v9h6v-6h4v6h6v-9h3L12 2.1z"/></svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  );
}

function CompassIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 13.5l-5 2-2-5 5-2 2 5z"/></svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  );
}

const NAV_ITEMS = [
  { key: "feed", path: "/dashboard", label: "Home", Icon: HomeIcon },
  { key: "discover", path: "/discover", label: "Discover", Icon: CompassIcon },
  { key: "shop", path: "/shop", label: "Shop", badge: "Beta", LucideIcon: ShoppingBag },
  { key: "bookmarks", path: "/bookmarks", label: "Bookmarks", LucideIcon: Bookmark },
  { key: "settings", path: "/settings", label: "Settings", Icon: SettingsIcon },
  { key: "help", path: "/help", label: "Help & Support", LucideIcon: HelpCircle },
];

function MobileBottomNav({ currentPath }: { currentPath: string }) {
  const [, navigate] = useLocation();

  const tabs = [
    { key: "feed", path: "/dashboard", Icon: HomeIcon, label: "Home" },
    { key: "discover", path: "/discover", Icon: CompassIcon, label: "Discover" },
    { key: "shop", path: "/shop", label: "Shop", LucideIcon: ShoppingBag },
    { key: "settings", path: "/settings", Icon: SettingsIcon, label: "You" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#09090B] border-t border-[#E4E4E7] dark:border-[#27272A] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="bottom-nav"
    >
      <div className="flex items-stretch justify-around mx-auto h-[50px]">
        {tabs.map(({ key, path, Icon, LucideIcon, label }) => {
          const isActive = currentPath === path || (path === "/dashboard" && currentPath === "/");
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 gap-[2px] transition-colors active:opacity-70 ${
                isActive ? "text-[#09090B] dark:text-white" : "text-[#A1A1AA] dark:text-[#71717A]"
              }`}
              data-testid={`bottom-nav-${key}`}
            >
              {Icon ? <Icon active={isActive} /> : LucideIcon ? <LucideIcon className="w-6 h-6" /> : null}
              <span className="text-[10px] font-semibold leading-none">{label}</span>
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
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) =>
    location === path || (path === "/dashboard" && location === "/");

  const showRightSidebar = !hideRightSidebar;

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="dashboard-layout">
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-full z-40 border-r border-[#F0F0F2] dark:border-[#1C1C22] bg-white dark:bg-[#09090B] transition-all duration-200 ${
          collapsed ? "w-[68px]" : "w-[260px]"
        }`}
        data-testid="sidebar"
      >
        <div className={`flex items-center gap-2 px-4 h-[64px] flex-shrink-0 ${collapsed ? "justify-center" : ""}`}>
          {collapsed ? (
            <Link href="/dashboard">
              <PodCapIcon size={32} />
            </Link>
          ) : (
            <Link href="/dashboard" data-testid="sidebar-logo">
              <PodCapWordmark />
            </Link>
          )}
        </div>

        {!collapsed && user?.displayName && (
          <div className="px-5 pb-3">
            <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate" data-testid="sidebar-display-name">
              {user.displayName}
            </p>
          </div>
        )}

        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto" data-testid="sidebar-nav">
          {NAV_ITEMS.map(({ key, path, label, Icon, LucideIcon, badge }) => {
            const active = isActive(path);
            return (
              <Link key={key} href={path}>
                <div
                  className={`flex items-center gap-3 rounded-xl transition-colors cursor-pointer ${
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                  } ${
                    active
                      ? "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#09090B] dark:text-white font-bold"
                      : "text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#FAFAFA] dark:hover:bg-[#111114]"
                  }`}
                  data-testid={`sidebar-nav-${key}`}
                >
                  {Icon ? (
                    <Icon active={active} />
                  ) : LucideIcon ? (
                    <LucideIcon className={`w-6 h-6 flex-shrink-0 ${active ? "text-[#09090B] dark:text-white" : ""}`} />
                  ) : null}
                  {!collapsed && (
                    <span className="text-[15px] flex items-center gap-2">
                      {label}
                      {badge && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#6366F1]/10 text-[#6366F1] px-1.5 py-0.5 rounded-md" data-testid={`sidebar-badge-${key}`}>
                          {badge}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className={`flex-shrink-0 border-t border-[#F0F0F2] dark:border-[#1C1C22] ${collapsed ? "px-2 py-2" : "px-4 py-3"}`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white transition-colors w-full justify-center md:justify-start"
            data-testid="sidebar-collapse-btn"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span className="text-[13px]">Collapse</span>}
          </button>
        </div>

        {!collapsed && (
          <div className="flex-shrink-0 px-4 pb-4 pt-2">
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#A1A1AA] dark:text-[#52525B]">
              <Link href="/terms" className="hover:underline">Terms of Service</Link>
              <span>|</span>
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              <span>|</span>
              <Link href="/cookies" className="hover:underline">Cookie Policy</Link>
              <span>|</span>
              <a href="/support" className="hover:underline">Accessibility</a>
              <span>|</span>
              <Link href="/advertise" className="hover:underline">Ads info</Link>
              <span>|</span>
              <Link href="/about" className="hover:underline">More</Link>
            </div>
            <p className="text-[11px] text-[#A1A1AA] dark:text-[#52525B] mt-1">
              &copy; 2026 PodCap, Inc.
            </p>
          </div>
        )}
      </aside>

      <div className={`transition-all duration-200 ${collapsed ? "md:ml-[68px]" : "md:ml-[260px]"}`}>
        <div className="flex">
          <div className="flex-1 min-w-0">
            {children}
          </div>
          {showRightSidebar && (
            <div className={collapsed
              ? "hidden xl:block border-l border-[#F0F0F2] dark:border-[#1C1C22] transition-all duration-200"
              : "hidden 2xl:block border-l border-[#F0F0F2] dark:border-[#1C1C22] transition-all duration-200"
            }>
              <RightSidebar />
            </div>
          )}
        </div>
      </div>

      <MobileBottomNav currentPath={location} />
    </div>
  );
}
