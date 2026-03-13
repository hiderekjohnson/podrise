import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { PodCapWordmark } from "@/components/PodCapHeader";
import { useAuth } from "@/hooks/use-auth";
import { Menu, X, ChevronDown, ArrowRight, Building2, Lightbulb, Users } from "lucide-react";
import { INDUSTRIES, INTERESTS, ROLES } from "@/data/topicData";

const DROPDOWN_INDUSTRIES = INDUSTRIES.slice(0, 8);
const DROPDOWN_INTERESTS = INTERESTS.slice(0, 8);
const DROPDOWN_ROLES = ROLES.slice(0, 8);

export function SiteHeader() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setExploreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]" data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          <div className="relative">
            <button
              ref={triggerRef}
              onClick={() => setExploreOpen(!exploreOpen)}
              className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center gap-1"
              data-testid="nav-explore"
            >
              Explore
              <ChevronDown className={`w-4 h-4 transition-transform ${exploreOpen ? "rotate-180" : ""}`} />
            </button>

            {exploreOpen && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-background border border-black/[0.08] dark:border-white/[0.1] rounded-xl shadow-lg shadow-black/[0.08] w-[680px]"
                data-testid="explore-dropdown"
              >
                <div className="grid grid-cols-3 gap-0 p-5">
                  <div className="pr-5 border-r border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-[#6366F1]" />
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1]">Industries</span>
                    </div>
                    <div className="space-y-0.5">
                      {DROPDOWN_INDUSTRIES.map(t => (
                        <Link
                          key={t.slug}
                          href={`/industries/${t.slug}`}
                          className="block text-[15px] text-[#52525B] dark:text-[#D4D4D8] hover:text-foreground hover:bg-muted/60 px-2.5 py-2 rounded-lg transition-colors"
                          data-testid={`dropdown-industry-${t.slug}`}
                          onClick={() => setExploreOpen(false)}
                        >
                          {t.name}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/industries"
                      className="flex items-center gap-1 text-[14px] font-medium text-[#6366F1] hover:text-[#4F46E5] mt-3 px-2.5 transition-colors"
                      data-testid="dropdown-view-all-industries"
                      onClick={() => setExploreOpen(false)}
                    >
                      View all industries <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="px-5 border-r border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-[#6366F1]" />
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1]">Topics</span>
                    </div>
                    <div className="space-y-0.5">
                      {DROPDOWN_INTERESTS.map(t => (
                        <Link
                          key={t.slug}
                          href={`/interests/${t.slug}`}
                          className="block text-[15px] text-[#52525B] dark:text-[#D4D4D8] hover:text-foreground hover:bg-muted/60 px-2.5 py-2 rounded-lg transition-colors"
                          data-testid={`dropdown-interest-${t.slug}`}
                          onClick={() => setExploreOpen(false)}
                        >
                          {t.name}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/interests"
                      className="flex items-center gap-1 text-[14px] font-medium text-[#6366F1] hover:text-[#4F46E5] mt-3 px-2.5 transition-colors"
                      data-testid="dropdown-view-all-interests"
                      onClick={() => setExploreOpen(false)}
                    >
                      View all topics <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="pl-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-[#6366F1]" />
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1]">Roles</span>
                    </div>
                    <div className="space-y-0.5">
                      {DROPDOWN_ROLES.map(t => (
                        <Link
                          key={t.slug}
                          href={`/roles/${t.slug}`}
                          className="block text-[15px] text-[#52525B] dark:text-[#D4D4D8] hover:text-foreground hover:bg-muted/60 px-2.5 py-2 rounded-lg transition-colors"
                          data-testid={`dropdown-role-${t.slug}`}
                          onClick={() => setExploreOpen(false)}
                        >
                          {t.name}
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/roles"
                      className="flex items-center gap-1 text-[14px] font-medium text-[#6366F1] hover:text-[#4F46E5] mt-3 px-2.5 transition-colors"
                      data-testid="dropdown-view-all-roles"
                      onClick={() => setExploreOpen(false)}
                    >
                      View all roles <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Link
            href="/trends"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-trends"
          >
            Trends
          </Link>
          <Link
            href="/podcasts"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="nav-podcasts"
          >
            Podcasts
          </Link>
          <Link
            href="/bookstore"
            className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center gap-1.5"
            data-testid="nav-bookstore"
          >
            Bookstore
            <span className="text-[12px] font-bold uppercase tracking-wide bg-primary/[0.1] text-primary px-1.5 py-0.5 rounded-md leading-none">Beta</span>
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center"
              data-testid="nav-dashboard"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#6366F1] transition-colors min-h-[44px] px-3 flex items-center ml-2"
                data-testid="nav-login"
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="flex items-center gap-2 px-6 py-2.5 border-2 border-foreground text-foreground rounded-[10px] text-[15px] font-semibold hover:bg-foreground hover:text-background transition-all min-h-[44px] ml-1"
                data-testid="nav-get-started"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg hover:bg-muted/60 transition-colors"
          data-testid="button-mobile-menu"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-black/[0.06] dark:border-white/[0.06] bg-background/95 backdrop-blur-md max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            <div className="pb-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1] px-3 mb-1">Industries</p>
              {DROPDOWN_INDUSTRIES.slice(0, 5).map(t => (
                <Link key={t.slug} href={`/industries/${t.slug}`} className="block text-[16px] text-foreground py-2.5 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid={`mobile-industry-${t.slug}`}>
                  {t.name}
                </Link>
              ))}
              <Link href="/industries" className="block text-[14px] font-medium text-[#6366F1] py-2 px-3" onClick={() => setMobileMenuOpen(false)}>View all →</Link>
            </div>
            <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-2 pb-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1] px-3 mb-1">Topics</p>
              {DROPDOWN_INTERESTS.slice(0, 5).map(t => (
                <Link key={t.slug} href={`/interests/${t.slug}`} className="block text-[16px] text-foreground py-2.5 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid={`mobile-interest-${t.slug}`}>
                  {t.name}
                </Link>
              ))}
              <Link href="/interests" className="block text-[14px] font-medium text-[#6366F1] py-2 px-3" onClick={() => setMobileMenuOpen(false)}>View all →</Link>
            </div>
            <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-2 pb-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6366F1] px-3 mb-1">Roles</p>
              {DROPDOWN_ROLES.slice(0, 5).map(t => (
                <Link key={t.slug} href={`/roles/${t.slug}`} className="block text-[16px] text-foreground py-2.5 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid={`mobile-role-${t.slug}`}>
                  {t.name}
                </Link>
              ))}
              <Link href="/roles" className="block text-[14px] font-medium text-[#6366F1] py-2 px-3" onClick={() => setMobileMenuOpen(false)}>View all →</Link>
            </div>
            <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-2 space-y-1">
              <Link href="/trends" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-trends">Trends</Link>
              <Link href="/podcasts" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-podcasts">Podcasts</Link>
              <Link href="/bookstore" className="flex items-center gap-2 text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-bookstore">
                Bookstore
                <span className="text-[12px] font-bold uppercase tracking-wide bg-primary/[0.1] text-primary px-1.5 py-0.5 rounded-md leading-none">Beta</span>
              </Link>
              <Link href="/people" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-people">People</Link>
              <Link href="/companies" className="block text-[17px] font-medium text-foreground py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-companies">Companies</Link>
            </div>
            <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] mt-2">
              {user ? (
                <Link href="/dashboard" className="block text-[17px] font-semibold text-primary py-3 px-3 rounded-lg hover:bg-muted/60 transition-colors" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-nav-dashboard">Dashboard</Link>
              ) : (
                <div className="space-y-2 px-3 pb-2">
                  <button onClick={() => { navigate("/register"); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#6366F1] text-white rounded-[10px] text-[17px] font-semibold hover:bg-[#4F46E5] transition-all min-h-[48px]" data-testid="mobile-nav-create-account">Get started</button>
                  <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="w-full text-center text-[17px] font-medium text-[#52525B] dark:text-[#A1A1AA] py-3 min-h-[44px]" data-testid="mobile-nav-login">Log in</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
