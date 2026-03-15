import { useLocation } from "wouter";

interface BottomNavProps {
  currentPath: string;
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

export function BottomNav({ currentPath }: BottomNavProps) {
  const [, navigate] = useLocation();

  const tabs = [
    { key: "feed", path: "/dashboard", Icon: HomeIcon, label: "Home" },
    { key: "discover", path: "/discover", Icon: CompassIcon, label: "Discover" },
    { key: "settings", path: "/settings", Icon: SettingsIcon, label: "You" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E4E4E7]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="bottom-nav"
    >
      <div className="flex items-stretch justify-around max-w-[600px] mx-auto h-[50px]">
        {tabs.map(({ key, path, Icon, label }) => {
          const isActive = currentPath === path || (path === "/dashboard" && currentPath === "/");
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 gap-[2px] transition-colors active:opacity-70 ${
                isActive ? "text-[#09090B]" : "text-[#A1A1AA]"
              }`}
              data-testid={`bottom-nav-${key}`}
            >
              <Icon active={isActive} />
              <span className="text-[10px] font-semibold leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
