import { Link } from "wouter";
import { SiX } from "react-icons/si";
import { PodCapWordmark } from "./PodCapHeader";
import { INDUSTRIES, INTERESTS, ROLES, getCategoryPath } from "@/data/topicData";

export function Footer() {
  const topIndustries = INDUSTRIES.slice(0, 4);
  const topInterests = INTERESTS.slice(0, 4);
  const topRoles = ROLES.slice(0, 4);

  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-8 sm:gap-10 mb-12">
          <div>
            <h3 className="text-base font-bold text-foreground mb-5 tracking-wide uppercase">Discover</h3>
            <ul className="space-y-3.5">
              <li>
                <Link href="/podcasts" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-podcasts">
                  Podcasts
                </Link>
              </li>
              <li>
                <Link href="/trends" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-trends">
                  Trends
                </Link>
              </li>
              <li>
                <Link href="/people" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-people">
                  People
                </Link>
              </li>
              <li>
                <Link href="/companies" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-companies">
                  Companies
                </Link>
              </li>
              <li>
                <Link href="/bookstore" className="inline-flex items-center gap-2 text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-bookstore">
                  Bookstore
                  <span className="text-[14px] font-bold uppercase tracking-wider bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full leading-none">Beta</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <Link href="/industries" className="text-base font-bold text-foreground mb-5 tracking-wide uppercase block hover:text-foreground/80 transition-colors" data-testid="link-industries">Industries</Link>
            <ul className="space-y-3.5">
              {topIndustries.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/industries/${topic.slug}`} className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid={`link-industry-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/interests" className="text-base font-bold text-foreground mb-5 mt-8 tracking-wide uppercase block hover:text-foreground/80 transition-colors" data-testid="link-interests">Topics</Link>
            <ul className="space-y-3.5">
              {topInterests.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/interests/${topic.slug}`} className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid={`link-interest-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/roles" className="text-base font-bold text-foreground mb-5 mt-8 tracking-wide uppercase block hover:text-foreground/80 transition-colors" data-testid="link-roles">Roles</Link>
            <ul className="space-y-3.5">
              {topRoles.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/roles/${topic.slug}`} className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid={`link-role-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-base font-bold text-foreground mb-5 tracking-wide uppercase">Company</h3>
            <ul className="space-y-3.5">
              <li>
                <Link href="/about" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-about">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/updates" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-updates">
                  What's New
                </Link>
              </li>
              <li>
                <Link href="/we-heart-podcasters" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-we-heart-podcasters">
                  For Podcasters
                </Link>
              </li>
              <li>
                <Link href="/enterprise" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-enterprise">
                  Enterprise
                </Link>
              </li>
              <li>
                <Link href="/daily-drop" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-signal">
                  Signal
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-base font-bold text-foreground mb-5 tracking-wide uppercase">Support</h3>
            <ul className="space-y-3.5">
              <li>
                <Link href="/get-started" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-get-started">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-login">
                  Log In
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-support">
                  Help & Support
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-contact">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-base font-bold text-foreground mb-5 tracking-wide uppercase">Legal</h3>
            <ul className="space-y-3.5">
              <li>
                <Link href="/privacy" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid="link-terms">
                  Terms & Conditions
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full flex items-center gap-6 mb-6">
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
            <a
              href="https://x.com/podcap_io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors p-2"
              data-testid="link-social-x"
              aria-label="Follow PodCap on X"
            >
              <SiX className="w-[22px] h-[22px]" />
            </a>
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>

          <PodCapWordmark />
          <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-3">
            &copy; {new Date().getFullYear()} PodCap, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
